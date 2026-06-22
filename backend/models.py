"""All Pydantic models for SchoolPro API."""
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
from datetime import datetime, timezone
import uuid



class ClassSection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    className: str
    sections: List[str]
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ClassSectionCreate(BaseModel):
    className: str
    sections: List[str]

class FeeType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    feeName: str
    amount: float
    applicableClass: Optional[str] = None
    applicableSection: Optional[str] = None
    noticeStartDate: Optional[str] = None
    dueDate: Optional[str] = None
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FeeTypeCreate(BaseModel):
    feeName: str
    amount: float
    applicableClass: Optional[str] = None
    applicableSection: Optional[str] = None
    noticeStartDate: Optional[str] = None
    dueDate: Optional[str] = None

class DatabaseSettings(BaseModel):
    mongoUrl: str
    dbName: str

class Student(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    studentCode: str = ""  # Unique admission/student ID (e.g., ADM001)
    studentName: str
    rollNo: str  # Class-wise roll number (not unique)
    studentClass: str
    section: str
    fatherName: str
    motherName: str
    mobile: str
    address: str
    feeTerm1: float
    feeTerm2: float
    feeTerm3: float
    parentUsername: Optional[str] = None
    parentPassword: Optional[str] = None
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StudentCreate(BaseModel):
    studentCode: str
    studentName: str
    rollNo: str
    studentClass: str
    section: str
    fatherName: str
    motherName: str
    mobile: str
    address: str
    feeTerm1: float
    feeTerm2: float
    feeTerm3: float
    parentUsername: Optional[str] = None
    parentPassword: Optional[str] = None

class StudentUpdate(BaseModel):
    studentCode: Optional[str] = None
    studentName: Optional[str] = None
    rollNo: Optional[str] = None
    studentClass: Optional[str] = None
    section: Optional[str] = None
    fatherName: Optional[str] = None
    motherName: Optional[str] = None
    mobile: Optional[str] = None
    address: Optional[str] = None
    feeTerm1: Optional[float] = None
    feeTerm2: Optional[float] = None
    feeTerm3: Optional[float] = None
    parentUsername: Optional[str] = None
    parentPassword: Optional[str] = None

class AttendanceRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    studentId: str
    rollNo: str
    studentName: str
    studentClass: str
    section: str
    date: str
    status: str
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AttendanceSubmit(BaseModel):
    studentClass: str
    section: str
    date: str
    records: List[Dict]

class FeePayment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    studentId: str
    studentCode: str
    rollNo: str
    studentName: str
    termNumber: Optional[int] = None
    feeTypeId: Optional[str] = None
    feeName: Optional[str] = None
    amount: float
    paymentMode: str
    upiScreenshot: Optional[str] = None
    receiptNumber: str
    collectedBy: Optional[str] = None
    paymentDate: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FeePaymentCreate(BaseModel):
    studentId: str
    studentCode: str
    rollNo: str
    studentName: str
    termNumber: Optional[int] = None
    feeTypeId: Optional[str] = None
    feeName: Optional[str] = None
    amount: float
    paymentMode: str
    upiScreenshot: Optional[str] = None
    collectedBy: Optional[str] = None

class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    expenseName: str
    amount: float
    date: str
    billUrl: str
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ExpenseCreate(BaseModel):
    expenseName: str
    amount: float
    date: str
    billUrl: str

class WhatsAppSettings(BaseModel):
    phoneNumberId: str
    accessToken: str

class WhatsAppTemplate(BaseModel):
    name: str = ""
    componentsJson: str = ""  # raw JSON string, may contain {{placeholders}}

class WhatsAppTemplates(BaseModel):
    absent: WhatsAppTemplate = WhatsAppTemplate()
    fee_paid: WhatsAppTemplate = WhatsAppTemplate()
    event: WhatsAppTemplate = WhatsAppTemplate()

class SchoolSettings(BaseModel):
    schoolName: str
    schoolAddress: str
    logoUrl: Optional[str] = None

class PromoteRequest(BaseModel):
    fromClass: str
    toClass: str

class InventoryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    itemName: str
    quantity: int
    category: str
    purchaseDate: str
    amount: float
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InventoryItemCreate(BaseModel):
    itemName: str
    quantity: int
    category: str
    purchaseDate: str
    amount: float

class InventoryIssue(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    itemId: str
    itemName: str
    studentId: str
    studentCode: str
    rollNo: str
    studentName: str
    quantity: int
    date: str
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class InventoryIssueCreate(BaseModel):
    itemId: str
    studentCode: str
    quantity: int
    date: str

class Event(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str
    date: str
    sendNotification: Optional[bool] = False
    attachmentUrl: Optional[str] = None
    attachmentName: Optional[str] = None
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EventCreate(BaseModel):
    title: str
    description: str
    date: str
    sendNotification: Optional[bool] = False
    attachmentUrl: Optional[str] = None
    attachmentName: Optional[str] = None

class Homework(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    studentClass: str
    section: str
    subject: str
    title: str
    description: str
    dueDate: str
    assignedBy: str
    attachmentUrl: Optional[str] = None
    attachmentName: Optional[str] = None
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class HomeworkCreate(BaseModel):
    studentClass: str
    section: str
    subject: str
    title: str
    description: str
    dueDate: str
    assignedBy: str
    attachmentUrl: Optional[str] = None
    attachmentName: Optional[str] = None

class Staff(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    role: str  # teacher, office_staff
    mobile: str
    subject: Optional[str] = None
    joiningDate: str
    username: str
    password: str
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StaffCreate(BaseModel):
    name: str
    role: str
    mobile: str
    subject: Optional[str] = None
    joiningDate: str
    username: str
    password: str

class StaffUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    mobile: Optional[str] = None
    subject: Optional[str] = None
    joiningDate: Optional[str] = None
    password: Optional[str] = None

class LoginRequest(BaseModel):
    username: str
    password: str

class Concession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    studentId: str
    studentCode: str
    studentName: str
    termNumber: Optional[int] = None
    feeTypeId: Optional[str] = None
    feeName: Optional[str] = None
    concessionAmount: float
    letterUrl: Optional[str] = None
    requestedBy: str
    status: str = "pending"  # pending, approved, rejected
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ConcessionCreate(BaseModel):
    studentCode: str
    termNumber: Optional[int] = None
    feeTypeId: Optional[str] = None
    feeName: Optional[str] = None
    concessionAmount: float
    letterUrl: Optional[str] = None
    requestedBy: str

class BulkConcessionCreate(BaseModel):
    studentCodes: List[str]
    termNumber: Optional[int] = None
    feeTypeId: Optional[str] = None
    feeName: Optional[str] = None
    concessionAmount: float
    letterUrl: Optional[str] = None
    requestedBy: str

class LeaveRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    studentId: str
    studentCode: str
    studentName: str
    fromDate: str
    toDate: str
    reason: str
    attachmentUrl: Optional[str] = None
    status: str = "pending"
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class LeaveRequestCreate(BaseModel):
    studentId: str
    studentCode: str
    studentName: str
    fromDate: str
    toDate: str
    reason: str
    attachmentUrl: Optional[str] = None

class MarkEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    studentId: str
    studentCode: str
    studentName: str
    studentClass: str
    section: str
    examName: str
    subject: str
    marks: float
    maxMarks: float = 100
    recordedBy: str = ""
    recordedOn: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Subject(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    subjectName: str
    applicableClasses: List[str] = []
    maxMarks: float = 100
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SubjectCreate(BaseModel):
    subjectName: str
    applicableClasses: List[str] = []
    maxMarks: Optional[float] = 100

class SubjectUpdate(BaseModel):
    subjectName: Optional[str] = None
    applicableClasses: Optional[List[str]] = None
    maxMarks: Optional[float] = None

class MarkRow(BaseModel):
    studentCode: str
    studentName: Optional[str] = ""
    examName: str
    subject: str
    marks: float
    maxMarks: Optional[float] = 100

class MarksBulkCreate(BaseModel):
    studentClass: str
    section: str
    examName: str
    subject: str
    maxMarks: Optional[float] = 100
    recordedBy: Optional[str] = ""
    rows: List[MarkRow]


class Role(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    roleName: str
    label: str = ""
    modules: List[str] = []
    canEdit: bool = False
    canDelete: bool = False
    canExport: bool = False
    canEditFees: bool = False
    canRevertFees: bool = False
    canApproveConcession: bool = False
    canSeeFullMobile: bool = False
    # Per-module CRUD permissions: { "<moduleKey>": {"create": bool, "edit": bool, "delete": bool} }
    # When a module entry is absent/empty, falls back to global canEdit / canDelete flags.
    modulePerms: Dict[str, Dict[str, bool]] = Field(default_factory=dict)
    isSystem: bool = False
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RoleCreate(BaseModel):
    roleName: str
    label: Optional[str] = ""
    modules: List[str] = []
    canEdit: bool = False
    canDelete: bool = False
    canExport: bool = False
    canEditFees: bool = False
    canRevertFees: bool = False
    canApproveConcession: bool = False
    canSeeFullMobile: bool = False
    modulePerms: Dict[str, Dict[str, bool]] = Field(default_factory=dict)


class RoleUpdate(BaseModel):
    label: Optional[str] = None
    modules: Optional[List[str]] = None
    canEdit: Optional[bool] = None
    canDelete: Optional[bool] = None
    canExport: Optional[bool] = None
    canEditFees: Optional[bool] = None
    canRevertFees: Optional[bool] = None
    canApproveConcession: Optional[bool] = None
    canSeeFullMobile: Optional[bool] = None
    modulePerms: Optional[Dict[str, Dict[str, bool]]] = None


class Complaint(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: str = ""
    photoUrl: Optional[str] = None
    dueDate: str
    status: str = "pending"  # pending | in_progress | resolved
    priority: str = "medium"  # low | medium | high
    createdBy: str = ""  # staff name
    createdByUsername: str = ""
    createdByRole: str = ""
    notes: Optional[str] = None
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    lastStatusUpdate: Optional[datetime] = None
    resolvedAt: Optional[datetime] = None


class ComplaintCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    photoUrl: Optional[str] = None
    dueDate: str
    priority: Optional[str] = "medium"
    createdBy: Optional[str] = ""
    createdByUsername: Optional[str] = ""
    createdByRole: Optional[str] = ""


class ComplaintUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None
    priority: Optional[str] = None
    dueDate: Optional[str] = None

