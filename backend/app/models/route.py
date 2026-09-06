from datetime import datetime, timezone
from app.extensions import db


class Route(db.Model):
    __tablename__ = "routes"

    id = db.Column(db.Integer, primary_key=True)
    bus_id = db.Column(db.Integer, db.ForeignKey("buses.id", ondelete="CASCADE"), nullable=False)
    route_name = db.Column(db.String(255), nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    bus = db.relationship("Bus", back_populates="routes")
    stops = db.relationship(
        "RouteStop",
        back_populates="route",
        order_by="RouteStop.stop_order",
        cascade="all, delete-orphan",
    )
    reports = db.relationship("BusReport", back_populates="route", lazy="dynamic")

    def ordered_stop_ids(self):
        return [rs.stop_id for rs in self.stops]

    def to_dict(self, include_stops=True):
        data = {
            "id": self.id,
            "bus_id": self.bus_id,
            "route_name": self.route_name,
        }
        if include_stops:
            data["stops"] = [
                {"stop_id": rs.stop_id, "stop_order": rs.stop_order, "stop": rs.stop.to_dict()}
                for rs in sorted(self.stops, key=lambda x: x.stop_order)
            ]
        return data

    def __repr__(self):
        return f"<Route {self.route_name} bus_id={self.bus_id}>"


class RouteStop(db.Model):
    __tablename__ = "route_stops"

    id = db.Column(db.Integer, primary_key=True)
    route_id = db.Column(db.Integer, db.ForeignKey("routes.id", ondelete="CASCADE"), nullable=False, index=True)
    stop_id = db.Column(db.Integer, db.ForeignKey("stops.id", ondelete="CASCADE"), nullable=False, index=True)
    stop_order = db.Column(db.Integer, nullable=False)

    route = db.relationship("Route", back_populates="stops")
    stop = db.relationship("Stop", back_populates="route_links")

    __table_args__ = (
        db.UniqueConstraint("route_id", "stop_order", name="uq_route_stop_order"),
        db.UniqueConstraint("route_id", "stop_id", name="uq_route_stop_unique"),
    )

    def __repr__(self):
        return f"<RouteStop route={self.route_id} stop={self.stop_id} order={self.stop_order}>"
