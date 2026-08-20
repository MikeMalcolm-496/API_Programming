from sqlalchemy import Column, String, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class User(Base):
    """
   
    It is included here as a reference/stub so the API code can run.
    migrations are managed via Alembic.
    """
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False, default="student")  # student | security | admin
    student_id = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
