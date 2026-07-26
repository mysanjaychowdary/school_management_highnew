"""Auth and Class/Section router."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
from fastapi.responses import StreamingResponse, Response
from typing import Optional, List, Dict
from datetime import datetime, timezone, timedelta
import os
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
from security import hash_password, verify_password, create_access_token, require_admin, require_staff

router = APIRouter()
logger = logging.getLogger(__name__)

# ==================== SYSTEM ROLES SEEDING ====================

SYSTEM_ROLES = [
    {"roleName": "super_admin", "label": "Super Admin", "modules": ["dashboard", "classes", "students", "attendance", "fees", "expenses", "inventory", "calendar", "homework", "marks", "staff", "approvals", "complaints", "roles", "settings", "busTracking", "hallTickets"],
     "canEdit": True, "canDelete": True, "canExport": True, "canEditFees": True, "canRevertFees": True, "canApproveConcession": True, "canSeeFullMobile": True, "isSystem": True},
    {"roleName": "main_admin", "label": "Main Admin", "modules": ["dashboard", "classes", "students", "attendance", "fees", "expenses", "inventory", "calendar", "homework", "marks", "staff", "approvals", "complaints", "roles", "settings", "busTracking", "hallTickets"],
     "canEdit": True, "canDelete": True, "canExport": True, "canEditFees": True, "canRevertFees": True, "canApproveConcession": True, "canSeeFullMobile": True, "isSystem": True},
    {"roleName": "admin_role", "label": "Admin", "modules": ["dashboard", "classes", "students", "attendance", "fees", "expenses", "inventory", "calendar", "homework", "marks", "staff", "approvals", "complaints", "busTracking", "hallTickets"],
     "canEdit": True, "canDelete": True, "canExport": True, "canEditFees": False, "canRevertFees": True, "canApproveConcession": False, "canSeeFullMobile": True, "isSystem": True},
    {"roleName": "teacher", "label": "Teacher", "modules": ["students", "attendance", "calendar", "homework", "marks", "approvals", "complaints", "hallTickets"],
     "canEdit": False, "canDelete": False, "canExport": False, "canEditFees": False, "canRevertFees": False, "canApproveConcession": False, "canSeeFullMobile": False, "isSystem": True,
     "modulePerms": {"hallTickets": {"create": True, "edit": True, "delete": True}}},
    {"roleName": "office_staff", "label": "Office Staff", "modules": ["students", "fees", "expenses", "inventory", "complaints", "hallTickets"],
     "canEdit": False, "canDelete": False, "canExport": False, "canEditFees": False, "canRevertFees": False, "canApproveConcession": False, "canSeeFullMobile": False, "isSystem": True,
     "modulePerms": {"hallTickets": {"create": True, "edit": True, "delete": True}}},
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
            # Patch system roles to ensure newly-added modules (e.g. 'complaints', 'busTracking', 'hallTickets')
            # and their accompanying modulePerms overrides are present
            mods = existing.get('modules', [])
            if any(m not in mods for m in sr['modules']):
                update = {"modules": sr['modules']}
                if sr.get('modulePerms'):
                    merged_perms = {**existing.get('modulePerms', {}), **sr['modulePerms']}
                    update['modulePerms'] = merged_perms
                await db.roles.update_one({"roleName": sr['roleName']}, {"$set": update})

async def ensure_super_admin():
    """Bootstrap the super_admin staff account from env vars if one doesn't exist yet."""
    existing = await db.staff.find_one({"role": "super_admin"}, {"_id": 0})
    if existing:
        return
    username = os.environ.get("SUPER_ADMIN_USERNAME", "admin")
    password = os.environ.get("SUPER_ADMIN_PASSWORD")
    if not password:
        password = "12345678"
        logger.warning(
            "SUPER_ADMIN_PASSWORD not set - bootstrapping super_admin '%s' with an insecure default password. "
            "Set SUPER_ADMIN_USERNAME/SUPER_ADMIN_PASSWORD in backend/.env before going live.", username)
    doc = Staff(
        name="Super Admin", role="super_admin", mobile="",
        joiningDate=datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        username=username, password=hash_password(password),
    ).model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.staff.insert_one(doc)
    logger.info("Bootstrapped super_admin staff account '%s'", username)


