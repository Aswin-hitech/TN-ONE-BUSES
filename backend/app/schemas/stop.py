from pydantic import BaseModel, field_validator
from typing import Optional
from app.utils.validators import validate_non_empty, sanitize_text


class StopCreate(BaseModel):
    stop_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @field_validator("stop_name")
    @classmethod
    def stop_name_required(cls, v):
        return sanitize_text(validate_non_empty(v, "Stop name"), max_length=255)

    @field_validator("latitude")
    @classmethod
    def lat_range(cls, v):
        if v is not None and not (-90 <= v <= 90):
            raise ValueError("Latitude must be between -90 and 90.")
        return v

    @field_validator("longitude")
    @classmethod
    def lng_range(cls, v):
        if v is not None and not (-180 <= v <= 180):
            raise ValueError("Longitude must be between -180 and 180.")
        return v
