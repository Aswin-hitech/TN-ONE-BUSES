import enum
from datetime import datetime, timezone
from app.extensions import db


class ReportStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    EXPIRED = "EXPIRED"
    FLAGGED = "FLAGGED"


class BusReport(db.Model):
    """
    The core crowdsourcing table. A single user-submitted observation of a
    bus at a particular boarding stop, heading to a particular destination.

    IMPORTANT: `boarding_time` (when the bus was/expected to be boarded) is
    distinct from `reported_at` (when the user submitted the report).
    """
    __tablename__ = "bus_reports"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False, index=True)
    route_id = db.Column(db.Integer, db.ForeignKey("routes.id", ondelete="SET NULL"), nullable=True, index=True)
    boarding_stop_id = db.Column(db.Integer, db.ForeignKey("stops.id", ondelete="CASCADE"), nullable=False, index=True)
    destination_stop_id = db.Column(db.Integer, db.ForeignKey("stops.id", ondelete="CASCADE"), nullable=False, index=True)

    boarding_time = db.Column(db.DateTime(timezone=True), nullable=True, index=True)
    reported_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    notes = db.Column(db.String(500), nullable=True)
    status = db.Column(
        db.Enum(ReportStatus, name="report_status_enum"),
        nullable=False,
        default=ReportStatus.ACTIVE,
        index=True,
    )

    # Reserved for future community-verification features (upvote/downvote
    # confidence scoring). Not exposed via API yet, but present so the
    # schema doesn't need a breaking migration later.
    confirm_count = db.Column(db.Integer, nullable=False, default=0)
    flag_count = db.Column(db.Integer, nullable=False, default=0)

    user = db.relationship("User", back_populates="reports")
    bus = db.relationship("Bus", back_populates="reports")
    route = db.relationship("Route", back_populates="reports")
    boarding_stop = db.relationship("Stop", foreign_keys=[boarding_stop_id])
    destination_stop = db.relationship("Stop", foreign_keys=[destination_stop_id])

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "bus": self.bus.to_dict() if self.bus else None,
            "route_id": self.route_id,
            "boarding_stop": self.boarding_stop.to_dict() if self.boarding_stop else None,
            "destination_stop": self.destination_stop.to_dict() if self.destination_stop else None,
            "boarding_time": self.boarding_time.isoformat() if self.boarding_time else None,
            "reported_at": self.reported_at.isoformat() if self.reported_at else None,
            "notes": self.notes,
            "status": self.status.value if self.status else None,
        }

    def __repr__(self):
        return f"<BusReport bus={self.bus_id} boarding={self.boarding_stop_id} dest={self.destination_stop_id}>"
