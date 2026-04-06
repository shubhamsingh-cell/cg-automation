"""Supabase persistence for CG Automation.

Uses stdlib urllib.request only (no supabase-py dependency).
All functions degrade gracefully if SUPABASE_URL / SUPABASE_SERVICE_KEY
are not set -- the app continues to work with in-memory storage only.

-- SQL to create the tables (run once in Supabase SQL editor):
--
-- CREATE TABLE IF NOT EXISTS cg_jobs (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     job_id TEXT UNIQUE NOT NULL,
--     filename TEXT,
--     sell_cpa NUMERIC DEFAULT 1.20,
--     total_runs INTEGER,
--     total_locations INTEGER,
--     total_spend NUMERIC,
--     total_nr NUMERIC,
--     avg_profit_pct NUMERIC,
--     repost_count INTEGER,
--     keep_running_count INTEGER,
--     skip_count INTEGER,
--     action_plan_count INTEGER,
--     status TEXT DEFAULT 'completed',
--     created_at TIMESTAMPTZ DEFAULT NOW(),
--     updated_at TIMESTAMPTZ DEFAULT NOW()
-- );
--
-- CREATE TABLE IF NOT EXISTS cg_action_plans (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     job_id TEXT REFERENCES cg_jobs(job_id) ON DELETE CASCADE,
--     rank INTEGER,
--     location TEXT,
--     recommended_title TEXT,
--     recommended_category TEXT,
--     best_day TEXT,
--     decision TEXT,
--     trigger_reason TEXT,
--     tier INTEGER,
--     est_d1_nr NUMERIC,
--     est_lifetime_nr NUMERIC,
--     multiplier_used NUMERIC,
--     mult_source TEXT,
--     optimal_posts_per_week INTEGER,
--     created_at TIMESTAMPTZ DEFAULT NOW()
-- );
--
-- CREATE TABLE IF NOT EXISTS cg_schedules (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     schedule_id TEXT UNIQUE NOT NULL,
--     job_id TEXT REFERENCES cg_jobs(job_id),
--     cron_expression TEXT DEFAULT '0 6 * * 1',
--     webhook_url TEXT,
--     next_run TIMESTAMPTZ,
--     last_run TIMESTAMPTZ,
--     status TEXT DEFAULT 'active',
--     created_at TIMESTAMPTZ DEFAULT NOW()
-- );
--
-- CREATE TABLE IF NOT EXISTS cg_benchmarks (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     client_name TEXT NOT NULL DEFAULT 'default',
--     location TEXT NOT NULL,
--     title TEXT,
--     category TEXT,
--     day_of_week TEXT,
--     avg_nr NUMERIC DEFAULT 0,
--     avg_gr NUMERIC DEFAULT 0,
--     avg_profit_pct NUMERIC DEFAULT 0,
--     avg_applies NUMERIC DEFAULT 0,
--     avg_cost NUMERIC DEFAULT 0,
--     avg_multiplier NUMERIC DEFAULT 1.0,
--     sample_size INTEGER DEFAULT 0,
--     total_runs INTEGER DEFAULT 0,
--     period TEXT DEFAULT 'all_time',
--     first_seen TIMESTAMPTZ DEFAULT NOW(),
--     last_updated TIMESTAMPTZ DEFAULT NOW(),
--     UNIQUE(client_name, location, title, category)
-- );
--
-- CREATE INDEX idx_cg_benchmarks_location ON cg_benchmarks(location);
-- CREATE INDEX idx_cg_benchmarks_client ON cg_benchmarks(client_name);
--
-- ALTER TABLE cg_jobs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE cg_action_plans ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE cg_schedules ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE cg_benchmarks ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Service role full access" ON cg_jobs FOR ALL USING (auth.role() = 'service_role');
-- CREATE POLICY "Service role full access" ON cg_action_plans FOR ALL USING (auth.role() = 'service_role');
-- CREATE POLICY "Service role full access" ON cg_schedules FOR ALL USING (auth.role() = 'service_role');
-- CREATE POLICY "Service role full access" ON cg_benchmarks FOR ALL USING (auth.role() = 'service_role');
"""

from __future__ import annotations

import json
import logging
import os
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

