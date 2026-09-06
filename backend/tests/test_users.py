def test_user_creation(db, make_user):
    user = make_user(google_id="g-100", email="a@example.com")
    assert user.id is not None
    assert user.email == "a@example.com"


def test_user_google_id_unique(db, make_user):
    from app.models.user import User
    import pytest
    from sqlalchemy.exc import IntegrityError

    make_user(google_id="dup-id", email="one@example.com")
    dup = User(google_id="dup-id", name="Dup", email="two@example.com")
    db.session.add(dup)
    with pytest.raises(IntegrityError):
        db.session.commit()
    db.session.rollback()


def test_me_requires_auth(client):
    resp = client.get("/api/users/me")
    assert resp.status_code == 401


def test_me_returns_profile_when_logged_in(client, make_user, login_as):
    user = make_user()
    login_as(user)
    resp = client.get("/api/users/me")
    assert resp.status_code == 200
    assert resp.get_json()["data"]["email"] == user.email


def test_user_registration_and_password_login(client, db):
    payload = {
        "name": "Karthik Raja",
        "username": "karthikr",
        "email": "karthik@example.com",
        "phone": "+919876543210",
        "password": "securepassword123",
    }
    resp = client.post("/api/auth/register", json=payload)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["success"] is True
    assert data["data"]["user"]["username"] == "karthikr"
    assert data["data"]["user"]["email"] == "karthik@example.com"
    assert data["data"]["user"]["phone"] == "+919876543210"

    # Verify duplicate username rejected
    dup_resp = client.post("/api/auth/register", json=payload)
    assert dup_resp.status_code == 409

    # Verify login
    login_resp = client.post("/api/auth/password", json={"username": "karthikr", "password": "securepassword123"})
    assert login_resp.status_code == 200
    assert login_resp.get_json()["data"]["authenticated"] is True

