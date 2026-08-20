from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class MessageCreateRequest(BaseModel):
    """What either party sends to post a message in an inquiry thread."""
    message: str


class MessageResponse(BaseModel):
    """What we return to the client for a message."""
    id: UUID
    inquiry_id: UUID
    sender_user_id: UUID
    message: str
    sent_at: datetime

    class Config:
        from_attributes = True
