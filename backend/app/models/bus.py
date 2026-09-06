import enum
from datetime import datetime, timezone
from app.extensions import db


class BusType(str, enum.Enum):
    GOVERNMENT = "GOVERNMENT"
    PRIVATE = "PRIVATE"
    UNKNOWN = "UNKNOWN"


class Bus(db.Model):
    __tablename__ = "buses"

    id = db.Column(db.Integer, primary_key=True)
    bus_name = db.Column(db.String(255), nullable=False, index=True)
    bus_number = db.Column(db.String(64), nullable=True, index=True)
    operator = db.Column(db.String(255), nullable=True)
    bus_type = db.Column(
        db.Enum(BusType, name="bus_type_enum"),
        nullable=False,
        default=BusType.UNKNOWN,
    )

    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    routes = db.relationship("Route", back_populates="bus", lazy="dynamic")
    reports = db.relationship("BusReport", back_populates="bus", lazy="dynamic")
    timings = db.relationship("BusTiming", back_populates="bus", cascade="all, delete-orphan", order_by="BusTiming.sort_order")
    photos = db.relationship("BusPhoto", back_populates="bus", cascade="all, delete-orphan")

    __table_args__ = (
        db.UniqueConstraint("bus_name", "bus_number", "operator", name="uq_bus_identity"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "bus_name": self.bus_name,
            "bus_number": self.bus_number,
            "operator": self.operator,
            "bus_type": self.bus_type.value if self.bus_type else None,
            "timings": [t.timing for t in self.timings],
            "photos": [p.url for p in self.photos],
        }

    def __repr__(self):
        return f"<Bus {self.bus_name} {self.bus_number}>"


class BusTiming(db.Model):
    __tablename__ = "bus_timings"
    id = db.Column(db.Integer, primary_key=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False, index=True)
    timing = db.Column(db.String(20), nullable=False)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    bus = db.relationship("Bus", back_populates="timings")


class BusPhoto(db.Model):
    __tablename__ = "bus_photos"
    id = db.Column(db.Integer, primary_key=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False, index=True)
    url = db.Column(db.String(2048), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    bus = db.relationship("Bus", back_populates="photos")
