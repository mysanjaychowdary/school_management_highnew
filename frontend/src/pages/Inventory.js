import React, { useState, useEffect, useCallback } from 'react';
import { useAuth, canEdit } from '../lib/AuthContext';
import { Plus, Edit, Trash2, Package, ArrowRightFromLine } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';

const Inventory = () => {
  const { role, perms } = useAuth();
  const showEdit = canEdit(perms);
  const [items, setItems] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState({ itemName: '', quantity: '', category: '', purchaseDate: new Date().toISOString().split('T')[0], amount: '' });
  const [issueForm, setIssueForm] = useState({ itemId: '', studentCode: '', quantity: '', date: new Date().toISOString().split('T')[0] });

  const loadItems = useCallback(async () => {
    try { const r = await api.getInventory(); setItems(r.data); } catch (e) { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  const loadIssues = useCallback(async () => {
    try { const r = await api.getInventoryIssues(); setIssues(r.data); } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { loadItems(); loadIssues(); }, [loadItems, loadIssues]);

  const resetForm = () => { setForm({ itemName: '', quantity: '', category: '', purchaseDate: new Date().toISOString().split('T')[0], amount: '' }); setEditingItem(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = { ...form, quantity: parseInt(form.quantity), amount: parseFloat(form.amount) };
    try {
      if (editingItem) { await api.updateInventory(editingItem.id, data); toast.success('Updated'); }
      else { await api.createInventory(data); toast.success('Added'); }
      setShowDialog(false); resetForm(); loadItems();
    } catch (error) { toast.error('Failed to save'); }
  };

  const handleIssue = async (e) => {
    e.preventDefault();
    try {
      await api.issueInventory({ ...issueForm, quantity: parseInt(issueForm.quantity) });
      toast.success('Inventory issued to student. Stock deducted.');
      setShowIssueDialog(false);
      setIssueForm({ itemId: '', studentCode: '', quantity: '', date: new Date().toISOString().split('T')[0] });
      loadItems(); loadIssues();
    } catch (error) { toast.error(error.response?.data?.detail || 'Failed to issue'); }
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({ itemName: item.itemName, quantity: item.quantity, category: item.category, purchaseDate: item.purchaseDate, amount: item.amount });
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete?')) return;
    try { await api.deleteInventory(id); toast.success('Deleted'); loadItems(); } catch (e) { toast.error('Failed'); }
  };

  const totalValue = items.reduce((s, i) => s + (i.amount * i.quantity), 0);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>Inventory Management</h1>
          <p className="text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>Track inward and outward inventory</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
            <DialogTrigger asChild>
              <Button data-testid="issue-inventory-btn" className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl active:scale-95 transition-transform"><ArrowRightFromLine className="w-5 h-5 mr-2" />Issue to Student</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="text-2xl font-bold">Issue Inventory to Student</DialogTitle></DialogHeader>
              <form onSubmit={handleIssue} className="space-y-4">
                <div><Label>Select Item *</Label>
                  <Select value={issueForm.itemId} onValueChange={(v) => setIssueForm({ ...issueForm, itemId: v })}>
                    <SelectTrigger className="rounded-xl h-12"><SelectValue placeholder="Select item" /></SelectTrigger>
                    <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.itemName} (Stock: {i.quantity})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Student ID *</Label><Input required value={issueForm.studentCode} onChange={(e) => setIssueForm({ ...issueForm, studentCode: e.target.value })} className="rounded-xl h-12" placeholder="Enter Student ID (e.g., ADM001)" /></div>
                <div><Label>Quantity *</Label><Input type="number" required min="1" value={issueForm.quantity} onChange={(e) => setIssueForm({ ...issueForm, quantity: e.target.value })} className="rounded-xl h-12" /></div>
                <div><Label>Date *</Label><Input type="date" required value={issueForm.date} onChange={(e) => setIssueForm({ ...issueForm, date: e.target.value })} className="rounded-xl h-12" /></div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setShowIssueDialog(false)} className="rounded-xl">Cancel</Button>
                  <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl">Issue</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button data-testid="add-inventory-btn" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform"><Plus className="w-5 h-5 mr-2" />Add Item</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="text-2xl font-bold">{editingItem ? 'Edit' : 'Add'} Item</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div><Label>Item Name *</Label><Input required value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} className="rounded-xl h-12" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Quantity *</Label><Input type="number" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="rounded-xl h-12" /></div>
                  <div><Label>Amount/Unit *</Label><Input type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="rounded-xl h-12" /></div>
                </div>
                <div><Label>Category *</Label><Input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-xl h-12" /></div>
                <div><Label>Purchase Date *</Label><Input type="date" required value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} className="rounded-xl h-12" /></div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowDialog(false); resetForm(); }} className="rounded-xl">Cancel</Button>
                  <Button type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">{editingItem ? 'Update' : 'Add'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="bg-gradient-to-br from-indigo-400 to-indigo-600 rounded-2xl shadow-lg p-8 text-white">
        <div className="flex items-center gap-3 mb-2"><Package className="w-6 h-6" /><p className="text-sm font-bold uppercase tracking-widest opacity-90">Total Inventory Value</p></div>
        <p className="text-4xl font-extrabold">{'\u20B9'}{totalValue.toLocaleString()}</p>
        <p className="text-sm opacity-80 mt-1">{items.length} items | {issues.length} issued</p>
      </div>

      <Tabs defaultValue="stock" className="space-y-6">
        <TabsList className="bg-slate-100 p-1 rounded-xl inline-flex">
          <TabsTrigger value="stock" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 font-bold">Stock</TabsTrigger>
          <TabsTrigger value="issued" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg px-6 py-2 font-bold">Issued History</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden">
            {loading ? <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div></div>
            : items.length === 0 ? <div className="flex flex-col items-center justify-center h-64"><p className="text-slate-400 font-medium">No items</p></div>
            : <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow className="bg-slate-50">
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Item</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Category</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Stock</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Amount/Unit</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Actions</TableHead>
                </TableRow></TableHeader>
                <TableBody>{items.map((item) => (
                  <TableRow key={item.id} className="hover:bg-slate-50/80">
                    <TableCell className="font-semibold text-slate-900">{item.itemName}</TableCell>
                    <TableCell><span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">{item.category}</span></TableCell>
                    <TableCell className={`font-bold ${item.quantity <= 5 ? 'text-rose-600' : 'text-slate-900'}`}>{item.quantity}</TableCell>
                    <TableCell className="text-slate-600">{'\u20B9'}{item.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {showEdit && <>
                          <button onClick={() => openEdit(item)} data-testid={`edit-inventory-${item.id}`} className="p-2 hover:bg-sky-100 rounded-lg transition-colors"><Edit className="w-4 h-4 text-sky-600" /></button>
                          <button onClick={() => handleDelete(item.id)} data-testid={`delete-inventory-${item.id}`} className="p-2 hover:bg-rose-100 rounded-lg transition-colors"><Trash2 className="w-4 h-4 text-rose-600" /></button>
                        </>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></div>}
          </div>
        </TabsContent>

        <TabsContent value="issued">
          <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 overflow-hidden">
            {issues.length === 0 ? <div className="flex flex-col items-center justify-center h-64"><p className="text-slate-400 font-medium">No items issued yet</p></div>
            : <div className="overflow-x-auto"><Table>
                <TableHeader><TableRow className="bg-slate-50">
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Item</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Student</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Roll No</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Qty</TableHead>
                  <TableHead className="font-bold uppercase text-xs text-slate-600">Date</TableHead>
                </TableRow></TableHeader>
                <TableBody>{issues.map((iss) => (
                  <TableRow key={iss.id} className="hover:bg-slate-50/80">
                    <TableCell className="font-semibold text-slate-900">{iss.itemName}</TableCell>
                    <TableCell className="font-medium text-slate-700">{iss.studentName}</TableCell>
                    <TableCell>{iss.rollNo}</TableCell>
                    <TableCell className="font-bold">{iss.quantity}</TableCell>
                    <TableCell className="text-slate-600">{iss.date}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table></div>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Inventory;
