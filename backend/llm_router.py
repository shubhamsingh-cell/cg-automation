"""Multi-LLM router: free providers first, Claude Haiku as paid fallback.

Routing order: Gemini Flash -> Groq -> Cerebras -> Claude Haiku.
Each provider has an 8-second timeout. Skips providers without API keys.
Uses stdlib urllib.request only (no third-party SDKs for free providers).
"""

import json
import logging
import os
import urllib.request
import urllib.error
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Environment keys
# ---------------------------------------------------------------------------
GEMINI_API_KEY: str = os.environ.get("GEMINI_API_KEY", "")
GROQ_API_KEY: str = os.environ.get("GROQ_API_KEY", "")
CEREBRAS_API_KEY: str = os.environ.get("CEREBRAS_API_KEY", "")
SAMBANOVA_API_KEY: str = os.environ.get("SAMBANOVA_API_KEY", "")
MISTRAL_API_KEY: str = os.environ.get("MISTRAL_API_KEY", "")
TOGETHER_API_KEY: str = os.environ.get("TOGETHER_API_KEY", "")
OPENROUTER_API_KEY: str = os.environ.get("OPENROUTER_API_KEY", "")
ANTHROPIC_API_KEY: str = os.environ.get("ANTHROPIC_API_KEY", "")

_TIMEOUT_SECONDS: int = 8
_MAX_TOKENS: int = 200


# ---------------------------------------------------------------------------
# Provider helpers
# ---------------------------------------------------------------------------

def _call_gemini(system_prompt: str, user_prompt: str) -> Optional[str]:
    """Call Google Gemini 3 Flash via REST API.

    NOTE (S50): Upgraded from "gemini-3.1-flash-preview" -- which never resolved
    in v1beta and was silently 404'ing for the entire life of CG Automation --
    to "gemini-3-flash-preview" (verified working in talent-crm @ df08565).
    Falls back through Groq/Cerebras/etc on failure (see _PROVIDERS list).
    """
    if not GEMINI_API_KEY:
        logger.debug("Gemini skipped: no GEMINI_API_KEY")
        return None

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        f"models/gemini-3-flash-preview:generateContent?key={GEMINI_API_KEY}"
    )
    combined_prompt = f"{system_prompt}\n\n{user_prompt}"
    payload = json.dumps({
        "contents": [{"parts": [{"text": combined_prompt}]}],
        "generationConfig": {"maxOutputTokens": _MAX_TOKENS},
    }).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode())
        text = body["candidates"][0]["content"]["parts"][0]["text"]
        return text.strip()
    except Exception as exc:
        logger.warning("Gemini call failed: %s", exc)
        return None


def _call_groq(system_prompt: str, user_prompt: str) -> Optional[str]:
    """Call Groq (Llama 3.3 70B) via OpenAI-compatible API."""
    if not GROQ_API_KEY:
        logger.debug("Groq skipped: no GROQ_API_KEY")
        return None

    url = "https://api.groq.com/openai/v1/chat/completions"
    payload = json.dumps({
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": _MAX_TOKENS,
    }).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {GROQ_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode())
        text = body["choices"][0]["message"]["content"]
        return text.strip()
    except Exception as exc:
        logger.warning("Groq call failed: %s", exc)
        return None


def _call_cerebras(system_prompt: str, user_prompt: str) -> Optional[str]:
    """Call Cerebras (Llama 3.3 70B) via OpenAI-compatible API."""
    if not CEREBRAS_API_KEY:
        logger.debug("Cerebras skipped: no CEREBRAS_API_KEY")
        return None

    url = "https://api.cerebras.ai/v1/chat/completions"
    payload = json.dumps({
        "model": "llama-3.3-70b",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": _MAX_TOKENS,
    }).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {CEREBRAS_API_KEY}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode())
        text = body["choices"][0]["message"]["content"]
        return text.strip()
    except Exception as exc:
        logger.warning("Cerebras call failed: %s", exc)
        return None


def _call_openai_compat(
    name: str, url: str, api_key: str, model: str,
    system_prompt: str, user_prompt: str,
) -> Optional[str]:
    """Generic OpenAI-compatible API caller (works for SambaNova, Mistral, Together, OpenRouter)."""
    if not api_key:
        return None
    payload = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": _MAX_TOKENS,
    }).encode()
    req = urllib.request.Request(
        url, data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode())
        return body["choices"][0]["message"]["content"].strip()
    except Exception as exc:
        logger.warning("%s call failed: %s", name, exc)
        return None


def _call_sambanova(system_prompt: str, user_prompt: str) -> Optional[str]:
    """SambaNova (Llama 3.3 70B) -- free tier."""
    return _call_openai_compat(
        "SambaNova", "https://api.sambanova.ai/v1/chat/completions",
        SAMBANOVA_API_KEY, "Meta-Llama-3.3-70B-Instruct", system_prompt, user_prompt,
    )


def _call_mistral(system_prompt: str, user_prompt: str) -> Optional[str]:
    """Mistral (Mistral Small) -- free tier."""
    return _call_openai_compat(
        "Mistral", "https://api.mistral.ai/v1/chat/completions",
        MISTRAL_API_KEY, "mistral-small-latest", system_prompt, user_prompt,
    )


def _call_together(system_prompt: str, user_prompt: str) -> Optional[str]:
    """Together AI (Llama 3.3 70B) -- free tier."""
    return _call_openai_compat(
        "Together", "https://api.together.xyz/v1/chat/completions",
        TOGETHER_API_KEY, "meta-llama/Llama-3.3-70B-Instruct-Turbo", system_prompt, user_prompt,
    )


