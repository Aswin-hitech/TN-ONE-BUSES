from typing import Optional

from pydantic import BaseModel, field_validator

from app.models.bus import BusType
from app.utils.validators import (
    bounded_float,
    normalize_spots,
    sanitize_text,
    validate_non_empty,
)


class BusCreate(BaseModel):
    bus_name: str
    bus_number: Optional[str] = None
    operator: Optional[str] = None
    bus_type: Optional[str] = "Government"
    start_stop: Optional[str] = "Origin"
    destination_stop: Optional[str] = "Destination"
    boarded_stops: Optional[str] = None
    bus_timings: Optional[str] = None
    bus_fare: Optional[float] = 20.0
    distance_km: Optional[float] = None
    reaching_time: Optional[str] = None
    stop_timings: Optional[object] = None
    spots: Optional[object] = None

    @field_validator("bus_name")
    @classmethod
    def bus_name_required(cls, v):
        return sanitize_text(validate_non_empty(v, "Bus name"), max_length=255)

    @field_validator("bus_number", "operator")
    @classmethod
    def optional_text(cls, v):
        if v is None:
            return v
        cleaned = sanitize_text(v, max_length=255)
        return cleaned or None

    @field_validator("start_stop", "destination_stop")
    @classmethod
    def optional_stop_text(cls, v):
        if v is None:
            return v
        return sanitize_text(v, max_length=255) or v

    @field_validator("bus_type")
    @classmethod
    def normalize_bus_type(cls, v):
        lookup = {t.lower(): t for t in BusType.ALL}
        return lookup.get(str(v or "").strip().lower(), BusType.GOVERNMENT)

    @field_validator("boarded_stops")
    @classmethod
    def clean_boarded_stops(cls, v):
        if v is None:
            return v
        cleaned = sanitize_text(v, max_length=2000)
        return cleaned or None

    @field_validator("bus_timings")
    @classmethod
    def clean_bus_timings(cls, v):
        if v is None:
            return v
        cleaned = sanitize_text(v, max_length=500)
        return cleaned or None

    @field_validator("reaching_time")
    @classmethod
    def clean_reaching_time(cls, v):
        if v is None:
            return v
        cleaned = sanitize_text(v, max_length=64)
        return cleaned or None

    @field_validator("bus_fare")
    @classmethod
    def clean_bus_fare(cls, v):
        if v is None:
            return v
        fare = bounded_float(v, 0, 100000)
        if fare is None:
            raise ValueError("Fare must be a number between 0 and 100000.")
        return fare

    @field_validator("distance_km")
    @classmethod
    def clean_distance(cls, v):
        if v is None:
            return v
        distance = bounded_float(v, 0, 10000)
        if distance is None:
            raise ValueError("Distance must be a number between 0 and 10000 km.")
        return distance

    @field_validator("spots", "stop_timings")
    @classmethod
    def clean_spots(cls, v):
        if v is None:
            return v
        cleaned = normalize_spots(v)
        return cleaned or None
