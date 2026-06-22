import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, canEdit } from '../lib/AuthContext';
import { Plus, Edit, Trash2, UserCog } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const StaffPage = () => {
  const { role, perms } = useAuth();
  const showEdit = canEdit(perms, 'staff');
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [form, setForm] = useState({ name: '', role: 'teacher', mobile: '', subject: '', joiningDate: '', username: '', password: '' });

  const loadStaff = useCallback(async () => {
    try { const r = await api.getStaff(); setStaff(r.data); } catch (e) { toast.error('Failed to load staff'); }
    finally { setLoading(false); }
  }, []);
  const loadRoles = useCallback(async () => {
    try { const r = await api.getRoles(); setRoles(r.data.filter((x) => x.roleName !== 'super_admin')); } catch (e) { /* ignore */ }
  }, []);
  useEffect(() => { loadStaff(); loadRoles(); }, [loadStaff, loadRoles]);

  const roleLabel = (rn) => roles.find((r) => r.roleName === rn)?.label || rn;

  const resetForm = () => { setForm({ name: '', role: 'teacher', mobile: '', subject: '', joiningDate: '', username: '', password: '' }); setEditingStaff(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingStaff) {
        const { username, ...updateData } = form;
        await api.updateStaff(editingStaff.id, updateData);
        toast.success('Staff updated');
      } else {
        await api.createStaff(form);
        toast.success('Staff added');
      }
      setShowDialog(false); resetForm(); loadStaff();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to save staff'); }
  };

  const openEdit = (s) => {
    setEditingStaff(s);
    setForm({ name: s.name, role: s.role, mobile: s.mobile, subject: s.subject || '', joiningDate: s.joiningDate, username: s.username, password: '' });
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this staff member?')) return;
    try { await api.deleteStaff(id); toast.success('Staff deleted'); loadStaff(); }
    catch (error) { toast.error('Failed to delete'); }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Staff Management</h1>
          <p className="text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>Manage teachers and office staff</p>
        </div>
        {showEdit && (<Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="add-staff-btn" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform"><Plus className="w-5 h-5 mr-2" />Add Staff</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle className="text-2xl font-bold">{editingStaff ? 'Edit Staff' : 'Add Staff'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl h-12" /></div>
              <div><Label>Role *</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>{roles.map((r) => <SelectItem key={r.roleName} value={r.roleName}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Mobile *</Label><Input required value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} className="rounded-xl h-12" /></div>
              {form.role === 'teacher' && <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="rounded-xl h-12" /></div>}
              <div><Label>Joining Date *</Label><Input type="date" required value={form.joiningDate} onChange={(e) => setForm({ ...form, joiningDate: e.target.value })} className="rounded-xl h-12" /></div>
              {!editingStaff && <div><Label>Username *</Label><Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="rounded-xl h-12" /></div>}
              <div><Label>{editingStaff ? 'New Password (leave blank to keep)' : 'Password *'}</Label><Input type="password" required={!editingStaff} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-xl h-12" /></div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => { setShowDialog(false); resetForm(); }} className="rounded-xl">Cancel</Button>
                <Button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">{editingStaff ? 'Update' : 'Add Staff'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>)}
      </div>

      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden">
        {loading ? <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div></div>
        : staff.length === 0 ? <div className="flex flex-col items-center justify-center h-64"><p className="text-slate-400 font-medium">No staff added yet</p></div>
        : <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-slate-50">
                <TableHead className="font-bold uppercase text-xs text-slate-600">Name</TableHead>
                <TableHead className="font-bold uppercase text-xs text-slate-600">Role</TableHead>
                <TableHead className="font-bold uppercase text-xs text-slate-600">Mobile</TableHead>
                <TableHead className="font-bold uppercase text-xs text-slate-600">Subject</TableHead>
                <TableHead className="font-bold uppercase text-xs text-slate-600">Username</TableHead>
                <TableHead className="font-bold uppercase text-xs text-slate-600">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {staff.map((s) => (
                  <TableRow key={s.id} className="hover:bg-slate-50/80">
                    <TableCell className="font-semibold text-slate-900">{s.name}</TableCell>
                    <TableCell><span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${s.role === 'teacher' ? 'bg-sky-100 text-sky-700' : s.role === 'admin_role' ? 'bg-purple-100 text-purple-700' : s.role === 'office_staff' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{roleLabel(s.role)}</span></TableCell>
                    <TableCell className="text-slate-600">{s.mobile}</TableCell>
                    <TableCell className="text-slate-600">{s.subject || '-'}</TableCell>
                    <TableCell className="font-medium text-slate-700">{s.username}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {showEdit && <>
                          <button onClick={() => openEdit(s)} data-testid={`edit-staff-${s.id}`} className="p-2 hover:bg-sky-100 rounded-lg transition-colors"><Edit className="w-4 h-4 text-sky-600" /></button>
                          <button onClick={() => handleDelete(s.id)} data-testid={`delete-staff-${s.id}`} className="p-2 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-rose-600" /></button>
                        </>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>}
      </div>
    </div>
  );
};

export default StaffPage;
