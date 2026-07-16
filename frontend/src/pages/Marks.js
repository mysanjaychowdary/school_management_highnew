import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Upload, Download, Filter, Trophy, GitCompareArrows, Book, Plus, Trash2, Edit, Send, Loader2, Printer } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, canEdit } from '../lib/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#f97316', '#ef4444'];

const Marks = () => {
  const { user, role, perms } = useAuth();
  const showAnalytics = canEdit(perms); // admin & super_admin only
  const [activeTab, setActiveTab] = useState('upload');
  const [classes, setClasses] = useState([]);

  // Upload state
  const [upClass, setUpClass] = useState('');
  const [upSection, setUpSection] = useState('');
  const [upExam, setUpExam] = useState('');
  const [upSubject, setUpSubject] = useState('');
  const [upMaxMarks, setUpMaxMarks] = useState('100');
  const [parsedRows, setParsedRows] = useState([]);
  const [examSummaryRows, setExamSummaryRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Subjects state
  const [subjects, setSubjects] = useState([]);
  const [subjForm, setSubjForm] = useState({ subjectName: '', applicableClasses: [], maxMarks: '100' });
  const [editingSubject, setEditingSubject] = useState(null);
  const [showSubjDialog, setShowSubjDialog] = useState(false);

  // View state
  const [viewClass, setViewClass] = useState('');
  const [viewSection, setViewSection] = useState('');
  const [viewExam, setViewExam] = useState('');
  const [viewSubject, setViewSubject] = useState('');
  const [viewStudent, setViewStudent] = useState('');
  const [distinct, setDistinct] = useState({ exams: [], subjects: [], classes: [] });
  const [viewRows, setViewRows] = useState([]);
  const [examSummaries, setExamSummaries] = useState([]);

  // Analytics state
  const [stats, setStats] = useState(null);
  const [compareA, setCompareA] = useState('');
  const [compareB, setCompareB] = useState('');

  const loadClasses = useCallback(async () => {
    try { const r = await api.getClasses(); setClasses(r.data); } catch (e) { /* ignore */ }
  }, []);
  const loadDistinct = useCallback(async () => {
    try { const r = await api.getMarksDistinct(); setDistinct(r.data); } catch (e) { /* ignore */ }
  }, []);
  const loadSubjects = useCallback(async () => {
    try { const r = await api.getSubjects(); setSubjects(r.data); } catch (e) { /* ignore */ }
  }, []);
  useEffect(() => { loadClasses(); loadDistinct(); loadSubjects(); }, [loadClasses, loadDistinct, loadSubjects]);

  const getSections = (cls) => { const f = classes.find((c) => c.className === cls); return f ? f.sections : []; };

  const handleDownloadSample = async () => {
    if (!upClass || !upSection) { toast.error('Select class and section first'); return; }
    try {
      const params = { studentClass: upClass, section: upSection };
      if (upExam) params.examName = upExam;
      const r = await api.getMarksSampleCSV(params);
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement('a');
      link.href = url; link.setAttribute('download', `marks_template_${upClass}_${upSection}.csv`);
      document.body.appendChild(link); link.click(); link.remove();
      toast.success('Sample CSV downloaded');
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to download'); }
  };

  // Subjects CRUD
  const handleSaveSubject = async () => {
    if (!subjForm.subjectName) { toast.error('Subject name required'); return; }
    try {
      const data = {
        subjectName: subjForm.subjectName,
        applicableClasses: subjForm.applicableClasses,
        maxMarks: parseFloat(subjForm.maxMarks) || 100,
      };
      if (editingSubject) await api.updateSubject(editingSubject.id, data);
      else await api.createSubject(data);
      toast.success('Subject saved');
      setShowSubjDialog(false);
      setSubjForm({ subjectName: '', applicableClasses: [], maxMarks: '100' });
      setEditingSubject(null);
      loadSubjects();
    } catch (e) { toast.error('Failed to save'); }
  };

  const handleDeleteSubject = async (id) => {
    if (!window.confirm('Delete this subject? Existing marks records will remain.')) return;
    try { await api.deleteSubject(id); toast.success('Subject deleted'); loadSubjects(); }
    catch (e) { toast.error('Failed to delete'); }
  };

  const openEditSubject = (s) => {
    setEditingSubject(s);
    setSubjForm({ subjectName: s.subjectName, applicableClasses: s.applicableClasses || [], maxMarks: String(s.maxMarks || 100) });
    setShowSubjDialog(true);
  };

  const toggleSubjectClass = (cls) => {
    setSubjForm((f) => {
      const has = f.applicableClasses.includes(cls);
      return { ...f, applicableClasses: has ? f.applicableClasses.filter((c) => c !== cls) : [...f.applicableClasses, cls] };
    });
  };

  // Delete uploaded mark(s)
  const handleDeleteMark = async (id) => {
    if (!window.confirm('Delete this mark entry?')) return;
    try { await api.deleteMark(id); toast.success('Deleted'); loadView(); loadDistinct(); }
    catch (e) { toast.error('Failed to delete'); }
  };

  const handleBulkDelete = async () => {
    if (!viewClass && !viewSection && !viewExam && !viewSubject) { toast.error('Apply at least one filter first'); return; }
    const filters = [];
    if (viewClass) filters.push(`Class ${viewClass}`);
    if (viewSection) filters.push(`Section ${viewSection}`);
    if (viewExam) filters.push(`Exam ${viewExam}`);
    if (viewSubject) filters.push(`Subject ${viewSubject}`);
    if (!window.confirm(`Delete ALL marks matching: ${filters.join(' / ')}?\nThis cannot be undone.`)) return;
    try {
      const payload = {};
      if (viewClass) payload.studentClass = viewClass;
      if (viewSection) payload.section = viewSection;
      if (viewExam) payload.examName = viewExam;
      if (viewSubject) payload.subject = viewSubject;
      const r = await api.bulkDeleteMarks(payload);
      toast.success(`Deleted ${r.data.deleted} records`);
      loadView(); loadDistinct();
    } catch (e) { toast.error('Bulk delete failed'); }
  };

  const [sendingResults, setSendingResults] = useState(false);
  const handleSendResults = async () => {
    if (!viewExam) { toast.error('Select an exam first to send results'); return; }
    const scope = [];
    if (viewClass) scope.push(`Class ${viewClass}`);
    if (viewSection) scope.push(`Section ${viewSection}`);
    scope.push(`Exam ${viewExam}`);
    if (!window.confirm(`Send WhatsApp results to parents for: ${scope.join(' / ')}?`)) return;
    try {
      setSendingResults(true);
      const payload = { examName: viewExam };
      if (viewClass) payload.studentClass = viewClass;
      if (viewSection) payload.section = viewSection;
      const r = await api.sendExamResults(payload);
      const { sent = 0, skipped = 0, failed = 0, disabled = false, message } = r.data || {};
      if (disabled) {
        toast.warning('Marks notifications are turned OFF in Settings → Templates. Enable them to send.', { duration: 8000 });
      } else if (message && sent === 0) {
        toast.info(message);
      } else {
        toast.success(`Sent ${sent} · Skipped ${skipped} · Failed ${failed}`, { duration: 8000 });
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to send results');
    } finally { setSendingResults(false); }
  };

  // Wide format: one row per student, one column per subject, plus Total/Grade.
  // Fixed columns are Student ID / Name / Exam Name / Total / Grade — every other
  // header is treated as a subject name (matched against the Subjects master for maxMarks).
  const FIXED_COLS = ['student id', 'studentid', 'student_id', 'code', 'name', 'student name', 'exam name', 'exam', 'examname', 'total', 'grade'];

  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return { rows: [], examSummaries: [] };
    const rawHeader = lines[0].split(',').map((h) => h.trim());
    const header = rawHeader.map((h) => h.toLowerCase());
    const findIdx = (...names) => {
      for (const n of names) { const i = header.findIndex((h) => h === n); if (i !== -1) return i; }
      return -1;
    };
    const idx = {
      code: findIdx('student id', 'studentid', 'student_id', 'code'),
      name: findIdx('name', 'student name'),
      exam: findIdx('exam name', 'exam', 'examname'),
      total: findIdx('total'),
      grade: findIdx('grade'),
      marks: findIdx('marks', 'score'),
      max: findIdx('max marks', 'max', 'maxmarks'),
    };
    // Any column not in the fixed set (and not the legacy single Marks/Max Marks pair) is a subject column
    const subjectCols = [];
    rawHeader.forEach((h, i) => {
      if (FIXED_COLS.includes(h.toLowerCase()) || i === idx.marks || i === idx.max) return;
      subjectCols.push({ index: i, subjectName: h });
    });

    const rows = [];
    const examSummaries = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const code = idx.code !== -1 ? cols[idx.code] : '';
      if (!code) continue;
      const studentName = idx.name !== -1 ? cols[idx.name] : '';
      const examName = idx.exam !== -1 ? cols[idx.exam] : '';

      if (subjectCols.length > 0) {
        subjectCols.forEach(({ index, subjectName }) => {
          const marksVal = cols[index];
          if (marksVal === undefined || marksVal === '') return;
          const subjMaster = subjects.find((s) => s.subjectName.toLowerCase() === subjectName.toLowerCase());
          rows.push({
            studentCode: code, studentName, examName, subject: subjectName,
            marks: parseFloat(marksVal) || 0,
            maxMarks: subjMaster?.maxMarks || parseFloat(upMaxMarks) || 100,
          });
        });
      } else if (idx.marks !== -1 && cols[idx.marks] !== '') {
        // Legacy no-subjects fallback: single Marks/Max Marks column pair
        rows.push({
          studentCode: code, studentName, examName, subject: '',
          marks: parseFloat(cols[idx.marks]) || 0,
          maxMarks: idx.max !== -1 ? parseFloat(cols[idx.max]) || 100 : 100,
        });
      }

      const totalVal = idx.total !== -1 ? cols[idx.total] : '';
      const gradeVal = idx.grade !== -1 ? cols[idx.grade] : '';
      if (totalVal !== '' || gradeVal !== '') {
        examSummaries.push({ studentCode: code, total: totalVal !== '' ? parseFloat(totalVal) : null, grade: gradeVal || null });
      }
    }
    return { rows, examSummaries };
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { rows: parsed, examSummaries } = parseCsv(ev.target.result);
      if (parsed.length === 0) { toast.error('No valid rows found'); return; }
      setParsedRows(parsed);
      setExamSummaryRows(examSummaries);
      // Auto-detect exam name if all rows share the same value
      const firstExam = parsed[0].examName;
      if (firstExam && parsed.every((r) => r.examName === firstExam) && !upExam) setUpExam(firstExam);
      toast.success(`Parsed ${parsed.length} mark entries across ${new Set(parsed.map((r) => r.studentCode)).size} students`);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!upClass || !upSection) { toast.error('Select class and section'); return; }
    if (!upExam) { toast.error('Enter exam name'); return; }
    if (parsedRows.length === 0) { toast.error('Upload a CSV first'); return; }
    // Validate each row has a subject (either in row or fallback)
    const missingSubj = parsedRows.find((r) => !(r.subject || upSubject));
    if (missingSubj) { toast.error(`Row for ${missingSubj.studentCode} is missing Subject`); return; }
    try {
      setSubmitting(true);
      const payload = {
        studentClass: upClass, section: upSection,
        examName: upExam, subject: upSubject,
        maxMarks: parseFloat(upMaxMarks) || 100,
        recordedBy: user?.name || user?.username || 'Teacher',
        rows: parsedRows.map((r) => ({
          studentCode: r.studentCode,
          studentName: r.studentName,
          examName: r.examName || upExam,
          subject: r.subject || upSubject,
          marks: r.marks,
          maxMarks: r.maxMarks || parseFloat(upMaxMarks) || 100,
        })),
        examSummaries: examSummaryRows.length > 0 ? examSummaryRows : undefined,
      };
      const r = await api.createMarksBulk(payload);
      toast.success(`Saved ${r.data.created} marks${r.data.errors?.length ? `, ${r.data.errors.length} errors` : ''}`);
      if (r.data.errors?.length) r.data.errors.forEach((e) => toast.error(e));
      // Reset
      setParsedRows([]); setFileName(''); setExamSummaryRows([]);
      loadDistinct();
    } catch (e) { toast.error('Import failed'); }
    finally { setSubmitting(false); }
  };

  const loadView = async () => {
    try {
      const params = {};
      if (viewClass) params.studentClass = viewClass;
      if (viewSection) params.section = viewSection;
      if (viewExam) params.examName = viewExam;
      if (viewSubject) params.subject = viewSubject;
      const r = await api.getMarks(params);
      setViewRows(r.data);
      if (r.data.length === 0) toast.info('No records');
      if (viewExam) {
        const summaryParams = { examName: viewExam };
        if (viewClass) summaryParams.studentClass = viewClass;
        if (viewSection) summaryParams.section = viewSection;
        try { const sr = await api.getExamSummaries(summaryParams); setExamSummaries(sr.data); } catch (e) { setExamSummaries([]); }
      } else {
        setExamSummaries([]);
      }
    } catch (e) { toast.error('Failed to load'); }
  };

  // Distinct students present in the currently loaded view, for the "Print Result" student picker
  const viewStudents = Array.from(new Map(viewRows.map((r) => [r.studentId, { studentId: r.studentId, studentCode: r.studentCode, studentName: r.studentName }])).values());

  const loadStats = async () => {
    try {
      const params = {};
      if (viewClass) params.studentClass = viewClass;
      if (viewSection) params.section = viewSection;
      if (viewExam) params.examName = viewExam;
      if (viewSubject) params.subject = viewSubject;
      if (compareA && compareB) { params.compareExamA = compareA; params.compareExamB = compareB; }
      const r = await api.getMarksStats(params);
      setStats(r.data);
    } catch (e) { toast.error('Failed to load stats'); }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6" data-testid="marks-page">
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Marks</h1>
        <p className="text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>Upload student marks via CSV, view records, and analyse performance</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl inline-flex flex-wrap">
          <TabsTrigger data-testid="marks-upload-tab" value="upload" className="data-[state=active]:bg-white rounded-lg px-6 py-2 font-bold"><Upload className="w-4 h-4 mr-2" />Upload</TabsTrigger>
          <TabsTrigger data-testid="marks-view-tab" value="view" className="data-[state=active]:bg-white rounded-lg px-6 py-2 font-bold"><Filter className="w-4 h-4 mr-2" />View Records</TabsTrigger>
          {showAnalytics && <TabsTrigger data-testid="marks-analytics-tab" value="analytics" className="data-[state=active]:bg-white rounded-lg px-6 py-2 font-bold"><BarChart3 className="w-4 h-4 mr-2" />Analytics</TabsTrigger>}
          {showAnalytics && <TabsTrigger data-testid="marks-subjects-tab" value="subjects" className="data-[state=active]:bg-white rounded-lg px-6 py-2 font-bold"><Book className="w-4 h-4 mr-2" />Subjects</TabsTrigger>}
        </TabsList>

        {/* Upload */}
        <TabsContent value="upload" className="space-y-6">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Step 1 &mdash; Select Class, Section, Exam &amp; Download Sample</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div><Label>Class *</Label>
                <Select value={upClass} onValueChange={(v) => { setUpClass(v); setUpSection(''); }}>
                  <SelectTrigger data-testid="marks-up-class" className="rounded-xl h-12"><SelectValue placeholder="Class" /></SelectTrigger>
                  <SelectContent>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Section *</Label>
                <Select value={upSection} onValueChange={setUpSection}>
                  <SelectTrigger data-testid="marks-up-section" className="rounded-xl h-12"><SelectValue placeholder="Section" /></SelectTrigger>
                  <SelectContent>{getSections(upClass).map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Exam Name *</Label><Input data-testid="marks-up-exam" value={upExam} onChange={(e) => setUpExam(e.target.value)} className="rounded-xl h-12" placeholder="e.g., Midterm 2026" /></div>
              <div className="md:col-span-2 flex items-end"><Button data-testid="marks-download-sample" onClick={handleDownloadSample} variant="outline" className="font-bold rounded-xl h-12 w-full"><Download className="w-4 h-4 mr-2" />Download Sample CSV</Button></div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Sample CSV has one row per student with one column per subject, plus <span className="font-bold">Total</span> and <span className="font-bold">Grade</span> columns you can fill in by hand. Fill in the marks and upload below. Manage subjects in the <span className="font-bold">Subjects</span> tab.</p>
            {subjects.filter((s) => !upClass || (s.applicableClasses && s.applicableClasses.includes(upClass)) || (s.applicableClasses || []).length === 0).length === 0 && upClass && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">No subjects defined for Class {upClass}. Add subjects in the <span className="font-bold">Subjects</span> tab so the CSV pre-fills properly with one row per subject.</div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Step 2 &mdash; Upload Filled CSV</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div><Label>Exam Name *</Label><Input data-testid="marks-up-exam-2" value={upExam} onChange={(e) => setUpExam(e.target.value)} className="rounded-xl h-12" placeholder="e.g., Midterm 2026" /></div>
              <div><Label>Default Subject <span className="text-slate-400 font-normal">(fallback)</span></Label><Input data-testid="marks-up-subject" value={upSubject} onChange={(e) => setUpSubject(e.target.value)} className="rounded-xl h-12" placeholder="Only if blank in CSV" /></div>
              <div><Label>Default Max Marks</Label><Input data-testid="marks-up-max" type="number" value={upMaxMarks} onChange={(e) => setUpMaxMarks(e.target.value)} className="rounded-xl h-12" /></div>
              <div className="flex items-end">
                <label className="w-full">
                  <input type="file" accept=".csv" onChange={handleFileChange} data-testid="marks-csv-file" className="hidden" />
                  <span className="cursor-pointer inline-flex items-center justify-center w-full h-12 px-4 rounded-xl font-bold bg-sky-100 text-sky-700 hover:bg-sky-200 transition-colors"><Upload className="w-4 h-4 mr-2" />Choose CSV</span>
                </label>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-3">Each subject column in the CSV is imported separately per student. Total/Grade columns (if filled) are stored as-is and shown in View Records. Fields above are only used as a fallback if a row leaves Exam Name/Subject blank.</p>
            {fileName && <p className="text-xs text-emerald-600 font-bold">Loaded: {fileName} ({parsedRows.length} rows)</p>}

            {parsedRows.length > 0 && (
              <div className="mt-4 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">Preview &mdash; {parsedRows.length} mark entries ({new Set(parsedRows.map((r) => r.studentCode)).size} students)</h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader><TableRow><TableHead>ID</TableHead><TableHead>Name</TableHead><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead className="text-right">Marks</TableHead><TableHead className="text-right">Max</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {parsedRows.map((r, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-bold">{r.studentCode}</TableCell>
                            <TableCell>{r.studentName}</TableCell>
                            <TableCell className="text-slate-600">{r.examName || upExam}</TableCell>
                            <TableCell className="text-slate-600">{r.subject || upSubject}</TableCell>
                            <TableCell className="text-right font-bold text-emerald-600">{r.marks}</TableCell>
                            <TableCell className="text-right">{r.maxMarks}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {examSummaryRows.length > 0 && (
                  <div>
                    <h3 className="text-base font-bold text-slate-800 mb-2">Total / Grade Preview &mdash; {examSummaryRows.length} students</h3>
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                      <Table>
                        <TableHeader><TableRow><TableHead>ID</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Grade</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {examSummaryRows.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-bold">{r.studentCode}</TableCell>
                              <TableCell className="text-right">{r.total ?? '-'}</TableCell>
                              <TableCell>{r.grade || '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button data-testid="marks-import-btn" onClick={handleImport} disabled={submitting} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform">{submitting ? 'Saving...' : 'Import & Save Marks'}</Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* View */}
        <TabsContent value="view" className="space-y-6">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div><Label>Class</Label>
                <Select value={viewClass || '_all'} onValueChange={(v) => { setViewClass(v === '_all' ? '' : v); setViewSection(''); setViewStudent(''); }}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent><SelectItem value="_all">All</SelectItem>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Section</Label>
                <Select value={viewSection || '_all'} onValueChange={(v) => setViewSection(v === '_all' ? '' : v)}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent><SelectItem value="_all">All</SelectItem>{getSections(viewClass).map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Exam</Label>
                <Select value={viewExam || '_all'} onValueChange={(v) => setViewExam(v === '_all' ? '' : v)}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent><SelectItem value="_all">All</SelectItem>{distinct.exams.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Subject</Label>
                <Select value={viewSubject || '_all'} onValueChange={(v) => setViewSubject(v === '_all' ? '' : v)}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent><SelectItem value="_all">All</SelectItem>{distinct.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Student <span className="text-slate-400 font-normal">(for print)</span></Label>
                <Select value={viewStudent || '_all'} onValueChange={(v) => setViewStudent(v === '_all' ? '' : v)}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
                  <SelectContent><SelectItem value="_all">All</SelectItem>{viewStudents.map((s) => <SelectItem key={s.studentId} value={s.studentId}>{s.studentCode} - {s.studentName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end"><Button data-testid="marks-view-load" onClick={loadView} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl h-12">Load</Button></div>
            </div>
          </div>

          {viewRows.length > 0 && (
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <p className="text-sm font-bold text-slate-700">{viewRows.length} record(s)</p>
                <div className="flex items-center gap-2 flex-wrap">
                  {viewExam && (
                    <a data-testid="marks-print-result-btn" href={api.getMarksProgressCardUrl({ examName: viewExam, studentClass: viewClass, section: viewSection, studentId: viewStudent })} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl text-sm transition-colors">
                      <Printer className="w-4 h-4 mr-2" />Print Result
                    </a>
                  )}
                  {viewExam && role === 'super_admin' && (
                    <Button data-testid="marks-send-results-btn" onClick={handleSendResults} disabled={sendingResults} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl">
                      {sendingResults ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : <><Send className="w-4 h-4 mr-2" />Send Results to Parents</>}
                    </Button>
                  )}
                  {showAnalytics && (viewClass || viewSection || viewExam || viewSubject) && (
                    <Button data-testid="marks-bulk-delete-btn" onClick={handleBulkDelete} variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50 font-bold rounded-xl"><Trash2 className="w-4 h-4 mr-2" />Delete All Matching</Button>
                  )}
                </div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>Student ID</TableHead><TableHead>Name</TableHead><TableHead>Class</TableHead><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead className="text-right">Marks</TableHead><TableHead className="text-right">%</TableHead>{showAnalytics && <TableHead className="text-center">Actions</TableHead>}</TableRow></TableHeader>
                <TableBody>
                  {viewRows.map((r) => {
                    const pct = r.maxMarks ? Math.round(r.marks / r.maxMarks * 100) : 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-bold">{r.studentCode}</TableCell>
                        <TableCell>{r.studentName}</TableCell>
                        <TableCell className="text-slate-600">{r.studentClass}-{r.section}</TableCell>
                        <TableCell>{r.examName}</TableCell>
                        <TableCell>{r.subject}</TableCell>
                        <TableCell className="text-right font-bold">{r.marks}/{r.maxMarks}</TableCell>
                        <TableCell className="text-right"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${pct >= 75 ? 'bg-emerald-100 text-emerald-700' : pct >= 33 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{pct}%</span></TableCell>
                        {showAnalytics && (
                          <TableCell className="text-center">
                            <button onClick={() => handleDeleteMark(r.id)} data-testid={`delete-mark-${r.id}`} className="p-2 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-rose-600" /></button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {examSummaries.length > 0 && (
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
              <p className="text-sm font-bold text-slate-700 mb-3">Student Summary &mdash; {viewExam} <span className="text-slate-400 font-normal">(Total/Grade entered during upload)</span></p>
              <Table>
                <TableHeader><TableRow><TableHead>Student ID</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Grade</TableHead></TableRow></TableHeader>
                <TableBody>
                  {examSummaries.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-bold">{s.studentCode}</TableCell>
                      <TableCell>{s.studentName}</TableCell>
                      <TableCell className="text-right font-bold">{s.total ?? '-'}</TableCell>
                      <TableCell><span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700">{s.grade || '-'}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Analytics */}
        {showAnalytics && (
          <TabsContent value="analytics" className="space-y-6">
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-4">Filters</h2>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div><Label>Class</Label>
                  <Select value={viewClass || '_all'} onValueChange={(v) => { setViewClass(v === '_all' ? '' : v); setViewSection(''); }}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent><SelectItem value="_all">All</SelectItem>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Section</Label>
                  <Select value={viewSection || '_all'} onValueChange={(v) => setViewSection(v === '_all' ? '' : v)}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent><SelectItem value="_all">All</SelectItem>{getSections(viewClass).map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Exam</Label>
                  <Select value={viewExam || '_all'} onValueChange={(v) => setViewExam(v === '_all' ? '' : v)}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent><SelectItem value="_all">All</SelectItem>{distinct.exams.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Subject</Label>
                  <Select value={viewSubject || '_all'} onValueChange={(v) => setViewSubject(v === '_all' ? '' : v)}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
                    <SelectContent><SelectItem value="_all">All</SelectItem>{distinct.subjects.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Compare Exam A</Label>
                  <Select value={compareA || '_none'} onValueChange={(v) => setCompareA(v === '_none' ? '' : v)}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="--" /></SelectTrigger>
                    <SelectContent><SelectItem value="_none">--</SelectItem>{distinct.exams.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Compare Exam B</Label>
                  <Select value={compareB || '_none'} onValueChange={(v) => setCompareB(v === '_none' ? '' : v)}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="--" /></SelectTrigger>
                    <SelectContent><SelectItem value="_none">--</SelectItem>{distinct.exams.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end mt-4"><Button data-testid="marks-stats-load" onClick={loadStats} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">Compute</Button></div>
            </div>

            {stats && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="bg-white rounded-xl shadow p-4 border text-center"><p className="text-xs font-bold text-slate-400 uppercase">Entries</p><p className="text-2xl font-extrabold text-slate-900">{stats.overall.totalEntries}</p></div>
                  <div className="bg-sky-50 rounded-xl shadow p-4 border border-sky-200 text-center"><p className="text-xs font-bold text-sky-500 uppercase">Average %</p><p className="text-2xl font-extrabold text-sky-600">{stats.overall.averagePct}%</p></div>
                  <div className="bg-emerald-50 rounded-xl shadow p-4 border border-emerald-200 text-center"><p className="text-xs font-bold text-emerald-500 uppercase">Highest %</p><p className="text-2xl font-extrabold text-emerald-600">{stats.overall.highestPct}%</p></div>
                  <div className="bg-rose-50 rounded-xl shadow p-4 border border-rose-200 text-center"><p className="text-xs font-bold text-rose-500 uppercase">Lowest %</p><p className="text-2xl font-extrabold text-rose-600">{stats.overall.lowestPct}%</p></div>
                  <div className="bg-amber-50 rounded-xl shadow p-4 border border-amber-200 text-center"><p className="text-xs font-bold text-amber-500 uppercase">Pass / Fail</p><p className="text-2xl font-extrabold text-amber-700">{stats.overall.passCount} / {stats.overall.failCount}</p></div>
                </div>

                {/* Subject avg */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Average % by Subject</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={stats.bySubject}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="subject" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Bar dataKey="average" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Grade distribution */}
                  <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Grade Distribution</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie data={stats.grades.filter((g) => g.count > 0)} dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={90} label>
                          {stats.grades.map((g, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Compare exams */}
                {stats.compare && stats.compare.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><GitCompareArrows className="w-5 h-5" />{compareA} vs {compareB}</h3>
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={stats.compare}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="subject" />
                        <YAxis domain={[0, 100]} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey={compareA} fill="#3b82f6" radius={[6, 6, 0, 0]} />
                        <Bar dataKey={compareB} fill="#f59e0b" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Top students */}
                <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                  <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" />Top 10 Students</h3>
                  <Table>
                    <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Name</TableHead><TableHead>ID</TableHead><TableHead className="text-right">Total Marks</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {stats.topStudents.map((t, i) => (
                        <TableRow key={t.studentId}>
                          <TableCell><span className={`inline-flex w-7 h-7 rounded-full items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-slate-700' : i === 2 ? 'bg-orange-300 text-white' : 'bg-slate-100 text-slate-600'}`}>{i + 1}</span></TableCell>
                          <TableCell className="font-bold">{t.studentName}</TableCell>
                          <TableCell className="text-slate-600">{t.studentCode}</TableCell>
                          <TableCell className="text-right">{t.marks}/{t.max}</TableCell>
                          <TableCell className="text-right"><span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">{t.pct}%</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {stats.topStudents.length === 0 && <p className="text-center text-slate-400 py-6">No data</p>}
                </div>
              </>
            )}
          </TabsContent>
        )}

        {/* Subjects Tab */}
        {showAnalytics && (
          <TabsContent value="subjects" className="space-y-6">
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Subjects Master</h2>
                  <p className="text-sm text-slate-500">Define subjects and which classes they apply to. Sample CSV uses this to pre-fill rows per student per subject.</p>
                </div>
                <Dialog open={showSubjDialog} onOpenChange={(o) => { setShowSubjDialog(o); if (!o) { setEditingSubject(null); setSubjForm({ subjectName: '', applicableClasses: [], maxMarks: '100' }); } }}>
                  <DialogTrigger asChild>
                    <Button data-testid="add-subject-btn" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl"><Plus className="w-4 h-4 mr-2" />Add Subject</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader><DialogTitle>{editingSubject ? 'Edit Subject' : 'Add Subject'}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                      <div><Label>Subject Name *</Label><Input data-testid="subject-name-input" value={subjForm.subjectName} onChange={(e) => setSubjForm({ ...subjForm, subjectName: e.target.value })} className="rounded-xl h-12" placeholder="e.g., Mathematics" /></div>
                      <div><Label>Default Max Marks</Label><Input type="number" value={subjForm.maxMarks} onChange={(e) => setSubjForm({ ...subjForm, maxMarks: e.target.value })} className="rounded-xl h-12" /></div>
                      <div>
                        <Label>Applicable Classes <span className="text-slate-400 font-normal">(empty = all)</span></Label>
                        <div className="mt-2 flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-xl">
                          {classes.length === 0 && <p className="text-xs text-slate-400">No classes defined.</p>}
                          {classes.map((c) => {
                            const checked = subjForm.applicableClasses.includes(c.className);
                            return (
                              <button key={c.className} type="button" onClick={() => toggleSubjectClass(c.className)} className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${checked ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Class {c.className}</button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-4">
                        <Button type="button" variant="outline" onClick={() => setShowSubjDialog(false)} className="rounded-xl">Cancel</Button>
                        <Button data-testid="save-subject-btn" onClick={handleSaveSubject} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">{editingSubject ? 'Update' : 'Add'}</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {subjects.length === 0 ? (
                <div className="text-center py-12">
                  <Book className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                  <p className="text-slate-400 font-medium">No subjects defined yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Applicable Classes</TableHead><TableHead className="text-right">Max Marks</TableHead><TableHead className="text-center">Actions</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {subjects.map((s) => (
                      <TableRow key={s.id} data-testid={`subject-row-${s.id}`}>
                        <TableCell className="font-bold">{s.subjectName}</TableCell>
                        <TableCell>
                          {(s.applicableClasses || []).length === 0 ? <span className="text-slate-400 italic">All classes</span> : (
                            <div className="flex flex-wrap gap-1">{(s.applicableClasses || []).map((c) => <span key={c} className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700">Class {c}</span>)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-bold">{s.maxMarks}</TableCell>
                        <TableCell className="text-center">
                          <div className="inline-flex gap-1">
                            <button onClick={() => openEditSubject(s)} data-testid={`edit-subject-${s.id}`} className="p-2 hover:bg-sky-100 rounded-lg transition-colors"><Edit className="w-4 h-4 text-sky-600" /></button>
                            <button onClick={() => handleDeleteSubject(s.id)} data-testid={`delete-subject-${s.id}`} className="p-2 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-rose-600" /></button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Marks;
