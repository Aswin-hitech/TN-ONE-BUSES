from pydantic import BaseModel
from typing import Optional


class SearchQuery(BaseModel):
    destination: Optional[str] = None
    origin: Optional[str] = None  # "from"

