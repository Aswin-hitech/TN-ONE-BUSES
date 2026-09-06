"""
Application configuration loaded from environment variables.
Never hard-code secrets here.
"""
import os
from datetime import timedelta


def _env(name: str, default=None, required: bool = False):
    value = os.environ.get(name, default)
    if required and not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


class BaseConfig:
    # --- Core / secrets ---
    SECRET_KEY = _env("SECRET_KEY", "dev-secret-key-change-me")

    # --- Database ---
    SQLALCHEMY_DATABASE_URI = _env(
        "DATABASE_URL",
        "sqlite:///dev.db",
    )
    # Neon (and most managed Postgres) require SSL; normalize scheme for SQLAlchemy 2.x
    if SQLALCHEMY_DATABASE_URI and SQLALCHEMY_DATABASE_URI.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace(
            "postgres://", "postgresql+psycopg2://", 1
        )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
    }

    # --- Google OAuth ---
    GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = _env("GOOGLE_CLIENT_SECRET", "")
    GOOGLE_REDIRECT_URI = _env("GOOGLE_REDIRECT_URI", "http://localhost:5000/api/auth/callback")
    GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"

    # --- Session / cookies ---
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _env("SESSION_COOKIE_SECURE", "false").lower() == "true"
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)

    # --- CORS ---
    FRONTEND_ORIGIN = _env("FRONTEND_ORIGIN", "http://localhost:8080")

    # --- Rate limiting ---
    RATELIMIT_STORAGE_URI = _env("RATELIMIT_STORAGE_URI", "memory://")
    SUPABASE_URL = _env("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = _env("SUPABASE_SERVICE_KEY", "")
    SUPABASE_BUCKET = _env("SUPABASE_BUCKET", "bus-photos")

    # --- Misc ---
    JSON_SORT_KEYS = False
    DEBUG = False
    TESTING = False


class DevelopmentConfig(BaseConfig):
    DEBUG = True


class TestingConfig(BaseConfig):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False


class ProductionConfig(BaseConfig):
    DEBUG = False
    SESSION_COOKIE_SECURE = True


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(name: str = None):
    name = name or os.environ.get("FLASK_ENV", "development")
    return CONFIG_MAP.get(name, DevelopmentConfig)
