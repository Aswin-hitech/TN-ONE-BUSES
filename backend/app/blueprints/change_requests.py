"""
Change Request blueprint.

Flow
----
POST /api/change-requests
    Any authenticated user submits a change proposal for a bus.
    - If bus has no owner (user_id=NULL)  → auto-apply immediately
    - If requester IS the owner           → auto-apply immediately
    - Otherwise                           → save as pending, owner must review

GET /api/change-requests/pending
    Returns all pending requests where the current user is the bus owner.

POST /api/change-requests/<id>/accept
    Owner accepts the request → changes are applied to the bus row.

POST /api/change-requests/<id>/reject
    Owner rejects the request → status set to "rejected", bus unchanged.
"""
import json
from datetime import datetime, timezone
from flask import Blueprint, request
from flask_login import current_user
from app.extensions import db, limiter
from app.models.bus import Bus
from app.models.change_request import ChangeRequest
from app.utils.security import login_required_json, security_log
from app.utils.responses import ok, fail
from app.utils.validators import (
    bounded_float,
    clean_multiline_text,
    clean_text,
    normalize_spots,
    normalize_timings,
)

bp = Blueprint("change_requests", __name__, url_prefix="/api/change-requests")

_MAX_PAYLOAD_BYTES = 64 * 1024
_ALLOWED_BUS_TYPES = {"Government", "Private", "Deluxe", "Fast"}


def _normalize_change_payload(data: dict) -> dict:
    """
    Whitelist and sanitize the fields a change request may propose. Unknown
    keys are dropped so a request can never smuggle arbitrary data into the
    stored JSON that is later applied to a bus.
    """
    cleaned = {}

    name = clean_text(data.get("bus_name"), max_length=255)
    if name:
        cleaned["bus_name"] = name

    for field, limit in (("bus_number", 64), ("operator", 255)):
        value = clean_text(data.get(field), max_length=limit)
        if value:
            cleaned[field] = value

    bus_type = clean_text(data.get("bus_type"), max_length=64)
    if bus_type in _ALLOWED_BUS_TYPES:
        cleaned["bus_type"] = bus_type

    for field, limit in (("start_stop", 255), ("destination_stop", 255)):
        value = clean_text(data.get(field), max_length=limit)
        if value:
            cleaned[field] = value

    boarded = clean_multiline_text(data.get("boarded_stops"), max_length=2000)
    if boarded:
        cleaned["boarded_stops"] = boarded

    reaching = clean_text(data.get("reaching_time"), max_length=64)
    if reaching:
        cleaned["reaching_time"] = reaching

    if "spots" in data or "stop_timings" in data:
        spots = normalize_spots(data.get("spots") or data.get("stop_timings"))
        if spots:
            cleaned["spots"] = spots

    if "bus_timings" in data or "timings" in data:
        timings = normalize_timings(data.get("bus_timings") or data.get("timings"))
        if timings:
            cleaned["bus_timings"] = timings

    if "bus_fare" in data or "fare" in data:
        fare = bounded_float(data.get("bus_fare", data.get("fare")), 0, 100000)
        if fare is not None:
            cleaned["bus_fare"] = fare

    return cleaned


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _apply_payload_to_bus(bus: Bus, payload: dict):
    """
    Applies a normalized payload dict to a Bus instance (in-place, no commit).
    Every value is re-sanitized so legacy pending requests written before the
    validator existed are also safe.
    """
    if not isinstance(payload, dict):
        return

    if "bus_name" in payload:
        name = clean_text(payload.get("bus_name"), max_length=255)
        if name:
            bus.bus_name = name

    for field, limit in (("bus_number", 64), ("operator", 255)):
        if field in payload:
            bus.__setattr__(field, clean_text(payload.get(field), max_length=limit))

    if "bus_type" in payload and payload.get("bus_type") in _ALLOWED_BUS_TYPES:
        bus.bus_type = payload["bus_type"]

    spots_present = "spots" in payload or "stop_timings" in payload
    if spots_present:
        cleaned_spots = normalize_spots(payload.get("spots") or payload.get("stop_timings"))
        if cleaned_spots:
            bus.stop_timings = json.dumps(cleaned_spots)
            bus.start_stop = cleaned_spots[0]["stop"]
            bus.destination_stop = cleaned_spots[-1]["stop"]
            bus.boarded_stops = (
                ", ".join(s["stop"] for s in cleaned_spots[1:-1])
                if len(cleaned_spots) > 2
                else None
            )
            if cleaned_spots[0].get("time"):
                bus.bus_timings = cleaned_spots[0]["time"]
            if cleaned_spots[-1].get("time"):
                bus.reaching_time = cleaned_spots[-1]["time"]
        else:
            bus.stop_timings = None

    if "bus_timings" in payload:
        timings = normalize_timings(payload.get("bus_timings"))
        if timings:
            bus.bus_timings = timings

    if "bus_fare" in payload:
        fare = bounded_float(payload.get("bus_fare"), 0, 100000)
        if fare is not None:
            bus.bus_fare = fare

    if not spots_present:
        if "boarded_stops" in payload:
            bus.boarded_stops = clean_multiline_text(
                payload.get("boarded_stops"), max_length=2000
            )

        start_stop = clean_text(payload.get("start_stop"), max_length=255)
        if start_stop:
            bus.start_stop = start_stop

        destination_stop = clean_text(payload.get("destination_stop"), max_length=255)
        if destination_stop:
            bus.destination_stop = destination_stop

        if "reaching_time" in payload:
            bus.reaching_time = clean_text(payload.get("reaching_time"), max_length=64)

    bus.updated_at = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@bp.route("", methods=["POST"])
