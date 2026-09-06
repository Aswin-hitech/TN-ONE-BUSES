from pydantic import BaseModel, field_validator
from typing import Optional
from app.utils.validators import validate_non_empty, sanitize_text


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

    @field_validator("bus_number", "operator", "start_stop", "destination_stop")
    @classmethod
    def optional_text(cls, v):
        if v is None:
            return v
        return sanitize_text(v, max_length=255)
