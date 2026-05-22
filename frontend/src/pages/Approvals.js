import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Calendar, DollarSign, Check, X, FileText } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const Approvals = () => {
  const { user, role, perms } = useAuth();
  const isTeacher = role === 'teacher';
  const showConcessions = !!perms?.canApproveConcession; // concessions only for roles with approval permission
  const [activeTab, setActiveTab] = useState('leave');
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [concessions, setConcessions] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');

  const loadLeaveRequests = useCallback(async () => {
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const r = await api.getLeaveRequests(params);
      setLeaveRequests(r.data);
    } catch (e) { /* ignore */ }
  }, [statusFilter]);

  const loadConcessions = useCallback(async () => {
    try {
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const r = await api.getConcessions(params);
      setConcessions(r.data);
    } catch (e) { /* ignore */ }
  }, [statusFilter]);

  useEffect(() => {
    loadLeaveRequests();
    if (showConcessions) loadConcessions();
  }, [loadLeaveRequests, loadConcessions, showConcessions]);

  const handleApproveLeave = async (id) => {
    try {
      await api.approveLeaveRequest(id, { approvedBy: user?.name || user?.username || 'Admin' });
      toast.success('Leave approved');
      loadLeaveRequests();
    } catch (e) { toast.error('Failed to approve'); }
  };

  const handleRejectLeave = async (id) => {
    try {
      await api.rejectLeaveRequest(id, { rejectedBy: user?.name || user?.username || 'Admin' });
      toast.success('Leave rejected');
      loadLeaveRequests();
    } catch (e) { toast.error('Failed to reject'); }
  };

  const handleApproveConcession = async (id) => {
    try {
      await api.approveConcession(id);
      toast.success('Concession approved');
      loadConcessions();
    } catch (e) { toast.error('Failed to approve'); }
  };

  const handleRejectConcession = async (id) => {
    try {
      await api.rejectConcession(id);
      toast.success('Concession rejected');
      loadConcessions();
    } catch (e) { toast.error('Failed to reject'); }
  };

  const statusBadge = (s) => (
    <span className={`px-3 py-1 rounded-full text-xs font-bold ${s === 'approved' ? 'bg-emerald-500 text-white' : s === 'rejected' ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white'}`}>
      {s.toUpperCase()}
    </span>
  );

  return (
    <div className="max-w-[1600px] mx-auto space-y-6" data-testid="approvals-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Approvals</h1>
          <p className="text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>
            {showConcessions ? 'Review and approve leave requests and fee concessions' : 'Review and approve leave requests'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-bold text-slate-600">Status:</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="approvals-status-filter" className="rounded-xl h-10 px-3 border border-slate-200 font-semibold text-sm">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl inline-flex">
          <TabsTrigger data-testid="leave-tab" value="leave" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 font-bold">
            <Calendar className="w-4 h-4 mr-2" />Leave Requests
            <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">{leaveRequests.filter(l => l.status === 'pending').length}</span>
          </TabsTrigger>
          {showConcessions && (
            <TabsTrigger data-testid="concessions-tab" value="concessions" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 font-bold">
              <DollarSign className="w-4 h-4 mr-2" />Concessions
              <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs">{concessions.filter(c => c.status === 'pending').length}</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* Leave Requests Tab */}
        <TabsContent value="leave" className="space-y-4">
          {leaveRequests.length === 0 ? (
            <div className="bg-white rounded-2xl shadow border border-slate-100 flex flex-col items-center justify-center h-48">
              <ShieldCheck className="w-10 h-10 text-slate-300 mb-2" />
              <p className="text-slate-400 font-medium">No leave requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leaveRequests.map((lr) => (
                <div key={lr.id} data-testid={`leave-card-${lr.id}`} className={`bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border p-4 sm:p-6 ${lr.status === 'approved' ? 'border-emerald-200' : lr.status === 'rejected' ? 'border-rose-200' : 'border-amber-200'}`}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-slate-900 text-base">{lr.studentCode} - {lr.studentName}</p>
                        {statusBadge(lr.status)}
                      </div>
                      <p className="text-sm text-slate-600 mt-1">
                        <Calendar className="inline w-3 h-3 mr-1" />
                        <span className="font-semibold">{lr.fromDate}</span> to <span className="font-semibold">{lr.toDate}</span>
                      </p>
                      <p className="text-sm text-slate-700 mt-2"><span className="font-bold">Reason:</span> {lr.reason}</p>
                      {lr.attachmentUrl && (
                        <a href={lr.attachmentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-lg font-bold text-xs transition-colors">
                          <FileText className="w-3 h-3" />View Attachment
                        </a>
                      )}
                      {lr.approvedBy && <p className="text-xs text-slate-500 mt-2">Approved by: {lr.approvedBy}</p>}
                      {lr.rejectedBy && <p className="text-xs text-slate-500 mt-2">Rejected by: {lr.rejectedBy}</p>}
                    </div>
                    {lr.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <Button size="sm" data-testid={`approve-leave-${lr.id}`} onClick={() => handleApproveLeave(lr.id)} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl">
                          <Check className="w-4 h-4 mr-1" />Approve
                        </Button>
                        <Button size="sm" variant="outline" data-testid={`reject-leave-${lr.id}`} onClick={() => handleRejectLeave(lr.id)} className="border-rose-300 text-rose-600 hover:bg-rose-50 font-bold rounded-xl">
                          <X className="w-4 h-4 mr-1" />Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Concessions Tab - hidden for teachers and admins (only super_admin) */}
        {showConcessions && (
          <TabsContent value="concessions" className="space-y-4">
            {concessions.length === 0 ? (
              <div className="bg-white rounded-2xl shadow border border-slate-100 flex flex-col items-center justify-center h-48">
                <DollarSign className="w-10 h-10 text-slate-300 mb-2" />
                <p className="text-slate-400 font-medium">No concession requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {concessions.map((c) => (
                  <div key={c.id} data-testid={`concession-card-${c.id}`} className={`bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border p-4 sm:p-6 ${c.status === 'approved' ? 'border-emerald-200' : c.status === 'rejected' ? 'border-rose-200' : 'border-amber-200'}`}>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-slate-900 text-base">{c.studentCode} - {c.studentName}</p>
                          {statusBadge(c.status)}
                        </div>
                        <p className="text-sm text-slate-600 mt-1">
                          {c.termNumber ? `Term ${c.termNumber}` : (c.feeName || 'Custom')} | Amount: <span className="font-extrabold text-emerald-600">{'\u20B9'}{c.concessionAmount.toLocaleString()}</span>
                        </p>
                        <p className="text-xs text-slate-500 mt-1">Requested by: {c.requestedBy}</p>
                        {c.letterUrl && (
                          <a href={c.letterUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-lg font-bold text-xs transition-colors">
                            <FileText className="w-3 h-3" />View Letter
                          </a>
                        )}
                      </div>
                      {c.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <Button size="sm" data-testid={`approve-concession-${c.id}`} onClick={() => handleApproveConcession(c.id)} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl">
                            <Check className="w-4 h-4 mr-1" />Approve
                          </Button>
                          <Button size="sm" variant="outline" data-testid={`reject-concession-${c.id}`} onClick={() => handleRejectConcession(c.id)} className="border-rose-300 text-rose-600 hover:bg-rose-50 font-bold rounded-xl">
                            <X className="w-4 h-4 mr-1" />Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Approvals;
