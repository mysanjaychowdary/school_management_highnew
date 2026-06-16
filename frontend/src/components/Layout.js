import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, Users, ClipboardCheck, DollarSign, ShoppingCart, Settings, BookOpen, Package, CalendarDays, BookOpenCheck, UserCog, LogOut, Menu, X, ShieldCheck, BarChart3, KeyRound, AlertTriangle } from 'lucide-react';
import { useAuth, canAccess } from '../lib/AuthContext';
import { api } from '../lib/api';
import '../lib/loader';
import GlobalLoader from './GlobalLoader';

const allNavItems = [
  { path: '/', label: 'Dashboard', icon: GraduationCap },
  { path: '/classes', label: 'Classes', icon: BookOpen },
  { path: '/students', label: 'Students', icon: Users },
  { path: '/attendance', label: 'Attendance', icon: ClipboardCheck },
  { path: '/fees', label: 'Fees', icon: DollarSign },
  { path: '/expenses', label: 'Expenses', icon: ShoppingCart },
  { path: '/inventory', label: 'Inventory', icon: Package },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/homework', label: 'Homework', icon: BookOpenCheck },
  { path: '/marks', label: 'Marks', icon: BarChart3 },
  { path: '/staff', label: 'Staff', icon: UserCog },
  { path: '/approvals', label: 'Approvals', icon: ShieldCheck },
  { path: '/complaints', label: 'Complaints', icon: AlertTriangle },
  { path: '/roles', label: 'Roles', icon: KeyRound },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, perms, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [branding, setBranding] = useState({ schoolName: 'SchoolPro', logoUrl: '' });
  const [complaintCounts, setComplaintCounts] = useState({ overdue: 0, pending: 0 });

  const isComplaintManager = role === 'super_admin' || role === 'admin_role';

  useEffect(() => {
    api.getSchoolSettings()
      .then((r) => setBranding({ schoolName: r.data?.schoolName || 'SchoolPro', logoUrl: r.data?.logoUrl || '' }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isComplaintManager) return;
    let active = true;
    const fetchCounts = () => {
      api.getComplaintsOverdue()
        .then((r) => { if (active) setComplaintCounts({ overdue: r.data?.overdue || 0, pending: r.data?.pending || 0 }); })
        .catch(() => {});
    };
    fetchCounts();
    const id = setInterval(fetchCounts, 60000);
    return () => { active = false; clearInterval(id); };
  }, [isComplaintManager, location.pathname]);

  const navItems = allNavItems.filter((item) => canAccess(perms, item.path));
  const isCustomName = branding.schoolName && branding.schoolName !== 'SchoolPro';
  const complaintBadge = (complaintCounts.overdue || 0) + (complaintCounts.pending || 0);

  const handleLogout = () => { logout(); navigate('/'); };

  const getRoleLabel = () => {
    if (perms?.label) return perms.label;
    if (role === 'super_admin') return 'Super Admin';
    if (role === 'admin_role') return 'Admin';
    if (role === 'teacher') return 'Teacher';
    if (role === 'office_staff') return 'Office Staff';
    return role || '';
  };

  const NavContent = () => (
    <>
      <div className="p-5 flex-1 overflow-y-auto">
        <div className="flex items-center gap-3 mb-8">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="School logo" className="w-11 h-11 rounded-2xl object-cover flex-shrink-0 border border-slate-200 bg-white" />
          ) : (
            <div className="w-11 h-11 bg-gradient-to-br from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold text-slate-900 truncate" style={{ fontFamily: 'Nunito' }}>{branding.schoolName}</h1>
            {!isCustomName && <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Management System</p>}
          </div>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            const showBadge = item.path === '/complaints' && isComplaintManager && complaintBadge > 0;
            return (
              <Link key={item.path} to={item.path} data-testid={`nav-${item.label.toLowerCase()}`}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 active:scale-95 ${
                  isActive ? 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-lg shadow-sky-200' : 'text-slate-600 hover:bg-slate-100'
                }`}>
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span data-testid="complaints-badge" className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-extrabold ${complaintCounts.overdue > 0 ? 'bg-rose-500 text-white' : (isActive ? 'bg-white text-sky-600' : 'bg-amber-500 text-white')}`}>
                    {complaintBadge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-slate-600">{(user?.name || user?.username || '?')[0].toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{user?.name || user?.username}</p>
            <p className="text-xs text-slate-500">{getRoleLabel()}</p>
          </div>
        </div>
        <button onClick={handleLogout} data-testid="logout-btn"
          className="flex items-center gap-2 w-full px-4 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-sm transition-all">
          <LogOut className="w-4 h-4" />Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <GlobalLoader />
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(true)} data-testid="mobile-menu-btn" className="p-2 hover:bg-slate-100 rounded-xl">
            <Menu className="w-6 h-6 text-slate-700" />
          </button>
          <div className="flex items-center gap-2">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="logo" className="w-8 h-8 rounded-xl object-cover border border-slate-200 bg-white" />
            ) : (
              <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-sky-600 rounded-xl flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
            )}
            <span className="text-base font-extrabold text-slate-900 truncate max-w-[200px]" style={{ fontFamily: 'Nunito' }}>{branding.schoolName}</span>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 hover:bg-rose-50 rounded-xl"><LogOut className="w-5 h-5 text-rose-600" /></button>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex justify-end p-3">
              <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5 text-slate-600" /></button>
            </div>
            <NavContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-64 bg-white/80 backdrop-blur-sm border-r border-slate-200/80 fixed h-full flex-col shadow-[0_0_30px_rgba(0,0,0,0.04)]">
        <NavContent />
      </div>

      {/* Main content */}
      <div className="lg:ml-64 flex-1 w-full">
        <div className="p-4 sm:p-6 lg:p-8 pt-20 lg:pt-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;
