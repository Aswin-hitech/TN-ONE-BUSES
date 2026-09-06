from datetime import datetime, timedelta, timezone


def _report(db, make_user, boarding_stop, destination_stop, minutes_from_now, bus_name="12A"):
    from app.schemas.report import BusReportCreate
    from app.services.report_service import create_bus_report

    user = make_user(google_id=f"g-{boarding_stop}-{destination_stop}-{minutes_from_now}",
                      email=f"{boarding_stop}{minutes_from_now}@example.com")
    payload = BusReportCreate(
        bus_name=bus_name,
        boarding_stop=boarding_stop,
        destination_stop=destination_stop,
        boarding_time=datetime.now(timezone.utc) + timedelta(minutes=minutes_from_now),
    )
    return create_bus_report(user.id, payload)


def test_destination_search_finds_report(client, db, make_user):
    _report(db, make_user, "Gandhipuram", "Ukkadam", 20)
    resp = client.get("/api/search?destination=Ukkadam")
    assert resp.status_code == 200
    results = resp.get_json()["data"]["results"]
    assert len(results) == 1
    assert results[0]["destination_stop"]["stop_name"] == "Ukkadam"


def test_destination_search_no_match(client):
    resp = client.get("/api/search?destination=Nonexistentplace")
    data = resp.get_json()["data"]
    assert data["results"] == []


def test_from_to_search(client, db, make_user):
    _report(db, make_user, "Gandhipuram", "Ukkadam", 25)
    resp = client.get("/api/search?from=Gandhipuram&to=Ukkadam")
    results = resp.get_json()["data"]["results"]
    assert len(results) == 1


def test_from_to_search_wrong_direction_no_match_without_route(client, db, make_user):
    _report(db, make_user, "Ukkadam", "Gandhipuram", 10)
    resp = client.get("/api/search?from=Gandhipuram&to=Ukkadam")
    results = resp.get_json()["data"]["results"]
    assert results == []


def test_stop_name_variants_treated_as_same_destination(client, db, make_user):
    _report(db, make_user, "Gandhipuram", "Ukkadam", 20)
    resp = client.get("/api/search?destination=Ukkadam Bus Stand")
    results = resp.get_json()["data"]["results"]
    assert len(results) == 1
