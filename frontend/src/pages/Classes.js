import React, { useState, useEffect } from 'react';
import { useAuth, canEdit } from '../lib/AuthContext';
import { Plus, Edit, Trash2, X } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';

const Classes = () => {
  const { role, perms } = useAuth();
  const showEdit = canEdit(perms);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [className, setClassName] = useState('');
  const [sectionInput, setSectionInput] = useState('');
  const [sections, setSections] = useState([]);

  useEffect(() => {
    loadClasses();
  }, []);

  const loadClasses = async () => {
    try {
      const response = await api.getClasses();
      setClasses(response.data);
    } catch (error) {
      toast.error('Failed to load classes');
    } finally {
      setLoading(false);
    }
  };

  const addSection = () => {
    const trimmed = sectionInput.trim().toUpperCase();
    if (trimmed && !sections.includes(trimmed)) {
      setSections([...sections, trimmed]);
      setSectionInput('');
    }
  };

  const removeSection = (s) => setSections(sections.filter((sec) => sec !== s));

  const resetForm = () => {
    setClassName('');
    setSections([]);
    setSectionInput('');
    setEditingClass(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (sections.length === 0) {
      toast.error('Add at least one section');
      return;
    }
    try {
      if (editingClass) {
        await api.updateClass(editingClass.id, { className, sections });
        toast.success('Class updated');
      } else {
        await api.createClass({ className, sections });
        toast.success('Class added');
      }
      setShowDialog(false);
      resetForm();
      loadClasses();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save');
    }
  };

  const openEdit = (cls) => {
    setEditingClass(cls);
    setClassName(cls.className);
    setSections([...cls.sections]);
    setShowDialog(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this class?')) return;
    try {
      await api.deleteClass(id);
      toast.success('Class deleted');
      loadClasses();
    } catch (error) {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>
            Classes & Sections
          </h1>
          <p className="text-base font-medium text-slate-600 mt-1" style={{ fontFamily: 'Figtree' }}>
            Manage school classes and their sections
          </p>
        </div>
        <Dialog open={showDialog} onOpenChange={(open) => { setShowDialog(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button data-testid="add-class-btn" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl active:scale-95 transition-transform">
              <Plus className="w-5 h-5 mr-2" />
              Add Class
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">{editingClass ? 'Edit Class' : 'Add New Class'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Class Name *</Label>
                <Input
                  data-testid="class-name-input"
                  required
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="rounded-xl h-12"
                  placeholder="e.g., 1, 2, 3, LKG, UKG"
                />
              </div>
              <div>
                <Label>Sections *</Label>
                <div className="flex gap-2 mt-2">
                  <Input
                    data-testid="section-input"
                    value={sectionInput}
                    onChange={(e) => setSectionInput(e.target.value)}
                    className="rounded-xl h-12"
                    placeholder="e.g., A"
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSection(); } }}
                  />
                  <Button type="button" onClick={addSection} className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl h-12 active:scale-95 transition-transform">
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {sections.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-bold bg-amber-100 text-amber-800">
                      {s}
                      <button type="button" onClick={() => removeSection(s)} className="hover:text-rose-600 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => { setShowDialog(false); resetForm(); }} className="rounded-xl">Cancel</Button>
                <Button data-testid="submit-class-btn" type="submit" className="bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl">
                  {editingClass ? 'Update' : 'Add Class'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
        </div>
      ) : classes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 flex flex-col items-center justify-center h-64">
          <p className="text-slate-400 font-medium">No classes added yet. Start by adding a class.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((cls) => (
            <div
              key={cls.id}
              data-testid={`class-card-${cls.className}`}
              className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-slate-100 p-6 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-sky-400 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
                    <span className="text-white font-extrabold text-xl">{cls.className}</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Class {cls.className}</h3>
                </div>
                {showEdit && (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(cls)} data-testid={`edit-class-${cls.className}`} className="p-2 hover:bg-sky-100 rounded-lg transition-colors">
                      <Edit className="w-4 h-4 text-sky-600" />
                    </button>
                    <button onClick={() => handleDelete(cls.id)} data-testid={`delete-class-${cls.className}`} className="p-2 hover:bg-rose-100 rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4 text-rose-600" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {cls.sections.map((s) => (
                  <span key={s} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                    Section {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Classes;
