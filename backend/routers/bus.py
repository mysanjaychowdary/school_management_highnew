"""Bus tracking router: bus/driver management, driver login, live location, stop codes."""
from fastapi import APIRouter, HTTPException
from datetime import datetime, timezone, timedelta
import secrets

from db import db
from models import *

router = APIRouter()

STOP_CODE_TTL_MINUTES = 10


def _generate_code() -> str:
    return f"{secrets.randbelow(900000) + 100000}"


# ==================== BUS CRUD ====================

@router.post("/buses", response_model=Bus)
async def create_bus(data: BusCreate):
    existing = await db.buses.find_one({"driverUsername": data.driverUsername}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Driver username already exists")
    obj = Bus(**data.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.buses.insert_one(doc)
    return obj

@router.get("/buses")
async def list_buses():
    buses = await db.buses.find({}, {"_id": 0, "driverPassword": 0, "stopCode": 0}).to_list(200)
    return buses

@router.put("/buses/{bus_id}")
async def update_bus(bus_id: str, data: BusUpdate):
    bus = await db.buses.find_one({"id": bus_id}, {"_id": 0})
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None and v != ""}
    if 'driverUsername' in update and update['driverUsername'] != bus['driverUsername']:
        existing = await db.buses.find_one({"driverUsername": update['driverUsername']}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=400, detail="Driver username already exists")
    if update:
        await db.buses.update_one({"id": bus_id}, {"$set": update})
    return await db.buses.find_one({"id": bus_id}, {"_id": 0, "driverPassword": 0, "stopCode": 0})

@router.delete("/buses/{bus_id}")
async def delete_bus(bus_id: str):
    result = await db.buses.delete_one({"id": bus_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bus not found")
    return {"message": "Bus deleted"}


# ==================== DRIVER LOGIN ====================

@router.post("/bus/driver-login")
async def driver_login(data: LoginRequest):
    bus = await db.buses.find_one({"driverUsername": data.username, "driverPassword": data.password}, {"_id": 0, "driverPassword": 0, "stopCode": 0})
    if not bus:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"success": True, "bus": bus}


# ==================== LIVE TRACKING ====================

@router.post("/buses/{bus_id}/start")
async def start_driving(bus_id: str):
    result = await db.buses.update_one(
        {"id": bus_id},
        {"$set": {"status": "driving", "lat": None, "lng": None, "lastLocationAt": None}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bus not found")
    return {"success": True}

@router.post("/buses/{bus_id}/location")
async def update_location(bus_id: str, data: BusLocationUpdate):
    now = datetime.now(timezone.utc).isoformat()
    result = await db.buses.update_one(
        {"id": bus_id, "status": "driving"},
        {"$set": {"lat": data.lat, "lng": data.lng, "lastLocationAt": now}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=400, detail="Bus is not currently driving")
    return {"success": True}

@router.post("/buses/{bus_id}/generate-stop-code")
async def generate_stop_code(bus_id: str):
    bus = await db.buses.find_one({"id": bus_id}, {"_id": 0})
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")
    code = _generate_code()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=STOP_CODE_TTL_MINUTES)
    await db.buses.update_one({"id": bus_id}, {"$set": {"stopCode": code, "stopCodeExpiresAt": expires_at.isoformat()}})
    return {"code": code, "expiresAt": expires_at.isoformat()}

@router.post("/buses/{bus_id}/stop")
async def stop_driving(bus_id: str, data: BusStopRequest):
    bus = await db.buses.find_one({"id": bus_id}, {"_id": 0})
    if not bus:
        raise HTTPException(status_code=404, detail="Bus not found")
    stored_code = bus.get('stopCode')
    expires_at = bus.get('stopCodeExpiresAt')
    if not stored_code or data.code != stored_code:
        raise HTTPException(status_code=400, detail="Invalid code")
    if expires_at and datetime.fromisoformat(expires_at) < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Code expired, ask admin to generate a new one")
    await db.buses.update_one(
        {"id": bus_id},
        {"$set": {"status": "stopped", "stopCode": None, "stopCodeExpiresAt": None}}
    )
    return {"success": True}
