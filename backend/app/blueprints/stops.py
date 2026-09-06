from flask import Blueprint, request
from pydantic import ValidationError
from app.models.stop import normalize_stop_name
from app.schemas.stop import StopCreate
from app.services.bus_service import search_stops
from app.utils.security import login_required_json
from app.utils.responses import ok, fail

bp = Blueprint("stops", __name__, url_prefix="/api/stops")


@bp.route("/search", methods=["GET"])
def search():
    query = request.args.get("q", "")
    if not query.strip():
        return ok(data=[])
    results = search_stops(query, limit=10)
    return ok(data=results)


@bp.route("", methods=["POST"])
@login_required_json
def create_stop():
    try:
        payload = StopCreate(**(request.get_json(silent=True) or {}))
    except ValidationError as e:
        return fail(e.errors()[0].get("msg", "Invalid input."), 422)

    normalized = normalize_stop_name(payload.stop_name)
    return ok(
        data={
            "stop_name": payload.stop_name,
            "normalized_name": normalized,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
        },
        message="Stop created.",
        status=201,
    )
