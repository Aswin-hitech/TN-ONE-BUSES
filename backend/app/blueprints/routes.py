from flask import Blueprint, request
from flask_login import current_user
from pydantic import ValidationError
from app.models.bus import Bus
from app.schemas.route import RouteCreate
from app.services.route_service import create_route_with_stops
from app.extensions import db, limiter
from app.utils.security import login_required_json, security_log
from app.utils.responses import ok, fail

bp = Blueprint("routes", __name__, url_prefix="/api/routes")


@bp.route("/<int:route_id>", methods=["GET"])
def get_route(route_id):
    bus = db.session.get(Bus, route_id)
    if not bus:
        return fail("Route not found.", 404)
    return ok(data=bus.to_dict())


@bp.route("", methods=["POST"])
@login_required_json
@limiter.limit("30 per hour")
def create_route():
    try:
        payload = RouteCreate(**(request.get_json(silent=True) or {}))
    except ValidationError as e:
        return fail(e.errors()[0].get("msg", "Invalid input."), 422)

    bus = db.session.get(Bus, payload.bus_id)
    if not bus:
        return fail("Bus not found for this route.", 404)

    # This endpoint replaces the whole stop list, so it follows the same
    # ownership rule as a direct PUT: only the owner (or an unowned route)
    # may rewrite it. Other riders use change requests.
    if bus.user_id is not None and bus.user_id != current_user.id:
        security_log(
            "route_rewrite_forbidden",
            user_id=current_user.id,
            bus_id=bus.id,
            ip=request.remote_addr,
        )
        return fail(
            "You do not own this route. Please submit a change request instead.",
            403,
        )

    ordered = sorted(payload.stops, key=lambda s: s.stop_order)
    stop_names = [s.stop_name for s in ordered]
    if not stop_names:
        return fail("At least one stop is required.", 422)

    bus = create_route_with_stops(bus.id, payload.route_name, stop_names)
    return ok(data=bus.to_dict(), message="Route updated.", status=201)
