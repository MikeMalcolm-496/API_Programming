from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings

# This tells passlib to use bcrypt for hashing passwords.
# bcrypt is the industry standard — it's slow ON PURPOSE to defeat brute-force attacks.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain_password: str) -> str:
    """
    Converts a plain text password into a hashed string.
    We NEVER store plain passwords in the database — always the hash.
    """
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Checks if the password the user typed matches the stored hash.
    passlib handles the comparison safely (constant-time, no timing attacks).
    """
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    """
    Creates a signed JWT token.

    How it works:
    - We take a dict of data (called the 'payload' or 'claims') — e.g. user_id, role
    - We add an expiry time to it
    - We sign the whole thing with our SECRET_KEY so nobody can tamper with it
    - The result is a string like: xxx.yyyy.zzz (header.payload.signature)

    The user stores this token and sends it with every request.
    We read it to know who they are — no DB lookup needed.
    """
    payload = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload.update({"exp": expire})

    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token


def decode_access_token(token: str) -> dict:
    """
    Decodes and validates a JWT token sent by the user.

    If the token is:
    - expired → raises JWTError
    - tampered with → raises JWTError
    - valid → returns the payload dict (user_id, role, etc.)

    We catch the error in our dependency (dependencies.py) and return 401 Unauthorized.
    """
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    return payload
