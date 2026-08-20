from datetime import date, datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel


class FoundItemCreateRequest(BaseModel):
    """What security staff sends to post a new found item."""
    title: str
    description: str
    category: str
    location_found: str
    date_found: date


class FoundItemStatusUpdateRequest(BaseModel):
    """What security staff sends to update an item's status."""
    status: Literal["unclaimed", "under_review", "claimed", "closed"]


class FoundItemResponse(BaseModel):
    """What we return to the client for a found item."""
    id: UUID
    posted_by_user_id: UUID
    title: str
    description: str
    category: str
    location_found: str
    date_found: date
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
