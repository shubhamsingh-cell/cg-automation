"""
CG Automation -- Core Data Engine

All business logic for Craigslist ad campaign posting optimization.
Takes raw Excel data with cumulative metrics, converts to daily,
classifies posts, and produces a ranked daily action plan.
"""

import logging
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Lazy import to avoid circular dependency
_llm_router = None

def _get_llm_router():
    """Lazy-load llm_router to avoid circular imports."""
    global _llm_router
    if _llm_router is None:
        try:
            import llm_router as _lr
            _llm_router = _lr
        except ImportError:
            _llm_router = False
    return _llm_router if _llm_router else None

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEFAULT_SELL_CPA: float = 1.20
# Active CPA for the current analysis run (set by run_analysis, used by helpers)
SELL_CPA: float = DEFAULT_SELL_CPA
GLOBAL_AVG_MULTIPLIER: float = 3.60

# ---------------------------------------------------------------------------
# Salary benchmarks by CL category (BLS OES + CG internal data)
# Used when employer salary is not available. Including salary as the first
# line of a CL post yields 3.8x more applications (Indeed 2025).
# ---------------------------------------------------------------------------
CL_SALARY_BENCHMARKS: dict[str, dict[str, Any]] = {
    "admin/office": {"hourly_low": 16, "hourly_high": 28, "display": "$16-$28/hr"},
    "computer gigs": {"hourly_low": 25, "hourly_high": 55, "display": "$25-$55/hr"},
    "creative gigs": {"hourly_low": 18, "hourly_high": 40, "display": "$18-$40/hr"},
    "crew gigs": {"hourly_low": 15, "hourly_high": 25, "display": "$15-$25/hr"},
    "domestic gigs": {"hourly_low": 15, "hourly_high": 25, "display": "$15-$25/hr"},
    "event gigs": {"hourly_low": 16, "hourly_high": 30, "display": "$16-$30/hr"},
    "labor gigs": {"hourly_low": 16, "hourly_high": 30, "display": "$16-$30/hr"},
    "talent gigs": {"hourly_low": 18, "hourly_high": 45, "display": "$18-$45/hr"},
}

# Optimal word count range for CL descriptions (Appcast 302M click dataset)
CL_OPTIMAL_WORD_COUNT: tuple[int, int] = (201, 400)

