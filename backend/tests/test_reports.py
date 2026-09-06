from datetime import datetime, timedelta, timezone


def test_bus_report_creation(db, make_user):
    from app.schemas.report import BusReportCreate
    from app.services.report_service import create_bus_report

    user = make_user()
    payload = BusReportCreate(
        bus_name="12A",
        bus_number="12A",
        operator="TNSTC",
        boarding_stop="Gandhipuram",
        destination_stop="Ukkadam",
        boarding_time=datetime.now(timezone.utc) + timedelta(minutes=10),
        notes="Fare: ₹25. Bus was crowded",
    )
    bus = create_bus_report(user.id, payload)
    assert bus.id is not None
    assert bus.bus_name == "12A"
    assert bus.start_stop == "Gandhipuram"
    assert bus.destination_stop == "Ukkadam"


def test_invalid_report_rejected_empty_bus_name(db):
    from pydantic import ValidationError
    from app.schemas.report import BusReportCreate
    import pytest

    with pytest.raises(ValidationError):
        BusReportCreate(bus_name="   ", boarding_stop="A", destination_stop="B")


def test_report_endpoint_requires_auth(client):
    resp = client.post("/api/reports", json={
        "bus_name": "12A", "boarding_stop": "A", "destination_stop": "B"
    })
    assert resp.status_code == 401


def test_report_endpoint_success(client, make_user, login_as):
    user = make_user()
    login_as(user)
    resp = client.post("/api/reports", json={
        "bus_name": "12A",
        "boarding_stop": "Gandhipuram",
        "destination_stop": "Ukkadam",
        "boarding_time": (datetime.now(timezone.utc) + timedelta(minutes=15)).isoformat(),
        "notes": "Fare: ₹25",
    })
    assert resp.status_code == 201
    assert "successfully" in resp.get_json()["message"].lower()


def test_report_with_multiple_spots_and_timing(client, make_user, login_as):
    user = make_user()
    login_as(user)
    spots = [
        {"stop": "Gandhipuram", "time": "06:00 AM"},
        {"stop": "Town Hall", "time": "06:20 AM"},
        {"stop": "Ukkadam", "time": "06:45 AM"},
        {"stop": "Pollachi", "time": "07:45 AM"},
    ]
    resp = client.post("/api/reports", json={
        "bus_name": "Pollachi Fast",
        "boarding_stop": "Gandhipuram",
        "destination_stop": "Pollachi",
        "spots": spots,
        "notes": "Fare: ₹35",
    })
    assert resp.status_code == 201
    bus_data = resp.get_json()["data"]
    assert bus_data["start_stop"] == "Gandhipuram"
    assert bus_data["destination_stop"] == "Pollachi"
    assert len(bus_data["spots"]) == 4
    assert bus_data["spots"][1]["stop"] == "Town Hall"
    assert bus_data["spots"][1]["time"] == "06:20 AM"


def test_report_merges_new_stop_into_existing_bus(client, make_user, login_as):
    user = make_user()
    login_as(user)

    # First report creates the bus
    resp1 = client.post("/api/reports", json={
        "bus_name": "Kovai 100",
        "boarding_stop": "Gandhipuram",
        "destination_stop": "Ukkadam",
        "notes": "Fare: ₹20",
    })
    assert resp1.status_code == 201
    b1 = resp1.get_json()["data"]

    # Second report for Kovai 100 adds a new intermediate stop "Railway Station"
    resp2 = client.post("/api/reports", json={
        "bus_name": "Kovai 100",
        "boarding_stop": "Gandhipuram",
        "destination_stop": "Ukkadam",
        "route_stops": ["Railway Station"],
        "notes": "Fare: ₹20",
    })
    assert resp2.status_code == 201
    b2 = resp2.get_json()["data"]
    assert b2["id"] == b1["id"]
    assert "Railway Station" in b2["boarded_stops"]



