"""
Destination / from-to search and "next bus" ranking.

Pipeline (mirrors the product spec):
  1. Normalize the search query.
  2. Find matching stops.
  3. Find routes/reports touching those stops (in the right direction for
     from->to search).
  4. Compute upcoming/passed status for each report's boarding_time.
  5. Rank: soonest genuinely-upcoming bus first, then freshest reports,
     older/stale reports pushed down (but still shown, clearly labeled).
"""
from sqlalchemy import or_
from app.extensions import db
from app.models.bus import Bus
from app.models.report import BusReport, ReportStatus
from app.models.route import Route
from app.models.stop import Stop, normalize_stop_name
from app.services.route_service import route_supports_direction
from app.utils.time_utils import (
    minutes_until,
    humanize_freshness,
    utcnow,
    NEXT_BUS_LOOKAHEAD_MINUTES,
    NEXT_BUS_GRACE_PERIOD_MINUTES,
    STALE_REPORT_MAX_AGE_MINUTES,
)

RECENT_REPORTS_WINDOW_MINUTES = STALE_REPORT_MAX_AGE_MINUTES  # 24h: beyond this, treat as pure history
MAX_RESULTS = 30


def _matching_stop_ids(query_text: str) -> list[int]:
    normalized = normalize_stop_name(query_text)
    if not normalized:
        return []
    like_pattern = f"%{normalized}%"
    rows = Stop.query.filter(Stop.normalized_name.ilike(like_pattern)).all()
    return [s.id for s in rows]


def _classify_report(report: BusReport, now=None) -> dict:
    now = now or utcnow()
    result = {
        "minutes_until_boarding": None,
        "timing_state": "unknown",  # upcoming | just_departed | passed | unknown
    }
    if report.boarding_time is not None:
        mins = minutes_until(report.boarding_time, now)
        result["minutes_until_boarding"] = round(mins, 1)
        if mins >= -NEXT_BUS_GRACE_PERIOD_MINUTES and mins <= NEXT_BUS_LOOKAHEAD_MINUTES:
            result["timing_state"] = "upcoming" if mins >= 0 else "just_departed"
        elif mins < -NEXT_BUS_GRACE_PERIOD_MINUTES:
            result["timing_state"] = "passed"
        else:
            # further out than the lookahead window — still real, just not "next"
            result["timing_state"] = "later"
    return result


def _report_sort_key(entry: dict):
    """
    Sort priority:
      0: genuinely upcoming/just-departed buses, soonest first
      1: buses further out than the lookahead window, soonest first
      2: everything else (no usable boarding_time, or already passed),
         freshest report first
    """
    timing = entry["timing_state"]
    if timing in ("upcoming", "just_departed"):
        return (0, entry["minutes_until_boarding"])
    if timing == "later":
        return (1, entry["minutes_until_boarding"])
    return (2, entry["freshness"]["minutes_ago"])


def _serialize_report(report: BusReport, now) -> dict:
    classification = _classify_report(report, now)
    freshness = humanize_freshness(report.reported_at, now)
    route_summary = None
    if report.route:
        route_summary = [rs.stop.stop_name for rs in sorted(report.route.stops, key=lambda x: x.stop_order)]

    return {
        "report_id": report.id,
        "bus": report.bus.to_dict(),
        "boarding_stop": report.boarding_stop.to_dict(),
        "destination_stop": report.destination_stop.to_dict(),
        "boarding_time": report.boarding_time.isoformat() if report.boarding_time else None,
        "route_summary": route_summary,
        "notes": report.notes,
        "freshness": freshness,
        "timing_state": classification["timing_state"],
        "minutes_until_boarding": classification["minutes_until_boarding"],
        "is_stale_history": freshness["level"] == "very_stale",
    }


def _base_report_query(now):
    cutoff = now.replace(microsecond=0) - __import__("datetime").timedelta(
        minutes=RECENT_REPORTS_WINDOW_MINUTES * 3  # keep a wide history window; freshness UI communicates age
    )
    return (
        BusReport.query.filter(
            BusReport.status == ReportStatus.ACTIVE,
            BusReport.reported_at >= cutoff,
        )
        .join(Bus)
        .join(Stop, BusReport.boarding_stop_id == Stop.id)
    )


def search_by_destination(destination_query: str) -> dict:
    now = utcnow()
    destination_ids = _matching_stop_ids(destination_query)
    if not destination_ids:
        return {"matched_stops": [], "results": []}

    reports = (
        _base_report_query(now)
        .filter(BusReport.destination_stop_id.in_(destination_ids))
        .all()
    )
    entries = [_serialize_report(r, now) for r in reports]
    entries.sort(key=_report_sort_key)

    if entries:
        entries[0]["is_next_bus"] = True
        for e in entries[1:]:
            e["is_next_bus"] = False

    return {
        "matched_stops": [db.session.get(Stop, sid).to_dict() for sid in destination_ids],
        "results": entries[:MAX_RESULTS],
    }


def search_from_to(origin_query: str, destination_query: str) -> dict:
    now = utcnow()
    origin_ids = _matching_stop_ids(origin_query)
    destination_ids = _matching_stop_ids(destination_query)
    if not origin_ids or not destination_ids:
        return {"matched_origin_stops": [], "matched_destination_stops": [], "results": []}

    candidate_reports = (
        _base_report_query(now)
        .filter(
            BusReport.boarding_stop_id.in_(origin_ids),
            BusReport.destination_stop_id.in_(destination_ids),
        )
        .all()
    )

    # Also consider reports whose *route* passes through both stops in the
    # correct order, even if the specific report's destination differs
    # (e.g. someone reported boarding for a shorter leg of a longer route).
    route_based_reports = (
        _base_report_query(now)
        .filter(BusReport.boarding_stop_id.in_(origin_ids))
        .join(Route, BusReport.route_id == Route.id)
        .all()
    )
    for r in route_based_reports:
        if r in candidate_reports or r.route is None:
            continue
        for dest_id in destination_ids:
            if route_supports_direction(r.route, r.boarding_stop_id, dest_id):
                candidate_reports.append(r)
                break

    entries = [_serialize_report(r, now) for r in candidate_reports]
    entries.sort(key=_report_sort_key)

    if entries:
        entries[0]["is_next_bus"] = True
        for e in entries[1:]:
            e["is_next_bus"] = False

    return {
        "matched_origin_stops": [db.session.get(Stop, sid).to_dict() for sid in origin_ids],
        "matched_destination_stops": [db.session.get(Stop, sid).to_dict() for sid in destination_ids],
        "results": entries[:MAX_RESULTS],
    }
