from flask import Blueprint, request, redirect, current_app, url_for, session
from flask_login import logout_user, current_user
from app.services import auth_service
from app.utils.responses import ok, fail
from app.extensions import db, limiter
from app.models.user import User
from app.utils.security import (
    csrf_token,
    establish_session,
    hash_password,
    password_hash_needs_rehash,
    security_log,
    validate_password,
    verify_password,
)
from app.utils.validators import sanitize_text
import os
import re

_EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
_PHONE_REGEX = re.compile(r"^\+?[0-9\s\-()]{7,20}$")
_LOCAL_PATH = re.compile(r"^/(?!/)")

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@bp.route("/csrf", methods=["GET"])
def csrf():
    """Issue a per-session CSRF token for state-changing requests."""
    return ok(data={"csrf_token": csrf_token()})


@bp.route("/register", methods=["POST"])
@limiter.limit("5 per minute")
@limiter.limit("15 per hour")
def register():
    data = request.get_json(silent=True) or {}
    name = sanitize_text(data.get("name") or "", max_length=100)
    username = sanitize_text(data.get("username") or "", max_length=50).lower().replace(" ", "")
    email = sanitize_text(data.get("email") or "", max_length=120).lower().replace(" ", "")
    phone = sanitize_text(data.get("phone") or "", max_length=20)
    password = data.get("password") or ""

    if not name or len(name) < 2:
        return fail("Please enter your full name (at least 2 characters).", 422)
    if not username or len(username) < 3:
        return fail("Username must be at least 3 characters.", 422)
    if not email or not _EMAIL_REGEX.match(email):
        return fail("Please enter a valid email address.", 422)
    if not phone or not _PHONE_REGEX.match(phone):
        return fail("Please enter a valid phone number.", 422)

    password_error = validate_password(password, username=username, email=email)
    if password_error:
        return fail(password_error, 422)

    try:
        if User.query.filter_by(username=username).first():
            return fail("Username is already taken. Please choose another.", 409)
        if User.query.filter_by(email=email).first():
            return fail("An account with this email already exists.", 409)

        user = User(
            username=username,
            name=name,
            email=email,
            phone=phone,
            password_hash=hash_password(password)
        )
        db.session.add(user)
        db.session.commit()
        establish_session(user)
        security_log("register_success", level="info", user_id=user.id, ip=request.remote_addr)
        return ok(data={"authenticated": True, "user": user.to_public_dict()}, message="Registration successful!", status=201)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Registration database error")
        return fail("Could not complete registration. Please try again.", 500)


@bp.route("/password", methods=["POST"])
@limiter.limit("10 per minute")
@limiter.limit("50 per hour")
def password_login():
    data = request.get_json(silent=True) or {}
    username = sanitize_text(data.get("username") or "", max_length=50).lower()
    password = data.get("password") or ""

    if not username or not password:
        return fail("Please enter both username and password.", 422)
    if not isinstance(password, str) or len(password) > 128:
        return fail("Invalid username or password.", 401)

    try:
        user = User.query.filter_by(username=username).first()
        # verify_password performs a dummy hash comparison for unknown users,
        # keeping the failure response time consistent.
        if not verify_password(password, user.password_hash if user else None) or not user:
            security_log("login_failed", username=username, ip=request.remote_addr)
            return fail("Invalid username or password.", 401)

        if password_hash_needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
            db.session.commit()

        establish_session(user)
        security_log("login_success", level="info", user_id=user.id, ip=request.remote_addr)
        return ok(data={"authenticated": True, "user": user.to_public_dict()})
    except Exception:
        current_app.logger.exception("Login error")
        return fail("Login failed. Please try again.", 500)


def _safe_next(raw) -> str:
    """Only allow same-site relative paths as post-login destinations."""
    if not raw or not isinstance(raw, str):
        return "/"
    path = raw.strip()
    if len(path) > 2000 or "\x00" in path:
        return "/"
    if not _LOCAL_PATH.match(path):
        return "/"
    if "\\" in path or any(ord(ch) < 32 for ch in path):
        return "/"
    if re.match(r"^/(login|register)(/|\?|#|$)", path, re.I):
        return "/"
    return path


def _frontend_url(path: str = "") -> str:
    # When FRONTEND_ORIGIN is not configured, redirect relative so the app
    # works on whatever host serves the API (Vercel, localhost, previews).
    origin = (os.environ.get("FRONTEND_ORIGIN") or "").strip().rstrip("/")
    normalized_path = "/" + path.lstrip("/") if path else "/"
    return f"{origin}{normalized_path}" if origin else normalized_path


def _google_configured() -> bool:
    return bool(
        (current_app.config.get("GOOGLE_CLIENT_ID") or "").strip()
        and (current_app.config.get("GOOGLE_CLIENT_SECRET") or "").strip()
    )


@bp.route("/config")
def auth_config():
    """Public capability probe used to show/hide the Google button."""
    return ok(data={"google_enabled": _google_configured(), "password_login": True})


@bp.route("/login")
@limiter.limit("30 per minute")
def login():
    if not _google_configured():
        return redirect(_frontend_url("/login?error=oauth_not_configured"))

    next_path = _safe_next(request.args.get("next") or request.args.get("redirect"))
    # Start from a clean session so a pre-set cookie cannot fixate the OAuth flow.
    session.clear()
    session["oauth_next"] = next_path

    redirect_uri = (current_app.config.get("GOOGLE_REDIRECT_URI") or "").strip()
    if not redirect_uri:
        redirect_uri = url_for("auth.callback", _external=True)

    return auth_service.get_google_authorize_redirect(redirect_uri, prompt="select_account")


@bp.route("/callback")
@limiter.limit("30 per minute")
def callback():
    next_path = _safe_next(session.pop("oauth_next", "/"))
    try:
        user = auth_service.handle_google_callback()
    except Exception:
        session.clear()
        security_log("oauth_callback_failed", ip=request.remote_addr)
        current_app.logger.exception("Google OAuth callback failed")
        return redirect(_frontend_url("/login?error=oauth_failed"))

    establish_session(user)
    security_log("oauth_login_success", level="info", user_id=user.id, ip=request.remote_addr)
    return redirect(_frontend_url(next_path))


@bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    session.clear()
    return ok(message="Logged out successfully.")


@bp.route("/status")
def status():
    if current_user.is_authenticated:
        return ok(data={"authenticated": True, "user": current_user.to_public_dict()})
    return ok(data={"authenticated": False})
