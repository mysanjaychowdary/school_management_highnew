import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, ClipboardCheck, DollarSign, Package, TrendingUp } from 'lucide-react';
import { useAuth, canSeeFullMobile, maskMobile } from '../lib/AuthContext';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';

const StudentDetail = () => {
  const { role } = useAuth();
  const showFullMobile = canSeeFullMobile(role);
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await api.getStudentDetail(id);
        setData(response.data);
      } catch (error) { toast.error('Failed to load student details'); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div></div>;
  if (!data) return <div className="text-center py-20 text-slate-400">Student not found</div>;

  const { student, attendance, attendanceStats, payments, paidTerms, paidCustomFees, customFees, inventoryIssued } = data;
  const promotionHistory = data.promotionHistory || [];

  const getTermPaid = (n) => paidTerms?.[`term${n}`] || 0;
  const getTermTotal = (n) => student[`feeTerm${n}`] || 0;
  const getCustomPaid = (feeId) => paidCustomFees?.[feeId] || 0;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <Button variant="outline" onClick={() => navigate('/students')} className="rounded-xl font-bold">
        <ArrowLeft className="w-4 h-4 mr-2" />Back to Students
      </Button>

      {/* Student Info */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900" style={{ fontFamily: 'Nunito' }}>{student.studentName}</h1>
            <p className="text-sm text-slate-500 font-medium">Student ID: {student.studentCode} | Roll No: {student.rollNo} | Class {student.studentClass} - {student.section}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Father</p><p className="font-bold text-slate-900">{student.fatherName}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Mother</p><p className="font-bold text-slate-900">{student.motherName}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Mobile</p><p className="font-bold text-slate-900">{showFullMobile ? student.mobile : maskMobile(student.mobile)}</p></div>
          <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Address</p><p className="font-bold text-slate-900">{student.address}</p></div>
        </div>
      </div>

      {/* Attendance Stats */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <ClipboardCheck className="w-6 h-6 text-emerald-600" />
          <h2 className="text-xl font-bold text-slate-800">Attendance Summary</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-3xl font-extrabold text-slate-900">{attendanceStats.totalDays}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Total Days</p>
          </div>
          <div className="bg-emerald-50 rounded-xl p-4 text-center">
            <p className="text-3xl font-extrabold text-emerald-600">{attendanceStats.presentDays}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-500 mt-1">Present</p>
          </div>
          <div className="bg-rose-50 rounded-xl p-4 text-center">
            <p className="text-3xl font-extrabold text-rose-600">{attendanceStats.absentDays}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-rose-500 mt-1">Absent</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${attendanceStats.percentage >= 75 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
            <p className={`text-3xl font-extrabold ${attendanceStats.percentage >= 75 ? 'text-emerald-600' : 'text-rose-600'}`}>{attendanceStats.percentage}%</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">Percentage</p>
          </div>
        </div>

        {attendance.length > 0 && (
          <div className="max-h-64 overflow-y-auto space-y-2">
            {attendance.slice().reverse().map((a) => (
              <div key={a.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <p className="font-medium text-slate-700">{a.date}</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                  a.status === 'present' ? 'bg-emerald-100 text-emerald-700' : a.status === 'absent' ? 'bg-rose-100 text-rose-700' : a.status === 'holiday' ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-600'
                }`}>{a.status.toUpperCase()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fee History */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <DollarSign className="w-6 h-6 text-amber-600" />
          <h2 className="text-xl font-bold text-slate-800">Fee Status</h2>
        </div>

        <h3 className="text-base font-bold text-slate-700 mb-3">Term Fees</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((n) => {
            const total = getTermTotal(n);
            const paid = getTermPaid(n);
            const pending = total - paid;
            const fullyPaid = paid >= total;
            return (
              <div key={n} className={`rounded-xl border p-4 ${fullyPaid ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-900">Term {n}</h4>
                  {fullyPaid && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-white">PAID</span>}
                </div>
                <p className="text-sm text-slate-600">Total: {'\u20B9'}{total.toLocaleString()}</p>
                <p className="text-sm text-emerald-600 font-bold">Paid: {'\u20B9'}{paid.toLocaleString()}</p>
                {!fullyPaid && <p className="text-sm text-rose-600 font-bold">Pending: {'\u20B9'}{pending.toLocaleString()}</p>}
              </div>
            );
          })}
        </div>

        {customFees?.length > 0 && (
          <>
            <h3 className="text-base font-bold text-slate-700 mb-3">Custom Fees</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {customFees.map((cf) => {
                const paid = getCustomPaid(cf.id);
                const pending = cf.amount - paid;
                const fullyPaid = paid >= cf.amount;
                return (
                  <div key={cf.id} className={`rounded-xl border p-4 ${fullyPaid ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-900">{cf.feeName}</h4>
                      {fullyPaid && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-white">PAID</span>}
                    </div>
                    <p className="text-sm text-slate-600">Total: {'\u20B9'}{cf.amount.toLocaleString()}</p>
                    <p className="text-sm text-emerald-600 font-bold">Paid: {'\u20B9'}{paid.toLocaleString()}</p>
                    {!fullyPaid && <p className="text-sm text-rose-600 font-bold">Pending: {'\u20B9'}{pending.toLocaleString()}</p>}
                    {cf.dueDate && <p className="text-xs text-rose-500 mt-1">Due: {cf.dueDate}</p>}
                  </div>
                );
              })}
            </div>
          </>
        )}

        <h3 className="text-base font-bold text-slate-700 mb-3">Payment History</h3>
        {payments.length === 0 ? (
          <p className="text-slate-400 text-sm">No payments recorded yet</p>
        ) : (
          <div className="max-h-64 overflow-y-auto space-y-2">
            {payments.slice().reverse().map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex-1 grid grid-cols-4 gap-4">
                  <p className="font-medium text-slate-700">{p.receiptNumber}</p>
                  <p className="text-slate-600">{p.termNumber ? `Term ${p.termNumber}` : (p.feeName || 'Custom')}</p>
                  <p className="font-bold text-emerald-600">{'\u20B9'}{p.amount.toLocaleString()}</p>
                  <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${p.paymentMode === 'upi' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}`}>{p.paymentMode.toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inventory Issued */}
      {inventoryIssued && inventoryIssued.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Package className="w-6 h-6 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-800">Inventory Issued</h2>
          </div>
          <div className="space-y-2">
            {inventoryIssued.map((iss) => (
              <div key={iss.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex-1 grid grid-cols-3 gap-4">
                  <p className="font-bold text-slate-900">{iss.itemName}</p>
                  <p className="font-bold text-indigo-600">Qty: {iss.quantity}</p>
                  <p className="text-slate-600">{iss.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Promotion History */}
      {promotionHistory && promotionHistory.length > 0 && (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6" data-testid="promotion-history-section">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-amber-600" />
            <h2 className="text-xl font-bold text-slate-800">Promotion History</h2>
            <span className="ml-auto text-xs font-bold text-slate-500">{promotionHistory.length} promotion(s)</span>
          </div>
          <div className="space-y-3">
            {promotionHistory.slice().reverse().map((h, i) => (
              <div key={i} className="border border-amber-200 bg-gradient-to-r from-amber-50/50 to-orange-50/50 rounded-xl p-4">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-700">Class {h.fromClass}</span>
                    <ArrowLeft className="w-3 h-3 rotate-180 text-amber-600" />
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Class {h.toClass}</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">{typeof h.promotedOn === 'string' ? h.promotedOn.slice(0, 10) : ''}</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="bg-white rounded-lg p-2 border border-slate-100"><p className="text-[10px] font-bold uppercase text-slate-400">Last Yr Paid</p><p className="font-bold text-emerald-600">{'\u20B9'}{(h.totalPaid || 0).toLocaleString()}</p></div>
                  <div className="bg-white rounded-lg p-2 border border-slate-100"><p className="text-[10px] font-bold uppercase text-slate-400">Carried Forward</p><p className="font-bold text-rose-600">{'\u20B9'}{(h.totalDue || 0).toLocaleString()}</p></div>
                  <div className="bg-white rounded-lg p-2 border border-slate-100"><p className="text-[10px] font-bold uppercase text-slate-400">Old T1/T2/T3</p><p className="font-bold text-slate-700 text-xs">{(h.oldFees?.term1)||0}/{(h.oldFees?.term2)||0}/{(h.oldFees?.term3)||0}</p></div>
                  <div className="bg-white rounded-lg p-2 border border-emerald-200"><p className="text-[10px] font-bold uppercase text-emerald-500">New T1/T2/T3</p><p className="font-bold text-emerald-700 text-xs">{(h.newFees?.term1)||0}/{(h.newFees?.term2)||0}/{(h.newFees?.term3)||0}</p></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDetail;
