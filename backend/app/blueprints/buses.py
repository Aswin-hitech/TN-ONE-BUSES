from flask import Blueprint, request, current_app
from flask_login import current_user
import requests
import uuid
from pydantic import ValidationError
from werkzeug.utils import secure_filename
from app.extensions import db
from app.models.bus import Bus
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
    bus = db.session.get(Bus, bus_id)
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

    data = request.get_json(silent=True) or {}
    timings_val = data.get("bus_timings")
    if not timings_val and data.get("timings"):
        timings_val = ", ".join(data.get("timings"))

    import json
    from app.models.bus import format_time_ampm

    spots_data = data.get("spots") or data.get("stop_timings")
    stop_timings_str = None
    if spots_data:
        if isinstance(spots_data, str):
            try:
                spots_list = json.loads(spots_data)
            except Exception:
                spots_list = []
        elif isinstance(spots_data, list):
            spots_list = spots_data
        else:
            spots_list = []

        cleaned_spots = []
        for s in spots_list:
            if isinstance(s, dict):
                s_name = (s.get("stop") or s.get("stop_name") or s.get("name") or "").strip()
                s_time = (s.get("time") or s.get("timing") or "").strip()
                if s_name:
                    cleaned_spots.append({"stop": s_name, "time": format_time_ampm(s_time)})
            elif isinstance(s, str) and s.strip():
                cleaned_spots.append({"stop": s.strip(), "time": ""})
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
        bus_fare=float(payload.bus_fare) if payload.bus_fare else 20.0,
        distance_km=float(payload.distance_km) if payload.distance_km else None,
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
        return fail(
            "You do not own this route. Please submit a change request instead.",
            403,
        )

    data = request.get_json(silent=True) or {}

    def _str(val, max_len=255):
        """Safely cast to stripped string with a max length cap."""
        return str(val).strip()[:max_len] if val is not None else None

    if "bus_name" in data:
        name = _str(data["bus_name"], 255)
        if not name:
            return fail("Bus name cannot be empty.", 422)
        bus.bus_name = name

    if "bus_number" in data:
        bus.bus_number = _str(data["bus_number"], 64)

    if "operator" in data:
        bus.operator = _str(data["operator"], 255)

    if "bus_type" in data:
        allowed_types = {"Government", "Private", "Deluxe", "Fast"}
        new_type = _str(data["bus_type"], 64)
        if new_type in allowed_types:
            bus.bus_type = new_type

    if "spots" in data or "stop_timings" in data:
        import json
        from app.models.bus import format_time_ampm

        spots_data = data.get("spots") or data.get("stop_timings")
        if spots_data:
            if isinstance(spots_data, str):
                try:
                    spots_list = json.loads(spots_data)
                except Exception:
                    spots_list = []
            elif isinstance(spots_data, list):
                spots_list = spots_data
            else:
                spots_list = []

            cleaned_spots = []
            for s in spots_list:
                if isinstance(s, dict):
                    s_name = (s.get("stop") or s.get("stop_name") or s.get("name") or "").strip()
                    s_time = (s.get("time") or s.get("timing") or "").strip()
                    if s_name:
                        cleaned_spots.append({"stop": s_name, "time": format_time_ampm(s_time)})
                elif isinstance(s, str) and s.strip():
                    cleaned_spots.append({"stop": s.strip(), "time": ""})

            if cleaned_spots:
                bus.stop_timings = json.dumps(cleaned_spots)
                bus.start_stop = cleaned_spots[0]["stop"]
                bus.destination_stop = cleaned_spots[-1]["stop"]
                if len(cleaned_spots) > 2:
                    bus.boarded_stops = ", ".join(s["stop"] for s in cleaned_spots[1:-1])
                if cleaned_spots[0].get("time"):
                    bus.bus_timings = cleaned_spots[0]["time"]
                if cleaned_spots[-1].get("time"):
                    bus.reaching_time = cleaned_spots[-1]["time"]
        else:
            bus.stop_timings = None

    if "bus_timings" in data:
        raw_timings = str(data["bus_timings"]).strip()
        from app.models.bus import format_time_ampm
        # Normalize each comma-separated timing to AM/PM
        normalized = ", ".join(
            format_time_ampm(t.strip()) for t in raw_timings.split(",") if t.strip()
        )
        bus.bus_timings = normalized or raw_timings
    elif "timings" in data and isinstance(data["timings"], list):
        from app.models.bus import format_time_ampm
        bus.bus_timings = ", ".join(
            format_time_ampm(str(t).strip()) for t in data["timings"] if str(t).strip()
        )

    if "bus_fare" in data or "fare" in data:
        raw_fare = data.get("bus_fare", data.get("fare"))
        try:
            bus.bus_fare = float(raw_fare)
        except (ValueError, TypeError):
            pass

    if "boarded_stops" in data and ("spots" not in data and "stop_timings" not in data):
        bus.boarded_stops = str(data["boarded_stops"]).strip() if data["boarded_stops"] else None

    if "start_stop" in data and str(data["start_stop"]).strip() and ("spots" not in data and "stop_timings" not in data):
        bus.start_stop = str(data["start_stop"]).strip()

    if "destination_stop" in data and str(data["destination_stop"]).strip() and ("spots" not in data and "stop_timings" not in data):
        bus.destination_stop = str(data["destination_stop"]).strip()

    if "reaching_time" in data and ("spots" not in data and "stop_timings" not in data):
        bus.reaching_time = str(data["reaching_time"]).strip() if data["reaching_time"] else None

    db.session.commit()
    return ok(data=bus.to_dict(), message="Bus details updated successfully.")


