"""
Google OAuth 2.0 / OpenID Connect handling.

Design: the backend never trusts a client-supplied identity. It exchanges
the OAuth authorization code with Google itself, verifies the returned ID
token's signature and claims, and only then creates/updates the local user
record and establishes a server-side session (flask-login).
"""
from authlib.integrations.flask_client import OAuth
from flask import current_app
from app.extensions import db
from app.models.user import User

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
            client_kwargs={"scope": "openid email profile"},
        )
        _google_client_registered = True
    return oauth


def get_google_authorize_redirect(redirect_uri: str):
    return oauth.google.authorize_redirect(redirect_uri)


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

    if not userinfo.get("email_verified", True):
        raise ValueError("Google account email is not verified.")

    google_id = userinfo["sub"]
    email = userinfo["email"]
    name = userinfo.get("name") or email.split("@")[0]
    picture = userinfo.get("picture")

    user = User.query.filter_by(google_id=google_id).first()
    if user is None:
        # An account with this email but a different google_id should not
        # silently merge — but for MVP simplicity we treat google_id as the
        # source of truth and fall back to email lookup for pre-existing rows.
        user = User.query.filter_by(email=email).first()

    if user is None:
        user = User(google_id=google_id, name=name, email=email, username=email.split("@")[0].lower(), profile_picture=picture)
        db.session.add(user)
    else:
        user.google_id = google_id
        user.name = name
        user.profile_picture = picture

    db.session.commit()
    return user
