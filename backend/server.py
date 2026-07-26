"""SchoolPro API - slim entry point. All routes are in /app/backend/routers/*"""
import os
import re
import logging

from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from db import client
from security import decode_access_token
from routers import auth as auth_router
from routers.auth import ensure_super_admin
from routers import students as students_router
from routers import academic as academic_router
from routers import finance as finance_router
from routers import operations as operations_router
from routers import bus as bus_router
from routers import hallticket as hallticket_router

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()
api_router = APIRouter(prefix="/api")

@api_router.get("/")
async def root():
    return {"message": "SchoolPro API"}

# Mount sub-routers
api_router.include_router(auth_router.router)
api_router.include_router(students_router.router)
api_router.include_router(academic_router.router)
api_router.include_router(finance_router.router)
api_router.include_router(operations_router.router)
api_router.include_router(bus_router.router)
api_router.include_router(hallticket_router.router)

app.include_router(api_router)

# Endpoints that must remain reachable without a login: the login/auth endpoints themselves,
# and the handful of branding/feature-flag reads the login screen needs before anyone is authenticated.
PUBLIC_API_ROUTES = {
    ("GET", "/api/"),
    ("GET", "/api/settings/school"),
    ("GET", "/api/settings/enabled-modules"),
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/staff-login"),
    ("POST", "/api/auth/parent-login"),
    ("POST", "/api/bus/driver-login"),
}

# GET-only endpoints opened as plain <a href> / window.open targets by the frontend (PDF downloads),
# so they can't carry an Authorization header. Protected instead by an unguessable UUID in the path.
PUBLIC_GET_PATH_PATTERNS = [
    re.compile(r"^/api/fees/invoice/[^/]+$"),
    re.compile(r"^/api/fees/invoice-view/[^/]+$"),
    re.compile(r"^/api/hall-ticket-exams/[^/]+/pdf$"),
    re.compile(r"^/api/marks/progress-card$"),
]


def _is_public_route(method: str, path: str) -> bool:
    if (method, path) in PUBLIC_API_ROUTES:
        return True
    if method != "GET":
        return False
    return any(pattern.match(path) for pattern in PUBLIC_GET_PATH_PATTERNS)


class AuthRequiredMiddleware(BaseHTTPMiddleware):
    """Rejects any /api request without a valid bearer token, except the public allowlist above.
    Route-level dependencies (require_admin/require_staff/etc.) layer tighter checks on top of this."""

    async def dispatch(self, request, call_next):
        path = request.url.path
        if not path.startswith("/api") or _is_public_route(request.method, path):
            return await call_next(request)
        auth_header = request.headers.get("authorization")
        if not auth_header or not auth_header.lower().startswith("bearer "):
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        token = auth_header.split(" ", 1)[1].strip()
        try:
            request.state.user = decode_access_token(token)
        except HTTPException as exc:
            return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        return await call_next(request)


app.add_middleware(AuthRequiredMiddleware)

_default_origins = "http://localhost:3000"
allowed_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",") if o.strip()]
if os.environ.get("CORS_ORIGINS") is None:
    logger.warning("CORS_ORIGINS not set - defaulting to %s. Set it in backend/.env for production.", _default_origins)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def bootstrap():
    await ensure_super_admin()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
