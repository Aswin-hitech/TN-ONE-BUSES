def test_route_creation_with_ordered_stops(db):
    from app.services.bus_service import find_or_create_bus
    from app.services.route_service import create_route_with_stops

    bus = find_or_create_bus("12A", bus_number="12A")
    db.session.flush()
    route = create_route_with_stops(bus.id, "Gandhipuram-Ukkadam", ["Gandhipuram", "Town Hall", "Ukkadam"])
    db.session.commit()

    ordered_names = [rs.stop.stop_name for rs in sorted(route.stops, key=lambda x: x.stop_order)]
    assert ordered_names == ["Gandhipuram", "Town Hall", "Ukkadam"]


def test_route_stop_ordering_uniqueness(db):
    from app.services.bus_service import find_or_create_bus
    from app.services.route_service import create_route_with_stops

    bus = find_or_create_bus("12A", bus_number="12A")
    db.session.flush()
    route = create_route_with_stops(bus.id, None, ["A", "B", "C"])
    db.session.commit()
    orders = [rs.stop_order for rs in route.stops]
    assert orders == sorted(set(orders))


def test_route_direction_support(db):
    from app.services.bus_service import find_or_create_bus, find_or_create_stop
    from app.services.route_service import create_route_with_stops, route_supports_direction

    bus = find_or_create_bus("12A", bus_number="12A")
    db.session.flush()
    route = create_route_with_stops(bus.id, None, ["Gandhipuram", "Town Hall", "Ukkadam"])
    db.session.commit()

    gp = find_or_create_stop("Gandhipuram")
    uk = find_or_create_stop("Ukkadam")
    db.session.commit()

    assert route_supports_direction(route, gp.id, uk.id) is True
    assert route_supports_direction(route, uk.id, gp.id) is False
