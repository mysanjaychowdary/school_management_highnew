"""PDF invoice generation using ReportLab."""
import io
import base64
import logging
from datetime import datetime
from xml.sax.saxutils import escape as _xml_escape
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


_PROGRESS_SCALE = [
    (91, "A+"), (81, "A"), (71, "B+"), (61, "B"), (51, "C"), (35, "D"), (0, "E"),
]
_PROGRESS_SCALE_TEXT = [
    ("A+", "91 - 100"), ("A", "81 - 90"), ("B+", "71 - 80"), ("B", "61 - 70"),
    ("C", "51 - 60"), ("D", "35 - 50"), ("E", "Below 35"),
]


def _progress_grade(pct):
    for threshold, label in _PROGRESS_SCALE:
        if pct >= threshold:
            return label
    return "E"


def _remark_for(pct):
    if pct >= 90:
        return "Outstanding performance! Keep it up."
    if pct >= 75:
        return "Well done! Keep up the good work."
    if pct >= 60:
        return "Good effort. A little more focus will help."
    if pct >= 35:
        return "Satisfactory. Needs consistent hard work."
    return "Needs improvement. Please work harder next term."


def _academic_year(now=None):
    now = now or datetime.now()
    y = now.year
    if now.month >= 6:  # academic year starts around June
        return f"{y}-{str(y + 1)[-2:]}"
    return f"{y - 1}-{str(y)[-2:]}"


def _e(v):
    return _xml_escape(str(v if v is not None else ""))


def _cf(student, *keys):
    """Look up a value from student customFields by any of the given keys (case-insensitive)."""
    cf = student.get('customFields') or {}
    lowered = {str(k).strip().lower(): v for k, v in cf.items()}
    for k in keys:
        v = lowered.get(k.strip().lower())
        if v:
            return str(v)
    return ""


