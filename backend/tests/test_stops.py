def test_stop_creation_normalizes_name(db):
    from app.services.bus_service import find_or_create_stop

    stop = find_or_create_stop("Gandhipuram Bus Stand")
    db.session.commit()
    assert stop.normalized_name == "gandhipuram"


def test_stop_dedup_on_normalized_name(db):
    from app.services.bus_service import find_or_create_stop

    s1 = find_or_create_stop("Gandhipuram")
    db.session.commit()
    s2 = find_or_create_stop("Gandhipuram Bus Stand")
    db.session.commit()
    assert s1.id == s2.id


def test_stop_search_autocomplete(client, db):
    from app.services.bus_service import find_or_create_stop
    find_or_create_stop("Gandhipuram")
    find_or_create_stop("Ganapathy")
    db.session.commit()

    resp = client.get("/api/stops/search?q=gan")
    assert resp.status_code == 200
    names = [s["stop_name"] for s in resp.get_json()["data"]]
    assert "Gandhipuram" in names
    assert "Ganapathy" in names


def test_stop_search_empty_query_returns_empty(client):
    resp = client.get("/api/stops/search?q=")
    assert resp.get_json()["data"] == []
