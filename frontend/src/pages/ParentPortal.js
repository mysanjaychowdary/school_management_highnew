import React, { useState, useEffect, useCallback } from 'react';
import { GraduationCap, ClipboardCheck, DollarSign, CalendarDays, BookOpenCheck, LogOut, Download, User, Phone, MapPin, FileText, Send, BarChart3, Home, MoreHorizontal, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Toaster } from '../components/ui/sonner';
import GlobalLoader from '../components/GlobalLoader';

const ParentPortal = () => {
  const [loggedIn, setLoggedIn] = useState(false);
  const [dashData, setDashData] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveForm, setLeaveForm] = useState({ fromDate: '', toDate: '', reason: '', attachmentUrl: '' });
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [branding, setBranding] = useState({ schoolName: 'Parent Portal', logoUrl: '' });

  useEffect(() => {
    api.getSchoolSettings()
      .then((r) => setBranding({ schoolName: r.data?.schoolName || 'Parent Portal', logoUrl: r.data?.logoUrl || '' }))
      .catch(() => {});
  }, []);

  const loadLeaveRequests = useCallback(async (studentId) => {
    try {
      const r = await api.getLeaveRequests({ studentId });
      setLeaveRequests(r.data);
    } catch (e) { /* ignore */ }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await api.parentLogin({ username, password });
      setLoggedIn(true);
      const dash = await api.getParentDashboard(response.data.student.id);
      setDashData(dash.data);
      loadLeaveRequests(response.data.student.id);
    } catch (error) { toast.error('Invalid credentials'); }
    finally { setLoading(false); }
  };

  const handleLogout = () => { setLoggedIn(false); setDashData(null); setUsername(''); setPassword(''); setActiveTab('overview'); setLeaveRequests([]); };
  const getStatusColor = (s) => s === 'present' ? 'bg-emerald-100 text-emerald-700' : s === 'absent' ? 'bg-rose-100 text-rose-700' : s === 'holiday' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600';

  const handleLeaveAttachment = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = await api.uploadFile(file);
      setLeaveForm((f) => ({ ...f, attachmentUrl: r.data.url }));
      toast.success('File uploaded');
    } catch (err) { toast.error('Upload failed'); }
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    if (!dashData) return;
    if (!leaveForm.fromDate || !leaveForm.toDate || !leaveForm.reason) {
      toast.error('Please fill all required fields');
      return;
    }
    if (leaveForm.fromDate > leaveForm.toDate) {
      toast.error('From date must be before To date');
      return;
    }
    try {
      setLeaveLoading(true);
      await api.createLeaveRequest({
        studentId: dashData.student.id,
        studentCode: dashData.student.studentCode || dashData.student.rollNo,
        studentName: dashData.student.studentName,
        fromDate: leaveForm.fromDate,
        toDate: leaveForm.toDate,
        reason: leaveForm.reason,
        attachmentUrl: leaveForm.attachmentUrl || null,
      });
      toast.success('Leave request submitted');
      setLeaveForm({ fromDate: '', toDate: '', reason: '', attachmentUrl: '' });
      loadLeaveRequests(dashData.student.id);
    } catch (err) { toast.error('Failed to submit leave'); }
    finally { setLeaveLoading(false); }
  };

  if (!loggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-emerald-50 flex items-center justify-center p-4">
        <GlobalLoader />
        <Toaster position="top-right" richColors />
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-8">
            <div className="flex flex-col items-center mb-6">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="logo" className="w-20 h-20 rounded-3xl object-cover shadow-lg border-2 border-white" />
              ) : (
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-3xl flex items-center justify-center shadow-lg">
                  <GraduationCap className="w-10 h-10 text-white" />
                </div>
              )}
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-4" style={{ fontFamily: 'Nunito' }}>{branding.schoolName}</h1>
              <p className="text-sm text-slate-500 mt-1">Parent Portal</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div><Label className="font-bold">Username</Label><Input data-testid="parent-username" required value={username} onChange={(e) => setUsername(e.target.value)} className="rounded-2xl h-12 mt-1.5" placeholder="Enter parent username" /></div>
              <div><Label className="font-bold">Password</Label><Input data-testid="parent-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-2xl h-12 mt-1.5" placeholder="Enter password" /></div>
              <Button data-testid="parent-login-btn" type="submit" disabled={loading} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold rounded-2xl h-12 active:scale-95 transition-all shadow-md shadow-emerald-200">
                {loading ? 'Logging in...' : 'Sign In'}
              </Button>
            </form>
          </div>
          <p className="text-center text-xs text-slate-400 mt-4">Powered by SchoolPro</p>
        </div>
      </div>
    );
  }

  if (!dashData) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div></div>;

  const { student, attendanceStats, feeStructure } = dashData;
  const totalFee = (feeStructure?.term1?.total || 0) + (feeStructure?.term2?.total || 0) + (feeStructure?.term3?.total || 0) + (feeStructure?.customFees || []).reduce((s, c) => s + c.total, 0);
  const totalPaid = (feeStructure?.term1?.paid || 0) + (feeStructure?.term2?.paid || 0) + (feeStructure?.term3?.paid || 0) + (feeStructure?.customFees || []).reduce((s, c) => s + c.paid, 0);
  const totalPending = totalFee - totalPaid;

  const tabs = [
    { key: 'overview', label: 'Home', icon: Home },
    { key: 'attendance', label: 'Attendance', icon: ClipboardCheck },
    { key: 'fees', label: 'Fees', icon: DollarSign },
    { key: 'marks', label: 'Marks', icon: BarChart3 },
    { key: 'events', label: 'Events', icon: CalendarDays },
    { key: 'homework', label: 'Homework', icon: BookOpenCheck },
    { key: 'leave', label: 'Leave', icon: FileText },
  ];
  // Bottom nav shows top 4 + "More"
  const bottomTabs = tabs.slice(0, 4);
  const moreTabs = tabs.slice(4);
  const initials = (student.studentName || '').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="min-h-screen bg-slate-50 pb-20 lg:pb-0">
      <GlobalLoader />
      <Toaster position="top-right" richColors />

      {/* Sticky Hero Header */}
      <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 pt-5 pb-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5 min-w-0">
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt="logo" className="w-9 h-9 rounded-xl object-cover bg-white border border-white/40 flex-shrink-0" />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0"><GraduationCap className="w-5 h-5 text-white" /></div>
              )}
              <p className="text-sm font-bold truncate" data-testid="parent-school-name">{branding.schoolName}</p>
            </div>
            <button data-testid="parent-logout-btn" onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 text-xs font-bold transition-colors backdrop-blur-sm">
              <LogOut className="w-3.5 h-3.5" />Logout
            </button>
          </div>

          {/* Student hero card */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-2xl font-extrabold border border-white/30 flex-shrink-0" style={{ fontFamily: 'Nunito' }}>{initials || 'S'}</div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{tabs.find((t) => t.key === activeTab)?.label}</p>
              <h1 className="text-xl sm:text-2xl font-extrabold leading-tight truncate" style={{ fontFamily: 'Nunito' }}>{student.studentName}</h1>
              <p className="text-xs text-white/80 mt-0.5 truncate">Roll {student.rollNo} · Class {student.studentClass}-{student.section}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop tabs (horizontal pills) */}
      <div className="hidden lg:block sticky top-[148px] z-20 bg-slate-50 border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex gap-2 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button key={t.key} data-testid={`parent-tab-${t.key}`} onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-sm whitespace-nowrap transition-all ${isActive ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'}`}>
                <Icon className="w-4 h-4" />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 sm:p-5 space-y-5">

        {/* ========= OVERVIEW ========= */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Student Card */}
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-5 sm:p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <User className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Nunito' }}>{student.studentName}</h2>
                  <p className="text-sm text-slate-500 mt-1">Roll No: {student.rollNo} | Class {student.studentClass}-{student.section}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-600">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{student.fatherName}</span>
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{student.mobile}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{student.address}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl shadow p-4 sm:p-5 border border-slate-100">
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">Attendance</p>
                <p className={`text-2xl sm:text-3xl font-extrabold mt-1 ${attendanceStats.percentage >= 75 ? 'text-emerald-600' : 'text-rose-600'}`}>{attendanceStats.percentage}%</p>
                <p className="text-xs text-slate-500 mt-1">{attendanceStats.presentDays}/{attendanceStats.totalDays} days</p>
              </div>
              <div className="bg-white rounded-2xl shadow p-4 sm:p-5 border border-slate-100">
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">Total Fee</p>
                <p className="text-2xl sm:text-3xl font-extrabold mt-1 text-slate-900">{'\u20B9'}{totalFee.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl shadow p-4 sm:p-5 border border-slate-100">
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">Paid</p>
                <p className="text-2xl sm:text-3xl font-extrabold mt-1 text-emerald-600">{'\u20B9'}{totalPaid.toLocaleString()}</p>
              </div>
              <div className="bg-white rounded-2xl shadow p-4 sm:p-5 border border-slate-100">
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-400">Pending</p>
                <p className="text-2xl sm:text-3xl font-extrabold mt-1 text-rose-600">{'\u20B9'}{totalPending.toLocaleString()}</p>
              </div>
            </div>

            {/* Quick upcoming */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl shadow p-5 border border-slate-100">
                <h3 className="text-base font-bold text-slate-800 mb-3">Upcoming Events</h3>
                {dashData.events.filter(e => e.date >= new Date().toISOString().split('T')[0]).slice(0, 3).map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50">
                    <div className="w-10 h-10 bg-amber-100 rounded-lg flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-amber-700">{new Date(ev.date+'T00:00:00').toLocaleDateString('en-IN',{month:'short'})}</span>
                      <span className="text-sm font-extrabold text-amber-800 leading-none">{new Date(ev.date+'T00:00:00').getDate()}</span>
                    </div>
                    <p className="text-sm font-bold text-slate-800 truncate">{ev.title}</p>
                  </div>
                ))}
                {dashData.events.filter(e => e.date >= new Date().toISOString().split('T')[0]).length === 0 && <p className="text-sm text-slate-400">No upcoming events</p>}
              </div>
              <div className="bg-white rounded-2xl shadow p-5 border border-slate-100">
                <h3 className="text-base font-bold text-slate-800 mb-3">Recent Homework</h3>
                {dashData.homework.slice(-3).reverse().map((hw) => (
                  <div key={hw.id} className="p-2 rounded-lg hover:bg-slate-50">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">{hw.subject}</span>
                      {hw.dueDate < new Date().toISOString().split('T')[0] && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">OVERDUE</span>}
                    </div>
                    <p className="text-sm font-bold text-slate-800 mt-1">{hw.title}</p>
                    <p className="text-xs text-slate-500">Due: {hw.dueDate}</p>
                  </div>
                ))}
                {dashData.homework.length === 0 && <p className="text-sm text-slate-400">No homework</p>}
              </div>
            </div>
          </div>
        )}

        {/* ========= ATTENDANCE ========= */}
        {activeTab === 'attendance' && (() => {
          // Build month -> stats map from full attendance (not just last 30)
          const allAtt = (dashData.fullAttendance && dashData.fullAttendance.length > 0) ? dashData.fullAttendance : (dashData.recentAttendance || []);
          const monthMap = {};
          allAtt.forEach((a) => {
            const m = (a.date || '').slice(0, 7); // YYYY-MM
            if (!m) return;
            if (!monthMap[m]) monthMap[m] = { month: m, present: 0, absent: 0, holiday: 0, total: 0, records: {} };
            monthMap[m].total++;
            if (a.status === 'present') monthMap[m].present++;
            else if (a.status === 'absent') monthMap[m].absent++;
            else if (a.status === 'holiday') monthMap[m].holiday++;
            monthMap[m].records[a.date] = a.status;
          });
          const months = Object.values(monthMap).sort((a, b) => b.month.localeCompare(a.month));
          const recentMonth = months[0];

          // Build calendar grid for the most recent month with records
          const renderCalendar = (m) => {
            if (!m) return null;
            const [yy, mm] = m.month.split('-').map(Number);
            const firstDay = new Date(yy, mm - 1, 1);
            const daysInMonth = new Date(yy, mm, 0).getDate();
            const startWeekday = firstDay.getDay();
            const cells = [];
            for (let i = 0; i < startWeekday; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) {
              const dateStr = `${yy}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              cells.push({ day: d, status: m.records[dateStr] });
            }
            return (
              <div className="grid grid-cols-7 gap-1">
                {['S','M','T','W','T','F','S'].map((w, i) => <div key={i} className="text-[10px] font-bold text-slate-400 uppercase text-center py-1">{w}</div>)}
                {cells.map((c, i) => {
                  if (!c) return <div key={i} />;
                  const cls = c.status === 'present' ? 'bg-emerald-500 text-white' : c.status === 'absent' ? 'bg-rose-500 text-white' : c.status === 'holiday' ? 'bg-orange-400 text-white' : 'bg-slate-100 text-slate-400';
                  return <div key={i} className={`aspect-square rounded-lg flex items-center justify-center text-xs font-bold ${cls}`} title={c.status || 'no record'}>{c.day}</div>;
                })}
              </div>
            );
          };

          return (
            <div className="space-y-4">
              {/* Top stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl shadow p-4 border text-center"><p className="text-xs font-bold text-slate-400 uppercase">Total Days</p><p className="text-2xl font-extrabold text-slate-900">{attendanceStats.totalDays}</p></div>
                <div className="bg-emerald-50 rounded-xl shadow p-4 border border-emerald-200 text-center"><p className="text-xs font-bold text-emerald-500 uppercase">Present</p><p className="text-2xl font-extrabold text-emerald-600">{attendanceStats.presentDays}</p></div>
                <div className="bg-rose-50 rounded-xl shadow p-4 border border-rose-200 text-center"><p className="text-xs font-bold text-rose-500 uppercase">Absent</p><p className="text-2xl font-extrabold text-rose-600">{attendanceStats.absentDays}</p></div>
                <div className={`rounded-xl shadow p-4 border text-center ${attendanceStats.percentage >= 75 ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}><p className="text-xs font-bold text-slate-400 uppercase">Overall %</p><p className={`text-2xl font-extrabold ${attendanceStats.percentage >= 75 ? 'text-emerald-600' : 'text-rose-600'}`}>{attendanceStats.percentage}%</p></div>
              </div>

              {/* Calendar - Recent Month */}
              {recentMonth && (
                <div className="bg-white rounded-2xl shadow p-4 sm:p-6 border border-slate-100">
                  <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                    <h2 className="text-lg font-bold text-slate-800">Calendar - {new Date(recentMonth.month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</h2>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" />Present</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-rose-500" />Absent</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400" />Holiday</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-200" />No record</span>
                    </div>
                  </div>
                  {renderCalendar(recentMonth)}
                </div>
              )}

              {/* Monthly Breakdown */}
              {months.length > 0 && (
                <div className="bg-white rounded-2xl shadow p-4 sm:p-6 border border-slate-100">
                  <h2 className="text-lg font-bold text-slate-800 mb-4">Monthly Breakdown</h2>
                  <div className="space-y-3">
                    {months.map((m) => {
                      const pct = m.total > 0 ? Math.round(m.present / m.total * 100) : 0;
                      const label = new Date(m.month + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
                      return (
                        <div key={m.month} data-testid={`parent-month-${m.month}`} className="border border-slate-100 rounded-xl p-3">
                          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                            <p className="font-bold text-slate-900">{label}</p>
                            <span className={`px-3 py-0.5 rounded-full text-xs font-bold ${pct >= 75 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{pct}%</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-xs text-center">
                            <div className="bg-slate-50 rounded-lg py-1.5"><p className="font-bold text-slate-400 uppercase text-[9px]">Total</p><p className="font-extrabold text-slate-900">{m.total}</p></div>
                            <div className="bg-emerald-50 rounded-lg py-1.5"><p className="font-bold text-emerald-500 uppercase text-[9px]">Present</p><p className="font-extrabold text-emerald-600">{m.present}</p></div>
                            <div className="bg-rose-50 rounded-lg py-1.5"><p className="font-bold text-rose-500 uppercase text-[9px]">Absent</p><p className="font-extrabold text-rose-600">{m.absent}</p></div>
                            <div className="bg-orange-50 rounded-lg py-1.5"><p className="font-bold text-orange-500 uppercase text-[9px]">Holiday</p><p className="font-extrabold text-orange-600">{m.holiday}</p></div>
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 flex h-1.5 rounded-full overflow-hidden bg-slate-100">
                            {m.total > 0 && <>
                              <div className="bg-emerald-500" style={{ width: `${(m.present / m.total) * 100}%` }} />
                              <div className="bg-rose-500" style={{ width: `${(m.absent / m.total) * 100}%` }} />
                              <div className="bg-orange-400" style={{ width: `${(m.holiday / m.total) * 100}%` }} />
                            </>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent records list */}
              <div className="bg-white rounded-2xl shadow p-4 sm:p-6 border border-slate-100">
                <h2 className="text-lg font-bold text-slate-800 mb-4">Recent Records</h2>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {dashData.recentAttendance.slice().reverse().map((a, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <p className="font-medium text-slate-700 text-sm">{a.date}</p>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(a.status)}`}>{a.status.toUpperCase()}</span>
                    </div>
                  ))}
                  {dashData.recentAttendance.length === 0 && <p className="text-slate-400 text-center py-8">No records yet</p>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ========= FEES ========= */}
        {activeTab === 'fees' && (
          <div className="space-y-6">
            {/* Fee Structure */}
            <div className="bg-white rounded-2xl shadow p-4 sm:p-6 border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Fee Structure</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                {['term1', 'term2', 'term3'].map((t, i) => {
                  const term = feeStructure?.[t] || { total: 0, paid: 0 };
                  const pending = term.total - term.paid;
                  const paid = term.paid >= term.total;
                  const isPrevDue = i === 0 && (student.previousYearDues?.amount || 0) > 0;
                  return (
                    <div key={t} className={`rounded-xl border p-4 ${paid ? 'border-emerald-300 bg-emerald-50/40' : term.paid > 0 ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-bold text-slate-900">Term {i + 1}</h4>
                          {isPrevDue && <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700">Prev Year Due</span>}
                        </div>
                        {paid ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white">PAID</span>
                          : term.paid > 0 ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">PARTIAL</span>
                          : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">UNPAID</span>}
                      </div>
                      <p className="text-xl font-extrabold text-slate-900">{'\u20B9'}{term.total.toLocaleString()}</p>
                      <div className="flex justify-between mt-2 text-xs">
                        <span className="text-emerald-600 font-bold">Paid: {'\u20B9'}{term.paid.toLocaleString()}</span>
                        {!paid && <span className="text-rose-600 font-bold">Due: {'\u20B9'}{pending.toLocaleString()}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Custom Fees */}
              {(feeStructure?.customFees || []).length > 0 && (
                <>
                  <h3 className="text-base font-bold text-slate-700 mb-3 mt-4">Additional Fees</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {feeStructure.customFees.map((cf) => {
                      const pending = cf.total - cf.paid;
                      const paid = cf.paid >= cf.total;
                      return (
                        <div key={cf.id} className={`rounded-xl border p-4 ${paid ? 'border-emerald-300 bg-emerald-50/40' : cf.paid > 0 ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="font-bold text-slate-900 text-sm">{cf.feeName}</h4>
                            {paid ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white">PAID</span>
                              : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">DUE</span>}
                          </div>
                          {cf.dueDate && <p className="text-xs text-rose-500 font-medium">Due: {cf.dueDate}</p>}
                          <p className="text-lg font-extrabold text-slate-900 mt-1">{'\u20B9'}{cf.total.toLocaleString()}</p>
                          <div className="flex justify-between mt-1 text-xs">
                            <span className="text-emerald-600 font-bold">Paid: {'\u20B9'}{cf.paid.toLocaleString()}</span>
                            {!paid && <span className="text-rose-600 font-bold">Due: {'\u20B9'}{pending.toLocaleString()}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {/* Total Summary */}
              <div className="mt-4 p-4 bg-slate-50 rounded-xl grid grid-cols-3 gap-4 text-center">
                <div><p className="text-xs font-bold text-slate-400 uppercase">Total Fee</p><p className="text-lg font-extrabold text-slate-900">{'\u20B9'}{totalFee.toLocaleString()}</p></div>
                <div><p className="text-xs font-bold text-slate-400 uppercase">Total Paid</p><p className="text-lg font-extrabold text-emerald-600">{'\u20B9'}{totalPaid.toLocaleString()}</p></div>
                <div><p className="text-xs font-bold text-slate-400 uppercase">Balance</p><p className="text-lg font-extrabold text-rose-600">{'\u20B9'}{totalPending.toLocaleString()}</p></div>
              </div>
            </div>

            {/* Payment History */}
            <div className="bg-white rounded-2xl shadow p-4 sm:p-6 border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Payment History</h2>
              <div className="space-y-2">
                {dashData.payments.slice().reverse().map((p) => (
                  <div key={p.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 bg-slate-50 rounded-xl gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{p.receiptNumber}</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${p.paymentMode === 'upi' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.paymentMode.toUpperCase()}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{p.termNumber ? `Term ${p.termNumber}` : (p.feeName || 'Custom')} | {typeof p.paymentDate === 'string' ? p.paymentDate.slice(0, 10) : ''}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-emerald-600">{'\u20B9'}{p.amount.toLocaleString()}</span>
                      <a href={api.getInvoiceUrl(p.id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-lg font-bold text-xs"><Download className="w-3 h-3" />Invoice</a>
                    </div>
                  </div>
                ))}
                {dashData.payments.length === 0 && <p className="text-slate-400 text-center py-8 text-sm">No payments yet</p>}
              </div>
            </div>
          </div>
        )}

        {/* ========= MARKS ========= */}
        {activeTab === 'marks' && (() => {
          const marks = dashData.marks || [];
          // Group by exam
          const examMap = {};
          marks.forEach((m) => {
            if (!examMap[m.examName]) examMap[m.examName] = { exam: m.examName, items: [], total: 0, max: 0 };
            examMap[m.examName].items.push(m);
            examMap[m.examName].total += m.marks;
            examMap[m.examName].max += m.maxMarks || 100;
          });
          const exams = Object.values(examMap).sort((a, b) => a.exam.localeCompare(b.exam));
          return (
            <div className="space-y-4">
              {exams.length === 0 && <div className="bg-white rounded-2xl shadow p-8 border text-center"><BarChart3 className="w-10 h-10 mx-auto text-slate-300 mb-2" /><p className="text-slate-400 font-medium">No marks recorded yet</p></div>}
              {exams.map((ex) => {
                const pct = ex.max ? Math.round(ex.total / ex.max * 100) : 0;
                return (
                  <div key={ex.exam} data-testid={`parent-marks-exam-${ex.exam}`} className="bg-white rounded-2xl shadow p-4 sm:p-6 border border-slate-100">
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <h2 className="text-lg font-bold text-slate-800">{ex.exam}</h2>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${pct >= 75 ? 'bg-emerald-100 text-emerald-700' : pct >= 33 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>Overall {pct}% &mdash; {ex.total}/{ex.max}</span>
                    </div>
                    <div className="space-y-2">
                      {ex.items.map((m) => {
                        const sp = m.maxMarks ? Math.round(m.marks / m.maxMarks * 100) : 0;
                        return (
                          <div key={m.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                            <p className="font-bold text-slate-900">{m.subject}</p>
                            <div className="flex items-center gap-3">
                              <p className="font-bold text-slate-700">{m.marks}<span className="text-slate-400">/{m.maxMarks}</span></p>
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${sp >= 75 ? 'bg-emerald-500 text-white' : sp >= 33 ? 'bg-amber-500 text-white' : 'bg-rose-500 text-white'}`}>{sp}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ========= EVENTS ========= */}
        {activeTab === 'events' && (
          <div className="bg-white rounded-2xl shadow p-4 sm:p-6 border border-slate-100">
            <h2 className="text-lg font-bold text-slate-800 mb-4">School Events</h2>
            <div className="space-y-3">
              {dashData.events.sort((a, b) => b.date.localeCompare(a.date)).map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 bg-slate-50 rounded-xl">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-amber-400 to-amber-600 rounded-xl flex flex-col items-center justify-center text-white shadow flex-shrink-0">
                    <p className="text-[10px] font-bold">{new Date(ev.date+'T00:00:00').toLocaleDateString('en-IN',{month:'short'})}</p>
                    <p className="text-lg sm:text-xl font-extrabold leading-none">{new Date(ev.date+'T00:00:00').getDate()}</p>
                  </div>
                  <div><h3 className="font-bold text-slate-900">{ev.title}</h3><p className="text-sm text-slate-600 mt-1">{ev.description}</p>
                  {ev.attachmentUrl && <a href={ev.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 px-2 py-1 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-lg font-bold text-xs transition-colors">{ev.attachmentName?.endsWith('.pdf') ? 'View PDF' : 'View Attachment'}</a>}
                  </div>
                </div>
              ))}
              {dashData.events.length === 0 && <p className="text-slate-400 text-center py-8 text-sm">No events</p>}
            </div>
          </div>
        )}

        {/* ========= HOMEWORK ========= */}
        {activeTab === 'homework' && (
          <div className="space-y-3">
            {dashData.homework.length === 0 && <div className="bg-white rounded-2xl shadow p-8 border text-center"><p className="text-slate-400">No homework assigned</p></div>}
            {dashData.homework.map((hw) => (
              <div key={hw.id} className={`bg-white rounded-2xl shadow p-4 sm:p-5 border transition-all ${hw.dueDate < new Date().toISOString().split('T')[0] ? 'border-rose-200' : 'border-slate-100'}`}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-700">{hw.subject}</span>
                  {hw.dueDate < new Date().toISOString().split('T')[0] && <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">OVERDUE</span>}
                </div>
                <h3 className="text-base font-bold text-slate-900">{hw.title}</h3>
                <p className="text-sm text-slate-600 mt-1">{hw.description}</p>
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-500 flex-wrap">
                  <span className={`font-bold ${hw.dueDate < new Date().toISOString().split('T')[0] ? 'text-rose-600' : 'text-slate-600'}`}>Due: {hw.dueDate}</span>
                  <span>By: {hw.assignedBy}</span>
                  {hw.attachmentUrl && <a href={hw.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-lg font-bold transition-colors">{hw.attachmentName?.endsWith('.pdf') ? 'PDF' : 'View File'}</a>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ========= LEAVE ========= */}
        {activeTab === 'leave' && (
          <div className="space-y-6">
            {/* Submit new leave */}
            <div className="bg-white rounded-2xl shadow p-4 sm:p-6 border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Submit Leave Request</h2>
              <form onSubmit={handleSubmitLeave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>From Date *</Label>
                    <Input data-testid="leave-from-date" type="date" required value={leaveForm.fromDate} onChange={(e) => setLeaveForm({ ...leaveForm, fromDate: e.target.value })} className="rounded-xl h-12" />
                  </div>
                  <div>
                    <Label>To Date *</Label>
                    <Input data-testid="leave-to-date" type="date" required value={leaveForm.toDate} onChange={(e) => setLeaveForm({ ...leaveForm, toDate: e.target.value })} className="rounded-xl h-12" />
                  </div>
                </div>
                <div>
                  <Label>Reason *</Label>
                  <Textarea data-testid="leave-reason" required value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="rounded-xl" rows={3} placeholder="Reason for leave (e.g., Medical, Family function)" />
                </div>
                <div>
                  <Label>Attachment (Optional)</Label>
                  <input type="file" accept="image/*,application/pdf" onChange={handleLeaveAttachment} data-testid="leave-attachment" className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-sky-100 file:text-sky-700 hover:file:bg-sky-200" />
                  {leaveForm.attachmentUrl && <p className="text-xs text-emerald-600 font-bold mt-1">File attached</p>}
                </div>
                <div className="flex justify-end">
                  <Button data-testid="submit-leave-btn" type="submit" disabled={leaveLoading} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform">
                    <Send className="w-4 h-4 mr-2" />{leaveLoading ? 'Submitting...' : 'Submit Request'}
                  </Button>
                </div>
              </form>
            </div>

            {/* Leave history */}
            <div className="bg-white rounded-2xl shadow p-4 sm:p-6 border border-slate-100">
              <h2 className="text-lg font-bold text-slate-800 mb-4">Leave History</h2>
              {leaveRequests.length === 0 ? (
                <p className="text-slate-400 text-center py-8 text-sm">No leave requests yet</p>
              ) : (
                <div className="space-y-3">
                  {leaveRequests.map((lr) => (
                    <div key={lr.id} data-testid={`parent-leave-${lr.id}`} className={`p-4 rounded-xl border ${lr.status === 'approved' ? 'border-emerald-200 bg-emerald-50/30' : lr.status === 'rejected' ? 'border-rose-200 bg-rose-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900">{lr.fromDate} to {lr.toDate}</p>
                          <p className="text-sm text-slate-600 mt-1">{lr.reason}</p>
                          {lr.attachmentUrl && (
                            <a href={lr.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 px-2 py-1 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-lg font-bold text-xs">
                              <FileText className="w-3 h-3" />View
                            </a>
                          )}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${lr.status === 'approved' ? 'bg-emerald-500 text-white' : lr.status === 'rejected' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>{lr.status.toUpperCase()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        <div className="grid grid-cols-5 max-w-md mx-auto">
          {bottomTabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.key;
            return (
              <button key={t.key} data-testid={`parent-bottom-tab-${t.key}`} onClick={() => setActiveTab(t.key)}
                className={`flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all active:scale-95 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                <Icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                <span className={`text-[10px] font-bold ${isActive ? 'text-emerald-600' : 'text-slate-500'}`}>{t.label}</span>
                {isActive && <span className="absolute -bottom-px h-1 w-8 rounded-t-full bg-emerald-500" />}
              </button>
            );
          })}
          <button data-testid="parent-bottom-tab-more" onClick={() => setShowMoreSheet(true)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2.5 transition-all active:scale-95 ${moreTabs.some((t) => t.key === activeTab) ? 'text-emerald-600' : 'text-slate-400'}`}>
            <MoreHorizontal className="w-5 h-5" />
            <span className={`text-[10px] font-bold ${moreTabs.some((t) => t.key === activeTab) ? 'text-emerald-600' : 'text-slate-500'}`}>More</span>
          </button>
        </div>
      </div>

      {/* "More" bottom sheet (mobile) */}
      {showMoreSheet && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMoreSheet(false)} />
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl p-5 shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="w-12 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
            <h3 className="text-base font-extrabold text-slate-900 mb-3">More</h3>
            <div className="grid grid-cols-3 gap-3">
              {moreTabs.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.key;
                return (
                  <button key={t.key} data-testid={`parent-more-${t.key}`} onClick={() => { setActiveTab(t.key); setShowMoreSheet(false); }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl transition-all active:scale-95 ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                    <Icon className="w-6 h-6" />
                    <span className="text-xs font-bold">{t.label}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setShowMoreSheet(false)} className="w-full mt-4 py-3 rounded-2xl bg-slate-100 text-slate-700 font-bold text-sm">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentPortal;
