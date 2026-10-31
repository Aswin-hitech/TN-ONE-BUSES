"""
Auth/session security helpers. Never trust client-supplied user identity —
the authenticated user is always derived from the server-side session
(flask-login) or a verified Google ID token, never from a request body
field like `user_id`.
"""
import hmac
import logging
import re
import secrets
from functools import lru_cache, wraps
from typing import Optional

from flask import current_app, jsonify, request, session
from flask_login import current_user, login_user
from werkzeug.security import check_password_hash, generate_password_hash

# Explicit parameters instead of relying on a library default that can change
# between releases. scrypt is memory-hard and resists GPU/ASIC cracking.
PASSWORD_HASH_METHOD = "scrypt:32768:8:1"
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

_SAFE_LOG_RE = re.compile(r"[^A-Za-z0-9_.@+\-]")

_COMMON_PASSWORDS = {
    "12345678",
    "123456789",
    "1234567890",
    "password",
    "password1",
    "password123",
    "qwerty123",
    "qwertyuiop",
    "letmein1",
    "iloveyou",
    "admin123",
    "welcome1",
    "abc12345",
    "changeme",
    "busbusbus",
}


@lru_cache(maxsize=1)
def _dummy_password_hash():
    """A real hash used to keep failed-login timing consistent for unknown users."""
    return generate_password_hash(secrets.token_urlsafe(32), method=PASSWORD_HASH_METHOD)


def validate_password(password, username: str = "", email: str = "") -> Optional[str]:
    """Return a user-safe error message, or None when the password is strong enough."""
    if not isinstance(password, str):
        return "Password must be text."
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Password must be at least {PASSWORD_MIN_LENGTH} characters."
    if len(password) > PASSWORD_MAX_LENGTH:
        return f"Password cannot exceed {PASSWORD_MAX_LENGTH} characters."

    lowered = password.lower()
    if lowered in _COMMON_PASSWORDS:
        return "This password is too common. Please choose a stronger one."
    if len(set(password)) == 1:
        return "Password must use more than one repeated character."

    username = (username or "").strip().lower()
    if len(username) >= 3 and username in lowered:
        return "Password must not contain your username."
    email_local = (email or "").split("@")[0].strip().lower()
    if len(email_local) >= 3 and email_local in lowered:
        return "Password must not contain your email name."

    return None


def hash_password(password: str) -> str:
    return generate_password_hash(password, method=PASSWORD_HASH_METHOD)


def verify_password(password, password_hash) -> bool:
    """
    Verify a password in constant-ish time. Unknown accounts still perform a
    real hash comparison so response timing does not reveal whether a username
    exists.
    """
    if not isinstance(password, str) or not password:
        return False
    if not password_hash:
        check_password_hash(_dummy_password_hash(), password)
        return False
    try:
        return bool(check_password_hash(password_hash, password))
    except (ValueError, TypeError):
        return False


def password_hash_needs_rehash(password_hash) -> bool:
    """True when a stored hash uses an older/weaker parameter set."""
    if not password_hash:
        return False
    return not str(password_hash).startswith(f"{PASSWORD_HASH_METHOD}$")


def establish_session(user, remember: bool = True):
    """
    Log a user in with a fresh session. Clearing first prevents session
    fixation: any pre-authentication data (including an attacker-supplied
    session cookie) is discarded before the authenticated identity is set.
    """
    session.clear()
    login_user(user, remember=remember, fresh=True)
    session.permanent = True
    return user


def csrf_token() -> str:
    token = session.get("_csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


def validate_csrf_request() -> bool:
    """Double-submit check: header token must match the server session token."""
    expected = session.get("_csrf_token")
    header_name = current_app.config.get("CSRF_HEADER_NAME", "X-CSRF-Token")
    supplied = request.headers.get(header_name) or request.headers.get("X-CSRFToken")
    if not expected or not supplied:
        return False
    return hmac.compare_digest(str(expected), str(supplied))


def security_log(event: str, level: str = "warning", **fields):
    """
    Structured security logging. Values are scrubbed so logs cannot be
    poisoned with newlines/control characters or oversized attacker input.
    Never pass passwords, tokens, or full request bodies here.
    """
    try:
        safe_fields = {}
        for key, value in fields.items():
            text = _SAFE_LOG_RE.sub("", str(value))[:120]
            safe_fields[key] = text
        logger = current_app.logger
        logger.log(
            getattr(logging, level.upper(), logging.WARNING),
            "security.%s %s",
            _SAFE_LOG_RE.sub("", str(event))[:60],
            " ".join(f"{k}={v}" for k, v in safe_fields.items()),
        )
    except Exception:
        # Logging must never break a request.
        pass


def login_required_json(view_func):
    """
    Like flask_login.login_required, but returns a clean JSON 401 instead of
    redirecting to a login page (this is a JSON API, not server-rendered).
    """
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({"success": False, "error": "Authentication required."}), 401
        return view_func(*args, **kwargs)
    return wrapped
