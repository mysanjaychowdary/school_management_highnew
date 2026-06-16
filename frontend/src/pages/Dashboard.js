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
    { title: 'Total Students', value: stats.totalStudents, icon: Users, accent: 'emerald', testId: 'total-students-stat', sub: 'enrolled' },
    { title: 'Present Today', value: stats.presentToday, icon: UserCheck, accent: 'teal', testId: 'present-today-stat', sub: `${attRate}% rate` },
    { title: 'Absent Today', value: stats.absentToday, icon: UserX, accent: 'rose', testId: 'absent-today-stat', sub: 'today' },
    { title: 'Fees Collected', value: `\u20B9${stats.totalFeesCollected.toLocaleString()}`, icon: DollarSign, accent: 'amber', testId: 'fees-collected-stat', sub: 'lifetime' },
  ];

  const accentMap = {
    emerald: { bg: 'bg-gradient-to-br from-emerald-500 to-emerald-600', ring: 'ring-emerald-100/70', tint: 'from-emerald-50/40 to-white' },
    teal: { bg: 'bg-gradient-to-br from-teal-500 to-cyan-600', ring: 'ring-teal-100/70', tint: 'from-teal-50/40 to-white' },
    rose: { bg: 'bg-gradient-to-br from-rose-500 to-pink-600', ring: 'ring-rose-100/70', tint: 'from-rose-50/40 to-white' },
    amber: { bg: 'bg-gradient-to-br from-amber-500 to-orange-500', ring: 'ring-amber-100/70', tint: 'from-amber-50/40 to-white' },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 rounded-[28px] shadow-xl shadow-slate-200/60 ring-1 ring-slate-900/5">
        {/* Decorative pattern */}
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'radial-gradient(circle at 15% 25%, rgba(52,211,153,0.35) 0%, transparent 45%), radial-gradient(circle at 85% 75%, rgba(20,184,166,0.25) 0%, transparent 45%)' }} />
        <div className="absolute -top-12 -right-12 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative p-6 sm:p-8 lg:p-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-200 bg-emerald-500/15 backdrop-blur-sm border border-emerald-400/20 px-3 py-1 rounded-full"><Sparkles className="w-3 h-3" />{schoolName}</span>
              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-white mt-3 tracking-tight leading-[1.1]" style={{ fontFamily: 'Nunito' }}>
                {greeting()}, Admin
              </h1>
              <p className="text-sm sm:text-base font-medium text-slate-300 mt-2 max-w-lg" style={{ fontFamily: 'Figtree' }}>
                Here&apos;s a quick look at your school today. Everything is in good shape.
              </p>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              <div className="bg-white/8 backdrop-blur-sm border border-white/15 rounded-2xl px-5 py-3.5 text-right">
                <p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Today</p>
                <p className="text-lg sm:text-xl font-extrabold text-white whitespace-nowrap">{new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
              </div>
              <div className="hidden sm:block bg-emerald-400/15 backdrop-blur-sm border border-emerald-300/25 rounded-2xl px-5 py-3.5 text-center">
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
          const a = accentMap[card.accent];
          return (
            <div
              key={card.title}
              data-testid={card.testId}
              className={`group relative overflow-hidden bg-gradient-to-br ${a.tint} rounded-2xl ring-1 ${a.ring} border border-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.08)] p-5 transition-all duration-300 hover:-translate-y-1`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`${a.bg} w-11 h-11 rounded-xl flex items-center justify-center shadow-md`}>
                  <Icon className="w-5 h-5 text-white" strokeWidth={2.4} />
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
      <div className="bg-white rounded-[28px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-slate-100 p-5 sm:p-6">
        <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mb-4" style={{ fontFamily: 'Nunito' }}>Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { href: '/students', label: 'Add New Student', icon: Users, testId: 'quick-add-student', grad: 'from-emerald-500 to-teal-600' },
            { href: '/attendance', label: 'Mark Attendance', icon: UserCheck, testId: 'quick-mark-attendance', grad: 'from-sky-500 to-indigo-600' },
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
