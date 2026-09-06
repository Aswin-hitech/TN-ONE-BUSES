def _create_timed_bus(db, bus_name, start_stop, destination_stop, timings, bus_type="Government", dist=12.0):
    from app.services.bus_service import find_or_create_bus
    bus = find_or_create_bus(
        bus_name=bus_name,
        start_stop=start_stop,
        destination_stop=destination_stop,
        bus_timings=timings,
        bus_type=bus_type,
        distance_km=dist,
    )
    db.session.commit()
    return bus


def test_upcoming_bus_ranked_first(client, db):
    _create_timed_bus(db, "12B", "Gandhipuram", "Ukkadam", "23:59")
    _create_timed_bus(db, "12A", "Gandhipuram", "Ukkadam", "00:01")

    resp = client.get("/api/search?destination=Ukkadam")
    results = resp.get_json()["data"]["results"]
    assert len(results) >= 2
    assert results[0]["is_next_bus"] is True


def test_reaching_time_calculated_automatically(client, db):
    _create_timed_bus(db, "Express1", "Gandhipuram", "Ukkadam", "06:00", bus_type="Fast", dist=30.0)

    resp = client.get("/api/search?destination=Ukkadam")
    results = resp.get_json()["data"]["results"]
    assert len(results) >= 1
    # 30 km at 45 km/h + dwell ~40-49 mins -> arrival around 06:4x AM
    assert results[0]["reaching_time"] is not None
    assert "AM" in results[0]["reaching_time"]

