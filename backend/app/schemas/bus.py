from pydantic import BaseModel, field_validator
from typing import Optional
from app.models.bus import BusType
from app.utils.validators import validate_non_empty, sanitize_text


class BusCreate(BaseModel):
    bus_name: str
    bus_number: Optional[str] = None
    operator: Optional[str] = None
    bus_type: Optional[BusType] = BusType.UNKNOWN

    @field_validator("bus_name")
    @classmethod
    def bus_name_required(cls, v):
        return sanitize_text(validate_non_empty(v, "Bus name"), max_length=255)

    @field_validator("bus_number", "operator")
    @classmethod
    def optional_text(cls, v):
        if v is None:
            return v
        return sanitize_text(v, max_length=255)
