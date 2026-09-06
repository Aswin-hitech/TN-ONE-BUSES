from pydantic import BaseModel, model_validator
from typing import Optional


class SearchQuery(BaseModel):
    destination: Optional[str] = None
    origin: Optional[str] = None  # "from"

    @model_validator(mode="after")
    def at_least_one(self):
        if not self.destination and not self.origin:
            raise ValueError("Provide at least a destination (or origin and destination).")
        return self
