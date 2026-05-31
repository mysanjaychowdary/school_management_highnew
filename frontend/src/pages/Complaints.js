import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Plus, Camera, Trash2, Check, Clock, Image as ImageIcon } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, canEdit } from '../lib/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const statusColor = (s) => s === 'resolved' ? 'bg-emerald-500 text-white' : s === 'in_progress' ? 'bg-sky-500 text-white' : 'bg-amber-500 text-white';
const prioColor = (p) => p === 'high' ? 'bg-rose-100 text-rose-700' : p === 'low' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700';

const Complaints = () => {
  const { user, role, perms } = useAuth();
  const isManager = canEdit(perms) || role === 'super_admin' || role === 'admin_role'; // admin/super can manage all
  const myUsername = user?.username || '';

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | mine | overdue | pending | in_progress | resolved
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '', priority: 'medium', photoUrl: '' });
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filter === 'overdue') params.overdueOnly = true;
      if (['pending', 'in_progress', 'resolved'].includes(filter)) params.status = filter;
      if (filter === 'mine' && myUsername) params.createdByUsername = myUsername;
      const r = await api.getComplaints(params);
      setComplaints(r.data);
    } catch (e) { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [filter, myUsername]);
  useEffect(() => { load(); }, [load]);

  const handlePhoto = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { setUploading(true); const r = await api.uploadFile(file); setForm((f) => ({ ...f, photoUrl: r.data.url })); toast.success('Photo uploaded'); }
    catch (err) { toast.error('Upload failed'); }
    finally { setUploading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.dueDate) { toast.error('Title and due date required'); return; }
    try {
      await api.createComplaint({
        ...form,
        createdBy: user?.name || myUsername || 'Staff',
        createdByUsername: myUsername,
        createdByRole: role || '',
      });
      toast.success('Complaint submitted');
      setShowDialog(false);
      setForm({ title: '', description: '', dueDate: '', priority: 'medium', photoUrl: '' });
      load();
    } catch (err) { toast.error('Failed to submit'); }
  };

  const updateStatus = async (c, newStatus) => {
    try { await api.updateComplaint(c.id, { status: newStatus }); toast.success(`Marked ${newStatus.replace('_', ' ')}`); load(); }
    catch (e) { toast.error('Failed to update'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this complaint?')) return;
    try { await api.deleteComplaint(id); toast.success('Deleted'); load(); }
    catch (e) { toast.error('Failed to delete'); }
  };

  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = complaints.filter((c) => c.isOverdue).length;

  return (
    <div className="max-w-[1400px] mx-auto space-y-6" data-testid="complaints-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Complaints</h1>
          <p className="text-base font-medium text-slate-600 mt-1">Report issues, track status, resolve before due date</p>
        </div>
        <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) setForm({ title: '', description: '', dueDate: '', priority: 'medium', photoUrl: '' }); }}>
          <DialogTrigger asChild>
            <Button data-testid="new-complaint-btn" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl"><Plus className="w-5 h-5 mr-2" />New Complaint</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-2xl font-bold">Submit Complaint</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Title *</Label><Input data-testid="complaint-title" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-xl h-12" placeholder="e.g., Broken bench in Classroom 5" /></div>
              <div><Label>Description</Label><Textarea data-testid="complaint-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-xl" placeholder="Details about the issue" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Due Date *</Label><Input data-testid="complaint-due" type="date" min={today} required value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className="rounded-xl h-12" /></div>
                <div><Label>Priority</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger data-testid="complaint-priority" className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Photo (optional)</Label>
                <label className="block">
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} data-testid="complaint-photo-file" className="hidden" />
                  <span className="cursor-pointer mt-2 inline-flex items-center justify-center w-full h-12 px-4 rounded-xl font-bold bg-sky-100 text-sky-700 hover:bg-sky-200 transition-colors"><Camera className="w-4 h-4 mr-2" />{uploading ? 'Uploading...' : (form.photoUrl ? 'Replace Photo' : 'Take / Choose Photo')}</span>
                </label>
                {form.photoUrl && <img src={form.photoUrl} alt="complaint" className="mt-3 rounded-xl max-h-48 border border-slate-200" />}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)} className="rounded-xl">Cancel</Button>
                <Button data-testid="submit-complaint-btn" type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">Submit</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Overdue alert */}
      {isManager && overdueCount > 0 && (
        <div data-testid="overdue-alert" className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-rose-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-extrabold text-rose-900">{overdueCount} complaint{overdueCount > 1 ? 's are' : ' is'} overdue</p>
            <p className="text-sm text-rose-700">These were not resolved before their due date. Please review and follow up with the assignees.</p>
          </div>
          <Button data-testid="show-overdue-btn" onClick={() => setFilter('overdue')} variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-100 font-bold rounded-xl">Show overdue</Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {[['all', 'All'], ['mine', 'My Complaints'], ['pending', 'Pending'], ['in_progress', 'In Progress'], ['resolved', 'Resolved'], ['overdue', 'Overdue']].map(([k, l]) => (
          <button key={k} data-testid={`filter-${k}`} onClick={() => setFilter(k)} className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${filter === k ? 'bg-sky-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}>{l}</button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow border border-slate-100 p-12 text-center text-slate-400">Loading...</div>
      ) : complaints.length === 0 ? (
        <div className="bg-white rounded-2xl shadow border border-slate-100 p-12 text-center">
          <AlertTriangle className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-slate-400 font-medium">No complaints to show</p>
        </div>
      ) : (
        <div className="space-y-3">
          {complaints.map((c) => (
            <div key={c.id} data-testid={`complaint-${c.id}`} className={`bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border p-4 sm:p-6 ${c.isOverdue ? 'border-rose-300 bg-rose-50/30' : 'border-slate-100'}`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-900">{c.title}</h3>
                    <span className={`px-3 py-0.5 rounded-full text-xs font-bold ${statusColor(c.status)}`}>{c.status.replace('_', ' ').toUpperCase()}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${prioColor(c.priority)}`}>{c.priority.toUpperCase()}</span>
                    {c.isOverdue && <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-500 text-white inline-flex items-center gap-1"><Clock className="w-3 h-3" />OVERDUE</span>}
                  </div>
                  {c.description && <p className="text-sm text-slate-600 mt-1">{c.description}</p>}
                  <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                    <span><span className="font-bold">By:</span> {c.createdBy} ({c.createdByRole})</span>
                    <span className={c.isOverdue ? 'font-bold text-rose-600' : 'font-bold'}>Due: {c.dueDate}</span>
                    {c.notes && <span><span className="font-bold">Notes:</span> {c.notes}</span>}
                  </div>
                  {c.photoUrl && <a href={c.photoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 px-3 py-1 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-lg font-bold text-xs"><ImageIcon className="w-3 h-3" />View Photo</a>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Status updates: creator OR manager can move forward */}
                  {(c.createdByUsername === myUsername || isManager) && c.status !== 'resolved' && (
                    <>
                      {c.status === 'pending' && (
                        <Button size="sm" data-testid={`start-${c.id}`} onClick={() => updateStatus(c, 'in_progress')} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl text-xs">Start</Button>
                      )}
                      <Button size="sm" data-testid={`resolve-${c.id}`} onClick={() => updateStatus(c, 'resolved')} className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-xs"><Check className="w-3 h-3 mr-1" />Resolve</Button>
                    </>
                  )}
                  {isManager && (
                    <button onClick={() => handleDelete(c.id)} data-testid={`delete-${c.id}`} className="p-2 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-rose-600" /></button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Complaints;