@bp.route("/<int:bus_id>/stops", methods=["POST"])
@login_required_json
def add_stop_to_bus_route(bus_id):
    bus = db.session.get(Bus, bus_id)
    if not bus:
        return fail("Bus not found.", 404)

    data = request.get_json(silent=True) or {}
    stop_name = data.get("stop_name") or data.get("stop")
    if not stop_name or not str(stop_name).strip():
        return fail("Stop name is required.", 422)

    stop_time = data.get("time") or data.get("timing")
    after_stop = data.get("after_stop")
    before_stop = data.get("before_stop")

    from app.services.bus_service import add_stop_to_bus
    updated_bus = add_stop_to_bus(
        bus=bus,
        stop_name=str(stop_name).strip(),
        stop_time=str(stop_time).strip() if stop_time else None,
        after_stop=str(after_stop).strip() if after_stop else None,
        before_stop=str(before_stop).strip() if before_stop else None,
    )

    return ok(data=updated_bus.to_dict(), message="Stop added to bus successfully.")



@bp.route("/photos", methods=["POST"])
@login_required_json
def upload_photos():
    """Upload one or more images to the configured Supabase Storage bucket."""
    base, key, bucket = current_app.config.get("SUPABASE_URL"), current_app.config.get("SUPABASE_SERVICE_KEY"), current_app.config.get("SUPABASE_BUCKET")
    files = request.files.getlist("photos")
    if not base or not key or not files:
        return fail("Photo storage is not configured or no photos were selected.", 422)
    urls = []
    MAX_PHOTO_BYTES = 5 * 1024 * 1024  # 5 MB per photo
    for photo in files[:8]:
        if not photo.content_type or not photo.content_type.startswith("image/"):
            return fail("Only image files are allowed.", 422)

        # Check file size without reading the whole file into memory at once
        photo.seek(0, 2)  # seek to end
        size = photo.tell()
        photo.seek(0)     # reset to start
        if size > MAX_PHOTO_BYTES:
            return fail("Each photo must be under 5 MB.", 413)

        safe_name = secure_filename(photo.filename) or "photo.jpg"
        name = f"{current_user.id}/{uuid.uuid4().hex}-{safe_name[:80]}"
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
