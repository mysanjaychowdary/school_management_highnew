"""Students router."""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends
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
from security import hash_password, require_staff
import re

router = APIRouter()
logger = logging.getLogger(__name__)

# ==================== CUSTOM FIELD ROUTES ====================

RESERVED_STUDENT_KEYS = {
    "id", "studentCode", "studentName", "rollNo", "studentClass", "section",
    "fatherName", "motherName", "mobile", "address", "feeTerm1", "feeTerm2", "feeTerm3",
    "parentUsername", "parentPassword", "customFields", "createdAt",
}

def _slugify_field_key(label: str) -> str:
    key = re.sub(r'[^a-zA-Z0-9]+', '_', label.strip()).strip('_').lower()
    key = re.sub(r'^[0-9_]+', '', key)
    return key or 'field'

@router.get("/custom-fields")
async def get_custom_fields():
    return await db.custom_field_defs.find({}, {"_id": 0}).sort("order", 1).to_list(200)

@router.post("/custom-fields", response_model=CustomFieldDef)
async def create_custom_field(data: CustomFieldDefCreate):
    key = _slugify_field_key(data.label)
    if key in RESERVED_STUDENT_KEYS:
        raise HTTPException(status_code=400, detail=f"'{data.label}' conflicts with a built-in student field")
    existing = await db.custom_field_defs.find_one({"key": key}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail=f"A custom field for '{data.label}' already exists")
    order = await db.custom_field_defs.count_documents({})
    required = data.required if data.fieldType != 'fee' else False
    obj = CustomFieldDef(key=key, label=data.label, fieldType=data.fieldType, required=required, order=order)
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.custom_field_defs.insert_one(doc)
    return obj

