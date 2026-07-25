"""Finance (fees + fee types + concessions + expenses + revert) router."""
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
from services.sms import *
from services.pdf import *

router = APIRouter()
logger = logging.getLogger(__name__)

# ==================== FEE TYPES ROUTES ====================

@router.post("/fee-types", response_model=FeeType)
async def create_fee_type(data: FeeTypeCreate):
    obj = FeeType(**data.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.fee_types.insert_one(doc)
    return obj

@router.get("/fee-types")
async def get_fee_types(applicableClass: Optional[str] = None):
    query = {}
    if applicableClass:
        query['$or'] = [{'applicableClass': applicableClass}, {'applicableClass': None}, {'applicableClass': ''}]
    return await db.fee_types.find(query, {"_id": 0}).to_list(500)

@router.put("/fee-types/{fee_type_id}")
async def update_fee_type(fee_type_id: str, data: FeeTypeCreate):
    result = await db.fee_types.update_one({"id": fee_type_id}, {"$set": data.model_dump()})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Fee type not found")
    return await db.fee_types.find_one({"id": fee_type_id}, {"_id": 0})

@router.delete("/fee-types/{fee_type_id}")
async def delete_fee_type(fee_type_id: str):
    result = await db.fee_types.delete_one({"id": fee_type_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Fee type not found")
    return {"message": "Fee type deleted"}

# ==================== FEE ROUTES ====================

@router.get("/fees/student/{student_code}")
async def get_student_fees(student_code: str):
    student = await db.students.find_one({"studentCode": student_code}, {"_id": 0})
    if not student: raise HTTPException(status_code=404, detail="Student not found")
    payments = await db.fee_payments.find({"studentCode": student_code}, {"_id": 0}).to_list(100)
    paid_terms, paid_custom = {}, {}
    for p in payments:
        if p.get('status') in ('reverted', 'archived'): continue  # Skip reverted/archived payments
        if p.get('termNumber'):
            k = f"term{p['termNumber']}"
            paid_terms[k] = paid_terms.get(k, 0) + p['amount']
        if p.get('feeTypeId'):
            paid_custom[p['feeTypeId']] = paid_custom.get(p['feeTypeId'], 0) + p['amount']
    custom_fees = await db.fee_types.find({
        "$or": [
            {"applicableClass": student.get('studentClass', ''), "applicableSection": student.get('section', '')},
            {"applicableClass": student.get('studentClass', ''), "applicableSection": {"$in": [None, ""]}},
            {"applicableClass": {"$in": [None, ""]}, "applicableSection": {"$in": [None, ""]}, "studentId": {"$in": [None, ""]}},
            {"studentId": student['id']},
        ]
    }, {"_id": 0}).to_list(500)
    return {"student": student, "payments": payments, "paidTerms": paid_terms, "paidCustomFees": paid_custom, "customFees": custom_fees}

@router.post("/fees/payment")
async def create_fee_payment(payment: FeePaymentCreate):
    # Generate sequential receipt number
    last_payment = await db.fee_payments.find({}, {"_id": 0, "receiptNumber": 1}).sort("receiptNumber", -1).to_list(1)
    if last_payment:
        try:
            last_num = int(last_payment[0]['receiptNumber'])
            next_num = last_num + 1
        except (ValueError, KeyError):
            count = await db.fee_payments.count_documents({})
            next_num = count + 1
    else:
        next_num = 1
    receipt_number = str(next_num).zfill(3)

    payment_obj = FeePayment(**payment.model_dump(), receiptNumber=receipt_number)
    doc = payment_obj.model_dump()
    doc['paymentDate'] = doc['paymentDate'].isoformat()
    await db.fee_payments.insert_one(doc)
    channel = await get_channel()
    wa_settings = await get_wa_settings() if channel in ("whatsapp", "both") else None
    sms_settings = await get_sms_settings() if channel in ("sms", "both") else None
    student = await db.students.find_one({"studentCode": payment.studentCode}, {"_id": 0})
    if student and (wa_settings or sms_settings):
        fee_label = f"Term {payment.termNumber}" if payment.termNumber else (payment.feeName or 'Custom Fee')
        mobile = student.get('mobile', '')
        if channel in ("whatsapp", "both") and wa_settings:
            # Build public invoice URL for WhatsApp document (view endpoint, no download header)
            backend_url = os.environ.get('REACT_APP_BACKEND_URL', '')
            invoice_url = f"{backend_url}/api/fees/invoice-view/{payment_obj.id}"
            await send_fee_paid_message(mobile, invoice_url, payment.amount, fee_label, payment.studentName, wa_settings)
        if channel in ("sms", "both"):
            await send_sms_fee_paid(mobile, payment.amount, fee_label, payment.studentName, sms_settings)
    return payment_obj

@router.get("/fees/invoice/{payment_id}")
async def download_invoice(payment_id: str):
    payment = await db.fee_payments.find_one({"id": payment_id}, {"_id": 0})
    if not payment: raise HTTPException(status_code=404, detail="Payment not found")
    student = await db.students.find_one({"studentCode": payment.get('studentCode', payment.get('rollNo', ''))}, {"_id": 0})
    if not student: student = {"studentName": payment.get('studentName', ''), "rollNo": payment.get('rollNo', ''), "studentCode": payment.get('studentCode', ''), "studentClass": "", "section": "", "fatherName": "", "mobile": ""}
    school = await db.settings.find_one({"type": "school"}, {"_id": 0})
    buf = generate_invoice_pdf(payment, student, school)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=invoice_{payment['receiptNumber']}.pdf"})

@router.get("/fees/invoice-view/{payment_id}")
async def view_invoice(payment_id: str):
    """Public PDF view endpoint (no attachment header) - for WhatsApp document link"""
    payment = await db.fee_payments.find_one({"id": payment_id}, {"_id": 0})
    if not payment: raise HTTPException(status_code=404, detail="Payment not found")
    student = await db.students.find_one({"studentCode": payment.get('studentCode', payment.get('rollNo', ''))}, {"_id": 0})
    if not student: student = {"studentName": payment.get('studentName', ''), "rollNo": payment.get('rollNo', ''), "studentCode": payment.get('studentCode', ''), "studentClass": "", "section": "", "fatherName": "", "mobile": ""}
    school = await db.settings.find_one({"type": "school"}, {"_id": 0})
    buf = generate_invoice_pdf(payment, student, school)
    return StreamingResponse(buf, media_type="application/pdf")

@router.get("/fees/day-sheet")
async def get_day_sheet(date: Optional[str] = None):
    if not date: date = datetime.now().strftime('%Y-%m-%d')
    start = datetime.fromisoformat(f"{date}T00:00:00")
    end = datetime.fromisoformat(f"{date}T23:59:59")
    payments = await db.fee_payments.find({"paymentDate": {"$gte": start.isoformat(), "$lte": end.isoformat()}, "status": {"$nin": ["reverted", "archived"]}}, {"_id": 0}).to_list(1000)
    total = sum(p['amount'] for p in payments)
    upi_total = sum(p['amount'] for p in payments if p['paymentMode'] == 'upi')
    cash_total = sum(p['amount'] for p in payments if p['paymentMode'] == 'cash')
    return {"date": date, "payments": payments, "total": total, "upiTotal": upi_total, "cashTotal": cash_total, "count": len(payments)}

@router.get("/fees/export")
async def export_fees(startDate: str, endDate: str, format: str = 'csv'):
    start = datetime.fromisoformat(f"{startDate}T00:00:00")
    end = datetime.fromisoformat(f"{endDate}T23:59:59")
    payments = await db.fee_payments.find({"paymentDate": {"$gte": start.isoformat(), "$lte": end.isoformat()}}, {"_id": 0}).to_list(10000)
    if format == 'xlsx':
        wb = Workbook()
        ws = wb.active
        ws.append(['Receipt No', 'Roll No', 'Student Name', 'Fee Type', 'Amount', 'Mode', 'Date'])
        for p in payments:
            d = p['paymentDate'][:10] if isinstance(p['paymentDate'], str) else p['paymentDate'].strftime('%Y-%m-%d')
            fl = f"Term {p['termNumber']}" if p.get('termNumber') else (p.get('feeName') or 'Custom')
            ws.append([p['receiptNumber'], p['rollNo'], p['studentName'], fl, p['amount'], p['paymentMode'], d])
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=fees_report.xlsx"})
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Receipt No', 'Roll No', 'Student Name', 'Fee Type', 'Amount', 'Mode', 'Date'])
    for p in payments:
        d = p['paymentDate'][:10] if isinstance(p['paymentDate'], str) else p['paymentDate'].strftime('%Y-%m-%d')
        fl = f"Term {p['termNumber']}" if p.get('termNumber') else (p.get('feeName') or 'Custom')
        writer.writerow([p['receiptNumber'], p['rollNo'], p['studentName'], fl, p['amount'], p['paymentMode'], d])
    output.seek(0)
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=fees_report.csv"})

@router.post("/fees/send-reminders")
async def send_fee_reminders():
    channel = await get_channel()
    wa_settings = await get_wa_settings() if channel in ("whatsapp", "both") else None
    sms_settings = await get_sms_settings() if channel in ("sms", "both") else None
    upcoming = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    fee_types = await db.fee_types.find({"dueDate": {"$ne": None, "$lte": upcoming}}, {"_id": 0}).to_list(500)
    sent_count = 0
    for ft in fee_types:
        query = {}
        if ft.get('applicableClass') and ft['applicableClass']: query['studentClass'] = ft['applicableClass']
        if ft.get('applicableSection') and ft['applicableSection']: query['section'] = ft['applicableSection']
        students = await db.students.find(query, {"_id": 0}).to_list(10000)
        for student in students:
            paid = await db.fee_payments.find_one({"studentId": student['id'], "feeTypeId": ft['id']}, {"_id": 0})
            if paid: continue
            mobile = student.get('mobile', '')
            ok = False
            if channel in ("whatsapp", "both") and wa_settings:
                message = f"Fee Reminder: {ft['feeName']} of Rs.{ft['amount']} is due on {ft['dueDate']} for {student['studentName']}."
                result = await send_whatsapp_message(mobile, message, wa_settings)
                ok = ok or result.get('success')
            if channel in ("sms", "both"):
                result = await send_sms_fee_reminder(mobile, student['studentName'], ft['feeName'], ft['amount'], ft['dueDate'], sms_settings)
                ok = ok or result.get('success')
            if ok: sent_count += 1
    return {"message": f"Reminders sent to {sent_count} parents", "feeTypesChecked": len(fee_types)}

# ==================== FEE REVERT ====================

@router.post("/fees/revert/{payment_id}")
async def revert_fee_payment(payment_id: str):
    payment = await db.fee_payments.find_one({"id": payment_id}, {"_id": 0})
    if not payment: raise HTTPException(status_code=404, detail="Payment not found")
    if payment.get('status') == 'reverted': raise HTTPException(status_code=400, detail="Payment already reverted")
    await db.fee_payments.update_one({"id": payment_id}, {"$set": {"status": "reverted"}})
    return {"message": "Payment reverted successfully"}

# ==================== CONCESSION ROUTES ====================

@router.post("/concessions")
async def create_concession(data: ConcessionCreate):
    student = await db.students.find_one({"studentCode": data.studentCode}, {"_id": 0})
    if not student: raise HTTPException(status_code=404, detail="Student not found")
    obj = Concession(**data.model_dump(), studentId=student['id'], studentName=student['studentName'])
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.concessions.insert_one(doc)
    return obj

@router.post("/concessions/bulk")
async def create_bulk_concession(data: BulkConcessionCreate):
    if not data.studentCodes:
        raise HTTPException(status_code=400, detail="No students selected")
    created = []
    errors = []
    for code in data.studentCodes:
        student = await db.students.find_one({"studentCode": code}, {"_id": 0})
        if not student:
            errors.append(f"{code}: not found")
            continue
        obj = Concession(
            studentId=student['id'], studentCode=code, studentName=student['studentName'],
            termNumber=data.termNumber, feeTypeId=data.feeTypeId, feeName=data.feeName,
            concessionAmount=data.concessionAmount, letterUrl=data.letterUrl, requestedBy=data.requestedBy
        )
        doc = obj.model_dump()
        doc['createdAt'] = doc['createdAt'].isoformat()
        await db.concessions.insert_one(doc)
        created.append(code)
    return {"created": len(created), "students": created, "errors": errors}

@router.get("/concessions")
async def get_concessions(status: Optional[str] = None):
    query = {}
    if status: query['status'] = status
    return await db.concessions.find(query, {"_id": 0}).to_list(1000)

@router.post("/concessions/{concession_id}/approve")
async def approve_concession(concession_id: str):
    con = await db.concessions.find_one({"id": concession_id}, {"_id": 0})
    if not con: raise HTTPException(status_code=404, detail="Concession not found")
    if con['status'] != 'pending': raise HTTPException(status_code=400, detail="Already processed")
    # Apply concession: reduce fee amount
    student = await db.students.find_one({"id": con['studentId']}, {"_id": 0})
    if not student: raise HTTPException(status_code=404, detail="Student not found")
    if con.get('termNumber'):
        field = f"feeTerm{con['termNumber']}"
        new_val = max(0, student.get(field, 0) - con['concessionAmount'])
        await db.students.update_one({"id": con['studentId']}, {"$set": {field: new_val}})
    elif con.get('feeTypeId'):
        # Store student-specific concession as a fee payment with concession flag
        await db.fee_payments.insert_one({
            "id": str(uuid.uuid4()), "studentId": con['studentId'], "studentCode": con.get('studentCode', ''),
            "rollNo": student.get('rollNo', ''), "studentName": student.get('studentName', ''),
            "feeTypeId": con['feeTypeId'], "feeName": con.get('feeName', ''),
            "amount": con['concessionAmount'], "paymentMode": "concession",
            "receiptNumber": f"CON-{str(uuid.uuid4())[:6]}", "status": "concession",
            "paymentDate": datetime.now(timezone.utc).isoformat(), "collectedBy": "System"
        })
    await db.concessions.update_one({"id": concession_id}, {"$set": {"status": "approved"}})
    return {"message": "Concession approved and applied"}

@router.post("/concessions/{concession_id}/reject")
async def reject_concession(concession_id: str):
    con = await db.concessions.find_one({"id": concession_id}, {"_id": 0})
    if not con: raise HTTPException(status_code=404, detail="Concession not found")
    if con['status'] != 'pending': raise HTTPException(status_code=400, detail="Already processed")
    await db.concessions.update_one({"id": concession_id}, {"$set": {"status": "rejected"}})
    return {"message": "Concession rejected"}

# ==================== EXPENSE ROUTES ====================

@router.post("/expenses", response_model=Expense)
async def create_expense(expense: ExpenseCreate):
    obj = Expense(**expense.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.expenses.insert_one(doc)
    return obj

@router.get("/expenses", response_model=List[Expense])
async def get_expenses(startDate: Optional[str] = None, endDate: Optional[str] = None):
    query = {}
    if startDate and endDate: query['date'] = {'$gte': startDate, '$lte': endDate}
    expenses = await db.expenses.find(query, {"_id": 0}).to_list(1000)
    for e in expenses:
        if isinstance(e.get('createdAt'), str): e['createdAt'] = datetime.fromisoformat(e['createdAt'])
    return expenses

