from flask import Blueprint
from flask_login import current_user
from app.models.report import BusReport
from app.utils.security import login_required_json
from app.utils.responses import ok

bp = Blueprint("users", __name__, url_prefix="/api/users")


@bp.route("/me")
@login_required_json
def me():
    return ok(data=current_user.to_public_dict())


@bp.route("/me/reports")
@login_required_json
def my_reports():
    reports = (
        BusReport.query.filter_by(user_id=current_user.id)
        .order_by(BusReport.reported_at.desc())
        .limit(50)
        .all()
    )
    return ok(data=[r.to_dict() for r in reports])
