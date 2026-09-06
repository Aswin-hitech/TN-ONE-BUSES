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
