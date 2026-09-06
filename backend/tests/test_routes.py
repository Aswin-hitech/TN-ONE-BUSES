def test_route_creation_with_ordered_stops(db):
    from app.services.bus_service import find_or_create_bus

    bus = find_or_create_bus(
        "12A",
        start_stop="Gandhipuram",
        destination_stop="Ukkadam",
        boarded_stops="Town Hall",
    )
    db.session.commit()

    stops = bus.get_stops_list()
    assert stops == ["Gandhipuram", "Town Hall", "Ukkadam"]


def test_route_stop_ordering_uniqueness(db):
    from app.services.bus_service import find_or_create_bus

    bus = find_or_create_bus("12A", start_stop="A", destination_stop="C", boarded_stops="B")
    db.session.commit()
    assert bus.get_stops_list() == ["A", "B", "C"]


def test_route_direction_support(client, db):
    from app.services.bus_service import find_or_create_bus

    find_or_create_bus("12A", start_stop="Gandhipuram", destination_stop="Ukkadam", boarded_stops="Town Hall")
    db.session.commit()

    # Forward direction matches
    resp = client.get("/api/search?from=Gandhipuram&to=Ukkadam")
    assert len(resp.get_json()["data"]["results"]) >= 1

    # Reverse direction does not match
    resp_rev = client.get("/api/search?from=Ukkadam&to=Gandhipuram")
    assert len(resp_rev.get_json()["data"]["results"]) == 0

