from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import datetime
from app.utils.validators import validate_non_empty, sanitize_text


class RouteStopNameInput(BaseModel):
    stop_name: str


class BusReportCreate(BaseModel):
    bus_name: str
    bus_number: Optional[str] = None
    operator: Optional[str] = None

    boarding_stop: str
    destination_stop: str
    boarding_time: Optional[datetime] = None

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

    @field_validator("route_stops")
    @classmethod
    def clean_route_stops(cls, v):
        if not v:
            return v
        cleaned = [sanitize_text(s, max_length=255) for s in v if s and s.strip()]
        return cleaned or None

    @model_validator(mode="after")
    def boarding_and_destination_differ(self):
        from app.models.stop import normalize_stop_name
        if normalize_stop_name(self.boarding_stop) == normalize_stop_name(self.destination_stop):
            raise ValueError("Boarding stop and destination cannot be the same.")
        return self
