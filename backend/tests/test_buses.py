def test_bus_creation(db):
    from app.services.bus_service import find_or_create_bus
    from app.models.bus import BusType

    bus = find_or_create_bus("12A", bus_number="12A", operator="TNSTC", bus_type=BusType.GOVERNMENT)
    db.session.commit()
    assert bus.id is not None
    assert bus.bus_type == BusType.GOVERNMENT


def test_find_or_create_bus_is_idempotent(db):
    from app.services.bus_service import find_or_create_bus

    bus1 = find_or_create_bus("12A", bus_number="12A", operator="TNSTC")
    db.session.commit()
    bus2 = find_or_create_bus("12A", bus_number="12A", operator="TNSTC")
    db.session.commit()
    assert bus1.id == bus2.id


def test_create_bus_requires_auth(client):
    resp = client.post("/api/buses", json={"bus_name": "12A"})
    assert resp.status_code == 401


def test_create_bus_rejects_empty_name(client, make_user, login_as):
    user = make_user()
    login_as(user)
    resp = client.post("/api/buses", json={"bus_name": "   "})
    assert resp.status_code == 422
