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
        notes="Bus was crowded",
    )
    report = create_bus_report(user.id, payload)
    assert report.id is not None
    assert report.bus.bus_name == "12A"
    assert report.boarding_stop.stop_name == "Gandhipuram"
    assert report.destination_stop.stop_name == "Ukkadam"


def test_invalid_report_rejected_same_stop(db):
    from pydantic import ValidationError
    from app.schemas.report import BusReportCreate
    import pytest

    with pytest.raises(ValidationError):
        BusReportCreate(
            bus_name="12A",
            boarding_stop="Gandhipuram",
            destination_stop="Gandhipuram Bus Stand",  # normalizes to same stop
        )


def test_invalid_report_rejected_empty_bus_name(db):
    from pydantic import ValidationError
    from app.schemas.report import BusReportCreate
    import pytest

    with pytest.raises(ValidationError):
        BusReportCreate(bus_name="   ", boarding_stop="A", destination_stop="B")


def test_duplicate_report_rejected_within_window(db, make_user):
    from app.schemas.report import BusReportCreate
    from app.services.report_service import create_bus_report, DuplicateReportError
    import pytest

    user = make_user()
    payload = BusReportCreate(
        bus_name="12A",
        boarding_stop="Gandhipuram",
        destination_stop="Ukkadam",
        boarding_time=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    create_bus_report(user.id, payload)

    with pytest.raises(DuplicateReportError):
        create_bus_report(user.id, payload)


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
    })
    assert resp.status_code == 201
    assert "successfully" in resp.get_json()["message"].lower()
