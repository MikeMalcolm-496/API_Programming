from sqlalchemy import Column, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.core.database import Base


class InquiryMessage(Base):
    """
    NOTE: This model is owned by the DB team.
    Included here as a reference/stub so the API code can run and query against it.
    """
    __tablename__ = "inquiry_messages"

    id = Column(PG_UUID(as_uuid=True), primary_key=True)
    inquiry_id = Column(PG_UUID(as_uuid=True), ForeignKey("inquiries.id"), nullable=False)
    sender_user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    message = Column(Text, nullable=False)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
