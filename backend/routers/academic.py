"""Academic (attendance + marks + subjects + homework + events) router."""
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

# ==================== ATTENDANCE ROUTES ====================

@router.post("/attendance")
async def mark_attendance(data: AttendanceSubmit):
    await db.attendance.delete_many({"studentClass": data.studentClass, "section": data.section, "date": data.date})
    records = []
    for record in data.records:
        att = AttendanceRecord(studentId=record['studentId'], rollNo=record['rollNo'], studentName=record['studentName'],
                               studentClass=data.studentClass, section=data.section, date=data.date, status=record['status'])
        doc = att.model_dump()
        doc['createdAt'] = doc['createdAt'].isoformat()
        records.append(doc)
    if records: await db.attendance.insert_many(records)
    return {"message": f"Attendance marked for {len(records)} students"}

@router.get("/attendance")
async def get_attendance(studentClass: Optional[str] = None, section: Optional[str] = None, startDate: Optional[str] = None, endDate: Optional[str] = None, date: Optional[str] = None, studentId: Optional[str] = None):
    query = {}
    if studentId: query['studentId'] = studentId
    if studentClass: query['studentClass'] = studentClass
    if section: query['section'] = section
    if date: query['date'] = date
    elif startDate and endDate: query['date'] = {'$gte': startDate, '$lte': endDate}
    elif startDate: query['date'] = startDate
    return await db.attendance.find(query, {"_id": 0}).to_list(10000)

@router.get("/attendance/export")
async def export_attendance(studentClass: str, section: str, startDate: str, endDate: str, format: str = 'csv'):
    records = await db.attendance.find({"studentClass": studentClass, "section": section, "date": {'$gte': startDate, '$lte': endDate}}, {"_id": 0}).to_list(10000)
    if format == 'xlsx':
        wb = Workbook()
        ws = wb.active
        ws.title = "Attendance"
        ws.append(['Roll No', 'Student Name', 'Date', 'Status'])
        for r in records: ws.append([r['rollNo'], r['studentName'], r['date'], r['status']])
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                 headers={"Content-Disposition": f"attachment; filename=attendance.xlsx"})
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['Roll No', 'Student Name', 'Date', 'Status'])
    for r in records: writer.writerow([r['rollNo'], r['studentName'], r['date'], r['status']])
    output.seek(0)
    return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=attendance.csv"})

@router.post("/attendance/send-alerts")
async def send_attendance_alerts(data: Dict):
    absent_records = data.get('absentRecords', [])
    settings_doc = await get_wa_settings()
    sent_count = 0
    for record in absent_records:
        class_name = f"{record.get('studentClass', '')}-{record.get('section', '')}"
        result = await send_absent_message(record.get('mobile', ''), record['studentName'], class_name, record['date'], settings_doc)
        if result.get('success'): sent_count += 1
    return {"message": f"Alerts sent to {sent_count} parents"}

@router.get("/fees/status")
async def get_fee_status(studentClass: str, section: str):
    """Get fee status for all students in a class/section"""
    students = await db.students.find({"studentClass": studentClass, "section": section}, {"_id": 0}).to_list(1000)
    # Get all custom fee types applicable
    custom_fees = await db.fee_types.find({
        "$or": [
            {"applicableClass": studentClass, "applicableSection": section},
            {"applicableClass": studentClass, "applicableSection": {"$in": [None, ""]}},
            {"applicableClass": {"$in": [None, ""]}, "applicableSection": {"$in": [None, ""]}},
        ]
    }, {"_id": 0}).to_list(500)

    result = []
    for student in students:
        payments = await db.fee_payments.find({"studentId": student['id']}, {"_id": 0}).to_list(100)
        paid_terms = {}
        paid_custom = {}
        for p in payments:
            if p.get('status') in ('reverted', 'archived'): continue
            if p.get('termNumber'):
                k = f"term{p['termNumber']}"
                paid_terms[k] = paid_terms.get(k, 0) + p['amount']
            if p.get('feeTypeId'):
                paid_custom[p['feeTypeId']] = paid_custom.get(p['feeTypeId'], 0) + p['amount']

        total_expected = student.get('feeTerm1', 0) + student.get('feeTerm2', 0) + student.get('feeTerm3', 0)
        total_expected += sum(cf['amount'] for cf in custom_fees)
        total_paid = sum(paid_terms.values()) + sum(paid_custom.values())

        row = {
            "rollNo": student['rollNo'],
            "studentName": student['studentName'],
            "mobile": student.get('mobile', ''),
            "term1Total": student.get('feeTerm1', 0),
            "term1Paid": paid_terms.get('term1', 0),
            "term2Total": student.get('feeTerm2', 0),
            "term2Paid": paid_terms.get('term2', 0),
            "term3Total": student.get('feeTerm3', 0),
            "term3Paid": paid_terms.get('term3', 0),
            "customFees": [{
                "feeName": cf['feeName'],
                "total": cf['amount'],
                "paid": paid_custom.get(cf['id'], 0)
            } for cf in custom_fees],
            "totalExpected": total_expected,
            "totalPaid": total_paid,
            "totalPending": total_expected - total_paid,
        }
        result.append(row)
    return {"students": result, "customFeeNames": [cf['feeName'] for cf in custom_fees]}

