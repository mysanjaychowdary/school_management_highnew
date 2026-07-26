"""Password hashing, JWT issuance/verification, and auth dependencies."""
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Header, HTTPException
from passlib.context import CryptContext

logger = logging.getLogger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "720"))

JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    # Fail fast in real deployments; keep local/dev runnable with a clearly-flagged key.
    if os.environ.get("ENV", "development") == "production":
        raise RuntimeError("JWT_SECRET_KEY must be set in the environment for production.")
    JWT_SECRET_KEY = "dev-only-insecure-secret-set-JWT_SECRET_KEY-in-env"
    logger.warning("JWT_SECRET_KEY not set - using an insecure development default. "
                    "Set JWT_SECRET_KEY in backend/.env before deploying.")

ADMIN_ROLES = {"super_admin", "main_admin", "admin_role"}


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: Optional[str]) -> bool:
    if not hashed_password:
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


def create_access_token(sub: str, role: str, token_type: str, expires_minutes: int = JWT_EXPIRE_MINUTES) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def _extract_token(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    return authorization.split(" ", 1)[1].strip()


async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    """FastAPI dependency: any valid token (staff, parent, or driver)."""
    token = _extract_token(authorization)
    return decode_access_token(token)


def require_roles(*roles: str):
    """Dependency factory: caller must hold a 'staff'-type token with one of the given roles."""
    allowed = set(roles)

    async def _dep(authorization: Optional[str] = Header(None)) -> dict:
        token = _extract_token(authorization)
        payload = decode_access_token(token)
        if payload.get("type") != "staff" or payload.get("role") not in allowed:
            raise HTTPException(status_code=403, detail="You don't have permission to perform this action")
        return payload

    return _dep


async def require_staff(authorization: Optional[str] = Header(None)) -> dict:
    """Any authenticated staff member (any role)."""
    token = _extract_token(authorization)
    payload = decode_access_token(token)
    if payload.get("type") != "staff":
        raise HTTPException(status_code=403, detail="Staff account required")
    return payload


require_admin = require_roles(*ADMIN_ROLES)
