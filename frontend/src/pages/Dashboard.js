import React, { useState, useEffect } from 'react';
import { Users, UserCheck, UserX, DollarSign, Sparkles, TrendingUp, ArrowUpRight } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
};

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

  const attRate = stats.totalStudents > 0 ? Math.round((stats.presentToday / stats.totalStudents) * 100) : 0;

  const statCards = [
    { title: 'Total Students', value: stats.totalStudents, icon: Users, ring: 'ring-sky-100', bg: 'bg-gradient-to-br from-sky-500 to-sky-600', tint: 'from-sky-50 to-white', testId: 'total-students-stat', sub: 'enrolled' },
    { title: 'Present Today', value: stats.presentToday, icon: UserCheck, ring: 'ring-emerald-100', bg: 'bg-gradient-to-br from-emerald-500 to-emerald-600', tint: 'from-emerald-50 to-white', testId: 'present-today-stat', sub: `${attRate}% rate` },
    { title: 'Absent Today', value: stats.absentToday, icon: UserX, ring: 'ring-rose-100', bg: 'bg-gradient-to-br from-rose-500 to-rose-600', tint: 'from-rose-50 to-white', testId: 'absent-today-stat', sub: 'today' },
    { title: 'Fees Collected', value: `\u20B9${stats.totalFeesCollected.toLocaleString()}`, icon: DollarSign, ring: 'ring-amber-100', bg: 'bg-gradient-to-br from-amber-500 to-orange-500', tint: 'from-amber-50 to-white', testId: 'fees-collected-stat', sub: 'lifetime' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 rounded-3xl shadow-2xl shadow-slate-200">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(56,189,248,0.6) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(167,139,250,0.5) 0%, transparent 40%)' }} />
        <div className="relative p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-200 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full"><Sparkles className="w-3 h-3" />{schoolName}</span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mt-3 tracking-tight" style={{ fontFamily: 'Nunito' }}>
                {greeting()}, Admin
              </h1>
              <p className="text-sm sm:text-base font-medium text-slate-300 mt-2" style={{ fontFamily: 'Figtree' }}>
                Here&apos;s what&apos;s happening at your school today.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl px-4 py-3 text-right">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Today</p>
                <p className="text-lg sm:text-xl font-extrabold text-white whitespace-nowrap">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
              </div>
              <div className="hidden sm:block bg-emerald-400/15 backdrop-blur-sm border border-emerald-300/30 rounded-2xl px-4 py-3 text-center">
                <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest flex items-center gap-1"><TrendingUp className="w-3 h-3" />Att.</p>
                <p className="text-lg sm:text-xl font-extrabold text-emerald-300">{attRate}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              data-testid={card.testId}
              className={`group relative overflow-hidden bg-gradient-to-br ${card.tint} rounded-2xl ring-1 ${card.ring} border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_18px_45px_rgba(0,0,0,0.08)] p-4 sm:p-5 transition-all duration-300 hover:-translate-y-1`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`${card.bg} w-11 h-11 rounded-xl flex items-center justify-center shadow-md`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
              </div>
              <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-slate-400 mt-4" style={{ fontFamily: 'Figtree' }}>
                {card.title}
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1 leading-tight" style={{ fontFamily: 'Nunito' }}>
                {card.value}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-semibold">{card.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-5 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mb-4" style={{ fontFamily: 'Nunito' }}>Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { href: '/students', label: 'Add New Student', icon: Users, testId: 'quick-add-student', grad: 'from-sky-500 to-blue-600' },
            { href: '/attendance', label: 'Mark Attendance', icon: UserCheck, testId: 'quick-mark-attendance', grad: 'from-emerald-500 to-teal-600' },
            { href: '/fees', label: 'Collect Fee', icon: DollarSign, testId: 'quick-collect-fee', grad: 'from-amber-500 to-orange-600' },
          ].map((a) => {
            const Icon = a.icon;
            return (
              <a key={a.href} href={a.href} data-testid={a.testId}
                className={`group relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br ${a.grad} text-white font-bold flex items-center justify-between shadow-md hover:shadow-xl hover:-translate-y-0.5 active:scale-95 transition-all`}>
                <span className="flex items-center gap-3">
                  <Icon className="w-5 h-5" />
                  {a.label}
                </span>
                <ArrowUpRight className="w-4 h-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
