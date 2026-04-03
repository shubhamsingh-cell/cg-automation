"""Lightweight geocoding module for CG Automation.

Uses the Google Maps Geocoding API to convert Craigslist location strings
(e.g. "san francisco", "denver") into lat/lng coordinates.  Designed for
the 397-location CG dataset with rate limiting and thread safety.

Auth: GOOGLE_MAPS_API_KEY env var.  Falls back gracefully when unset.
Dependencies: stdlib only.
"""

from __future__ import annotations

import json
import logging
import os
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
_BATCH_DELAY_S = 0.05  # 50 ms between requests (stays under 50 QPS)
_REQUEST_TIMEOUT_S = 15

_lock = threading.Lock()
_ssl_ctx = ssl.create_default_context()

# In-memory cache: address_lower -> geocode result dict
_cache: dict[str, dict[str, Any]] = {}
_cache_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def is_configured() -> bool:
    """Return True if GOOGLE_MAPS_API_KEY is set and non-empty."""
    return bool(os.environ.get("GOOGLE_MAPS_API_KEY"))


def _get_api_key() -> Optional[str]:
    """Return the Google Maps API key from environment, or None."""
    return os.environ.get("GOOGLE_MAPS_API_KEY") or None


def _maps_get(params: dict[str, str]) -> Optional[dict]:
    """Make an authenticated GET to the Geocoding API.

    Returns parsed JSON or None on failure.
    """
    api_key = _get_api_key()
    if not api_key:
        logger.warning("GOOGLE_MAPS_API_KEY not set -- geocoding disabled")
        return None

    params["key"] = api_key
    full_url = f"{_GEOCODE_URL}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(full_url)

    try:
        with urllib.request.urlopen(req, context=_ssl_ctx, timeout=_REQUEST_TIMEOUT_S) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        status = data.get("status") or ""
        if status not in ("OK", "ZERO_RESULTS"):
            logger.error("Geocoding API error: %s", data.get("error_message") or status)
            return None
        return data
    except urllib.error.HTTPError as exc:
        logger.error("Geocoding HTTP %d", exc.code, exc_info=True)
        return None
    except (urllib.error.URLError, json.JSONDecodeError, OSError) as exc:
        logger.error("Geocoding request failed: %s", exc, exc_info=True)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def geocode_address(address: str) -> dict[str, Any]:
    """Convert a single address string to lat/lng coordinates.

    Args:
        address: Human-readable location (e.g. "san francisco" or "Denver, CO").

    Returns:
        Dict with location, lat, lng, formatted_address.
        Contains 'error' key on failure.
    """
    if not address or not address.strip():
        return {"error": "address is required"}

    clean = address.strip()
    cache_key = clean.lower()

    # Check cache first
    with _cache_lock:
        if cache_key in _cache:
            return _cache[cache_key]

    data = _maps_get({"address": clean})
    if not data:
        return {"error": "geocoding request failed", "location": clean}

    results = data.get("results") or []
    if not results:
        return {"error": "no results found", "location": clean}

    geo = results[0].get("geometry", {}).get("location", {})
    result: dict[str, Any] = {
        "location": clean,
        "lat": geo.get("lat"),
        "lng": geo.get("lng"),
        "formatted_address": results[0].get("formatted_address") or "",
    }

    # Store in cache
    with _cache_lock:
        _cache[cache_key] = result

    return result


def batch_geocode(addresses: list[str]) -> list[dict[str, Any]]:
    """Geocode multiple addresses with rate limiting.

    Designed for CG Automation's 397-location dataset.  Thread-safe
    with 50 ms delay between API calls (stays under 50 QPS).

    Args:
        addresses: List of location strings to geocode.

    Returns:
        List of geocode result dicts (one per input, in order).
        Failed lookups include an 'error' key.
    """
    if not addresses:
        return []

    if not is_configured():
        logger.warning("batch_geocode: GOOGLE_MAPS_API_KEY not set, returning empty results")
        return [{"error": "API key not configured", "location": a} for a in addresses]

    results: list[dict[str, Any]] = []
    total = len(addresses)
    succeeded = 0
    failed = 0

    with _lock:
        for idx, addr in enumerate(addresses):
            if not addr or not str(addr).strip():
                results.append({"error": "empty address", "index": idx})
                failed += 1
                continue
            try:
                result = geocode_address(str(addr))
                results.append(result)
                if "error" in result:
                    failed += 1
                else:
                    succeeded += 1
            except Exception as exc:
                logger.error(
                    "batch_geocode[%d/%d] '%s': %s", idx + 1, total, addr, exc,
                    exc_info=True,
                )
                results.append({"error": str(exc), "location": str(addr)})
                failed += 1

            # Rate limit: 50 ms between requests (skip for cached hits)
            if idx < total - 1:
                time.sleep(_BATCH_DELAY_S)

            if (idx + 1) % 50 == 0:
                logger.info("batch_geocode: %d/%d (ok=%d, fail=%d)", idx + 1, total, succeeded, failed)

    logger.info("batch_geocode complete: %d total, %d ok, %d fail", total, succeeded, failed)
    return results
