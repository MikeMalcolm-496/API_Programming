from sqlalchemy import Column, String, Text, Date, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.core.database import Base


class FoundItem(Base):
    """
    NOTE: This model is owned by the DB team.
    Included here as a reference/stub so the API code can run and query against it.
    """
    __tablename__ = "found_items"

    id = Column(PG_UUID(as_uuid=True), primary_key=True)
    posted_by_user_id = Column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, nullable=False)
    location_found = Column(String, nullable=False)
    date_found = Column(Date, nullable=False)
    status = Column(String, nullable=False, default="unclaimed")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
