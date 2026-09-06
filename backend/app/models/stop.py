import re
from datetime import datetime, timezone
from app.extensions import db

# Common suffix words that get stripped/normalized so "Gandhipuram" and
# "Gandhipuram Bus Stand" resolve to the same logical stop when searching.
_NOISE_WORDS = {
    "bus", "stand", "junction", "jn", "signal", "stop", "busstand",
    "railway", "station", "circle", "toll", "gate",
}


def normalize_stop_name(raw_name: str) -> str:
    """
    Produce a normalized, search/dedupe-friendly representation of a stop name.
    Lowercases, strips punctuation, collapses whitespace, and removes common
    noise words (e.g. "Bus Stand") so near-duplicate names converge.
    """
    if not raw_name:
        return ""
    value = raw_name.strip().lower()
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    tokens = [t for t in value.split() if t and t not in _NOISE_WORDS]
    if not tokens:
        # Fall back to the un-filtered tokens if everything was "noise"
        tokens = [t for t in value.split() if t]
    return " ".join(tokens)


class Stop(db.Model):
    __tablename__ = "stops"

    id = db.Column(db.Integer, primary_key=True)
    stop_name = db.Column(db.String(255), nullable=False)
    normalized_name = db.Column(db.String(255), nullable=False, index=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    route_links = db.relationship("RouteStop", back_populates="stop", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "stop_name": self.stop_name,
            "normalized_name": self.normalized_name,
            "latitude": self.latitude,
            "longitude": self.longitude,
        }

    def __repr__(self):
        return f"<Stop {self.stop_name}>"