@login_required_json
@limiter.limit("30 per hour")
def submit_change_request():
    """Submit a change proposal for a bus route."""
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return fail("Invalid request body.", 422)

    try:
        bus_id = int(data.get("bus_id"))
    except (TypeError, ValueError):
        return fail("bus_id must be a valid number.", 422)
    if bus_id <= 0:
        return fail("bus_id must be a valid number.", 422)

    bus = db.session.get(Bus, bus_id)
    if not bus:
        return fail("Bus not found.", 404)

    payload = _normalize_change_payload(data)
    if not payload:
        return fail("No change data provided.", 422)

    serialized = json.dumps(payload, separators=(",", ":"))
    if len(serialized) > _MAX_PAYLOAD_BYTES:
        return fail("Change request data is too large.", 413)

    # Auto-apply when: bus has no owner OR requester is the owner
    is_owner = (bus.user_id is None) or (bus.user_id == current_user.id)

    if is_owner:
        _apply_payload_to_bus(bus, payload)
        db.session.commit()
        return ok(
            data={"bus": bus.to_dict(), "auto_applied": True},
            message="Changes applied successfully.",
        )

    # Otherwise → create a pending request
    cr = ChangeRequest(
        bus_id=bus.id,
        requester_id=current_user.id,
        status="pending",
        payload=serialized,
    )
    db.session.add(cr)
    db.session.commit()
    return ok(
        data={"change_request": cr.to_dict(), "auto_applied": False},
        message="Change request submitted. The route owner will review your suggestion.",
        status=201,
    )


@bp.route("/pending", methods=["GET"])
@login_required_json
def list_pending_requests():
    """Return all pending change requests for buses owned by the current user."""
    owned_bus_ids = [
        b.id for b in Bus.query.filter_by(user_id=current_user.id).with_entities(Bus.id)
    ]
    if not owned_bus_ids:
        return ok(data=[], message="No pending requests.")

    requests_qs = (
        ChangeRequest.query
        .filter(
            ChangeRequest.bus_id.in_(owned_bus_ids),
            ChangeRequest.status == "pending",
        )
        .order_by(ChangeRequest.created_at.desc())
        .all()
    )
    return ok(data=[cr.to_dict() for cr in requests_qs])


@bp.route("/<int:cr_id>/accept", methods=["POST"])
@login_required_json
def accept_change_request(cr_id):
    """Accept a pending change request (bus owner only) — applies the changes."""
    cr = db.session.get(ChangeRequest, cr_id)
    if not cr:
        return fail("Change request not found.", 404)

    bus = db.session.get(Bus, cr.bus_id)
    if not bus:
        return fail("Bus not found.", 404)

    if bus.user_id != current_user.id:
        security_log(
            "change_request_forbidden",
            user_id=current_user.id,
            bus_id=bus.id,
            ip=request.remote_addr,
        )
        return fail("Only the route owner can accept change requests.", 403)

    if cr.status != "pending":
        return fail(f"This request is already {cr.status}.", 409)

    if len(cr.payload or "") > _MAX_PAYLOAD_BYTES:
        return fail("Change request payload is invalid.", 422)
    try:
        payload = json.loads(cr.payload)
    except Exception:
        return fail("Change request payload is invalid.", 422)
    if not isinstance(payload, dict):
        return fail("Change request payload is invalid.", 422)

    _apply_payload_to_bus(bus, payload)
    cr.status = "accepted"
    cr.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    return ok(
        data={"bus": bus.to_dict(), "change_request": cr.to_dict()},
        message="Change request accepted. Route updated successfully.",
    )


@bp.route("/<int:cr_id>/reject", methods=["POST"])
@login_required_json
def reject_change_request(cr_id):
    """Reject a pending change request (bus owner only)."""
    cr = db.session.get(ChangeRequest, cr_id)
    if not cr:
        return fail("Change request not found.", 404)

    bus = db.session.get(Bus, cr.bus_id)
    if not bus:
        return fail("Bus not found.", 404)

    if bus.user_id != current_user.id:
        security_log(
            "change_request_forbidden",
            user_id=current_user.id,
            bus_id=bus.id,
            ip=request.remote_addr,
        )
        return fail("Only the route owner can reject change requests.", 403)

    if cr.status != "pending":
        return fail(f"This request is already {cr.status}.", 409)

    cr.status = "rejected"
    cr.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    return ok(
        data={"change_request": cr.to_dict()},
        message="Change request rejected.",
    )
