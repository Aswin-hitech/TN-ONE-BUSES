"""
Google OAuth 2.0 / OpenID Connect handling.

Design: the backend never trusts a client-supplied identity. It exchanges
the OAuth authorization code with Google itself, verifies the returned ID
token's signature and claims, and only then creates/updates the local user
record and establishes a server-side session (flask-login).
"""
from authlib.integrations.flask_client import OAuth
from flask import current_app
from urllib.parse import urlparse
import re
import secrets
from app.extensions import db
from app.models.user import User
from app.utils.validators import sanitize_text

oauth = OAuth()
_google_client_registered = False


def init_oauth(app):
    global _google_client_registered
    oauth.init_app(app)
    if not _google_client_registered:
        oauth.register(
            name="google",
            client_id=app.config["GOOGLE_CLIENT_ID"],
            client_secret=app.config["GOOGLE_CLIENT_SECRET"],
            server_metadata_url=app.config["GOOGLE_DISCOVERY_URL"],
            # PKCE protects the authorization code even for confidential clients.
            client_kwargs={
                "scope": "openid email profile",
                "code_challenge_method": "S256",
            },
        )
        _google_client_registered = True
    return oauth


def get_google_authorize_redirect(redirect_uri: str, **kwargs):
    return oauth.google.authorize_redirect(redirect_uri, **kwargs)


def _unique_username(email: str) -> str:
    base = re.sub(r"[^a-z0-9_.]", "", (email.split("@")[0] or "").lower())[:40] or "rider"
    if len(base) < 3:
        base = f"{base}_rider"
    candidate = base
    suffix = 1
    while User.query.filter_by(username=candidate).first():
        candidate = f"{base}{suffix}"
        suffix += 1
        if suffix > 10000:
            candidate = f"{base}_{secrets.token_hex(4)}"
            break
    return candidate[:80]


def _safe_picture_url(raw):
    """Only persist https profile images hosted by Google."""
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    if not value or len(value) > 1024:
        return None
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or not host:
        return None
    if host == "googleusercontent.com" or host.endswith(".googleusercontent.com"):
        return value
    if host == "google.com" or host.endswith(".google.com"):
        return value
    return None


def handle_google_callback() -> User:
    """
    Complete the OAuth code exchange, verify the ID token, and return the
    corresponding local User (creating or updating it as needed).
    Raises ValueError on verification failure.
    """
    token = oauth.google.authorize_access_token()
    userinfo = token.get("userinfo")
    if not userinfo:
        # Fall back to parsing the verified ID token claims directly.
        userinfo = oauth.google.parse_id_token(token, nonce=None)

    if not userinfo or not userinfo.get("sub") or not userinfo.get("email"):
        raise ValueError("Google authentication failed: incomplete profile.")

    # Fail closed: only accept a profile when Google explicitly confirms the
    # email is verified. A missing claim must never be treated as verified.
    if userinfo.get("email_verified") is not True:
        raise ValueError("Google account email is not verified.")

    google_id = str(userinfo["sub"])[:64]
    email = sanitize_text(str(userinfo["email"]), max_length=255).lower()
    if not email:
        raise ValueError("Google authentication failed: invalid email.")

    raw_name = sanitize_text(userinfo.get("name") or email.split("@")[0], max_length=255)
    name = raw_name or email.split("@")[0][:255]
    picture = _safe_picture_url(userinfo.get("picture"))

    user = User.query.filter_by(google_id=google_id).first()
    if user is None:
        # Fall back to email for pre-existing password accounts. Google has
        # verified ownership of this address, so linking is safe.
        user = User.query.filter_by(email=email).first()

    if user is None:
        user = User(
            google_id=google_id,
            name=name,
            email=email,
            username=_unique_username(email),
            profile_picture=picture,
        )
        db.session.add(user)
    else:
        # Never allow one account to be silently re-linked to a different
        # Google identity.
        if user.google_id and user.google_id != google_id:
            raise ValueError("This email is already linked to a different Google account.")
        user.google_id = google_id
        user.name = name
        user.profile_picture = picture

    db.session.commit()
    return user
