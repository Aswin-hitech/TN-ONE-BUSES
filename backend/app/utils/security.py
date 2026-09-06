"""
Auth/session security helpers. Never trust client-supplied user identity —
the authenticated user is always derived from the server-side session
(flask-login) or a verified Google ID token, never from a request body
field like `user_id`.
"""
from functools import wraps
from flask import jsonify
from flask_login import current_user
from werkzeug.security import generate_password_hash, check_password_hash

def hash_password(password):
    return generate_password_hash(password)

def verify_password(password, password_hash):
    return bool(password_hash) and check_password_hash(password_hash, password)


def login_required_json(view_func):
    """
    Like flask_login.login_required, but returns a clean JSON 401 instead of
    redirecting to a login page (this is a JSON API, not server-rendered).
    """
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({"error": "Authentication required."}), 401
        return view_func(*args, **kwargs)
    return wrapped
