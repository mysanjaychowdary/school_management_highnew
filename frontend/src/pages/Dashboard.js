import React, { useState, useEffect } from 'react';
import { Users, UserCheck, UserX, DollarSign } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalStudents: 0,
    presentToday: 0,
    absentToday: 0,
    totalFeesCollected: 0,
    pendingFees: 0,
  });
  const [loading, setLoading] = useState(true);
  const [schoolName, setSchoolName] = useState('SchoolPro');

  useEffect(() => {
    loadStats();
    api.getSchoolSettings()
      .then((r) => setSchoolName(r.data?.schoolName || 'SchoolPro'))
      .catch(() => {});
  }, []);

  const loadStats = async () => {
    try {
      const response = await api.getDashboardStats();
      setStats(response.data);
    } catch (error) {
      toast.error('Failed to load dashboard stats');
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Students',
      value: stats.totalStudents,
      icon: Users,
      bg: 'bg-gradient-to-br from-sky-400 to-sky-600',
      testId: 'total-students-stat',
    },
    {
      title: 'Present Today',
      value: stats.presentToday,
      icon: UserCheck,
      bg: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
      testId: 'present-today-stat',
    },
    {
      title: 'Absent Today',
      value: stats.absentToday,
      icon: UserX,
      bg: 'bg-gradient-to-br from-rose-400 to-rose-600',
      testId: 'absent-today-stat',
    },
    {
      title: 'Fees Collected',
      value: `₹${stats.totalFeesCollected.toLocaleString()}`,
      icon: DollarSign,
      bg: 'bg-gradient-to-br from-amber-400 to-amber-600',
      testId: 'fees-collected-stat',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: 'Nunito' }}>
              Good Morning, Admin!
            </h1>
            <p className="text-base font-medium text-slate-600 mt-2" style={{ fontFamily: 'Figtree' }}>
              Welcome to {schoolName}
            </p>
          </div>
          <div className="hidden md:block">
            <div className="text-right">
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest">Today</p>
              <p className="text-2xl font-bold text-slate-800">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              data-testid={card.testId}
              className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-slate-100 p-6 transition-all duration-300 hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-widest text-slate-400" style={{ fontFamily: 'Figtree' }}>
                    {card.title}
                  </p>
                  <p className="text-3xl font-extrabold text-slate-900 mt-3" style={{ fontFamily: 'Nunito' }}>
                    {card.value}
                  </p>
                </div>
                <div className={`${card.bg} w-14 h-14 rounded-xl flex items-center justify-center shadow-lg`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-6">
        <h2 className="text-2xl font-bold text-slate-800 mb-4" style={{ fontFamily: 'Nunito' }}>Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/students"
            data-testid="quick-add-student"
            className="p-4 rounded-xl bg-sky-100 text-sky-700 hover:bg-sky-200 transition-all duration-200 active:scale-95 font-bold flex items-center gap-3"
          >
            <Users className="w-5 h-5" />
            Add New Student
          </a>
          <a
            href="/attendance"
            data-testid="quick-mark-attendance"
            className="p-4 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-all duration-200 active:scale-95 font-bold flex items-center gap-3"
          >
            <UserCheck className="w-5 h-5" />
            Mark Attendance
          </a>
          <a
            href="/fees"
            data-testid="quick-collect-fee"
            className="p-4 rounded-xl bg-amber-100 text-amber-700 hover:bg-amber-200 transition-all duration-200 active:scale-95 font-bold flex items-center gap-3"
          >
            <DollarSign className="w-5 h-5" />
            Collect Fee
          </a>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
