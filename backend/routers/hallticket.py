"""Hall ticket router: exam timetable schedules per class/section and printable hall ticket PDFs."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional

from db import db
from models import *
from services.pdf import generate_hall_tickets_pdf

router = APIRouter()


@router.post("/hall-ticket-exams", response_model=HallTicketExam)
async def create_hall_ticket_exam(data: HallTicketExamCreate):
    obj = HallTicketExam(**data.model_dump())
    doc = obj.model_dump()
    doc['createdAt'] = doc['createdAt'].isoformat()
    await db.hall_ticket_exams.insert_one(doc)
    return obj

@router.get("/hall-ticket-exams")
async def list_hall_ticket_exams(studentClass: Optional[str] = None, section: Optional[str] = None):
    query = {}
    if studentClass: query['studentClass'] = studentClass
    if section: query['section'] = section
    return await db.hall_ticket_exams.find(query, {"_id": 0}).to_list(500)

@router.delete("/hall-ticket-exams/{exam_id}")
async def delete_hall_ticket_exam(exam_id: str):
    result = await db.hall_ticket_exams.delete_one({"id": exam_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Exam schedule not found")
    return {"message": "Exam schedule deleted"}

@router.get("/hall-ticket-exams/{exam_id}/pdf")
async def generate_hall_ticket_pdf(exam_id: str):
    exam = await db.hall_ticket_exams.find_one({"id": exam_id}, {"_id": 0})
    if not exam:
        raise HTTPException(status_code=404, detail="Exam schedule not found")
    students = await db.students.find(
        {"studentClass": exam['studentClass'], "section": exam['section']}, {"_id": 0}
    ).to_list(10000)
    if not students:
        raise HTTPException(status_code=404, detail="No students found for this class & section")
    students.sort(key=lambda s: str(s.get('rollNo', '')))
    school = await db.settings.find_one({"type": "school"}, {"_id": 0})
    buf = generate_hall_tickets_pdf(exam, students, school)
    return StreamingResponse(buf, media_type="application/pdf")
