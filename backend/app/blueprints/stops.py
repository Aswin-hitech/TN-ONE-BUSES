from flask import Blueprint, request
from pydantic import ValidationError
from app.extensions import db
from app.models.stop import Stop, normalize_stop_name
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
    if not results:
        return ok(data=[], message="No matching stops found.")
    return ok(data=[s.to_dict() for s in results])


@bp.route("", methods=["POST"])
@login_required_json
def create_stop():
    try:
        payload = StopCreate(**(request.get_json(silent=True) or {}))
    except ValidationError as e:
        return fail(e.errors()[0].get("msg", "Invalid input."), 422)

    normalized = normalize_stop_name(payload.stop_name)
    existing = Stop.query.filter_by(normalized_name=normalized).first()
    if existing:
        return ok(data=existing.to_dict(), message="Stop already exists.")

    stop = Stop(
        stop_name=payload.stop_name,
        normalized_name=normalized,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    db.session.add(stop)
    db.session.commit()
    return ok(data=stop.to_dict(), message="Stop created.", status=201)
