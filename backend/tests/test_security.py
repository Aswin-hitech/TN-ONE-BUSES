import pytest

from app.models.user import User


def _register(client, password="securepassword123", username="karthikr", email="karthik@example.com"):
    return client.post(
        "/api/auth/register",
        json={
            "name": "Karthik Raja",
            "username": username,
            "email": email,
            "phone": "+919876543210",
            "password": password,
        },
    )


def test_register_rejects_short_password(client, db):
    resp = _register(client, password="short12")
    assert resp.status_code == 422
    assert User.query.count() == 0


def test_register_rejects_common_password(client, db):
    resp = _register(client, password="password123")
    assert resp.status_code == 422
    assert User.query.count() == 0


def test_registered_password_is_scrypt_hashed(client, db):
    resp = _register(client)
    assert resp.status_code == 201
    user = User.query.filter_by(username="karthikr").first()
    assert user.password_hash.startswith("scrypt:")
    assert "securepassword123" not in user.password_hash


def test_password_login_rotates_and_clears_prior_session(client, db):
    assert _register(client).status_code == 201
    with client.session_transaction() as sess:
        sess["attacker_preload"] = "should-be-cleared"

    login = client.post(
        "/api/auth/password",
        json={"username": "karthikr", "password": "securepassword123"},
    )
    assert login.status_code == 200

    with client.session_transaction() as sess:
        assert "attacker_preload" not in sess
        assert sess.get("_user_id") is not None


def test_csrf_required_for_stale_state_changes(app, client):
    app.config["CSRF_ENABLED"] = True

    blocked = client.post("/api/auth/logout")
    assert blocked.status_code == 403
    assert blocked.get_json()["code"] == "csrf_failed"

    token_resp = client.get("/api/auth/csrf")
    assert token_resp.status_code == 200
    token = token_resp.get_json()["data"]["csrf_token"]
    assert token

    allowed = client.post("/api/auth/logout", headers={"X-CSRF-Token": token})
    assert allowed.status_code == 200


def test_change_request_sanitizes_and_bounds_payload(client, make_user, login_as, db):
    owner = make_user(google_id="owner-1", email="owner@example.com")
    contributor = make_user(google_id="contributor-1", email="contributor@example.com")

    login_as(owner)
    created = client.post(
        "/api/buses",
        json={"bus_name": "Bound Bus", "start_stop": "A", "destination_stop": "B"},
    )
    assert created.status_code == 201
    bus_id = created.get_json()["data"]["id"]

    login_as(contributor)
    spots = [{"stop": f"Stop {i}", "time": "06:00 AM"} for i in range(300)]
    resp = client.post(
        "/api/change-requests",
        json={
            "bus_id": bus_id,
            "bus_name": "<img src=x onerror=alert(1)>Safe Name",
            "bus_fare": 12,
            "spots": spots,
            "is_admin": True,
        },
    )
    assert resp.status_code == 201
    data = resp.get_json()["data"]
    assert data["auto_applied"] is False
    payload = data["change_request"]["payload"]
    assert payload["bus_name"] == "Safe Name"
    assert payload["bus_fare"] == 12.0
    assert len(payload["spots"]) <= 200
    assert "is_admin" not in payload


def test_route_rewrite_requires_owner(client, make_user, login_as, db):
    owner = make_user(google_id="route-owner", email="route-owner@example.com")
    other = make_user(google_id="route-other", email="route-other@example.com")

    login_as(owner)
    created = client.post(
        "/api/buses",
        json={"bus_name": "Owned Route", "start_stop": "A", "destination_stop": "B"},
    )
    bus_id = created.get_json()["data"]["id"]

    login_as(other)
    resp = client.post(
        "/api/routes",
        json={
            "bus_id": bus_id,
            "route_name": "Hijacked",
            "stops": [
                {"stop_name": "Hijack A", "stop_order": 0},
                {"stop_name": "Hijack B", "stop_order": 1},
            ],
        },
    )
    assert resp.status_code == 403


def test_upload_detects_images_from_bytes_not_headers():
    from app.blueprints.buses import _detect_image

    assert _detect_image(b"\x89PNG\r\n\x1a\n" + b"0" * 16) == ("image/png", "png")
    assert _detect_image(b"\xff\xd8\xff\xe0" + b"0" * 16) == ("image/jpeg", "jpg")
    assert _detect_image(b"RIFF0000WEBP" + b"0" * 16) == ("image/webp", "webp")
    assert _detect_image(b"<svg onload=alert(1)>") == (None, None)
    assert _detect_image(b"not an image at all") == (None, None)


def test_oauth_fails_closed_when_email_verified_missing(app, monkeypatch):
    from app.services import auth_service

    class FakeGoogle:
        def authorize_access_token(self):
            return {
                "userinfo": {
                    "sub": "google-123",
                    "email": "unverified@example.com",
                    "name": "Unverified",
                }
            }

    monkeypatch.setattr(auth_service.oauth, "google", FakeGoogle(), raising=False)
    with pytest.raises(ValueError):
        auth_service.handle_google_callback()


def test_oauth_picture_url_must_be_google_https():
    from app.services.auth_service import _safe_picture_url

    assert _safe_picture_url("http://lh3.googleusercontent.com/a") is None
    assert _safe_picture_url("https://evil.example.com/a.png") is None
    assert _safe_picture_url("javascript:alert(1)") is None
    assert (
        _safe_picture_url("https://lh3.googleusercontent.com/a/photo.jpg")
        == "https://lh3.googleusercontent.com/a/photo.jpg"
    )