def generate_progress_card_pdf(entries, school_settings=None):
    """entries: list of {student, examName, subjectRows, total, maxTotal, grade,
    percentage, attendancePct, rank, totalStudents} — one styled marks sheet page per student."""
    buf = io.BytesIO()
    styles = getSampleStyleSheet()

    school_name = (school_settings or {}).get('schoolName', 'SchoolPro')
    school_address = (school_settings or {}).get('schoolAddress', '')
    logo_io = _decode_logo((school_settings or {}).get('logoUrl', ''))

    MAROON = colors.HexColor('#7A1B3D')
    MAROON_DK = colors.HexColor('#5E1430')
    ORANGE = colors.HexColor('#E4720B')
    CREAM = colors.HexColor('#FBE7CE')
    GRAY = colors.HexColor('#555555')
    BORDER = colors.HexColor('#E2C6D2')
    SOFT = colors.HexColor('#FAF4F6')

    CW = 500  # content width in points

    def _draw_border(canv, _doc):
        canv.saveState()
        w, h = A4
        m = 8 * mm
        canv.setLineJoin(0)
        canv.setStrokeColor(MAROON)
        canv.setLineWidth(3)
        canv.rect(m, m, w - 2 * m, h - 2 * m)
        canv.setStrokeColor(ORANGE)
        canv.setLineWidth(1)
        canv.rect(m + 3.5, m + 3.5, w - 2 * m - 7, h - 2 * m - 7)
        canv.setFillColor(MAROON)
        s = 12 * mm
        for cx, cy, dx, dy in [(m, h - m, 1, -1), (w - m, h - m, -1, -1), (m, m, 1, 1), (w - m, m, -1, 1)]:
            p = canv.beginPath()
            p.moveTo(cx, cy)
            p.lineTo(cx + dx * s, cy)
            p.lineTo(cx, cy + dy * s)
            p.close()
            canv.drawPath(p, fill=1, stroke=0)
        canv.restoreState()

    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=16 * mm,
                            leftMargin=18 * mm, rightMargin=18 * mm)

    lbl = ParagraphStyle('lbl', parent=styles['Normal'], fontSize=8.5, textColor=GRAY,
                         fontName='Helvetica-Bold', leading=12)
    val = ParagraphStyle('val', parent=styles['Normal'], fontSize=8.5, textColor=colors.HexColor('#1F2937'),
                         fontName='Helvetica', leading=12)
    center = ParagraphStyle('c', parent=styles['Normal'], alignment=1)

    elements = []

    for i, entry in enumerate(entries):
        student = entry['student']
        pct = entry.get('percentage')
        if pct is None:
            pct = (entry['total'] / entry['maxTotal'] * 100) if entry.get('maxTotal') else 0
        overall_grade = entry.get('grade') or _progress_grade(pct)
        passed = pct >= 35

        # ---- Header: logo | school name | photo ----
        name_para = Paragraph(
            f"<font size=20 color='#7A1B3D'><b>{_e(school_name.upper())}</b></font>"
            + (f"<br/><font size=9 color='#555555'>{_e(school_address)}</font>" if school_address else ""),
            center,
        )
        logo_cell = ""
        if logo_io is not None:
            try:
                logo_io.seek(0)
                logo_cell = RLImage(logo_io, width=20 * mm, height=20 * mm)
            except Exception as e:
                logger.warning(f"progress card logo: {e}")
        photo_io = _decode_logo(student.get('photoUrl') or _cf(student, 'photo', 'photourl', 'photo url'))
        photo_cell = ""
        if photo_io is not None:
            try:
                photo_io.seek(0)
                photo_cell = RLImage(photo_io, width=20 * mm, height=24 * mm)
            except Exception:
                photo_cell = ""
        header_t = RLTable([[logo_cell, name_para, photo_cell]], colWidths=[26 * mm, CW - 52 * mm, 26 * mm])
        header_t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (0, 0), 'CENTER'), ('ALIGN', (2, 0), (2, 0), 'CENTER'),
        ]))
        elements.append(header_t)
        elements.append(Spacer(1, 4 * mm))

        # ---- MARKS SHEET pill ----
        pill = RLTable([["MARKS SHEET"]], colWidths=[150])
        pill.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), MAROON), ('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 12),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('ROUNDEDCORNERS', [8, 8, 8, 8]),
        ]))
        pill.hAlign = 'CENTER'
        elements.append(pill)
        elements.append(Spacer(1, 2 * mm))
        elements.append(Paragraph(
            f"<font size=9 color='#7A1B3D'><b>ACADEMIC YEAR : {_academic_year()}</b></font>", center))
        elements.append(Spacer(1, 3 * mm))

        # ---- Student / exam details ----
        today = datetime.now().strftime('%d-%m-%Y')
        dob = _cf(student, 'dob', 'date of birth', 'd.o.b', 'birth date')
        gender = _cf(student, 'gender', 'sex')
        info_rows = [
            [Paragraph("Student Name", lbl), Paragraph(_e(student.get('studentName', '')), val),
             Paragraph("Exam Name", lbl), Paragraph(_e(entry['examName']), val)],
            [Paragraph("Father's Name", lbl), Paragraph(_e(student.get('fatherName', '')), val),
             Paragraph("Class &amp; Section", lbl), Paragraph(_e(f"{student.get('studentClass', '')} - {student.get('section', '')}"), val)],
            [Paragraph("Mother's Name", lbl), Paragraph(_e(student.get('motherName', '')), val),
             Paragraph("Date of Result", lbl), Paragraph(today, val)],
            [Paragraph("Roll Number", lbl), Paragraph(_e(student.get('rollNo', '')), val),
             Paragraph("Student D.O.B.", lbl), Paragraph(_e(dob or '-'), val)],
            [Paragraph("Admission No.", lbl), Paragraph(_e(student.get('studentCode', '')), val),
             Paragraph("Gender", lbl), Paragraph(_e(gender or '-'), val)],
        ]
        info_t = RLTable(info_rows, colWidths=[78, 172, 90, CW - 340])
        info_t.setStyle(TableStyle([
            ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('BOX', (0, 0), (-1, -1), 0.75, MAROON), ('ROUNDEDCORNERS', [6, 6, 6, 6]),
            ('LINEBELOW', (0, 0), (-1, -2), 0.4, BORDER),
        ]))
        elements.append(info_t)
        elements.append(Spacer(1, 4 * mm))

        # ---- Marks table ----
        head = ["S.NO.", "SUBJECT", "MAX MARKS", "MARKS OBTAINED", "GRADE", "REMARKS"]
        rows = [head]
        for n, m in enumerate(entry['subjectRows'], start=1):
            mx = m.get('maxMarks', 100) or 0
            sp = (m['marks'] / mx * 100) if mx else 0
            rows.append([
                str(n), m.get('subject', ''), f"{mx:g}", f"{m['marks']:g}",
                _progress_grade(sp), "Pass" if sp >= 35 else "Fail",
            ])
        rows.append(["TOTAL", "", f"{entry['maxTotal']:g}", f"{entry['total']:g}", "-",
                     "PASS" if passed else "FAIL"])
        marks_t = RLTable(rows, colWidths=[42, 188, 68, 92, 52, CW - 442])
        n_rows = len(rows)
        marks_t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), MAROON), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (0, 0), (-1, -1), 8.5),
            ('FONTNAME', (0, 1), (-1, -2), 'Helvetica'),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'), ('ALIGN', (2, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('BOX', (0, 0), (-1, -1), 0.75, MAROON),
            ('INNERGRID', (0, 0), (-1, -1), 0.4, BORDER),
            ('LINEBELOW', (0, 0), (-1, 0), 0.75, MAROON),
            # total row
            ('SPAN', (0, n_rows - 1), (1, n_rows - 1)),
            ('BACKGROUND', (0, n_rows - 1), (-1, n_rows - 1), CREAM),
            ('FONTNAME', (0, n_rows - 1), (-1, n_rows - 1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0, n_rows - 1), (-1, n_rows - 1), MAROON_DK),
            ('ALIGN', (0, n_rows - 1), (0, n_rows - 1), 'CENTER'),
        ]))
        elements.append(marks_t)
        elements.append(Spacer(1, 4 * mm))

        # ---- Summary band ----
        def stat(label, value):
            return Paragraph(
                f"<font size=8 color='#7A1B3D'><b>{label}</b></font><br/>"
                f"<font size=15 color='#5E1430'><b>{value}</b></font>", center)

        att = entry.get('attendancePct')
        att_txt = f"{att}%" if att is not None else "-"
        rank = entry.get('rank')
        rank_txt = f"{rank} / {entry.get('totalStudents', len(entries))}" if rank else "-"
        scale_txt = "<font size=7 color='#5E1430'><b>GRADE SCALE</b></font><br/>" + "<br/>".join(
            f"<font size=7 color='#555555'>{g} : {r}</font>" for g, r in _PROGRESS_SCALE_TEXT)
        summary_t = RLTable([[
            stat("PERCENTAGE", f"{pct:.2f}%"),
            stat("OVERALL GRADE", overall_grade),
            stat("RANK", rank_txt),
            stat("ATTENDANCE", att_txt),
            Paragraph(scale_txt, ParagraphStyle('sc', parent=styles['Normal'], leading=9)),
        ]], colWidths=[95, 95, 92, 92, CW - 374])
        summary_t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('ALIGN', (0, 0), (3, 0), 'CENTER'),
            ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LEFTPADDING', (0, 0), (-1, -1), 8), ('RIGHTPADDING', (0, 0), (-1, -1), 8),
            ('BOX', (0, 0), (-1, -1), 0.75, MAROON), ('ROUNDEDCORNERS', [6, 6, 6, 6]),
            ('LINEAFTER', (0, 0), (-2, -1), 0.4, BORDER),
            ('BACKGROUND', (4, 0), (4, 0), SOFT),
        ]))
        elements.append(summary_t)
        elements.append(Spacer(1, 3 * mm))

        # ---- Remarks ----
        rem = RLTable([[Paragraph(
            f"<font size=9 color='#7A1B3D'><b>REMARKS :</b></font>  "
            f"<font size=9 color='#1F2937'>{_remark_for(pct)}</font>", styles['Normal'])]], colWidths=[CW])
        rem.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), SOFT), ('BOX', (0, 0), (-1, -1), 0.5, BORDER),
            ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('LEFTPADDING', (0, 0), (-1, -1), 10), ('ROUNDEDCORNERS', [6, 6, 6, 6]),
        ]))
        elements.append(rem)
        elements.append(Spacer(1, 12 * mm))

        # ---- Signatures ----
        sig_lbl = ParagraphStyle('sig', parent=styles['Normal'], fontSize=8, alignment=1,
                                 fontName='Helvetica-Bold', textColor=colors.HexColor('#374151'))
        sig_t = RLTable([
            ["", "", "", ""],
            [Paragraph("CLASS TEACHER", sig_lbl), Paragraph("PRINCIPAL", sig_lbl),
             Paragraph("SCHOOL SEAL", sig_lbl), Paragraph("PARENT / GUARDIAN SIGNATURE", sig_lbl)],
        ], colWidths=[CW / 4.0] * 4)
        sig_t.setStyle(TableStyle([
            ('TOPPADDING', (0, 0), (-1, 0), 0), ('BOTTOMPADDING', (0, 0), (-1, 0), 2),
            ('LINEABOVE', (0, 1), (0, 1), 0.6, colors.HexColor('#374151')),
            ('LINEABOVE', (1, 1), (1, 1), 0.6, colors.HexColor('#374151')),
            ('LINEABOVE', (3, 1), (3, 1), 0.6, colors.HexColor('#374151')),
            ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(sig_t)
        elements.append(Spacer(1, 4 * mm))

        foot = ParagraphStyle('foot', parent=styles['Normal'], fontSize=7.5, alignment=1,
                              textColor=GRAY, fontName='Helvetica-Oblique')
        elements.append(Paragraph("* This is a computer generated marks sheet, no signature is required.", foot))

        if i < len(entries) - 1:
            elements.append(PageBreak())

    doc.build(elements, onFirstPage=_draw_border, onLaterPages=_draw_border)
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
