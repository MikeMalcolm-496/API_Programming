from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session
from app.core.security import decode_access_token
from app.core.database import get_db
from app.models.user import User

# This tells FastAPI: "to get a token, look in the Authorization header,
# at the /auth/login endpoint." It handles extracting the Bearer token automatically.
oauth2_scheme = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    token = credentials.credentials
    """
    This is a FastAPI 'dependency'. Any route that needs an authenticated user
    can declare: current_user: User = Depends(get_current_user)
    FastAPI will run this function first, and inject the result into the route.

    What it does:
    1. Extracts the Bearer token from the Authorization header
    2. Decodes and validates it
    3. Looks up the user in the DB
    4. Returns the user object — or raises 401 if anything is wrong
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_access_token(token)
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    return user


def require_security_staff(current_user: User = Depends(get_current_user)) -> User:
    """
    Role guard for security/staff-only routes.
    Add this as a dependency on any route that only security should access.

    Usage in a route:
        @router.post("/found-items")
        def create_item(current_user: User = Depends(require_security_staff)):
            ...
    """
    if current_user.role not in ("security", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only security staff can perform this action"
        )
    return current_user


def require_student(current_user: User = Depends(get_current_user)) -> User:
    """
    Role guard for student-only routes (e.g. submitting an inquiry/claim).
    """
    if current_user.role != "student":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only students can perform this action"
        )
    return current_user
