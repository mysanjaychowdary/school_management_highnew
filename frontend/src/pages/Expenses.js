import React, { useState, useEffect } from 'react';
import { Plus, Upload, Calendar } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, canEdit } from '../lib/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';

const Expenses = () => {
  const { perms } = useAuth();
  const showEdit = canEdit(perms, 'expenses');
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [filters, setFilters] = useState({ startDate: '', endDate: '' });
  const [formData, setFormData] = useState({
    expenseName: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    billUrl: '',
  });
  const [billFile, setBillFile] = useState(null);

  useEffect(() => {
    loadExpenses();
  }, [filters]);

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const response = await api.getExpenses(filters);
      setExpenses(response.data);
    } catch (error) {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  const handleBillUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setBillFile(file);
      const response = await api.uploadFile(file);
      setFormData({ ...formData, billUrl: response.data.url });
      toast.success('Bill uploaded successfully');
    } catch (error) {
      toast.error('Failed to upload bill');
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();

    if (!formData.billUrl) {
      toast.error('Please upload bill');
      return;
    }

    try {
      await api.createExpense({
        ...formData,
        amount: parseFloat(formData.amount),
      });
      toast.success('Expense added successfully');
      setShowAddDialog(false);
      resetForm();
      loadExpenses();
    } catch (error) {
      toast.error('Failed to add expense');
    }
  };

  const resetForm = () => {
    setFormData({
      expenseName: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      billUrl: '',
    });
    setBillFile(null);
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>
            Expense Management
          </h1>
          <p className="text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>
            Track and manage school expenses
          </p>
        </div>
        {showEdit && <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button data-testid="add-expense-btn" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform">
              <Plus className="w-5 h-5 mr-2" />
              Add Expense
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">Add New Expense</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <div>
                <Label>Expense Name *</Label>
                <Input
                  data-testid="expense-name-input"
                  required
                  value={formData.expenseName}
                  onChange={(e) => setFormData({ ...formData, expenseName: e.target.value })}
                  className="rounded-xl h-12"
                  placeholder="e.g., Office Supplies"
                />
              </div>
              <div>
                <Label>Amount *</Label>
                <Input
                  data-testid="expense-amount-input"
                  type="number"
                  required
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="rounded-xl h-12"
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  data-testid="expense-date-input"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="rounded-xl h-12"
                />
              </div>
              <div>
                <Label>Upload Bill * (Mandatory)</Label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleBillUpload}
                  data-testid="expense-bill-input"
                  required
                  className="mt-2 block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-bold file:bg-sky-100 file:text-sky-700 hover:file:bg-sky-200"
                />
                {formData.billUrl && (
                  <div className="mt-2">
                    {formData.billUrl.startsWith('data:image') ? (
                      <img src={formData.billUrl} alt="Bill" className="max-w-xs rounded-xl border border-slate-200" />
                    ) : (
                      <p className="text-sm text-emerald-600 font-medium">Bill uploaded successfully</p>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-xl">
                  Cancel
                </Button>
                <Button data-testid="submit-expense-btn" type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">
                  Add Expense
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
        <h2 className="text-lg font-bold text-slate-800 mb-4">Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Start Date</Label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="rounded-xl h-12"
            />
          </div>
          <div>
            <Label>End Date</Label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="rounded-xl h-12"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={loadExpenses}
              className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl h-12 w-full active:scale-95 transition-transform"
            >
              <Calendar className="w-5 h-5 mr-2" />
              Apply Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Total Summary */}
      <div className="bg-gradient-to-br from-rose-400 to-rose-600 rounded-2xl shadow-lg p-8 text-white">
        <p className="text-sm font-bold uppercase tracking-widest opacity-90">Total Expenses</p>
        <p className="text-4xl font-extrabold mt-2">₹{totalExpenses.toLocaleString()}</p>
      </div>

      {/* Expenses List */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Expense Records</h2>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
          </div>
        ) : expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <p className="text-slate-400 font-medium">No expenses found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                data-testid={`expense-row-${expense.id}`}
                className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-bold text-slate-900 text-lg">{expense.expenseName}</p>
                  <p className="text-sm text-slate-600 mt-1">{expense.date}</p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-2xl font-extrabold text-rose-600">₹{expense.amount.toLocaleString()}</p>
                  {expense.billUrl && (
                    <a
                      href={expense.billUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`view-bill-${expense.id}`}
                      className="px-4 py-2 bg-sky-100 text-sky-700 hover:bg-sky-200 rounded-xl font-bold text-sm transition-colors"
                    >
                      View Bill
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Expenses;
