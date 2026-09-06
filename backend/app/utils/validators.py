"""
Shared, framework-agnostic validation/sanitization helpers.
"""
import re
import bleach

_WHITESPACE_RE = re.compile(r"\s+")


def sanitize_text(value: str, max_length: int = None) -> str:
    """Strip HTML/script content and collapse whitespace from user-supplied text."""
    if value is None:
        return value
    cleaned = bleach.clean(value, tags=[], attributes={}, strip=True)
    cleaned = _WHITESPACE_RE.sub(" ", cleaned).strip()
    if max_length:
        cleaned = cleaned[:max_length]
    return cleaned


def is_blank(value: str) -> bool:
    return value is None or value.strip() == ""


def validate_non_empty(value: str, field_name: str) -> str:
    if is_blank(value):
        raise ValueError(f"{field_name} cannot be empty.")
    return value.strip()
