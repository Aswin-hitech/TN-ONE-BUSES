"""
Bus lookup, creation, and autocomplete stop search using the simplified single-table schema.
"""
from app.extensions import db
from app.models.bus import Bus, BusType, predict_reaching_time


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
    bus_name = (bus_name or "").strip()
    start_stop = (start_stop or "").strip()
    destination_stop = (destination_stop or "").strip()

    query = Bus.query.filter(
        Bus.bus_name.ilike(bus_name),
        Bus.start_stop.ilike(start_stop),
        Bus.destination_stop.ilike(destination_stop),
    )
    if bus_number:
        query = query.filter(Bus.bus_number == bus_number.strip())

    bus = query.first()
    if bus:
        # Update timings or fare if newly provided
        if bus_timings and not bus.bus_timings:
            bus.bus_timings = bus_timings
        if stop_timings and not bus.stop_timings:
            bus.stop_timings = stop_timings
        if bus_fare and not bus.bus_fare:
            bus.bus_fare = bus_fare
        if distance_km and not bus.distance_km:
            bus.distance_km = distance_km
        if reaching_time and not bus.reaching_time:
            bus.reaching_time = reaching_time
        return bus

    # Auto-predict reaching time if not provided
    if not reaching_time and distance_km and bus_timings:
        first_time = [t.strip() for t in bus_timings.split(",") if t.strip()][0]
        reaching_time = predict_reaching_time(first_time, distance_km, bus_type)

    bus = Bus(
        bus_name=bus_name,
        bus_number=bus_number.strip() if bus_number else None,
        operator=operator.strip() if operator else (bus_type or "Government"),
        bus_type=bus_type or "Government",
        start_stop=start_stop,
        destination_stop=destination_stop,
        boarded_stops=boarded_stops.strip() if boarded_stops else None,
        bus_timings=bus_timings.strip() if bus_timings else None,
        bus_fare=float(bus_fare) if bus_fare else 20.0,
        distance_km=float(distance_km) if distance_km else None,
        reaching_time=reaching_time,
        stop_timings=stop_timings.strip() if stop_timings else None,
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
    if not query or not query.strip():
        return []

    buses = Bus.query.all()
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
    import json
    from app.models.bus import format_time_ampm, parse_time_to_minutes

    clean_stop = (stop_name or "").strip()
    if not clean_stop:
        return bus

    # Get current spots list
    current_spots = bus.get_stop_timings_list()
    clean_time = format_time_ampm(stop_time) if stop_time else ""

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

