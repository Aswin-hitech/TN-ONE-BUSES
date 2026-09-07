"""
Direct Bus search and "next bus" calculation using the simplified single-table schema.
"""
from datetime import datetime, timezone, timedelta
import re
from app.extensions import db
from app.models.bus import Bus, predict_reaching_time, format_time_ampm
from app.utils.time_utils import utcnow

MAX_RESULTS = 30

# Bus timings are stored and displayed in IST (Asia/Kolkata = UTC+5:30).
# The server may be in UTC, so we always work in IST for "next bus" calculations.
IST = timezone(timedelta(hours=5, minutes=30))


def _now_ist() -> datetime:
    """Returns current time as an IST-aware datetime."""
    return datetime.now(IST)


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


import difflib

def _normalize_place_name(name: str) -> str:
    if not name:
        return ""
    n = name.lower()
    n = re.sub(r'[^a-z0-9]', '', n)
    n = n.replace('ph', 'p').replace('dh', 'd').replace('th', 't')
    n = n.replace('bh', 'b').replace('gh', 'g').replace('kh', 'k').replace('sh', 's')
    n = re.sub(r'([a-z])\1+', r'\1', n)
    return n

def _partial_ratio(s1: str, s2: str) -> float:
    if not s1 or not s2:
        return 0.0
    if len(s1) > len(s2):
        s1, s2 = s2, s1
    
    best_ratio = 0.0
    for i in range(len(s2) - len(s1) + 1):
        sub = s2[i:i+len(s1)]
        ratio = difflib.SequenceMatcher(None, s1, sub).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            
    for i in range(len(s2) - len(s1) + 1):
        sub = s2[i:i+len(s1)+1]
        ratio = difflib.SequenceMatcher(None, s1, sub).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            
    return best_ratio

def fuzzy_match(query: str, target: str) -> bool:
    if not query or not target:
        return False

    # Require minimum meaningful length to avoid false positives on abbreviations
    q_stripped = query.strip()
    if len(q_stripped) < 3:
        return q_stripped.lower() == target.strip().lower()

    q_norm = _normalize_place_name(query)
    t_norm = _normalize_place_name(target)

    if not q_norm or not t_norm:
        return False

    if q_norm in t_norm or t_norm in q_norm:
        return True

    if _partial_ratio(q_norm, t_norm) >= 0.80:
        return True

    return False


def resolve_stop_name(query: str, all_buses: list) -> str:
    """
    Given a user's (possibly misspelled) query, find the best-matching canonical
    stop name from the database. Returns the original query if no close match found.
    This allows the UI to display the corrected stop name even when the user typed
    a variant spelling.
    """
    if not query or not query.strip():
        return query

    best_stop = None
    best_score = 0.0
    q_norm = _normalize_place_name(query)

    for bus in all_buses:
        for stop in bus.get_stops_list():
            t_norm = _normalize_place_name(stop)
            if not t_norm:
                continue
            # Exact / substring hit → return immediately (highest confidence)
            if q_norm == t_norm or q_norm in t_norm or t_norm in q_norm:
                return stop
            score = _partial_ratio(q_norm, t_norm)
            if score > best_score:
                best_score = score
                best_stop = stop

    if best_stop and best_score >= 0.80:
        return best_stop
    return query


def _bus_touches_stop(bus: Bus, stop_name: str) -> int:
    """
    Returns the 0-based index of stop_name in the bus route if it matches fuzzily, else -1.
    Matches against start_stop, destination_stop, and boarded_stops.
    """
    if not stop_name:
        return -1
    for idx, s in enumerate(bus.get_stops_list()):
        if fuzzy_match(stop_name, s):
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
        for sp in spot_timings_list:
            if fuzzy_match(from_name, sp["stop"]):
                if sp.get("time"):
                    from_spot_time = sp["time"]
                    break

    if to_name:
        for sp in spot_timings_list:
            if fuzzy_match(to_name, sp["stop"]):
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
    now = _now_ist()
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
    now = _now_ist()
    if not origin_query or not origin_query.strip():
        return search_all()

    all_buses = Bus.query.all()

    # Resolve the user's (possibly misspelled) query to the canonical stop name in DB
    resolved_origin = resolve_stop_name(origin_query, all_buses)
    was_corrected = resolved_origin.lower() != origin_query.strip().lower()

    matched = []
    other = []

    for b in all_buses:
        orig_idx = _bus_touches_stop(b, resolved_origin)
        if orig_idx != -1:
            is_start = fuzzy_match(resolved_origin, b.start_stop or "")
            res = _serialize_bus_result(b, now, from_name=resolved_origin)
            res["_is_origin_start"] = is_start
            matched.append(res)
        else:
            other.append(_serialize_bus_result(b, now))

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
        "matched_origin_stops": [{"stop_name": resolved_origin}],
        "query_corrected": was_corrected,
        "original_query": origin_query if was_corrected else None,
        "results": matched[:MAX_RESULTS],
        "other_buses": other[:MAX_RESULTS],
    }


def search_by_destination(destination_query: str) -> dict:
    now = _now_ist()
    if not destination_query or not destination_query.strip():
        return search_all()

    all_buses = Bus.query.all()
    resolved_dest = resolve_stop_name(destination_query, all_buses)
    was_corrected = resolved_dest.lower() != destination_query.strip().lower()

    matched = []
    other = []

    for b in all_buses:
        dest_idx = _bus_touches_stop(b, resolved_dest)
        if dest_idx != -1:
            matched.append(_serialize_bus_result(b, now, to_name=resolved_dest))
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
        "matched_stops": [{"stop_name": resolved_dest}],
        "query_corrected": was_corrected,
        "original_query": destination_query if was_corrected else None,
        "results": matched[:MAX_RESULTS],
        "other_buses": other[:MAX_RESULTS],
    }


def search_from_to(origin_query: str, destination_query: str) -> dict:
    now = _now_ist()
    if not origin_query and not destination_query:
        return search_all()
    if not origin_query:
        return search_by_destination(destination_query)
    if not destination_query:
        return search_by_origin(origin_query)

    all_buses = Bus.query.all()

    # Resolve user's misspellings to canonical DB stop names
    resolved_origin = resolve_stop_name(origin_query, all_buses)
    resolved_dest = resolve_stop_name(destination_query, all_buses)
    origin_corrected = resolved_origin.lower() != origin_query.strip().lower()
    dest_corrected = resolved_dest.lower() != destination_query.strip().lower()

    matched = []
    other = []

    for b in all_buses:
        orig_idx = _bus_touches_stop(b, resolved_origin)
        dest_idx = _bus_touches_stop(b, resolved_dest)

        # Ensure both stops exist and the bus travels in the correct direction (orig before dest)
        if orig_idx != -1 and dest_idx != -1 and orig_idx < dest_idx:
            matched.append(_serialize_bus_result(b, now, from_name=resolved_origin, to_name=resolved_dest))
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
        "matched_origin_stops": [{"stop_name": resolved_origin}],
        "matched_destination_stops": [{"stop_name": resolved_dest}],
        "query_corrected": origin_corrected or dest_corrected,
        "resolved_from": resolved_origin if origin_corrected else None,
        "resolved_to": resolved_dest if dest_corrected else None,
        "results": matched[:MAX_RESULTS],
        "other_buses": other[:MAX_RESULTS],
    }

