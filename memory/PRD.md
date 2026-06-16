# SchoolPro - School Management System PRD

## Credentials
- Super Admin: admin / 12345678
- Teacher: teach1 / pass123
- Parent: Set during student creation, login at /parent (e.g., ali / 123456 for studentCode 4543)

## WhatsApp Templates Configured
- fee_paid_bill: Invoice PDF + amount + fee name + student name
- absent_hifg: Student name + class + date
- holi: Event name + date

## Role-Based Access (Updated 2026-02-28)
- super_admin: Everything including Settings
- admin_role: Everything except Settings (incl. Approvals: Leave + Concessions)
- teacher: Students, Attendance, Calendar, Homework, Approvals (Leave ONLY, no Concessions tab)
- office_staff: Students, Fees, Expenses, Inventory

## All Implemented Features
- Login with role-based access (Admin/Teacher/Office Staff/Super Admin)
- Dashboard, Classes & Sections, Student CRUD (single/bulk/promote/parent credentials)
- Student Detail (attendance + fees + inventory)
- Attendance (take/view, bulk mark, WhatsApp absent alerts via template)
- Fee Management (term + custom, partial payment, max validation, payment popup dialog)
- Fee Status Report (class/section wise, all terms + custom, export)
- Transaction History with UPI screenshot popup (eye icon) + Invoice PDF download + Revert
- Fee Types with due dates, automated reminders
- Concessions (single + **bulk** — comma/newline separated student IDs)
- Expense Management, Inventory (inward + outward/issue to students)
- Event Calendar with WhatsApp notification checkbox
- Homework (full CRUD with file attachments), Staff Management with login
- Parent Portal (Overview, Attendance, Fees, Events, Homework, **Leave**)
- **Approvals Page** — Unified Leave + Concessions admin page with status filter, role-aware tabs
- **Leave Requests** — Parents submit via portal, Admins/Teachers approve/reject
- **Student Promotion with Fee Carryover** — ALL pending dues (T1+T2+T3 unpaid) roll into Term 1 of new class; Terms 2 & 3 reset to original fresh-year values
- Settings (WhatsApp phoneNumberId + token, Database connection, School profile)
- Connected to external MongoDB: 38.242.216.156 / school_management

## CHANGELOG

### 2026-02-28 (this session, part 2) — Dynamic WhatsApp Templates
- **Backend**
  - New models `WhatsAppTemplate` & `WhatsAppTemplates` in `models.py` (per event: `name` + `componentsJson` raw string)
  - New routes in `routers/operations.py`: `GET /api/settings/whatsapp-templates` and `PUT /api/settings/whatsapp-templates` (validates JSON, returns 400 on parse error)
  - `services/whatsapp.py` refactored: added `_substitute_placeholders` (regex `{{key}}` walk over nested dict/list/str), `_get_custom_template`, `_send_custom_or_default`. `send_absent_message`, `send_fee_paid_message`, `send_event_message` now check DB for custom template first and substitute placeholders before calling Meta; fall back to hardcoded defaults when not configured.
  - Placeholders: absent={{student_name}}, {{class_name}}, {{date}} · fee_paid={{amount}}, {{fee_name}}, {{student_name}}, {{invoice_url}} · event={{event_name}}, {{event_date}}
- **Frontend**
  - `Settings.js` new "Templates" tab (super_admin gated) with 3 cards (Absent / Fee Receipt / Event). Each card: Template Name input + Components-JSON textarea + "Load example" + "Use default" + chip list of available placeholders. Inline JSON validation before submit.
  - `api.js`: `getWhatsAppTemplates`, `updateWhatsAppTemplates` helpers.
- **Testing** — `iteration_15.json`: 8/8 backend + frontend pass; placeholder substitution, JSON validation, fallback-to-default, and persistence all verified.

### 2026-02-28 (this session, part 1) — Complaints Module + Dynamic School Branding
- **Backend**
  - Complaints CRUD already in `routers/operations.py`: `POST/GET/PUT/DELETE /api/complaints` + `GET /api/complaints/overdue-count`
  - Filters: `status`, `createdByUsername`, `overdueOnly`; each list row now carries computed `isOverdue` flag
  - `services/pdf.py` now embeds school logo image (base64 data URI) at the top of both Student and College receipt copies, with graceful fallback when logo is missing/invalid
