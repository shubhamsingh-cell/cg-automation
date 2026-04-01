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
-- ALTER TABLE cg_jobs ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE cg_action_plans ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE cg_schedules ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "Service role full access" ON cg_jobs FOR ALL USING (auth.role() = 'service_role');
-- CREATE POLICY "Service role full access" ON cg_action_plans FOR ALL USING (auth.role() = 'service_role');
-- CREATE POLICY "Service role full access" ON cg_schedules FOR ALL USING (auth.role() = 'service_role');
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
_SUPABASE_KEY: str = os.environ.get("SUPABASE_SERVICE_KEY") or ""


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