def _call_openrouter(system_prompt: str, user_prompt: str) -> Optional[str]:
    """OpenRouter (free model rotation)."""
    return _call_openai_compat(
        "OpenRouter", "https://openrouter.ai/api/v1/chat/completions",
        OPENROUTER_API_KEY, "meta-llama/llama-3.3-70b-instruct:free", system_prompt, user_prompt,
    )


def _call_claude_haiku(system_prompt: str, user_prompt: str) -> Optional[str]:
    """Call Claude Haiku via the Anthropic REST API (stdlib only)."""
    if not ANTHROPIC_API_KEY:
        logger.debug("Claude Haiku skipped: no ANTHROPIC_API_KEY")
        return None

    url = "https://api.anthropic.com/v1/messages"
    payload = json.dumps({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": _MAX_TOKENS,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }).encode()

    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            body = json.loads(resp.read().decode())
        text = body["content"][0]["text"]
        return text.strip()
    except Exception as exc:
        logger.warning("Claude Haiku call failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

_PROVIDERS: list[tuple[str, callable]] = [
    ("gemini-3-flash-preview", _call_gemini),
    ("groq-llama-3.3-70b", _call_groq),
    ("cerebras-llama-3.3-70b", _call_cerebras),
    ("sambanova-llama-3.3-70b", _call_sambanova),
    ("mistral-small", _call_mistral),
    ("together-llama-3.3-70b", _call_together),
    ("openrouter-llama-3.3-70b", _call_openrouter),
    ("claude-haiku", _call_claude_haiku),
]


def generate_insight(system_prompt: str, user_prompt: str) -> str:
    """Try free LLMs first, fall back to Claude Haiku.

    Order: Gemini Flash -> Groq -> Cerebras -> Claude Haiku.
    Each provider has an 8s timeout. If one fails, tries the next.

    Args:
        system_prompt: System-level instruction for the LLM.
        user_prompt: User-level content for the LLM.

    Returns:
        The generated insight text, or empty string on total failure.
    """
    for provider_name, call_fn in _PROVIDERS:
        result = call_fn(system_prompt, user_prompt)
        if result:
            logger.info("Insight generated via %s", provider_name)
            return result
        logger.debug("Provider %s returned no result, trying next", provider_name)

    logger.error("All LLM providers failed to generate insight")
    return ""


def normalize_title(raw_title: str) -> str:
    """Normalize a messy Craigslist title using Gemini 3.1 Flash Lite.

    Strips special characters, fixes casing, removes spam markers ($$$, !!!),
    and returns a clean standardized title for better matching.

    Falls back to basic string cleanup if LLM is unavailable.

    Args:
        raw_title: Raw title string from Craigslist export.

    Returns:
        Cleaned, normalized title string.
    """
    # Quick basic cleanup (always runs, no LLM needed)
    import re
    cleaned = raw_title.strip()
    # Remove common spam patterns
    cleaned = re.sub(r'[\$!*#@^&]+', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    # Fix ALL CAPS
    if cleaned == cleaned.upper() and len(cleaned) > 3:
        cleaned = cleaned.title()

    # If very short or already clean, skip LLM
    if len(cleaned) < 5 or not GEMINI_API_KEY:
        return cleaned

    # Try Gemini 3.1 Flash Lite for smart normalization (S50, May 2026): Google
    # has shipped "gemini-3.1-flash-lite-preview" since the earlier 404 (originally
    # the model ID didn't resolve, fixed temporarily to gemini-2.5-flash-lite, now
    # back on the latest free lite tier). Pairs with _call_gemini's
    # gemini-3-flash-preview for the latest free Gemini stack.
    try:
        url = (
            "https://generativelanguage.googleapis.com/v1beta/"
            f"models/gemini-3.1-flash-lite-preview:generateContent?key={GEMINI_API_KEY}"
        )
        prompt = (
            f"Normalize this Craigslist job title to a clean, standard format. "
            f"Fix capitalization, remove spam characters, keep the core job description. "
            f"Return ONLY the cleaned title, nothing else.\n\n"
            f"Input: {raw_title}\nOutput:"
        )
        payload = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": 50},
        }).encode()

        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = json.loads(resp.read().decode())
        result = body["candidates"][0]["content"]["parts"][0]["text"].strip()
        # Sanity check: result should be reasonable length
        if 3 < len(result) < 200:
            return result
    except Exception as exc:
        logger.debug("Title normalization LLM failed: %s", exc)

    return cleaned


def batch_normalize_titles(titles: list[str], max_batch: int = 20) -> dict[str, str]:
    """Normalize a batch of titles. Returns {original: normalized} mapping.

    Only normalizes titles that look messy (ALL CAPS, special chars, etc.).

    Args:
        titles: List of raw title strings.
        max_batch: Maximum number of titles to LLM-normalize (to control cost/time).

    Returns:
        Dict mapping original title to normalized title.
    """
    import re
    result: dict[str, str] = {}
    llm_queue: list[str] = []

    for title in titles:
        clean = title.strip()
        if not clean:
            result[title] = clean
            continue

        # Check if title needs LLM normalization
        needs_llm = (
            clean == clean.upper() and len(clean) > 5  # ALL CAPS
            or bool(re.search(r'[\$!*#]{2,}', clean))  # Spam chars
            or len(clean) > 80  # Excessively long
        )

        if needs_llm and len(llm_queue) < max_batch:
            llm_queue.append(title)
        else:
            # Basic cleanup only
            basic = re.sub(r'[\$!*#@^&]+', '', clean)
            basic = re.sub(r'\s+', ' ', basic).strip()
            if basic == basic.upper() and len(basic) > 3:
                basic = basic.title()
            result[title] = basic

    # Process LLM queue
    for title in llm_queue:
        result[title] = normalize_title(title)

    return result
