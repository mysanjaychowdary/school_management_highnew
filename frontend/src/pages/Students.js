import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Upload, Download, Search, Edit, Trash2, TrendingUp, Filter, Eye, ArrowRight } from 'lucide-react';
import { useAuth, canEdit, canExport, canSeeFullMobile, maskMobile } from '../lib/AuthContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const Students = () => {
  const { role, perms } = useAuth();
  const showEdit = canEdit(perms, 'students');
  const showExport = canExport(perms);
  const showFullMobile = canSeeFullMobile(perms);
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPromoteDialog, setShowPromoteDialog] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [filters, setFilters] = useState({ studentClass: '', section: '', search: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalStudents, setTotalStudents] = useState(0);
  const [formData, setFormData] = useState({
    studentCode: '', studentName: '', rollNo: '', studentClass: '', section: '',
    fatherName: '', motherName: '', mobile: '', address: '',
    feeTerm1: '', feeTerm2: '', feeTerm3: '', parentUsername: '', parentPassword: '',
  });
  const [promoteData, setPromoteData] = useState({ fromClass: '', toClass: '' });
  const [promotePreview, setPromotePreview] = useState(null); // bulk preview
  const [previewLoading, setPreviewLoading] = useState(false);
  // Single-student promotion
  const [showSinglePromoteDialog, setShowSinglePromoteDialog] = useState(false);
  const [singlePromoteStudent, setSinglePromoteStudent] = useState(null);
  const [singlePromoteToClass, setSinglePromoteToClass] = useState('');
  const [singlePromotePreview, setSinglePromotePreview] = useState(null);

  const loadClasses = useCallback(async () => {
    try { const r = await api.getClasses(); setClasses(r.data); } catch (e) { /* ignore */ }
  }, []);

  const loadStudents = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page: currentPage, limit: 50 };
      if (filters.studentClass) params.studentClass = filters.studentClass;
      if (filters.section) params.section = filters.section;
      if (filters.search) params.search = filters.search;
      const response = await api.getStudents(params);
      setStudents(response.data.students || response.data);
      setTotalPages(response.data.totalPages || 1);
      setTotalStudents(response.data.total || 0);
    } catch (error) { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  }, [filters, currentPage]);

  useEffect(() => { loadClasses(); }, [loadClasses]);
  useEffect(() => { loadStudents(); }, [loadStudents]);

  const getSections = (cls) => {
    const found = classes.find((c) => c.className === cls);
    return found ? found.sections : [];
  };

  // Use a ref-based updater to avoid re-rendering the whole form on each keystroke
  const updateField = useCallback((field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleAddStudent = async (e) => {
    e.preventDefault();
    try {
      await api.createStudent({
        ...formData, feeTerm1: parseFloat(formData.feeTerm1),
        feeTerm2: parseFloat(formData.feeTerm2), feeTerm3: parseFloat(formData.feeTerm3),
      });
      toast.success('Student added successfully');
      setShowAddDialog(false); resetForm(); loadStudents();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to add student'); }
  };

  const handleBulkUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const response = await api.bulkUploadStudents(file);
      toast.success(`Added ${response.data.added} students`);
      if (response.data.errors.length > 0) toast.error(`Errors: ${response.data.errors.slice(0, 3).join(', ')}`);
      loadStudents();
    } catch (error) { toast.error('Failed to upload CSV'); }
  };

  const handleDownloadSample = async () => {
    try {
      const response = await api.getSampleCSV();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url; link.setAttribute('download', 'sample_students.csv');
      document.body.appendChild(link); link.click(); link.remove();
    } catch (error) { toast.error('Failed to download sample CSV'); }
  };

  const handleEditStudent = async (e) => {
    e.preventDefault();
    try {
      await api.updateStudent(selectedStudent.id, {
        ...formData, feeTerm1: parseFloat(formData.feeTerm1),
        feeTerm2: parseFloat(formData.feeTerm2), feeTerm3: parseFloat(formData.feeTerm3),
      });
      toast.success('Student updated successfully');
      setShowEditDialog(false); resetForm(); loadStudents();
    } catch (error) { toast.error('Failed to update student'); }
  };

  const handleDeleteStudent = async (id) => {
    if (!window.confirm('Are you sure?')) return;
    try { await api.deleteStudent(id); toast.success('Student deleted'); loadStudents(); }
    catch (error) { toast.error('Failed to delete student'); }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) { toast.error('No students selected'); return; }
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} students?`)) return;
    try {
      const response = await api.bulkDeleteStudents(selectedIds);
      toast.success(response.data.message);
      setSelectedIds([]);
      loadStudents();
    } catch (error) { toast.error('Failed to delete students'); }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === students.length) { setSelectedIds([]); }
    else { setSelectedIds(students.map((s) => s.id)); }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const handleLoadPromotePreview = async () => {
    if (!promoteData.fromClass || !promoteData.toClass) { toast.error('Select both classes'); return; }
    if (promoteData.fromClass === promoteData.toClass) { toast.error('From and To classes must be different'); return; }
    try {
      setPreviewLoading(true);
      const r = await api.promoteStudentsPreview(promoteData);
      setPromotePreview(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to load preview'); }
    finally { setPreviewLoading(false); }
  };

  const handleConfirmBulkPromote = async () => {
    try {
      const response = await api.promoteStudents(promoteData);
      toast.success(response.data.message);
      setShowPromoteDialog(false);
      setPromoteData({ fromClass: '', toClass: '' });
      setPromotePreview(null);
      loadStudents();
    } catch (error) { toast.error('Failed to promote students'); }
  };

  const openSinglePromoteDialog = (student) => {
    setSinglePromoteStudent(student);
    setSinglePromoteToClass('');
    setSinglePromotePreview(null);
    setShowSinglePromoteDialog(true);
  };

  const handleLoadSinglePreview = async () => {
    if (!singlePromoteToClass) { toast.error('Select target class'); return; }
    if (singlePromoteToClass === singlePromoteStudent.studentClass) { toast.error('Target class must be different'); return; }
    try {
      const r = await api.promoteSingleStudentPreview(singlePromoteStudent.id, { toClass: singlePromoteToClass });
      setSinglePromotePreview(r.data);
    } catch (e) { toast.error('Failed to load preview'); }
  };

  const handleConfirmSinglePromote = async () => {
    try {
      const r = await api.promoteSingleStudent(singlePromoteStudent.id, { toClass: singlePromoteToClass });
      toast.success(r.data.message);
      setShowSinglePromoteDialog(false);
      setSinglePromoteStudent(null);
      setSinglePromoteToClass('');
      setSinglePromotePreview(null);
      loadStudents();
    } catch (e) { toast.error('Failed to promote student'); }
  };

  const handlePromote = async (e) => {
    e.preventDefault();
    if (!promotePreview) {
      await handleLoadPromotePreview();
    } else {
      await handleConfirmBulkPromote();
    }
  };

  const resetForm = () => {
    setFormData({ studentCode: '', studentName: '', rollNo: '', studentClass: '', section: '', fatherName: '', motherName: '', mobile: '', address: '', feeTerm1: '', feeTerm2: '', feeTerm3: '', parentUsername: '', parentPassword: '' });
  };

  const openEditDialog = (student) => {
    setSelectedStudent(student);
    setFormData({
      studentCode: student.studentCode || '', studentName: student.studentName, rollNo: student.rollNo,
      studentClass: student.studentClass, section: student.section,
      fatherName: student.fatherName, motherName: student.motherName,
      mobile: student.mobile, address: student.address,
      feeTerm1: student.feeTerm1, feeTerm2: student.feeTerm2, feeTerm3: student.feeTerm3,
      parentUsername: student.parentUsername || '', parentPassword: student.parentPassword || '',
    });
    setShowEditDialog(true);
  };

  // Inline form fields rendered directly (NOT as a sub-component to avoid focus loss)
  const renderFormFields = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div><Label>Student ID * (Unique)</Label><Input data-testid="student-code-input" required value={formData.studentCode} onChange={(e) => updateField('studentCode', e.target.value)} className="rounded-xl h-12" placeholder="e.g., ADM001" /></div>
      <div><Label>Student Name *</Label><Input data-testid="student-name-input" required value={formData.studentName} onChange={(e) => updateField('studentName', e.target.value)} className="rounded-xl h-12" /></div>
      <div><Label>Roll No *</Label><Input data-testid="student-rollno-input" required value={formData.rollNo} onChange={(e) => updateField('rollNo', e.target.value)} className="rounded-xl h-12" placeholder="Class roll number" /></div>
      <div>
        <Label>Class *</Label>
        <Select value={formData.studentClass} onValueChange={(v) => setFormData(prev => ({ ...prev, studentClass: v, section: '' }))}>
          <SelectTrigger data-testid="student-class-select" className="rounded-xl h-12"><SelectValue placeholder="Select Class" /></SelectTrigger>
          <SelectContent>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Section *</Label>
        <Select value={formData.section} onValueChange={(v) => updateField('section', v)}>
          <SelectTrigger data-testid="student-section-select" className="rounded-xl h-12"><SelectValue placeholder="Select Section" /></SelectTrigger>
          <SelectContent>{getSections(formData.studentClass).map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div><Label>Father Name *</Label><Input required value={formData.fatherName} onChange={(e) => updateField('fatherName', e.target.value)} className="rounded-xl h-12" /></div>
      <div><Label>Mother Name *</Label><Input required value={formData.motherName} onChange={(e) => updateField('motherName', e.target.value)} className="rounded-xl h-12" /></div>
      <div><Label>Mobile Number *</Label><Input required value={formData.mobile} onChange={(e) => updateField('mobile', e.target.value)} className="rounded-xl h-12" /></div>
      <div><Label>Address *</Label><Input required value={formData.address} onChange={(e) => updateField('address', e.target.value)} className="rounded-xl h-12" /></div>
      <div><Label>Fee Term 1 *</Label><Input type="number" required value={formData.feeTerm1} onChange={(e) => updateField('feeTerm1', e.target.value)} className="rounded-xl h-12" /></div>
      <div><Label>Fee Term 2 *</Label><Input type="number" required value={formData.feeTerm2} onChange={(e) => updateField('feeTerm2', e.target.value)} className="rounded-xl h-12" /></div>
      <div><Label>Fee Term 3 *</Label><Input type="number" required value={formData.feeTerm3} onChange={(e) => updateField('feeTerm3', e.target.value)} className="rounded-xl h-12" /></div>
      <div><Label>Parent Username</Label><Input value={formData.parentUsername} onChange={(e) => updateField('parentUsername', e.target.value)} className="rounded-xl h-12" placeholder="For parent portal login" /></div>
      <div><Label>Parent Password</Label><Input value={formData.parentPassword} onChange={(e) => updateField('parentPassword', e.target.value)} className="rounded-xl h-12" placeholder="Parent portal password" /></div>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Student Management</h1>
          <p className="text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>Manage student records and information</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {showEdit && <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-student-btn" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform"><Plus className="w-5 h-5 mr-2" />Add Student</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="text-2xl font-bold">Add New Student</DialogTitle></DialogHeader>
              <form onSubmit={handleAddStudent} className="space-y-4">
                {renderFormFields()}
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-xl">Cancel</Button>
                  <Button data-testid="submit-student-btn" type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">Add Student</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>}

          {showEdit && <label htmlFor="bulk-upload" className="cursor-pointer">
            <input id="bulk-upload" type="file" accept=".csv" onChange={handleBulkUpload} className="hidden" data-testid="bulk-upload-input" />
            <div className="inline-flex items-center px-4 py-2 bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold rounded-xl active:scale-95 transition-transform"><Upload className="w-5 h-5 mr-2" />Bulk Upload</div>
          </label>}

          {showExport && <Button data-testid="download-sample-csv" onClick={handleDownloadSample} variant="outline" className="font-bold rounded-xl"><Download className="w-5 h-5 mr-2" />Sample CSV</Button>}

          {showEdit && selectedIds.length > 0 && (
            <Button data-testid="bulk-delete-btn" onClick={handleBulkDelete} className="bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl active:scale-95 transition-transform">
              <Trash2 className="w-5 h-5 mr-2" />Delete ({selectedIds.length})
            </Button>
          )}

          {showEdit && <Dialog open={showPromoteDialog} onOpenChange={(open) => { setShowPromoteDialog(open); if (!open) { setPromotePreview(null); setPromoteData({ fromClass: '', toClass: '' }); } }}>
            <DialogTrigger asChild>
              <Button data-testid="promote-students-btn" variant="outline" className="font-bold rounded-xl bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200"><TrendingUp className="w-5 h-5 mr-2" />Promote</Button>
            </DialogTrigger>
            <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="text-2xl font-bold">{promotePreview ? 'Promotion Preview' : 'Promote Students'}</DialogTitle></DialogHeader>
              {!promotePreview ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>From Class *</Label>
                      <Select value={promoteData.fromClass} onValueChange={(v) => setPromoteData({ ...promoteData, fromClass: v })}>
                        <SelectTrigger data-testid="promote-from-class" className="rounded-xl h-12"><SelectValue placeholder="From" /></SelectTrigger>
                        <SelectContent>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>To Class *</Label>
                      <Select value={promoteData.toClass} onValueChange={(v) => setPromoteData({ ...promoteData, toClass: v })}>
                        <SelectTrigger data-testid="promote-to-class" className="rounded-xl h-12"><SelectValue placeholder="To" /></SelectTrigger>
                        <SelectContent>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                    <p className="font-bold mb-1">Promotion Rules:</p>
                    <ul className="list-disc ml-5 space-y-0.5">
                      <li>Total Due = (Term1 + Term2 + Term3 + custom fees) − total paid</li>
                      <li>New Term 1 = Old Term 1 + Total Due (Previous Year Due included)</li>
                      <li>New Term 2 = Old Term 2 (unchanged)</li>
                      <li>New Term 3 = Old Term 3 + ₹5000</li>
                      <li>All paid amounts reset to 0 in the new year</li>
                    </ul>
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setShowPromoteDialog(false)} className="rounded-xl">Cancel</Button>
                    <Button data-testid="load-preview-btn" type="button" disabled={previewLoading} onClick={handleLoadPromotePreview} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">
                      {previewLoading ? 'Loading...' : 'Preview Promotion'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
                    <p className="text-sm font-bold text-sky-900">Class {promotePreview.fromClass} → Class {promotePreview.toClass}</p>
                    <p className="text-sm font-bold text-sky-900">{promotePreview.studentCount} student(s) will be promoted</p>
                  </div>
                  <div className="overflow-x-auto max-h-96 border border-slate-200 rounded-xl">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold uppercase text-xs text-slate-600">Name</th>
                          <th className="px-3 py-2 text-left font-bold uppercase text-xs text-slate-600">Roll</th>
                          <th className="px-3 py-2 text-right font-bold uppercase text-xs text-slate-600">Paid</th>
                          <th className="px-3 py-2 text-right font-bold uppercase text-xs text-rose-600">Due</th>
                          <th className="px-3 py-2 text-center font-bold uppercase text-xs text-slate-600">Old T1/T2/T3</th>
                          <th className="px-3 py-2 text-center font-bold uppercase text-xs text-emerald-700">New T1/T2/T3</th>
                        </tr>
                      </thead>
                      <tbody>
                        {promotePreview.preview.map((p) => (
                          <tr key={p.studentId} className="border-t border-slate-100 hover:bg-slate-50/80">
                            <td className="px-3 py-2 font-semibold text-slate-900">{p.studentName}</td>
                            <td className="px-3 py-2">{p.rollNo}</td>
                            <td className="px-3 py-2 text-right text-emerald-600 font-bold">{'\u20B9'}{p.totalPaid.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-rose-600 font-bold">{'\u20B9'}{p.totalDue.toLocaleString()}</td>
                            <td className="px-3 py-2 text-center text-slate-500 text-xs">{p.oldFees.term1}/{p.oldFees.term2}/{p.oldFees.term3}</td>
                            <td className="px-3 py-2 text-center text-emerald-700 font-bold text-xs">{p.newFees.term1}/{p.newFees.term2}/{p.newFees.term3}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center pt-4">
                    <Button type="button" variant="outline" onClick={() => setPromotePreview(null)} className="rounded-xl">Back</Button>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setShowPromoteDialog(false)} className="rounded-xl">Cancel</Button>
                      <Button data-testid="confirm-bulk-promote-btn" type="button" onClick={handleConfirmBulkPromote} className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl">Confirm Promotion</Button>
                    </div>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
        <div className="flex items-center gap-2 mb-4"><Filter className="w-5 h-5 text-slate-600" /><h2 className="text-lg font-bold text-slate-800">Filters</h2></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><Label>Class</Label>
            <Select value={filters.studentClass || '_all'} onValueChange={(v) => setFilters({ ...filters, studentClass: v === '_all' ? '' : v, section: '' })}>
              <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent><SelectItem value="_all">All Classes</SelectItem>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Section</Label>
            <Select value={filters.section || '_all'} onValueChange={(v) => setFilters({ ...filters, section: v === '_all' ? '' : v })}>
              <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent><SelectItem value="_all">All Sections</SelectItem>{getSections(filters.studentClass).map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
              <Input data-testid="student-search-input" placeholder="Search name or roll no" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} className="rounded-xl h-12 pl-10" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div></div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64"><p className="text-slate-400 font-medium">No students found</p></div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="w-10"><input type="checkbox" checked={selectedIds.length === students.length && students.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-sky-500" data-testid="select-all-checkbox" /></TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Student ID</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Roll No</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Name</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Class</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Section</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Mobile</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id} className="hover:bg-slate-50/80" data-testid={`student-row-${student.rollNo}`}>
                    <TableCell><input type="checkbox" checked={selectedIds.includes(student.id)} onChange={() => toggleSelect(student.id)} className="w-4 h-4 rounded accent-sky-500" /></TableCell>
                    <TableCell className="font-semibold text-slate-900">{student.studentCode}</TableCell>
                    <TableCell className="text-slate-700">{student.rollNo}</TableCell>
                    <TableCell className="font-medium text-slate-700">{student.studentName}</TableCell>
                    <TableCell><span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-700">{student.studentClass}</span></TableCell>
                    <TableCell><span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">{student.section}</span></TableCell>
                    <TableCell className="text-slate-600">{showFullMobile ? student.mobile : maskMobile(student.mobile)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <button onClick={() => navigate(`/students/${student.id}`)} data-testid={`view-student-${student.rollNo}`} className="p-2 hover:bg-indigo-100 rounded-lg transition-colors"><Eye className="w-4 h-4 text-indigo-600" /></button>
                        {showEdit && <>
                          <button onClick={() => openEditDialog(student)} data-testid={`edit-student-${student.rollNo}`} className="p-2 hover:bg-sky-100 rounded-lg transition-colors"><Edit className="w-4 h-4 text-sky-600" /></button>
                          <button onClick={() => openSinglePromoteDialog(student)} data-testid={`promote-student-${student.rollNo}`} title="Promote this student" className="p-2 hover:bg-amber-100 rounded-lg transition-colors"><TrendingUp className="w-4 h-4 text-amber-600" /></button>
                          <button onClick={() => handleDeleteStudent(student.id)} data-testid={`delete-student-${student.rollNo}`} className="p-2 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-rose-600" /></button>
                        </>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4">
          <p className="text-sm text-slate-600 font-medium">Showing {((currentPage - 1) * 50) + 1}-{Math.min(currentPage * 50, totalStudents)} of {totalStudents}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} className="rounded-xl font-bold">Previous</Button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const pageNum = currentPage <= 3 ? i + 1 : currentPage + i - 2;
              if (pageNum < 1 || pageNum > totalPages) return null;
              return <Button key={pageNum} variant={pageNum === currentPage ? 'default' : 'outline'} size="sm" onClick={() => setCurrentPage(pageNum)} className={`rounded-xl font-bold ${pageNum === currentPage ? 'bg-sky-500 text-white' : ''}`}>{pageNum}</Button>;
            })}
            <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)} className="rounded-xl font-bold">Next</Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-2xl font-bold">Edit Student</DialogTitle></DialogHeader>
          <form onSubmit={handleEditStudent} className="space-y-4">
            {renderFormFields()}
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowEditDialog(false)} className="rounded-xl">Cancel</Button>
              <Button data-testid="submit-student-btn" type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">Update Student</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Single Student Promote Dialog */}
      <Dialog open={showSinglePromoteDialog} onOpenChange={(open) => { setShowSinglePromoteDialog(open); if (!open) { setSinglePromoteStudent(null); setSinglePromoteToClass(''); setSinglePromotePreview(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-2xl font-bold">Promote Student</DialogTitle></DialogHeader>
          {singlePromoteStudent && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-3">
                <div><p className="text-xs font-bold uppercase text-slate-400">Name</p><p className="font-bold text-slate-900">{singlePromoteStudent.studentName}</p></div>
                <div><p className="text-xs font-bold uppercase text-slate-400">Current Class</p><p className="font-bold text-slate-900">Class {singlePromoteStudent.studentClass} - {singlePromoteStudent.section}</p></div>
              </div>
              <div>
                <Label>Promote To Class *</Label>
                <Select value={singlePromoteToClass} onValueChange={(v) => { setSinglePromoteToClass(v); setSinglePromotePreview(null); }}>
                  <SelectTrigger data-testid="single-promote-to-class" className="rounded-xl h-12"><SelectValue placeholder="Select target class" /></SelectTrigger>
                  <SelectContent>{classes.filter(c => c.className !== singlePromoteStudent.studentClass).map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {!singlePromotePreview ? (
                <div className="flex justify-end gap-3 pt-2">
                  <Button type="button" variant="outline" onClick={() => setShowSinglePromoteDialog(false)} className="rounded-xl">Cancel</Button>
                  <Button data-testid="single-load-preview-btn" disabled={!singlePromoteToClass} onClick={handleLoadSinglePreview} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">Preview</Button>
                </div>
              ) : (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="font-bold text-slate-700">Total Expected (last year):</span><span className="font-bold text-slate-900">{'\u20B9'}{singlePromotePreview.totalExpected.toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm"><span className="font-bold text-slate-700">Total Paid:</span><span className="font-bold text-emerald-600">{'\u20B9'}{singlePromotePreview.totalPaid.toLocaleString()}</span></div>
                    <div className="flex justify-between text-base"><span className="font-extrabold text-slate-800">Previous Year Due:</span><span className="font-extrabold text-rose-600">{'\u20B9'}{singlePromotePreview.totalDue.toLocaleString()}</span></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[1,2,3].map((n) => (
                      <div key={n} className="border border-slate-200 rounded-xl p-3 text-center">
                        <p className="text-xs font-bold uppercase text-slate-400">Term {n}</p>
                        <p className="text-xs text-slate-500 line-through">{'\u20B9'}{singlePromotePreview.oldFees[`term${n}`].toLocaleString()}</p>
                        <ArrowRight className="w-3 h-3 text-amber-500 inline" />
                        <p className="text-lg font-extrabold text-emerald-700">{'\u20B9'}{singlePromotePreview.newFees[`term${n}`].toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <Button type="button" variant="outline" onClick={() => setSinglePromotePreview(null)} className="rounded-xl">Back</Button>
                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={() => setShowSinglePromoteDialog(false)} className="rounded-xl">Cancel</Button>
                      <Button data-testid="confirm-single-promote-btn" onClick={handleConfirmSinglePromote} className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl">Confirm Promotion</Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Students;
