import logging
from flask import Flask, jsonify, request, session
from pydantic import ValidationError

from app.config import get_config, ProductionConfig
from app.extensions import db, migrate, login_manager, limiter, cors
from app.utils.security import csrf_token, security_log, validate_csrf_request

_UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
_PHOTO_UPLOAD_PATH = "/api/buses/photos"


def create_app(config_name: str = None):
    import os
    config_name = config_name or os.environ.get("FLASK_ENV", "development")

    # Hard-fail at startup if production is misconfigured
    if config_name == "production":
        ProductionConfig._validate()

    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

    if app.config.get("TRUST_PROXY"):
        from werkzeug.middleware.proxy_fix import ProxyFix

        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    _init_extensions(app)
    _register_blueprints(app)
    _register_error_handlers(app)

    return app


def _init_extensions(app):
    db.init_app(app)
    migrate.init_app(app, db)

    login_manager.init_app(app)
    # "strong" session protection ties the session to the client's IP/user-agent
    # fingerprint, which is desirable in production but breaks test clients and
    # some legitimate mobile-network IP changes; "basic" still invalidates
    # stale/hijacked-looking sessions without that fragility.
    login_manager.session_protection = "basic"

    @login_manager.user_loader
    def load_user(user_id):
        from app.models.user import User
        return db.session.get(User, int(user_id))

    limiter.init_app(app)

    origins = [
        origin.strip()
        for origin in (app.config.get("FRONTEND_ORIGIN") or "").split(",")
        if origin.strip()
    ] or ["http://localhost:8080"]
    cors.init_app(
        app,
        resources={
            r"/api/*": {
                "origins": origins,
                "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Accept", "X-CSRF-Token", "X-CSRFToken"],
                "supports_credentials": True,
                "max_age": 600,
            }
        },
    )

    @app.before_request
    def guard_unsafe_requests():
        """Reject oversized JSON bodies and enforce double-submit CSRF."""
        if not request.path.startswith("/api/"):
            return None
        if request.method not in _UNSAFE_METHODS:
            return None

        if request.path != _PHOTO_UPLOAD_PATH:
            max_bytes = app.config.get("MAX_JSON_PAYLOAD_BYTES", 512 * 1024)
            if (request.content_length or 0) > max_bytes:
                security_log("payload_too_large", path=request.path, ip=request.remote_addr)
                return jsonify({
                    "success": False,
                    "error": "Request body is too large.",
                    "code": "payload_too_large",
                }), 413

        if app.config.get("CSRF_ENABLED", True) and not validate_csrf_request():
            security_log("csrf_rejected", path=request.path, ip=request.remote_addr)
            return jsonify({
                "success": False,
                "error": "Your session token is missing or expired. Please refresh the page and try again.",
                "code": "csrf_failed",
            }), 403

        return None

    # Security headers on every response
    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
        response.headers["Cross-Origin-Resource-Policy"] = "same-site"

        if request.is_secure:
            response.headers["Strict-Transport-Security"] = (
                "max-age=63072000; includeSubDomains; preload"
            )

        # Inline scripts were removed from the HTML; template/style inline is
        # still required by the static renderer.
        upgrade = (
            " upgrade-insecure-requests;"
            if app.config.get("SESSION_COOKIE_SECURE")
            else ""
        )
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' https://unpkg.com https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://fonts.googleapis.com; "
            "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.openstreetmap.org https://*.googleusercontent.com https://static.vecteezy.com; "
            "connect-src 'self' https://nominatim.openstreetmap.org https://routing.openstreetmap.de https://*.neon.tech https://accounts.google.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "frame-src 'none'; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self' https://accounts.google.com; "
            "frame-ancestors 'none';" + upgrade
        )

        if request.path.startswith("/api/auth/") or request.path == "/api/users/me":
            response.headers["Cache-Control"] = "no-store"
            response.headers["Pragma"] = "no-cache"

        # Expose the CSRF token as a non-HttpOnly cookie for the double-submit
        # check. It is only issued once a server-side token exists.
        token = session.get("_csrf_token")
        if token and request.path.startswith("/api/"):
            response.set_cookie(
                app.config.get("CSRF_COOKIE_NAME", "tn_csrf"),
                token,
                max_age=int(app.config.get("PERMANENT_SESSION_LIFETIME").total_seconds()),
                secure=bool(app.config.get("SESSION_COOKIE_SECURE")),
                httponly=False,
                samesite="Lax",
                path="/",
            )

        return response

    if not app.config.get("TESTING"):
        from app.services.auth_service import init_oauth
        init_oauth(app)

    if not app.debug and not app.testing:
        logging.basicConfig(level=logging.INFO)


def _register_blueprints(app):
    from app.blueprints import auth, users, buses, stops, routes, reports, search, change_requests

    app.register_blueprint(auth.bp)
    app.register_blueprint(users.bp)
    app.register_blueprint(buses.bp)
    app.register_blueprint(stops.bp)
    app.register_blueprint(routes.bp)
    app.register_blueprint(reports.bp)
    app.register_blueprint(search.bp)
    app.register_blueprint(change_requests.bp)

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})


def _register_error_handlers(app):
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"success": False, "error": "Resource not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"success": False, "error": "Method not allowed."}), 405

    @app.errorhandler(413)
    def payload_too_large(e):
        return jsonify({
            "success": False,
            "error": "The uploaded data is too large.",
            "code": "payload_too_large",
        }), 413

    @app.errorhandler(429)
    def rate_limited(e):
        return jsonify({"success": False, "error": "Too many requests. Please slow down."}), 429

    @app.errorhandler(ValidationError)
    def validation_error(e):
        return jsonify({"success": False, "error": "Invalid input."}), 422

    @app.errorhandler(500)
    def server_error(e):
        app.logger.exception("Unhandled server error")
        return jsonify({"success": False, "error": "Something went wrong. Please try again."}), 500
