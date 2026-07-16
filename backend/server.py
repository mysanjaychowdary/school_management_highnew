"""SchoolPro API - slim entry point. All routes are in /app/backend/routers/*"""
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
import logging

from db import client
from routers import auth as auth_router
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
