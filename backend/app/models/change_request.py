from datetime import datetime, timezone
from app.extensions import db


class ChangeRequest(db.Model):
    """
    Stores a pending edit proposal for a bus route submitted by a non-owner.
    The bus owner can accept (apply changes) or reject (discard) each request.
    """
    __tablename__ = "change_requests"

    id = db.Column(db.Integer, primary_key=True)
    bus_id = db.Column(
        db.Integer,
        db.ForeignKey("buses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requester_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # "pending" | "accepted" | "rejected"
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)

    # JSON-encoded dict of the proposed field values (same shape as PUT /api/buses/:id body)
    payload = db.Column(db.Text, nullable=False)

    created_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships (for convenient access)
    bus = db.relationship("Bus", backref=db.backref("change_requests", lazy="dynamic"))
    requester = db.relationship("User", backref=db.backref("change_requests", lazy="dynamic"))

    def to_dict(self):
        import json
        try:
            payload_data = json.loads(self.payload)
        except Exception:
            payload_data = {}

        requester_info = None
        if self.requester:
            requester_info = {
                "id": self.requester.id,
                "name": self.requester.name,
                "username": self.requester.username,
            }

        bus_info = None
        if self.bus:
            bus_info = {
                "id": self.bus.id,
                "bus_name": self.bus.bus_name,
                "bus_number": self.bus.bus_number,
                "start_stop": self.bus.start_stop,
                "destination_stop": self.bus.destination_stop,
            }

        return {
            "id": self.id,
            "bus_id": self.bus_id,
            "bus": bus_info,
            "requester_id": self.requester_id,
            "requester": requester_info,
            "status": self.status,
            "payload": payload_data,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self):
        return f"<ChangeRequest bus={self.bus_id} requester={self.requester_id} status={self.status}>"
