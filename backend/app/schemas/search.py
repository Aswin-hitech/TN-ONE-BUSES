from typing import Optional

from pydantic import BaseModel, field_validator

from app.utils.validators import sanitize_text


class SearchQuery(BaseModel):
    destination: Optional[str] = None
    origin: Optional[str] = None  # "from"

    @field_validator("destination", "origin")
    @classmethod
    def clean_query(cls, v):
        if v is None:
            return None
        # Bound fuzzy matching input to keep it cheap and predictable.
        return sanitize_text(v, max_length=100) or None
