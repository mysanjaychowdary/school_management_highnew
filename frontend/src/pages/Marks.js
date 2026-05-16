import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Upload, Download, Filter, Trophy, Users, GitCompareArrows } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, canEdit } from '../lib/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#a855f7', '#f97316', '#ef4444'];

const Marks = () => {
  const { user, role } = useAuth();
  const showAnalytics = canEdit(role); // admin & super_admin only
  const [activeTab, setActiveTab] = useState('upload');
  const [classes, setClasses] = useState([]);

  // Upload state
  const [upClass, setUpClass] = useState('');
  const [upSection, setUpSection] = useState('');
  const [upExam, setUpExam] = useState('');
  const [upSubject, setUpSubject] = useState('');
  const [upMaxMarks, setUpMaxMarks] = useState('100');
  const [parsedRows, setParsedRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // View state
  const [viewClass, setViewClass] = useState('');
  const [viewSection, setViewSection] = useState('');
  const [viewExam, setViewExam] = useState('');
  const [viewSubject, setViewSubject] = useState('');
  const [distinct, setDistinct] = useState({ exams: [], subjects: [], classes: [] });
  const [viewRows, setViewRows] = useState([]);

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
  useEffect(() => { loadClasses(); loadDistinct(); }, [loadClasses, loadDistinct]);

  const getSections = (cls) => { const f = classes.find((c) => c.className === cls); return f ? f.sections : []; };

  const handleDownloadSample = async () => {
    if (!upClass || !upSection) { toast.error('Select class and section first'); return; }
    try {
      const r = await api.getMarksSampleCSV({ studentClass: upClass, section: upSection });
      const url = window.URL.createObjectURL(new Blob([r.data]));
      const link = document.createElement('a');
      link.href = url; link.setAttribute('download', `marks_template_${upClass}_${upSection}.csv`);
      document.body.appendChild(link); link.click(); link.remove();
      toast.success('Sample CSV downloaded');
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to download'); }
  };

  const parseCsv = (text) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const findIdx = (...names) => {
      for (const n of names) { const i = header.findIndex((h) => h === n); if (i !== -1) return i; }
      return -1;
    };
    const idx = {
      code: findIdx('student id', 'studentid', 'student_id', 'code'),
      name: findIdx('name', 'student name'),
      exam: findIdx('exam name', 'exam', 'examname'),
      subject: findIdx('subject'),
      marks: findIdx('marks', 'score'),
      max: findIdx('max marks', 'max', 'maxmarks'),
    };
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const code = idx.code !== -1 ? cols[idx.code] : '';
      const marksVal = idx.marks !== -1 ? cols[idx.marks] : '';
      if (!code || marksVal === '') continue;
      rows.push({
        studentCode: code,
        studentName: idx.name !== -1 ? cols[idx.name] : '',
        examName: idx.exam !== -1 ? cols[idx.exam] : '',
        subject: idx.subject !== -1 ? cols[idx.subject] : '',
        marks: parseFloat(marksVal) || 0,
        maxMarks: idx.max !== -1 ? parseFloat(cols[idx.max]) || 100 : 100,
      });
    }
    return rows;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = parseCsv(ev.target.result);
      if (parsed.length === 0) { toast.error('No valid rows found'); return; }
      setParsedRows(parsed);
      // Auto-detect exam name and subject if all rows share the same value
      const firstExam = parsed[0].examName;
      const firstSubject = parsed[0].subject;
      if (firstExam && parsed.every((r) => r.examName === firstExam) && !upExam) setUpExam(firstExam);
      if (firstSubject && parsed.every((r) => r.subject === firstSubject) && !upSubject) setUpSubject(firstSubject);
      toast.success(`Parsed ${parsed.length} rows`);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!upClass || !upSection) { toast.error('Select class and section'); return; }
    if (!upExam) { toast.error('Enter exam name'); return; }
    if (!upSubject) { toast.error('Enter subject'); return; }
    if (parsedRows.length === 0) { toast.error('Upload a CSV first'); return; }
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
      };
      const r = await api.createMarksBulk(payload);
      toast.success(`Saved ${r.data.created} marks${r.data.errors?.length ? `, ${r.data.errors.length} errors` : ''}`);
      if (r.data.errors?.length) r.data.errors.forEach((e) => toast.error(e));
      // Reset
      setParsedRows([]); setFileName('');
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
    } catch (e) { toast.error('Failed to load'); }
  };

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
        </TabsList>

        {/* Upload */}
        <TabsContent value="upload" className="space-y-6">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Step 1 &mdash; Select Class & Section, Download Sample</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <div className="flex items-end"><Button data-testid="marks-download-sample" onClick={handleDownloadSample} variant="outline" className="font-bold rounded-xl h-12"><Download className="w-4 h-4 mr-2" />Download Sample CSV</Button></div>
            </div>
            <p className="text-xs text-slate-500 mt-3">Sample CSV will contain Student IDs and names pre-filled for the selected class & section. Fill the Exam Name, Subject, Marks columns and upload below.</p>
          </div>

          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Step 2 &mdash; Upload Filled CSV</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div><Label>Exam Name *</Label><Input data-testid="marks-up-exam" value={upExam} onChange={(e) => setUpExam(e.target.value)} className="rounded-xl h-12" placeholder="e.g., Midterm 2026" /></div>
              <div><Label>Subject *</Label><Input data-testid="marks-up-subject" value={upSubject} onChange={(e) => setUpSubject(e.target.value)} className="rounded-xl h-12" placeholder="e.g., Mathematics" /></div>
              <div><Label>Max Marks</Label><Input data-testid="marks-up-max" type="number" value={upMaxMarks} onChange={(e) => setUpMaxMarks(e.target.value)} className="rounded-xl h-12" /></div>
              <div className="flex items-end">
                <label className="w-full">
                  <input type="file" accept=".csv" onChange={handleFileChange} data-testid="marks-csv-file" className="hidden" />
                  <span className="cursor-pointer inline-flex items-center justify-center w-full h-12 px-4 rounded-xl font-bold bg-sky-100 text-sky-700 hover:bg-sky-200 transition-colors"><Upload className="w-4 h-4 mr-2" />Choose CSV</span>
                </label>
              </div>
            </div>
            {fileName && <p className="text-xs text-emerald-600 font-bold">Loaded: {fileName} ({parsedRows.length} rows)</p>}

            {parsedRows.length > 0 && (
              <div className="mt-4">
                <h3 className="text-base font-bold text-slate-800 mb-2">Preview &mdash; {parsedRows.length} students</h3>
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
                <div className="flex justify-end mt-4">
                  <Button data-testid="marks-import-btn" onClick={handleImport} disabled={submitting} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform">{submitting ? 'Saving...' : 'Import & Save Marks'}</Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* View */}
        <TabsContent value="view" className="space-y-6">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
              <div className="flex items-end"><Button data-testid="marks-view-load" onClick={loadView} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl h-12">Load</Button></div>
            </div>
          </div>

          {viewRows.length > 0 && (
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
              <Table>
                <TableHeader><TableRow><TableHead>Student ID</TableHead><TableHead>Name</TableHead><TableHead>Class</TableHead><TableHead>Exam</TableHead><TableHead>Subject</TableHead><TableHead className="text-right">Marks</TableHead><TableHead className="text-right">%</TableHead></TableRow></TableHeader>
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
                      </TableRow>
                    );
                  })}
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
      </Tabs>
    </div>
  );
};

export default Marks;
