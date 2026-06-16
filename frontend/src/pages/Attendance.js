import React, { useState, useEffect, useCallback } from 'react';
import { UserCheck, Calendar, Download, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, canExport } from '../lib/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../components/ui/alert-dialog';

const Attendance = () => {
  const { role, perms } = useAuth();
  const showExport = canExport(perms);
  const [activeTab, setActiveTab] = useState('take');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [takeAttendance, setTakeAttendance] = useState({ studentClass: '', section: '', date: new Date().toISOString().split('T')[0] });
  const [attendanceData, setAttendanceData] = useState([]);
  const [viewFilters, setViewFilters] = useState({ studentClass: '', section: '', startDate: '', endDate: '' });
  const [showConfirmSave, setShowConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadClasses = useCallback(async () => {
    try { const r = await api.getClasses(); setClasses(r.data); } catch (e) { /* ignore */ }
  }, []);
  useEffect(() => { loadClasses(); }, [loadClasses]);

  const getSections = (cls) => { const f = classes.find((c) => c.className === cls); return f ? f.sections : []; };

  const handleLoadStudents = async () => {
    if (!takeAttendance.studentClass || !takeAttendance.section) { toast.error('Please select class and section'); return; }
    try {
      setLoading(true);
      // Fetch students AND existing attendance for this date in parallel
      const [studentsResp, attendanceResp] = await Promise.all([
        api.getStudents({ studentClass: takeAttendance.studentClass, section: takeAttendance.section, limit: 1000 }),
        api.getAttendance({ studentClass: takeAttendance.studentClass, section: takeAttendance.section, date: takeAttendance.date }),
      ]);
      // Backend returns paginated { students, total, ... } — fall back to array for compat
      const studentsList = Array.isArray(studentsResp.data) ? studentsResp.data : (studentsResp.data?.students || []);
      setStudents(studentsList);

      // Build map of existing attendance by studentId
      const existingMap = {};
      (attendanceResp.data || []).forEach((a) => { existingMap[a.studentId] = a.status; });

      if (studentsList.length === 0) toast.info('No students found for the selected class & section');

      // Initialize with existing status or 'undefined'
      setAttendanceData(studentsList.map((s) => ({
        studentId: s.id, rollNo: s.rollNo, studentName: s.studentName, mobile: s.mobile,
        status: existingMap[s.id] || 'undefined',
      })));
    } catch (error) {
      const msg = error.response?.data?.detail || error.message || 'Network error';
      toast.error(`Failed to load students: ${msg}`);
    }
    finally { setLoading(false); }
  };

  const handleMarkAttendance = (index, status) => { const d = [...attendanceData]; d[index].status = status; setAttendanceData(d); };
  const handleBulkMark = (status) => { setAttendanceData(attendanceData.map((r) => ({ ...r, status }))); };

  const handleSubmitAttendance = async () => {
    try {
      setSaving(true);
      await api.markAttendance({ studentClass: takeAttendance.studentClass, section: takeAttendance.section, date: takeAttendance.date, records: attendanceData });
      const absentRecords = attendanceData.filter((r) => r.status === 'absent');
      if (absentRecords.length > 0) {
        await api.sendAttendanceAlerts({ absentRecords: absentRecords.map((r) => ({ ...r, studentClass: takeAttendance.studentClass, section: takeAttendance.section, date: takeAttendance.date })) });
      }
      toast.success('Attendance marked successfully');
      setShowConfirmSave(false);
    } catch (error) { toast.error('Failed to mark attendance'); }
    finally { setSaving(false); }
  };

  const handleViewAttendance = async () => {
    if (!viewFilters.studentClass || !viewFilters.section) { toast.error('Please select class and section'); return; }
    try {
      setLoading(true);
      // Build clean params (omit empty strings so backend doesn't mis-filter)
      const params = { studentClass: viewFilters.studentClass, section: viewFilters.section };
      if (viewFilters.startDate) params.startDate = viewFilters.startDate;
      if (viewFilters.endDate) params.endDate = viewFilters.endDate;
      const response = await api.getAttendance(params);
      const records = Array.isArray(response.data) ? response.data : [];
      setAttendanceRecords(records);
      if (records.length === 0) toast.info('No attendance records found for the selected filters');
    } catch (error) {
      const msg = error.response?.data?.detail || error.message || 'Network error';
      toast.error(`Failed to load attendance: ${msg}`);
    }
    finally { setLoading(false); }
  };

  const handleExport = async (format) => {
    if (!viewFilters.studentClass || !viewFilters.section || !viewFilters.startDate || !viewFilters.endDate) { toast.error('Please fill all filters'); return; }
    try {
      const response = await api.exportAttendance({ ...viewFilters, format });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url; link.setAttribute('download', `attendance.${format}`); document.body.appendChild(link); link.click(); link.remove();
      toast.success('Attendance exported');
    } catch (error) { toast.error('Failed to export'); }
  };

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'present': return 'bg-emerald-100 text-emerald-700';
      case 'absent': return 'bg-rose-100 text-rose-700';
      case 'holiday': return 'bg-orange-100 text-orange-800';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  // Build student-wise summary for view
  const getStudentSummary = () => {
    const stats = {};
    const dateSet = new Set();
    attendanceRecords.forEach((r) => {
      const roll = String(r.rollNo ?? '');
      dateSet.add(r.date);
      if (!stats[roll]) stats[roll] = { name: r.studentName, rollNo: roll, total: 0, present: 0, absent: 0, holiday: 0, records: {} };
      stats[roll].total++;
      if (r.status === 'present') stats[roll].present++;
      else if (r.status === 'absent') stats[roll].absent++;
      else if (r.status === 'holiday') stats[roll].holiday++;
      stats[roll].records[r.date] = r.status;
    });
    const dates = Array.from(dateSet).sort();
    return { students: Object.values(stats).sort((a, b) => String(a.rollNo).localeCompare(String(b.rollNo), undefined, { numeric: true })), dates };
  };

  // Count stats for take attendance
  const presentCount = attendanceData.filter(r => r.status === 'present').length;
  const absentCount = attendanceData.filter(r => r.status === 'absent').length;
  const holidayCount = attendanceData.filter(r => r.status === 'holiday').length;
  const unmarkedCount = attendanceData.filter(r => r.status === 'undefined').length;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Attendance Management</h1>
        <p className="text-sm sm:text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>Mark and view student attendance</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl inline-flex">
          <TabsTrigger data-testid="take-attendance-tab" value="take" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 sm:px-6 py-2 font-bold text-sm">
            <UserCheck className="w-4 h-4 mr-2" />Take Attendance
          </TabsTrigger>
          <TabsTrigger data-testid="view-attendance-tab" value="view" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-4 sm:px-6 py-2 font-bold text-sm">
            <Calendar className="w-4 h-4 mr-2" />View Attendance
          </TabsTrigger>
        </TabsList>

        {/* ===== TAKE ATTENDANCE ===== */}
        <TabsContent value="take" className="space-y-6">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Select Class & Date</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>Class *</Label>
                <Select value={takeAttendance.studentClass} onValueChange={(v) => setTakeAttendance({ ...takeAttendance, studentClass: v, section: '' })}>
                  <SelectTrigger data-testid="attendance-class-select" className="rounded-xl h-12"><SelectValue placeholder="Select Class" /></SelectTrigger>
                  <SelectContent>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Section *</Label>
                <Select value={takeAttendance.section} onValueChange={(v) => setTakeAttendance({ ...takeAttendance, section: v })}>
                  <SelectTrigger data-testid="attendance-section-select" className="rounded-xl h-12"><SelectValue placeholder="Select Section" /></SelectTrigger>
                  <SelectContent>{getSections(takeAttendance.studentClass).map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" data-testid="attendance-date-input" value={takeAttendance.date} onChange={(e) => setTakeAttendance({ ...takeAttendance, date: e.target.value })} className="rounded-xl h-12" />
              </div>
              <div className="flex items-end">
                <Button data-testid="load-students-btn" onClick={handleLoadStudents} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl h-12 w-full active:scale-95 transition-transform">Load Students</Button>
              </div>
            </div>
          </div>

          {students.length > 0 && (
            <>
              {/* Summary bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 sm:p-4 border border-emerald-200 text-center">
                  <p className="text-xs font-bold text-emerald-500 uppercase">Present</p>
                  <p className="text-2xl font-extrabold text-emerald-600">{presentCount}</p>
                </div>
                <div className="bg-rose-50 rounded-xl p-3 sm:p-4 border border-rose-200 text-center">
                  <p className="text-xs font-bold text-rose-500 uppercase">Absent</p>
                  <p className="text-2xl font-extrabold text-rose-600">{absentCount}</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 sm:p-4 border border-orange-200 text-center">
                  <p className="text-xs font-bold text-orange-500 uppercase">Holiday</p>
                  <p className="text-2xl font-extrabold text-orange-600">{holidayCount}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 sm:p-4 border border-slate-200 text-center">
                  <p className="text-xs font-bold text-slate-400 uppercase">Unmarked</p>
                  <p className="text-2xl font-extrabold text-slate-600">{unmarkedCount}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
                  <h2 className="text-lg font-bold text-slate-800">Mark Attendance ({attendanceData.length} students)</h2>
                  <div className="flex gap-2 flex-wrap">
                    <Button data-testid="bulk-mark-present" onClick={() => handleBulkMark('present')} size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl active:scale-95 transition-transform">All Present</Button>
                    <Button data-testid="bulk-mark-absent" onClick={() => handleBulkMark('absent')} size="sm" className="bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl active:scale-95 transition-transform">All Absent</Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {attendanceData.map((record, index) => {
                    const colorMap = {
                      present: { filled: 'bg-emerald-500 text-white ring-2 ring-emerald-300', outline: 'border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50' },
                      absent: { filled: 'bg-rose-500 text-white ring-2 ring-rose-300', outline: 'border-2 border-rose-500 text-rose-600 hover:bg-rose-50' },
                      holiday: { filled: 'bg-orange-500 text-white ring-2 ring-orange-300', outline: 'border-2 border-orange-400 text-orange-600 hover:bg-orange-50' },
                      undefined: { filled: 'bg-slate-500 text-white ring-2 ring-slate-300', outline: 'border-2 border-slate-300 text-slate-500 hover:bg-slate-50' },
                    };
                    return (
                      <div key={record.studentId} data-testid={`attendance-row-${record.rollNo}`} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 text-sm sm:text-base truncate">{record.rollNo} - {record.studentName}</p>
                        </div>
                        <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                          {['present', 'absent', 'holiday', 'undefined'].map((status) => {
                            const isSelected = record.status === status;
                            return (
                              <button key={status} data-testid={`mark-${status}-${record.rollNo}`} onClick={() => handleMarkAttendance(index, status)}
                                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs font-bold transition-all active:scale-95 ${isSelected ? colorMap[status].filled : colorMap[status].outline}`}
                              >{status.charAt(0).toUpperCase() + status.slice(1)}</button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-end">
                <Button data-testid="submit-attendance-btn" onClick={() => {
                  if (unmarkedCount > 0) { toast.error(`${unmarkedCount} student(s) unmarked. Please mark all before saving.`); return; }
                  setShowConfirmSave(true);
                }} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl px-8 active:scale-95 transition-transform">
                  <Send className="w-5 h-5 mr-2" />Submit Attendance
                </Button>
              </div>

              <AlertDialog open={showConfirmSave} onOpenChange={(o) => { if (!saving) setShowConfirmSave(o); }}>
                <AlertDialogContent data-testid="confirm-save-attendance">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Save attendance for {takeAttendance.date}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Class {takeAttendance.studentClass} - Section {takeAttendance.section} · {attendanceData.length} students<br />
                      <span className="inline-flex items-center gap-1.5 mt-2 mr-3 text-emerald-700 font-semibold">{presentCount} Present</span>
                      <span className="inline-flex items-center gap-1.5 mr-3 text-rose-700 font-semibold">{absentCount} Absent</span>
                      <span className="inline-flex items-center gap-1.5 text-orange-700 font-semibold">{holidayCount} Holiday</span>
                      {absentCount > 0 && <><br /><span className="text-amber-700 font-medium mt-1 inline-block">WhatsApp alerts will be sent to parents of {absentCount} absent student{absentCount > 1 ? 's' : ''}.</span></>}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="cancel-save-attendance" disabled={saving}>Cancel</AlertDialogCancel>
                    <AlertDialogAction data-testid="confirm-save-btn" disabled={saving} onClick={(e) => { e.preventDefault(); handleSubmitAttendance(); }} className="bg-sky-500 hover:bg-sky-600">
                      {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving...</> : 'Yes, Save'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </TabsContent>

        {/* ===== VIEW ATTENDANCE ===== */}
        <TabsContent value="view" className="space-y-6">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">Filters</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>Class *</Label>
                <Select value={viewFilters.studentClass} onValueChange={(v) => setViewFilters({ ...viewFilters, studentClass: v, section: '' })}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Select Class" /></SelectTrigger>
                  <SelectContent>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Section *</Label>
                <Select value={viewFilters.section} onValueChange={(v) => setViewFilters({ ...viewFilters, section: v })}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Select Section" /></SelectTrigger>
                  <SelectContent>{getSections(viewFilters.studentClass).map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Start Date <span className="text-slate-400 font-normal">(optional)</span></Label><Input data-testid="view-start-date" type="date" value={viewFilters.startDate} onChange={(e) => setViewFilters({ ...viewFilters, startDate: e.target.value })} className="rounded-xl h-12" /></div>
              <div><Label>End Date <span className="text-slate-400 font-normal">(optional)</span></Label><Input data-testid="view-end-date" type="date" value={viewFilters.endDate} onChange={(e) => setViewFilters({ ...viewFilters, endDate: e.target.value })} className="rounded-xl h-12" /></div>
            </div>
            <p className="text-xs text-slate-500 mt-2">Tip: Leave dates blank to view all attendance for the selected class & section.</p>
            <div className="flex flex-col sm:flex-row justify-between mt-4 gap-3">
              <Button data-testid="view-attendance-btn" onClick={handleViewAttendance} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform">View Attendance</Button>
              {showExport && <div className="flex gap-2">
                <Button data-testid="export-csv-btn" onClick={() => handleExport('csv')} variant="outline" className="font-bold rounded-xl"><Download className="w-4 h-4 mr-2" />CSV</Button>
                <Button data-testid="export-excel-btn" onClick={() => handleExport('xlsx')} variant="outline" className="font-bold rounded-xl"><Download className="w-4 h-4 mr-2" />Excel</Button>
              </div>}
            </div>
          </div>

          {attendanceRecords.length > 0 && (() => {
            const { students: summaryStudents, dates } = getStudentSummary();
            const totalPresent = summaryStudents.reduce((s, st) => s + st.present, 0);
            const totalAbsent = summaryStudents.reduce((s, st) => s + st.absent, 0);
            const totalRecords = summaryStudents.reduce((s, st) => s + st.total, 0);

            return (
              <>
                {/* Overall Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-white rounded-xl shadow p-4 border text-center"><p className="text-xs font-bold text-slate-400 uppercase">Total Records</p><p className="text-2xl font-extrabold text-slate-900">{totalRecords}</p></div>
                  <div className="bg-emerald-50 rounded-xl shadow p-4 border border-emerald-200 text-center"><p className="text-xs font-bold text-emerald-500 uppercase">Present</p><p className="text-2xl font-extrabold text-emerald-600">{totalPresent}</p></div>
                  <div className="bg-rose-50 rounded-xl shadow p-4 border border-rose-200 text-center"><p className="text-xs font-bold text-rose-500 uppercase">Absent</p><p className="text-2xl font-extrabold text-rose-600">{totalAbsent}</p></div>
                  <div className="bg-sky-50 rounded-xl shadow p-4 border border-sky-200 text-center"><p className="text-xs font-bold text-sky-500 uppercase">Working Days</p><p className="text-2xl font-extrabold text-sky-600">{dates.length}</p></div>
                </div>

                {/* Student Summary Table */}
                <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
                  <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                    <h2 className="text-lg font-bold text-slate-800">Attendance Sheet</h2>
                    <div className="flex items-center gap-3 text-[11px] font-bold">
                      <span className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-emerald-500 text-white flex items-center justify-center text-[10px]">P</span><span className="text-slate-600">Present</span></span>
                      <span className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-rose-500 text-white flex items-center justify-center text-[10px]">A</span><span className="text-slate-600">Absent</span></span>
                      <span className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-orange-400 text-white flex items-center justify-center text-[10px]">H</span><span className="text-slate-600">Holiday</span></span>
                      <span className="inline-flex items-center gap-1.5"><span className="w-5 h-5 rounded bg-slate-100 border border-slate-200 text-slate-400 flex items-center justify-center text-[10px]">-</span><span className="text-slate-600">No record</span></span>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b-2 border-slate-200">
                          <th className="px-3 py-3 text-left font-bold uppercase text-[11px] text-slate-600 sticky left-0 bg-slate-50 border-r border-slate-200">Roll</th>
                          <th className="px-3 py-3 text-left font-bold uppercase text-[11px] text-slate-600 sticky left-[52px] bg-slate-50 border-r border-slate-200 min-w-[150px]">Student</th>
                          <th className="px-2 py-3 text-center font-bold uppercase text-[11px] text-emerald-600 border-r border-slate-200"><CheckCircle className="w-4 h-4 inline" /></th>
                          <th className="px-2 py-3 text-center font-bold uppercase text-[11px] text-rose-600 border-r border-slate-200"><XCircle className="w-4 h-4 inline" /></th>
                          <th className="px-2 py-3 text-center font-bold uppercase text-[11px] text-slate-600 border-r border-slate-200">%</th>
                          {dates.map((d) => (
                            <th key={d} className="px-1 py-3 text-center font-bold text-[10px] text-slate-500 whitespace-nowrap border-r border-slate-200 last:border-r-0">{d.slice(8)}<br /><span className="font-normal text-[9px] text-slate-400">{d.slice(5, 7)}</span></th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {summaryStudents.map((st, idx) => {
                          const pct = st.total > 0 ? Math.round(st.present / st.total * 100) : 0;
                          const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/40';
                          return (
                            <tr key={st.rollNo} className={`border-b border-slate-100 hover:bg-sky-50/40 transition-colors ${rowBg}`}>
                              <td className={`px-3 py-2 font-bold text-slate-900 sticky left-0 ${rowBg} border-r border-slate-200`}>{st.rollNo}</td>
                              <td className={`px-3 py-2 font-medium text-slate-700 sticky left-[52px] ${rowBg} border-r border-slate-200 whitespace-nowrap`}>{st.name}</td>
                              <td className="px-2 py-2 text-center font-bold text-emerald-600 border-r border-slate-200">{st.present}</td>
                              <td className="px-2 py-2 text-center font-bold text-rose-600 border-r border-slate-200">{st.absent}</td>
                              <td className="px-2 py-2 text-center border-r border-slate-200">
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${pct >= 75 ? 'bg-emerald-100 text-emerald-700' : pct >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{pct}%</span>
                              </td>
                              {dates.map((d) => {
                                const s = st.records[d];
                                const cellCls = s === 'present' ? 'bg-emerald-500 text-white' : s === 'absent' ? 'bg-rose-500 text-white' : s === 'holiday' ? 'bg-orange-400 text-white' : 'bg-slate-50 text-slate-300';
                                const letter = s === 'present' ? 'P' : s === 'absent' ? 'A' : s === 'holiday' ? 'H' : '-';
                                return (
                                  <td key={d} className="px-1 py-2 text-center border-r border-slate-200 last:border-r-0">
                                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-extrabold ${cellCls}`} title={`${d}: ${s || 'no record'}`}>{letter}</span>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Attendance;
