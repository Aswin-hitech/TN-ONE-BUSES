from flask import Blueprint, request, current_app
from flask_login import current_user
import json
import requests
import uuid
from pydantic import ValidationError
from werkzeug.utils import secure_filename
from app.extensions import db, limiter
from app.models.bus import Bus
from app.schemas.bus import BusCreate
from app.utils.security import login_required_json, security_log
from app.utils.responses import ok, fail
from app.utils.validators import (
    bounded_float,
    clean_multiline_text,
    clean_text,
    normalize_spots,
    normalize_timings,
    sanitize_text,
)

bp = Blueprint("buses", __name__, url_prefix="/api/buses")

_MAX_PHOTO_BYTES = 5 * 1024 * 1024
_MAX_PHOTOS = 8
_MAX_PHOTO_FILENAME = 60

# Sniffed from the bytes, never trusted from the client's Content-Type header.
_IMAGE_SIGNATURES = (
    (b"\xff\xd8\xff", "image/jpeg", "jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", "png"),
    (b"GIF87a", "image/gif", "gif"),
    (b"GIF89a", "image/gif", "gif"),
)


def _detect_image(data: bytes):
    for signature, mime, ext in _IMAGE_SIGNATURES:
        if data.startswith(signature):
            return mime, ext
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None, None


@bp.route("", methods=["GET"])
def list_buses():
    buses = Bus.query.order_by(Bus.bus_name.asc()).limit(100).all()
    return ok(data=[b.to_dict() for b in buses])


@bp.route("/<int:bus_id>", methods=["GET"])
def get_bus(bus_id):
    bus = db.session.get(Bus, bus_id)
    if not bus:
        return fail("Bus not found.", 404)
    return ok(data=bus.to_dict())


@bp.route("", methods=["POST"])
@login_required_json
@limiter.limit("30 per hour")
def create_bus():
    data = request.get_json(silent=True) or {}
    try:
        payload = BusCreate(**data)
    except ValidationError as e:
        return fail(_first_error(e), 422)

    cleaned_spots = payload.spots or payload.stop_timings or []
    timings_val = normalize_timings(
        data.get("bus_timings") or data.get("timings")
    )

    stop_timings_str = None
    if cleaned_spots:
        stop_timings_str = json.dumps(cleaned_spots)
        if not payload.start_stop or payload.start_stop == "Origin":
            payload.start_stop = cleaned_spots[0]["stop"]
        if not payload.destination_stop or payload.destination_stop == "Destination":
            payload.destination_stop = cleaned_spots[-1]["stop"]
        if not payload.boarded_stops and len(cleaned_spots) > 2:
            payload.boarded_stops = ", ".join(s["stop"] for s in cleaned_spots[1:-1])
        if not timings_val and cleaned_spots[0].get("time"):
            timings_val = cleaned_spots[0]["time"]
        if not payload.reaching_time and cleaned_spots[-1].get("time"):
            payload.reaching_time = cleaned_spots[-1]["time"]

    fare = bounded_float(payload.bus_fare, 0, 100000)
    distance = bounded_float(payload.distance_km, 0, 10000)

    bus = Bus(
        bus_name=payload.bus_name,
        bus_number=payload.bus_number,
        operator=payload.operator or payload.bus_type,
        bus_type=payload.bus_type or "Government",
        user_id=current_user.id,
        start_stop=payload.start_stop or "Origin",
        destination_stop=payload.destination_stop or "Destination",
        boarded_stops=payload.boarded_stops,
        bus_timings=timings_val,
        bus_fare=fare if fare is not None else 20.0,
        distance_km=distance,
        reaching_time=payload.reaching_time,
        stop_timings=stop_timings_str,
    )
    db.session.add(bus)
    db.session.commit()
    return ok(data=bus.to_dict(), message="Bus created.", status=201)


