import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, Plus, Edit, Trash2, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { AVAILABLE_MODULES } from '../lib/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const PERMISSION_FLAGS = [
  { key: 'canEdit', label: 'Edit Records (fallback)', desc: 'Default for modules without per-module setting above.' },
  { key: 'canDelete', label: 'Delete Records (fallback)', desc: 'Default delete permission when no per-module override.' },
  { key: 'canExport', label: 'Export Data', desc: 'CSV / Excel exports' },
  { key: 'canSeeFullMobile', label: 'Full Mobile Numbers', desc: 'See unmasked phone numbers' },
  { key: 'canEditFees', label: 'Edit Fee Types', desc: 'Create / edit / delete fee types' },
  { key: 'canRevertFees', label: 'Revert Payments', desc: 'Reverse a fee payment' },
  { key: 'canApproveConcession', label: 'Approve Concessions', desc: 'Approve / reject fee concessions' },
];

const blankForm = {
  roleName: '', label: '', modules: [],
  canEdit: false, canDelete: false, canExport: false,
  canEditFees: false, canRevertFees: false, canApproveConcession: false, canSeeFullMobile: false,
  modulePerms: {},
};

const Roles = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm);

  const load = useCallback(async () => {
    try { setLoading(true); const r = await api.getRoles(); setRoles(r.data); }
    catch (e) { toast.error('Failed to load roles'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(blankForm); setShowDialog(true); };
  const openEdit = (role) => {
    if (role.roleName === 'super_admin') { toast.error('super_admin role cannot be modified'); return; }
    // Auto-migrate: when modulePerms is empty AND legacy canEdit is on, seed CRUD=true for every module in this role.
    const legacyMigration = {};
    if ((!role.modulePerms || Object.keys(role.modulePerms).length === 0) && role.canEdit) {
      (role.modules || []).forEach((m) => { legacyMigration[m] = { create: true, edit: true, delete: !!role.canDelete }; });
    }
    setEditing(role);
    setForm({
      roleName: role.roleName, label: role.label || role.roleName,
      modules: role.modules || [],
      canEdit: !!role.canEdit, canDelete: !!role.canDelete, canExport: !!role.canExport,
      canEditFees: !!role.canEditFees, canRevertFees: !!role.canRevertFees,
      canApproveConcession: !!role.canApproveConcession, canSeeFullMobile: !!role.canSeeFullMobile,
      modulePerms: { ...(role.modulePerms || {}), ...legacyMigration },
    });
    setShowDialog(true);
  };

  const toggleModule = (key) => {
    setForm((f) => {
      const has = f.modules.includes(key);
      const nextModules = has ? f.modules.filter((m) => m !== key) : [...f.modules, key];
      const nextModulePerms = { ...f.modulePerms };
      if (has) {
        delete nextModulePerms[key];
      } else if (!nextModulePerms[key]) {
        nextModulePerms[key] = { create: false, edit: false, delete: false };
      }
      return { ...f, modules: nextModules, modulePerms: nextModulePerms };
    });
  };
  const togglePerm = (key) => setForm((f) => ({ ...f, [key]: !f[key] }));

  const toggleModuleCrud = (moduleKey, action) => {
    setForm((f) => {
      const current = f.modulePerms[moduleKey] || { create: false, edit: false, delete: false };
      return { ...f, modulePerms: { ...f.modulePerms, [moduleKey]: { ...current, [action]: !current[action] } } };
    });
  };

  const applyGlobalToAllModules = (action) => {
    setForm((f) => {
      const next = { ...f.modulePerms };
      f.modules.forEach((m) => {
        next[m] = { ...(next[m] || { create: false, edit: false, delete: false }), [action]: true };
      });
      return { ...f, modulePerms: next };
    });
    toast.success(`Granted ${action} on all ${form.modules.length} module(s)`);
  };

  const handleSave = async () => {
    if (!editing && !form.roleName) { toast.error('Role name required'); return; }
    if (form.modules.length === 0) { toast.error('Select at least one module'); return; }
    try {
      const payload = { ...form, label: form.label || form.roleName };
      if (editing) {
        const { roleName, ...updateData } = payload;
        await api.updateRole(editing.id, updateData);
        toast.success('Role updated');
      } else {
        await api.createRole(payload);
        toast.success('Role created');
      }
      setShowDialog(false); setForm(blankForm); setEditing(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Failed to save'); }
  };

  const handleDelete = async (role) => {
    if (role.isSystem) { toast.error('System roles cannot be deleted'); return; }
    if (!window.confirm(`Delete role "${role.label}"?`)) return;
    try { await api.deleteRole(role.id); toast.success('Role deleted'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Failed to delete'); }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6" data-testid="roles-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Roles & Permissions</h1>
          <p className="text-base font-medium text-slate-600 mt-1">Create custom roles and define which modules each role can access</p>
        </div>
        <Dialog open={showDialog} onOpenChange={(o) => { setShowDialog(o); if (!o) { setEditing(null); setForm(blankForm); } }}>
          <DialogTrigger asChild>
            <Button data-testid="add-role-btn" onClick={openCreate} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl"><Plus className="w-5 h-5 mr-2" />Create Role</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="text-2xl font-bold">{editing ? `Edit Role: ${editing.label}` : 'Create Custom Role'}</DialogTitle></DialogHeader>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Role Identifier *</Label>
                  <Input data-testid="role-name-input" disabled={!!editing} value={form.roleName} onChange={(e) => setForm({ ...form, roleName: e.target.value.toLowerCase().replace(/\s+/g, '_') })} className="rounded-xl h-12" placeholder="e.g., librarian" />
                  <p className="text-xs text-slate-400 mt-1">Lowercase, no spaces. {editing && 'Identifier cannot be changed.'}</p>
                </div>
                <div>
                  <Label>Display Label *</Label>
                  <Input data-testid="role-label-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="rounded-xl h-12" placeholder="e.g., Librarian" />
                </div>
              </div>

              {/* Module access + per-module CRUD */}
              <div>
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <Label className="text-base">Module Access &amp; Permissions</Label>
                    <p className="text-xs text-slate-500">Select modules this role can see, then granularly enable Create / Edit / Delete per module.</p>
                  </div>
                  {form.modules.length > 0 && (
                    <div className="flex flex-wrap gap-1 text-[10px] font-bold">
                      <button type="button" onClick={() => applyGlobalToAllModules('create')} data-testid="apply-create-all" className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors">+C all</button>
                      <button type="button" onClick={() => applyGlobalToAllModules('edit')} data-testid="apply-edit-all" className="px-2 py-1 rounded-md bg-sky-100 text-sky-700 hover:bg-sky-200 transition-colors">+E all</button>
                      <button type="button" onClick={() => applyGlobalToAllModules('delete')} data-testid="apply-delete-all" className="px-2 py-1 rounded-md bg-rose-100 text-rose-700 hover:bg-rose-200 transition-colors">+D all</button>
                    </div>
                  )}
                </div>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {AVAILABLE_MODULES.map((m) => {
                    const checked = form.modules.includes(m.key);
                    const mp = form.modulePerms[m.key] || { create: false, edit: false, delete: false };
                    return (
                      <div key={m.key} className={`flex items-center gap-3 px-3 py-2 ${checked ? 'bg-emerald-50/40' : ''}`}>
                        <button type="button" data-testid={`module-toggle-${m.key}`} onClick={() => toggleModule(m.key)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors min-w-[130px] text-left ${checked ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center text-[10px] ${checked ? 'bg-white border-white text-emerald-600' : 'border-slate-300'}`}>{checked ? '✓' : ''}</span>
                          {m.label}
                        </button>
                        {checked && (
                          <div className="flex items-center gap-1 ml-auto">
                            {['create', 'edit', 'delete'].map((action) => {
                              const colorOn = action === 'create' ? 'bg-emerald-500 text-white' : action === 'edit' ? 'bg-sky-500 text-white' : 'bg-rose-500 text-white';
                              const colorOff = 'bg-slate-100 text-slate-400 hover:bg-slate-200';
                              const isOn = !!mp[action];
                              const letter = action[0].toUpperCase();
                              return (
                                <button key={action} type="button"
                                  data-testid={`module-${m.key}-${action}`}
                                  onClick={() => toggleModuleCrud(m.key, action)}
                                  title={action.charAt(0).toUpperCase() + action.slice(1)}
                                  className={`w-7 h-7 rounded-md text-[11px] font-extrabold transition-all ${isOn ? colorOn : colorOff}`}>
                                  {letter}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">Tip: when a module&apos;s C/E/D are all OFF, the role gets view-only access to that module.</p>
              </div>

              {/* Permission flags */}
              <div>
                <Label className="text-base">Permissions</Label>
                <p className="text-xs text-slate-500 mb-2">Fine-grained controls on top of module access</p>
                <div className="space-y-2 p-3 border border-slate-200 rounded-xl">
                  {PERMISSION_FLAGS.map((p) => (
                    <label key={p.key} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                      <div>
                        <p className="font-bold text-slate-800 text-sm">{p.label}</p>
                        <p className="text-xs text-slate-500">{p.desc}</p>
                      </div>
                      <input type="checkbox" data-testid={`perm-${p.key}`} checked={!!form[p.key]} onChange={() => togglePerm(p.key)} className="w-5 h-5 accent-sky-500 cursor-pointer" />
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowDialog(false)} className="rounded-xl">Cancel</Button>
                <Button data-testid="save-role-btn" onClick={handleSave} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">{editing ? 'Update' : 'Create'}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
        {loading ? (
          <div className="text-center py-12 text-slate-400">Loading...</div>
        ) : roles.length === 0 ? (
          <div className="text-center py-12"><KeyRound className="w-10 h-10 mx-auto text-slate-300 mb-2" /><p className="text-slate-400">No roles yet</p></div>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Role</TableHead><TableHead>Identifier</TableHead><TableHead>Modules</TableHead><TableHead>Permissions</TableHead><TableHead className="text-center">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {roles.map((r) => {
                const activePerms = PERMISSION_FLAGS.filter((p) => r[p.key]);
                return (
                  <TableRow key={r.id} data-testid={`role-row-${r.roleName}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900">{r.label}</p>
                        {r.isSystem && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 inline-flex items-center gap-1"><Lock className="w-3 h-3" />System</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-500 font-mono text-xs">{r.roleName}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1 max-w-md">{(r.modules || []).map((m) => <span key={m} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">{m}</span>)}</div></TableCell>
                    <TableCell><div className="flex flex-wrap gap-1 max-w-md">{activePerms.length === 0 ? <span className="text-slate-400 text-xs italic">view-only</span> : activePerms.map((p) => <span key={p.key} className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">{p.label}</span>)}</div></TableCell>
                    <TableCell className="text-center">
                      <div className="inline-flex gap-1">
                        <button onClick={() => openEdit(r)} data-testid={`edit-role-${r.roleName}`} disabled={r.roleName === 'super_admin'} className="p-2 hover:bg-sky-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><Edit className="w-4 h-4 text-sky-600" /></button>
                        <button onClick={() => handleDelete(r)} data-testid={`delete-role-${r.roleName}`} disabled={r.isSystem} className="p-2 hover:bg-rose-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><Trash2 className="w-4 h-4 text-rose-600" /></button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
};

export default Roles;
