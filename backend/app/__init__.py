import logging
from flask import Flask, jsonify
from pydantic import ValidationError

from app.config import get_config
from app.extensions import db, migrate, login_manager, limiter, cors


def create_app(config_name: str = None):
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))

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

    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config.get("FRONTEND_ORIGIN") or "http://localhost:8080"}},
        supports_credentials=True,
    )

    # Security headers on every response
    @app.after_request
    def set_security_headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Allow Nominatim + OSM in CSP (needed by frontend maps)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://unpkg.com https://cdn.jsdelivr.net https://fonts.googleapis.com; "
            "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.openstreetmap.org https://static.vecteezy.com; "
            "connect-src 'self' https://nominatim.openstreetmap.org https://routing.openstreetmap.de https://*.neon.tech; "
            "font-src 'self' https://fonts.gstatic.com;"
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
