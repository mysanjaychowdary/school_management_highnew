import React, { useState, useEffect, useCallback } from 'react';
import { Search, DollarSign, Download, Receipt, Plus, Edit, Trash2, Eye } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, canEditFees, canRevertFees, canExport } from '../lib/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';

const Fees = () => {
  const { user, role } = useAuth();
  const showEdit = canEditFees(role);
  const showRevert = canRevertFees(role);
  const showExport = canExport(role);
  const [activeTab, setActiveTab] = useState('payment');
  const [classes, setClasses] = useState([]);
  const [studentCode, setStudentCode] = useState('');
  const [searchMode, setSearchMode] = useState('id'); // 'id' or 'name'
  const [nameQuery, setNameQuery] = useState('');
  const [nameResults, setNameResults] = useState([]);
  const [searchingName, setSearchingName] = useState(false);
  const [studentData, setStudentData] = useState(null);
  const [selectedFee, setSelectedFee] = useState(null);
  const [customPayAmount, setCustomPayAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [upiPreviewUrl, setUpiPreviewUrl] = useState(null);
  const [upiScreenshot, setUpiScreenshot] = useState(null);
  const [daySheetDate, setDaySheetDate] = useState(new Date().toISOString().split('T')[0]);
  const [daySheetData, setDaySheetData] = useState(null);
  const [exportFilters, setExportFilters] = useState({ startDate: '', endDate: '' });

  // Fee Types state
  const [feeTypes, setFeeTypes] = useState([]);
  const [showFeeTypeDialog, setShowFeeTypeDialog] = useState(false);
  const [editingFeeType, setEditingFeeType] = useState(null);
  const [feeTypeForm, setFeeTypeForm] = useState({ feeName: '', amount: '', applicableClass: '', applicableSection: '', noticeStartDate: '', dueDate: '' });

  // Fee Status state
  const [feeStatusClass, setFeeStatusClass] = useState('');
  const [feeStatusSection, setFeeStatusSection] = useState('');
  const [feeStatusData, setFeeStatusData] = useState(null);

  // Concession state
  const [concessions, setConcessions] = useState([]);
  const [conForm, setConForm] = useState({ studentCode: '', termNumber: '', feeTypeId: '', feeName: '', concessionAmount: '', letterUrl: '' });
  const [conMode, setConMode] = useState('single'); // 'single' or 'bulk'
  const [bulkConForm, setBulkConForm] = useState({ studentCodes: '', termNumber: '', feeTypeId: '', feeName: '', concessionAmount: '', letterUrl: '' });

  const loadClasses = useCallback(async () => {
    try { const r = await api.getClasses(); setClasses(r.data); } catch (e) { /* ignore */ }
  }, []);

  const loadFeeTypes = useCallback(async () => {
    try { const r = await api.getFeeTypes(); setFeeTypes(r.data); } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { loadClasses(); loadFeeTypes(); loadConcessions(); }, [loadClasses, loadFeeTypes]);

  const loadConcessions = async () => { try { const r = await api.getConcessions(); setConcessions(r.data); } catch (e) { /* ignore */ } };

  const getSections = (cls) => { const f = classes.find((c) => c.className === cls); return f ? f.sections : []; };

  const handleSearchStudent = async () => {
    if (!studentCode) { toast.error('Please enter Student ID'); return; }
    try {
      const response = await api.getStudentFees(studentCode);
      setStudentData(response.data);
      setSelectedFee(null);
    } catch (error) { toast.error('Student not found'); setStudentData(null); }
  };

  const handleSearchByName = async () => {
    if (!nameQuery || nameQuery.length < 2) { toast.error('Enter at least 2 characters'); return; }
    try {
      setSearchingName(true);
      const r = await api.getStudents({ search: nameQuery, limit: 20 });
      const list = Array.isArray(r.data) ? r.data : (r.data?.students || []);
      setNameResults(list);
      if (list.length === 0) toast.info('No students found');
    } catch (e) { toast.error('Search failed'); }
    finally { setSearchingName(false); }
  };

  const selectStudentFromResults = async (s) => {
    setStudentCode(s.studentCode || s.rollNo);
    setNameResults([]);
    try {
      const response = await api.getStudentFees(s.studentCode || s.rollNo);
      setStudentData(response.data);
      setSelectedFee(null);
    } catch (error) { toast.error('Failed to load student fees'); }
  };

  const handleUpiUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try { const r = await api.uploadFile(file); setUpiScreenshot(r.data.url); toast.success('Screenshot uploaded'); }
    catch (error) { toast.error('Failed to upload screenshot'); }
  };

  const handlePayment = async () => {
    if (!selectedFee) return;
    if (paymentMode === 'upi' && !upiScreenshot) { toast.error('Please upload UPI screenshot'); return; }
    const payAmount = parseFloat(customPayAmount) || selectedFee.amount;
    if (payAmount <= 0) { toast.error('Enter valid amount'); return; }
    try {
      const payload = {
        studentId: studentData.student.id,
        studentCode: studentData.student.studentCode,
        rollNo: studentData.student.rollNo,
        studentName: studentData.student.studentName,
        amount: payAmount,
        paymentMode,
        upiScreenshot: paymentMode === 'upi' ? upiScreenshot : null,
        collectedBy: user?.name || user?.username || 'Admin',
      };
      if (selectedFee.type === 'term') { payload.termNumber = selectedFee.number; }
      else { payload.feeTypeId = selectedFee.id; payload.feeName = selectedFee.label; }

      await api.createFeePayment(payload);
      toast.success('Payment recorded. Receipt sent via WhatsApp');
      setUpiScreenshot(null); setPaymentMode('cash'); setSelectedFee(null); setCustomPayAmount('');
      handleSearchStudent();
    } catch (error) { toast.error('Failed to record payment'); }
  };

  const handleLoadDaySheet = async () => {
    try { const r = await api.getDaySheet(daySheetDate); setDaySheetData(r.data); }
    catch (error) { toast.error('Failed to load day sheet'); }
  };

  const handleExportFees = async (format) => {
    if (!exportFilters.startDate || !exportFilters.endDate) { toast.error('Please select date range'); return; }
    try {
      const response = await api.exportFees({ ...exportFilters, format });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `fees_report.${format}`);
      document.body.appendChild(link); link.click(); link.remove();
    } catch (error) { toast.error('Failed to export'); }
  };

  const getTermPaid = (n) => studentData?.paidTerms?.[`term${n}`] || 0;

  const isTermPaid = (termNumber) => {
    if (!studentData) return false;
    const expected = studentData.student[`feeTerm${termNumber}`];
    return getTermPaid(termNumber) >= expected;
  };

  const getCustomPaid = (feeId) => studentData?.paidCustomFees?.[feeId] || 0;

  const isCustomFeePaid = (feeId, amount) => {
    if (!studentData) return false;
    return getCustomPaid(feeId) >= amount;
  };

  // Fee Types CRUD
  const resetFeeTypeForm = () => { setFeeTypeForm({ feeName: '', amount: '', applicableClass: '', applicableSection: '', noticeStartDate: '', dueDate: '' }); setEditingFeeType(null); };

  const handleFeeTypeSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...feeTypeForm, amount: parseFloat(feeTypeForm.amount) };
      if (editingFeeType) {
        await api.updateFeeType(editingFeeType.id, data);
        toast.success('Fee type updated');
      } else {
        await api.createFeeType(data);
        toast.success('Fee type added');
      }
      setShowFeeTypeDialog(false); resetFeeTypeForm(); loadFeeTypes();
    } catch (error) { toast.error('Failed to save fee type'); }
  };

  const openEditFeeType = (ft) => {
    setEditingFeeType(ft);
    setFeeTypeForm({ feeName: ft.feeName, amount: ft.amount, applicableClass: ft.applicableClass || '', applicableSection: ft.applicableSection || '', noticeStartDate: ft.noticeStartDate || '', dueDate: ft.dueDate || '' });
    setShowFeeTypeDialog(true);
  };

  const handleDeleteFeeType = async (id) => {
    if (!window.confirm('Delete this fee type?')) return;
    try { await api.deleteFeeType(id); toast.success('Fee type deleted'); loadFeeTypes(); }
    catch (error) { toast.error('Failed to delete'); }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Fee Management</h1>
        <p className="text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>Manage student fee payments and custom fee types</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl inline-flex">
          <TabsTrigger data-testid="payment-tab" value="payment" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 font-bold"><DollarSign className="w-4 h-4 mr-2" />Collect Payment</TabsTrigger>
          <TabsTrigger data-testid="fee-types-tab" value="feetypes" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 font-bold"><Plus className="w-4 h-4 mr-2" />Fee Types</TabsTrigger>
          <TabsTrigger data-testid="daysheet-tab" value="daysheet" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 font-bold"><Receipt className="w-4 h-4 mr-2" />Day Sheet</TabsTrigger>
          <TabsTrigger data-testid="fee-status-tab" value="feestatus" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 font-bold"><Search className="w-4 h-4 mr-2" />Fee Status</TabsTrigger>
          <TabsTrigger data-testid="concession-tab" value="concession" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 font-bold"><DollarSign className="w-4 h-4 mr-2" />Concessions</TabsTrigger>
        </TabsList>

        {/* Collect Payment */}
        <TabsContent value="payment" className="space-y-6">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-slate-800">Search Student</h2>
              <div className="inline-flex bg-slate-100 rounded-xl p-1">
                <button data-testid="search-by-id-btn" onClick={() => setSearchMode('id')} className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-colors ${searchMode === 'id' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>By ID</button>
                <button data-testid="search-by-name-btn" onClick={() => setSearchMode('name')} className={`px-4 py-1.5 rounded-lg font-bold text-sm transition-colors ${searchMode === 'name' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>By Name</button>
              </div>
            </div>
            {searchMode === 'id' ? (
              <div className="flex gap-4">
                <div className="flex-1"><Label>Student ID *</Label><Input data-testid="fee-studentcode-input" value={studentCode} onChange={(e) => setStudentCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearchStudent(); }} className="rounded-xl h-12" placeholder="Enter Student ID (e.g., ADM001)" /></div>
                <div className="flex items-end"><Button data-testid="search-student-btn" onClick={handleSearchStudent} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl h-12 active:scale-95 transition-transform"><Search className="w-5 h-5 mr-2" />Search</Button></div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-4">
                  <div className="flex-1"><Label>Search by Name or Roll *</Label><Input data-testid="fee-name-search-input" value={nameQuery} onChange={(e) => setNameQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSearchByName(); }} className="rounded-xl h-12" placeholder="Type student name or roll no" /></div>
                  <div className="flex items-end"><Button data-testid="search-by-name-go-btn" onClick={handleSearchByName} disabled={searchingName} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl h-12 active:scale-95 transition-transform"><Search className="w-5 h-5 mr-2" />{searchingName ? 'Searching...' : 'Search'}</Button></div>
                </div>
                {nameResults.length > 0 && (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                    {nameResults.map((s) => (
                      <button key={s.id} data-testid={`fee-name-result-${s.id}`} onClick={() => selectStudentFromResults(s)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-sky-50 transition-colors">
                        <div>
                          <p className="font-bold text-slate-900">{s.studentName}</p>
                          <p className="text-xs text-slate-500">Roll: {s.rollNo} | Class {s.studentClass}-{s.section} | ID: {s.studentCode || s.rollNo}</p>
                        </div>
                        <span className="text-sky-600 font-bold text-xs">Select &rarr;</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {studentData && (
            <>
              <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                <h2 className="text-xl font-bold text-slate-800 mb-4">Student Information</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Name</p><p className="text-lg font-bold text-slate-900">{studentData.student.studentName}</p></div>
                  <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Roll No</p><p className="text-lg font-bold text-slate-900">{studentData.student.rollNo}</p></div>
                  <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Class</p><p className="text-lg font-bold text-slate-900">{studentData.student.studentClass} - {studentData.student.section}</p></div>
                  <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Mobile</p><p className="text-lg font-bold text-slate-900">{studentData.student.mobile}</p></div>
                </div>
              </div>

              {/* Previous Year Due Banner */}
              {studentData.student.previousYearDues?.amount > 0 && (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Previous Year Due</p>
                      <p className="text-2xl font-extrabold text-amber-900 mt-1">{'\u20B9'}{(studentData.student.previousYearDues.amount || 0).toLocaleString()}</p>
                      <p className="text-xs text-amber-700 mt-1">From Class {studentData.student.previousYearDues.fromClass} - included in Term 1</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Term Fees */}
              <h3 className="text-lg font-bold text-slate-800">Term Fees</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((termNum) => {
                  const termAmount = studentData.student[`feeTerm${termNum}`];
                  const paid = isTermPaid(termNum);
                  const paidAmt = getTermPaid(termNum);
                  const pendingAmt = termAmount - paidAmt;
                  const isPrevDue = termNum === 1 && (studentData.student.previousYearDues?.amount || 0) > 0;
                  return (
                    <div key={termNum} data-testid={`term-${termNum}-card`} className={`bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border p-6 ${paid ? 'border-emerald-300 bg-emerald-50/30' : paidAmt > 0 ? 'border-amber-300 bg-amber-50/20' : 'border-slate-100'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900">Term {termNum}</h3>
                          {isPrevDue && <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">Includes Previous Year Due</span>}
                        </div>
                        {paid ? <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white">PAID</span>
                          : paidAmt > 0 ? <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white">PARTIAL</span> : null}
                      </div>
                      <p className="text-2xl font-extrabold text-slate-900">{'\u20B9'}{termAmount?.toLocaleString()}</p>
                      {paidAmt > 0 && <p className="text-sm font-bold text-emerald-600 mt-1">Paid: {'\u20B9'}{paidAmt.toLocaleString()}</p>}
                      {!paid && pendingAmt > 0 && <p className="text-sm font-bold text-rose-600">Pending: {'\u20B9'}{pendingAmt.toLocaleString()}</p>}
                      {!paid && <Button data-testid={`pay-term-${termNum}-btn`} onClick={() => { setSelectedFee({ type: 'term', number: termNum, amount: pendingAmt, totalAmount: termAmount, label: `Term ${termNum}` }); setCustomPayAmount(String(pendingAmt)); }} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform mt-3">Pay Now</Button>}
                    </div>
                  );
                })}
              </div>

              {/* Custom Fees */}
              {studentData.customFees?.length > 0 && (
                <>
                  <h3 className="text-lg font-bold text-slate-800">Custom Fees</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {studentData.customFees.map((cf) => {
                      const paid = isCustomFeePaid(cf.id, cf.amount);
                      const paidAmt = getCustomPaid(cf.id);
                      const pendingAmt = cf.amount - paidAmt;
                      return (
                        <div key={cf.id} data-testid={`custom-fee-${cf.id}`} className={`bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border p-6 ${paid ? 'border-emerald-300 bg-emerald-50/30' : paidAmt > 0 ? 'border-amber-300 bg-amber-50/20' : 'border-slate-100'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-lg font-bold text-slate-900">{cf.feeName}</h3>
                            {paid ? <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500 text-white">PAID</span>
                              : paidAmt > 0 ? <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500 text-white">PARTIAL</span> : null}
                          </div>
                          {cf.dueDate && <p className="text-sm text-rose-600 font-medium mb-1">Due: {cf.dueDate}</p>}
                          <p className="text-2xl font-extrabold text-slate-900">{'\u20B9'}{cf.amount?.toLocaleString()}</p>
                          {paidAmt > 0 && <p className="text-sm font-bold text-emerald-600 mt-1">Paid: {'\u20B9'}{paidAmt.toLocaleString()}</p>}
                          {!paid && pendingAmt > 0 && <p className="text-sm font-bold text-rose-600">Pending: {'\u20B9'}{pendingAmt.toLocaleString()}</p>}
                          {!paid && <Button onClick={() => { setSelectedFee({ type: 'custom', id: cf.id, amount: pendingAmt, totalAmount: cf.amount, label: cf.feeName }); setCustomPayAmount(String(pendingAmt)); }} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform mt-3">Pay Now</Button>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Transaction History */}
              {studentData.payments && studentData.payments.length > 0 && (
                <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                  <h2 className="text-xl font-bold text-slate-800 mb-4">Transaction History</h2>
                  <div className="space-y-3">
                    {studentData.payments.slice().reverse().map((p) => (
                      <div key={p.id} className={`p-4 rounded-xl ${p.status === 'reverted' ? 'bg-rose-50 opacity-60' : 'bg-slate-50'}`}>
                        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900">{p.receiptNumber}</span>
                            <span className="text-sm text-slate-600">{p.termNumber ? `Term ${p.termNumber}` : (p.feeName || 'Custom')}</span>
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${p.paymentMode === 'upi' ? 'bg-sky-100 text-sky-700' : p.paymentMode === 'concession' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.paymentMode.toUpperCase()}</span>
                            {p.status === 'reverted' && <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">REVERTED</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-lg ${p.status === 'reverted' ? 'text-slate-400 line-through' : 'text-emerald-600'}`}>{'\u20B9'}{p.amount.toLocaleString()}</span>
                            {p.paymentMode === 'upi' && p.upiScreenshot && (
                              <button onClick={() => setUpiPreviewUrl(p.upiScreenshot)} data-testid={`view-upi-${p.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-xl font-bold text-xs transition-colors">
                                <Eye className="w-3 h-3" />UPI
                              </button>
                            )}
                            {p.status !== 'reverted' && p.paymentMode !== 'concession' && (
                              <a href={api.getInvoiceUrl(p.id)} target="_blank" rel="noopener noreferrer" data-testid={`download-invoice-${p.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-xl font-bold text-xs transition-colors">
                                <Download className="w-3 h-3" />Invoice
                              </a>
                            )}
                            {p.status !== 'reverted' && p.paymentMode !== 'concession' && showEdit && (
                              <button onClick={async () => { if (!window.confirm('Revert this payment?')) return; try { await api.revertPayment(p.id); toast.success('Payment reverted'); handleSearchStudent(); } catch (e) { toast.error('Failed to revert'); } }} data-testid={`revert-${p.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 rounded-xl font-bold text-xs transition-colors">Revert</button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-slate-500">{typeof p.paymentDate === 'string' ? p.paymentDate.slice(0, 10) : ''}{p.collectedBy ? ` | By: ${p.collectedBy}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payment Dialog */}
              <Dialog open={!!selectedFee} onOpenChange={(open) => { if (!open) { setSelectedFee(null); setCustomPayAmount(''); } }}>
                <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle className="text-2xl font-bold">Payment for: {selectedFee?.label}</DialogTitle></DialogHeader>
                  {selectedFee && (
                  <div className="space-y-4">
                    <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 gap-4">
                      <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Fee</p><p className="text-lg font-extrabold text-slate-900">{'\u20B9'}{selectedFee.totalAmount?.toLocaleString()}</p></div>
                      <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Pending Amount</p><p className="text-lg font-extrabold text-rose-600">{'\u20B9'}{selectedFee.amount?.toLocaleString()}</p></div>
                    </div>
                    <div>
                      <Label className="text-base font-bold">Payment Amount *</Label>
                      <Input data-testid="custom-pay-amount" type="number" value={customPayAmount} onChange={(e) => { const val = parseFloat(e.target.value); if (val > selectedFee.amount) { toast.error('Amount cannot exceed pending amount'); return; } setCustomPayAmount(e.target.value); }} className="rounded-xl h-12 mt-2 text-lg font-bold" placeholder="Enter amount to pay" min="1" max={selectedFee.amount} />
                      <p className="text-xs text-slate-500 mt-1">Max: {'\u20B9'}{selectedFee.amount?.toLocaleString()}</p>
                    </div>
                    <div>
                      <Label>Payment Mode *</Label>
                      <RadioGroup value={paymentMode} onValueChange={setPaymentMode} className="flex gap-4 mt-2">
                        <div className="flex items-center space-x-2"><RadioGroupItem value="cash" id="cash" data-testid="payment-mode-cash" /><Label htmlFor="cash" className="cursor-pointer font-bold">Cash</Label></div>
                        <div className="flex items-center space-x-2"><RadioGroupItem value="upi" id="upi" data-testid="payment-mode-upi" /><Label htmlFor="upi" className="cursor-pointer font-bold">UPI</Label></div>
                      </RadioGroup>
                    </div>
                    {paymentMode === 'upi' && (
                      <div>
                        <Label>Upload UPI Screenshot *</Label>
                        <input type="file" accept="image/*" onChange={handleUpiUpload} data-testid="upi-screenshot-input" className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-sky-100 file:text-sky-700 hover:file:bg-sky-200" />
                        {upiScreenshot && <img src={upiScreenshot} alt="UPI" className="mt-4 max-w-xs rounded-xl border border-slate-200" />}
                      </div>
                    )}
                    <div className="flex justify-end gap-3 pt-2">
                      <Button variant="outline" onClick={() => { setSelectedFee(null); setCustomPayAmount(''); }} className="rounded-xl">Cancel</Button>
                      <Button data-testid="confirm-payment-btn" onClick={handlePayment} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform">Confirm ({'\u20B9'}{(parseFloat(customPayAmount) || 0).toLocaleString()})</Button>
                    </div>
                  </div>
                  )}
                </DialogContent>
              </Dialog>

              {/* UPI Screenshot Preview Dialog */}
              <Dialog open={!!upiPreviewUrl} onOpenChange={(open) => { if (!open) setUpiPreviewUrl(null); }}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle className="text-xl font-bold">UPI Payment Screenshot</DialogTitle></DialogHeader>
                  {upiPreviewUrl && <img src={upiPreviewUrl} alt="UPI Screenshot" className="w-full rounded-xl border border-slate-200" />}
                </DialogContent>
              </Dialog>
            </>
          )}
        </TabsContent>

        {/* Fee Types Management */}
        <TabsContent value="feetypes" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-800">Custom Fee Types</h2>
            <div className="flex gap-3">
              <Button data-testid="send-reminders-btn" onClick={async () => { try { const r = await api.sendFeeReminders(); toast.success(r.data.message); } catch (e) { toast.error('Failed to send reminders'); } }} variant="outline" className="font-bold rounded-xl bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200">Send Due Reminders</Button>
              <Dialog open={showFeeTypeDialog} onOpenChange={(open) => { setShowFeeTypeDialog(open); if (!open) resetFeeTypeForm(); }}>
              <DialogTrigger asChild>
                <Button data-testid="add-fee-type-btn" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform"><Plus className="w-5 h-5 mr-2" />Add Fee Type</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle className="text-2xl font-bold">{editingFeeType ? 'Edit Fee Type' : 'Add Fee Type'}</DialogTitle></DialogHeader>
                <form onSubmit={handleFeeTypeSubmit} className="space-y-4">
                  <div><Label>Fee Name *</Label><Input data-testid="fee-type-name" required value={feeTypeForm.feeName} onChange={(e) => setFeeTypeForm({ ...feeTypeForm, feeName: e.target.value })} className="rounded-xl h-12" placeholder="e.g., Lab Fee, Sports Fee" /></div>
                  <div><Label>Amount *</Label><Input data-testid="fee-type-amount" type="number" required value={feeTypeForm.amount} onChange={(e) => setFeeTypeForm({ ...feeTypeForm, amount: e.target.value })} className="rounded-xl h-12" placeholder="0.00" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Applicable Class (optional)</Label>
                      <Select value={feeTypeForm.applicableClass || '_all'} onValueChange={(v) => setFeeTypeForm({ ...feeTypeForm, applicableClass: v === '_all' ? '' : v, applicableSection: '' })}>
                        <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All Classes" /></SelectTrigger>
                        <SelectContent><SelectItem value="_all">All Classes</SelectItem>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Applicable Section (optional)</Label>
                      <Select value={feeTypeForm.applicableSection || '_all'} onValueChange={(v) => setFeeTypeForm({ ...feeTypeForm, applicableSection: v === '_all' ? '' : v })}>
                        <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="All Sections" /></SelectTrigger>
                        <SelectContent><SelectItem value="_all">All Sections</SelectItem>{getSections(feeTypeForm.applicableClass).map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Notice Start Date</Label><Input type="date" value={feeTypeForm.noticeStartDate} onChange={(e) => setFeeTypeForm({ ...feeTypeForm, noticeStartDate: e.target.value })} className="rounded-xl h-12" /></div>
                    <div><Label>Due Date</Label><Input type="date" value={feeTypeForm.dueDate} onChange={(e) => setFeeTypeForm({ ...feeTypeForm, dueDate: e.target.value })} className="rounded-xl h-12" /></div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => { setShowFeeTypeDialog(false); resetFeeTypeForm(); }} className="rounded-xl">Cancel</Button>
                    <Button data-testid="submit-fee-type-btn" type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">{editingFeeType ? 'Update' : 'Add'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {feeTypes.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 flex flex-col items-center justify-center h-48">
              <p className="text-slate-400 font-medium">No custom fee types yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {feeTypes.map((ft) => (
                <div key={ft.id} data-testid={`fee-type-card-${ft.id}`} className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-slate-100 p-6 transition-all duration-300 hover:-translate-y-0.5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-bold text-slate-900">{ft.feeName}</h3>
                    <div className="flex gap-1">
                      {showEdit && <>
                        <button onClick={() => openEditFeeType(ft)} data-testid={`edit-fee-type-${ft.id}`} className="p-2 hover:bg-sky-100 rounded-lg transition-colors"><Edit className="w-4 h-4 text-sky-600" /></button>
                        <button onClick={() => handleDeleteFeeType(ft.id)} data-testid={`delete-fee-type-${ft.id}`} className="p-2 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-rose-600" /></button>
                      </>}
                    </div>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-900 mb-3">{'\u20B9'}{ft.amount?.toLocaleString()}</p>
                  <div className="space-y-1 text-sm text-slate-600">
                    <p>Class: <span className="font-bold text-slate-800">{ft.applicableClass || 'All'}</span></p>
                    <p>Section: <span className="font-bold text-slate-800">{ft.applicableSection || 'All'}</span></p>
                    {ft.noticeStartDate && <p>Notice: <span className="font-medium">{ft.noticeStartDate}</span></p>}
                    {ft.dueDate && <p className="text-rose-600 font-bold">Due: {ft.dueDate}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Day Sheet */}
        <TabsContent value="daysheet" className="space-y-6">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Select Date</h2>
            <div className="flex gap-4">
              <div className="flex-1"><Label>Date *</Label><Input type="date" value={daySheetDate} onChange={(e) => setDaySheetDate(e.target.value)} className="rounded-xl h-12" /></div>
              <div className="flex items-end"><Button data-testid="load-daysheet-btn" onClick={handleLoadDaySheet} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl h-12 active:scale-95 transition-transform">Load Day Sheet</Button></div>
            </div>
          </div>

          {daySheetData && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Total Collection</p>
                  <p className="text-3xl font-extrabold text-slate-900 mt-2">{'\u20B9'}{daySheetData.total.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-400">UPI Payments</p>
                  <p className="text-3xl font-extrabold text-sky-600 mt-2">{'\u20B9'}{daySheetData.upiTotal.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Cash Payments</p>
                  <p className="text-3xl font-extrabold text-emerald-600 mt-2">{'\u20B9'}{daySheetData.cashTotal.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-400">Transactions</p>
                  <p className="text-3xl font-extrabold text-amber-600 mt-2">{daySheetData.count}</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                <h2 className="text-xl font-bold text-slate-800 mb-4">Payment Details</h2>
                <div className="space-y-2">
                  {daySheetData.payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <div className="flex-1 grid grid-cols-5 gap-4">
                        <p className="font-bold text-slate-900">{p.rollNo}</p>
                        <p className="font-medium text-slate-700">{p.studentName}</p>
                        <p className="text-slate-600">{p.termNumber ? `Term ${p.termNumber}` : p.feeName || 'Custom'}</p>
                        <p className="font-bold text-emerald-600">{'\u20B9'}{p.amount.toLocaleString()}</p>
                        <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${p.paymentMode === 'upi' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.paymentMode.toUpperCase()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {showExport && <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
                <h2 className="text-xl font-bold text-slate-800 mb-4">Export Fees</h2>
                <div className="flex gap-4 items-end">
                  <div className="flex-1"><Label>Start Date *</Label><Input type="date" value={exportFilters.startDate} onChange={(e) => setExportFilters({ ...exportFilters, startDate: e.target.value })} className="rounded-xl h-12" /></div>
                  <div className="flex-1"><Label>End Date *</Label><Input type="date" value={exportFilters.endDate} onChange={(e) => setExportFilters({ ...exportFilters, endDate: e.target.value })} className="rounded-xl h-12" /></div>
                  <Button data-testid="fees-export-csv" onClick={() => handleExportFees('csv')} variant="outline" className="font-bold rounded-xl h-12"><Download className="w-4 h-4 mr-2" />CSV</Button>
                  <Button data-testid="fees-export-xlsx" onClick={() => handleExportFees('xlsx')} variant="outline" className="font-bold rounded-xl h-12"><Download className="w-4 h-4 mr-2" />Excel</Button>
                </div>
              </div>}
            </>
          )}
        </TabsContent>

        {/* Fee Status */}
        <TabsContent value="feestatus" className="space-y-6">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Select Class & Section</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><Label>Class *</Label>
                <Select value={feeStatusClass} onValueChange={(v) => { setFeeStatusClass(v); setFeeStatusSection(''); }}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Select Class" /></SelectTrigger>
                  <SelectContent>{classes.map((c) => <SelectItem key={c.className} value={c.className}>Class {c.className}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Section *</Label>
                <Select value={feeStatusSection} onValueChange={setFeeStatusSection}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Select Section" /></SelectTrigger>
                  <SelectContent>{getSections(feeStatusClass).map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button data-testid="load-fee-status-btn" onClick={async () => {
                  if (!feeStatusClass || !feeStatusSection) { toast.error('Select class & section'); return; }
                  try { const r = await api.getFeeStatus({ studentClass: feeStatusClass, section: feeStatusSection }); setFeeStatusData(r.data); }
                  catch (e) { toast.error('Failed to load'); }
                }} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl h-12 active:scale-95 transition-transform">Load</Button>
                {showExport && <Button data-testid="fee-status-export" variant="outline" className="font-bold rounded-xl h-12" onClick={async () => {
                  if (!feeStatusClass || !feeStatusSection) { toast.error('Select class & section'); return; }
                  try {
                    const r = await api.exportFeeStatus({ studentClass: feeStatusClass, section: feeStatusSection, format: 'xlsx' });
                    const url = window.URL.createObjectURL(new Blob([r.data]));
                    const link = document.createElement('a'); link.href = url; link.setAttribute('download', `fee_status_${feeStatusClass}_${feeStatusSection}.xlsx`);
                    document.body.appendChild(link); link.click(); link.remove();
                  } catch (e) { toast.error('Export failed'); }
                }}><Download className="w-4 h-4 mr-2" />Export</Button>}
              </div>
            </div>
          </div>

          {feeStatusData && (
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6 overflow-x-auto">
              <h2 className="text-xl font-bold text-slate-800 mb-4">Fee Status - Class {feeStatusClass}-{feeStatusSection}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left font-bold uppercase text-xs text-slate-600">Roll</th>
                    <th className="px-3 py-2 text-left font-bold uppercase text-xs text-slate-600">Name</th>
                    <th className="px-3 py-2 text-center font-bold uppercase text-xs text-slate-600">Term 1</th>
                    <th className="px-3 py-2 text-center font-bold uppercase text-xs text-slate-600">Term 2</th>
                    <th className="px-3 py-2 text-center font-bold uppercase text-xs text-slate-600">Term 3</th>
                    {feeStatusData.customFeeNames.map((cn) => <th key={cn} className="px-3 py-2 text-center font-bold uppercase text-xs text-slate-600">{cn}</th>)}
                    <th className="px-3 py-2 text-center font-bold uppercase text-xs text-slate-600">Total</th>
                    <th className="px-3 py-2 text-center font-bold uppercase text-xs text-slate-600">Paid</th>
                    <th className="px-3 py-2 text-center font-bold uppercase text-xs text-slate-600">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {feeStatusData.students.map((s) => (
                    <tr key={s.rollNo} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-3 py-2 font-semibold">{s.rollNo}</td>
                      <td className="px-3 py-2 font-medium">{s.studentName}</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${s.term1Paid >= s.term1Total ? 'bg-emerald-100 text-emerald-700' : s.term1Paid > 0 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {'\u20B9'}{s.term1Paid}/{s.term1Total}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${s.term2Paid >= s.term2Total ? 'bg-emerald-100 text-emerald-700' : s.term2Paid > 0 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {'\u20B9'}{s.term2Paid}/{s.term2Total}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${s.term3Paid >= s.term3Total ? 'bg-emerald-100 text-emerald-700' : s.term3Paid > 0 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                          {'\u20B9'}{s.term3Paid}/{s.term3Total}
                        </span>
                      </td>
                      {s.customFees.map((cf, i) => (
                        <td key={i} className="px-3 py-2 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${cf.paid >= cf.total ? 'bg-emerald-100 text-emerald-700' : cf.paid > 0 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                            {'\u20B9'}{cf.paid}/{cf.total}
                          </span>
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-bold">{'\u20B9'}{s.totalExpected.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center font-bold text-emerald-600">{'\u20B9'}{s.totalPaid.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center font-bold text-rose-600">{'\u20B9'}{s.totalPending.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Concessions Tab */}
        <TabsContent value="concession" className="space-y-6">
          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button data-testid="con-mode-single" onClick={() => setConMode('single')} variant={conMode === 'single' ? 'default' : 'outline'} className={`rounded-xl font-bold ${conMode === 'single' ? 'bg-sky-500 hover:bg-sky-600 text-white' : ''}`}>Single Concession</Button>
            <Button data-testid="con-mode-bulk" onClick={() => setConMode('bulk')} variant={conMode === 'bulk' ? 'default' : 'outline'} className={`rounded-xl font-bold ${conMode === 'bulk' ? 'bg-sky-500 hover:bg-sky-600 text-white' : ''}`}>Bulk Concession</Button>
          </div>

          {/* Single Request Concession */}
          {conMode === 'single' && (
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Request Concession</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const data = { ...conForm, concessionAmount: parseFloat(conForm.concessionAmount), requestedBy: user?.name || user?.username || 'Staff' };
                if (conForm.termNumber) { data.termNumber = parseInt(conForm.termNumber); data.feeTypeId = null; data.feeName = null; }
                else if (conForm.feeTypeId) { data.termNumber = null; const ft = feeTypes.find(f => f.id === conForm.feeTypeId); data.feeName = ft?.feeName || ''; }
                await api.createConcession(data);
                toast.success('Concession request submitted');
                setConForm({ studentCode: '', termNumber: '', feeTypeId: '', feeName: '', concessionAmount: '', letterUrl: '' });
                loadConcessions();
              } catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
            }} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div><Label>Student ID *</Label><Input data-testid="con-student-code" required value={conForm.studentCode} onChange={(e) => setConForm({ ...conForm, studentCode: e.target.value })} className="rounded-xl h-12" placeholder="e.g., ADM001" /></div>
                <div><Label>Term (or leave blank for custom fee)</Label>
                  <Select value={conForm.termNumber || '_none'} onValueChange={(v) => setConForm({ ...conForm, termNumber: v === '_none' ? '' : v, feeTypeId: '' })}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Select Term" /></SelectTrigger>
                    <SelectContent><SelectItem value="_none">-- Custom Fee --</SelectItem><SelectItem value="1">Term 1</SelectItem><SelectItem value="2">Term 2</SelectItem><SelectItem value="3">Term 3</SelectItem></SelectContent>
                  </Select>
                </div>
                {!conForm.termNumber && (
                  <div><Label>Custom Fee Type</Label>
                    <Select value={conForm.feeTypeId || '_none'} onValueChange={(v) => setConForm({ ...conForm, feeTypeId: v === '_none' ? '' : v })}>
                      <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Select Fee" /></SelectTrigger>
                      <SelectContent><SelectItem value="_none">-- Select --</SelectItem>{feeTypes.map(ft => <SelectItem key={ft.id} value={ft.id}>{ft.feeName}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Concession Amount *</Label><Input data-testid="con-amount" type="number" required value={conForm.concessionAmount} onChange={(e) => setConForm({ ...conForm, concessionAmount: e.target.value })} className="rounded-xl h-12" placeholder="Amount" /></div>
              </div>
              <div><Label>Upload Letter (Optional)</Label>
                <input type="file" accept="image/*,application/pdf" onChange={async (e) => {
                  const file = e.target.files[0]; if (!file) return;
                  try { const r = await api.uploadFile(file); setConForm({ ...conForm, letterUrl: r.data.url }); toast.success('Uploaded'); } catch (err) { toast.error('Failed'); }
                }} className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-sky-100 file:text-sky-700" />
                {conForm.letterUrl && <p className="text-sm text-emerald-600 font-medium mt-1">Letter uploaded</p>}
              </div>
              <div className="flex justify-end"><Button data-testid="submit-con-btn" type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95">Submit Request</Button></div>
            </form>
          </div>
          )}

          {/* Bulk Concession */}
          {conMode === 'bulk' && (
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Bulk Concession Request</h2>
            <p className="text-sm text-slate-500 mb-4">Enter multiple Student IDs separated by comma or new line. Same concession will be applied to all.</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const codes = bulkConForm.studentCodes.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
                if (codes.length === 0) { toast.error('Enter at least one Student ID'); return; }
                const data = {
                  studentCodes: codes,
                  concessionAmount: parseFloat(bulkConForm.concessionAmount),
                  letterUrl: bulkConForm.letterUrl || null,
                  requestedBy: user?.name || user?.username || 'Staff',
                };
                if (bulkConForm.termNumber) { data.termNumber = parseInt(bulkConForm.termNumber); data.feeTypeId = null; data.feeName = null; }
                else if (bulkConForm.feeTypeId) { data.termNumber = null; data.feeTypeId = bulkConForm.feeTypeId; const ft = feeTypes.find(f => f.id === bulkConForm.feeTypeId); data.feeName = ft?.feeName || ''; }
                const r = await api.createBulkConcession(data);
                toast.success(`Created ${r.data.created} concessions${r.data.errors?.length ? `, ${r.data.errors.length} errors` : ''}`);
                if (r.data.errors?.length) { r.data.errors.forEach(er => toast.error(er)); }
                setBulkConForm({ studentCodes: '', termNumber: '', feeTypeId: '', feeName: '', concessionAmount: '', letterUrl: '' });
                loadConcessions();
              } catch (error) { toast.error(error.response?.data?.detail || 'Failed'); }
            }} className="space-y-4">
              <div>
                <Label>Student IDs * (comma or newline separated)</Label>
                <textarea data-testid="bulk-con-codes" required value={bulkConForm.studentCodes} onChange={(e) => setBulkConForm({ ...bulkConForm, studentCodes: e.target.value })} className="w-full rounded-xl border border-slate-200 p-3 mt-1 text-sm" rows={4} placeholder="ADM001, ADM002, ADM003&#10;or one per line" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div><Label>Term (or blank for custom fee)</Label>
                  <Select value={bulkConForm.termNumber || '_none'} onValueChange={(v) => setBulkConForm({ ...bulkConForm, termNumber: v === '_none' ? '' : v, feeTypeId: '' })}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Select Term" /></SelectTrigger>
                    <SelectContent><SelectItem value="_none">-- Custom Fee --</SelectItem><SelectItem value="1">Term 1</SelectItem><SelectItem value="2">Term 2</SelectItem><SelectItem value="3">Term 3</SelectItem></SelectContent>
                  </Select>
                </div>
                {!bulkConForm.termNumber && (
                  <div><Label>Custom Fee Type</Label>
                    <Select value={bulkConForm.feeTypeId || '_none'} onValueChange={(v) => setBulkConForm({ ...bulkConForm, feeTypeId: v === '_none' ? '' : v })}>
                      <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Select Fee" /></SelectTrigger>
                      <SelectContent><SelectItem value="_none">-- Select --</SelectItem>{feeTypes.map(ft => <SelectItem key={ft.id} value={ft.id}>{ft.feeName}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Concession Amount (each) *</Label><Input data-testid="bulk-con-amount" type="number" required value={bulkConForm.concessionAmount} onChange={(e) => setBulkConForm({ ...bulkConForm, concessionAmount: e.target.value })} className="rounded-xl h-12" placeholder="Amount" /></div>
              </div>
              <div><Label>Upload Letter (Optional)</Label>
                <input type="file" accept="image/*,application/pdf" onChange={async (e) => {
                  const file = e.target.files[0]; if (!file) return;
                  try { const r = await api.uploadFile(file); setBulkConForm({ ...bulkConForm, letterUrl: r.data.url }); toast.success('Uploaded'); } catch (err) { toast.error('Failed'); }
                }} className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-sky-100 file:text-sky-700" />
                {bulkConForm.letterUrl && <p className="text-sm text-emerald-600 font-medium mt-1">Letter uploaded</p>}
              </div>
              <div className="flex justify-end"><Button data-testid="submit-bulk-con-btn" type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95">Submit Bulk Request</Button></div>
            </form>
          </div>
          )}

          {/* Concession List - last 4 only */}
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4">Recent Concession Requests (Last 4)</h2>
            {concessions.length === 0 ? <p className="text-slate-400 text-center py-8">No concession requests</p> : (
              <div className="space-y-3">
                {concessions.slice().reverse().slice(0, 4).map((c) => (
                  <div key={c.id} className={`p-4 rounded-xl border ${c.status === 'approved' ? 'border-emerald-200 bg-emerald-50/30' : c.status === 'rejected' ? 'border-rose-200 bg-rose-50/30' : 'border-amber-200 bg-amber-50/30'}`}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900">{c.studentCode} - {c.studentName}</p>
                        <p className="text-sm text-slate-600">{c.termNumber ? `Term ${c.termNumber}` : (c.feeName || 'Custom')} | Amount: {'\u20B9'}{c.concessionAmount.toLocaleString()}</p>
                        <p className="text-xs text-slate-500">Requested by: {c.requestedBy}</p>
                        {c.letterUrl && <a href={c.letterUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 font-bold hover:underline">View Letter</a>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${c.status === 'approved' ? 'bg-emerald-500 text-white' : c.status === 'rejected' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>{c.status.toUpperCase()}</span>
                        {c.status === 'pending' && (
                          <>
                            <Button size="sm" onClick={async () => { try { await api.approveConcession(c.id); toast.success('Approved'); loadConcessions(); } catch (e) { toast.error('Failed'); } }} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs">Approve</Button>
                            <Button size="sm" variant="outline" onClick={async () => { try { await api.rejectConcession(c.id); toast.success('Rejected'); loadConcessions(); } catch (e) { toast.error('Failed'); } }} className="border-rose-300 text-rose-600 hover:bg-rose-50 font-bold rounded-xl text-xs">Reject</Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-400 mt-3">Tip: Go to <span className="font-bold">Approvals</span> to view the full history and pending concessions.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Fees;