@router.get("/fees/status/export")
async def export_fee_status(studentClass: str, section: str, format: str = 'csv'):
    data = await get_fee_status(studentClass, section)
    students = data['students']
    custom_names = data['customFeeNames']

    headers = ['Roll No', 'Name', 'Term1 Total', 'Term1 Paid', 'Term2 Total', 'Term2 Paid', 'Term3 Total', 'Term3 Paid']
    for cn in custom_names:
        headers.extend([f'{cn} Total', f'{cn} Paid'])
    headers.extend(['Total Expected', 'Total Paid', 'Total Pending'])

    rows = []
    for s in students:
        row = [s['rollNo'], s['studentName'], s['term1Total'], s['term1Paid'], s['term2Total'], s['term2Paid'], s['term3Total'], s['term3Paid']]
        for cf in s['customFees']:
            row.extend([cf['total'], cf['paid']])
        row.extend([s['totalExpected'], s['totalPaid'], s['totalPending']])
        rows.append(row)

    if format == 'xlsx':
        wb = Workbook()
        ws = wb.active
        ws.title = "Fee Status"
        ws.append(headers)
        for r in rows: ws.append(r)
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return StreamingResponse(output, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                 headers={"Content-Disposition": f"attachment; filename=fee_status_{studentClass}_{section}.xlsx"})
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for r in rows: writer.writerow(r)
    output.seek(0)
    return Response(content=output.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=fee_status_{studentClass}_{section}.csv"})

# ==================== SUBJECT ROUTES ====================

@router.post("/subjects", response_model=Subject)
async def create_subject(data: SubjectCreate):
    obj = Subject(**data.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.subjects.insert_one(doc)
    return obj

@router.get("/subjects")
async def get_subjects(studentClass: Optional[str] = None):
    query = {}
    if studentClass:
        query = {"$or": [{"applicableClasses": studentClass}, {"applicableClasses": []}, {"applicableClasses": {"$exists": False}}]}
    subjects = await db.subjects.find(query, {"_id": 0}).to_list(500)
    subjects.sort(key=lambda s: s.get('subjectName', ''))
    return subjects

@router.put("/subjects/{subject_id}", response_model=Subject)
async def update_subject(subject_id: str, data: SubjectUpdate):
    subj = await db.subjects.find_one({"id": subject_id}, {"_id": 0})
    if not subj: raise HTTPException(status_code=404, detail="Subject not found")
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if update: await db.subjects.update_one({"id": subject_id}, {"$set": update})
    updated = await db.subjects.find_one({"id": subject_id}, {"_id": 0})
    if isinstance(updated.get('createdAt'), str): updated['createdAt'] = datetime.fromisoformat(updated['createdAt'])
    return Subject(**updated)

@router.delete("/subjects/{subject_id}")
async def delete_subject(subject_id: str):
    result = await db.subjects.delete_one({"id": subject_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Subject not found")
    return {"message": "Subject deleted"}

# ==================== MARKS ROUTES ====================

@router.get("/marks/sample-csv")
async def marks_sample_csv(studentClass: str, section: str, examName: Optional[str] = ""):
    students = await db.students.find({"studentClass": studentClass, "section": section}, {"_id": 0}).to_list(10000)
    if not students:
        raise HTTPException(status_code=404, detail="No students found for this class & section")
    # Find applicable subjects for this class
    subjects = await db.subjects.find({"$or": [
        {"applicableClasses": studentClass},
        {"applicableClasses": []},
        {"applicableClasses": {"$exists": False}},
    ]}, {"_id": 0}).to_list(500)
    students.sort(key=lambda s: str(s.get('rollNo', '')))
    output = io.StringIO()
    writer = csv.writer(output)
    if subjects:
        # One row per student — one column per subject, plus manually-filled Total/Grade
        writer.writerow(["Student ID", "Name", "Exam Name"] + [subj.get('subjectName', '') for subj in subjects] + ["Total", "Grade"])
        for s in students:
            writer.writerow(
                [s.get('studentCode', s.get('rollNo', '')), s.get('studentName', ''), examName or '']
                + ['' for _ in subjects]
                + ['', '']
            )
    else:
        # Fallback: no subjects defined for this class — single generic Marks/Max Marks pair
        writer.writerow(["Student ID", "Name", "Exam Name", "Marks", "Max Marks", "Total", "Grade"])
        for s in students:
            writer.writerow([s.get('studentCode', s.get('rollNo', '')), s.get('studentName', ''), examName or '', '', '100', '', ''])
    output.seek(0)
    filename = f"marks_template_{studentClass}_{section}{('_' + examName) if examName else ''}.csv"
    return StreamingResponse(io.BytesIO(output.getvalue().encode('utf-8')), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={filename}"})

@router.post("/marks/bulk")
async def create_marks_bulk(data: MarksBulkCreate):
    if not data.rows:
        raise HTTPException(status_code=400, detail="No rows provided")
    created = 0
    errors = []
    for row in data.rows:
        student = await db.students.find_one({"studentCode": row.studentCode}, {"_id": 0})
        if not student:
            errors.append(f"{row.studentCode}: not found")
            continue
        exam_name = (row.examName or data.examName).strip()
        subject = (row.subject or data.subject).strip()
        if not exam_name or not subject:
            errors.append(f"{row.studentCode}: missing exam name or subject")
            continue
        max_marks = row.maxMarks or data.maxMarks or 100
        # Upsert: replace existing record for the same student+exam+subject
        await db.marks.delete_many({
            "studentId": student['id'], "examName": exam_name, "subject": subject
        })
        entry = MarkEntry(
            studentId=student['id'], studentCode=row.studentCode,
            studentName=student.get('studentName', ''),
            studentClass=data.studentClass, section=data.section,
            examName=exam_name, subject=subject,
            marks=float(row.marks), maxMarks=float(max_marks),
            recordedBy=data.recordedBy or 'Teacher'
        )
        doc = entry.model_dump()
        doc['recordedOn'] = doc['recordedOn'].isoformat()
        await db.marks.insert_one(doc)
        created += 1

    for summary_row in (data.examSummaries or []):
        if summary_row.total is None and summary_row.grade is None:
            continue
        student = await db.students.find_one({"studentCode": summary_row.studentCode}, {"_id": 0})
        if not student:
            errors.append(f"{summary_row.studentCode}: not found (total/grade skipped)")
            continue
        await db.exam_summaries.delete_many({"studentId": student['id'], "examName": data.examName})
        summary = ExamSummary(
            studentId=student['id'], studentCode=summary_row.studentCode,
            studentName=student.get('studentName', ''),
            studentClass=data.studentClass, section=data.section,
            examName=data.examName, total=summary_row.total, grade=summary_row.grade,
        )
        summary_doc = summary.model_dump()
        summary_doc['createdAt'] = summary_doc['createdAt'].isoformat()
        await db.exam_summaries.insert_one(summary_doc)

    return {"created": created, "errors": errors}


@router.post("/marks/send-exam-notifications")
async def send_exam_notifications(payload: Dict):
    """Send WhatsApp result notification per student for a finalized exam.

    Body: { examName: str (required), studentClass?: str, section?: str }
    Returns: { sent, skipped, failed, disabled, details: [...] }
    """
    exam_name = (payload.get('examName') or '').strip()
    if not exam_name:
        raise HTTPException(status_code=400, detail="examName is required")
    student_class = payload.get('studentClass')
    section = payload.get('section')

    query = {"examName": exam_name}
    if student_class: query['studentClass'] = student_class
    if section: query['section'] = section
    marks = await db.marks.find(query, {"_id": 0}).to_list(10000)
    if not marks:
        return {"sent": 0, "skipped": 0, "failed": 0, "disabled": False, "details": [], "message": "No marks found for the given filter"}

    # Group by student
    by_student: Dict[str, Dict] = {}
    for m in marks:
        sid = m.get('studentId')
        if not sid:
            continue
        entry = by_student.setdefault(sid, {"marks": [], "studentClass": m.get('studentClass', ''), "section": m.get('section', ''), "studentName": m.get('studentName', ''), "studentCode": m.get('studentCode', '')})
        entry["marks"].append(m)

    # Load WhatsApp settings once
    wa_settings = await get_wa_settings()
    if not wa_settings:
        return {"sent": 0, "skipped": 0, "failed": len(by_student), "disabled": False,
                "message": "WhatsApp is not configured. Please set Phone Number ID and Access Token in Settings."}

    sent = 0
    skipped = 0
    failed = 0
    disabled_flag = False
    details = []

    for sid, entry in by_student.items():
        # Fetch parent mobile from student record
        student = await db.students.find_one({"id": sid}, {"_id": 0}) or await db.students.find_one({"studentCode": entry.get('studentCode')}, {"_id": 0})
        mobile = (student or {}).get('parentMobile', '').strip()
        student_name = (student or {}).get('name') or entry.get('studentName') or 'Student'
        if not mobile:
            skipped += 1
            details.append({"studentId": sid, "studentName": student_name, "status": "skipped", "reason": "no parent mobile"})
            continue

        # Build marks_summary
        parts = []
        for m in sorted(entry["marks"], key=lambda x: x.get('subject', '')):
            parts.append(f"{m.get('subject', '')}: {m.get('marks', 0)}/{m.get('maxMarks', 100)}")
        marks_summary = ", ".join(parts)

        result = await send_marks_message(
            mobile=mobile,
            student_name=student_name,
            exam_name=exam_name,
            class_name=entry.get('studentClass', ''),
            section=entry.get('section', ''),
            marks_summary=marks_summary,
            settings=wa_settings,
        )
        if result.get('skipped'):
            disabled_flag = True
            skipped += 1
            details.append({"studentId": sid, "studentName": student_name, "status": "disabled", "reason": result.get('message')})
        elif result.get('success'):
            sent += 1
            details.append({"studentId": sid, "studentName": student_name, "status": "sent"})
        else:
            failed += 1
            details.append({"studentId": sid, "studentName": student_name, "status": "failed", "reason": result.get('message', 'unknown')})

    return {"sent": sent, "skipped": skipped, "failed": failed, "disabled": disabled_flag, "totalStudents": len(by_student), "details": details}


@router.get("/marks")
async def get_marks(studentId: Optional[str] = None, studentClass: Optional[str] = None,
                    section: Optional[str] = None, examName: Optional[str] = None,
                    subject: Optional[str] = None):
    query = {}
    if studentId: query['studentId'] = studentId
    if studentClass: query['studentClass'] = studentClass
    if section: query['section'] = section
    if examName: query['examName'] = examName
    if subject: query['subject'] = subject
    return await db.marks.find(query, {"_id": 0}).sort("recordedOn", -1).to_list(10000)

def _fallback_grade(pct: float) -> str:
    if pct >= 90: return "A+"
    if pct >= 75: return "A"
    if pct >= 60: return "B"
    if pct >= 45: return "C"
    if pct >= 33: return "D"
    return "F"

@router.get("/marks/exam-summaries")
async def get_exam_summaries(examName: str, studentClass: Optional[str] = None, section: Optional[str] = None, studentId: Optional[str] = None):
    query = {"examName": examName}
    if studentClass: query['studentClass'] = studentClass
    if section: query['section'] = section
    if studentId: query['studentId'] = studentId
    return await db.exam_summaries.find(query, {"_id": 0}).to_list(10000)

@router.get("/marks/progress-card")
async def get_progress_card(examName: str, studentClass: Optional[str] = None, section: Optional[str] = None, studentId: Optional[str] = None):
    query = {"examName": examName}
    if studentClass: query['studentClass'] = studentClass
    if section: query['section'] = section
    if studentId: query['studentId'] = studentId
    marks = await db.marks.find(query, {"_id": 0}).to_list(10000)
    if not marks:
        raise HTTPException(status_code=404, detail="No marks found for the given filter")

    by_student: Dict[str, Dict] = {}
    for m in marks:
        sid = m.get('studentId')
        if not sid:
            continue
        by_student.setdefault(sid, []).append(m)

    summaries = await db.exam_summaries.find({"examName": examName, "studentId": {"$in": list(by_student.keys())}}, {"_id": 0}).to_list(10000)
    summary_by_student = {s['studentId']: s for s in summaries}

    student_ids = list(by_student.keys())
    students = await db.students.find({"id": {"$in": student_ids}}, {"_id": 0}).to_list(10000)
    student_by_id = {s['id']: s for s in students}

    entries = []
    for sid, student_marks in by_student.items():
        student = student_by_id.get(sid)
        if not student:
            continue
        subject_rows = sorted(student_marks, key=lambda m: m.get('subject', ''))
        sum_marks = sum(m['marks'] for m in subject_rows)
        sum_max = sum(m.get('maxMarks', 100) for m in subject_rows)
        pct = (sum_marks / sum_max * 100) if sum_max else 0
        summary = summary_by_student.get(sid)
        total = summary['total'] if summary and summary.get('total') is not None else sum_marks
        grade = summary['grade'] if summary and summary.get('grade') else _fallback_grade(pct)
        entries.append({
            "student": student, "examName": examName, "subjectRows": subject_rows,
            "total": total, "maxTotal": sum_max, "grade": grade,
        })
    entries.sort(key=lambda e: str(e['student'].get('rollNo', '')))

    school = await db.settings.find_one({"type": "school"}, {"_id": 0})
    buf = generate_progress_card_pdf(entries, school)
    return StreamingResponse(buf, media_type="application/pdf")

@router.get("/marks/distinct")
async def get_marks_distinct():
    """Return distinct exams and subjects available."""
    exams = await db.marks.distinct("examName")
    subjects = await db.marks.distinct("subject")
    classes_in_marks = await db.marks.distinct("studentClass")
    return {"exams": sorted([e for e in exams if e]), "subjects": sorted([s for s in subjects if s]),
            "classes": sorted([c for c in classes_in_marks if c])}

@router.delete("/marks/{mark_id}")
async def delete_mark(mark_id: str):
    result = await db.marks.delete_one({"id": mark_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Mark not found")
    return {"message": "Mark deleted"}

@router.post("/marks/bulk-delete")
async def bulk_delete_marks(data: Dict):
    """Delete marks matching filters. Body: {studentClass?, section?, examName?, subject?, ids?}"""
    query = {}
    if data.get('studentClass'): query['studentClass'] = data['studentClass']
    if data.get('section'): query['section'] = data['section']
    if data.get('examName'): query['examName'] = data['examName']
    if data.get('subject'): query['subject'] = data['subject']
    if data.get('ids'): query['id'] = {"$in": data['ids']}
    if not query:
        raise HTTPException(status_code=400, detail="At least one filter required")
    result = await db.marks.delete_many(query)
    return {"deleted": result.deleted_count}



@router.get("/marks/stats")
async def get_marks_stats(studentClass: Optional[str] = None, section: Optional[str] = None,
                          examName: Optional[str] = None, subject: Optional[str] = None,
                          compareExamA: Optional[str] = None, compareExamB: Optional[str] = None):
    """Aggregated statistics for analytics dashboards."""
    base_query = {}
    if studentClass: base_query['studentClass'] = studentClass
    if section: base_query['section'] = section
    if subject: base_query['subject'] = subject

    # For single exam filter
    single_q = dict(base_query)
    if examName: single_q['examName'] = examName

    marks_records = await db.marks.find(single_q, {"_id": 0}).to_list(10000)

    # Overall metrics
    pct_list = [(m['marks'] / m['maxMarks'] * 100) if m.get('maxMarks') else 0 for m in marks_records]
    overall = {
        "totalEntries": len(marks_records),
        "averagePct": round(sum(pct_list) / len(pct_list), 2) if pct_list else 0,
        "highestPct": round(max(pct_list), 2) if pct_list else 0,
        "lowestPct": round(min(pct_list), 2) if pct_list else 0,
        "passCount": sum(1 for p in pct_list if p >= 33),
        "failCount": sum(1 for p in pct_list if p < 33),
    }

    # Group by subject -> average pct
    subj_map = {}
    for m in marks_records:
        s = m.get('subject', 'Unknown')
        if s not in subj_map: subj_map[s] = []
        pct = (m['marks'] / m['maxMarks'] * 100) if m.get('maxMarks') else 0
        subj_map[s].append(pct)
    bySubject = [{"subject": k, "average": round(sum(v) / len(v), 2), "count": len(v)} for k, v in subj_map.items()]
    bySubject.sort(key=lambda x: x['subject'])

    # Grade distribution buckets
    buckets = {"A+ (90+)": 0, "A (75-89)": 0, "B (60-74)": 0, "C (45-59)": 0, "D (33-44)": 0, "F (<33)": 0}
    for p in pct_list:
        if p >= 90: buckets["A+ (90+)"] += 1
        elif p >= 75: buckets["A (75-89)"] += 1
        elif p >= 60: buckets["B (60-74)"] += 1
        elif p >= 45: buckets["C (45-59)"] += 1
        elif p >= 33: buckets["D (33-44)"] += 1
        else: buckets["F (<33)"] += 1
    grades = [{"grade": k, "count": v} for k, v in buckets.items()]

    # Top students (top 10)
    student_map = {}
    for m in marks_records:
        sid = m['studentId']
        if sid not in student_map:
            student_map[sid] = {"studentId": sid, "studentName": m.get('studentName', ''),
                                "studentCode": m.get('studentCode', ''), "marks": 0, "max": 0}
        student_map[sid]['marks'] += m['marks']
        student_map[sid]['max'] += m.get('maxMarks', 100)
    students_stats = []
    for v in student_map.values():
        pct = (v['marks'] / v['max'] * 100) if v['max'] else 0
        students_stats.append({**v, "pct": round(pct, 2)})
    students_stats.sort(key=lambda x: x['pct'], reverse=True)
    topStudents = students_stats[:10]

    # Compare two exams
    compare = None
    if compareExamA and compareExamB:
        a_q = dict(base_query); a_q['examName'] = compareExamA
        b_q = dict(base_query); b_q['examName'] = compareExamB
        rec_a = await db.marks.find(a_q, {"_id": 0}).to_list(10000)
        rec_b = await db.marks.find(b_q, {"_id": 0}).to_list(10000)
        def avg_by_subject(records):
            mp = {}
            for r in records:
                s = r.get('subject', 'Unknown')
                if s not in mp: mp[s] = []
                pct = (r['marks'] / r['maxMarks'] * 100) if r.get('maxMarks') else 0
                mp[s].append(pct)
            return {k: round(sum(v) / len(v), 2) for k, v in mp.items()}
        a_subj = avg_by_subject(rec_a)
        b_subj = avg_by_subject(rec_b)
        all_subj = sorted(set(list(a_subj.keys()) + list(b_subj.keys())))
        compare = [{"subject": s, compareExamA: a_subj.get(s, 0), compareExamB: b_subj.get(s, 0)} for s in all_subj]

    return {"overall": overall, "bySubject": bySubject, "grades": grades,
            "topStudents": topStudents, "compare": compare}


# ==================== EVENT ROUTES ====================

@router.post("/events")
async def create_event(event: EventCreate):
    obj = Event(**event.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.events.insert_one(doc)
    # Send WhatsApp notification to all students if enabled
    if event.sendNotification:
        settings_doc = await get_wa_settings()
        if settings_doc:
            students = await db.students.find({}, {"_id": 0, "mobile": 1}).to_list(10000)
            for student in students:
                if student.get('mobile'):
                    await send_event_message(student['mobile'], event.title, event.date, settings_doc)
    return obj

@router.get("/events")
async def get_events(month: Optional[str] = None):
    query = {}
    if month: query['date'] = {'$regex': f'^{month}'}
    return await db.events.find(query, {"_id": 0}).to_list(1000)

@router.put("/events/{event_id}")
async def update_event(event_id: str, data: EventCreate):
    result = await db.events.update_one({"id": event_id}, {"$set": data.model_dump()})
    if result.matched_count == 0: raise HTTPException(status_code=404, detail="Event not found")
    return await db.events.find_one({"id": event_id}, {"_id": 0})

@router.delete("/events/{event_id}")
async def delete_event(event_id: str):
    result = await db.events.delete_one({"id": event_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}

# ==================== HOMEWORK ROUTES ====================

@router.post("/homework")
async def create_homework(hw: HomeworkCreate):
    obj = Homework(**hw.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.homework.insert_one(doc)
    return obj

@router.get("/homework")
async def get_homework(studentClass: Optional[str] = None, section: Optional[str] = None):
    query = {}
    if studentClass: query['studentClass'] = studentClass
    if section: query['section'] = section
    return await db.homework.find(query, {"_id": 0}).to_list(1000)

@router.put("/homework/{hw_id}")
async def update_homework(hw_id: str, data: HomeworkCreate):
    result = await db.homework.update_one({"id": hw_id}, {"$set": data.model_dump()})
    if result.matched_count == 0: raise HTTPException(status_code=404, detail="Homework not found")
    return await db.homework.find_one({"id": hw_id}, {"_id": 0})

@router.delete("/homework/{hw_id}")
async def delete_homework(hw_id: str):
    result = await db.homework.delete_one({"id": hw_id})
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Homework not found")
    return {"message": "Homework deleted"}