REQUIRED_COLUMNS: list[str] = [
    "Date",
    "Post ID",
    "Title",
    "Location",
    "Category",
    "Template Type",
    "Media Cost ($)",
    "Impressions (Cumul)",
    "Clicks (Cumul)",
    "Applies (Cumul)",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _safe_div(numerator: float, denominator: float, default: float = 0.0) -> float:
    """Divide safely, returning *default* when denominator is zero or NaN."""
    if denominator is None or denominator == 0 or (isinstance(denominator, float) and np.isnan(denominator)):
        return default
    return numerator / denominator


def _safe_pct(numerator: float, denominator: float) -> float:
    """Return (numerator / denominator) * 100, or NaN when denominator is 0."""
    if denominator is None or denominator == 0 or (isinstance(denominator, float) and np.isnan(denominator)):
        return np.nan
    return (numerator / denominator) * 100.0


def _key(value: Any) -> str:
    """Normalise a string to a lowercase stripped key."""
    return str(value or "").strip().lower()


# ====================================================================
# STEP 1 -- Daily Conversion  (Spec Section 3)
# ====================================================================
def convert_cumulative_to_daily(df: pd.DataFrame) -> pd.DataFrame:
    """Convert cumulative Impressions/Clicks/Applies to daily deltas.

    - Sort by [Post ID, Date] ascending
    - Day 1: daily = raw cumulative (no diff)
    - Day 2+: daily = today - yesterday
    - Clip negatives to 0
    - Add derived date / key columns
    """
    logger.info("Step 1: Converting cumulative data to daily values")

    df = df.copy()

    # Ensure date column is datetime
    df["Date"] = pd.to_datetime(df["Date"])

    # Sort
    df.sort_values(["Post ID", "Date"], inplace=True)
    df.reset_index(drop=True, inplace=True)

    # Rename for internal use
    df.rename(
        columns={
            "Media Cost ($)": "Media_Cost",
            "Impressions (Cumul)": "Impressions_Cumul",
            "Clicks (Cumul)": "Clicks_Cumul",
            "Applies (Cumul)": "Applies_Cumul",
        },
        inplace=True,
    )

    # Fill NaN in numeric cols with 0
    for col in ["Media_Cost", "Impressions_Cumul", "Clicks_Cumul", "Applies_Cumul"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

    # Compute daily diffs within each Post ID group
    cumul_cols = ["Impressions_Cumul", "Clicks_Cumul", "Applies_Cumul"]
    daily_cols = ["Daily_Impressions", "Daily_Clicks", "Daily_Applies"]

    for cumul, daily in zip(cumul_cols, daily_cols):
        df[daily] = df.groupby("Post ID")[cumul].diff()

    # Day 1: fill NaN (first row of each group) with the raw cumulative value
    for cumul, daily in zip(cumul_cols, daily_cols):
        mask = df[daily].isna()
        df.loc[mask, daily] = df.loc[mask, cumul]

    # Clip negatives to 0
    for daily in daily_cols:
        df[daily] = df[daily].clip(lower=0)

    # Day_Num per post (1-based)
    df["Day_Num"] = df.groupby("Post ID").cumcount() + 1

    # Additional date fields
    df["DayOfWeek"] = df["Date"].dt.day_name()
    df["DayOfWeek_Num"] = df["Date"].dt.dayofweek  # 0=Monday
    df["Week"] = df["Date"].dt.isocalendar().week.astype(int)

    # Title normalization (Gemini 3.1 Flash Lite for messy CL titles)
    router = _get_llm_router()
    if router and hasattr(router, "batch_normalize_titles"):
        try:
            unique_titles = df["Title"].unique().tolist()
            title_map = router.batch_normalize_titles(unique_titles, max_batch=20)
            if title_map:
                df["Title_Normalized"] = df["Title"].map(title_map).fillna(df["Title"])
                normalized_count = sum(1 for k, v in title_map.items() if k != v)
                if normalized_count > 0:
                    logger.info(f"  Normalized {normalized_count}/{len(unique_titles)} titles via LLM")
            else:
                df["Title_Normalized"] = df["Title"]
        except Exception:
            logger.debug("Title normalization skipped", exc_info=True)
            df["Title_Normalized"] = df["Title"]
    else:
        df["Title_Normalized"] = df["Title"]

    # Normalised keys (use normalized title for better matching)
    df["Location_key"] = df["Location"].apply(_key)
    df["Category_key"] = df["Category"].apply(_key)
    df["Title_key"] = df["Title_Normalized"].apply(_key)
    df["Combo"] = df["Location_key"] + "|" + df["Title_key"] + "|" + df["Category_key"]

    # Daily financials
    df["Daily_GR"] = df["Daily_Applies"] * SELL_CPA
    df["Daily_NR"] = df["Daily_GR"] - df["Media_Cost"]

    logger.info(f"  Converted {len(df)} rows across {df['Post ID'].nunique()} posts")
    return df


# ====================================================================
# STEP 2 -- Summarise Each Post Run  (Spec Section 5)
# ====================================================================
def summarise_post_runs(daily: pd.DataFrame) -> pd.DataFrame:
    """Aggregate daily data into one row per Post ID run."""
    logger.info("Step 2: Summarising post runs")

    def _agg(g: pd.DataFrame) -> pd.Series:
        d1 = g.iloc[0]
        last = g.iloc[-1]
        post_id = g.name  # groupby key = Post ID

        # S37 fix: CL charges once per post. Use day-1 cost, not sum across
        # all daily rows (which inflated spend by Nx when Media_Cost repeats).
        d1_cost = d1["Media_Cost"]
        d1_impressions = d1["Daily_Impressions"]
        d1_clicks = d1["Daily_Clicks"]
        d1_applies = d1["Daily_Applies"]
        last_impressions = last["Daily_Impressions"]

        impr_drop_pct = _safe_pct(d1_impressions - last_impressions, d1_impressions)
        if np.isnan(impr_drop_pct):
            impr_drop_pct = 0.0

        total_applies = g["Daily_Applies"].sum()
        total_gr = total_applies * SELL_CPA
        total_nr = total_gr - d1_cost
        profit_pct = _safe_pct(total_nr, d1_cost)

        d1_gr = d1_applies * SELL_CPA
        d1_nr = d1_gr - d1_cost

        return pd.Series(
            {
                "Post ID": post_id,
                "Title": d1["Title"],
                "Location": d1["Location"],
                "Category": d1["Category"],
                "Template Type": d1.get("Template Type", ""),
                "Title_key": d1["Title_key"],
                "Location_key": d1["Location_key"],
                "Category_key": d1["Category_key"],
                "Combo": d1["Combo"],
                "D1_Date": d1["Date"],
                "Last_Date": last["Date"],
                "DayOfWeek_Posted": d1["DayOfWeek"],
                "DayOfWeek_Num": d1["DayOfWeek_Num"],
                "Run_Length": len(g),
                "D1_Cost": d1_cost,
                "D1_Impressions": d1_impressions,
                "D1_Clicks": d1_clicks,
                "D1_Applies": d1_applies,
                "Last_Impressions": last_impressions,
                "Impr_Drop_Pct": impr_drop_pct,
                "Total_Applies": total_applies,
                "Total_GR": total_gr,
                "Total_NR": total_nr,
                "Profit_Pct": profit_pct,
                "D1_GR": d1_gr,
                "D1_NR": d1_nr,
            }
        )

    try:
        runs = daily.groupby("Post ID", sort=False).apply(_agg, include_groups=False).reset_index(drop=True)
    except TypeError:
        # Older pandas without include_groups parameter
        runs = daily.groupby("Post ID", sort=False).apply(_agg).reset_index(drop=True)
    logger.info(f"  Produced {len(runs)} run summaries")
    return runs


# ====================================================================
# STEP 3 -- Location-Specific Lifetime Multiplier  (Spec Section 6)
# ====================================================================
def compute_location_multipliers(runs: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Compute per-location lifetime multipliers with fallback hierarchy.

    Returns (runs_with_multiplier, multiplier_table).
    """
    logger.info("Step 3: Computing location-specific lifetime multipliers")

    # Only paid runs with D1_Applies > 0 contribute
    paid = runs[(runs["D1_Cost"] > 0) & (runs["D1_Applies"] > 0)].copy()
    paid["Run_Multiplier"] = paid["Total_Applies"] / paid["D1_Applies"]

    # Per-location multiplier
    loc_mult = (
        paid.groupby("Location_key")["Run_Multiplier"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "Loc_Multiplier", "count": "Loc_Runs"})
        .reset_index()
    )

    # Per-category multiplier (fallback)
    cat_mult = (
        paid.groupby("Category_key")["Run_Multiplier"]
        .agg(["mean", "count"])
        .rename(columns={"mean": "Cat_Multiplier", "count": "Cat_Runs"})
        .reset_index()
    )

    # Merge onto runs
    runs = runs.merge(loc_mult, on="Location_key", how="left")
    runs = runs.merge(cat_mult, on="Category_key", how="left")

    # Apply fallback hierarchy
    def _pick_mult(row: pd.Series) -> tuple[float, str, int]:
        if pd.notna(row.get("Loc_Multiplier")) and row["Loc_Runs"] > 0:
            return round(row["Loc_Multiplier"], 2), "Location Avg", int(row["Loc_Runs"])
        if pd.notna(row.get("Cat_Multiplier")) and row["Cat_Runs"] > 0:
            return round(row["Cat_Multiplier"], 2), "Category Avg", int(row["Cat_Runs"])
        return GLOBAL_AVG_MULTIPLIER, "Global Avg", 0

    mult_data = runs.apply(_pick_mult, axis=1, result_type="expand")
    mult_data.columns = ["Multiplier_Used", "Mult_Source", "Mult_Runs_Used"]
    runs = pd.concat([runs, mult_data], axis=1)

    # Lifetime estimates
    runs["Est_Lifetime_Applies"] = runs["D1_Applies"] * runs["Multiplier_Used"]
    runs["Est_Lifetime_GR"] = runs["Est_Lifetime_Applies"] * SELL_CPA
    runs["Est_Lifetime_NR"] = runs["Est_Lifetime_GR"] - runs["D1_Cost"]

    # Clean up temp merge columns
    runs.drop(columns=["Loc_Multiplier", "Loc_Runs", "Cat_Multiplier", "Cat_Runs"], inplace=True, errors="ignore")

    # Build multiplier summary table
    mult_table = _build_multiplier_table(runs)

    logger.info(f"  Location-specific multipliers: {loc_mult.shape[0]} locations, "
                f"category fallbacks: {cat_mult.shape[0]} categories")
    return runs, mult_table


def _build_multiplier_table(runs: pd.DataFrame) -> pd.DataFrame:
    """Build a summary table of multipliers per location."""
    table = (
        runs.groupby("Location_key")
        .agg(
            Location=("Location", "first"),
            Multiplier_Used=("Multiplier_Used", "first"),
            Mult_Source=("Mult_Source", "first"),
            Mult_Runs_Used=("Mult_Runs_Used", "first"),
            Total_Runs=("Post ID", "nunique"),
            Avg_Run_Length=("Run_Length", "mean"),
        )
        .reset_index()
    )
    table["Avg_Run_Length"] = table["Avg_Run_Length"].round(1)
    return table


# ====================================================================
# STEP 4 -- Repost / Keep / Skip Classification  (Spec Section 8)
# ====================================================================
def classify_decisions(runs: pd.DataFrame) -> pd.DataFrame:
    """Apply the full decision tree in exact spec order (A-I)."""
    logger.info("Step 4: Classifying decisions (REPOST / KEEP / SKIP)")

    decisions = []
    reasons = []

    for _, row in runs.iterrows():
        d1_cost = row["D1_Cost"]
        profit_pct = row["Profit_Pct"]
        impr_drop = row["Impr_Drop_Pct"]
        est_lifetime_nr = row["Est_Lifetime_NR"]

        # A. Free post
        if d1_cost == 0:
            decisions.append("SKIP")
            reasons.append("Skip -- Free post, no cost baseline")
            continue

        # B. No profit data
        if pd.isna(profit_pct):
            decisions.append("SKIP")
            reasons.append("Skip -- No paid history (Profit % undefined)")
            continue

        # C. Lifetime NR override
        if est_lifetime_nr <= 0:
            decisions.append("SKIP")
            reasons.append(f"Skip -- Lifetime NR would be ${est_lifetime_nr:.2f} (negative)")
            continue

        # D. Trigger 1: Negative profit
        if profit_pct < 0:
            decisions.append("REPOST")
            reasons.append(f"Repost T1 -- Negative profit ({profit_pct:.1f}%)")
            continue

        # E. Trigger 2: Impression collapse + profitable
        if impr_drop >= 90 and profit_pct >= 10:
            decisions.append("REPOST")
            reasons.append(f"Repost T2 -- Impression drop {impr_drop:.1f}%, profit {profit_pct:.1f}%")
            continue

        # F. Keep Running: profitable + healthy impressions
        if profit_pct >= 10 and impr_drop <= 80:
            decisions.append("KEEP RUNNING")
            reasons.append(f"Keep Running -- Profit {profit_pct:.1f}%, drop only {impr_drop:.1f}%")
            continue

        # G. Decay zone: profitable but decaying
        if profit_pct >= 10 and 80 < impr_drop < 90:
            decisions.append("REPOST")
            reasons.append(f"Repost -- Impression decay {impr_drop:.1f}%, still profitable")
            continue

        # H/I. Everything else
        if profit_pct >= 10:
            # Should have been caught above, but safety net
            decisions.append("REPOST")
            reasons.append(f"Repost T2 -- Impression drop {impr_drop:.1f}%, profit {profit_pct:.1f}%")
        else:
            decisions.append("SKIP")
            reasons.append(f"Skip -- Low profit ({profit_pct:.1f}%)")

    runs = runs.copy()
    runs["Decision"] = decisions
    runs["Trigger_Reason"] = reasons

    counts = runs["Decision"].value_counts().to_dict()
    logger.info(f"  Decisions: {counts}")
    return runs


# ====================================================================
# STEP 5 -- Profit Tiers  (Spec Section 9)
# ====================================================================
def assign_profit_tiers(runs: pd.DataFrame) -> pd.DataFrame:
    """Assign tiers 1-4 to REPOST candidates; sort by tier then NR."""
    logger.info("Step 5: Assigning profit tiers")

    runs = runs.copy()

    def _tier(row: pd.Series) -> int:
        if row["Decision"] != "REPOST":
            return 0  # non-repost gets no tier
        if row["D1_NR"] > 0:
            return 1
        if not np.isnan(row["Profit_Pct"]) and row["Profit_Pct"] >= 100:
            return 2
        if not np.isnan(row["Profit_Pct"]) and row["Profit_Pct"] >= 50:
            return 3
        if not np.isnan(row["Profit_Pct"]) and row["Profit_Pct"] >= 10:
            return 4
        return 4  # repost with profit < 10% edge case (trigger 1 negative profit)

    runs["Tier"] = runs.apply(_tier, axis=1)

    # Sort repost candidates: Tier ASC, Est_Lifetime_NR DESC
    repost_mask = runs["Decision"] == "REPOST"
    repost = runs[repost_mask].sort_values(["Tier", "Est_Lifetime_NR"], ascending=[True, False])
    non_repost = runs[~repost_mask]
    runs = pd.concat([repost, non_repost], ignore_index=True)

    tier_counts = runs[runs["Tier"] > 0]["Tier"].value_counts().sort_index().to_dict()
    logger.info(f"  Tier distribution: {tier_counts}")
    return runs


# ====================================================================
# STEP 6 -- Location Intelligence  (Spec Section 10)
# ====================================================================
def compute_location_intelligence(runs: pd.DataFrame) -> dict[str, Any]:
    """Compute per-location best title, category, combo, and day-of-week.

    Returns a dict keyed by location_key, each containing:
      best_title, best_category, best_combo, best_day, title_table,
      category_table, combo_table, day_table, summary_card
    """
    logger.info("Step 6: Computing location intelligence (per-location, never global)")

    paid = runs[runs["D1_Cost"] > 0].copy()
    intelligence: dict[str, Any] = {}

    for loc_key, loc_runs in paid.groupby("Location_key"):
        location_name = loc_runs["Location"].iloc[0]
        loc_info: dict[str, Any] = {"Location": location_name, "Location_key": loc_key}

        # 6.2 -- Best title per location
        title_stats = (
            loc_runs.groupby("Title_key")
            .agg(
                Title=("Title", "first"),
                Runs=("Post ID", "nunique"),
                Avg_D1_Applies=("D1_Applies", "mean"),
                Avg_Total_NR=("Total_NR", "mean"),
                Avg_Profit_Pct=("Profit_Pct", "mean"),
            )
            .reset_index()
            .sort_values("Avg_Total_NR", ascending=False)
        )
        title_stats["Limited_Data"] = title_stats["Runs"] < 3
        loc_info["title_table"] = title_stats.to_dict("records")

        best_title_row = title_stats.iloc[0] if len(title_stats) > 0 else None
        loc_info["best_title"] = best_title_row["Title"] if best_title_row is not None else None
        loc_info["best_title_avg_nr"] = round(best_title_row["Avg_Total_NR"], 2) if best_title_row is not None else 0.0

        # 6.3 -- Best category per location
        cat_stats = (
            loc_runs.groupby("Category_key")
            .agg(
                Category=("Category", "first"),
                Runs=("Post ID", "nunique"),
                Avg_D1_Applies=("D1_Applies", "mean"),
                Avg_Total_NR=("Total_NR", "mean"),
                Avg_Profit_Pct=("Profit_Pct", "mean"),
            )
            .reset_index()
            .sort_values("Avg_Total_NR", ascending=False)
        )
        cat_stats["Limited_Data"] = cat_stats["Runs"] < 3
        loc_info["category_table"] = cat_stats.to_dict("records")

        best_cat_row = cat_stats.iloc[0] if len(cat_stats) > 0 else None
        loc_info["best_category"] = best_cat_row["Category"] if best_cat_row is not None else None
        loc_info["best_category_avg_nr"] = round(best_cat_row["Avg_Total_NR"], 2) if best_cat_row is not None else 0.0

        # 6.4 -- Best title+category combo per location
        combo_stats = (
            loc_runs.groupby(["Title_key", "Category_key"])
            .agg(
                Title=("Title", "first"),
                Category=("Category", "first"),
                Runs=("Post ID", "nunique"),
                Avg_D1_Applies=("D1_Applies", "mean"),
                Avg_Total_NR=("Total_NR", "mean"),
                Avg_Profit_Pct=("Profit_Pct", "mean"),
            )
            .reset_index()
            .sort_values("Avg_Total_NR", ascending=False)
        )
        combo_stats["Limited_Data"] = combo_stats["Runs"] < 3
        loc_info["combo_table"] = combo_stats.head(5).to_dict("records")

        best_combo_row = combo_stats.iloc[0] if len(combo_stats) > 0 else None
        if best_combo_row is not None:
            loc_info["best_combo"] = f"{best_combo_row['Title']} | {best_combo_row['Category']}"
            loc_info["best_combo_avg_nr"] = round(best_combo_row["Avg_Total_NR"], 2)
        else:
            loc_info["best_combo"] = None
            loc_info["best_combo_avg_nr"] = 0.0

        # 6.5 -- Best day of week per location
        day_stats = (
            loc_runs.groupby("DayOfWeek_Posted")
            .agg(
                DayOfWeek_Num=("DayOfWeek_Num", "first"),
                Runs=("Post ID", "nunique"),
                Avg_D1_Applies=("D1_Applies", "mean"),
                Avg_D1_Impressions=("D1_Impressions", "mean"),
                Avg_Total_NR=("Total_NR", "mean"),
                Avg_Profit_Pct=("Profit_Pct", "mean"),
            )
            .reset_index()
            .sort_values("Avg_Total_NR", ascending=False)
        )
        day_stats["Limited_Data"] = day_stats["Runs"] < 3
        day_stats["Avoid"] = day_stats["Avg_Total_NR"] < 0
        loc_info["day_table"] = day_stats.to_dict("records")

        best_day_row = day_stats.iloc[0] if len(day_stats) > 0 else None
        loc_info["best_day"] = best_day_row["DayOfWeek_Posted"] if best_day_row is not None else None
        loc_info["best_day_avg_nr"] = round(best_day_row["Avg_Total_NR"], 2) if best_day_row is not None else 0.0

        # Worst day
        worst_day_row = day_stats.iloc[-1] if len(day_stats) > 0 else None
        loc_info["worst_day"] = worst_day_row["DayOfWeek_Posted"] if worst_day_row is not None else None
        loc_info["worst_day_avg_nr"] = round(worst_day_row["Avg_Total_NR"], 2) if worst_day_row is not None else 0.0

        intelligence[loc_key] = loc_info

    logger.info(f"  Built intelligence for {len(intelligence)} locations")
    return intelligence


# ====================================================================
# STEP 7 -- Frequency Optimisation  (Spec Section 14)
# ====================================================================
def compute_frequency_optimization(daily: pd.DataFrame, runs: pd.DataFrame) -> list[dict[str, Any]]:
    """Find optimal posts/week per combo that maximises total weekly NR.

    Groups by [Combo, ISO_Week], counts posts, sums NR, and finds
    the frequency that produces the highest average weekly NR.
    Also computes per-post NR at each frequency level.
    """
    logger.info("Step 7: Computing frequency optimisation")

    # Build per-run weekly data
    run_weekly = runs[runs["D1_Cost"] > 0].copy()
    run_weekly["ISO_Year"] = run_weekly["D1_Date"].dt.isocalendar().year.astype(int)
    run_weekly["ISO_Week"] = run_weekly["D1_Date"].dt.isocalendar().week.astype(int)
    run_weekly["Year_Week"] = run_weekly["ISO_Year"].astype(str) + "-W" + run_weekly["ISO_Week"].astype(str).str.zfill(2)

    # Build display name lookup: key -> display name
    loc_names: dict[str, str] = {}
    title_names: dict[str, str] = {}
    cat_names: dict[str, str] = {}
    for _, row in runs.iterrows():
        loc_names.setdefault(row["Location_key"], row["Location"])
        title_names.setdefault(row["Title_key"], row["Title"])
        cat_names.setdefault(row["Category_key"], row["Category"])

    # Group by Combo + Year_Week
    weekly = (
        run_weekly.groupby(["Combo", "Year_Week"])
        .agg(
            Posts_That_Week=("Post ID", "nunique"),
            Weekly_Total_NR=("Total_NR", "sum"),
        )
        .reset_index()
    )

    results = []
    for combo, combo_weekly in weekly.groupby("Combo"):
        # Average NR at each frequency level
        freq_curve = (
            combo_weekly.groupby("Posts_That_Week")["Weekly_Total_NR"]
            .mean()
            .sort_index()
        )

        if len(freq_curve) == 0:
            continue

        optimal_freq = int(freq_curve.idxmax())
        expected_nr = round(freq_curve.max(), 2)
        nr_at_1x = round(freq_curve.get(1, 0.0), 2)
        extra_nr = round(expected_nr - nr_at_1x, 2)
        max_observed = int(freq_curve.index.max())

        # Build NR curve string with per-post breakdown
        curve_parts = [f"{int(f)}x->${nr:.2f}" for f, nr in freq_curve.items()]
        nr_curve_str = " | ".join(curve_parts)

        # Per-post NR at optimal frequency
        nr_per_post_at_optimal = round(expected_nr / optimal_freq, 2) if optimal_freq > 0 else 0.0

        # Full per-post curve for frontend display
        per_post_curve: list[dict[str, Any]] = []
        for f, nr in freq_curve.items():
            f_int = int(f)
            per_post_curve.append({
                "frequency": f_int,
                "weekly_nr": round(nr, 2),
                "per_post_nr": round(nr / f_int, 2) if f_int > 0 else 0,
            })

        # Get location/title/category from combo
        parts = str(combo).split("|")
        loc_key = parts[0] if len(parts) > 0 else ""
        title_key = parts[1] if len(parts) > 1 else ""
        cat_key = parts[2] if len(parts) > 2 else ""

        results.append(
            {
                "Combo": combo,
                "Location_key": loc_key,
                "Title_key": title_key,
                "Category_key": cat_key,
                # Display names for frontend
                "Location": loc_names.get(loc_key, loc_key),
                "Title": title_names.get(title_key, title_key),
                "Category": cat_names.get(cat_key, cat_key),
                "Optimal_Posts_Per_Week": optimal_freq,
                "Expected_Weekly_NR": expected_nr,
                "NR_Per_Post_At_Optimal": nr_per_post_at_optimal,
                "NR_at_1x": nr_at_1x,
                "Extra_NR_vs_1x": extra_nr,
                "Max_Observed_Posts_Wk": max_observed,
                "NR_Curve": nr_curve_str,
                "Per_Post_Curve": per_post_curve,
                "Weeks_Observed": len(combo_weekly),
            }
        )

    logger.info(f"  Frequency data for {len(results)} combos")
    return results


# ====================================================================
# STEP 8 -- Best-Per-Location Rule  (Spec Section 15)
# ====================================================================
def apply_best_per_location(runs: pd.DataFrame) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    """Keep only the top REPOST candidate per location; track conflicts.

    Returns (best_per_location_df, location_conflicts_list).
    """
    logger.info("Step 8: Applying best-per-location rule (1 post per location per day)")

    repost = runs[runs["Decision"] == "REPOST"].copy()

    # For each combo, take only the latest run
    repost = repost.sort_values("D1_Date", ascending=False)
    latest_repost = repost.drop_duplicates(subset=["Combo"], keep="first")

    # Pick the best per location
    best = latest_repost.sort_values("Est_Lifetime_NR", ascending=False).drop_duplicates(
        subset=["Location_key"], keep="first"
    )

    # Build conflict list
    conflicts = []
    best_combos = set(best["Combo"])
    for _, row in latest_repost.iterrows():
        if row["Combo"] in best_combos:
            continue
        # Find what beat this row
        loc_winner = best[best["Location_key"] == row["Location_key"]]
        if loc_winner.empty:
            continue
        winner = loc_winner.iloc[0]
        conflicts.append(
            {
                "Location": row["Location"],
                "Location_key": row["Location_key"],
                "Filtered_Title": row["Title"],
                "Filtered_Category": row["Category"],
                "Filtered_Est_Lifetime_NR": round(row["Est_Lifetime_NR"], 2),
                "Winner_Title": winner["Title"],
                "Winner_Category": winner["Category"],
                "Winner_Est_Lifetime_NR": round(winner["Est_Lifetime_NR"], 2),
                "NR_Gap": round(winner["Est_Lifetime_NR"] - row["Est_Lifetime_NR"], 2),
                "Lost_To": (
                    f"{winner['Title']} / {winner['Category']} "
                    f"(${winner['Est_Lifetime_NR']:.2f} vs ${row['Est_Lifetime_NR']:.2f})"
                ),
            }
        )

    logger.info(f"  Best-per-location: {len(best)} locations, {len(conflicts)} conflicts filtered")
    return best, conflicts


# ====================================================================
# Geocoding enrichment (optional -- requires GOOGLE_MAPS_API_KEY)
# ====================================================================
def _enrich_with_geocoding(daily_action_plan: list[dict[str, Any]]) -> None:
    """Add lat/lng to each action plan item if geocoding is available.

    Modifies the plan list in place.  Silently skips if the geocoding
    module is not configured or any error occurs -- geocoding is a
    nice-to-have, never a blocker.
    """
    try:
        import geocoding
    except ImportError:
        return

    if not geocoding.is_configured():
        logger.info("Geocoding not configured -- skipping coordinate enrichment")
        return

    # Deduplicate locations for efficiency
    loc_set: dict[str, str] = {}  # lower -> original
    for item in daily_action_plan:
        loc = str(item.get("Location") or "").strip()
        if loc:
            loc_set.setdefault(loc.lower(), loc)

    if not loc_set:
        return

    unique_locations = list(loc_set.values())
    logger.info("Geocoding %d unique locations for action plan enrichment", len(unique_locations))

    try:
        results = geocoding.batch_geocode(unique_locations)
    except Exception as exc:
        logger.warning("Geocoding enrichment failed: %s", exc, exc_info=True)
        return

    # Build lookup: lower_location -> {lat, lng}
    coord_lookup: dict[str, dict[str, float | None]] = {}
    for geo_result in results:
        loc_name = str(geo_result.get("location") or "").strip().lower()
        if loc_name and "error" not in geo_result:
            coord_lookup[loc_name] = {
                "lat": geo_result.get("lat"),
                "lng": geo_result.get("lng"),
                "formatted_address": geo_result.get("formatted_address", ""),
            }

    # Enrich each action plan item
    enriched = 0
    for item in daily_action_plan:
        loc = str(item.get("Location") or "").strip().lower()
        coords = coord_lookup.get(loc)
        if coords:
            item["lat"] = coords["lat"]
            item["lng"] = coords["lng"]
            item["formatted_address"] = coords["formatted_address"]
            enriched += 1
        else:
            item["lat"] = None
            item["lng"] = None
            item["formatted_address"] = ""

    logger.info("Geocoding enrichment: %d/%d locations enriched", enriched, len(daily_action_plan))


# ====================================================================
# STEP 9 -- Build All Output Structures
# ====================================================================
def build_daily_action_plan(
    best_per_location: pd.DataFrame,
    location_intelligence: dict[str, Any],
    freq_data: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build the ranked daily action plan -- the primary product output."""
    logger.info("Step 9a: Building daily action plan")

    freq_lookup: dict[str, dict] = {f["Combo"]: f for f in freq_data}
    today_name = datetime.now().strftime("%A")

    plan = []
    for _, row in best_per_location.iterrows():
        loc_key = row["Location_key"]
        loc_intel = location_intelligence.get(loc_key, {})
        freq_info = freq_lookup.get(row["Combo"], {})

        best_day = loc_intel.get("best_day", "N/A")
        today_is_best = today_name == best_day

        # Look up salary benchmark for this category
        category_key = _key(loc_intel.get("best_category") or row["Category"])
        salary_bench = CL_SALARY_BENCHMARKS.get(category_key, {})
        salary_display = salary_bench.get("display", "")

        plan.append(
            {
                "Rank": 0,  # filled below
                "Location": row["Location"],
                "Location_key": loc_key,
                "Recommended_Title": loc_intel.get("best_title") or row["Title"],
                "Title_Avg_NR": loc_intel.get("best_title_avg_nr", 0.0),
                "Recommended_Category": loc_intel.get("best_category") or row["Category"],
                "Category_Avg_NR": loc_intel.get("best_category_avg_nr", 0.0),
                "Best_Day": best_day,
                "Best_Day_Avg_NR": loc_intel.get("best_day_avg_nr", 0.0),
                "Today_Is_Best_Day": today_is_best,
                "Decision": row["Decision"],
                "Trigger_Reason": row["Trigger_Reason"],
                "Tier": int(row["Tier"]),
                "D1_Cost": round(row["D1_Cost"], 2),
                "Est_D1_NR": round(row["D1_NR"], 2),
                "Est_Lifetime_NR": round(row["Est_Lifetime_NR"], 2),
                "Multiplier_Used": row["Multiplier_Used"],
                "Mult_Source": row["Mult_Source"],
                "Mult_Runs_Used": int(row["Mult_Runs_Used"]),
                "Optimal_Posts_Per_Week": freq_info.get("Optimal_Posts_Per_Week", 1),
                "Expected_Weekly_NR": freq_info.get("Expected_Weekly_NR", 0.0),
                "Best_Combo": loc_intel.get("best_combo", ""),
                "Last_Run_Date": row["D1_Date"].strftime("%Y-%m-%d") if pd.notna(row["D1_Date"]) else "",
                "Post_ID": row["Post ID"],
                "Combo": row["Combo"],
                # Salary-first recommendation (3.8x more applications per Indeed 2025)
                "Salary_Benchmark": salary_display,
                "Salary_First_Line": f"Pay: {salary_display}" if salary_display else "",
            }
        )

    # Sort: Tier ASC, Est_Lifetime_NR DESC
    plan.sort(key=lambda x: (x["Tier"], -x["Est_Lifetime_NR"]))
    for i, item in enumerate(plan, 1):
        item["Rank"] = i

    logger.info(f"  Daily action plan: {len(plan)} locations")
    return plan


def build_scorecard(
    runs: pd.DataFrame,
    daily_action_plan: list[dict[str, Any]],
    freq_data: list[dict[str, Any]],
) -> dict[str, Any]:
    """Build the top-level scorecard / dashboard KPIs."""
    logger.info("Step 9b: Building scorecard")

    paid_runs = runs[runs["D1_Cost"] > 0]

    total_spend = paid_runs["D1_Cost"].sum()
    total_gr = paid_runs["Total_GR"].sum()
    total_nr = paid_runs["Total_NR"].sum()
    avg_profit = _safe_pct(total_nr, total_spend) if total_spend > 0 else 0.0

    decision_counts = runs["Decision"].value_counts().to_dict()
    tier_counts = runs[runs["Tier"] > 0]["Tier"].value_counts().sort_index().to_dict()

    # Trigger breakdown
    trigger_counts: dict[str, int] = {}
    for reason in runs["Trigger_Reason"]:
        if "T1" in str(reason):
            trigger_counts["Trigger_1_Negative_Profit"] = trigger_counts.get("Trigger_1_Negative_Profit", 0) + 1
        elif "T2" in str(reason):
            trigger_counts["Trigger_2_Impression_Collapse"] = trigger_counts.get("Trigger_2_Impression_Collapse", 0) + 1
        elif "decay" in str(reason).lower():
            trigger_counts["Decay_Zone_Repost"] = trigger_counts.get("Decay_Zone_Repost", 0) + 1

    # Multiplier coverage
    mult_sources = runs["Mult_Source"].value_counts().to_dict()

    # Frequency summary
    multi_post_combos = sum(1 for f in freq_data if f["Optimal_Posts_Per_Week"] > 1)

    scorecard = {
        "Total_Runs": len(runs),
        "Total_Paid_Runs": len(paid_runs),
        "Unique_Combos": runs["Combo"].nunique(),
        "Unique_Locations": runs["Location_key"].nunique(),
        "Total_Spend": round(total_spend, 2),
        "Total_GR": round(total_gr, 2),
        "Total_NR": round(total_nr, 2),
        "Avg_Profit_Pct": round(avg_profit, 1),
        "Decision_Breakdown": decision_counts,
        "Trigger_Breakdown": trigger_counts,
        "Tier_Breakdown": tier_counts,
        "Multiplier_Coverage": mult_sources,
        "Action_Plan_Locations": len(daily_action_plan),
        "Multi_Post_Combos": multi_post_combos,
        "Avg_Run_Length": round(paid_runs["Run_Length"].mean(), 1) if len(paid_runs) > 0 else 0.0,
        "Total_Applies": int(paid_runs["Total_Applies"].sum()),
        # Post optimization tips (evidence-based)
        "Post_Optimization_Tips": {
            "salary_first_line": (
                "Include pay/compensation as the FIRST LINE of every CL post. "
                "Posts with salary in the first line get 3.8x more applications (Indeed 2025)."
            ),
            "word_count_goldilocks": (
                "Keep job descriptions between 201-400 words. This range yields "
                "8-8.5% apply rate (Appcast 302M click dataset). Under 200 = too vague; "
                "over 400 = candidate abandonment."
            ),
            "optimal_word_range": list(CL_OPTIMAL_WORD_COUNT),
        },
    }

    logger.info(f"  Scorecard: {scorecard['Total_Runs']} runs, "
                f"${scorecard['Total_NR']:.2f} total NR, "
                f"{scorecard['Avg_Profit_Pct']:.1f}% avg profit")
    return scorecard


# ====================================================================
# Validation
# ====================================================================
def validate_input(df: pd.DataFrame) -> list[str]:
    """Check that all required columns exist. Return list of missing columns."""
    missing = [col for col in REQUIRED_COLUMNS if col not in df.columns]
    return missing


# ====================================================================
# MAIN PIPELINE -- run_analysis
# ====================================================================
def run_analysis(df: pd.DataFrame, sell_cpa: float = DEFAULT_SELL_CPA) -> dict[str, Any]:
    """Execute the full analysis pipeline on a raw Excel DataFrame.

    Args:
        df: Raw Excel DataFrame with cumulative campaign data.
        sell_cpa: Revenue per apply in USD (varies by client/campaign, default $1.20).

    Returns a dict with all output structures ready for API serialisation.
    """
    global SELL_CPA
    SELL_CPA = sell_cpa

    logger.info("=" * 60)
    logger.info("CG Automation Engine -- Starting full analysis (CPA=$%.2f)", sell_cpa)
    logger.info("=" * 60)

    # Validate input
    missing = validate_input(df)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Step 1: Convert cumulative to daily
    daily = convert_cumulative_to_daily(df)

    # Step 2: Summarise post runs
    runs = summarise_post_runs(daily)

    # Step 3: Location multipliers
    runs, multiplier_table = compute_location_multipliers(runs)

    # Step 4: Classify decisions
    runs = classify_decisions(runs)

    # Step 5: Assign tiers
    runs = assign_profit_tiers(runs)

    # Step 6: Location intelligence
    location_intelligence = compute_location_intelligence(runs)

    # Step 7: Frequency optimisation
    freq_data = compute_frequency_optimization(daily, runs)

    # Step 8: Best per location
    best_per_location, location_conflicts = apply_best_per_location(runs)

    # Step 9: Build outputs
    daily_action_plan = build_daily_action_plan(best_per_location, location_intelligence, freq_data)

    # Step 9b: Enrich action plan with geocoded coordinates (if available)
    _enrich_with_geocoding(daily_action_plan)

    # Step 10: Posting time recommendations
    posting_time_recs = compute_posting_time_recommendations(runs, location_intelligence)

    # Step 11: Impression decay model
    decay_model = compute_impression_decay_model(daily)

    scorecard = build_scorecard(runs, daily_action_plan, freq_data)

    # Serialise sub-tables
    all_repost = _runs_to_records(runs[runs["Decision"] == "REPOST"])
    keep_running = _runs_to_records(runs[runs["Decision"] == "KEEP RUNNING"])
    skip = _runs_to_records(runs[runs["Decision"] == "SKIP"])
    all_runs_records = _runs_to_records(runs)
    best_per_loc_records = _runs_to_records(best_per_location)

    # Location intelligence as serialisable dict
    loc_intel_serialised = {}
    for loc_key, info in location_intelligence.items():
        loc_intel_serialised[loc_key] = {
            "Location": info["Location"],
            "best_title": info.get("best_title"),
            "best_title_avg_nr": info.get("best_title_avg_nr", 0.0),
            "best_category": info.get("best_category"),
            "best_category_avg_nr": info.get("best_category_avg_nr", 0.0),
            "best_combo": info.get("best_combo"),
            "best_combo_avg_nr": info.get("best_combo_avg_nr", 0.0),
            "best_day": info.get("best_day"),
            "best_day_avg_nr": info.get("best_day_avg_nr", 0.0),
            "worst_day": info.get("worst_day"),
            "worst_day_avg_nr": info.get("worst_day_avg_nr", 0.0),
            "title_table": info.get("title_table", []),
            "category_table": info.get("category_table", []),
            "combo_table": info.get("combo_table", []),
            "day_table": info.get("day_table", []),
            "decay_half_life": info.get("decay_half_life"),
            "decay_lambda": info.get("decay_lambda"),
            "decay_r_squared": info.get("decay_r_squared"),
        }

    # Enrich action plan with posting time recommendations
    for item in daily_action_plan:
        loc_key = item.get("Location_key", "")
        loc_timing = posting_time_recs.get("per_location", {}).get(loc_key, {})
        item["Best_Time"] = loc_timing.get("best_time", "10:00-12:00")
        item["Best_Time_Label"] = loc_timing.get("best_time_label", "Morning peak")
        item["Today_Is_Best_Day"] = loc_timing.get("today_is_best", False)
        item["Repost_Cadence"] = "48h min"

    # Enrich location intelligence with decay data
    for loc_key, info in location_intelligence.items():
        decay_loc = decay_model.get("per_location", {}).get(loc_key)
        if decay_loc:
            info["decay_half_life"] = decay_loc["half_life_days"]
            info["decay_lambda"] = decay_loc["lambda"]
            info["decay_r_squared"] = decay_loc["r_squared"]
        else:
            info["decay_half_life"] = None

    result = {
        "scorecard": scorecard,
        "daily_action_plan": daily_action_plan,
        "best_per_location": best_per_loc_records,
        "all_repost": all_repost,
        "location_conflicts": location_conflicts,
        "keep_running": keep_running,
        "skip": skip,
        "location_intelligence": loc_intel_serialised,
        "location_multipliers": multiplier_table.to_dict("records"),
        "frequency_optimization": freq_data,
        "all_runs": all_runs_records,
        "posting_time_recommendations": posting_time_recs,
        "impression_decay_model": decay_model,
    }

    logger.info("=" * 60)
    logger.info("CG Automation Engine -- Analysis complete")
    logger.info(f"  Action plan: {len(daily_action_plan)} locations to post")
    logger.info(f"  Repost candidates: {len(all_repost)}")
    logger.info(f"  Keep running: {len(keep_running)}")
    logger.info(f"  Skip: {len(skip)}")
    logger.info("=" * 60)

    return result


# ====================================================================
# BENCHMARKS -- Extract & Compare
# ====================================================================

def extract_benchmarks(runs: pd.DataFrame) -> list[dict[str, Any]]:
    """Extract benchmark data from analysis runs for Supabase storage.

    Aggregates per location+title+category combo: avg NR, GR, profit %,
    applies, cost, and multiplier.

    Args:
        runs: The full runs DataFrame from the analysis pipeline.

    Returns:
        List of benchmark dicts ready for supabase_store.save_benchmarks().
    """
    if runs.empty:
        return []

    paid = runs[runs["D1_Cost"] > 0].copy()
    if paid.empty:
        return []

    benchmarks: list[dict[str, Any]] = []

    # Group by Location + Title + Category
    group_cols = ["Location_key", "Location", "Title", "Category"]
    available_cols = [c for c in group_cols if c in paid.columns]
    if len(available_cols) < 2:
        return []

    grouped = paid.groupby(["Location_key", "Title", "Category"], dropna=False)

    for (loc_key, title, category), grp in grouped:
        location = grp["Location"].iloc[0] if "Location" in grp.columns else loc_key
        avg_nr = grp["Total_NR"].mean() if "Total_NR" in grp.columns else 0
        avg_gr = grp["Total_GR"].mean() if "Total_GR" in grp.columns else 0
        avg_cost = grp["D1_Cost"].mean() if "D1_Cost" in grp.columns else 0
        avg_applies = grp["Total_Applies"].mean() if "Total_Applies" in grp.columns else 0
        avg_profit = grp["Profit_Pct"].mean() if "Profit_Pct" in grp.columns else 0
        avg_mult = grp["Multiplier_Used"].mean() if "Multiplier_Used" in grp.columns else 1.0

        benchmarks.append({
            "location": str(location),
            "title": str(title),
            "category": str(category),
            "avg_nr": float(avg_nr) if not np.isnan(avg_nr) else 0,
            "avg_gr": float(avg_gr) if not np.isnan(avg_gr) else 0,
            "avg_profit_pct": float(avg_profit) if not np.isnan(avg_profit) else 0,
            "avg_applies": float(avg_applies) if not np.isnan(avg_applies) else 0,
            "avg_cost": float(avg_cost) if not np.isnan(avg_cost) else 0,
            "avg_multiplier": float(avg_mult) if not np.isnan(avg_mult) else 1.0,
            "sample_size": len(grp),
            "total_runs": len(grp),
            "period": "all_time",
        })

    logger.info(f"  Extracted {len(benchmarks)} benchmark combos from {len(paid)} paid runs")
    return benchmarks


def compare_with_benchmarks(
    daily_action_plan: list[dict[str, Any]],
    benchmark_data: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Enrich the daily action plan with benchmark comparisons.

    For each location in the action plan, finds matching benchmarks and
    adds comparison fields showing how current performance compares to
    historical baselines.

    Args:
        daily_action_plan: The DAP from build_daily_action_plan().
        benchmark_data: List of benchmark dicts from Supabase.

    Returns:
        The same daily_action_plan list with added benchmark fields.
    """
    if not benchmark_data:
        return daily_action_plan

    # Build lookup: location -> list of benchmarks
    bm_by_loc: dict[str, list[dict[str, Any]]] = {}
    for bm in benchmark_data:
        loc = str(bm.get("location", "")).strip().lower()
        if loc:
            bm_by_loc.setdefault(loc, []).append(bm)

    for item in daily_action_plan:
        loc = str(item.get("Location", item.get("location", ""))).strip().lower()
        loc_bms = bm_by_loc.get(loc, [])

        if not loc_bms:
            item["Benchmark_Available"] = False
            continue

        item["Benchmark_Available"] = True

        # Aggregate all benchmarks for this location
        total_runs = sum(bm.get("total_runs", 0) for bm in loc_bms)
        avg_nr_hist = (
            sum(bm.get("avg_nr", 0) * bm.get("total_runs", 1) for bm in loc_bms)
            / max(total_runs, 1)
        )
        avg_profit_hist = (
            sum(bm.get("avg_profit_pct", 0) * bm.get("total_runs", 1) for bm in loc_bms)
            / max(total_runs, 1)
        )
        avg_cost_hist = (
            sum(bm.get("avg_cost", 0) * bm.get("total_runs", 1) for bm in loc_bms)
            / max(total_runs, 1)
        )

        item["Benchmark_Hist_Avg_NR"] = round(avg_nr_hist, 2)
        item["Benchmark_Hist_Avg_Profit"] = round(avg_profit_hist, 1)
        item["Benchmark_Hist_Avg_Cost"] = round(avg_cost_hist, 2)
        item["Benchmark_Total_Runs"] = total_runs

        # Compare current est_lifetime_nr vs historical avg
        current_nr = item.get("Est_Lifetime_NR", 0)
        if avg_nr_hist != 0:
            nr_delta_pct = ((current_nr - avg_nr_hist) / abs(avg_nr_hist)) * 100
            item["Benchmark_NR_Delta_Pct"] = round(nr_delta_pct, 1)
            if nr_delta_pct > 20:
                item["Benchmark_Signal"] = "above_avg"
            elif nr_delta_pct < -20:
                item["Benchmark_Signal"] = "below_avg"
            else:
                item["Benchmark_Signal"] = "on_track"
        else:
            item["Benchmark_NR_Delta_Pct"] = 0
            item["Benchmark_Signal"] = "no_baseline"

        # Find best historical combo for this location
        best_bm = max(loc_bms, key=lambda b: b.get("avg_nr", 0))
        item["Benchmark_Best_Title"] = best_bm.get("title", "")
        item["Benchmark_Best_Category"] = best_bm.get("category", "")
        item["Benchmark_Best_NR"] = round(best_bm.get("avg_nr", 0), 2)

    return daily_action_plan


# ====================================================================
# STEP 10 -- Posting Time Optimizer (Research-driven)
# ====================================================================

# Industry research benchmarks (classified ad performance studies)
_DAY_RANK: dict[str, int] = {
    "Sunday": 1, "Saturday": 2, "Monday": 3,
    "Tuesday": 4, "Wednesday": 5, "Thursday": 6, "Friday": 7,
}

_TIME_WINDOWS: list[dict[str, Any]] = [
    {"window": "10:00-12:00", "label": "Morning peak (break time)", "score": 1.0},
    {"window": "17:00-18:00", "label": "Evening peak (after work)", "score": 0.8},
    {"window": "08:00-10:00", "label": "Early morning", "score": 0.6},
    {"window": "12:00-14:00", "label": "Lunch hour", "score": 0.5},
    {"window": "06:00-08:00", "label": "Pre-work (weekends)", "score": 0.7},
]


def compute_posting_time_recommendations(
    runs: pd.DataFrame,
    location_intelligence: dict[str, Any],
) -> dict[str, Any]:
    """Generate posting time recommendations per location.

    Combines internal data (best day per location from actual performance)
    with industry research (best time-of-day, day ranking benchmarks).

    CL posts peak in hours 0-4 (top of chronological sort), then decay.
    48-hour minimum between same-ad reposts (CL TOS).

    Args:
        runs: Post runs DataFrame.
        location_intelligence: Dict from compute_location_intelligence().

    Returns:
        Dict with global_recommendations and per-location timing.
    """
    logger.info("Step 10: Computing posting time recommendations")

    # Global day-of-week performance from data
    paid = runs[runs["D1_Cost"] > 0]
    global_day_perf = (
        paid.groupby("DayOfWeek_Posted")
        .agg(
            Runs=("Post ID", "nunique"),
            Avg_NR=("Total_NR", "mean"),
            Avg_D1_Applies=("D1_Applies", "mean"),
        )
        .reset_index()
        .sort_values("Avg_NR", ascending=False)
    )
    global_day_perf["Avg_NR"] = global_day_perf["Avg_NR"].round(2)
    global_day_perf["Avg_D1_Applies"] = global_day_perf["Avg_D1_Applies"].round(2)

    # Build per-location posting schedule recommendations
    today_name = datetime.now().strftime("%A")
    per_location: list[dict[str, Any]] = {}

    for loc_key, intel in location_intelligence.items():
        best_day_data = intel.get("best_day")
        best_day_nr = intel.get("best_day_avg_nr", 0)
        worst_day = intel.get("worst_day")

        # Combine data-driven best day with industry benchmark
        data_day = best_day_data or "Monday"
        industry_rank = _DAY_RANK.get(data_day, 5)

        # Score: data performance + industry alignment
        alignment_bonus = max(0, (8 - industry_rank)) / 7  # 0-1 scale
        confidence = "high" if intel.get("day_table") and len(intel["day_table"]) >= 3 else "low"

        per_location[loc_key] = {
            "location": intel["Location"],
            "best_day_data": data_day,
            "best_day_nr": best_day_nr,
            "worst_day": worst_day,
            "industry_alignment": round(alignment_bonus, 2),
            "confidence": confidence,
            "best_time": "10:00-12:00",
            "best_time_label": "Morning peak (break time)",
            "today_is_best": today_name == data_day,
            "repost_cadence": "Every 48 hours minimum",
        }

    # Global recommendations
    global_recs = {
        "best_days_industry": ["Sunday", "Saturday", "Monday"],
        "best_time_windows": _TIME_WINDOWS,
        "repost_rules": [
            "48-hour minimum between same-ad reposts (CL TOS)",
            "Renew every 48 hours to bump back to top of listings",
            "1 well-crafted post per 2 days outperforms multiple daily posts",
            "Sunday/Monday morning posts get most views (industry research)",
        ],
        "global_day_performance": global_day_perf.to_dict("records"),
        "total_locations_analyzed": len(per_location),
    }

    logger.info(f"  Posting time recommendations for {len(per_location)} locations")
    return {
        "global": global_recs,
        "per_location": per_location,
    }


# ====================================================================
# STEP 11 -- Impression Decay Model (Exponential Curve Fitting)
# ====================================================================

def compute_impression_decay_model(daily: pd.DataFrame) -> dict[str, Any]:
    """Fit exponential decay curves to impression data per location.

    For each location, fits: impressions(day) = A * e^(-lambda * day)
    using least-squares on the log-transformed data.

    Returns decay parameters, half-life per location, and global averages.

    Args:
        daily: Daily data DataFrame from convert_cumulative_to_daily().

    Returns:
        Dict with global_model, per_location models, and decay_curves.
    """
    logger.info("Step 11: Computing impression decay models")

    # Only use posts with sufficient data (3+ days of impressions)
    post_lengths = daily.groupby("Post ID").size()
    valid_posts = post_lengths[post_lengths >= 3].index
    filtered = daily[daily["Post ID"].isin(valid_posts)].copy()

    if filtered.empty:
        logger.warning("  No posts with 3+ days for decay modeling")
        return {"global_model": None, "per_location": {}, "decay_curves": []}

    # Compute average impressions by Day_Num across all posts
    global_curve = (
        filtered.groupby("Day_Num")["Daily_Impressions"]
        .agg(["mean", "median", "count"])
        .reset_index()
        .rename(columns={"mean": "avg_impressions", "median": "median_impressions", "count": "sample_size"})
    )
    global_curve = global_curve[global_curve["sample_size"] >= 5]  # Need 5+ posts per day

    # Fit exponential decay: y = A * e^(-lambda * x)
    # Log transform: ln(y) = ln(A) - lambda * x
    global_model = _fit_decay(global_curve["Day_Num"].values, global_curve["avg_impressions"].values)

    # Per-location decay models
    per_location: dict[str, dict[str, Any]] = {}
    for loc_key, loc_data in filtered.groupby("Location_key"):
        loc_curve = (
            loc_data.groupby("Day_Num")["Daily_Impressions"]
            .agg(["mean", "count"])
            .reset_index()
            .rename(columns={"mean": "avg_impressions", "count": "sample_size"})
        )
        loc_curve = loc_curve[loc_curve["sample_size"] >= 2]

        if len(loc_curve) < 3:
            continue

        location_name = loc_data["Location"].iloc[0]
        model = _fit_decay(loc_curve["Day_Num"].values, loc_curve["avg_impressions"].values)
        if model:
            per_location[loc_key] = {
                "location": location_name,
                **model,
                "data_points": len(loc_curve),
            }

    # Build decay curve data for frontend chart (days 1-30)
    decay_curves: list[dict[str, Any]] = []
    if global_model:
        A = global_model["amplitude"]
        lam = global_model["lambda"]
        for day in range(1, 31):
            predicted = A * np.exp(-lam * day)
            actual_row = global_curve[global_curve["Day_Num"] == day]
            actual = float(actual_row["avg_impressions"].iloc[0]) if len(actual_row) > 0 else None
            decay_curves.append({
                "day": day,
                "predicted_impressions": round(predicted, 1),
                "actual_impressions": round(actual, 1) if actual is not None else None,
                "retention_pct": round((predicted / A) * 100, 1) if A > 0 else 0,
            })

    result = {
        "global_model": global_model,
        "per_location": per_location,
        "decay_curves": decay_curves,
        "locations_modeled": len(per_location),
        "posts_analyzed": len(valid_posts),
    }

    if global_model:
        logger.info(
            "  Decay model: A=%.1f, lambda=%.4f, half_life=%.1f days, "
            "R²=%.3f, %d locations modeled",
            global_model["amplitude"], global_model["lambda"],
            global_model["half_life_days"], global_model["r_squared"],
            len(per_location),
        )
    else:
        logger.info("  Insufficient data for global decay model")

    return result


def _fit_decay(days: np.ndarray, impressions: np.ndarray) -> dict[str, Any] | None:
    """Fit exponential decay y = A * e^(-lambda * x) via log-linear regression.

    Args:
        days: Array of day numbers (1-based).
        impressions: Array of average daily impressions.

    Returns:
        Dict with amplitude, lambda, half_life_days, r_squared, or None if fit fails.
    """
    # Filter out zero/negative impressions (can't log-transform)
    mask = impressions > 0
    x = days[mask].astype(float)
    y = impressions[mask].astype(float)

    if len(x) < 3:
        return None

    try:
        # Log-linear fit: ln(y) = ln(A) - lambda * x
        log_y = np.log(y)
        # Polyfit degree 1: coefficients [slope, intercept] = [-lambda, ln(A)]
        coeffs = np.polyfit(x, log_y, 1)
        neg_lambda = coeffs[0]
        ln_A = coeffs[1]

        lam = -neg_lambda
        A = np.exp(ln_A)

        # Only valid if lambda > 0 (decay, not growth) and A > 0
        if lam <= 0 or A <= 0:
            return None

        # Half-life: time for impressions to drop to 50%
        half_life = np.log(2) / lam

        # R-squared
        y_pred = A * np.exp(-lam * x)
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r_sq = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0

        return {
            "amplitude": round(float(A), 2),
            "lambda": round(float(lam), 4),
            "half_life_days": round(float(half_life), 1),
            "r_squared": round(float(r_sq), 3),
        }
    except (np.linalg.LinAlgError, ValueError, RuntimeWarning):
        return None


# ====================================================================
# DAILY UPLOAD MERGE LOGIC (Feature 2)
# ====================================================================

def merge_daily_upload(
    new_df: pd.DataFrame,
    existing_post_date_pairs: set[tuple[str, str]],
    existing_post_ids: set[str],
    identity_map: list[dict[str, str]],
    sell_cpa: float = DEFAULT_SELL_CPA,
) -> dict[str, Any]:
    """Merge a new daily upload with existing session data.

    Implements the dedup/merge logic:
    a. Skip rows where Post ID + Date already exists (duplicates)
    b. Add new daily rows for existing Post IDs
    c. Fallback match by D1_Date + Location + Title + Category
    d. Insert brand new posts

    Args:
        new_df: Raw DataFrame from the new upload file.
        existing_post_date_pairs: Set of (post_id, date_str) already stored.
        existing_post_ids: Set of post_id strings already stored.
        identity_map: List of dicts with post identity for fallback matching.
        sell_cpa: Revenue per apply.

    Returns:
        Dict with:
            new_rows: list of new daily row dicts to insert
            skipped_count: number of duplicate rows skipped
            updated_post_ids: set of post_ids that got new daily rows
            new_post_ids: set of brand new post_ids
            remapped_post_ids: dict mapping new post_id -> existing post_id (fallback match)
    """
    global SELL_CPA
    SELL_CPA = sell_cpa

    logger.info("Merge: Starting daily upload merge")

    # Validate input
    missing = validate_input(new_df)
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    # Prepare the new data (convert cumulative to daily)
    daily = convert_cumulative_to_daily(new_df)

    # Build fallback identity lookup: (d1_date_lower, loc_lower, title_lower, cat_lower) -> post_id
    fallback_lookup: dict[tuple[str, str, str, str], str] = {}
    for ident in identity_map:
        key = (
            str(ident["d1_date"]).strip(),
            str(ident["location"]).strip().lower(),
            str(ident["title"]).strip().lower(),
            str(ident["category"]).strip().lower(),
        )
        fallback_lookup[key] = ident["post_id"]

    new_rows: list[dict[str, Any]] = []
    skipped_count: int = 0
    updated_post_ids: set[str] = set()
    new_post_ids: set[str] = set()
    remapped_post_ids: dict[str, str] = {}  # new_post_id -> existing_post_id

    # Find the earliest date per post_id in the new upload (for fallback matching)
    d1_dates_new: dict[str, str] = {}
    for _, row in daily.iterrows():
        pid = str(row["Post ID"])
        date_str = row["Date"].strftime("%Y-%m-%d")
        if pid not in d1_dates_new or date_str < d1_dates_new[pid]:
            d1_dates_new[pid] = date_str

    for _, row in daily.iterrows():
        pid = str(row["Post ID"])
        date_str = row["Date"].strftime("%Y-%m-%d")

        # Step a: Check if this exact Post ID + Date already exists
        if (pid, date_str) in existing_post_date_pairs:
            skipped_count += 1
            continue

        # Determine the effective post_id (might be remapped via fallback)
        effective_pid = pid

        # Step b: Does this Post ID already exist (any date)?
        if pid in existing_post_ids:
            updated_post_ids.add(pid)
        else:
            # Step c: Fallback match by D1_Date + Location + Title + Category
            d1_date_for_post = d1_dates_new.get(pid, date_str)
            fallback_key = (
                d1_date_for_post,
                str(row["Location"]).strip().lower(),
                str(row["Title"]).strip().lower(),
                str(row["Category"]).strip().lower(),
            )
            matched_pid = fallback_lookup.get(fallback_key)
            if matched_pid:
                # Remap this post_id to the existing one
                effective_pid = matched_pid
                remapped_post_ids[pid] = matched_pid
                updated_post_ids.add(matched_pid)
                # Also skip if the remapped pair already exists
                if (matched_pid, date_str) in existing_post_date_pairs:
                    skipped_count += 1
                    continue
            else:
                # Step d: Brand new post
                new_post_ids.add(pid)

        # Build the row dict for insertion
        new_rows.append({
            "post_id": effective_pid,
            "date": date_str,
            "location": str(row["Location"]),
            "title": str(row["Title"]),
            "category": str(row["Category"]),
            "template_type": str(row.get("Template Type", "")),
            "media_cost": float(row["Media_Cost"]),
            "impressions_cumul": float(row["Impressions_Cumul"]),
            "clicks_cumul": float(row["Clicks_Cumul"]),
            "applies_cumul": float(row["Applies_Cumul"]),
            "daily_impressions": float(row["Daily_Impressions"]),
            "daily_clicks": float(row["Daily_Clicks"]),
            "daily_applies": float(row["Daily_Applies"]),
            "day_num": int(row["Day_Num"]),
        })

    logger.info(
        "Merge result: %d new rows, %d skipped, %d posts updated, "
        "%d new posts, %d remapped",
        len(new_rows), skipped_count, len(updated_post_ids),
        len(new_post_ids), len(remapped_post_ids),
    )

    return {
        "new_rows": new_rows,
        "skipped_count": skipped_count,
        "updated_post_ids": updated_post_ids,
        "new_post_ids": new_post_ids,
        "remapped_post_ids": remapped_post_ids,
    }


def rebuild_from_daily_raw(
    daily_raw_rows: list[dict[str, Any]],
    sell_cpa: float = DEFAULT_SELL_CPA,
) -> dict[str, Any]:
    """Rebuild the full analysis from normalised daily raw rows.

    This is used after a daily merge: read ALL daily rows from Supabase,
    reconstruct the DataFrame, and re-run the full pipeline.

    Args:
        daily_raw_rows: List of daily raw row dicts from Supabase.
        sell_cpa: Revenue per apply.

    Returns:
        Full analysis result dict (same structure as run_analysis).
    """
    global SELL_CPA
    SELL_CPA = sell_cpa

    if not daily_raw_rows:
        raise ValueError("No daily raw data to rebuild from")

    logger.info("Rebuilding analysis from %d daily raw rows", len(daily_raw_rows))

    # Convert to DataFrame matching the format expected by the pipeline
    records = []
    for r in daily_raw_rows:
        records.append({
            "Date": r.get("date", ""),
            "Post ID": r.get("post_id", ""),
            "Title": r.get("title", ""),
            "Location": r.get("location", ""),
            "Category": r.get("category", ""),
            "Template Type": r.get("template_type", ""),
            "Media Cost ($)": float(r.get("media_cost", 0) or 0),
            "Impressions (Cumul)": float(r.get("impressions_cumul", 0) or 0),
            "Clicks (Cumul)": float(r.get("clicks_cumul", 0) or 0),
            "Applies (Cumul)": float(r.get("applies_cumul", 0) or 0),
        })

    df = pd.DataFrame(records)
    return run_analysis(df, sell_cpa=sell_cpa)


def compute_post_status(
    all_runs: list[dict[str, Any]],
    latest_upload_date: str,
) -> list[dict[str, Any]]:
    """Add Still Live / Ended status to each run.

    A post is STILL LIVE if its last appearance is within 30 days of
    the latest upload date.

    A post is ENDED if it hasn't appeared for 30+ days.

    Args:
        all_runs: List of run dicts (from the analysis result).
        latest_upload_date: The most recent date in the latest upload (YYYY-MM-DD).

    Returns:
        The same list with 'post_status' field added to each run.
    """
    try:
        ref_date = datetime.strptime(latest_upload_date, "%Y-%m-%d")
    except (ValueError, TypeError):
        ref_date = datetime.now()

    for run in all_runs:
        last_date_str = run.get("Last_Date", run.get("last_date", ""))
        try:
            last_date = datetime.strptime(str(last_date_str), "%Y-%m-%d")
            days_since = (ref_date - last_date).days
            if days_since <= 30:
                run["post_status"] = "still_live"
            else:
                run["post_status"] = "ended"
        except (ValueError, TypeError):
            run["post_status"] = "unknown"

    return all_runs


def compute_change_summary(
    old_analysis: dict[str, Any],
    new_analysis: dict[str, Any],
) -> dict[str, Any]:
    """Compare old and new analysis results to produce a change summary.

    Args:
        old_analysis: Previous analysis result dict (may be None).
        new_analysis: New analysis result dict after merge.

    Returns:
        Dict with posts_updated, new_posts, ended, newly_repost counts.
    """
    if not old_analysis:
        new_runs = new_analysis.get("all_runs", [])
        repost_count = sum(1 for r in new_runs if r.get("Decision") == "REPOST")
        return {
            "posts_updated": 0,
            "new_posts": len(new_runs),
            "posts_ended": 0,
            "newly_repost": repost_count,
        }

    old_runs = {str(r.get("Post ID", r.get("post_id", ""))): r
                for r in old_analysis.get("all_runs", [])}
    new_runs = {str(r.get("Post ID", r.get("post_id", ""))): r
                for r in new_analysis.get("all_runs", [])}

    old_ids = set(old_runs.keys())
    new_ids = set(new_runs.keys())

    new_post_ids = new_ids - old_ids
    ended_post_ids = old_ids - new_ids
    updated_post_ids = old_ids & new_ids

    # Count posts that were NOT repost before but ARE now
    newly_repost = 0
    for pid in updated_post_ids:
        old_decision = old_runs[pid].get("Decision", "")
        new_decision = new_runs[pid].get("Decision", "")
        if old_decision != "REPOST" and new_decision == "REPOST":
            newly_repost += 1

    # Also count new posts that are REPOST
    for pid in new_post_ids:
        if new_runs[pid].get("Decision") == "REPOST":
            newly_repost += 1

    return {
        "posts_updated": len(updated_post_ids),
        "new_posts": len(new_post_ids),
        "posts_ended": len(ended_post_ids),
        "newly_repost": newly_repost,
    }


def _runs_to_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Convert a runs DataFrame to a list of JSON-safe dicts."""
    out = df.copy()

    # Convert dates to strings
    for col in ["D1_Date", "Last_Date"]:
        if col in out.columns:
            out[col] = out[col].apply(lambda x: x.strftime("%Y-%m-%d") if pd.notna(x) else "")

    # Round numeric columns
    numeric_round_2 = [
        "D1_Cost", "D1_Impressions", "D1_Clicks", "D1_Applies",
        "Last_Impressions", "Total_Applies", "Total_GR", "Total_NR",
        "D1_GR", "D1_NR", "Est_Lifetime_Applies", "Est_Lifetime_GR",
        "Est_Lifetime_NR",
    ]
    for col in numeric_round_2:
        if col in out.columns:
            out[col] = out[col].round(2)

    numeric_round_1 = ["Impr_Drop_Pct", "Profit_Pct", "Run_Length"]
    for col in numeric_round_1:
        if col in out.columns:
            out[col] = out[col].round(1)

    # Replace NaN with None for JSON
    out = out.where(pd.notna(out), None)

    return out.to_dict("records")
