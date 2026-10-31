"""
Shared, framework-agnostic validation/sanitization helpers.

Every user-controlled string that reaches the database should pass through
one of these helpers so HTML/script payloads, control characters, and
unbounded lengths are stripped before storage and rendering.
"""
import json
import math
import re

import bleach

_WHITESPACE_RE = re.compile(r"\s+")
_HUMAN_SPOT_RE = re.compile(
    r"^(.*?)(?:\s+[@\-–]\s+|\s*\()\s*(\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?)\)?\s*$",
    re.I,
)

MAX_SPOTS = 200
MAX_SPOTS_JSON = 64 * 1024
MAX_TIMINGS = 50
MAX_TIMING_LENGTH = 32


def sanitize_text(value: str, max_length: int = None) -> str:
    """Strip HTML/script content and collapse whitespace from user-supplied text."""
    if value is None:
        return value
    cleaned = bleach.clean(str(value), tags=[], attributes={}, strip=True)
    cleaned = _WHITESPACE_RE.sub(" ", cleaned).strip()
    if max_length:
        cleaned = cleaned[:max_length]
    return cleaned


def clean_text(value, max_length: int = 255):
    """Return a sanitized string or None when the input is blank."""
    if value is None:
        return None
    if not isinstance(value, (str, int, float)):
        return None
    cleaned = sanitize_text(str(value), max_length=max_length)
    return cleaned or None


def clean_multiline_text(value, max_length: int = 2000):
    """Sanitize text that may legitimately contain separators/newlines."""
    if value is None:
        return None
    cleaned = bleach.clean(str(value), tags=[], attributes={}, strip=True)
    cleaned = _WHITESPACE_RE.sub(" ", cleaned).strip()
    return cleaned[:max_length] or None


def bounded_float(value, min_value=None, max_value=None):
    """Parse a finite float inside [min_value, max_value], else return None."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    if min_value is not None and number < min_value:
        return None
    if max_value is not None and number > max_value:
        return None
    return number


def _format_time(value):
    from app.models.bus import format_time_ampm

    return format_time_ampm(value)


def _parse_human_spots(text: str) -> list:
    """Parse formats like ``Stop @ 06:20 AM`` or ``Stop (06:20)``."""
    parsed = []
    for chunk in re.split(r"[\r\n;]+|,(?=\s*[A-Za-z])", text):
        part = chunk.strip()
        if not part:
            continue
        match = _HUMAN_SPOT_RE.match(part)
        if match:
            parsed.append({"stop": match.group(1).strip(), "time": match.group(2)})
        else:
            parsed.append({"stop": part.strip("() "), "time": ""})
    return parsed


def normalize_spots(raw) -> list:
    """
    Normalize any accepted spots shape (JSON string, human text, list of
    dicts/strings) into a bounded list of ``{"stop", "time"}`` dicts.
    Duplicate stop names are dropped case-insensitively.
    """
    if raw is None:
        return []

    if isinstance(raw, str):
        text = raw.strip()
        if not text or len(text) > MAX_SPOTS_JSON:
            return []
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = _parse_human_spots(text)
        raw = parsed

    if not isinstance(raw, list):
        return []

    cleaned = []
    seen = set()
    for item in raw[:MAX_SPOTS]:
        if isinstance(item, dict):
            name = item.get("stop") or item.get("stop_name") or item.get("name") or ""
            time_value = item.get("time") or item.get("timing") or ""
        elif isinstance(item, (str, int, float)):
            name, time_value = item, ""
        else:
            continue

        name = sanitize_text(str(name), max_length=255)
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)

        timing = sanitize_text(str(time_value), max_length=MAX_TIMING_LENGTH)
        cleaned.append({"stop": name, "time": _format_time(timing) if timing else ""})

    return cleaned


def normalize_timings(value, max_length: int = 500):
    """Normalize comma/semicolon/newline separated trip timings to AM/PM form."""
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        parts = [str(v) for v in value]
    elif isinstance(value, str):
        parts = re.split(r"[,;\n]+", value)
    else:
        return None

    cleaned = []
    seen = set()
    for part in parts:
        text = sanitize_text(str(part), max_length=MAX_TIMING_LENGTH)
        if not text:
            continue
        text = _format_time(text)
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
        if len(cleaned) >= MAX_TIMINGS:
            break

    joined = ", ".join(cleaned)
    return joined[:max_length] or None


def is_blank(value: str) -> bool:
    return value is None or value.strip() == ""


def validate_non_empty(value: str, field_name: str) -> str:
    if is_blank(value):
        raise ValueError(f"{field_name} cannot be empty.")
    return value.strip()
