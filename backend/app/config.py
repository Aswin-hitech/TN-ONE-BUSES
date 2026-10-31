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
    # Leave empty to derive https://<current-host>/api/auth/callback at request
    # time. Set explicitly only if Google Console uses a different host.
    GOOGLE_REDIRECT_URI = _env("GOOGLE_REDIRECT_URI", "")
    GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"

    # --- Proxy / TLS ---
    TRUST_PROXY = _env("TRUST_PROXY", "false").lower() == "true"

    # --- Session / cookies ---
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _env("SESSION_COOKIE_SECURE", "false").lower() == "true"
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SAMESITE = "Lax"
    REMEMBER_COOKIE_SECURE = SESSION_COOKIE_SECURE
    REMEMBER_COOKIE_DURATION = timedelta(days=30)

    # --- CSRF (double-submit token) ---
    CSRF_ENABLED = _env("CSRF_ENABLED", "true").lower() == "true"
    CSRF_COOKIE_NAME = "tn_csrf"
    CSRF_HEADER_NAME = "X-CSRF-Token"

    # --- Request size limits ---
    MAX_CONTENT_LENGTH = 48 * 1024 * 1024  # photo uploads (8 x 5 MB + form overhead)
    MAX_JSON_PAYLOAD_BYTES = 512 * 1024

    # --- CORS ---
    FRONTEND_ORIGIN = _env("FRONTEND_ORIGIN", "http://localhost:8080")

    # --- Rate limiting ---
    RATELIMIT_STORAGE_URI = _env("RATELIMIT_STORAGE_URI", "memory://")
    RATELIMIT_HEADERS_ENABLED = True
    PREFERRED_URL_SCHEME = "http"
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
    CSRF_ENABLED = False
    RATELIMIT_ENABLED = False


class ProductionConfig(BaseConfig):
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True
    PREFERRED_URL_SCHEME = "https"
    # Deployed behind Vercel's proxy, which terminates TLS.
    TRUST_PROXY = _env("TRUST_PROXY", "true").lower() == "true"

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

        # CORS/redirect origins must be TLS and never a local dev host in prod.
        origins = [
            origin.strip()
            for origin in (os.environ.get("FRONTEND_ORIGIN") or "").split(",")
            if origin.strip()
        ]
        for origin in origins:
            lowered = origin.lower()
            if not lowered.startswith("https://") or "localhost" in lowered or "127.0.0.1" in lowered:
                raise RuntimeError(
                    "FATAL: FRONTEND_ORIGIN must be an https:// origin in production "
                    f"(got {origin!r})."
                )

        redirect_uri = (os.environ.get("GOOGLE_REDIRECT_URI") or "").strip()
        if redirect_uri and not redirect_uri.lower().startswith("https://"):
            raise RuntimeError(
                "FATAL: GOOGLE_REDIRECT_URI must use https:// in production."
            )

        if (os.environ.get("RATELIMIT_STORAGE_URI") or "memory://").startswith("memory://"):
            import warnings

            warnings.warn(
                "RATELIMIT_STORAGE_URI uses in-memory storage. On serverless/multi-instance "
                "deployments rate limits are not shared. Configure Redis/Upstash for production.",
                RuntimeWarning,
                stacklevel=2,
            )


CONFIG_MAP = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(name: str = None):
    name = name or os.environ.get("FLASK_ENV", "development")
    return CONFIG_MAP.get(name, DevelopmentConfig)
