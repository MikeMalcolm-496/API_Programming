from pydantic import BaseModel, EmailStr
from typing import Literal
from uuid import UUID


class RegisterRequest(BaseModel):
    """What the client sends when registering a new user."""
    full_name: str
    email: EmailStr           # Pydantic validates email format automatically
    password: str
    role: Literal["student", "security", "admin"] = "student"
    student_id: str | None = None  # Optionally relevant for students


class LoginRequest(BaseModel):
    """What the client sends to log in."""
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """What we send back after a successful login."""
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """
    Safe user data we return to the client.
    password is NOT here. it is never returned, even in hashed form.
    """
    id: UUID
    full_name: str
    email: str
    role: str
    student_id: str | None

    class Config:
        from_attributes = True  # Allows Pydantic to read from SQLAlchemy model objects
