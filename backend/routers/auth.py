"""Auth and Class/Section router."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response
from typing import Optional, List, Dict
from datetime import datetime, timezone, timedelta
import uuid
import csv
import io
import base64
import logging
from openpyxl import Workbook

from db import db
from models import *
from services.whatsapp import *
from services.pdf import *

router = APIRouter()
logger = logging.getLogger(__name__)

# ==================== SYSTEM ROLES SEEDING ====================

SYSTEM_ROLES = [
    {"roleName": "super_admin", "label": "Super Admin", "modules": ["dashboard", "classes", "students", "attendance", "fees", "expenses", "inventory", "calendar", "homework", "marks", "staff", "approvals", "complaints", "roles", "settings"],
     "canEdit": True, "canDelete": True, "canExport": True, "canEditFees": True, "canRevertFees": True, "canApproveConcession": True, "canSeeFullMobile": True, "isSystem": True},
    {"roleName": "admin_role", "label": "Admin", "modules": ["dashboard", "classes", "students", "attendance", "fees", "expenses", "inventory", "calendar", "homework", "marks", "staff", "approvals", "complaints"],
     "canEdit": True, "canDelete": True, "canExport": True, "canEditFees": False, "canRevertFees": True, "canApproveConcession": False, "canSeeFullMobile": True, "isSystem": True},
    {"roleName": "teacher", "label": "Teacher", "modules": ["students", "attendance", "calendar", "homework", "marks", "approvals", "complaints"],
     "canEdit": False, "canDelete": False, "canExport": False, "canEditFees": False, "canRevertFees": False, "canApproveConcession": False, "canSeeFullMobile": False, "isSystem": True},
    {"roleName": "office_staff", "label": "Office Staff", "modules": ["students", "fees", "expenses", "inventory", "complaints"],
     "canEdit": False, "canDelete": False, "canExport": False, "canEditFees": False, "canRevertFees": False, "canApproveConcession": False, "canSeeFullMobile": False, "isSystem": True},
]

async def ensure_system_roles():
    """Ensure system roles exist. Updates modules list if changed."""
    for sr in SYSTEM_ROLES:
        existing = await db.roles.find_one({"roleName": sr['roleName']}, {"_id": 0})
        if not existing:
            doc = Role(**sr).model_dump()
            doc['createdAt'] = doc['createdAt'].isoformat()
            await db.roles.insert_one(doc)
        else:
            # Patch system roles to ensure 'complaints' module present (idempotent migration)
            mods = existing.get('modules', [])
            if 'complaints' not in mods:
                await db.roles.update_one({"roleName": sr['roleName']}, {"$set": {"modules": sr['modules']}})

async def get_role_by_name(role_name: str):
    """Fetch role permissions. Falls back to a permissive empty role if not found."""
    await ensure_system_roles()
    r = await db.roles.find_one({"roleName": role_name}, {"_id": 0})
    if not r:
        return {"roleName": role_name, "label": role_name, "modules": [], "canEdit": False, "canDelete": False, "canExport": False, "canEditFees": False, "canRevertFees": False, "canApproveConcession": False, "canSeeFullMobile": False, "isSystem": False}
    return r

# ==================== ROLES CRUD ====================

@router.get("/roles")
async def list_roles():
    await ensure_system_roles()
    roles = await db.roles.find({}, {"_id": 0}).to_list(500)
    # System roles first, then by name
    roles.sort(key=lambda r: (not r.get('isSystem', False), r.get('roleName', '')))
    return roles

@router.post("/roles", response_model=Role)
async def create_role(data: RoleCreate):
    existing = await db.roles.find_one({"roleName": data.roleName}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Role name already exists")
    payload = data.model_dump()
    if not payload.get('label'):
        payload['label'] = payload['roleName']
    obj = Role(**payload)
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.roles.insert_one(doc)
    return obj

@router.put("/roles/{role_id}")
async def update_role(role_id: str, data: RoleUpdate):
    role = await db.roles.find_one({"id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    # System role super_admin cannot be modified
    if role.get('roleName') == 'super_admin':
        raise HTTPException(status_code=400, detail="super_admin role cannot be modified")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.roles.update_one({"id": role_id}, {"$set": update})
    return await db.roles.find_one({"id": role_id}, {"_id": 0})

@router.delete("/roles/{role_id}")
async def delete_role(role_id: str):
    role = await db.roles.find_one({"id": role_id}, {"_id": 0})
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.get('isSystem'):
        raise HTTPException(status_code=400, detail="System roles cannot be deleted")
    # Block delete if any staff still uses this role
    staff_count = await db.staff.count_documents({"role": role['roleName']})
    if staff_count > 0:
        raise HTTPException(status_code=400, detail=f"{staff_count} staff member(s) are using this role. Reassign them first.")
    await db.roles.delete_one({"id": role_id})
    return {"message": "Role deleted"}


# ==================== AUTH ROUTES ====================

@router.post("/auth/login")
async def login(data: LoginRequest):
    # Check super admin
    if data.username == "admin" and data.password == "12345678":
        role_doc = await get_role_by_name("super_admin")
        return {"success": True, "user": {"name": "Super Admin", "username": "admin"}, "role": "super_admin", "roleDetails": role_doc}
    # Check staff (teacher, office_staff, admin_role, or custom)
    staff = await db.staff.find_one({"username": data.username, "password": data.password}, {"_id": 0})
    if staff:
        role_doc = await get_role_by_name(staff['role'])
        return {"success": True, "user": {k: v for k, v in staff.items() if k != 'password'}, "role": staff['role'], "roleDetails": role_doc}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@router.post("/auth/staff-login")
async def staff_login(data: LoginRequest):
    staff = await db.staff.find_one({"username": data.username, "password": data.password}, {"_id": 0})
    if not staff:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    role_doc = await get_role_by_name(staff['role'])
    return {"success": True, "user": {k: v for k, v in staff.items() if k != 'password'}, "role": staff['role'], "roleDetails": role_doc}

@router.post("/auth/parent-login")
async def parent_login(data: LoginRequest):
    student = await db.students.find_one({"parentUsername": data.username, "parentPassword": data.password}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"success": True, "student": {k: v for k, v in student.items() if k != 'parentPassword'}, "role": "parent"}

# ==================== CLASS & SECTION ROUTES ====================

@router.post("/classes", response_model=ClassSection)
async def create_class_section(data: ClassSectionCreate):
    existing = await db.classes.find_one({"className": data.className}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Class already exists")
    obj = ClassSection(**data.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.classes.insert_one(doc)
    return obj

@router.get("/classes")
async def get_classes():
    return await db.classes.find({}, {"_id": 0}).to_list(100)

@router.put("/classes/{class_id}")
async def update_class_section(class_id: str, data: ClassSectionCreate):
    result = await db.classes.update_one({"id": class_id}, {"$set": {"className": data.className, "sections": data.sections}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Class not found")
    return await db.classes.find_one({"id": class_id}, {"_id": 0})

@router.delete("/classes/{class_id}")
async def delete_class_section(class_id: str):
    result = await db.classes.delete_one({"id": class_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Class not found")
    return {"message": "Class deleted"}

