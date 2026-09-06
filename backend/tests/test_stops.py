def test_stop_search_autocomplete(client, db):
    from app.services.bus_service import find_or_create_bus
    find_or_create_bus("12A", start_stop="Gandhipuram", destination_stop="Ukkadam", boarded_stops="Ganapathy")
    db.session.commit()

    resp = client.get("/api/stops/search?q=gan")
    assert resp.status_code == 200
    names = [s["stop_name"] for s in resp.get_json()["data"]]
    assert "Gandhipuram" in names or "Ganapathy" in names


def test_stop_search_empty_query_returns_empty(client):
    resp = client.get("/api/stops/search?q=")
    assert resp.get_json()["data"] == []

