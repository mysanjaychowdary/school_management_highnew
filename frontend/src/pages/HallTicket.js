import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, canCreate, canDelete } from '../lib/AuthContext';
import { Plus, Trash2, Printer, Ticket as TicketIcon } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const EMPTY_SUBJECT = { subjectName: '', examDate: '', examTime: '' };

const HallTicket = () => {
  const { perms } = useAuth();
  const showCreate = canCreate(perms, 'hallTickets');
  const showDelete = canDelete(perms, 'hallTickets');

  const [classes, setClasses] = useState([]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({ studentClass: '', section: '', examName: '', subjects: [{ ...EMPTY_SUBJECT }] });
  const [saving, setSaving] = useState(false);

  const loadClasses = useCallback(async () => {
    try { const r = await api.getClasses(); setClasses(r.data); } catch (e) { /* ignore */ }
  }, []);
  const loadExams = useCallback(async () => {
    try { const r = await api.getHallTicketExams(); setExams(r.data); }
    catch (e) { toast.error('Failed to load exam schedules'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadClasses(); loadExams(); }, [loadClasses, loadExams]);

  const getSections = (cls) => { const f = classes.find((c) => c.className === cls); return f ? f.sections : []; };

  const updateSubject = (i, field, value) => {
    setForm((f) => ({ ...f, subjects: f.subjects.map((s, idx) => idx === i ? { ...s, [field]: value } : s) }));
  };
  const addSubjectRow = () => setForm((f) => ({ ...f, subjects: [...f.subjects, { ...EMPTY_SUBJECT }] }));
  const removeSubjectRow = (i) => setForm((f) => ({ ...f, subjects: f.subjects.filter((_, idx) => idx !== i) }));

  const resetForm = () => setForm({ studentClass: '', section: '', examName: '', subjects: [{ ...EMPTY_SUBJECT }] });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.studentClass || !form.section || !form.examName) { toast.error('Select class, section and enter an exam name'); return; }
    const subjects = form.subjects.filter((s) => s.subjectName.trim());
    if (subjects.length === 0) { toast.error('Add at least one subject'); return; }
    try {
      setSaving(true);
      await api.createHallTicketExam({ ...form, subjects });
      toast.success('Exam schedule saved');
      resetForm();
      loadExams();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this exam schedule?')) return;
    try { await api.deleteHallTicketExam(id); toast.success('Deleted'); loadExams(); }
    catch (error) { toast.error('Failed to delete'); }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Hall Tickets</h1>
        <p className="text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>Create an exam timetable and print hall tickets for a class/section</p>
      </div>

      {showCreate && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Create Exam Schedule</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Class *</Label>
                <Select value={form.studentClass} onValueChange={(v) => setForm((f) => ({ ...f, studentClass: v, section: '' }))}>
                  <SelectTrigger data-testid="ht-class" className="rounded-xl h-12"><SelectValue placeholder="Class" /></SelectTrigger>
                  <SelectContent>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Section *</Label>
                <Select value={form.section} onValueChange={(v) => setForm((f) => ({ ...f, section: v }))}>
                  <SelectTrigger data-testid="ht-section" className="rounded-xl h-12"><SelectValue placeholder="Section" /></SelectTrigger>
                  <SelectContent>{getSections(form.studentClass).map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Exam Name *</Label><Input data-testid="ht-exam-name" value={form.examName} onChange={(e) => setForm((f) => ({ ...f, examName: e.target.value }))} className="rounded-xl h-12" placeholder="e.g., Final Exam 2026" /></div>
            </div>

            <div>
              <Label>Subjects &amp; Timetable *</Label>
              <div className="space-y-2 mt-2">
                {form.subjects.map((s, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1.5fr_auto] gap-2 items-center">
                    <Input data-testid={`ht-subject-name-${i}`} value={s.subjectName} onChange={(e) => updateSubject(i, 'subjectName', e.target.value)} className="rounded-xl h-11" placeholder="Subject name" />
                    <Input data-testid={`ht-subject-date-${i}`} type="date" value={s.examDate} onChange={(e) => updateSubject(i, 'examDate', e.target.value)} className="rounded-xl h-11" />
                    <Input data-testid={`ht-subject-time-${i}`} value={s.examTime} onChange={(e) => updateSubject(i, 'examTime', e.target.value)} className="rounded-xl h-11" placeholder="e.g., 10:00 AM - 1:00 PM" />
                    <button type="button" onClick={() => removeSubjectRow(i)} disabled={form.subjects.length === 1} className="p-2 hover:bg-rose-100 rounded-lg transition-colors disabled:opacity-30"><Trash2 className="w-4 h-4 text-rose-600" /></button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" onClick={addSubjectRow} className="mt-2 rounded-xl font-bold"><Plus className="w-4 h-4 mr-2" />Add Subject</Button>
            </div>

            <div className="flex justify-end">
              <Button data-testid="ht-save-btn" type="submit" disabled={saving} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform">{saving ? 'Saving...' : 'Save & Generate'}</Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        {loading ? <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500"></div></div>
        : exams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40">
            <TicketIcon className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-slate-400 font-medium">No exam schedules yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="font-bold uppercase text-xs text-slate-600">Exam Name</TableHead>
                <TableHead className="font-bold uppercase text-xs text-slate-600">Class</TableHead>
                <TableHead className="font-bold uppercase text-xs text-slate-600">Subjects</TableHead>
                <TableHead className="font-bold uppercase text-xs text-slate-600">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {exams.map((ex) => (
                  <TableRow key={ex.id} className="hover:bg-slate-50/80">
                    <TableCell className="font-semibold text-slate-900">{ex.examName}</TableCell>
                    <TableCell className="text-slate-600">Class {ex.studentClass} - {ex.section}</TableCell>
                    <TableCell className="text-slate-600">{(ex.subjects || []).length} subject(s)</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <a href={api.getHallTicketPdfUrl(ex.id)} target="_blank" rel="noopener noreferrer" data-testid={`ht-print-${ex.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-lg font-bold text-xs transition-colors">
                          <Printer className="w-3.5 h-3.5" />Print Hall Tickets
                        </a>
                        {showDelete && <button onClick={() => handleDelete(ex.id)} data-testid={`ht-delete-${ex.id}`} className="p-2 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-rose-600" /></button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};

export default HallTicket;
