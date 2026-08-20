from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.schemas.auth_schemas import RegisterRequest, LoginRequest, TokenResponse, UserResponse
from app.services.auth_service import register_user, login_user
from app.models.user import User

# A Router is like a mini-app. We group related routes together
# and register the whole group in main.py under a prefix like /auth
router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=UserResponse, status_code=201)
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user (student or security staff).

    POST /auth/register
    Body: { full_name, email, password, role, student_id? }
    Returns: the created user (no password)
    """
    user = register_user(request, db)
    return user


@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Log in and receive a JWT access token.

    POST /auth/login
    Body: { email, password }
    Returns: { access_token, token_type }

    The frontend stores this token and sends it in every future request as:
    Authorization: Bearer <token>
    """
    token_response = login_user(request, db)
    return token_response


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Returns the currently authenticated user's profile.

    GET /auth/me
    Headers: Authorization: Bearer <token>
    Returns: the user's data

    This route is useful for the frontend to know who is logged in
    and what their role is (to show/hide buttons etc.)
    """
    return current_user