- **Frontend**
  - `LoginPage.js` fetches `/api/settings/school` on mount and renders the configured `logoUrl` (replacing the default GraduationCap gradient square) and `schoolName`. "School Management System" subtitle is hidden once a custom school name is set.
  - `Layout.js` (sidebar + mobile header) now mirrors that same dynamic branding (logo + school name); polls `/api/complaints/overdue-count` every 60s for admin/super_admin and shows a numeric badge next to the Complaints nav item (rose-500 if any overdue, amber-500 otherwise).
  - `Complaints.js` (already built in prior session) verified end-to-end: photo capture (`capture="environment"`), due date, priority, status flow Pending → In Progress → Resolved, overdue alert banner for managers, filters, and delete (admin only).
  - `Dashboard.js` greeting subtitle now uses dynamic school name instead of hardcoded "SchoolPro Management System"
- **Testing** — `iteration_14.json`: 100% pass (10/10 backend + frontend e2e). No critical bugs. Optional code-review notes about role-gating DELETE /complaints and trusting client-supplied `createdBy*` fields are tracked in backlog.

### 2026-02-28 (earlier fork) — UPDATED Fee Promotion Rules
- **Backend**
  - `promote_students` rewrite per refined user spec:
    - `total_due = (T1 + T2 + T3 + applicable custom fees) − total paid (active payments)`
    - new T1 = total_due (labeled "Previous Year Due")
    - new T2 = base T2 (unchanged)
    - new T3 = base T3 + ₹5000 (new year hike for all students)
    - All previous payments archived (`status: 'archived'`) so paid resets to 0 in new year
    - Custom fees NOT carried forward — old custom fees archived; new custom fees only apply if newly created for the new class
  - `get_student_fees`, `get_fee_status`, `get_student_detail`, `parent dashboard`, `day-sheet` all skip both `reverted` and `archived` payments
  - Verified: 1000+2000+3000 fees with 400 paid → after promote: T1=5600, T2=2000, T3=8000, paid=0
  - Fixed orphaned code in `send_fee_reminders`
  - Added `POST /api/concessions/bulk` (multiple students)
  - Added `LeaveRequest` CRUD: `POST /api/leave-requests`, `GET`, `POST /{id}/approve`, `POST /{id}/reject`
- **Frontend**
  - New `/approvals` page (Approvals.js) — Leave + Concessions tabs; teacher sees Leave-only
  - ParentPortal Leave tab — date range + reason + optional file upload + history
  - Fees page Term 1 card now shows "Includes Previous Year Due" badge if `previousYearDues.amount > 0`; orange banner above term cards highlights amount + source class
  - Parent Portal Term 1 card shows "Prev Year Due" badge
  - Fees → Concessions tab: Single/Bulk mode toggle; history limited to last 4 records
  - AuthContext, Layout, App routes updated for `/approvals`
  - api.js extended; Parent Portal tabs got `data-testid`
- **Testing** — 100% pass on `iteration_10.json` (20/20 backend pytest + 3/3 frontend e2e)

### Earlier
- Custom PDF invoices (High Five International design) with sequential receipts
- External MongoDB integration
- Fee revert functionality
- Homework & Event file uploads
- Bulk student delete + pagination

## Prioritized Backlog
- **P1 — Security** Role-gate `DELETE /api/complaints/{id}` so only admin/super_admin can delete (UI already hides the button but API is open).
- **P1 — Security** Derive `createdBy*` on complaints from the authenticated session instead of trusting the client payload.
- **P2 — Refactor** `server.py` (~1586 lines) into routers: `/routes/students.py`, `/routes/fees.py`, `/routes/attendance.py`, etc.
- **P2 — Security** Add JWT/session auth tokens with route validation (currently role-based trust only)
- **P3** — Auto-mark attendance as `leave` when a leave request is approved (deferred per user: teacher still marks manually)
- **P3** — Concession bulk: checkbox selection from student list UI (current: paste student IDs textarea)
