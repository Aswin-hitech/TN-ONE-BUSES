from flask import Blueprint, request, current_app
from flask_login import current_user
import requests
import uuid
from pydantic import ValidationError
from app.extensions import db
from app.models.bus import Bus, BusTiming, BusPhoto
from app.schemas.bus import BusCreate
from app.utils.security import login_required_json
from app.utils.responses import ok, fail

bp = Blueprint("buses", __name__, url_prefix="/api/buses")


@bp.route("", methods=["GET"])
def list_buses():
    buses = Bus.query.order_by(Bus.bus_name.asc()).limit(100).all()
    return ok(data=[b.to_dict() for b in buses])


@bp.route("/<int:bus_id>", methods=["GET"])
def get_bus(bus_id):
    bus = Bus.query.get(bus_id)
    if not bus:
        return fail("Bus not found.", 404)
    return ok(data=bus.to_dict())


@bp.route("", methods=["POST"])
@login_required_json
def create_bus():
    try:
        payload = BusCreate(**(request.get_json(silent=True) or {}))
    except ValidationError as e:
        return fail(_first_error(e), 422)

    bus = Bus(
        bus_name=payload.bus_name,
        bus_number=payload.bus_number,
        operator=payload.operator,
        bus_type=payload.bus_type,
    )
    db.session.add(bus)
    data = request.get_json(silent=True) or {}
    for i, timing in enumerate(data.get("timings") or []):
        if timing: bus.timings.append(BusTiming(timing=str(timing).strip(), sort_order=i))
    for url in data.get("photos") or []:
        if url: bus.photos.append(BusPhoto(url=str(url).strip()))
    db.session.commit()
    return ok(data=bus.to_dict(), message="Bus created.", status=201)

@bp.route("/photos", methods=["POST"])
@login_required_json
def upload_photos():
    """Upload one or more images to the configured Supabase Storage bucket."""
    base, key, bucket = current_app.config.get("SUPABASE_URL"), current_app.config.get("SUPABASE_SERVICE_KEY"), current_app.config.get("SUPABASE_BUCKET")
    files = request.files.getlist("photos")
    if not base or not key or not files:
        return fail("Photo storage is not configured or no photos were selected.", 422)
    urls = []
    for photo in files[:8]:
        if not photo.content_type or not photo.content_type.startswith("image/"):
            return fail("Only image files are allowed.", 422)
        name = f"{current_user.id}/{uuid.uuid4().hex}-{photo.filename.replace(' ', '-')[:80]}"
        target = f"{base.rstrip('/')}/storage/v1/object/{bucket}/{name}"
        response = requests.post(target, headers={"Authorization": f"Bearer {key}", "apikey": key, "Content-Type": photo.content_type}, data=photo.read(), timeout=20)
        if not response.ok: return fail("A photo could not be uploaded.", 502)
        urls.append(f"{base.rstrip('/')}/storage/v1/object/public/{bucket}/{name}")
    return ok(data={"urls": urls}, message="Photos uploaded.")


def _first_error(validation_error: ValidationError) -> str:
    errors = validation_error.errors()
    if errors:
        return errors[0].get("msg", "Invalid input.")
    return "Invalid input."
