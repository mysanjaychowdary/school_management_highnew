import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const api = {
  // Classes
  getClasses: () => axios.get(`${API}/classes`),
  createClass: (data) => axios.post(`${API}/classes`, data),
  updateClass: (id, data) => axios.put(`${API}/classes/${id}`, data),
  deleteClass: (id) => axios.delete(`${API}/classes/${id}`),

  // Fee Types
  getFeeTypes: (params) => axios.get(`${API}/fee-types`, { params }),
  createFeeType: (data) => axios.post(`${API}/fee-types`, data),
  updateFeeType: (id, data) => axios.put(`${API}/fee-types/${id}`, data),
  deleteFeeType: (id) => axios.delete(`${API}/fee-types/${id}`),

  // Students
  getStudents: (params) => axios.get(`${API}/students`, { params }),
  createStudent: (data) => axios.post(`${API}/students`, data),
  bulkUploadStudents: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return axios.post(`${API}/students/bulk`, formData);
  },
  getSampleCSV: () => axios.get(`${API}/students/sample-csv`, { responseType: 'blob' }),
  updateStudent: (id, data) => axios.put(`${API}/students/${id}`, data),
  deleteStudent: (id) => axios.delete(`${API}/students/${id}`),
  bulkDeleteStudents: (studentIds) => axios.post(`${API}/students/bulk-delete`, { studentIds }),
  promoteStudents: (data) => axios.post(`${API}/students/promote`, data),
  promoteStudentsPreview: (data) => axios.post(`${API}/students/promote-preview`, data),
  promoteSingleStudentPreview: (id, data) => axios.post(`${API}/students/${id}/promote-preview`, data),
  promoteSingleStudent: (id, data) => axios.post(`${API}/students/${id}/promote`, data),

  // Attendance
  markAttendance: (data) => axios.post(`${API}/attendance`, data),
  getAttendance: (params) => axios.get(`${API}/attendance`, { params }),
  exportAttendance: (params) => axios.get(`${API}/attendance/export`, { params, responseType: 'blob' }),
  sendAttendanceAlerts: (data) => axios.post(`${API}/attendance/send-alerts`, data),

  // Fees
  getStudentFees: (studentCode) => axios.get(`${API}/fees/student/${studentCode}`),
  createFeePayment: (data) => axios.post(`${API}/fees/payment`, data),
  getDaySheet: (date) => axios.get(`${API}/fees/day-sheet`, { params: { date } }),
  exportFees: (params) => axios.get(`${API}/fees/export`, { params, responseType: 'blob' }),

  // Expenses
  getExpenses: (params) => axios.get(`${API}/expenses`, { params }),
  createExpense: (data) => axios.post(`${API}/expenses`, data),

  // Settings
  getWhatsAppSettings: () => axios.get(`${API}/settings/whatsapp`),
  updateWhatsAppSettings: (data) => axios.put(`${API}/settings/whatsapp`, data),
  getDatabaseSettings: () => axios.get(`${API}/settings/database`),
  updateDatabaseSettings: (data) => axios.put(`${API}/settings/database`, data),
  getSchoolSettings: () => axios.get(`${API}/settings/school`),
  updateSchoolSettings: (data) => axios.put(`${API}/settings/school`, data),

  // Upload
  uploadFile: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return axios.post(`${API}/upload`, formData);
  },

  // Dashboard
  getDashboardStats: () => axios.get(`${API}/stats/dashboard`),

  // Student Detail
  getStudentDetail: (id) => axios.get(`${API}/students/${id}/detail`),

  // Inventory
  getInventory: (params) => axios.get(`${API}/inventory`, { params }),
  createInventory: (data) => axios.post(`${API}/inventory`, data),
  updateInventory: (id, data) => axios.put(`${API}/inventory/${id}`, data),
  deleteInventory: (id) => axios.delete(`${API}/inventory/${id}`),
  issueInventory: (data) => axios.post(`${API}/inventory/issue`, data),
  getInventoryIssues: (params) => axios.get(`${API}/inventory/issues`, { params }),

  // Events
  getEvents: (params) => axios.get(`${API}/events`, { params }),
  createEvent: (data) => axios.post(`${API}/events`, data),
  updateEvent: (id, data) => axios.put(`${API}/events/${id}`, data),
  deleteEvent: (id) => axios.delete(`${API}/events/${id}`),

  // Homework
  getHomework: (params) => axios.get(`${API}/homework`, { params }),
  createHomework: (data) => axios.post(`${API}/homework`, data),
  updateHomework: (id, data) => axios.put(`${API}/homework/${id}`, data),
  deleteHomework: (id) => axios.delete(`${API}/homework/${id}`),

  // Staff
  getStaff: () => axios.get(`${API}/staff`),
  createStaff: (data) => axios.post(`${API}/staff`, data),
  updateStaff: (id, data) => axios.put(`${API}/staff/${id}`, data),
  deleteStaff: (id) => axios.delete(`${API}/staff/${id}`),

  // Auth
  login: (data) => axios.post(`${API}/auth/login`, data),
  staffLogin: (data) => axios.post(`${API}/auth/staff-login`, data),
  parentLogin: (data) => axios.post(`${API}/auth/parent-login`, data),

  // Parent Portal
  getParentDashboard: (studentId) => axios.get(`${API}/parent/dashboard/${studentId}`),

  // Fee Status
  getFeeStatus: (params) => axios.get(`${API}/fees/status`, { params }),
  exportFeeStatus: (params) => axios.get(`${API}/fees/status/export`, { params, responseType: 'blob' }),

  // Fee Reminders
  sendFeeReminders: () => axios.post(`${API}/fees/send-reminders`),

  // Fee Revert
  revertPayment: (paymentId) => axios.post(`${API}/fees/revert/${paymentId}`),

  // Concessions
  getConcessions: (params) => axios.get(`${API}/concessions`, { params }),
  createConcession: (data) => axios.post(`${API}/concessions`, data),
  createBulkConcession: (data) => axios.post(`${API}/concessions/bulk`, data),
  approveConcession: (id) => axios.post(`${API}/concessions/${id}/approve`),
  rejectConcession: (id) => axios.post(`${API}/concessions/${id}/reject`),

  // Leave Requests
  getLeaveRequests: (params) => axios.get(`${API}/leave-requests`, { params }),
  createLeaveRequest: (data) => axios.post(`${API}/leave-requests`, data),
  approveLeaveRequest: (id, data) => axios.post(`${API}/leave-requests/${id}/approve`, data || {}),
  rejectLeaveRequest: (id, data) => axios.post(`${API}/leave-requests/${id}/reject`, data || {}),

  // Marks
  getMarksSampleCSV: (params) => axios.get(`${API}/marks/sample-csv`, { params, responseType: 'blob' }),
  createMarksBulk: (data) => axios.post(`${API}/marks/bulk`, data),
  getMarks: (params) => axios.get(`${API}/marks`, { params }),
  getMarksDistinct: () => axios.get(`${API}/marks/distinct`),
  getMarksStats: (params) => axios.get(`${API}/marks/stats`, { params }),
  deleteMark: (id) => axios.delete(`${API}/marks/${id}`),
  bulkDeleteMarks: (data) => axios.post(`${API}/marks/bulk-delete`, data),

  // Subjects
  getSubjects: (params) => axios.get(`${API}/subjects`, { params }),
  createSubject: (data) => axios.post(`${API}/subjects`, data),
  updateSubject: (id, data) => axios.put(`${API}/subjects/${id}`, data),
  deleteSubject: (id) => axios.delete(`${API}/subjects/${id}`),

  // Roles
  getRoles: () => axios.get(`${API}/roles`),
  createRole: (data) => axios.post(`${API}/roles`, data),
  updateRole: (id, data) => axios.put(`${API}/roles/${id}`, data),
  deleteRole: (id) => axios.delete(`${API}/roles/${id}`),

  // Complaints
  getComplaints: (params) => axios.get(`${API}/complaints`, { params }),
  createComplaint: (data) => axios.post(`${API}/complaints`, data),
  updateComplaint: (id, data) => axios.put(`${API}/complaints/${id}`, data),
  deleteComplaint: (id) => axios.delete(`${API}/complaints/${id}`),
  getComplaintsOverdue: () => axios.get(`${API}/complaints/overdue-count`),

  // Invoice
  getInvoiceUrl: (paymentId) => `${API}/fees/invoice/${paymentId}`,
};
