def test_bus_creation(db):
    from app.services.bus_service import find_or_create_bus
    from app.models.bus import BusType, predict_reaching_time

    bus = find_or_create_bus(
        bus_name="12A",
        bus_number="12A",
        operator="TNSTC",
        bus_type=BusType.GOVERNMENT,
        start_stop="Gandhipuram",
        destination_stop="Ukkadam",
        boarded_stops="Town Hall",
        bus_timings="06:20, 08:30",
        bus_fare=25.0,
        distance_km=12.0,
    )
    db.session.commit()
    assert bus.id is not None
    assert bus.bus_type == BusType.GOVERNMENT
    assert bus.start_stop == "Gandhipuram"
    assert bus.destination_stop == "Ukkadam"
    assert "Town Hall" in bus.get_stops_list()


def test_predict_reaching_time():
    from app.models.bus import predict_reaching_time

    # 12 km at 40 km/h (Deluxe) = 18 mins + 6 mins dwell = 24 mins
    arr = predict_reaching_time("06:20 AM", distance_km=12.0, bus_type="Deluxe")
    assert arr is not None
    assert "AM" in arr


def test_find_or_create_bus_is_idempotent(db):
    from app.services.bus_service import find_or_create_bus

    bus1 = find_or_create_bus("12A", start_stop="Gandhipuram", destination_stop="Ukkadam")
    db.session.commit()
    bus2 = find_or_create_bus("12A", start_stop="Gandhipuram", destination_stop="Ukkadam")
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


def test_user_can_edit_own_bus(client, make_user, login_as, db):
    user1 = make_user(google_id="user-1", email="user1@example.com")
    login_as(user1)

    # User 1 creates a bus
    create_resp = client.post("/api/buses", json={
        "bus_name": "My Route 5",
        "start_stop": "Gandhipuram",
        "destination_stop": "Ukkadam",
        "bus_timings": "06:30 AM, 08:45 AM",
        "bus_fare": 20.0,
    })
    assert create_resp.status_code == 201
    bus_id = create_resp.get_json()["data"]["id"]

    # User 1 edits their own bus
    update_resp = client.put(f"/api/buses/{bus_id}", json={
        "bus_name": "My Route 5 Express",
        "bus_timings": "06:30 AM, 09:00 AM, 01:15 PM",
        "bus_fare": 25.0,
    })
    assert update_resp.status_code == 200
    updated = update_resp.get_json()["data"]
    assert updated["bus_name"] == "My Route 5 Express"
    assert updated["bus_fare"] == 25.0
    assert "01:15 PM" in updated["bus_timings"]


def test_user_cannot_edit_other_user_bus(client, make_user, login_as, db):
    user1 = make_user(google_id="creator", email="creator@example.com")
    user2 = make_user(google_id="other", email="other@example.com")

    # User 1 creates bus
    login_as(user1)
    create_resp = client.post("/api/buses", json={"bus_name": "User 1 Bus", "start_stop": "A", "destination_stop": "B"})
    bus_id = create_resp.get_json()["data"]["id"]

    # User 2 logs in and attempts to edit User 1's bus
    login_as(user2)
    tamper_resp = client.put(f"/api/buses/{bus_id}", json={"bus_name": "Hacked Bus", "bus_timings": "00:00"})
    assert tamper_resp.status_code == 403
    assert "only edit bus details that you added" in tamper_resp.get_json()["error"].lower()


def test_unauthenticated_cannot_edit_bus(client, make_user, db):
    from app.models.bus import Bus
    user = make_user(google_id="owner", email="owner@example.com")
    bus = Bus(bus_name="Public 10", start_stop="A", destination_stop="B", user_id=user.id)
    db.session.add(bus)
    db.session.commit()

    resp = client.put(f"/api/buses/{bus.id}", json={"bus_name": "Tampered"})
    assert resp.status_code == 401


def test_user_contributions_isolated_and_blank_when_empty(client, make_user, login_as, db):
    user1 = make_user(google_id="u1", email="u1@example.com")
    user2 = make_user(google_id="u2", email="u2@example.com")

    # User 1 has no contributions -> should return empty list
    login_as(user1)
    resp = client.get("/api/users/me/reports")
    assert resp.status_code == 200
    assert resp.get_json()["data"] == []

    # User 2 creates a bus
    login_as(user2)
    client.post("/api/buses", json={"bus_name": "User 2 Special", "start_stop": "A", "destination_stop": "B"})

    # User 2 sees 1 bus
    resp2 = client.get("/api/users/me/reports")
    assert len(resp2.get_json()["data"]) == 1

    # User 1 STILL sees 0 buses (blank contributions)
    login_as(user1)
    resp1_again = client.get("/api/users/me/reports")
    assert resp1_again.get_json()["data"] == []