@bp.route("/<int:bus_id>", methods=["PUT"])
@login_required_json
def update_bus(bus_id):
    bus = db.session.get(Bus, bus_id)
    if not bus:
        return fail("Bus not found.", 404)

    # Only the bus owner may edit directly; other users must use change requests.
    if bus.user_id is not None and bus.user_id != current_user.id:
        security_log(
            "bus_update_forbidden",
            user_id=current_user.id,
            bus_id=bus.id,
            ip=request.remote_addr,
        )
        return fail(
            "You do not own this route. Please submit a change request instead.",
            403,
        )

    data = request.get_json(silent=True) or {}
    spots_present = "spots" in data or "stop_timings" in data

    if "bus_name" in data:
        name = clean_text(data["bus_name"], max_length=255)
        if not name:
            return fail("Bus name cannot be empty.", 422)
        bus.bus_name = name

    if "bus_number" in data:
        bus.bus_number = clean_text(data["bus_number"], max_length=64)

    if "operator" in data:
        bus.operator = clean_text(data["operator"], max_length=255)

    if "bus_type" in data:
        allowed_types = {"Government", "Private", "Deluxe", "Fast"}
        new_type = clean_text(data["bus_type"], max_length=64)
        if new_type in allowed_types:
            bus.bus_type = new_type

    if spots_present:
        cleaned_spots = normalize_spots(data.get("spots") or data.get("stop_timings"))
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

    if "bus_timings" in data:
        bus.bus_timings = normalize_timings(data.get("bus_timings"))
    elif "timings" in data and isinstance(data["timings"], list):
        bus.bus_timings = normalize_timings(data["timings"])

    if "bus_fare" in data or "fare" in data:
        raw_fare = data.get("bus_fare", data.get("fare"))
        if raw_fare is not None:
            fare = bounded_float(raw_fare, 0, 100000)
            if fare is None:
                return fail("Fare must be a number between 0 and 100000.", 422)
            bus.bus_fare = fare

    if not spots_present:
        if "boarded_stops" in data:
            bus.boarded_stops = clean_multiline_text(data["boarded_stops"], max_length=2000)

        start_stop = clean_text(data.get("start_stop"), max_length=255)
        if "start_stop" in data and start_stop:
            bus.start_stop = start_stop

        destination_stop = clean_text(data.get("destination_stop"), max_length=255)
        if "destination_stop" in data and destination_stop:
            bus.destination_stop = destination_stop

        if "reaching_time" in data:
            bus.reaching_time = clean_text(data["reaching_time"], max_length=64)

    db.session.commit()
    return ok(data=bus.to_dict(), message="Bus details updated successfully.")


@bp.route("/<int:bus_id>/stops", methods=["POST"])
@login_required_json
def add_stop_to_bus_route(bus_id):
    bus = db.session.get(Bus, bus_id)
    if not bus:
        return fail("Bus not found.", 404)

    data = request.get_json(silent=True) or {}
    stop_name = clean_text(data.get("stop_name") or data.get("stop"), max_length=255)
    if not stop_name:
        return fail("Stop name is required.", 422)

    stop_time = sanitize_text(data.get("time") or data.get("timing") or "", max_length=32)
    after_stop = clean_text(data.get("after_stop"), max_length=255)
    before_stop = clean_text(data.get("before_stop"), max_length=255)

    from app.services.bus_service import add_stop_to_bus
    updated_bus = add_stop_to_bus(
        bus=bus,
        stop_name=stop_name,
        stop_time=stop_time or None,
        after_stop=after_stop,
        before_stop=before_stop,
    )

    return ok(data=updated_bus.to_dict(), message="Stop added to bus successfully.")



@bp.route("/photos", methods=["POST"])
@login_required_json
@limiter.limit("20 per hour")
def upload_photos():
    """Upload one or more images to the configured Supabase Storage bucket."""
    base = (current_app.config.get("SUPABASE_URL") or "").rstrip("/")
    key = current_app.config.get("SUPABASE_SERVICE_KEY")
    bucket = current_app.config.get("SUPABASE_BUCKET")
    files = request.files.getlist("photos")
    if not base or not key or not files:
        return fail("Photo storage is not configured or no photos were selected.", 422)
    if len(files) > _MAX_PHOTOS:
        return fail(f"You can upload at most {_MAX_PHOTOS} photos.", 422)

    urls = []
    for photo in files:
        raw = photo.read(_MAX_PHOTO_BYTES + 1)
        if len(raw) > _MAX_PHOTO_BYTES:
            return fail("Each photo must be under 5 MB.", 413)

        mime, ext = _detect_image(raw)
        if not mime:
            security_log("upload_rejected", user_id=current_user.id, ip=request.remote_addr)
            return fail("Only JPEG, PNG, GIF, or WebP images are allowed.", 422)

        base_name = (secure_filename(photo.filename or "") or "photo").rsplit(".", 1)[0]
        safe_name = f"{base_name[:_MAX_PHOTO_FILENAME] or 'photo'}.{ext}"
        name = f"{current_user.id}/{uuid.uuid4().hex}-{safe_name}"
        target = f"{base}/storage/v1/object/{bucket}/{name}"
        response = requests.post(
            target,
            headers={
                "Authorization": f"Bearer {key}",
                "apikey": key,
                "Content-Type": mime,
                "x-upsert": "false",
            },
            data=raw,
            timeout=20,
        )
        if not response.ok:
            current_app.logger.warning("Supabase upload failed with status %s", response.status_code)
            return fail("A photo could not be uploaded.", 502)
        urls.append(f"{base}/storage/v1/object/public/{bucket}/{name}")

    return ok(data={"urls": urls}, message="Photos uploaded.")



def _first_error(validation_error: ValidationError) -> str:
    errors = validation_error.errors()
    if errors:
        return errors[0].get("msg", "Invalid input.")
    return "Invalid input."
