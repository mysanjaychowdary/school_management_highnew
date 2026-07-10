"""Operations (settings + leave + inventory + staff + parent + dashboard + uploads) router."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
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

router = APIRouter()
logger = logging.getLogger(__name__)

# ==================== DATABASE SETTINGS ====================

# ==================== LEAVE REQUEST ROUTES ====================

@router.post("/leave-requests")
async def create_leave_request(data: LeaveRequestCreate):
    student = await db.students.find_one({"id": data.studentId}, {"_id": 0})
    if not student:
        student = await db.students.find_one({"studentCode": data.studentCode}, {"_id": 0})
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    obj = LeaveRequest(
        studentId=student['id'], studentCode=student.get('studentCode', data.studentCode),
        studentName=student['studentName'], fromDate=data.fromDate, toDate=data.toDate,
        reason=data.reason, attachmentUrl=data.attachmentUrl
    )
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.leave_requests.insert_one(doc)
    return obj

@router.get("/leave-requests")
async def get_leave_requests(status: Optional[str] = None, studentId: Optional[str] = None, studentClass: Optional[str] = None, section: Optional[str] = None):
    query = {}
    if status: query['status'] = status
    if studentId: query['studentId'] = studentId
    # Filter by class/section via student lookup
    if studentClass or section:
        student_query = {}
        if studentClass: student_query['studentClass'] = studentClass
        if section: student_query['section'] = section
        students = await db.students.find(student_query, {"_id": 0, "id": 1}).to_list(10000)
        student_ids = [s['id'] for s in students]
        query['studentId'] = {"$in": student_ids}
    requests = await db.leave_requests.find(query, {"_id": 0}).sort("createdAt", -1).to_list(1000)
    return requests

@router.post("/leave-requests/{request_id}/approve")
async def approve_leave_request(request_id: str, data: Optional[Dict] = None):
    req = await db.leave_requests.find_one({"id": request_id}, {"_id": 0})
    if not req: raise HTTPException(status_code=404, detail="Leave request not found")
    if req['status'] != 'pending': raise HTTPException(status_code=400, detail="Already processed")
    approved_by = (data or {}).get('approvedBy', 'Admin') if data else 'Admin'
    await db.leave_requests.update_one({"id": request_id}, {"$set": {"status": "approved", "approvedBy": approved_by}})
    return {"message": "Leave approved"}

@router.post("/leave-requests/{request_id}/reject")
async def reject_leave_request(request_id: str, data: Optional[Dict] = None):
    req = await db.leave_requests.find_one({"id": request_id}, {"_id": 0})
    if not req: raise HTTPException(status_code=404, detail="Leave request not found")
    if req['status'] != 'pending': raise HTTPException(status_code=400, detail="Already processed")
    rejected_by = (data or {}).get('rejectedBy', 'Admin') if data else 'Admin'
    await db.leave_requests.update_one({"id": request_id}, {"$set": {"status": "rejected", "rejectedBy": rejected_by}})
    return {"message": "Leave rejected"}

# ==================== SETTINGS ROUTES ====================

@router.get("/settings/whatsapp")
async def get_whatsapp_settings():
    settings = await db.settings.find_one({"type": "whatsapp"}, {"_id": 0})
    if not settings: return {"phoneNumberId": "", "accessToken": ""}
    return settings

@router.put("/settings/whatsapp")
async def update_whatsapp_settings(settings: WhatsAppSettings):
    await db.settings.update_one({"type": "whatsapp"}, {"$set": {"phoneNumberId": settings.phoneNumberId, "accessToken": settings.accessToken}}, upsert=True)
    return {"message": "Settings updated"}

@router.get("/settings/school")
async def get_school_settings():
    settings = await db.settings.find_one({"type": "school"}, {"_id": 0})
    if not settings: return {"schoolName": "SchoolPro", "schoolAddress": "", "logoUrl": ""}
    return settings

@router.put("/settings/school")
async def update_school_settings(data: SchoolSettings):
    await db.settings.update_one({"type": "school"}, {"$set": {"schoolName": data.schoolName, "schoolAddress": data.schoolAddress, "logoUrl": data.logoUrl or ""}}, upsert=True)
    return {"message": "School settings updated"}

@router.get("/settings/whatsapp-templates")
async def get_whatsapp_templates():
    doc = await db.settings.find_one({"type": "whatsapp_templates"}, {"_id": 0})
    if not doc:
        return {"absent": {"name": "", "componentsJson": ""}, "fee_paid": {"name": "", "componentsJson": ""}, "event": {"name": "", "componentsJson": ""}}
    return {
        "absent": doc.get("absent") or {"name": "", "componentsJson": ""},
        "fee_paid": doc.get("fee_paid") or {"name": "", "componentsJson": ""},
        "event": doc.get("event") or {"name": "", "componentsJson": ""},
    }

@router.put("/settings/whatsapp-templates")
async def update_whatsapp_templates(data: WhatsAppTemplates):
    # Validate componentsJson is valid JSON (when provided)
    import json as _json
    for key in ("absent", "fee_paid", "event"):
        t = getattr(data, key)
        if t.componentsJson and t.componentsJson.strip():
            try:
                _json.loads(t.componentsJson)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid JSON for {key} template: {e}")
    await db.settings.update_one(
        {"type": "whatsapp_templates"},
        {"$set": {
            "absent": data.absent.model_dump(),
            "fee_paid": data.fee_paid.model_dump(),
            "event": data.event.model_dump(),
        }},
        upsert=True
    )
    return {"message": "WhatsApp templates updated"}

# ==================== FILE UPLOAD ====================

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    base64_content = base64.b64encode(content).decode('utf-8')
    return {"url": f"data:{file.content_type};base64,{base64_content}", "filename": file.filename}

# ==================== INVENTORY ROUTES ====================

@router.post("/inventory")
async def create_inventory_item(item: InventoryItemCreate):
    obj = InventoryItem(**item.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.inventory.insert_one(doc)
    return obj

@router.get("/inventory")
async def get_inventory(category: Optional[str] = None):
    query = {}
    if category: query['category'] = category
    return await db.inventory.find(query, {"_id": 0}).to_list(1000)

@router.put("/inventory/{item_id}")
async def update_inventory_item(item_id: str, data: InventoryItemCreate):
    result = await db.inventory.update_one({"id": item_id}, {"$set": data.model_dump()})
    if result.matched_count == 0: raise HTTPException(status_code=404, detail="Item not found")
    return await db.inventory.find_one({"id": item_id}, {"_id": 0})

@router.delete("/inventory/{item_id}")
async def delete_inventory_item(item_id: str):
    result = await db.inventory.delete_one({"id": item_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}

@router.post("/inventory/issue")
async def issue_inventory(data: InventoryIssueCreate):
    item = await db.inventory.find_one({"id": data.itemId}, {"_id": 0})
    if not item: raise HTTPException(status_code=404, detail="Item not found")
    if item['quantity'] < data.quantity: raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {item['quantity']}")
    student = await db.students.find_one({"studentCode": data.studentCode}, {"_id": 0})
    if not student: raise HTTPException(status_code=404, detail="Student not found")
    # Deduct stock
    await db.inventory.update_one({"id": data.itemId}, {"$inc": {"quantity": -data.quantity}})
    issue = InventoryIssue(itemId=data.itemId, itemName=item['itemName'], studentId=student['id'],
                           studentCode=data.studentCode, rollNo=student.get('rollNo', ''), studentName=student['studentName'], quantity=data.quantity, date=data.date)
    doc = issue.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.inventory_issues.insert_one(doc)
    return issue

@router.get("/inventory/issues")
async def get_inventory_issues(studentId: Optional[str] = None):
    query = {}
    if studentId: query['studentId'] = studentId
    return await db.inventory_issues.find(query, {"_id": 0}).to_list(1000)

# ==================== STAFF ROUTES ====================

@router.post("/staff")
async def create_staff(data: StaffCreate):
    existing = await db.staff.find_one({"username": data.username}, {"_id": 0})
    if existing: raise HTTPException(status_code=400, detail="Username already exists")
    obj = Staff(**data.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.staff.insert_one(doc)
    return {k: v for k, v in obj.model_dump().items() if k != 'password'}

@router.get("/staff")
async def get_staff():
    staff = await db.staff.find({}, {"_id": 0}).to_list(500)
    return [{k: v for k, v in s.items() if k != 'password'} for s in staff]

@router.put("/staff/{staff_id}")
async def update_staff(staff_id: str, data: StaffUpdate):
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_dict: return await db.staff.find_one({"id": staff_id}, {"_id": 0, "password": 0})
    result = await db.staff.update_one({"id": staff_id}, {"$set": update_dict})
    if result.matched_count == 0: raise HTTPException(status_code=404, detail="Staff not found")
    updated = await db.staff.find_one({"id": staff_id}, {"_id": 0})
    return {k: v for k, v in updated.items() if k != 'password'}

@router.delete("/staff/{staff_id}")
async def delete_staff(staff_id: str):
    result = await db.staff.delete_one({"id": staff_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Staff not found")
    return {"message": "Staff deleted"}

# ==================== STUDENT DETAIL ====================

@router.get("/students/{student_id}/detail")
async def get_student_detail(student_id: str):
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student: raise HTTPException(status_code=404, detail="Student not found")
    attendance = await db.attendance.find({"studentId": student_id}, {"_id": 0}).to_list(10000)
    total_days = len(attendance)
    present_days = sum(1 for a in attendance if a['status'] == 'present')
    absent_days = sum(1 for a in attendance if a['status'] == 'absent')
    payments = await db.fee_payments.find({"studentId": student_id}, {"_id": 0}).to_list(100)
    custom_fees = await db.fee_types.find({
        "$or": [
            {"applicableClass": student.get('studentClass', ''), "applicableSection": student.get('section', '')},
            {"applicableClass": student.get('studentClass', ''), "applicableSection": {"$in": [None, ""]}},
            {"applicableClass": {"$in": [None, ""]}, "applicableSection": {"$in": [None, ""]}},
        ]
    }, {"_id": 0}).to_list(500)
    paid_terms, paid_custom = {}, {}
    for p in payments:
        if p.get('status') in ('reverted', 'archived'): continue
        if p.get('termNumber'): k = f"term{p['termNumber']}"; paid_terms[k] = paid_terms.get(k, 0) + p['amount']
        if p.get('feeTypeId'): paid_custom[p['feeTypeId']] = paid_custom.get(p['feeTypeId'], 0) + p['amount']
    # Inventory issued
    inventory_issued = await db.inventory_issues.find({"studentId": student_id}, {"_id": 0}).to_list(500)
    return {
        "student": student, "attendance": attendance,
        "attendanceStats": {"totalDays": total_days, "presentDays": present_days, "absentDays": absent_days,
                            "percentage": round(present_days / total_days * 100, 1) if total_days > 0 else 0},
        "payments": payments, "paidTerms": paid_terms, "paidCustomFees": paid_custom, "customFees": custom_fees,
        "inventoryIssued": inventory_issued,
        "promotionHistory": student.get('promotionHistory', []),
    }

# ==================== PARENT PORTAL ====================

@router.get("/parent/dashboard/{student_id}")
async def parent_dashboard(student_id: str):
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student: raise HTTPException(status_code=404, detail="Student not found")
    attendance = await db.attendance.find({"studentId": student_id}, {"_id": 0}).to_list(10000)
    total_days = len(attendance)
    present_days = sum(1 for a in attendance if a['status'] == 'present')
    absent_days = sum(1 for a in attendance if a['status'] == 'absent')
    payments = await db.fee_payments.find({"studentId": student_id}, {"_id": 0}).to_list(100)
    events = await db.events.find({}, {"_id": 0}).to_list(100)
    homework_cutoff = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
    homework = await db.homework.find({"studentClass": student.get('studentClass', ''), "section": student.get('section', ''), "createdAt": {"$gte": homework_cutoff}}, {"_id": 0}).to_list(100)
    # Fallback: if createdAt is stored as ISO string, also get by dueDate
    if not homework:
        homework = await db.homework.find({"studentClass": student.get('studentClass', ''), "section": student.get('section', ''), "dueDate": {"$gte": homework_cutoff}}, {"_id": 0}).to_list(100)
    # Fee structure
    custom_fees = await db.fee_types.find({
        "$or": [
            {"applicableClass": student.get('studentClass', ''), "applicableSection": student.get('section', '')},
            {"applicableClass": student.get('studentClass', ''), "applicableSection": {"$in": [None, ""]}},
            {"applicableClass": {"$in": [None, ""]}, "applicableSection": {"$in": [None, ""]}},
        ]
    }, {"_id": 0}).to_list(500)
    paid_terms, paid_custom = {}, {}
    for p in payments:
        if p.get('status') in ('reverted', 'archived'): continue
        if p.get('termNumber'):
            k = f"term{p['termNumber']}"
            paid_terms[k] = paid_terms.get(k, 0) + p['amount']
        if p.get('feeTypeId'):
            paid_custom[p['feeTypeId']] = paid_custom.get(p['feeTypeId'], 0) + p['amount']
    return {
        "student": {k: v for k, v in student.items() if k != 'parentPassword'},
        "attendanceStats": {"totalDays": total_days, "presentDays": present_days, "absentDays": absent_days,
                            "percentage": round(present_days / total_days * 100, 1) if total_days > 0 else 0},
        "recentAttendance": attendance[-30:] if attendance else [],
        "fullAttendance": attendance,
        "payments": payments, "events": events, "homework": homework,
        "marks": await db.marks.find({"studentId": student['id']}, {"_id": 0}).sort("recordedOn", -1).to_list(1000),
        "feeStructure": {
            "term1": {"total": student.get('feeTerm1', 0), "paid": paid_terms.get('term1', 0)},
            "term2": {"total": student.get('feeTerm2', 0), "paid": paid_terms.get('term2', 0)},
            "term3": {"total": student.get('feeTerm3', 0), "paid": paid_terms.get('term3', 0)},
            "customFees": [{"id": cf['id'], "feeName": cf['feeName'], "total": cf['amount'], "paid": paid_custom.get(cf['id'], 0), "dueDate": cf.get('dueDate')} for cf in custom_fees],
        },
        "paidTerms": paid_terms, "paidCustomFees": paid_custom, "customFees": custom_fees,
    }

# ==================== DASHBOARD STATS ====================

@router.get("/stats/dashboard")
async def get_dashboard_stats():
    total_students = await db.students.count_documents({})
    today = datetime.now().strftime('%Y-%m-%d')
    today_present = await db.attendance.count_documents({"date": today, "status": "present"})
    today_absent = await db.attendance.count_documents({"date": today, "status": "absent"})
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    fees_result = await db.fee_payments.aggregate(pipeline).to_list(1)
    total_fees = fees_result[0]['total'] if fees_result else 0
    students = await db.students.find({}, {"_id": 0, "feeTerm1": 1, "feeTerm2": 1, "feeTerm3": 1}).to_list(10000)
    total_expected = sum(s.get('feeTerm1', 0) + s.get('feeTerm2', 0) + s.get('feeTerm3', 0) for s in students)
    return {"totalStudents": total_students, "presentToday": today_present, "absentToday": today_absent,
            "totalFeesCollected": total_fees, "pendingFees": total_expected - total_fees}


# ==================== COMPLAINTS ====================

@router.post("/complaints", response_model=Complaint)
async def create_complaint(data: ComplaintCreate):
    obj = Complaint(**data.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    if doc.get('lastStatusUpdate'): doc['lastStatusUpdate'] = doc['lastStatusUpdate'].isoformat()
    if doc.get('resolvedAt'): doc['resolvedAt'] = doc['resolvedAt'].isoformat()
    await db.complaints.insert_one(doc)
    return obj

@router.get("/complaints")
async def list_complaints(status: Optional[str] = None, createdByUsername: Optional[str] = None,
                          overdueOnly: Optional[bool] = False):
    query = {}
    if status: query['status'] = status
    if createdByUsername: query['createdByUsername'] = createdByUsername
    rows = await db.complaints.find(query, {"_id": 0}).sort("createdAt", -1).to_list(2000)
    today = datetime.now().strftime('%Y-%m-%d')
    for c in rows:
        c['isOverdue'] = (c.get('status') != 'resolved') and (c.get('dueDate') or '') < today
    if overdueOnly:
        rows = [c for c in rows if c['isOverdue']]
    return rows

@router.get("/complaints/overdue-count")
async def complaints_overdue_count():
    today = datetime.now().strftime('%Y-%m-%d')
    count = await db.complaints.count_documents({"status": {"$ne": "resolved"}, "dueDate": {"$lt": today}})
    pending = await db.complaints.count_documents({"status": "pending"})
    in_progress = await db.complaints.count_documents({"status": "in_progress"})
    return {"overdue": count, "pending": pending, "inProgress": in_progress}

@router.put("/complaints/{complaint_id}")
async def update_complaint(complaint_id: str, data: ComplaintUpdate):
    c = await db.complaints.find_one({"id": complaint_id}, {"_id": 0})
    if not c: raise HTTPException(status_code=404, detail="Complaint not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if 'status' in update:
        update['lastStatusUpdate'] = datetime.now(timezone.utc).isoformat()
        if update['status'] == 'resolved':
            update['resolvedAt'] = datetime.now(timezone.utc).isoformat()
    if update:
        await db.complaints.update_one({"id": complaint_id}, {"$set": update})
    return await db.complaints.find_one({"id": complaint_id}, {"_id": 0})

@router.delete("/complaints/{complaint_id}")
async def delete_complaint(complaint_id: str):
    res = await db.complaints.delete_one({"id": complaint_id})
    if res.deleted_count == 0: raise HTTPException(status_code=404, detail="Complaint not found")
    return {"message": "Complaint deleted"}
