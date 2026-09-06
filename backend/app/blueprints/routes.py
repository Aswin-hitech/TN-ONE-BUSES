from flask import Blueprint, request
from pydantic import ValidationError
from app.models.bus import Bus
from app.schemas.route import RouteCreate
from app.services.route_service import create_route_with_stops
from app.extensions import db
from app.utils.security import login_required_json
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
def create_route():
    try:
        payload = RouteCreate(**(request.get_json(silent=True) or {}))
    except ValidationError as e:
        return fail(e.errors()[0].get("msg", "Invalid input."), 422)

    bus = db.session.get(Bus, payload.bus_id)
    if not bus:
        return fail("Bus not found for this route.", 404)

    ordered = sorted(payload.stops, key=lambda s: s.stop_order)
    stop_names = [s.stop_name for s in ordered]
    bus = create_route_with_stops(bus.id, payload.route_name, stop_names)
    return ok(data=bus.to_dict(), message="Route updated.", status=201)
