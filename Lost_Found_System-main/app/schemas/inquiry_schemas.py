from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel


class InquiryCreateRequest(BaseModel):
    """What a student sends to submit a claim on a found item."""
    claim_description: str


class InquiryStatusUpdateRequest(BaseModel):
    """What security sends to approve or reject a claim."""
    status: Literal["approved", "rejected"]


class InquiryResponse(BaseModel):
    """What we return to the client for an inquiry."""
    id: UUID
    found_item_id: UUID
    claimant_user_id: UUID
    status: str
    claim_description: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True