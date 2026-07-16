"""PDF invoice generation using ReportLab."""
import io
import base64
import logging
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table as RLTable, TableStyle, Paragraph, Spacer, Image as RLImage, PageBreak
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm

logger = logging.getLogger(__name__)


def _decode_logo(logo_url):
    """Return BytesIO of logo image from data: URI, else None."""
    if not logo_url or not isinstance(logo_url, str):
        return None
    try:
        if logo_url.startswith('data:'):
            _, b64 = logo_url.split(',', 1)
            return io.BytesIO(base64.b64decode(b64))
    except Exception:
        return None
    return None


def generate_invoice_pdf(payment_data, student_data, school_settings=None):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=10*mm, bottomMargin=8*mm, leftMargin=12*mm, rightMargin=12*mm)
    styles = getSampleStyleSheet()
    elements = []

    school_name = (school_settings or {}).get('schoolName', 'SchoolPro')
    school_address = (school_settings or {}).get('schoolAddress', '')
    logo_io = _decode_logo((school_settings or {}).get('logoUrl', ''))

    purple_dark = colors.HexColor('#6B21A8')
    purple_light = colors.HexColor('#9333EA')
    gray_text = colors.HexColor('#6B7280')
    light_border = colors.HexColor('#E5E7EB')

    receipt_id = payment_data.get('receiptNumber', '')
    pay_date = payment_data.get('paymentDate', '')
    if isinstance(pay_date, str) and len(pay_date) >= 10:
        try:
            parts = pay_date[:10].split('-')
            pay_date = f"{parts[2]}-{parts[1]}-{parts[0]}"
        except Exception:
            pay_date = pay_date[:10]
    else:
        pay_date = datetime.now().strftime('%d-%m-%Y')

    student_code = student_data.get('studentCode', student_data.get('rollNo', ''))
    student_name = student_data.get('studentName', '')
    fee_label = f"Term {payment_data.get('termNumber')}" if payment_data.get('termNumber') else (payment_data.get('feeName') or 'Custom Fee')
    amount = payment_data.get('amount', 0)
    collected_by = payment_data.get('collectedBy', 'Admin')
    payment_mode = payment_data.get('paymentMode', '').upper()

    def build_receipt_copy(copy_type):
        """Build one receipt copy (Student/College)"""
        copy_elements = []

        # Logo (if configured)
        if logo_io is not None:
            try:
                logo_io.seek(0)
                img = RLImage(logo_io, width=18*mm, height=18*mm)
                img.hAlign = 'CENTER'
                copy_elements.append(img)
                copy_elements.append(Spacer(1, 1*mm))
            except Exception as e:
                logger.warning(f"Failed to render logo on invoice: {e}")

        # School Name
        name_style = ParagraphStyle('SN', parent=styles['Title'], fontSize=18, textColor=purple_dark, alignment=1, spaceAfter=1, leading=20)
        copy_elements.append(Paragraph(school_name, name_style))
        if school_address:
            addr_style = ParagraphStyle('SA', parent=styles['Normal'], fontSize=8, textColor=gray_text, alignment=1, spaceAfter=2)
            copy_elements.append(Paragraph(school_address, addr_style))
        copy_elements.append(Spacer(1, 2*mm))

        # Header bar: Receipt ID | COPY TYPE FEE RECEIPT | Date
        hdr_label = "STUDENT FEE RECEIPT" if copy_type == "student" else "COLLEGE FEE RECEIPT"
        hdr = [[f"Receipt ID: #{receipt_id}", hdr_label, f"Date: {pay_date}"]]
        ht = RLTable(hdr, colWidths=[155, 220, 115])
        ht.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), purple_dark),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('ALIGN', (0, 0), (0, 0), 'LEFT'), ('ALIGN', (1, 0), (1, 0), 'CENTER'), ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
            ('TOPPADDING', (0, 0), (-1, 0), 8), ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
            ('LEFTPADDING', (0, 0), (-1, 0), 8), ('RIGHTPADDING', (0, 0), (-1, 0), 8),
        ]))
        copy_elements.append(ht)
        copy_elements.append(Spacer(1, 1*mm))

        # Table header
        th = [["STUDENT NAME & ID", "FEE TYPE", "AMOUNT PAID"]]
        tht = RLTable(th, colWidths=[200, 170, 120])
        tht.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), purple_light),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('TOPPADDING', (0, 0), (-1, 0), 7), ('BOTTOMPADDING', (0, 0), (-1, 0), 7),
            ('LEFTPADDING', (0, 0), (-1, 0), 8), ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
        ]))
        copy_elements.append(tht)

        # Table data
        td = [[f"{student_code} - {student_name}", fee_label, f"Rs. {amount:,.2f}"]]
        tdt = RLTable(td, colWidths=[200, 170, 120])
        tdt.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'), ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 8), ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
            ('BOX', (0, 0), (-1, -1), 0.5, light_border),
        ]))
        copy_elements.append(tdt)
        copy_elements.append(Spacer(1, 2*mm))

        # Additional details row
        detail_data = [
            [f"Class: {student_data.get('studentClass', '')} - {student_data.get('section', '')}", f"Father: {student_data.get('fatherName', '')}", f"Mode: {payment_mode}"],
        ]
        ddt = RLTable(detail_data, colWidths=[170, 180, 140])
        ddt.setStyle(TableStyle([
            ('FONTSIZE', (0, 0), (-1, -1), 8), ('TEXTCOLOR', (0, 0), (-1, -1), gray_text),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ]))
        copy_elements.append(ddt)
        copy_elements.append(Spacer(1, 2*mm))

        # Note
        n = ParagraphStyle('N', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#9CA3AF'), alignment=0)
        copy_elements.append(Paragraph("Note: Some Times Fee Payments Take Time To Update In Our System", n))
        copy_elements.append(Spacer(1, 2*mm))

        # Computer generated + Collected by
        g = ParagraphStyle('G', parent=styles['Normal'], fontSize=8, textColor=gray_text, alignment=1)
        copy_elements.append(Paragraph("This is a computer-generated invoice and does not require a physical signature.", g))
        copy_elements.append(Spacer(1, 1*mm))
        copy_elements.append(Paragraph(f"Processed By: {collected_by}", g))

        return copy_elements

    # Build Student Copy
    elements.extend(build_receipt_copy("student"))

    # Separator line
    elements.append(Spacer(1, 4*mm))
    sep_data = [["- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -"]]
    sep = RLTable(sep_data, colWidths=[490])
    sep.setStyle(TableStyle([('ALIGN', (0, 0), (0, 0), 'CENTER'), ('TEXTCOLOR', (0, 0), (0, 0), colors.HexColor('#D1D5DB')), ('FONTSIZE', (0, 0), (0, 0), 7)]))
    elements.append(sep)
    elements.append(Spacer(1, 4*mm))

    # Build College Copy
    elements.extend(build_receipt_copy("college"))

    # Footer
    elements.append(Spacer(1, 3*mm))
    f = ParagraphStyle('F', parent=styles['Normal'], fontSize=7, textColor=colors.HexColor('#D1D5DB'), alignment=1)
    elements.append(Paragraph("Software Designed & Developed By SchoolPro", f))

    doc.build(elements)
    buf.seek(0)
    return buf


def generate_progress_card_pdf(entries, school_settings=None):
    """entries: list of {student, examName, subjectRows, total, maxTotal, grade} — one page per student."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=14*mm, bottomMargin=12*mm, leftMargin=16*mm, rightMargin=16*mm)
    styles = getSampleStyleSheet()
    elements = []

    school_name = (school_settings or {}).get('schoolName', 'SchoolPro')
    school_address = (school_settings or {}).get('schoolAddress', '')
    logo_io = _decode_logo((school_settings or {}).get('logoUrl', ''))

    purple_dark = colors.HexColor('#6B21A8')
    purple_light = colors.HexColor('#9333EA')
    gray_text = colors.HexColor('#6B7280')
    light_border = colors.HexColor('#E5E7EB')

    for i, entry in enumerate(entries):
        student = entry['student']

        if logo_io is not None:
            try:
                logo_io.seek(0)
                img = RLImage(logo_io, width=20*mm, height=20*mm)
                img.hAlign = 'CENTER'
                elements.append(img)
                elements.append(Spacer(1, 1*mm))
            except Exception as e:
                logger.warning(f"Failed to render logo on progress card: {e}")

        name_style = ParagraphStyle('SN', parent=styles['Title'], fontSize=18, textColor=purple_dark, alignment=1, spaceAfter=1, leading=20)
        elements.append(Paragraph(school_name, name_style))
        if school_address:
            addr_style = ParagraphStyle('SA', parent=styles['Normal'], fontSize=8, textColor=gray_text, alignment=1, spaceAfter=2)
            elements.append(Paragraph(school_address, addr_style))
        elements.append(Spacer(1, 2*mm))

        title_data = [[f"PROGRESS CARD — {entry['examName']}"]]
        title_t = RLTable(title_data, colWidths=[490])
        title_t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), purple_dark), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, 0), 11),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'), ('TOPPADDING', (0, 0), (-1, 0), 8), ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
        ]))
        elements.append(title_t)
        elements.append(Spacer(1, 3*mm))

        detail_data = [[
            f"Name: {student.get('studentName', '')}", f"Roll No: {student.get('rollNo', '')}",
        ], [
            f"Class: {student.get('studentClass', '')} - {student.get('section', '')}", f"Father: {student.get('fatherName', '')}",
        ]]
        detail_t = RLTable(detail_data, colWidths=[245, 245])
        detail_t.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('BOX', (0, 0), (-1, -1), 0.5, light_border), ('INNERGRID', (0, 0), (-1, -1), 0.5, light_border),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(detail_t)
        elements.append(Spacer(1, 3*mm))

        subj_header = [["SUBJECT", "MARKS", "MAX MARKS", "%"]]
        subj_rows = []
        for m in entry['subjectRows']:
            pct = (m['marks'] / m['maxMarks'] * 100) if m.get('maxMarks') else 0
            subj_rows.append([m.get('subject', ''), f"{m['marks']:g}", f"{m.get('maxMarks', 100):g}", f"{pct:.1f}%"])
        subj_t = RLTable(subj_header + subj_rows, colWidths=[210, 90, 100, 90])
        subj_t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), purple_light), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('BOX', (0, 0), (-1, -1), 0.5, light_border), ('INNERGRID', (0, 0), (-1, -1), 0.5, light_border),
        ]))
        elements.append(subj_t)
        elements.append(Spacer(1, 3*mm))

        summary_data = [[f"TOTAL: {entry['total']:g} / {entry['maxTotal']:g}", f"GRADE: {entry['grade']}"]]
        summary_t = RLTable(summary_data, colWidths=[245, 245])
        summary_t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3F4F6')),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('ALIGN', (0, 0), (0, 0), 'LEFT'), ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('BOX', (0, 0), (-1, -1), 0.5, light_border),
        ]))
        elements.append(summary_t)
        elements.append(Spacer(1, 4*mm))

        g = ParagraphStyle('G', parent=styles['Normal'], fontSize=8, textColor=gray_text, alignment=1)
        elements.append(Paragraph("This is a computer-generated progress card and does not require a physical signature.", g))

        if i < len(entries) - 1:
            elements.append(PageBreak())

    doc.build(elements)
    buf.seek(0)
    return buf


def generate_hall_tickets_pdf(exam, students, school_settings=None):
    """exam: {examName, studentClass, section, subjects: [{subjectName, examDate, examTime}]}.
    students: list of student dicts, sorted. Two tickets stacked per A4 page."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=10*mm, bottomMargin=8*mm, leftMargin=14*mm, rightMargin=14*mm)
    styles = getSampleStyleSheet()
    elements = []

    school_name = (school_settings or {}).get('schoolName', 'SchoolPro')
    logo_io = _decode_logo((school_settings or {}).get('logoUrl', ''))

    purple_dark = colors.HexColor('#6B21A8')
    purple_light = colors.HexColor('#9333EA')
    gray_text = colors.HexColor('#6B7280')
    light_border = colors.HexColor('#E5E7EB')

    def build_ticket(student):
        t_elements = []

        if logo_io is not None:
            try:
                logo_io.seek(0)
                img = RLImage(logo_io, width=14*mm, height=14*mm)
                img.hAlign = 'CENTER'
                t_elements.append(img)
                t_elements.append(Spacer(1, 1*mm))
            except Exception as e:
                logger.warning(f"Failed to render logo on hall ticket: {e}")

        name_style = ParagraphStyle('SN', parent=styles['Title'], fontSize=14, textColor=purple_dark, alignment=1, spaceAfter=1, leading=16)
        t_elements.append(Paragraph(school_name, name_style))
        t_elements.append(Spacer(1, 1*mm))

        title_data = [["HALL TICKET"]]
        title_t = RLTable(title_data, colWidths=[490])
        title_t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), purple_dark), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'), ('TOPPADDING', (0, 0), (-1, 0), 5), ('BOTTOMPADDING', (0, 0), (-1, 0), 5),
        ]))
        t_elements.append(title_t)
        t_elements.append(Spacer(1, 2*mm))

        detail_data = [[
            f"Name: {student.get('studentName', '')}", f"Roll No: {student.get('rollNo', '')}",
        ], [
            f"Class: {student.get('studentClass', '')} - {student.get('section', '')}", f"Father: {student.get('fatherName', '')}",
        ], [
            f"Examination: {exam.get('examName', '')}", "",
        ]]
        detail_t = RLTable(detail_data, colWidths=[245, 245])
        detail_t.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), 3), ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('BOX', (0, 0), (-1, -1), 0.5, light_border), ('INNERGRID', (0, 0), (-1, -1), 0.5, light_border),
            ('LEFTPADDING', (0, 0), (-1, -1), 6), ('SPAN', (0, 2), (1, 2)),
        ]))
        t_elements.append(detail_t)
        t_elements.append(Spacer(1, 2*mm))

        subj_header = [["SUBJECT", "DATE", "TIME"]]
        subj_rows = [[s.get('subjectName', ''), s.get('examDate', ''), s.get('examTime', '')] for s in exam.get('subjects', [])]
        subj_t = RLTable(subj_header + subj_rows, colWidths=[210, 140, 140])
        subj_t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), purple_light), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('BOX', (0, 0), (-1, -1), 0.5, light_border), ('INNERGRID', (0, 0), (-1, -1), 0.5, light_border),
        ]))
        t_elements.append(subj_t)
        t_elements.append(Spacer(1, 2*mm))

        g = ParagraphStyle('G', parent=styles['Normal'], fontSize=6.5, textColor=gray_text, alignment=1)
        t_elements.append(Paragraph("This is a computer-generated hall ticket and does not require a physical signature.", g))

        return t_elements

    students = list(students)
    for i in range(0, len(students), 2):
        pair = students[i:i + 2]
        elements.extend(build_ticket(pair[0]))
        if len(pair) > 1:
            elements.append(Spacer(1, 4*mm))
            sep_data = [["- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -"]]
            sep = RLTable(sep_data, colWidths=[490])
            sep.setStyle(TableStyle([('ALIGN', (0, 0), (0, 0), 'CENTER'), ('TEXTCOLOR', (0, 0), (0, 0), colors.HexColor('#D1D5DB')), ('FONTSIZE', (0, 0), (0, 0), 7)]))
            elements.append(sep)
            elements.append(Spacer(1, 4*mm))
            elements.extend(build_ticket(pair[1]))
        if i + 2 < len(students):
            elements.append(PageBreak())

    doc.build(elements)
    buf.seek(0)
    return buf
