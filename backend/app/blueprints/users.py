from flask import Blueprint
from flask_login import current_user
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
    from app.models.bus import Bus
    buses = Bus.query.filter_by(user_id=current_user.id).order_by(Bus.created_at.desc()).all()
    return ok(data=[b.to_dict() for b in buses])
