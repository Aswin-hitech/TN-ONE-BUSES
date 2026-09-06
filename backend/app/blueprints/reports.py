from flask import Blueprint, request
from flask_login import current_user
from pydantic import ValidationError
from app.extensions import limiter
from app.models.report import BusReport, ReportStatus
from app.schemas.report import BusReportCreate
from app.services.report_service import create_bus_report, DuplicateReportError
from app.utils.security import login_required_json
from app.utils.responses import ok, fail

bp = Blueprint("reports", __name__, url_prefix="/api/reports")


@bp.route("", methods=["POST"])
@login_required_json
@limiter.limit("20 per hour")
def submit_report():
    try:
        payload = BusReportCreate(**(request.get_json(silent=True) or {}))
    except ValidationError as e:
        return fail(_first_error(e), 422)

    try:
        report = create_bus_report(current_user.id, payload)
    except DuplicateReportError as e:
        return fail(str(e), 429, code="duplicate_report")
    except Exception:
        from flask import current_app
        current_app.logger.exception("Failed to create bus report")
        return fail("Something went wrong. Please try again.", 500)

    return ok(data=report.to_dict(), message="Bus report added successfully.", status=201)


@bp.route("/recent", methods=["GET"])
def recent_reports():
    limit = min(int(request.args.get("limit", 20)), 50)
    reports = (
        BusReport.query.filter_by(status=ReportStatus.ACTIVE)
        .order_by(BusReport.reported_at.desc())
        .limit(limit)
        .all()
    )
    return ok(data=[r.to_dict() for r in reports])


def _first_error(validation_error: ValidationError) -> str:
    errors = validation_error.errors()
    if errors:
        return errors[0].get("msg", "Please check the boarding stop, destination and time.")
    return "Please check the boarding stop, destination and time."
