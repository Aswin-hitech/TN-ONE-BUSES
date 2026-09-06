"""
Route helper logic adapted for the simplified single-table Bus schema.
"""
from app.extensions import db
from app.models.bus import Bus


def create_route_with_stops(bus_id: int, route_name: str, stop_names: list[str]):
    """
    Updates the Bus record's start, destination, and boarded_stops directly.
    """
    bus = db.session.get(Bus, bus_id)
    if not bus or not stop_names:
        return bus

    bus.start_stop = stop_names[0]
    if len(stop_names) > 1:
        bus.destination_stop = stop_names[-1]
    if len(stop_names) > 2:
        bus.boarded_stops = ", ".join(stop_names[1:-1])

    db.session.commit()
    return bus


def find_route_containing_stop(bus_id: int, stop_name: str):
    bus = db.session.get(Bus, bus_id)
    if not bus:
        return None
    for s in bus.get_stops_list():
        if stop_name.lower() in s.lower():
            return bus
    return None


def route_supports_direction(bus: Bus, origin_stop: str, destination_stop: str) -> bool:
    """
    True if origin_stop appears before destination_stop in bus.get_stops_list().
    """
    stops = [s.lower() for s in bus.get_stops_list()]
    try:
        orig_idx = next(i for i, s in enumerate(stops) if origin_stop.lower() in s)
        dest_idx = next(i for i, s in enumerate(stops) if destination_stop.lower() in s)
        return orig_idx < dest_idx
    except StopIteration:
        return False

