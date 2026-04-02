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

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEFAULT_SELL_CPA: float = 1.20
# Active CPA for the current analysis run (set by run_analysis, used by helpers)
SELL_CPA: float = DEFAULT_SELL_CPA
GLOBAL_AVG_MULTIPLIER: float = 3.60

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

    # Normalised keys
    df["Location_key"] = df["Location"].apply(_key)
    df["Category_key"] = df["Category"].apply(_key)
    df["Title_key"] = df["Title"].apply(_key)
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

        d1_cost = g["Media_Cost"].sum()
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
    """
    logger.info("Step 7: Computing frequency optimisation")

    # Build per-run weekly data
    run_weekly = runs[runs["D1_Cost"] > 0].copy()
    run_weekly["ISO_Year"] = run_weekly["D1_Date"].dt.isocalendar().year.astype(int)
    run_weekly["ISO_Week"] = run_weekly["D1_Date"].dt.isocalendar().week.astype(int)
    run_weekly["Year_Week"] = run_weekly["ISO_Year"].astype(str) + "-W" + run_weekly["ISO_Week"].astype(str).str.zfill(2)

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

        # Build NR curve string
        curve_parts = [f"{int(f)}x->${nr:.2f}" for f, nr in freq_curve.items()]
        nr_curve_str = " | ".join(curve_parts)

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
                "Optimal_Posts_Per_Week": optimal_freq,
                "Expected_Weekly_NR": expected_nr,
                "NR_at_1x": nr_at_1x,
                "Extra_NR_vs_1x": extra_nr,
                "Max_Observed_Posts_Wk": max_observed,
                "NR_Curve": nr_curve_str,
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
        }

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
