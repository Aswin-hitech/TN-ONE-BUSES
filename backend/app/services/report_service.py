import json
from app.extensions import db
from app.models.bus import Bus, BusType, predict_reaching_time, format_time_ampm


class DuplicateReportError(Exception):
    pass


def create_bus_report(user_id: int, payload) -> Bus:
    """
    Creates or updates a single-table Bus record from user report submission.
    """
    bus_name = (payload.bus_name or "").strip()
    boarding = (payload.boarding_stop or "").strip()
    destination = (payload.destination_stop or "").strip()

    # Process multiple spots with timing if provided
    spots_data = getattr(payload, "spots", None) or getattr(payload, "stop_timings", None)
    stop_timings_str = None
    boarded_stops_str = None
    reaching_time = None
    cleaned_spots = []

    if spots_data:

        if isinstance(spots_data, str):
            try:
                spots_list = json.loads(spots_data)
            except Exception:
                spots_list = []
        elif isinstance(spots_data, list):
            spots_list = spots_data
        else:
            spots_list = []

        cleaned_spots = []
        for s in spots_list:
            if isinstance(s, dict):
                s_name = (s.get("stop") or s.get("stop_name") or s.get("name") or "").strip()
                s_time = (s.get("time") or s.get("timing") or "").strip()
                if s_name:
                    cleaned_spots.append({"stop": s_name, "time": format_time_ampm(s_time)})
            elif isinstance(s, str) and s.strip():
                cleaned_spots.append({"stop": s.strip(), "time": ""})

        if cleaned_spots:
            stop_timings_str = json.dumps(cleaned_spots)
            if not boarding and cleaned_spots:
                boarding = cleaned_spots[0]["stop"]
            if not destination and len(cleaned_spots) > 1:
                destination = cleaned_spots[-1]["stop"]
            if len(cleaned_spots) > 2:
                boarded_stops_str = ", ".join(s["stop"] for s in cleaned_spots[1:-1])
            if cleaned_spots[-1].get("time"):
                reaching_time = cleaned_spots[-1]["time"]

    # Extract timings string from notes or boarding_time
    timings_str = None
    if cleaned_spots and cleaned_spots[0].get("time"):
        timings_str = cleaned_spots[0]["time"]

    if payload.notes and "Timings:" in payload.notes:
        try:
            parts = payload.notes.split("Timings:")[1].strip()
            timings_str = parts
        except Exception:
            pass

    if not timings_str and payload.boarding_time:
        bt = payload.boarding_time
        timings_str = f"{bt.hour:02d}:{bt.minute:02d}"

    # Extract fare from notes or default
    fare = 25.0
    if payload.notes and "₹" in payload.notes:
        try:
            part = payload.notes.split("₹")[1].split(".")[0].split()[0]
            fare = float(part)
        except Exception:
            fare = 25.0

    # Intermediate stops fallback
    if not boarded_stops_str and getattr(payload, "route_stops", None):
        boarded_stops_str = ", ".join(payload.route_stops)

    # Check if an existing bus matches to merge new stops into it
    from app.services.search_service import _bus_touches_stop
    from app.services.bus_service import add_stop_to_bus

    existing_bus = None
    if bus_name:
        candidates = Bus.query.filter(Bus.bus_name.ilike(bus_name)).all()
        for cand in candidates:
            if payload.bus_number and cand.bus_number and cand.bus_number.strip().lower() != payload.bus_number.strip().lower():
                continue
            if (
                (cand.start_stop.lower() == boarding.lower() and cand.destination_stop.lower() == destination.lower())
                or (_bus_touches_stop(cand, boarding) != -1 and _bus_touches_stop(cand, destination) != -1)
            ):
                existing_bus = cand
                break

    if existing_bus:
        if cleaned_spots:
            for s in cleaned_spots:
                add_stop_to_bus(existing_bus, s["stop"], s.get("time"))
        elif boarded_stops_str:
            for st in boarded_stops_str.split(","):
                if st.strip():
                    add_stop_to_bus(existing_bus, st.strip())
        elif boarding and _bus_touches_stop(existing_bus, boarding) == -1:
            add_stop_to_bus(existing_bus, boarding, timings_str)

        db.session.commit()
        return existing_bus

    bus = Bus(
        bus_name=bus_name,

        bus_number=payload.bus_number,
        operator=payload.operator or "Government",
        bus_type=getattr(payload, "bus_type", "Government") or "Government",
        user_id=user_id,
        start_stop=boarding,
        destination_stop=destination,
        boarded_stops=boarded_stops_str,
        bus_timings=timings_str,
        bus_fare=fare,
        reaching_time=reaching_time,
        stop_timings=stop_timings_str,
    )
    db.session.add(bus)
    db.session.commit()
    return bus


