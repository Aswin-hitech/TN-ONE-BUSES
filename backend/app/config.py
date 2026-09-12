"""
Application configuration loaded from environment variables.
Never hard-code secrets here.
"""
import os
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv

# Automatically load .env from backend/ or project root
_base_dir = Path(__file__).resolve().parent.parent
load_dotenv(_base_dir / ".env")
load_dotenv(_base_dir.parent / ".env")


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
    if SQLALCHEMY_DATABASE_URI:
        if SQLALCHEMY_DATABASE_URI.startswith("postgres://"):
            SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace(
                "postgres://", "postgresql+psycopg2://", 1
            )
        elif SQLALCHEMY_DATABASE_URI.startswith("postgresql://") and not SQLALCHEMY_DATABASE_URI.startswith("postgresql+"):
            SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace(
                "postgresql://", "postgresql+psycopg2://", 1
            )

        # Neon connection optimization: if using Neon endpoint, ensure endpoint option is set if needed
        if "neon.tech" in SQLALCHEMY_DATABASE_URI and "options=endpoint" not in SQLALCHEMY_DATABASE_URI:
            try:
                from urllib.parse import urlparse
                parsed_uri = urlparse(SQLALCHEMY_DATABASE_URI)
                if parsed_uri.hostname:
                    endpoint_id = parsed_uri.hostname.split(".")[0]
                    delimiter = "&" if "?" in SQLALCHEMY_DATABASE_URI else "?"
                    SQLALCHEMY_DATABASE_URI += f"{delimiter}options=endpoint%3D{endpoint_id}"
            except Exception:
                pass

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

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)

    @classmethod
    def _validate(cls):
        """Called at app startup to hard-fail on unsafe production config."""
        _WEAK_KEYS = {
            "",
            "dev-secret-key-change-me",
            "change-this-to-a-long-random-string",
        }
        secret = os.environ.get("SECRET_KEY", "")
        if not secret or secret in _WEAK_KEYS or len(secret) < 32:
            raise RuntimeError(
                "FATAL: SECRET_KEY is missing or insecure. "
                "Set a strong random SECRET_KEY (>= 32 chars) in your environment variables. "
                "Generate one with: python -c \"import secrets; print(secrets.token_hex(64))\""
            )
        if not os.environ.get("DATABASE_URL"):
            raise RuntimeError(
                "FATAL: DATABASE_URL is not set. "
                "Set a valid PostgreSQL connection string in your environment variables."
            )


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(name: str = None):
    name = name or os.environ.get("FLASK_ENV", "development")
    return CONFIG_MAP.get(name, DevelopmentConfig)
