from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.sql import func
from app.core.database import Base


class FoundItemImage(Base):
   
    __tablename__ = "found_item_images"

    id = Column(PG_UUID(as_uuid=True), primary_key=True)
    found_item_id = Column(PG_UUID(as_uuid=True), ForeignKey("found_items.id"), nullable=False)
    storage_key = Column(String, nullable=False)
    url = Column(String, nullable=False)
    is_primary = Column(Boolean, default=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())