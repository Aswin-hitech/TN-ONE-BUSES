from flask import Blueprint, request
from pydantic import ValidationError
from app.models.bus import Bus
from app.models.route import Route
from app.schemas.route import RouteCreate
from app.services.route_service import create_route_with_stops
from app.extensions import db
from app.utils.security import login_required_json
from app.utils.responses import ok, fail

bp = Blueprint("routes", __name__, url_prefix="/api/routes")


@bp.route("/<int:route_id>", methods=["GET"])
def get_route(route_id):
    route = Route.query.get(route_id)
    if not route:
        return fail("Route not found.", 404)
    return ok(data=route.to_dict())


@bp.route("", methods=["POST"])
@login_required_json
def create_route():
    try:
        payload = RouteCreate(**(request.get_json(silent=True) or {}))
    except ValidationError as e:
        return fail(e.errors()[0].get("msg", "Invalid input."), 422)

    bus = Bus.query.get(payload.bus_id)
    if not bus:
        return fail("Bus not found for this route.", 404)

    ordered = sorted(payload.stops, key=lambda s: s.stop_order)
    stop_names = [s.stop_name for s in ordered]
    route = create_route_with_stops(bus.id, payload.route_name, stop_names)
    db.session.commit()
    return ok(data=route.to_dict(), message="Route created.", status=201)
