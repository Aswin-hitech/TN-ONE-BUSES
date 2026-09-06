import pytest
from app import create_app
from app.extensions import db as _db


@pytest.fixture()
def app():
    app = create_app("testing")
    with app.app_context():
        _db.create_all()
        yield app
        _db.session.remove()
        _db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def db(app):
    return _db


@pytest.fixture()
def make_user(db):
    from app.models.user import User

    def _make(google_id="g-1", name="Test User", email="test@example.com"):
        user = User(google_id=google_id, name=name, email=email)
        db.session.add(user)
        db.session.commit()
        return user

    return _make


@pytest.fixture()
def login_as(client):
    """Log the given user into the Flask test client's session (flask-login)."""
    def _login(user):
        with client.session_transaction() as sess:
            sess["_user_id"] = str(user.id)
            sess["_fresh"] = True
        return user

    return _login