logger = logging.getLogger("cg-automation.supabase")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_SUPABASE_URL: str = os.environ.get("SUPABASE_URL") or ""
_SUPABASE_KEY: str = (
    os.environ.get("SUPABASE_SERVICE_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or ""
)


def _configured() -> bool:
    """Return True if Supabase env vars are set."""
    return bool(_SUPABASE_URL and _SUPABASE_KEY)


# ---------------------------------------------------------------------------
# Generic HTTP helper
# ---------------------------------------------------------------------------

def _supabase_request(
    method: str,
    table: str,
    body: Optional[dict[str, Any] | list[dict[str, Any]]] = None,
    params: Optional[dict[str, str]] = None,
    headers_extra: Optional[dict[str, str]] = None,
) -> Optional[Any]:
    """Execute an HTTP request against the Supabase REST API.

    Args:
        method: HTTP method (GET, POST, PATCH, DELETE).
        table: Table name (e.g. 'cg_jobs').
        body: JSON-serialisable body for POST/PATCH.
        params: Query parameters appended to the URL.
        headers_extra: Additional headers merged into the request.

    Returns:
        Parsed JSON response, or None on error / not configured.
    """
    if not _configured():
        return None

    url = f"{_SUPABASE_URL.rstrip('/')}/rest/v1/{table}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    headers: dict[str, str] = {
        "apikey": _SUPABASE_KEY,
        "Authorization": f"Bearer {_SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    if headers_extra:
        headers.update(headers_extra)

    data: Optional[bytes] = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            raw = resp.read().decode("utf-8")
            if raw:
                return json.loads(raw)
            return None
    except urllib.error.HTTPError as exc:
        error_body = ""
        try:
            error_body = exc.read().decode("utf-8")
        except Exception:
            pass
        logger.error(
            "Supabase %s %s returned %d: %s",
            method, table, exc.code, error_body,
            exc_info=True,
        )
        return None
    except Exception:
        logger.error("Supabase request failed: %s %s", method, table, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# cg_jobs
# ---------------------------------------------------------------------------

def save_job(
    job_id: str,
    filename: str,
    sell_cpa: float,
    scorecard: dict[str, Any],
) -> Optional[dict[str, Any]]:
    """Insert a job record into cg_jobs from the analysis scorecard.

    Args:
        job_id: UUID string for this job.
        filename: Original uploaded filename.
        sell_cpa: Revenue per apply used for this analysis.
        scorecard: Scorecard dict from engine.run_analysis result.

    Returns:
        Inserted row as dict, or None on failure.
    """
    if not _configured():
        return None

    row: dict[str, Any] = {
        "job_id": job_id,
        "filename": filename or "",
        "sell_cpa": sell_cpa,
        "total_runs": scorecard.get("total_runs") or scorecard.get("total_rows", 0),
        "total_locations": scorecard.get("total_locations", 0),
        "total_spend": scorecard.get("total_spend") or scorecard.get("total_cost", 0),
        "total_nr": scorecard.get("total_nr") or scorecard.get("total_lifetime_nr", 0),
        "avg_profit_pct": scorecard.get("avg_profit_pct", 0),
        "repost_count": scorecard.get("repost_count", 0),
        "keep_running_count": scorecard.get("keep_running_count", 0),
        "skip_count": scorecard.get("skip_count", 0),
        "action_plan_count": scorecard.get("action_plan_count", 0),
        "status": "completed",
    }

    result = _supabase_request("POST", "cg_jobs", body=row)
    if result and isinstance(result, list) and len(result) > 0:
        return result[0]
    return result


def get_job(job_id: str) -> Optional[dict[str, Any]]:
    """Retrieve a single job by job_id.

    Args:
        job_id: The job's unique identifier.

    Returns:
        Job dict or None if not found / not configured.
    """
    if not _configured():
        return None

    result = _supabase_request(
        "GET", "cg_jobs",
        params={"job_id": f"eq.{job_id}", "select": "*"},
    )
    if result and isinstance(result, list) and len(result) > 0:
        return result[0]
    return None


def list_jobs(limit: int = 20) -> list[dict[str, Any]]:
    """List recent jobs ordered by created_at DESC.

    Args:
        limit: Maximum number of jobs to return.

    Returns:
        List of job dicts (may be empty).
    """
    if not _configured():
        return []

    result = _supabase_request(
        "GET", "cg_jobs",
        params={
            "select": "*",
            "order": "created_at.desc",
            "limit": str(limit),
        },
    )
    if result and isinstance(result, list):
        return result
    return []


def delete_job(job_id: str) -> bool:
    """Delete a job and its cascaded action plans.

    Args:
        job_id: The job's unique identifier.

    Returns:
        True if the delete request succeeded, False otherwise.
    """
    if not _configured():
        return False

    result = _supabase_request(
        "DELETE", "cg_jobs",
        params={"job_id": f"eq.{job_id}"},
    )
    return result is not None or result == []


# ---------------------------------------------------------------------------
# cg_action_plans
# ---------------------------------------------------------------------------

def save_action_plan(
    job_id: str,
    action_plan_items: list[dict[str, Any]],
) -> Optional[list[dict[str, Any]]]:
    """Batch insert action plan rows into cg_action_plans.

    Splits into chunks of 100 rows per request to stay within
    Supabase REST API limits.

    Args:
        job_id: Parent job_id foreign key.
        action_plan_items: List of action plan row dicts from the analysis.

    Returns:
        List of inserted rows, or None on failure.
    """
    if not _configured() or not action_plan_items:
        return None

    rows: list[dict[str, Any]] = []
    for rank, item in enumerate(action_plan_items, 1):
        rows.append({
            "job_id": job_id,
            "rank": rank,
            "location": item.get("location") or item.get("Location", ""),
            "recommended_title": (
                item.get("recommended_title") or item.get("Best_Title", "")
            ),
            "recommended_category": (
                item.get("recommended_category") or item.get("Best_Category", "")
            ),
            "best_day": item.get("best_day") or item.get("Best_Day", ""),
            "decision": item.get("decision") or item.get("Decision", ""),
            "trigger_reason": (
                item.get("trigger_reason") or item.get("Trigger_Reason", "")
            ),
            "tier": item.get("tier") or item.get("Tier", 0),
            "est_d1_nr": item.get("est_d1_nr") or item.get("Est_D1_NR", 0),
            "est_lifetime_nr": (
                item.get("est_lifetime_nr") or item.get("Est_Lifetime_NR", 0)
            ),
            "multiplier_used": (
                item.get("multiplier_used") or item.get("multiplier", 0)
            ),
            "mult_source": item.get("mult_source") or item.get("Mult_Source", ""),
            "optimal_posts_per_week": (
                item.get("optimal_posts_per_week")
                or item.get("Optimal_Posts_Per_Week", 0)
            ),
        })

    all_inserted: list[dict[str, Any]] = []
    chunk_size = 100
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        result = _supabase_request("POST", "cg_action_plans", body=chunk)
        if result and isinstance(result, list):
            all_inserted.extend(result)

    return all_inserted if all_inserted else None


# ---------------------------------------------------------------------------
# cg_schedules
# ---------------------------------------------------------------------------

def save_schedule(
    schedule_id: str,
    job_id: str,
    cron_expression: str,
    webhook_url: Optional[str],
    next_run: Optional[str],
) -> Optional[dict[str, Any]]:
    """Persist a schedule record to cg_schedules.

    Args:
        schedule_id: Unique schedule identifier.
        job_id: Associated job_id.
        cron_expression: Cron string for the schedule.
        webhook_url: Optional webhook URL to POST results to.
        next_run: ISO timestamp of the next scheduled run.

    Returns:
        Inserted row dict, or None on failure.
    """
    if not _configured():
        return None

    row: dict[str, Any] = {
        "schedule_id": schedule_id,
        "job_id": job_id,
        "cron_expression": cron_expression,
        "webhook_url": webhook_url or "",
        "next_run": next_run,
        "status": "active",
    }

    result = _supabase_request("POST", "cg_schedules", body=row)
    if result and isinstance(result, list) and len(result) > 0:
        return result[0]
    return result


def delete_schedule(schedule_id: str) -> bool:
    """Remove a schedule record from cg_schedules.

    Args:
        schedule_id: The schedule's unique identifier.

    Returns:
        True if the request succeeded, False otherwise.
    """
    if not _configured():
        return False

    result = _supabase_request(
        "DELETE", "cg_schedules",
        params={"schedule_id": f"eq.{schedule_id}"},
    )
    return result is not None or result == []


# ---------------------------------------------------------------------------
# Nova data enrichment (cross-project queries)
# ---------------------------------------------------------------------------

def get_nova_enrichment(
    location: str,
    category: str,
) -> dict[str, Any]:
    """Query Nova's knowledge_base and channel_benchmarks for enrichment data.

    Fetches salary/demand data for the given location from Nova's knowledge_base
    table and CPA benchmarks for the category from Nova's channel_benchmarks table.
    Both tables live in the same Supabase project as the CG tables.

    Args:
        location: Location string (e.g. "Houston, TX").
        category: Job category string (e.g. "General Labor").

    Returns:
        Dict with keys: salary_range, demand_level, cpa_benchmark.
        Values default to None when data is unavailable.
    """
    enrichment: dict[str, Any] = {
        "salary_range": None,
        "demand_level": None,
        "cpa_benchmark": None,
    }

    if not _configured():
        return enrichment

    # --- knowledge_base: salary & demand for location ---
    try:
        # Use ilike for partial matching (e.g. "Houston" matches "Houston, TX")
        # Search for rows whose content mentions the location
        kb_result = _supabase_request(
            "GET",
            "knowledge_base",
            params={
                "select": "content,metadata",
                "or": (
                    f"(content.ilike.%{location}%,"
                    f"metadata->>location.ilike.%{location}%)"
                ),
                "limit": "5",
            },
        )
        if kb_result and isinstance(kb_result, list):
            for row in kb_result:
                content: str = row.get("content") or ""
                metadata: dict[str, Any] = row.get("metadata") or {}
                content_lower = content.lower()

                # Extract salary range from metadata or content
                if not enrichment["salary_range"]:
                    salary = metadata.get("salary_range") or metadata.get("salary")
                    if salary:
                        enrichment["salary_range"] = str(salary)
                    elif "salary" in content_lower or "$" in content:
                        # Store the content snippet as a salary hint
                        enrichment["salary_range"] = content[:200]

                # Extract demand level from metadata or content
                if not enrichment["demand_level"]:
                    demand = metadata.get("demand_level") or metadata.get("demand")
                    if demand:
                        enrichment["demand_level"] = str(demand)
                    elif "demand" in content_lower or "hiring" in content_lower:
                        enrichment["demand_level"] = content[:200]

    except urllib.error.HTTPError as exc:
        logger.warning(
            "Nova knowledge_base query failed (HTTP %d) for location=%s",
            exc.code, location,
        )
    except Exception:
        logger.warning(
            "Nova knowledge_base query failed for location=%s",
            location, exc_info=True,
        )

    # --- channel_benchmarks: CPA benchmark for category ---
    try:
        cb_result = _supabase_request(
            "GET",
            "channel_benchmarks",
            params={
                "select": "category,channel,cpa,cpc,conversion_rate",
                "category": f"ilike.%{category}%",
                "limit": "5",
            },
        )
        if cb_result and isinstance(cb_result, list) and len(cb_result) > 0:
            # Average the CPA values across matching rows
            cpa_values: list[float] = []
            for row in cb_result:
                cpa_val = row.get("cpa")
                if cpa_val is not None:
                    try:
                        cpa_values.append(float(cpa_val))
                    except (ValueError, TypeError):
                        pass
            if cpa_values:
                avg_cpa = sum(cpa_values) / len(cpa_values)
                enrichment["cpa_benchmark"] = round(avg_cpa, 2)

    except urllib.error.HTTPError as exc:
        logger.warning(
            "Nova channel_benchmarks query failed (HTTP %d) for category=%s",
            exc.code, category,
        )
    except Exception:
        logger.warning(
            "Nova channel_benchmarks query failed for category=%s",
            category, exc_info=True,
        )

    return enrichment


# ---------------------------------------------------------------------------
# cg_benchmarks -- Historical performance baselines
# ---------------------------------------------------------------------------

def save_benchmarks(
    benchmarks: list[dict[str, Any]],
    client_name: str = "default",
) -> int:
    """Upsert benchmark rows into cg_benchmarks.

    Each benchmark row represents aggregated historical performance for a
    location+title+category combo. On conflict (same client+location+title+category),
    the row is updated with the latest aggregated values.

    Args:
        benchmarks: List of dicts with keys: location, title, category,
            avg_nr, avg_gr, avg_profit_pct, avg_applies, avg_cost,
            avg_multiplier, sample_size, total_runs.
        client_name: Client identifier for multi-tenant support.

    Returns:
        Number of rows upserted.
    """
    if not _configured() or not benchmarks:
        return 0

    rows: list[dict[str, Any]] = []
    for b in benchmarks:
        rows.append({
            "client_name": client_name,
            "location": b.get("location", ""),
            "title": b.get("title", ""),
            "category": b.get("category", ""),
            "day_of_week": b.get("day_of_week"),
            "avg_nr": round(b.get("avg_nr", 0), 2),
            "avg_gr": round(b.get("avg_gr", 0), 2),
            "avg_profit_pct": round(b.get("avg_profit_pct", 0), 1),
            "avg_applies": round(b.get("avg_applies", 0), 2),
            "avg_cost": round(b.get("avg_cost", 0), 2),
            "avg_multiplier": round(b.get("avg_multiplier", 1.0), 3),
            "sample_size": b.get("sample_size", 0),
            "total_runs": b.get("total_runs", 0),
            "period": b.get("period", "all_time"),
            "last_updated": "now()",
        })

    upserted = 0
    chunk_size = 100
    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        result = _supabase_request(
            "POST", "cg_benchmarks",
            body=chunk,
            headers_extra={
                "Prefer": "return=representation,resolution=merge-duplicates",
            },
            params={"on_conflict": "client_name,location,title,category"},
        )
        if result and isinstance(result, list):
            upserted += len(result)

    logger.info("Benchmarks upserted: %d rows for client=%s", upserted, client_name)
    return upserted


def load_benchmarks(
    client_name: str = "default",
    locations: list[str] | None = None,
    limit: int = 5000,
) -> list[dict[str, Any]]:
    """Load benchmark rows from cg_benchmarks.

    Args:
        client_name: Client identifier.
        locations: Optional list of locations to filter by.
            If None, loads all benchmarks for the client.
        limit: Max rows to return.

    Returns:
        List of benchmark dicts.
    """
    if not _configured():
        return []

    params: dict[str, str] = {
        "select": "*",
        "client_name": f"eq.{client_name}",
        "order": "location.asc,avg_nr.desc",
        "limit": str(limit),
    }

    # Filter by locations if provided
    if locations:
        loc_filter = ",".join(locations)
        params["location"] = f"in.({loc_filter})"

    result = _supabase_request("GET", "cg_benchmarks", params=params)
    if result and isinstance(result, list):
        logger.info("Loaded %d benchmark rows for client=%s", len(result), client_name)
        return result
    return []


def get_benchmark_summary(
    client_name: str = "default",
) -> dict[str, Any]:
    """Get a summary of benchmarks for a client.

    Returns:
        Dict with total_locations, total_combos, avg_nr, avg_profit_pct,
        last_updated.
    """
    if not _configured():
        return {}

    result = _supabase_request(
        "GET", "cg_benchmarks",
        params={
            "select": "location,avg_nr,avg_profit_pct,last_updated",
            "client_name": f"eq.{client_name}",
            "order": "last_updated.desc",
            "limit": "5000",
        },
    )

    if not result or not isinstance(result, list) or len(result) == 0:
        return {}

    locations = set(r.get("location", "") for r in result)
    avg_nr_vals = [r.get("avg_nr", 0) for r in result if r.get("avg_nr")]
    avg_profit_vals = [r.get("avg_profit_pct", 0) for r in result if r.get("avg_profit_pct")]

    return {
        "total_locations": len(locations),
        "total_combos": len(result),
        "overall_avg_nr": round(sum(avg_nr_vals) / len(avg_nr_vals), 2) if avg_nr_vals else 0,
        "overall_avg_profit": round(sum(avg_profit_vals) / len(avg_profit_vals), 1) if avg_profit_vals else 0,
        "last_updated": result[0].get("last_updated", ""),
    }


def list_active_schedules() -> list[dict[str, Any]]:
    """Get all active schedules from cg_schedules.

    Returns:
        List of schedule dicts with status='active' (may be empty).
    """
    if not _configured():
        return []

    result = _supabase_request(
        "GET", "cg_schedules",
        params={
            "select": "*",
            "status": "eq.active",
            "order": "created_at.desc",
        },
    )
    if result and isinstance(result, list):
        return result
    return []


# ---------------------------------------------------------------------------
# cg_uploads -- Persist full analysis result for page-refresh survival
# ---------------------------------------------------------------------------
#
# -- SQL to create the table (run once in Supabase SQL editor):
#
# CREATE TABLE IF NOT EXISTS cg_uploads (
#     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
#     job_id TEXT UNIQUE NOT NULL,
#     filename TEXT DEFAULT '',
#     sell_cpa NUMERIC DEFAULT 1.20,
#     client_name TEXT DEFAULT '',
#     analysis_data JSONB NOT NULL DEFAULT '{}'::jsonb,
#     created_at TIMESTAMPTZ DEFAULT NOW()
# );
#
# ALTER TABLE cg_uploads ENABLE ROW LEVEL SECURITY;
# CREATE POLICY "Service role full access" ON cg_uploads FOR ALL
#   USING (auth.role() = 'service_role');


def save_upload_data(
    job_id: str,
    filename: str,
    sell_cpa: float,
    client_name: str,
    analysis_data: dict[str, Any],
) -> Optional[dict[str, Any]]:
    """Persist the full analysis JSON to cg_uploads for page-refresh survival.

    Args:
        job_id: UUID of the analysis job.
        filename: Original uploaded filename.
        sell_cpa: Revenue per apply used.
        client_name: Client name for multi-tenant support.
        analysis_data: The full analysis result dict (JSON-safe, no DataFrames).

    Returns:
        Inserted row dict, or None on failure.
    """
    if not _configured():
        return None

    row: dict[str, Any] = {
        "job_id": job_id,
        "filename": filename or "",
        "sell_cpa": sell_cpa,
        "client_name": client_name or "",
        "analysis_data": analysis_data,
    }

    result = _supabase_request("POST", "cg_uploads", body=row)
    if result and isinstance(result, list) and len(result) > 0:
        logger.info("Upload data persisted for job_id=%s", job_id)
        return result[0]
    return result


def get_latest_upload_data(
    client_name: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Retrieve the most recent upload record from cg_uploads.

    Args:
        client_name: Optional client filter. If None, returns the global latest.

    Returns:
        Dict with keys: job_id, filename, sell_cpa, client_name,
        analysis_data, created_at. Or None if nothing found.
    """
    if not _configured():
        return None

    params: dict[str, str] = {
        "select": "*",
        "order": "created_at.desc",
        "limit": "1",
    }
    if client_name:
        params["client_name"] = f"eq.{client_name}"

    result = _supabase_request("GET", "cg_uploads", params=params)
    if result and isinstance(result, list) and len(result) > 0:
        return result[0]
    return None


def delete_upload_data(job_id: str) -> bool:
    """Delete an upload record from cg_uploads.

    Args:
        job_id: The job's unique identifier.

    Returns:
        True if the request succeeded, False otherwise.
    """
    if not _configured():
        return False

    result = _supabase_request(
        "DELETE", "cg_uploads",
        params={"job_id": f"eq.{job_id}"},
    )
    return result is not None or result == []


def clear_all_upload_data() -> bool:
    """Delete ALL upload records from cg_uploads (clear data action).

    Returns:
        True if the request succeeded, False otherwise.
    """
    if not _configured():
        return False

    # Supabase REST requires a filter; use neq empty string to match all rows
    result = _supabase_request(
        "DELETE", "cg_uploads",
        params={"job_id": "neq."},
    )
    logger.info("Cleared all upload data from cg_uploads")
    return result is not None or result == []


# ---------------------------------------------------------------------------
# cg_sessions -- Track user sessions across uploads
# ---------------------------------------------------------------------------
#
# -- SQL to create (run once in Supabase SQL editor):
#
# CREATE TABLE IF NOT EXISTS cg_sessions (
#     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
#     session_id TEXT UNIQUE NOT NULL,
#     client_name TEXT DEFAULT '',
#     status TEXT DEFAULT 'active',
#     created_at TIMESTAMPTZ DEFAULT NOW(),
#     updated_at TIMESTAMPTZ DEFAULT NOW()
# );
# ALTER TABLE cg_sessions ENABLE ROW LEVEL SECURITY;
# CREATE POLICY "Service role full access" ON cg_sessions FOR ALL
#   USING (auth.role() = 'service_role');


def create_session(session_id: str, client_name: str = "") -> Optional[dict[str, Any]]:
    """Create a new session record.

    Args:
        session_id: Unique session identifier.
        client_name: Optional client name.

    Returns:
        Inserted row dict, or None on failure.
    """
    if not _configured():
        return None

    row: dict[str, Any] = {
        "session_id": session_id,
        "client_name": client_name or "",
        "status": "active",
    }
    result = _supabase_request("POST", "cg_sessions", body=row)
    if result and isinstance(result, list) and len(result) > 0:
        logger.info("Session created: %s", session_id)
        return result[0]
    return result


def get_session(session_id: str) -> Optional[dict[str, Any]]:
    """Retrieve a session by session_id.

    Args:
        session_id: The session's unique identifier.

    Returns:
        Session dict or None if not found.
    """
    if not _configured():
        return None

    result = _supabase_request(
        "GET", "cg_sessions",
        params={"session_id": f"eq.{session_id}", "select": "*"},
    )
    if result and isinstance(result, list) and len(result) > 0:
        return result[0]
    return None


# ---------------------------------------------------------------------------
# cg_daily_raw -- Normalised daily row data (one row per Post ID + Date)
# ---------------------------------------------------------------------------
#
# -- SQL to create (run once in Supabase SQL editor):
#
# CREATE TABLE IF NOT EXISTS cg_daily_raw (
#     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
#     session_id TEXT NOT NULL,
#     upload_id TEXT NOT NULL,
#     post_id TEXT NOT NULL,
#     date DATE NOT NULL,
#     location TEXT DEFAULT '',
#     title TEXT DEFAULT '',
#     category TEXT DEFAULT '',
#     template_type TEXT DEFAULT '',
#     media_cost NUMERIC DEFAULT 0,
#     impressions_cumul NUMERIC DEFAULT 0,
#     clicks_cumul NUMERIC DEFAULT 0,
#     applies_cumul NUMERIC DEFAULT 0,
#     daily_impressions NUMERIC DEFAULT 0,
#     daily_clicks NUMERIC DEFAULT 0,
#     daily_applies NUMERIC DEFAULT 0,
#     day_num INTEGER DEFAULT 1,
#     created_at TIMESTAMPTZ DEFAULT NOW(),
#     UNIQUE(session_id, post_id, date)
# );
# CREATE INDEX idx_cg_daily_raw_session ON cg_daily_raw(session_id);
# CREATE INDEX idx_cg_daily_raw_post ON cg_daily_raw(session_id, post_id);
# ALTER TABLE cg_daily_raw ENABLE ROW LEVEL SECURITY;
# CREATE POLICY "Service role full access" ON cg_daily_raw FOR ALL
#   USING (auth.role() = 'service_role');


def save_daily_raw_rows(
    session_id: str,
    upload_id: str,
    rows: list[dict[str, Any]],
) -> int:
    """Batch insert daily raw data rows into cg_daily_raw.

    Each row should contain: post_id, date, location, title, category,
    media_cost, impressions_cumul, clicks_cumul, applies_cumul, etc.

    Upserts on (session_id, post_id, date) to avoid duplicates.

    Args:
        session_id: Parent session identifier.
        upload_id: The upload that produced these rows.
        rows: List of daily data row dicts.

    Returns:
        Number of rows upserted.
    """
    if not _configured() or not rows:
        return 0

    db_rows: list[dict[str, Any]] = []
    for r in rows:
        db_rows.append({
            "session_id": session_id,
            "upload_id": upload_id,
            "post_id": str(r.get("post_id", r.get("Post ID", ""))),
            "date": str(r.get("date", r.get("Date", ""))),
            "location": str(r.get("location", r.get("Location", ""))),
            "title": str(r.get("title", r.get("Title", ""))),
            "category": str(r.get("category", r.get("Category", ""))),
            "template_type": str(r.get("template_type", r.get("Template Type", ""))),
            "media_cost": float(r.get("media_cost", r.get("Media_Cost", 0)) or 0),
            "impressions_cumul": float(r.get("impressions_cumul", r.get("Impressions_Cumul", 0)) or 0),
            "clicks_cumul": float(r.get("clicks_cumul", r.get("Clicks_Cumul", 0)) or 0),
            "applies_cumul": float(r.get("applies_cumul", r.get("Applies_Cumul", 0)) or 0),
            "daily_impressions": float(r.get("daily_impressions", r.get("Daily_Impressions", 0)) or 0),
            "daily_clicks": float(r.get("daily_clicks", r.get("Daily_Clicks", 0)) or 0),
            "daily_applies": float(r.get("daily_applies", r.get("Daily_Applies", 0)) or 0),
            "day_num": int(r.get("day_num", r.get("Day_Num", 1)) or 1),
        })

    upserted = 0
    chunk_size = 100
    for i in range(0, len(db_rows), chunk_size):
        chunk = db_rows[i : i + chunk_size]
        result = _supabase_request(
            "POST", "cg_daily_raw",
            body=chunk,
            headers_extra={
                "Prefer": "return=representation,resolution=merge-duplicates",
            },
            params={"on_conflict": "session_id,post_id,date"},
        )
        if result and isinstance(result, list):
            upserted += len(result)

    logger.info("Daily raw rows upserted: %d for session=%s upload=%s",
                upserted, session_id, upload_id)
    return upserted


def get_daily_raw_for_session(session_id: str) -> list[dict[str, Any]]:
    """Load all daily raw data rows for a session.

    Args:
        session_id: The session identifier.

    Returns:
        List of daily raw row dicts ordered by post_id, date.
    """
    if not _configured():
        return []

    all_rows: list[dict[str, Any]] = []
    offset = 0
    page_size = 1000

    while True:
        result = _supabase_request(
            "GET", "cg_daily_raw",
            params={
                "session_id": f"eq.{session_id}",
                "select": "*",
                "order": "post_id.asc,date.asc",
                "limit": str(page_size),
                "offset": str(offset),
            },
        )
        if not result or not isinstance(result, list) or len(result) == 0:
            break
        all_rows.extend(result)
        if len(result) < page_size:
            break
        offset += page_size

    logger.info("Loaded %d daily raw rows for session=%s", len(all_rows), session_id)
    return all_rows


def get_existing_post_ids(session_id: str) -> set[str]:
    """Get the set of Post IDs that already exist for a session.

    Args:
        session_id: The session identifier.

    Returns:
        Set of post_id strings.
    """
    if not _configured():
        return set()

    result = _supabase_request(
        "GET", "cg_daily_raw",
        params={
            "session_id": f"eq.{session_id}",
            "select": "post_id",
            "limit": "50000",
        },
    )
    if result and isinstance(result, list):
        return {r["post_id"] for r in result}
    return set()


def get_existing_post_date_pairs(session_id: str) -> set[tuple[str, str]]:
    """Get the set of (post_id, date) pairs that already exist.

    Args:
        session_id: The session identifier.

    Returns:
        Set of (post_id, date_str) tuples.
    """
    if not _configured():
        return set()

    all_pairs: set[tuple[str, str]] = set()
    offset = 0
    page_size = 5000

    while True:
        result = _supabase_request(
            "GET", "cg_daily_raw",
            params={
                "session_id": f"eq.{session_id}",
                "select": "post_id,date",
                "limit": str(page_size),
                "offset": str(offset),
            },
        )
        if not result or not isinstance(result, list) or len(result) == 0:
            break
        for r in result:
            all_pairs.add((str(r["post_id"]), str(r["date"])))
        if len(result) < page_size:
            break
        offset += page_size

    return all_pairs


def get_post_run_identity_map(session_id: str) -> list[dict[str, str]]:
    """Get identity info for fallback matching: d1_date + location + title + category.

    Returns list of dicts with post_id, d1_date, location, title, category
    where d1_date is the earliest date for that post_id.

    Args:
        session_id: The session identifier.

    Returns:
        List of post identity dicts.
    """
    if not _configured():
        return []

    # Get all distinct post_ids with their earliest date and identity fields
    result = _supabase_request(
        "GET", "cg_daily_raw",
        params={
            "session_id": f"eq.{session_id}",
            "select": "post_id,date,location,title,category",
            "order": "post_id.asc,date.asc",
            "limit": "50000",
        },
    )
    if not result or not isinstance(result, list):
        return []

    # Group by post_id, keep earliest row for each
    seen: dict[str, dict[str, str]] = {}
    for r in result:
        pid = str(r["post_id"])
        if pid not in seen:
            seen[pid] = {
                "post_id": pid,
                "d1_date": str(r["date"]),
                "location": str(r.get("location", "")).strip().lower(),
                "title": str(r.get("title", "")).strip().lower(),
                "category": str(r.get("category", "")).strip().lower(),
            }

    return list(seen.values())


def delete_session_data(session_id: str) -> bool:
    """Delete all daily raw data and session record for a session.

    Args:
        session_id: The session identifier.

    Returns:
        True if successful.
    """
    if not _configured():
        return False

    # Delete daily raw data
    _supabase_request(
        "DELETE", "cg_daily_raw",
        params={"session_id": f"eq.{session_id}"},
    )
    # Delete session record
    _supabase_request(
        "DELETE", "cg_sessions",
        params={"session_id": f"eq.{session_id}"},
    )
    logger.info("Deleted all data for session=%s", session_id)
    return True


# ---------------------------------------------------------------------------
# cg_upload_history -- Track each upload event with change summaries
# ---------------------------------------------------------------------------
#
# -- SQL to create (run once in Supabase SQL editor):
#
# CREATE TABLE IF NOT EXISTS cg_upload_history (
#     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
#     session_id TEXT NOT NULL,
#     upload_id TEXT UNIQUE NOT NULL,
#     upload_type TEXT DEFAULT 'fresh',
#     filename TEXT DEFAULT '',
#     date_range_from DATE,
#     date_range_to DATE,
#     row_count INTEGER DEFAULT 0,
#     posts_updated INTEGER DEFAULT 0,
#     new_posts INTEGER DEFAULT 0,
#     posts_ended INTEGER DEFAULT 0,
#     newly_repost INTEGER DEFAULT 0,
#     change_summary JSONB DEFAULT '{}'::jsonb,
#     created_at TIMESTAMPTZ DEFAULT NOW()
# );
# CREATE INDEX idx_cg_upload_history_session ON cg_upload_history(session_id);
# ALTER TABLE cg_upload_history ENABLE ROW LEVEL SECURITY;
# CREATE POLICY "Service role full access" ON cg_upload_history FOR ALL
#   USING (auth.role() = 'service_role');


def save_upload_history(
    session_id: str,
    upload_id: str,
    upload_type: str,
    filename: str,
    date_range_from: str,
    date_range_to: str,
    row_count: int,
    change_summary: dict[str, Any],
) -> Optional[dict[str, Any]]:
    """Record an upload event in the history table.

    Args:
        session_id: Parent session.
        upload_id: Unique upload identifier.
        upload_type: 'fresh' or 'daily'.
        filename: Original filename.
        date_range_from: Earliest date in the uploaded file.
        date_range_to: Latest date in the uploaded file.
        row_count: Number of rows in the uploaded file.
        change_summary: Dict with posts_updated, new_posts, ended, newly_repost.

    Returns:
        Inserted row dict, or None on failure.
    """
    if not _configured():
        return None

    row: dict[str, Any] = {
        "session_id": session_id,
        "upload_id": upload_id,
        "upload_type": upload_type,
        "filename": filename or "",
        "date_range_from": date_range_from,
        "date_range_to": date_range_to,
        "row_count": row_count,
        "posts_updated": change_summary.get("posts_updated", 0),
        "new_posts": change_summary.get("new_posts", 0),
        "posts_ended": change_summary.get("posts_ended", 0),
        "newly_repost": change_summary.get("newly_repost", 0),
        "change_summary": change_summary,
    }

    result = _supabase_request("POST", "cg_upload_history", body=row)
    if result and isinstance(result, list) and len(result) > 0:
        logger.info("Upload history saved: %s (type=%s)", upload_id, upload_type)
        return result[0]
    return result


def get_upload_history(session_id: str) -> list[dict[str, Any]]:
    """Get all upload history for a session, newest first.

    Args:
        session_id: The session identifier.

    Returns:
        List of upload history dicts.
    """
    if not _configured():
        return []

    result = _supabase_request(
        "GET", "cg_upload_history",
        params={
            "session_id": f"eq.{session_id}",
            "select": "*",
            "order": "created_at.desc",
            "limit": "100",
        },
    )
    if result and isinstance(result, list):
        return result
    return []
