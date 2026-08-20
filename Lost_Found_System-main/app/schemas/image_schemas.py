from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class ImageResponse(BaseModel):
    # What we return to the client after an image is uploaded.
    id: UUID
    found_item_id: UUID
    storage_key: str
    url: str
    is_primary: bool
    uploaded_at: datetime

    class Config:
        from_attributes = True
