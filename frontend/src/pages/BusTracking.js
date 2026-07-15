import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, canCreate, canEdit, canDelete } from '../lib/AuthContext';
import { Plus, Edit, Trash2, MapPin, KeyRound, Bus as BusIcon } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const EMPTY_FORM = { busName: '', driverName: '', driverUsername: '', driverPassword: '' };
const STALE_MS = 30000;

const timeAgo = (iso) => {
  if (!iso) return null;
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  return `${mins}m ago`;
};

const BusTracking = () => {
  const { perms } = useAuth();
  const showCreate = canCreate(perms, 'busTracking');
  const showEdit = canEdit(perms, 'busTracking');
  const showDelete = canDelete(perms, 'busTracking');

  const [buses, setBuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingBus, setEditingBus] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [stopCodes, setStopCodes] = useState({}); // busId -> { code, expiresAt }

  const loadBuses = useCallback(async () => {
    try { const r = await api.getBuses(); setBuses(r.data); }
    catch (e) { toast.error('Failed to load buses'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    loadBuses();
    const id = setInterval(loadBuses, 10000);
    return () => clearInterval(id);
  }, [loadBuses]);

  const resetForm = () => { setForm(EMPTY_FORM); setEditingBus(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingBus) {
        const { driverUsername, ...updateData } = form;
        await api.updateBus(editingBus.id, updateData);
        toast.success('Bus updated');
      } else {
        await api.createBus(form);
        toast.success('Bus added');
      }
      setShowDialog(false); resetForm(); loadBuses();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to save bus'); }
  };

  const openEdit = (b) => {
    setEditingBus(b);
    setForm({ busName: b.busName, driverName: b.driverName, driverUsername: b.driverUsername, driverPassword: '' });
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this bus?')) return;
    try { await api.deleteBus(id); toast.success('Bus deleted'); loadBuses(); }
    catch (error) { toast.error('Failed to delete'); }
  };

  const handleGenerateCode = async (busId) => {
    try {
      const r = await api.generateStopCode(busId);
      setStopCodes((s) => ({ ...s, [busId]: r.data }));
    } catch (error) { toast.error('Failed to generate code'); }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Bus Tracking</h1>
        <p className="text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>Live status and location of school buses</p>
      </div>

      {/* ===== Live Tracking ===== */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-4 sm:p-6">
        {loading ? <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-500"></div></div>
        : buses.length === 0 ? <div className="flex flex-col items-center justify-center h-32"><p className="text-slate-400 font-medium">No buses added yet</p></div>
        : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {buses.map((b) => {
              const isDriving = b.status === 'driving';
              const stale = isDriving && b.lastLocationAt && (Date.now() - new Date(b.lastLocationAt).getTime() > STALE_MS);
              const waiting = isDriving && !b.lastLocationAt;
              const sc = stopCodes[b.id];
              const scExpired = sc && new Date(sc.expiresAt).getTime() < Date.now();
              return (
                <div key={b.id} data-testid={`bus-card-${b.id}`} className="border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center flex-shrink-0"><BusIcon className="w-5 h-5 text-sky-600" /></div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">{b.busName}</p>
                        <p className="text-xs text-slate-500 truncate">{b.driverName}</p>
                      </div>
                    </div>
                    {isDriving
                      ? <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${stale ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{stale ? 'No recent signal' : 'Driving'}</span>
                      : <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap bg-slate-100 text-slate-600">Stopped</span>}
                  </div>

                  {isDriving && (
                    <div className="text-xs text-slate-500">
                      {waiting ? 'Waiting for location...' : `Updated ${timeAgo(b.lastLocationAt)}`}
                    </div>
                  )}

                  {b.lat != null && b.lng != null && (
                    <a href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-lg font-bold text-xs transition-colors">
                      <MapPin className="w-3.5 h-3.5" />View on Map
                    </a>
                  )}

                  {isDriving && (
                    <div className="pt-2 border-t border-slate-100">
                      {sc && !scExpired ? (
                        <p className="text-xs font-bold text-slate-700">Stop code: <span className="text-sky-600 text-sm">{sc.code}</span> <span className="text-slate-400 font-medium">(expires {new Date(sc.expiresAt).toLocaleTimeString()})</span></p>
                      ) : (
                        <button onClick={() => handleGenerateCode(b.id)} data-testid={`generate-code-${b.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 hover:bg-amber-200 rounded-lg font-bold text-xs transition-colors">
                          <KeyRound className="w-3.5 h-3.5" />Generate Stop Code
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>}
      </div>

      {/* ===== Manage Buses ===== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Manage Buses</h2>
          {showCreate && (<Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-bus-btn" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform"><Plus className="w-5 h-5 mr-2" />Add Bus</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle className="text-2xl font-bold">{editingBus ? 'Edit Bus' : 'Add Bus'}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><Label>Bus Name *</Label><Input required value={form.busName} onChange={(e) => setForm({ ...form, busName: e.target.value })} className="rounded-xl h-12" placeholder="e.g. Bus 1" /></div>
                <div><Label>Driver Name *</Label><Input required value={form.driverName} onChange={(e) => setForm({ ...form, driverName: e.target.value })} className="rounded-xl h-12" /></div>
                {!editingBus && <div><Label>Driver Username *</Label><Input required value={form.driverUsername} onChange={(e) => setForm({ ...form, driverUsername: e.target.value })} className="rounded-xl h-12" /></div>}
                <div><Label>{editingBus ? 'New Password (leave blank to keep)' : 'Driver Password *'}</Label><Input type="password" required={!editingBus} value={form.driverPassword} onChange={(e) => setForm({ ...form, driverPassword: e.target.value })} className="rounded-xl h-12" /></div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowDialog(false); resetForm(); }} className="rounded-xl">Cancel</Button>
                  <Button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">{editingBus ? 'Update' : 'Add Bus'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>)}
        </div>

        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden">
          {buses.length === 0 ? <div className="flex flex-col items-center justify-center h-32"><p className="text-slate-400 font-medium">No buses added yet</p></div>
          : <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-slate-50">
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Bus Name</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Driver</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Driver Username</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Status</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {buses.map((b) => (
                    <TableRow key={b.id} className="hover:bg-slate-50/80">
                      <TableCell className="font-semibold text-slate-900">{b.busName}</TableCell>
                      <TableCell className="text-slate-600">{b.driverName}</TableCell>
                      <TableCell className="font-medium text-slate-700">{b.driverUsername}</TableCell>
                      <TableCell><span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${b.status === 'driving' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>{b.status === 'driving' ? 'Driving' : 'Stopped'}</span></TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {showEdit && <button onClick={() => openEdit(b)} data-testid={`edit-bus-${b.id}`} className="p-2 hover:bg-sky-100 rounded-lg transition-colors"><Edit className="w-4 h-4 text-sky-600" /></button>}
                          {showDelete && <button onClick={() => handleDelete(b.id)} data-testid={`delete-bus-${b.id}`} className="p-2 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-rose-600" /></button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>}
        </div>
      </div>
    </div>
  );
};

export default BusTracking;
