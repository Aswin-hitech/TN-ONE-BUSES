"""
Bus lookup, creation, and autocomplete stop search using the simplified single-table schema.
"""
import json

from app.extensions import db
from app.models.bus import Bus, BusType, predict_reaching_time
from app.utils.validators import (
    bounded_float,
    clean_multiline_text,
    clean_text,
    normalize_spots,
    sanitize_text,
)

_MAX_ROUTE_STOPS = 250
_MAX_SEARCH_BUSES = 5000


def find_or_create_bus(
    bus_name: str,
    start_stop: str = "Origin",
    destination_stop: str = "Destination",
    bus_number: str = None,
    operator: str = None,
    bus_type: str = "Government",
    boarded_stops: str = None,
    bus_timings: str = None,
    bus_fare: float = 20.0,
    distance_km: float = None,
    reaching_time: str = None,
    stop_timings: str = None,
) -> Bus:
    bus_name = clean_text(bus_name, max_length=255) or ""
    start_stop = clean_text(start_stop, max_length=255) or "Origin"
    destination_stop = clean_text(destination_stop, max_length=255) or "Destination"
    bus_number = clean_text(bus_number, max_length=64)
    operator = clean_text(operator, max_length=255)
    bus_type = bus_type if bus_type in BusType.ALL else BusType.GOVERNMENT
    boarded_stops = clean_multiline_text(boarded_stops, max_length=2000)
    bus_timings = sanitize_text(bus_timings, max_length=500) or None
    reaching_time = clean_text(reaching_time, max_length=64)

    query = Bus.query.filter(
        Bus.bus_name.ilike(bus_name),
        Bus.start_stop.ilike(start_stop),
        Bus.destination_stop.ilike(destination_stop),
    )
    if bus_number:
        query = query.filter(Bus.bus_number == bus_number)

    fare = bounded_float(bus_fare, 0, 100000)
    distance = bounded_float(distance_km, 0, 10000)
    cleaned_spots = normalize_spots(stop_timings)
    spots_json = json.dumps(cleaned_spots) if cleaned_spots else None

    bus = query.first()
    if bus:
        # Update timings or fare if newly provided
        if bus_timings and not bus.bus_timings:
            bus.bus_timings = bus_timings
        if spots_json and not bus.stop_timings:
            bus.stop_timings = spots_json
        if fare is not None and not bus.bus_fare:
            bus.bus_fare = fare
        if distance is not None and not bus.distance_km:
            bus.distance_km = distance
        if reaching_time and not bus.reaching_time:
            bus.reaching_time = reaching_time
        return bus

    # Auto-predict reaching time if not provided
    if not reaching_time and distance and bus_timings:
        first_time = [t.strip() for t in bus_timings.split(",") if t.strip()][0]
        reaching_time = predict_reaching_time(first_time, distance, bus_type)

    bus = Bus(
        bus_name=bus_name,
        bus_number=bus_number,
        operator=operator or (bus_type or "Government"),
        bus_type=bus_type or "Government",
        start_stop=start_stop,
        destination_stop=destination_stop,
        boarded_stops=boarded_stops,
        bus_timings=bus_timings,
        bus_fare=fare if fare is not None else 20.0,
        distance_km=distance,
        reaching_time=reaching_time,
        stop_timings=spots_json,
    )
    db.session.add(bus)
    db.session.flush()
    return bus



from app.services.search_service import fuzzy_match

def search_stops(query: str, limit: int = 10):
    """
    Autocomplete-style stop search across start_stop, destination_stop,
    and comma-separated boarded_stops directly from the buses table.
    """
    query = sanitize_text(query or "", max_length=80)
    if not query:
        return []

    buses = Bus.query.order_by(Bus.id).limit(_MAX_SEARCH_BUSES).all()
    seen = set()
    results = []

    for b in buses:
        for stop in b.get_stops_list():
            norm = stop.strip()
            norm_key = norm.lower()
            if norm_key not in seen and fuzzy_match(query, norm):
                seen.add(norm_key)
                results.append({"stop_name": norm, "normalized_name": norm_key})
                if len(results) >= limit:
                    return results
    return results


def add_stop_to_bus(
    bus: Bus,
    stop_name: str,
    stop_time: str = None,
    after_stop: str = None,
    before_stop: str = None,
) -> Bus:
    """
    Inserts or updates a stop (with optional timing) between existing stops of an existing bus.
    Updates boarded_stops and stop_timings in the database.
    """
    from app.models.bus import format_time_ampm, parse_time_to_minutes

    clean_stop = sanitize_text(stop_name or "", max_length=255)
    if not clean_stop:
        return bus

    # Get current spots list (bounded to keep a route small even if data was
    # written before validation existed).
    current_spots = bus.get_stop_timings_list()[:_MAX_ROUTE_STOPS]
    if len(current_spots) >= _MAX_ROUTE_STOPS:
        return bus

    clean_time = format_time_ampm(sanitize_text(stop_time, max_length=32)) if stop_time else ""
    after_stop = sanitize_text(after_stop or "", max_length=255)
    before_stop = sanitize_text(before_stop or "", max_length=255)

    # Check if this stop is already in current_spots
    existing_idx = -1
    for idx, s in enumerate(current_spots):
        if s["stop"].lower() == clean_stop.lower():
            existing_idx = idx
            break

    if existing_idx != -1:
        # Update timing if newly provided
        if clean_time:
            current_spots[existing_idx]["time"] = clean_time
    else:
        new_entry = {"stop": clean_stop, "time": clean_time}
        inserted = False

        if after_stop:
            after_clean = after_stop.strip().lower()
            for idx, s in enumerate(current_spots):
                if s["stop"].lower() == after_clean:
                    current_spots.insert(idx + 1, new_entry)
                    inserted = True
                    break

        if not inserted and before_stop:
            before_clean = before_stop.strip().lower()
            for idx, s in enumerate(current_spots):
                if s["stop"].lower() == before_clean:
                    current_spots.insert(idx, new_entry)
                    inserted = True
                    break

        if not inserted and clean_time:
            # Insert in chronological order if timing is available
            new_mins = parse_time_to_minutes(clean_time)
            insert_at = -1
            for idx, s in enumerate(current_spots):
                if s.get("time"):
                    s_mins = parse_time_to_minutes(s["time"])
                    if new_mins < s_mins:
                        insert_at = idx
                        break
            if insert_at != -1 and insert_at > 0:
                current_spots.insert(insert_at, new_entry)
                inserted = True

        if not inserted:
            # Default: insert before destination stop
            if len(current_spots) > 1:
                current_spots.insert(len(current_spots) - 1, new_entry)
            else:
                current_spots.append(new_entry)

    # Rebuild Bus fields
    bus.stop_timings = json.dumps(current_spots)
    if len(current_spots) > 0:
        bus.start_stop = current_spots[0]["stop"]
    if len(current_spots) > 1:
        bus.destination_stop = current_spots[-1]["stop"]
    if len(current_spots) > 2:
        bus.boarded_stops = ", ".join([s["stop"] for s in current_spots[1:-1]])
    else:
        bus.boarded_stops = None

    db.session.commit()
    return bus

