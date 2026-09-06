"""
Bus report creation: resolves free-text bus/stop names, applies duplicate
submission protection, and persists the report.
"""
from datetime import timedelta
from app.extensions import db
from app.models.report import BusReport, ReportStatus
from app.models.stop import normalize_stop_name
from app.services.bus_service import find_or_create_bus, find_or_create_stop
from app.services.route_service import create_route_with_stops, find_route_containing_stop
from app.utils.time_utils import utcnow

DUPLICATE_WINDOW_MINUTES = 3


class DuplicateReportError(Exception):
    pass


def _is_duplicate_recent_report(user_id, bus, boarding_stop, destination_stop, boarding_time) -> bool:
    """
    Prevent the same user from spamming the exact same
    bus/boarding-stop/destination/boarding-time combination within a short
    window, without blocking legitimately repeated real-world reports
    (e.g. reporting the same route the next day).
    """
    cutoff = utcnow() - timedelta(minutes=DUPLICATE_WINDOW_MINUTES)
    query = BusReport.query.filter(
        BusReport.user_id == user_id,
        BusReport.bus_id == bus.id,
        BusReport.boarding_stop_id == boarding_stop.id,
        BusReport.destination_stop_id == destination_stop.id,
        BusReport.reported_at >= cutoff,
    )
    if boarding_time is not None:
        query = query.filter(BusReport.boarding_time == boarding_time)
    return db.session.query(query.exists()).scalar()


def create_bus_report(user_id: int, payload) -> BusReport:
    """
    `payload` is a validated BusReportCreate pydantic model.
    Raises DuplicateReportError if this looks like a rapid repeat submission.
    """
    bus = find_or_create_bus(
        bus_name=payload.bus_name,
        bus_number=payload.bus_number,
        operator=payload.operator,
    )
    boarding_stop = find_or_create_stop(payload.boarding_stop)
    destination_stop = find_or_create_stop(payload.destination_stop)

    if _is_duplicate_recent_report(user_id, bus, boarding_stop, destination_stop, payload.boarding_time):
        raise DuplicateReportError(
            "You already reported this bus/stop/time recently. Please wait a few minutes before reporting again."
        )

    route = None
    if payload.route_stops and len(payload.route_stops) >= 2:
        route = create_route_with_stops(bus.id, route_name=None, stop_names=payload.route_stops)
    else:
        # Try to associate with an existing route that contains the boarding stop.
        route = find_route_containing_stop(bus.id, boarding_stop.id)

    report = BusReport(
        user_id=user_id,
        bus_id=bus.id,
        route_id=route.id if route else None,
        boarding_stop_id=boarding_stop.id,
        destination_stop_id=destination_stop.id,
        boarding_time=payload.boarding_time,
        reported_at=utcnow(),
        notes=payload.notes,
        status=ReportStatus.ACTIVE,
    )
    db.session.add(report)
    db.session.commit()
    return report
