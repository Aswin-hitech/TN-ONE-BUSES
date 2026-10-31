import math
from urllib.parse import urlparse

from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import datetime
from app.utils.validators import (
    bounded_float,
    normalize_spots,
    validate_non_empty,
    sanitize_text,
)


class RouteStopNameInput(BaseModel):
    stop_name: str


class BusReportCreate(BaseModel):
    bus_name: str
    bus_number: Optional[str] = None
    operator: Optional[str] = None
    bus_type: Optional[str] = None

    boarding_stop: str
    destination_stop: str
    boarding_time: Optional[datetime] = None

    bus_fare: Optional[float] = None
    bus_timings: Optional[str] = None
    photos: Optional[List[str]] = None

    # Optional inline route definition, e.g. ["Gandhipuram", "Town Hall", "Ukkadam"]
    route_stops: Optional[List[str]] = None
    spots: Optional[object] = None
    stop_timings: Optional[object] = None

    notes: Optional[str] = None


    @field_validator("bus_name")
    @classmethod
    def bus_name_required(cls, v):
        return sanitize_text(validate_non_empty(v, "Bus name"), max_length=255)

    @field_validator("boarding_stop")
    @classmethod
    def boarding_required(cls, v):
        return sanitize_text(validate_non_empty(v, "Boarding stop"), max_length=255)

    @field_validator("destination_stop")
    @classmethod
    def destination_required(cls, v):
        return sanitize_text(validate_non_empty(v, "Destination"), max_length=255)

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, v):
        if v is None:
            return v
        return sanitize_text(v, max_length=500)

    @field_validator("bus_number")
    @classmethod
    def clean_bus_number(cls, v):
        if v is None:
            return v
        cleaned = sanitize_text(v, max_length=64)
        return cleaned or None

    @field_validator("operator")
    @classmethod
    def clean_operator(cls, v):
        if v is None:
            return v
        cleaned = sanitize_text(v, max_length=255)
        return cleaned or None

    @field_validator("bus_type")
    @classmethod
    def clean_bus_type(cls, v):
        from app.models.bus import BusType
        if v is None:
            return v
        lookup = {t.lower(): t for t in BusType.ALL}
        return lookup.get(str(v).strip().lower(), BusType.GOVERNMENT)

    @field_validator("bus_fare")
    @classmethod
    def clean_bus_fare(cls, v):
        if v is None:
            return v
        # Reject NaN/Infinity as well as out-of-range values.
        if isinstance(v, float) and not math.isfinite(v):
            raise ValueError("Fare must be a reasonable non-negative amount.")
        fare = bounded_float(v, 0, 100000)
        if fare is None:
            raise ValueError("Fare must be a reasonable non-negative amount.")
        return fare

    @field_validator("spots", "stop_timings")
    @classmethod
    def clean_spots(cls, v):
        if v is None:
            return v
        return normalize_spots(v) or None

    @field_validator("bus_timings")
    @classmethod
    def clean_bus_timings(cls, v):
        if v is None:
            return v
        cleaned = sanitize_text(v, max_length=500)
        return cleaned or None

    @field_validator("photos")
    @classmethod
    def clean_photos(cls, v):
        if not v:
            return None
        cleaned = []
        for url in v:
            if not url or not isinstance(url, str):
                continue
            value = sanitize_text(url, max_length=1000)
            parsed = urlparse(value)
            if parsed.scheme not in ("http", "https") or not parsed.hostname:
                continue
            if parsed.username or parsed.password:
                continue
            cleaned.append(value)
        return cleaned[:8] or None

    @field_validator("route_stops")
    @classmethod
    def clean_route_stops(cls, v):
        if not v:
            return v
        cleaned = [sanitize_text(s, max_length=255) for s in v if s and s.strip()]
        return cleaned[:200] or None

    @model_validator(mode="after")
    def boarding_and_destination_differ(self):
        from app.models.stop import normalize_stop_name
        if normalize_stop_name(self.boarding_stop) == normalize_stop_name(self.destination_stop):
            raise ValueError("Boarding stop and destination cannot be the same.")
        return self
