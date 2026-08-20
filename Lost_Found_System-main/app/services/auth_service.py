import uuid
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.models.user import User
from app.core.security import hash_password, verify_password, create_access_token
from app.schemas.auth_schemas import RegisterRequest, LoginRequest, TokenResponse


def register_user(request: RegisterRequest, db: Session) -> User:
    """
    Business logic for registering a new user.

    Rules enforced here:
    1. Email must not already be in use
    2. Password gets hashed before storage
    3. A unique ID is generated
    """
    # Rule 1: Check for duplicate email
    existing = db.query(User).filter(User.email == request.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists"
        )

    # Rule 2: Hash the password — never store plain text
    new_user = User(
        id=str(uuid.uuid4()),
        full_name=request.full_name,
        email=request.email,
        hashed_password=hash_password(request.password),
        role=request.role,
        student_id=request.student_id
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)  # Refreshes the object with DB-generated values (timestamps etc.)

    return new_user


def login_user(request: LoginRequest, db: Session) -> TokenResponse:
    """
    Business logic for logging in.

    Rules enforced:
    1. User must exist (by email)
    2. Password must match the stored hash
    3. On success, we issue a JWT containing user_id and role

    We deliberately give the same vague error for both 'user not found'
    and 'wrong password' — this prevents attackers from knowing which
    emails are registered (called 'user enumeration').
    """
    invalid_credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password"
    )

    # Rule 1: Find user
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        raise invalid_credentials_error

    # Rule 2: Verify password
    if not verify_password(request.password, user.hashed_password):
        raise invalid_credentials_error

    # Rule 3: Create JWT with user identity baked in
    # "sub" (subject) is a standard JWT field for the user's identifier
    token = create_access_token(data={
        "sub": str(user.id),
        "role": user.role,
        "email": user.email
    })

    return TokenResponse(access_token=token)
