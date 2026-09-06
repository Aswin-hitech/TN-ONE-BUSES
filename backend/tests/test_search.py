def _create_bus(db, start_stop, destination_stop, bus_name="12A", timings="06:20, 08:30"):
    from app.services.bus_service import find_or_create_bus

    bus = find_or_create_bus(
        bus_name=bus_name,
        start_stop=start_stop,
        destination_stop=destination_stop,
        boarded_stops="Town Hall",
        bus_timings=timings,
        bus_fare=25.0,
        distance_km=14.0,
    )
    db.session.commit()
    return bus


def test_destination_search_finds_report(client, db):
    _create_bus(db, "Gandhipuram", "Ukkadam")
    resp = client.get("/api/search?destination=Ukkadam")
    assert resp.status_code == 200
    results = resp.get_json()["data"]["results"]
    assert len(results) >= 1
    assert results[0]["destination_stop"]["stop_name"] == "Ukkadam"


def test_destination_search_no_match(client):
    resp = client.get("/api/search?destination=Nonexistentplace")
    data = resp.get_json()["data"]
    assert data["results"] == []


def test_from_to_search(client, db):
    _create_bus(db, "Gandhipuram", "Ukkadam")
    resp = client.get("/api/search?from=Gandhipuram&to=Ukkadam")
    results = resp.get_json()["data"]["results"]
    assert len(results) >= 1


def test_from_to_search_wrong_direction_no_match(client, db):
    _create_bus(db, "Ukkadam", "Gandhipuram")
    resp = client.get("/api/search?from=Gandhipuram&to=Ukkadam")
    results = resp.get_json()["data"]["results"]
    assert results == []


def test_stop_name_variants_treated_as_same_destination(client, db):
    _create_bus(db, "Gandhipuram", "Ukkadam")
    resp = client.get("/api/search?destination=Ukkadam")
    results = resp.get_json()["data"]["results"]
    assert len(results) >= 1


def test_search_no_params_returns_all_buses(client, db):
    _create_bus(db, "Gandhipuram", "Ukkadam", bus_name="12A")
    _create_bus(db, "Salem", "Erode", bus_name="14B")
    resp = client.get("/api/search")
    assert resp.status_code == 200
    results = resp.get_json()["data"]["results"]
    assert len(results) >= 2


def test_origin_only_search_sorts_by_origin(client, db):
    _create_bus(db, "Gandhipuram", "Ukkadam", bus_name="12A")
    _create_bus(db, "Salem", "Erode", bus_name="14B")
    resp = client.get("/api/search?from=Gandhipuram")
    assert resp.status_code == 200
    data = resp.get_json()["data"]
    results = data["results"]
    assert len(results) >= 1
    assert results[0]["bus"]["start_stop"] == "Gandhipuram"

