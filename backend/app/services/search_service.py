"""
Direct Bus search and "next bus" calculation using the simplified single-table schema.
"""
from datetime import datetime, timezone, timedelta
import re
from app.extensions import db
from app.models.bus import Bus, predict_reaching_time, format_time_ampm
from app.utils.time_utils import utcnow

MAX_RESULTS = 30


def _parse_time_to_minutes(time_str: str) -> int:
    """Converts '06:20 PM' or '18:20' to minutes from midnight."""
    if not time_str:
        return 0
    match = re.search(r"(\d{1,2}):(\d{2})", time_str)
    if not match:
        return 0
    h = int(match.group(1))
    m = int(match.group(2))
    if "pm" in time_str.lower() and h < 12:
        h += 12
    elif "am" in time_str.lower() and h == 12:
        h = 0
    return h * 60 + m


def _bus_touches_stop(bus: Bus, stop_name: str) -> int:
    """
    Returns the 0-based index of stop_name in the bus route if it matches, else -1.
    Matches against start_stop, destination_stop, and boarded_stops.
    """
    if not stop_name:
        return -1
    q = stop_name.strip().lower()
    for idx, s in enumerate(bus.get_stops_list()):
        if q in s.lower() or s.lower() in q:
            return idx
    return -1


def _serialize_bus_result(bus: Bus, now_dt: datetime, from_name: str = None, to_name: str = None) -> dict:
    timings = bus.get_timings_list()
    now_mins = now_dt.hour * 60 + now_dt.minute

    # Look up spot-specific timings if available
    spot_timings_list = bus.get_stop_timings_list()
    from_spot_time = None
    to_spot_time = None

    if from_name:
        fn_lower = from_name.strip().lower()
        for sp in spot_timings_list:
            if fn_lower in sp["stop"].lower() or sp["stop"].lower() in fn_lower:
                if sp.get("time"):
                    from_spot_time = sp["time"]
                    break

    if to_name:
        tn_lower = to_name.strip().lower()
        for sp in spot_timings_list:
            if tn_lower in sp["stop"].lower() or sp["stop"].lower() in tn_lower:
                if sp.get("time"):
                    to_spot_time = sp["time"]
                    break

    # Find the nearest upcoming timing from overall timings
    best_timing = None
    min_diff = 999999
    is_upcoming = False

    candidate_timing = from_spot_time
    if candidate_timing:
        t_mins = _parse_time_to_minutes(candidate_timing)
        diff = t_mins - now_mins
        if diff >= 0:
            min_diff = diff
            best_timing = candidate_timing
            is_upcoming = True
        else:
            min_diff = (1440 - now_mins) + t_mins
            best_timing = candidate_timing
            is_upcoming = False
    else:
        for t in timings:
            t_mins = _parse_time_to_minutes(t)
            diff = t_mins - now_mins
            if diff >= 0 and diff < min_diff:
                min_diff = diff
                best_timing = t
                is_upcoming = True

        # If all today's buses passed, pick the earliest tomorrow
        if not best_timing and timings:
            best_timing = timings[0]
            min_diff = (1440 - now_mins) + _parse_time_to_minutes(best_timing)
            is_upcoming = False

    # Predicted reaching time
    predicted_arrival = to_spot_time or bus.calculate_reaching_time(best_timing)

    # Format boarding datetime for frontend consistency
    boarding_iso = None
    if best_timing:
        try:
            t_m = _parse_time_to_minutes(best_timing)
            b_dt = now_dt.replace(hour=t_m // 60, minute=t_m % 60, second=0, microsecond=0)
            if not is_upcoming and min_diff > 720:
                b_dt += timedelta(days=1)
            boarding_iso = b_dt.isoformat()
        except Exception:
            pass

    return {
        "bus": bus.to_dict(),
        "boarding_stop": {"stop_name": from_name or bus.start_stop},
        "destination_stop": {"stop_name": to_name or bus.destination_stop},
        "boarding_time": boarding_iso,
        "timing_display": format_time_ampm(best_timing or (timings[0] if timings else None)),
        "reaching_time": format_time_ampm(predicted_arrival),
        "fare": bus.bus_fare,
        "bus_type": bus.bus_type,
        "operator": bus.operator,
        "minutes_until_boarding": min_diff if best_timing else None,
        "timing_state": "upcoming" if (best_timing and min_diff <= 180) else "later",
        "route_summary": bus.get_stops_list(),
        "stop_timings": spot_timings_list,
        "spots": spot_timings_list,
        "freshness": {"label": "Verified schedule", "level": "fresh", "minutes_ago": 0},
    }



def search_all() -> dict:
    now = utcnow()
    all_buses = Bus.query.all()
    results = [_serialize_bus_result(b, now) for b in all_buses]
    results.sort(
        key=lambda x: (
            0 if x["timing_state"] == "upcoming" else 1,
            x["minutes_until_boarding"] if x["minutes_until_boarding"] is not None else 9999,
        )
    )
    if results:
        results[0]["is_next_bus"] = True
        for m in results[1:]:
            m["is_next_bus"] = False

    return {
        "matched_stops": [],
        "results": results[:MAX_RESULTS],
        "other_buses": [],
    }


def search_by_origin(origin_query: str) -> dict:
    now = utcnow()
    if not origin_query or not origin_query.strip():
        return search_all()

    all_buses = Bus.query.all()
    matched = []
    other = []

    q = origin_query.strip().lower()
    for b in all_buses:
        orig_idx = _bus_touches_stop(b, origin_query)
        if orig_idx != -1:
            is_start = q in (b.start_stop or "").lower() or (b.start_stop or "").lower() in q
            res = _serialize_bus_result(b, now, from_name=origin_query)
            res["_is_origin_start"] = is_start
            matched.append(res)
        else:
            other.append(_serialize_bus_result(b, now))

    # Sort matched: origin start stops first, then upcoming state, then minutes until boarding
    matched.sort(
        key=lambda x: (
            0 if x.get("_is_origin_start") else 1,
            0 if x["timing_state"] == "upcoming" else 1,
            x["minutes_until_boarding"] if x["minutes_until_boarding"] is not None else 9999,
        )
    )
    if matched:
        matched[0]["is_next_bus"] = True
        for m in matched[1:]:
            m["is_next_bus"] = False

    other.sort(
        key=lambda x: (
            0 if x["timing_state"] == "upcoming" else 1,
            x["minutes_until_boarding"] if x["minutes_until_boarding"] is not None else 9999,
        )
    )

    return {
        "matched_origin_stops": [{"stop_name": origin_query}],
        "results": matched[:MAX_RESULTS],
        "other_buses": other[:MAX_RESULTS],
    }


def search_by_destination(destination_query: str) -> dict:
    now = utcnow()
    if not destination_query or not destination_query.strip():
        return search_all()

    all_buses = Bus.query.all()
    matched = []
    other = []

    for b in all_buses:
        dest_idx = _bus_touches_stop(b, destination_query)
        if dest_idx != -1:
            matched.append(_serialize_bus_result(b, now, to_name=destination_query))
        else:
            other.append(_serialize_bus_result(b, now))

    matched.sort(
        key=lambda x: (
            0 if x["timing_state"] == "upcoming" else 1,
            x["minutes_until_boarding"] if x["minutes_until_boarding"] is not None else 9999,
        )
    )
    if matched:
        matched[0]["is_next_bus"] = True
        for m in matched[1:]:
            m["is_next_bus"] = False

    other.sort(
        key=lambda x: (
            0 if x["timing_state"] == "upcoming" else 1,
            x["minutes_until_boarding"] if x["minutes_until_boarding"] is not None else 9999,
        )
    )

    return {
        "matched_stops": [{"stop_name": destination_query}],
        "results": matched[:MAX_RESULTS],
        "other_buses": other[:MAX_RESULTS],
    }


def search_from_to(origin_query: str, destination_query: str) -> dict:
    now = utcnow()
    if not origin_query and not destination_query:
        return search_all()
    if not origin_query:
        return search_by_destination(destination_query)
    if not destination_query:
        return search_by_origin(origin_query)

    all_buses = Bus.query.all()
    matched = []
    other = []

    for b in all_buses:
        orig_idx = _bus_touches_stop(b, origin_query)
        dest_idx = _bus_touches_stop(b, destination_query)

        # Ensure both stops exist and the bus travels in the correct direction (orig before dest)
        if orig_idx != -1 and dest_idx != -1 and orig_idx < dest_idx:
            matched.append(_serialize_bus_result(b, now, from_name=origin_query, to_name=destination_query))
        else:
            touches_either = (orig_idx != -1) or (dest_idx != -1)
            item = _serialize_bus_result(b, now)
            item["_touches_either"] = touches_either
            other.append(item)

    matched.sort(
        key=lambda x: (
            0 if x["timing_state"] == "upcoming" else 1,
            x["minutes_until_boarding"] if x["minutes_until_boarding"] is not None else 9999,
        )
    )
    if matched:
        matched[0]["is_next_bus"] = True
        for m in matched[1:]:
            m["is_next_bus"] = False

    other.sort(
        key=lambda x: (
            0 if x.get("_touches_either") else 1,
            0 if x["timing_state"] == "upcoming" else 1,
            x["minutes_until_boarding"] if x["minutes_until_boarding"] is not None else 9999,
        )
    )

    return {
        "matched_origin_stops": [{"stop_name": origin_query}],
        "matched_destination_stops": [{"stop_name": destination_query}],
        "results": matched[:MAX_RESULTS],
        "other_buses": other[:MAX_RESULTS],
    }