def test_user_can_create_and_edit_spots_with_timing(client, make_user, login_as, db):
    user = make_user()
    login_as(user)

    spots = [
        {"stop": "Gandhipuram", "time": "06:00 AM"},
        {"stop": "Lakshmi Mills", "time": "06:15 AM"},
        {"stop": "Singanallur", "time": "06:40 AM"},
    ]
    # Create bus with spots
    create_resp = client.post("/api/buses", json={
        "bus_name": "Route 77",
        "spots": spots,
    })
    assert create_resp.status_code == 201
    bus_data = create_resp.get_json()["data"]
    assert bus_data["start_stop"] == "Gandhipuram"
    assert bus_data["destination_stop"] == "Singanallur"
    assert len(bus_data["spots"]) == 3
    assert bus_data["spots"][1]["stop"] == "Lakshmi Mills"
    bus_id = bus_data["id"]

    # Edit spots with timing
    updated_spots = [
        {"stop": "Gandhipuram", "time": "06:30 AM"},
        {"stop": "Lakshmi Mills", "time": "06:45 AM"},
        {"stop": "Singanallur", "time": "07:10 AM"},
        {"stop": "Sulur", "time": "07:35 AM"},
    ]
    edit_resp = client.put(f"/api/buses/{bus_id}", json={
        "spots": updated_spots,
    })
    assert edit_resp.status_code == 200
    updated_data = edit_resp.get_json()["data"]
    assert updated_data["destination_stop"] == "Sulur"
    assert len(updated_data["spots"]) == 4
    assert updated_data["spots"][3]["stop"] == "Sulur"
    assert updated_data["spots"][3]["time"] == "07:35 AM"


def test_add_new_stop_between_in_existing_bus(client, make_user, login_as, db):
    user1 = make_user(google_id="creator1", email="c1@example.com")
    user2 = make_user(google_id="contributor2", email="c2@example.com")

    # User 1 creates bus: Gandhipuram -> Ukkadam
    login_as(user1)
    spots = [
        {"stop": "Gandhipuram", "time": "06:00 AM"},
        {"stop": "Ukkadam", "time": "06:45 AM"},
    ]
    create_resp = client.post("/api/buses", json={
        "bus_name": "Express 1",
        "spots": spots,
    })
    bus_id = create_resp.get_json()["data"]["id"]

    # User 2 (a different commuter) adds a new stop between Gandhipuram and Ukkadam
    login_as(user2)
    add_stop_resp = client.post(f"/api/buses/{bus_id}/stops", json={
        "stop_name": "Town Hall",
        "time": "06:20 AM",
        "after_stop": "Gandhipuram",
    })
    assert add_stop_resp.status_code == 200
    updated = add_stop_resp.get_json()["data"]
    assert len(updated["spots"]) == 3
    assert updated["spots"][0]["stop"] == "Gandhipuram"
    assert updated["spots"][1]["stop"] == "Town Hall"
    assert updated["spots"][1]["time"] == "06:20 AM"
    assert updated["spots"][2]["stop"] == "Ukkadam"
    assert "Town Hall" in updated["boarded_stops"]

    # User 2 adds another stop between Town Hall and Ukkadam
    add_stop2_resp = client.post(f"/api/buses/{bus_id}/stops", json={
        "stop_name": "Collectorate",
        "time": "06:30 AM",
        "after_stop": "Town Hall",
    })
    assert add_stop2_resp.status_code == 200
    updated2 = add_stop2_resp.get_json()["data"]
    assert len(updated2["spots"]) == 4
    assert updated2["spots"][1]["stop"] == "Town Hall"
    assert updated2["spots"][2]["stop"] == "Collectorate"
    assert "Collectorate" in updated2["boarded_stops"]

    # Verify that searching for the new stop in /api/search finds this bus
    search_resp = client.get("/api/search?from=Collectorate&to=Ukkadam")
    search_data = search_resp.get_json()["data"]
    assert len(search_data["results"]) >= 1
    assert search_data["results"][0]["bus"]["id"] == bus_id




