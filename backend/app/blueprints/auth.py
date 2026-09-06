from flask import Blueprint, request, redirect, current_app, url_for
from flask_login import login_user, logout_user, current_user
from pydantic import ValidationError
from app.services import auth_service
from app.utils.responses import ok, fail
from app.extensions import db
from app.models.user import User
from app.utils.security import hash_password, verify_password

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

@bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username, password = (data.get("username") or "").strip(), data.get("password") or ""
    if len(username) < 3 or len(password) < 8:
        return fail("Username must be 3+ characters and password 8+ characters.", 422)
    if User.query.filter_by(username=username.lower()).first(): return fail("Username is already taken.", 409)
    user = User(username=username.lower(), name=username, email=(data.get("email") or f"{username.lower()}@local.tnone").strip().lower(), password_hash=hash_password(password))
    db.session.add(user); db.session.commit(); login_user(user, remember=True)
    return ok(data={"authenticated": True, "user": user.to_public_dict()}, status=201)

@bp.route("/password", methods=["POST"])
def password_login():
    data = request.get_json(silent=True) or {}
    user = User.query.filter_by(username=(data.get("username") or "").strip().lower()).first()
    if not user or not verify_password(data.get("password") or "", user.password_hash): return fail("Invalid username or password.", 401)
    login_user(user, remember=True)
    return ok(data={"authenticated": True, "user": user.to_public_dict()})


@bp.route("/login")
def login():
    redirect_uri = current_app.config["GOOGLE_REDIRECT_URI"]
    return auth_service.get_google_authorize_redirect(redirect_uri)


@bp.route("/callback")
def callback():
    try:
        user = auth_service.handle_google_callback()
    except Exception:
        current_app.logger.exception("Google OAuth callback failed")
        return fail("Google sign-in failed. Please try again.", 401)

    login_user(user, remember=True)
    frontend_origin = current_app.config.get("FRONTEND_ORIGIN", "/")
    return redirect(f"{frontend_origin}/index.html")


@bp.route("/logout", methods=["POST"])
def logout():
    logout_user()
    return ok(message="Logged out successfully.")


@bp.route("/status")
def status():
    if current_user.is_authenticated:
        return ok(data={"authenticated": True, "user": current_user.to_public_dict()})
    return ok(data={"authenticated": False})
