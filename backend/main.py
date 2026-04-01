"""CG Automation -- FastAPI backend for Craigslist ad campaign posting optimiser."""

from __future__ import annotations

import io
import json
import logging
import math
import os
import uuid
from collections import OrderedDict
from typing import Any

import numpy as np

import anthropic
import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from pydantic import BaseModel

import engine

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("cg-automation")

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_STORED_JOBS: int = 50

# Excel styling colours
CLR_HEADER_BG = "0F2037"
CLR_SUBHEADER = "2E74B5"
CLR_POS_NR = "1E8449"
CLR_NEG_NR = "C0392B"
CLR_TIER1_BG = "D5F5E3"
CLR_TIER2_BG = "D6EAF8"
CLR_TIER3_BG = "FDEBD0"
CLR_TIER4_BG = "EAECEE"
CLR_LOC_MULT = "D6EAF8"
CLR_CAT_MULT = "FEF9E7"

TIER_BG_MAP: dict[int, str] = {
    1: CLR_TIER1_BG,
    2: CLR_TIER2_BG,
    3: CLR_TIER3_BG,
    4: CLR_TIER4_BG,
}

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(title="CG Automation API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-memory job store (LRU, max 50)
# ---------------------------------------------------------------------------


class LRUDict(OrderedDict):
    """OrderedDict that evicts oldest entries when max_size is exceeded."""

    def __init__(self, max_size: int = MAX_STORED_JOBS) -> None:
        super().__init__()
        self.max_size = max_size

    def __setitem__(self, key: str, value: Any) -> None:
        if key in self:
            self.move_to_end(key)
        super().__setitem__(key, value)
        while len(self) > self.max_size:
            self.popitem(last=False)


job_store: LRUDict = LRUDict()

# ---------------------------------------------------------------------------
# Anthropic client
# ---------------------------------------------------------------------------
ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY") or ""


def _get_anthropic_client() -> anthropic.Anthropic:
    """Return an Anthropic client; raises if key is missing."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(
            status_code=500, detail="ANTHROPIC_API_KEY not configured"
        )
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class InsightRequest(BaseModel):
    """Payload for the /api/insights endpoint."""

    location: str
    recommended_title: str
    title_avg_nr: float
    recommended_category: str
    cat_avg_nr: float
    best_day: str
    best_day_nr: float
    today_day: str
    profit_pct: float
    tier: int
    impr_drop_pct: float
    trigger_reason: str
    est_lifetime_nr: float
    multiplier: float
    mult_source: str
    mult_runs: int
    optimal_posts_per_week: int


# ===================================================================
# EXCEL GENERATION -- 9 sheets (Section 19)
# ===================================================================


def _style_header(ws: Any, col_count: int) -> None:
    """Apply dark navy header styling to row 1."""
    header_fill = PatternFill(
        start_color=CLR_HEADER_BG, end_color=CLR_HEADER_BG, fill_type="solid"
    )
    header_font = Font(bold=True, color="FFFFFF", size=11)
    for col_idx in range(1, col_count + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(
            horizontal="center", vertical="center", wrap_text=True
        )


def _apply_tier_row_color(
    ws: Any, row_idx: int, tier: int, col_count: int
) -> None:
    """Apply tier-specific background colour to a row."""
    bg = TIER_BG_MAP.get(tier)
    if bg:
        fill = PatternFill(start_color=bg, end_color=bg, fill_type="solid")
        for c in range(1, col_count + 1):
            ws.cell(row=row_idx, column=c).fill = fill


def _apply_nr_font(cell: Any, value: float | None) -> None:
    """Colour NR values green (positive) or red (negative)."""
    if value is None:
        return
    if value > 0:
        cell.font = Font(color=CLR_POS_NR)
    elif value < 0:
        cell.font = Font(color=CLR_NEG_NR)


def _set_column_widths(ws: Any, widths: list[int]) -> None:
    """Set column widths."""
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def _write_sheet_from_records(
    wb: Workbook,
    sheet_name: str,
    headers: list[str],
    records: list[dict],
    key_map: list[str],
    col_widths: list[int] | None = None,
    nr_columns: list[int] | None = None,
    tier_column: int | None = None,
    pct_columns: list[int] | None = None,
    money_columns: list[int] | None = None,
) -> None:
    """Write a sheet from a list of dicts with styling.

    Args:
        wb: Target workbook.
        sheet_name: Tab name.
        headers: Column header labels.
        records: List of dicts to write.
        key_map: Dict keys matching each header column.
        col_widths: Optional per-column widths.
        nr_columns: 1-based column indices to format as NR ($).
        tier_column: 1-based column index containing tier for row colouring.
        pct_columns: 1-based column indices to format as percentages.
        money_columns: 1-based column indices to format as currency.
    """
    ws = wb.create_sheet(title=sheet_name)
    ws.sheet_view.showGridLines = False
    ws.freeze_panes = "A2"

    # Headers
    for ci, h in enumerate(headers, 1):
        ws.cell(row=1, column=ci, value=h)
    _style_header(ws, len(headers))

    # Data rows
    for ri, rec in enumerate(records, 2):
        for ci, key in enumerate(key_map, 1):
            val = rec.get(key)
            cell = ws.cell(row=ri, column=ci, value=val)

            if money_columns and ci in money_columns and isinstance(val, (int, float)):
                cell.number_format = "$#,##0.00"
                _apply_nr_font(cell, val)
            elif pct_columns and ci in pct_columns and isinstance(val, (int, float)):
                cell.number_format = "0.0%"
                cell.value = val / 100.0 if val is not None else None
            elif nr_columns and ci in nr_columns and isinstance(val, (int, float)):
                cell.number_format = "$#,##0.00"
                _apply_nr_font(cell, val)

        # Tier row colouring
        if tier_column is not None:
            tier_val = rec.get(key_map[tier_column - 1])
            if isinstance(tier_val, (int, float)) and tier_val in TIER_BG_MAP:
                _apply_tier_row_color(ws, ri, int(tier_val), len(headers))

    if col_widths:
        _set_column_widths(ws, col_widths)


def _build_conflict_counts(result: dict[str, Any]) -> dict[str, int]:
    """Count location conflicts for the daily action plan sheet."""
    counts: dict[str, int] = {}
    for c in result.get("location_conflicts", []):
        loc = c.get("Location", c.get("location", ""))
        lk = str(loc).strip().lower()
        counts[lk] = counts.get(lk, 0) + 1
    return counts


def generate_excel(result: dict[str, Any]) -> io.BytesIO:
    """Generate the full 9-sheet styled Excel workbook.

    Args:
        result: The full analysis result dict from engine.run_analysis().

    Returns:
        BytesIO buffer containing the .xlsx file.
    """
    wb = Workbook()
    wb.remove(wb.active)

    conflict_counts = _build_conflict_counts(result)

    # ---- Sheet 1: Daily Action Plan ----
    dap_headers = [
        "#", "Location", "Best Title", "Best Category", "Best Day",
        "Today Good?", "Tier", "Trigger", "Est D1 NR", "Est Lifetime NR",
        "Posts/Week", "Multiplier", "Mult Source", "Competing Filtered",
        "Last Run Date",
    ]
    ws1 = wb.create_sheet(title="Daily Action Plan")
    ws1.sheet_view.showGridLines = False
    ws1.freeze_panes = "A2"
    for ci, h in enumerate(dap_headers, 1):
        ws1.cell(row=1, column=ci, value=h)
    _style_header(ws1, len(dap_headers))

    dap = result.get("daily_action_plan", [])
    for ri, rec in enumerate(dap, 2):
        num = ri - 1
        loc = rec.get("location", rec.get("Location", ""))
        ws1.cell(row=ri, column=1, value=num)
        ws1.cell(row=ri, column=2, value=loc)
        ws1.cell(row=ri, column=3, value=rec.get("recommended_title", rec.get("Best_Title", "")))
        ws1.cell(row=ri, column=4, value=rec.get("recommended_category", rec.get("Best_Category", "")))
        ws1.cell(row=ri, column=5, value=rec.get("best_day", rec.get("Best_Day", "")))
        ws1.cell(row=ri, column=6, value=rec.get("today_good", rec.get("Today_Good", "")))
        tier = rec.get("tier", rec.get("Tier", 0))
        ws1.cell(row=ri, column=7, value=tier)
        ws1.cell(row=ri, column=8, value=rec.get("trigger_reason", rec.get("Trigger_Reason", "")))

        d1_nr = rec.get("d1_nr", rec.get("D1_NR", rec.get("Est_D1_NR", 0)))
        d1_cell = ws1.cell(row=ri, column=9, value=d1_nr)
        d1_cell.number_format = "$#,##0.00"
        _apply_nr_font(d1_cell, d1_nr)

        life_nr = rec.get("est_lifetime_nr", rec.get("Est_Lifetime_NR", 0))
        life_cell = ws1.cell(row=ri, column=10, value=life_nr)
        life_cell.number_format = "$#,##0.00"
        _apply_nr_font(life_cell, life_nr)

        ws1.cell(row=ri, column=11, value=rec.get("optimal_posts_per_week", rec.get("Optimal_Posts_Per_Week", 1)))
        ws1.cell(row=ri, column=12, value=rec.get("multiplier", rec.get("Multiplier_Used", "")))
        ws1.cell(row=ri, column=13, value=rec.get("mult_source", rec.get("Mult_Source", "")))

        lk = str(loc).strip().lower()
        ws1.cell(row=ri, column=14, value=conflict_counts.get(lk, 0))
        ws1.cell(row=ri, column=15, value=rec.get("last_run_date", rec.get("D1_Date", "")))

        if isinstance(tier, (int, float)) and int(tier) in TIER_BG_MAP:
            _apply_tier_row_color(ws1, ri, int(tier), len(dap_headers))

    _set_column_widths(ws1, [5, 20, 35, 18, 12, 12, 6, 40, 12, 14, 10, 10, 14, 12, 12])

    # ---- Sheet 2: All Repost Candidates ----
    rp_headers = [
        "#", "Location", "Title", "Category", "Tier", "Cost", "Profit %",
        "Trigger", "D1 Applies", "D1 NR", "Lifetime NR", "Multiplier",
        "Mult Source", "Best Day", "Today Good?", "Posts/Week",
    ]
    ws2 = wb.create_sheet(title="All Repost Candidates")
    ws2.sheet_view.showGridLines = False
    ws2.freeze_panes = "A2"
    for ci, h in enumerate(rp_headers, 1):
        ws2.cell(row=1, column=ci, value=h)
    _style_header(ws2, len(rp_headers))

    for ri, rec in enumerate(result.get("all_repost", []), 2):
        ws2.cell(row=ri, column=1, value=ri - 1)
        ws2.cell(row=ri, column=2, value=rec.get("Location", ""))
        ws2.cell(row=ri, column=3, value=rec.get("Title", ""))
        ws2.cell(row=ri, column=4, value=rec.get("Category", ""))
        tier = rec.get("Tier", 0)
        ws2.cell(row=ri, column=5, value=tier)

        cost = rec.get("D1_Cost", 0)
        cost_cell = ws2.cell(row=ri, column=6, value=cost)
        cost_cell.number_format = "$#,##0.00"

        pct = rec.get("Profit_Pct")
        pct_cell = ws2.cell(row=ri, column=7, value=(pct / 100.0 if pct is not None else None))
        pct_cell.number_format = "0.0%"

        ws2.cell(row=ri, column=8, value=rec.get("Trigger_Reason", ""))
        ws2.cell(row=ri, column=9, value=rec.get("D1_Applies", 0))

        d1nr = rec.get("D1_NR", 0)
        d1nr_cell = ws2.cell(row=ri, column=10, value=d1nr)
        d1nr_cell.number_format = "$#,##0.00"
        _apply_nr_font(d1nr_cell, d1nr)

        life_nr = rec.get("Est_Lifetime_NR", 0)
        life_cell = ws2.cell(row=ri, column=11, value=life_nr)
        life_cell.number_format = "$#,##0.00"
        _apply_nr_font(life_cell, life_nr)

        ws2.cell(row=ri, column=12, value=rec.get("Multiplier_Used", ""))
        ws2.cell(row=ri, column=13, value=rec.get("Mult_Source", ""))
        ws2.cell(row=ri, column=14, value=rec.get("Best_Day", ""))
        ws2.cell(row=ri, column=15, value=rec.get("Today_Good", ""))
        ws2.cell(row=ri, column=16, value=rec.get("Optimal_Posts_Per_Week", 1))

        if isinstance(tier, (int, float)) and int(tier) in TIER_BG_MAP:
            _apply_tier_row_color(ws2, ri, int(tier), len(rp_headers))

    _set_column_widths(ws2, [5, 20, 35, 18, 6, 10, 10, 40, 10, 12, 14, 10, 14, 12, 12, 10])

    # ---- Sheet 3: Best Per Location ----
    _write_sheet_from_records(
        wb,
        "Best Per Location",
        headers=["#", "Location", "Best Title", "Best Category", "Tier",
                 "Est Lifetime NR", "Best Day", "Posts/Week"],
        records=[
            {**r, "_num": i}
            for i, r in enumerate(result.get("best_per_location", []), 1)
        ],
        key_map=["_num", "Location", "Title", "Category", "Tier",
                 "Est_Lifetime_NR", "DayOfWeek_Posted", "Run_Length"],
        col_widths=[5, 20, 35, 18, 6, 14, 12, 10],
        nr_columns=[6],
        tier_column=5,
    )

    # ---- Sheet 4: Location Conflicts ----
    _write_sheet_from_records(
        wb,
        "Location Conflicts",
        headers=["Location", "Title", "Category", "Tier", "Est Lifetime NR",
                 "Lost To", "NR Gap"],
        records=result.get("location_conflicts", []),
        key_map=["Location", "Title", "Category", "Tier", "Est_Lifetime_NR",
                 "lost_to", "nr_gap"],
        col_widths=[20, 35, 18, 6, 14, 40, 10],
        nr_columns=[5, 7],
        tier_column=4,
    )

    # ---- Sheet 5: Keep Running ----
    _write_sheet_from_records(
        wb,
        "Keep Running",
        headers=["Location", "Title", "Category", "Total NR", "Profit %",
                 "Trigger"],
        records=result.get("keep_running", []),
        key_map=["Location", "Title", "Category", "Total_NR", "Profit_Pct",
                 "Trigger_Reason"],
        col_widths=[20, 35, 18, 12, 10, 40],
        nr_columns=[4],
        pct_columns=[5],
    )

    # ---- Sheet 6: Skip ----
    _write_sheet_from_records(
        wb,
        "Skip",
        headers=["Location", "Title", "Category", "Total NR", "Profit %",
                 "Skip Reason"],
        records=result.get("skip", []),
        key_map=["Location", "Title", "Category", "Total_NR", "Profit_Pct",
                 "Trigger_Reason"],
        col_widths=[20, 35, 18, 12, 10, 50],
        nr_columns=[4],
        pct_columns=[5],
    )

    # ---- Sheet 7: Location Intelligence ----
    loc_intel = result.get("location_intelligence", {})
    ws7 = wb.create_sheet(title="Location Intelligence")
    ws7.sheet_view.showGridLines = False
    ws7.freeze_panes = "A2"
    li_headers = [
        "Location", "Best Title", "Title Avg NR", "Best Category",
        "Cat Avg NR", "Best Day", "Day Avg NR", "Best Combo",
        "Combo Avg NR", "Multiplier", "Mult Source",
    ]
    for ci, h in enumerate(li_headers, 1):
        ws7.cell(row=1, column=ci, value=h)
    _style_header(ws7, len(li_headers))

    for ri, (_, info) in enumerate(sorted(loc_intel.items()), 2):
        ws7.cell(row=ri, column=1, value=info.get("Location", ""))
        ws7.cell(row=ri, column=2, value=info.get("best_title", ""))

        title_nr = info.get("best_title_avg_nr", info.get("title_avg_nr", 0))
        c3 = ws7.cell(row=ri, column=3, value=title_nr)
        c3.number_format = "$#,##0.00"
        _apply_nr_font(c3, title_nr)

        ws7.cell(row=ri, column=4, value=info.get("best_category", ""))

        cat_nr = info.get("best_category_avg_nr", info.get("cat_avg_nr", 0))
        c5 = ws7.cell(row=ri, column=5, value=cat_nr)
        c5.number_format = "$#,##0.00"
        _apply_nr_font(c5, cat_nr)

        ws7.cell(row=ri, column=6, value=info.get("best_day", ""))

        day_nr = info.get("best_day_avg_nr", info.get("day_avg_nr", 0))
        c7 = ws7.cell(row=ri, column=7, value=day_nr)
        c7.number_format = "$#,##0.00"
        _apply_nr_font(c7, day_nr)

        ws7.cell(row=ri, column=8, value=info.get("best_combo", ""))

        combo_nr = info.get("best_combo_avg_nr", info.get("combo_avg_nr", 0))
        c9 = ws7.cell(row=ri, column=9, value=combo_nr)
        c9.number_format = "$#,##0.00"
        _apply_nr_font(c9, combo_nr)

        ws7.cell(row=ri, column=10, value=info.get("multiplier", ""))

        mult_src = info.get("mult_source", "")
        c11 = ws7.cell(row=ri, column=11, value=mult_src)
        if mult_src == "Location Avg":
            c11.fill = PatternFill(
                start_color=CLR_LOC_MULT, end_color=CLR_LOC_MULT, fill_type="solid"
            )
        elif mult_src == "Category Avg":
            c11.fill = PatternFill(
                start_color=CLR_CAT_MULT, end_color=CLR_CAT_MULT, fill_type="solid"
            )

    _set_column_widths(ws7, [20, 35, 12, 18, 12, 12, 12, 40, 12, 10, 14])

    # ---- Sheet 8: Frequency Optimisation ----
    _write_sheet_from_records(
        wb,
        "Frequency Optimisation",
        headers=["Combo", "Optimal/Week", "Expected Weekly NR", "NR at 1x",
                 "Extra NR", "Max Observed", "NR Curve"],
        records=result.get("frequency_optimization", []),
        key_map=["combo", "optimal_posts_per_week", "expected_weekly_nr",
                 "nr_at_1x", "extra_nr_vs_1x", "max_observed_posts_wk",
                 "nr_curve"],
        col_widths=[50, 12, 16, 12, 12, 14, 50],
        nr_columns=[3, 4, 5],
    )

    # ---- Sheet 9: All Runs ----
    ar_headers = [
        "Post ID", "Location", "Title", "Category", "D1 Date", "Last Date",
        "Day Posted", "Run Length", "D1 Cost", "D1 Applies", "D1 NR",
        "Total Applies", "Total NR", "Profit %", "Impr Drop %",
        "Est Lifetime NR", "Multiplier", "Mult Source", "Decision", "Trigger",
    ]
    ar_keys = [
        "Post ID", "Location", "Title", "Category", "D1_Date", "Last_Date",
        "DayOfWeek_Posted", "Run_Length", "D1_Cost", "D1_Applies", "D1_NR",
        "Total_Applies", "Total_NR", "Profit_Pct", "Impr_Drop_Pct",
        "Est_Lifetime_NR", "Multiplier_Used", "Mult_Source", "Decision",
        "Trigger_Reason",
    ]
    _write_sheet_from_records(
        wb,
        "All Runs",
        headers=ar_headers,
        records=result.get("all_runs", []),
        key_map=ar_keys,
        col_widths=[
            12, 20, 35, 18, 12, 12, 12, 10, 10, 10, 12, 10, 12, 10, 10,
            14, 10, 14, 12, 40,
        ],
        nr_columns=[11, 13, 16],
        money_columns=[9],
        pct_columns=[14, 15],
    )

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ===================================================================
# JSON SANITIZATION (numpy/pandas types -> native Python)
# ===================================================================


def _sanitize_for_json(obj: Any) -> Any:
    """Recursively convert numpy/pandas types to native Python for JSON."""
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        val = float(obj)
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    if hasattr(obj, 'isoformat'):
        return obj.isoformat()
    return obj


# ===================================================================
# API ENDPOINTS
# ===================================================================


@app.get("/api/health")
async def health() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/analyse")
async def api_analyse(file: UploadFile = File(...)) -> dict[str, Any]:
    """Upload an Excel file and run the full CG Automation analysis.

    Reads the Excel with pandas, delegates to engine.run_analysis(df),
    stores the result in memory keyed by a uuid4 job_id, and returns
    the full JSON response.

    Args:
        file: Uploaded Excel file (multipart/form-data).

    Returns:
        Full JSON analysis with scorecard, daily action plan, and all views.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")

    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
    except Exception as exc:
        logger.error("Failed to read uploaded Excel file", exc_info=True)
        raise HTTPException(
            status_code=400, detail=f"Failed to read Excel file: {exc}"
        ) from exc

    try:
        result = engine.run_analysis(df)
    except ValueError as exc:
        logger.error("Validation error during analysis", exc_info=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Analysis failed", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Analysis error: {exc}"
        ) from exc

    # Convert numpy types to native Python for JSON serialization
    result = _sanitize_for_json(result)

    job_id = str(uuid.uuid4())
    result["job_id"] = job_id
    job_store[job_id] = result

    return result


@app.post("/api/insights")
async def api_insights(req: InsightRequest) -> dict[str, str]:
    """Generate an AI insight for a single repost candidate using Claude.

    Calls Claude claude-sonnet-4-20250514 with all per-location context fields to
    produce a concise, actionable recommendation.

    Args:
        req: InsightRequest with all per-location context fields.

    Returns:
        Dict with a single 'insight' key containing Claude's response.
    """
    user_prompt = (
        f"Location: {req.location}\n"
        f"Recommended Title: {req.recommended_title} (avg NR: ${req.title_avg_nr:.2f})\n"
        f"Recommended Category: {req.recommended_category} (avg NR: ${req.cat_avg_nr:.2f})\n"
        f"Best Day to Post here: {req.best_day} (avg NR: ${req.best_day_nr:.2f})\n"
        f"Today is: {req.today_day}\n"
        f"Historical Profit: {req.profit_pct:.1f}%\n"
        f"Tier: {req.tier}\n"
        f"Impression Drop: {req.impr_drop_pct:.1f}%\n"
        f"Repost Trigger: {req.trigger_reason}\n"
        f"Est Lifetime NR: ${req.est_lifetime_nr:.2f}\n"
        f"Location Multiplier: {req.multiplier:.2f}x ({req.mult_source}, {req.mult_runs} runs)\n"
        f"Optimal Posts This Week: {req.optimal_posts_per_week}x\n"
        f"In 2 sentences: why repost now and one specific action tip."
    )

    system_prompt = (
        "You are a Craigslist ad campaign analyst. You give specific, actionable "
        "advice based on data. Be concise. Always end with one concrete action "
        "the operator can take today."
    )

    try:
        client = _get_anthropic_client()
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=150,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        insight_text = message.content[0].text if message.content else ""
    except HTTPException:
        raise
    except anthropic.APIError as exc:
        logger.error("Anthropic API error", exc_info=True)
        raise HTTPException(
            status_code=502, detail=f"AI service error: {exc}"
        ) from exc
    except Exception as exc:
        logger.error("Unexpected error calling Claude", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Insight generation failed: {exc}"
        ) from exc

    return {"insight": insight_text}


@app.get("/api/download/{job_id}")
async def api_download(job_id: str) -> StreamingResponse:
    """Download the styled Excel report for a completed analysis job.

    Retrieves the stored analysis result by job_id, generates a
    9-sheet styled Excel workbook, and returns it as a file download.

    Args:
        job_id: UUID of the analysis job.

    Returns:
        Streaming Excel file download with Content-Disposition header.
    """
    result = job_store.get(job_id)
    if result is None:
        raise HTTPException(
            status_code=404, detail=f"Job {job_id} not found or expired"
        )

    try:
        buf = generate_excel(result)
    except Exception as exc:
        logger.error("Excel generation failed", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Excel generation error: {exc}"
        ) from exc

    filename = f"CG_Automation_Report_{job_id[:8]}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