async def get_role_by_name(role_name: str):
    """Fetch role permissions. Falls back to a permissive empty role if not found."""
    await ensure_system_roles()
    r = await db.roles.find_one({"roleName": role_name}, {"_id": 0})
    if not r:
        return {"roleName": role_name, "label": role_name, "modules": [], "canEdit": False, "canDelete": False, "canExport": False, "canEditFees": False, "canRevertFees": False, "canApproveConcession": False, "canSeeFullMobile": False, "modulePerms": {}, "isSystem": False}
    # Ensure modulePerms always present for older role documents
    if "modulePerms" not in r or r.get("modulePerms") is None:
        r["modulePerms"] = {}
    return r

# ==================== ROLES CRUD ====================

@router.get("/roles")
async def list_roles(_admin=Depends(require_admin)):
    await ensure_system_roles()
    roles = await db.roles.find({}, {"_id": 0}).to_list(500)
    # Backfill modulePerms on legacy docs
    for r in roles:
        if "modulePerms" not in r or r.get("modulePerms") is None:
            r["modulePerms"] = {}
    # System roles first, then by name
    roles.sort(key=lambda r: (not r.get('isSystem', False), r.get('roleName', '')))
    return roles

@router.post("/roles", response_model=Role)
async def create_role(data: RoleCreate, _admin=Depends(require_admin)):
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
async def update_role(role_id: str, data: RoleUpdate, _admin=Depends(require_admin)):
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
async def delete_role(role_id: str, _admin=Depends(require_admin)):
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

async def _staff_login(data: LoginRequest):
    staff = await db.staff.find_one({"username": data.username}, {"_id": 0})
    if not staff or not verify_password(data.password, staff.get('password')):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    role_doc = await get_role_by_name(staff['role'])
    token = create_access_token(sub=staff['id'], role=staff['role'], token_type='staff')
    return {
        "success": True, "user": {k: v for k, v in staff.items() if k != 'password'},
        "role": staff['role'], "roleDetails": role_doc,
        "access_token": token, "token_type": "bearer",
    }

@router.post("/auth/login")
async def login(data: LoginRequest):
    return await _staff_login(data)

@router.post("/auth/staff-login")
async def staff_login(data: LoginRequest):
    return await _staff_login(data)

@router.post("/auth/parent-login")
async def parent_login(data: LoginRequest):
    student = await db.students.find_one({"parentUsername": data.username}, {"_id": 0})
    if not student or not verify_password(data.password, student.get('parentPassword')):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(sub=student['id'], role='parent', token_type='parent')
    return {
        "success": True, "student": {k: v for k, v in student.items() if k != 'parentPassword'}, "role": "parent",
        "access_token": token, "token_type": "bearer",
    }

@router.post("/auth/impersonate-staff")
async def impersonate_staff(data: ImpersonateStaffRequest, _caller=Depends(require_admin)):
    super_admin = await db.staff.find_one({"username": data.superAdminUsername, "role": "super_admin"}, {"_id": 0})
    if not super_admin or not verify_password(data.superAdminPassword, super_admin.get('password')):
        raise HTTPException(status_code=401, detail="Invalid super admin credentials")
    staff = await db.staff.find_one({"id": data.staffId}, {"_id": 0})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    role_doc = await get_role_by_name(staff['role'])
    token = create_access_token(sub=staff['id'], role=staff['role'], token_type='staff')
    return {
        "success": True, "user": {k: v for k, v in staff.items() if k != 'password'},
        "role": staff['role'], "roleDetails": role_doc,
        "access_token": token, "token_type": "bearer",
    }

# ==================== CLASS & SECTION ROUTES ====================

@router.post("/classes", response_model=ClassSection)
async def create_class_section(data: ClassSectionCreate, _admin=Depends(require_admin)):
    existing = await db.classes.find_one({"className": data.className}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Class already exists")
    obj = ClassSection(**data.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.classes.insert_one(doc)
    return obj

@router.get("/classes")
async def get_classes(_staff=Depends(require_staff)):
    return await db.classes.find({}, {"_id": 0}).to_list(100)

@router.put("/classes/{class_id}")
async def update_class_section(class_id: str, data: ClassSectionCreate, _admin=Depends(require_admin)):
    result = await db.classes.update_one({"id": class_id}, {"$set": {"className": data.className, "sections": data.sections}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Class not found")
    return await db.classes.find_one({"id": class_id}, {"_id": 0})

@router.delete("/classes/{class_id}")
async def delete_class_section(class_id: str, _admin=Depends(require_admin)):
    result = await db.classes.delete_one({"id": class_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Class not found")
    return {"message": "Class deleted"}

