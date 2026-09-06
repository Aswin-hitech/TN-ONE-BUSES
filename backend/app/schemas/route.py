from pydantic import BaseModel, field_validator
from typing import List, Optional
from app.utils.validators import sanitize_text


class RouteStopInput(BaseModel):
    stop_name: str
    stop_order: int

    @field_validator("stop_name")
    @classmethod
    def clean_name(cls, v):
        return sanitize_text(v, max_length=255)

    @field_validator("stop_order")
    @classmethod
    def order_non_negative(cls, v):
        if v < 0:
            raise ValueError("stop_order must be >= 0.")
        return v


class RouteCreate(BaseModel):
    bus_id: int
    route_name: Optional[str] = None
    stops: List[RouteStopInput] = []

    @field_validator("route_name")
    @classmethod
    def clean_route_name(cls, v):
        if v is None:
            return v
        return sanitize_text(v, max_length=255)

    @field_validator("stops")
    @classmethod
    def unique_orders(cls, v):
        orders = [s.stop_order for s in v]
        if len(orders) != len(set(orders)):
            raise ValueError("stop_order values within a route must be unique.")
        return v
