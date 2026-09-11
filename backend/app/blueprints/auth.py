from flask import Blueprint, request, redirect, current_app, url_for
from flask_login import login_user, logout_user, current_user
from pydantic import ValidationError
from app.services import auth_service
from app.utils.responses import ok, fail
from app.extensions import db, limiter
from app.models.user import User
from app.utils.security import hash_password, verify_password
from app.utils.validators import sanitize_text
import re

_EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
_PHONE_REGEX = re.compile(r"^\+?[0-9\s\-()]{7,20}$")

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@bp.route("/register", methods=["POST"])
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
    if len(password) < 6:
        return fail("Password must be at least 6 characters.", 422)
    if len(password) > 128:
        return fail("Password cannot exceed 128 characters.", 422)

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
        login_user(user, remember=True)
        return ok(data={"authenticated": True, "user": user.to_public_dict()}, message="Registration successful!", status=201)
    except Exception as e:
        db.session.rollback()
        current_app.logger.exception("Registration database error")
        return fail("Could not complete registration. Please try again.", 500)

@bp.route("/password", methods=["POST"])
@limiter.limit("20 per minute")
def password_login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    if not username or not password:
        return fail("Please enter both username and password.", 422)

    try:
        user = User.query.filter_by(username=username).first()
        if not user or not verify_password(password, user.password_hash):
            return fail("Invalid username or password.", 401)
        login_user(user, remember=True)
        return ok(data={"authenticated": True, "user": user.to_public_dict()})
    except Exception as e:
        current_app.logger.exception("Login error")
        return fail("Login failed. Please try again.", 500)


def _frontend_url(path: str = "") -> str:
    origin = (current_app.config.get("FRONTEND_ORIGIN") or "").strip().rstrip("/")
    normalized_path = "/" + path.lstrip("/") if path else "/"
    return f"{origin}{normalized_path}" if origin else normalized_path


@bp.route("/login")
def login():
    client_id = current_app.config.get("GOOGLE_CLIENT_ID")
    client_secret = current_app.config.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        return redirect(_frontend_url("/login?error=oauth_not_configured"))

    redirect_uri = current_app.config["GOOGLE_REDIRECT_URI"]
    return auth_service.get_google_authorize_redirect(redirect_uri)


@bp.route("/callback")
def callback():
    try:
        user = auth_service.handle_google_callback()
    except Exception as e:
        current_app.logger.exception("Google OAuth callback failed")
        return redirect(_frontend_url("/login?error=oauth_failed"))

    login_user(user, remember=True)
    return redirect(_frontend_url("/"))



@bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    return ok(message="Logged out successfully.")


@bp.route("/status")
def status():
    if current_user.is_authenticated:
        return ok(data={"authenticated": True, "user": current_user.to_public_dict()})
    return ok(data={"authenticated": False})
