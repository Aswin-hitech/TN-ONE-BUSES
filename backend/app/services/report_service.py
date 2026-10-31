import json
from datetime import timezone, timedelta
from app.extensions import db
from app.models.bus import Bus, BusType, predict_reaching_time, format_time_ampm
from app.utils.validators import (
    bounded_float,
    clean_multiline_text,
    clean_text,
    normalize_spots,
    sanitize_text,
)

IST = timezone(timedelta(hours=5, minutes=30))


class DuplicateReportError(Exception):
    pass


def _boarding_time_ist(value):
    """Converts an incoming boarding datetime to India Standard Time."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=IST)
    return value.astimezone(IST)


def _unique_timings(candidates) -> list:
    timings = []
    seen = set()
    for candidate in candidates:
        if not candidate:
            continue
        cleaned = sanitize_text(str(candidate), max_length=32)
        if not cleaned:
            continue
        formatted = format_time_ampm(cleaned)
        key = formatted.lower()
        if formatted and key not in seen:
            seen.add(key)
            timings.append(formatted)
        if len(timings) >= 50:
            break
    return timings


def create_bus_report(user_id: int, payload) -> Bus:
    """
    Creates or updates a single-table Bus record from user report submission.
    """
    bus_name = clean_text(payload.bus_name, max_length=255) or ""
    boarding = clean_text(payload.boarding_stop, max_length=255) or ""
    destination = clean_text(payload.destination_stop, max_length=255) or ""

    # Process multiple spots with timing if provided
    spots_data = getattr(payload, "spots", None) or getattr(payload, "stop_timings", None)
    stop_timings_str = None
    boarded_stops_str = None
    reaching_time = None
    cleaned_spots = normalize_spots(spots_data)

    if cleaned_spots:
        stop_timings_str = json.dumps(cleaned_spots)
        if not boarding:
            boarding = cleaned_spots[0]["stop"]
        if not destination and len(cleaned_spots) > 1:
            destination = cleaned_spots[-1]["stop"]
        if len(cleaned_spots) > 2:
            boarded_stops_str = ", ".join(s["stop"] for s in cleaned_spots[1:-1])[:2000]
        if cleaned_spots[-1].get("time"):
            reaching_time = cleaned_spots[-1]["time"]

    # Collect trip departure timings, preferring the values submitted by the client.
    timing_candidates = []
    submitted_timings = getattr(payload, "bus_timings", None)
    if submitted_timings:
        timing_candidates.extend(
            part.strip()
            for part in str(submitted_timings).replace(";", ",").split(",")
            if part.strip()
        )
    if cleaned_spots and cleaned_spots[0].get("time"):
        timing_candidates.insert(0, cleaned_spots[0]["time"])

    if not timing_candidates and payload.notes and "Timings:" in payload.notes:
        try:
            parts = payload.notes.split("Timings:")[1].strip()
            timing_candidates.extend(p.strip() for p in parts.split(",") if p.strip())
        except Exception:
            pass

    boarding_ist = _boarding_time_ist(payload.boarding_time)
    if not timing_candidates and boarding_ist:
        timing_candidates.append(f"{boarding_ist.hour:02d}:{boarding_ist.minute:02d}")

    timings_list = _unique_timings(timing_candidates)
    bus_timings_str = (", ".join(timings_list)[:500]) or None
    timings_str = timings_list[0] if timings_list else None

    # Fare: prefer the submitted value, then a value embedded in notes.
    fare = 25.0
    submitted_fare = getattr(payload, "bus_fare", None)
    if submitted_fare is not None:
        parsed_fare = bounded_float(submitted_fare, 0, 100000)
        if parsed_fare is not None:
            fare = parsed_fare
    elif payload.notes and "₹" in payload.notes:
        try:
            part = payload.notes.split("₹")[1].split(".")[0].split()[0]
            parsed_fare = bounded_float(part, 0, 100000)
            if parsed_fare is not None:
                fare = parsed_fare
        except Exception:
            fare = 25.0

    # Intermediate stops fallback
    if not boarded_stops_str and getattr(payload, "route_stops", None):
        boarded_stops_str = ", ".join(payload.route_stops)[:2000] or None

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

        if timings_list:
            current = [
                sanitize_text(t, max_length=32)
                for t in (existing_bus.bus_timings or "").split(",")
                if t.strip()
            ]
            seen = {t.lower() for t in current if t}
            for timing in timings_list:
                if timing.lower() not in seen:
                    current.append(timing)
                    seen.add(timing.lower())
            existing_bus.bus_timings = (", ".join(current))[:500] or None

        db.session.commit()
        return existing_bus

    bus_type = getattr(payload, "bus_type", None) or BusType.GOVERNMENT
    if bus_type not in BusType.ALL:
        bus_type = BusType.GOVERNMENT

    bus = Bus(
        bus_name=bus_name,
        bus_number=clean_text(payload.bus_number, max_length=64),
        operator=clean_text(payload.operator, max_length=255) or "Government",
        bus_type=bus_type,
        user_id=user_id,
        start_stop=boarding,
        destination_stop=destination,
        boarded_stops=clean_multiline_text(boarded_stops_str, max_length=2000),
        bus_timings=bus_timings_str,
        bus_fare=fare,
        reaching_time=clean_text(reaching_time, max_length=64),
        stop_timings=stop_timings_str,
    )
    db.session.add(bus)
    db.session.commit()
    return bus


