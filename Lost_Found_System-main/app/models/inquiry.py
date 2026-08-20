from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.core.database import Base


class Inquiry(Base):
    """
    NOTE: This model is owned by the DB team.
    Included here as a reference/stub so the API code can run and query against it.
    """
    __tablename__ = "inquiries"

    id = Column(PG_UUID(as_uuid=True), primary_key=True)
    found_item_id = Column(PG_UUID(as_uuid=True), ForeignKey("found_items.id"), nullable=False)
    claimant_user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    status = Column(String, nullable=False, default="pending")
    claim_description = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
