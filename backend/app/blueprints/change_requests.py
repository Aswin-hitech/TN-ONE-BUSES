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
from app.extensions import db
from app.models.bus import Bus
from app.models.change_request import ChangeRequest
from app.utils.security import login_required_json
from app.utils.responses import ok, fail

bp = Blueprint("change_requests", __name__, url_prefix="/api/change-requests")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _apply_payload_to_bus(bus: Bus, payload: dict):
    """
    Applies a validated payload dict to a Bus instance (in-place, no commit).
    Mirrors the logic in buses.update_bus but works from a plain dict so it
    can be shared between the direct-apply and accept-request paths.
    """
    import json as _json
    from app.models.bus import format_time_ampm

    def _str(val, max_len=255):
        return str(val).strip()[:max_len] if val is not None else None

    if "bus_name" in payload:
        name = _str(payload["bus_name"], 255)
        if name:
            bus.bus_name = name

    if "bus_number" in payload:
        bus.bus_number = _str(payload["bus_number"], 64)

    if "operator" in payload:
        bus.operator = _str(payload["operator"], 255)

    if "bus_type" in payload:
        allowed = {"Government", "Private", "Deluxe", "Fast"}
        new_type = _str(payload["bus_type"], 64)
        if new_type in allowed:
            bus.bus_type = new_type

    if "spots" in payload or "stop_timings" in payload:
        spots_data = payload.get("spots") or payload.get("stop_timings")
        if spots_data:
            if isinstance(spots_data, str):
                try:
                    spots_list = _json.loads(spots_data)
                except Exception:
                    spots_list = []
            elif isinstance(spots_data, list):
                spots_list = spots_data
            else:
                spots_list = []

            cleaned = []
            for s in spots_list:
                if isinstance(s, dict):
                    s_name = (s.get("stop") or s.get("stop_name") or s.get("name") or "").strip()
                    s_time = (s.get("time") or s.get("timing") or "").strip()
                    if s_name:
                        cleaned.append({"stop": s_name, "time": format_time_ampm(s_time)})
                elif isinstance(s, str) and s.strip():
                    cleaned.append({"stop": s.strip(), "time": ""})

            if cleaned:
                bus.stop_timings = _json.dumps(cleaned)
                bus.start_stop = cleaned[0]["stop"]
                bus.destination_stop = cleaned[-1]["stop"]
                if len(cleaned) > 2:
                    bus.boarded_stops = ", ".join(c["stop"] for c in cleaned[1:-1])
                if cleaned[0].get("time"):
                    bus.bus_timings = cleaned[0]["time"]
                if cleaned[-1].get("time"):
                    bus.reaching_time = cleaned[-1]["time"]
        else:
            bus.stop_timings = None

    if "bus_timings" in payload:
        bus.bus_timings = str(payload["bus_timings"]).strip()
    elif "timings" in payload and isinstance(payload["timings"], list):
        bus.bus_timings = ", ".join(str(t).strip() for t in payload["timings"] if str(t).strip())

    if "bus_fare" in payload or "fare" in payload:
        raw = payload.get("bus_fare", payload.get("fare"))
        try:
            bus.bus_fare = float(raw)
        except (ValueError, TypeError):
            pass

    no_spots = "spots" not in payload and "stop_timings" not in payload
    if "boarded_stops" in payload and no_spots:
        bus.boarded_stops = str(payload["boarded_stops"]).strip() if payload["boarded_stops"] else None

    if "start_stop" in payload and str(payload["start_stop"]).strip() and no_spots:
        bus.start_stop = str(payload["start_stop"]).strip()

    if "destination_stop" in payload and str(payload["destination_stop"]).strip() and no_spots:
        bus.destination_stop = str(payload["destination_stop"]).strip()

    if "reaching_time" in payload and no_spots:
        bus.reaching_time = str(payload["reaching_time"]).strip() if payload["reaching_time"] else None

    bus.updated_at = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@bp.route("", methods=["POST"])
@login_required_json
def submit_change_request():
    """Submit a change proposal for a bus route."""
    data = request.get_json(silent=True) or {}
    bus_id = data.get("bus_id")
    if not bus_id:
        return fail("bus_id is required.", 422)

    bus = db.session.get(Bus, int(bus_id))
    if not bus:
        return fail("Bus not found.", 404)

    # Strip bus_id from the payload stored in DB (it's redundant)
    payload = {k: v for k, v in data.items() if k != "bus_id"}

    if not payload:
        return fail("No change data provided.", 422)

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
        payload=json.dumps(payload),
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
    # Find bus IDs owned by the current user
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
        return fail("Only the route owner can accept change requests.", 403)

    if cr.status != "pending":
        return fail(f"This request is already {cr.status}.", 409)

    try:
        payload = json.loads(cr.payload)
    except Exception:
        return fail("Invalid payload in change request.", 500)

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