@router.put("/custom-fields/{field_id}")
async def update_custom_field(field_id: str, data: CustomFieldDefUpdate):
    existing = await db.custom_field_defs.find_one({"id": field_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Custom field not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update:
        await db.custom_field_defs.update_one({"id": field_id}, {"$set": update})
    if data.label and existing.get('fieldType') == 'fee' and data.label != existing.get('label'):
        await db.fee_types.update_many({"customFieldKey": existing['key']}, {"$set": {"feeName": data.label}})
    return await db.custom_field_defs.find_one({"id": field_id}, {"_id": 0})

@router.delete("/custom-fields/{field_id}")
async def delete_custom_field(field_id: str):
    existing = await db.custom_field_defs.find_one({"id": field_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Custom field not found")
    if existing.get('fieldType') == 'fee':
        await db.fee_types.delete_many({"customFieldKey": existing['key']})
    await db.custom_field_defs.delete_one({"id": field_id})
    return {"message": "Custom field deleted"}

# ==================== STUDENT ROUTES ====================

async def _sync_student_fee_fields(student_id: str, student_name: str, fee_values: Dict[str, float]):
    """Upsert/delete per-student FeeType docs for every 'fee'-type custom field based on the given values.
    A value of 0 (or missing) means the fee doesn't apply — any existing auto-synced FeeType is removed."""
    defs = await db.custom_field_defs.find({"fieldType": "fee"}, {"_id": 0}).to_list(200)
    for d in defs:
        amount = fee_values.get(d['key'], 0) or 0
        existing = await db.fee_types.find_one({"studentId": student_id, "customFieldKey": d['key']}, {"_id": 0})
        if amount > 0:
            if existing:
                await db.fee_types.update_one({"id": existing['id']}, {"$set": {"amount": amount, "feeName": d['label'], "studentName": student_name}})
            else:
                obj = FeeType(feeName=d['label'], amount=amount, studentId=student_id, studentName=student_name, customFieldKey=d['key'])
                doc = obj.model_dump()
                doc['createdAt'] = doc['createdAt'].isoformat()
                await db.fee_types.insert_one(doc)
        elif existing:
            await db.fee_types.delete_one({"id": existing['id']})

@router.post("/students", response_model=Student, response_model_exclude={"parentPassword"})
async def create_student(student: StudentCreate, _staff=Depends(require_staff)):
    existing = await db.students.find_one({"studentCode": student.studentCode}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Student ID already exists")
    payload = student.model_dump()
    if payload.get('parentPassword'):
        payload['parentPassword'] = hash_password(payload['parentPassword'])
    student_obj = Student(**payload)
    doc = student_obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.students.insert_one(doc)
    await _sync_student_fee_fields(student_obj.id, student_obj.studentName, student.customFeeValues)
    return student_obj

@router.post("/students/bulk")
async def bulk_upload_students(file: UploadFile = File(...), _staff=Depends(require_staff)):
    try:
        content = await file.read()
        decoded = content.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(decoded))
        field_defs = await db.custom_field_defs.find({}, {"_id": 0}).sort("order", 1).to_list(200)
        added, errors = 0, []
        for row in csv_reader:
            try:
                custom_values = {}
                custom_fee_values = {}
                for d in field_defs:
                    raw = (row.get(d['label']) or '').strip()
                    if d['fieldType'] == 'fee':
                        try:
                            custom_fee_values[d['key']] = float(raw) if raw else 0.0
                        except ValueError:
                            raise ValueError(f"Invalid amount for '{d['label']}': {raw!r}")
                    else:
                        if d['required'] and not raw:
                            raise ValueError(f"Missing required field '{d['label']}'")
                        custom_values[d['key']] = raw
                student_data = StudentCreate(
                    studentCode=row['Student ID'].strip(),
                    studentName=row['Student Name'].strip(), rollNo=row['Roll No'].strip(),
                    studentClass=row['Class'].strip(), section=row['Section'].strip(),
                    fatherName=row['Father Name'].strip(), motherName=row['Mother Name'].strip(),
                    mobile=row['Mobile Number'].strip(), address=row['Address'].strip(),
                    feeTerm1=float(row['Fee Term1']), feeTerm2=float(row['Fee Term2']), feeTerm3=float(row['Fee Term3']),
                    parentUsername=row.get('Parent Username', '').strip() or None,
                    parentPassword=row.get('Parent Password', '').strip() or None,
                    customFields=custom_values,
                    customFeeValues=custom_fee_values,
                )
                existing = await db.students.find_one({"studentCode": student_data.studentCode}, {"_id": 0})
                if existing:
                    errors.append(f"Student ID {student_data.studentCode} exists")
                    continue
                student_payload = student_data.model_dump()
                if student_payload.get('parentPassword'):
                    student_payload['parentPassword'] = hash_password(student_payload['parentPassword'])
                student_obj = Student(**student_payload)
                doc = student_obj.model_dump()
                doc['createdAt'] = doc['createdAt'].isoformat()
                await db.students.insert_one(doc)
                await _sync_student_fee_fields(student_obj.id, student_obj.studentName, custom_fee_values)
                added += 1
            except Exception as e:
                errors.append(f"Row error: {str(e)}")
        return {"added": added, "errors": errors}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/students/sample-csv")
async def download_sample_csv():
    field_defs = await db.custom_field_defs.find({}, {"_id": 0}).sort("order", 1).to_list(200)
    output = io.StringIO()
    writer = csv.writer(output)
    header = ['Student ID', 'Student Name', 'Roll No', 'Class', 'Section', 'Father Name', 'Mother Name', 'Mobile Number', 'Address', 'Fee Term1', 'Fee Term2', 'Fee Term3', 'Parent Username', 'Parent Password']
    header += [d['label'] for d in field_defs]
    writer.writerow(header)
    example_values = ['0' if d['fieldType'] == 'fee' else 'Sample' for d in field_defs]
    writer.writerow(['ADM001', 'John Doe', '1', '1', 'A', 'Robert Doe', 'Jane Doe', '9876543210', '123 Main St', '5000', '5000', '5000', 'parent101', 'pass101'] + example_values)
    writer.writerow(['ADM002', 'Alice Smith', '2', '1', 'A', 'Michael Smith', 'Sarah Smith', '9876543211', '456 Oak Ave', '5000', '5000', '5000', 'parent102', 'pass102'] + example_values)
    output.seek(0)
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=sample_students.csv"})

@router.get("/students")
async def get_students(studentClass: Optional[str] = None, section: Optional[str] = None, search: Optional[str] = None, page: int = 1, limit: int = 50):
    query = {}
    if studentClass: query['studentClass'] = studentClass
    if section: query['section'] = section
    if search: query['$or'] = [{'studentName': {'$regex': search, '$options': 'i'}}, {'rollNo': {'$regex': search, '$options': 'i'}}, {'studentCode': {'$regex': search, '$options': 'i'}}]
    total = await db.students.count_documents(query)
    skip = (page - 1) * limit
    students = await db.students.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
    for s in students:
        if isinstance(s.get('createdAt'), str): s['createdAt'] = datetime.fromisoformat(s['createdAt'])
        if 'studentCode' not in s: s['studentCode'] = s.get('rollNo', '')
        s.pop('parentPassword', None)
    return {"students": students, "total": total, "page": page, "limit": limit, "totalPages": max(1, -(-total // limit))}

@router.put("/students/{student_id}", response_model=Student, response_model_exclude={"parentPassword"})
async def update_student(student_id: str, update_data: StudentUpdate, _staff=Depends(require_staff)):
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student: raise HTTPException(status_code=404, detail="Student not found")
    update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None and k != 'customFeeValues'}
    if update_dict.get('parentPassword'):
        update_dict['parentPassword'] = hash_password(update_dict['parentPassword'])
    if update_dict: await db.students.update_one({"id": student_id}, {"$set": update_dict})
    if update_data.customFeeValues is not None:
        student_name = update_data.studentName or student.get('studentName', '')
        await _sync_student_fee_fields(student_id, student_name, update_data.customFeeValues)
    updated = await db.students.find_one({"id": student_id}, {"_id": 0})
    if isinstance(updated.get('createdAt'), str): updated['createdAt'] = datetime.fromisoformat(updated['createdAt'])
    return Student(**updated)

@router.delete("/students/{student_id}")
async def delete_student(student_id: str, _staff=Depends(require_staff)):
    result = await db.students.delete_one({"id": student_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Student not found")
    return {"message": "Student deleted"}

@router.post("/students/promote-preview")
async def promote_students_preview(request: PromoteRequest):
    """Compute new fee structure for all students in fromClass without committing."""
    students = await db.students.find({"studentClass": request.fromClass}, {"_id": 0}).to_list(10000)
    if not students:
        raise HTTPException(status_code=404, detail="No students found")

    preview = []
    for student in students:
        active_payments = await db.fee_payments.find(
            {"studentId": student['id'], "status": {"$nin": ["reverted", "archived"]}}, {"_id": 0}
        ).to_list(1000)
        total_paid = sum(p.get('amount', 0) for p in active_payments)
        old_custom_fees = await db.fee_types.find({
            "$or": [
                {"applicableClass": request.fromClass, "applicableSection": student.get('section', '')},
                {"applicableClass": request.fromClass, "applicableSection": {"$in": [None, ""]}},
                {"applicableClass": {"$in": [None, ""]}, "applicableSection": {"$in": [None, ""]}, "studentId": {"$in": [None, ""]}},
                {"studentId": student['id']},
            ]
        }, {"_id": 0}).to_list(500)
        total_custom = sum(cf.get('amount', 0) for cf in old_custom_fees)
        old_t1 = student.get('feeTerm1', 0)
        old_t2 = student.get('feeTerm2', 0)
        old_t3 = student.get('feeTerm3', 0)
        total_expected = old_t1 + old_t2 + old_t3 + total_custom
        total_due = max(0, total_expected - total_paid)
        new_t1 = old_t1 + total_due
        new_t2 = old_t2
        new_t3 = old_t3 + 5000
        preview.append({
            "studentId": student['id'],
            "studentCode": student.get('studentCode', ''),
            "studentName": student.get('studentName', ''),
            "rollNo": student.get('rollNo', ''),
            "section": student.get('section', ''),
            "totalPaid": total_paid,
            "totalExpected": total_expected,
            "totalDue": total_due,
            "oldFees": {"term1": old_t1, "term2": old_t2, "term3": old_t3, "customFeesTotal": total_custom},
            "newFees": {"term1": new_t1, "term2": new_t2, "term3": new_t3},
        })
    return {"fromClass": request.fromClass, "toClass": request.toClass, "studentCount": len(preview), "preview": preview}

@router.post("/students/promote")
async def promote_students(request: PromoteRequest):
    students = await db.students.find({"studentClass": request.fromClass}, {"_id": 0}).to_list(10000)
    if not students:
        raise HTTPException(status_code=404, detail="No students found")
    
    promoted_count = 0
    for student in students:
        await _promote_one_student(student, request.toClass)
        promoted_count += 1
    
    return {"message": f"Promoted {promoted_count} students from {request.fromClass} to {request.toClass}. Previous year due added to Term 1, Term 3 increased by Rs.5000."}


class SingleStudentPromote(BaseModel):
    toClass: str

async def _calc_promotion(student: Dict):
    """Shared calc logic. Returns dict with totals + new fees."""
    from_class = student.get('studentClass', '')
    active_payments = await db.fee_payments.find(
        {"studentId": student['id'], "status": {"$nin": ["reverted", "archived"]}}, {"_id": 0}
    ).to_list(1000)
    total_paid = sum(p.get('amount', 0) for p in active_payments)
    old_custom_fees = await db.fee_types.find({
        "$or": [
            {"applicableClass": from_class, "applicableSection": student.get('section', '')},
            {"applicableClass": from_class, "applicableSection": {"$in": [None, ""]}},
            {"applicableClass": {"$in": [None, ""]}, "applicableSection": {"$in": [None, ""]}, "studentId": {"$in": [None, ""]}},
            {"studentId": student['id']},
        ]
    }, {"_id": 0}).to_list(500)
    total_custom = sum(cf.get('amount', 0) for cf in old_custom_fees)
    old_t1 = student.get('feeTerm1', 0)
    old_t2 = student.get('feeTerm2', 0)
    old_t3 = student.get('feeTerm3', 0)
    total_expected = old_t1 + old_t2 + old_t3 + total_custom
    total_due = max(0, total_expected - total_paid)
    return {
        "fromClass": from_class,
        "totalPaid": total_paid, "totalExpected": total_expected, "totalDue": total_due,
        "oldFees": {"term1": old_t1, "term2": old_t2, "term3": old_t3, "customFeesTotal": total_custom},
        "newFees": {"term1": old_t1 + total_due, "term2": old_t2, "term3": old_t3 + 5000},
    }

async def _promote_one_student(student: Dict, to_class: str):
    """Promotes a single student using current fee carryover rules. Appends to promotionHistory."""
    calc = await _calc_promotion(student)
    history_entry = {
        "fromClass": calc['fromClass'],
        "toClass": to_class,
        "totalDue": calc['totalDue'],
        "totalPaid": calc['totalPaid'],
        "oldFees": calc['oldFees'],
        "newFees": calc['newFees'],
        "promotedOn": datetime.now(timezone.utc).isoformat(),
    }
    # Build the update
    set_doc = {
        "studentClass": to_class,
        "feeTerm1": calc['newFees']['term1'],
        "feeTerm2": calc['newFees']['term2'],
        "feeTerm3": calc['newFees']['term3'],
        "previousYearDues": {
            "amount": calc['totalDue'],
            "fromClass": calc['fromClass'],
            "promotedOn": history_entry['promotedOn']
        },
        "academicYear": str(datetime.now().year),
    }
    await db.students.update_one(
        {"id": student['id']},
        {"$set": set_doc, "$push": {"promotionHistory": history_entry}}
    )
    # Archive existing payments
    await db.fee_payments.update_many(
        {"studentId": student['id'], "status": {"$nin": ["reverted", "archived"]}},
        {"$set": {"status": "archived"}}
    )

@router.post("/students/{student_id}/promote-preview")
async def promote_single_preview(student_id: str, data: SingleStudentPromote):
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student: raise HTTPException(status_code=404, detail="Student not found")
    calc = await _calc_promotion(student)
    return {
        "studentId": student['id'],
        "studentCode": student.get('studentCode', ''),
        "studentName": student.get('studentName', ''),
        "rollNo": student.get('rollNo', ''),
        "section": student.get('section', ''),
        "fromClass": calc['fromClass'],
        "toClass": data.toClass,
        "totalPaid": calc['totalPaid'],
        "totalExpected": calc['totalExpected'],
        "totalDue": calc['totalDue'],
        "oldFees": calc['oldFees'],
        "newFees": calc['newFees'],
    }

@router.post("/students/{student_id}/promote")
async def promote_single_student(student_id: str, data: SingleStudentPromote):
    student = await db.students.find_one({"id": student_id}, {"_id": 0})
    if not student: raise HTTPException(status_code=404, detail="Student not found")
    await _promote_one_student(student, data.toClass)
    return {"message": f"{student.get('studentName')} promoted to class {data.toClass}."}

class BulkDeleteRequest(BaseModel):
    studentIds: List[str]

@router.post("/students/bulk-delete")
async def bulk_delete_students(data: BulkDeleteRequest):
    if not data.studentIds:
        raise HTTPException(status_code=400, detail="No students selected")
    result = await db.students.delete_many({"id": {"$in": data.studentIds}})
    return {"message": f"Deleted {result.deleted_count} students"}

