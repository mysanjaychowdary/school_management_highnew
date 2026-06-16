import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, Users, ClipboardCheck, DollarSign, ShoppingCart, Settings, BookOpen, Package, CalendarDays, BookOpenCheck, UserCog, LogOut, Menu, X, ShieldCheck, BarChart3, KeyRound, AlertTriangle, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';
import { useAuth, canAccess } from '../lib/AuthContext';
import { api } from '../lib/api';
import '../lib/loader';
import GlobalLoader from './GlobalLoader';

const allNavItems = [
  { path: '/', label: 'Dashboard', icon: GraduationCap, group: 'main' },
  { path: '/classes', label: 'Classes', icon: BookOpen, group: 'academics' },
  { path: '/students', label: 'Students', icon: Users, group: 'academics' },
  { path: '/attendance', label: 'Attendance', icon: ClipboardCheck, group: 'academics' },
  { path: '/marks', label: 'Marks', icon: BarChart3, group: 'academics' },
  { path: '/homework', label: 'Homework', icon: BookOpenCheck, group: 'academics' },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays, group: 'academics' },
  { path: '/fees', label: 'Fees', icon: DollarSign, group: 'finance' },
  { path: '/expenses', label: 'Expenses', icon: ShoppingCart, group: 'finance' },
  { path: '/inventory', label: 'Inventory', icon: Package, group: 'finance' },
  { path: '/staff', label: 'Staff', icon: UserCog, group: 'people' },
  { path: '/approvals', label: 'Approvals', icon: ShieldCheck, group: 'people' },
  { path: '/complaints', label: 'Complaints', icon: AlertTriangle, group: 'people' },
  { path: '/roles', label: 'Roles', icon: KeyRound, group: 'admin' },
  { path: '/settings', label: 'Settings', icon: Settings, group: 'admin' },
];

const GROUP_LABELS = {
  main: '',
  academics: 'Academics',
  finance: 'Finance',
  people: 'People',
  admin: 'System',
};

const COLLAPSED_KEY = 'sidebar-collapsed';

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, perms, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored !== null) return stored === '1';
    return window.innerWidth < 1100;
  });
  const [branding, setBranding] = useState({ schoolName: 'SchoolPro', logoUrl: '' });
  const [complaintCounts, setComplaintCounts] = useState({ overdue: 0, pending: 0 });

  const isComplaintManager = role === 'super_admin' || role === 'admin_role';

  // Auto-collapse on small desktop widths (>= 1024 means lg, < 1100 forces collapse)
  useEffect(() => {
    const onResize = () => {
      if (typeof window === 'undefined') return;
      if (window.innerWidth >= 1024 && window.innerWidth < 1100) {
        const stored = localStorage.getItem(COLLAPSED_KEY);
        if (stored === null) setCollapsed(true);
      }
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

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

  // Group nav items
  const grouped = navItems.reduce((acc, it) => {
    (acc[it.group] = acc[it.group] || []).push(it);
    return acc;
  }, {});
  const groupOrder = ['main', 'academics', 'finance', 'people', 'admin'];

  const sidebarWidth = collapsed ? 'lg:w-[72px]' : 'lg:w-64';
  const mainOffset = collapsed ? 'lg:ml-[72px]' : 'lg:ml-64';

  const navProps = {
    collapsed,
    branding,
    isCustomName,
    grouped,
    groupOrder,
    pathname: location.pathname,
    isComplaintManager,
    complaintCounts,
    complaintBadge,
    user,
    roleLabel: getRoleLabel(),
    onNavClick: () => setSidebarOpen(false),
    onLogout: handleLogout,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50/30">
      <GlobalLoader />

      {/* ============ Mobile top bar ============ */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white/85 backdrop-blur-md border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setSidebarOpen(true)} data-testid="mobile-menu-btn" className="p-2 hover:bg-slate-100 rounded-xl active:scale-95 transition-transform">
            <Menu className="w-6 h-6 text-slate-700" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt="logo" className="w-8 h-8 rounded-xl object-cover bg-white border border-slate-200 flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
            )}
            <span className="text-base font-extrabold text-slate-900 truncate max-w-[180px]" style={{ fontFamily: 'Nunito' }}>{branding.schoolName}</span>
          </div>
        </div>
        <button onClick={handleLogout} className="p-2 hover:bg-rose-50 rounded-xl active:scale-95 transition-transform"><LogOut className="w-5 h-5 text-rose-600" /></button>
      </div>

      {/* ============ Mobile drawer ============ */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-slate-950 flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex justify-end p-2">
              <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-white/10 rounded-xl"><X className="w-5 h-5 text-slate-300" /></button>
            </div>
            <NavContent {...navProps} mobile />
          </div>
        </div>
      )}

      {/* ============ Desktop sidebar ============ */}
      <aside data-testid="desktop-sidebar" className={`hidden lg:flex ${sidebarWidth} bg-slate-950 fixed h-full flex-col z-30 border-r border-white/5 shadow-[0_0_40px_rgba(0,0,0,0.15)] transition-[width] duration-300 ease-in-out`}>
        <NavContent {...navProps} />

        {/* Collapse toggle */}
        <button
          data-testid="sidebar-toggle-btn"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-20 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center text-slate-500 hover:text-emerald-600 hover:border-emerald-200 transition-all z-40"
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>
      </aside>

      {/* ============ Main content ============ */}
      <main className={`${mainOffset} w-full transition-[margin] duration-300 ease-in-out`}>
        <div className="px-4 sm:px-6 lg:px-8 pt-20 lg:pt-8 pb-12 max-w-[1600px] mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

// Hoisted out of Layout to avoid no-unstable-nested-components

const NavLinkItem = ({ item, collapsed, mobile, pathname, isComplaintManager, complaintCounts, complaintBadge, onNavClick }) => {
  const Icon = item.icon;
  const isActive = pathname === item.path;
  const showBadge = item.path === '/complaints' && isComplaintManager && complaintBadge > 0;
  const isCollapsedDesktop = collapsed && !mobile;
  return (
    <Link
      to={item.path}
      data-testid={`nav-${item.label.toLowerCase()}`}
      onClick={onNavClick}
      title={isCollapsedDesktop ? item.label : undefined}
      className={`group relative flex items-center gap-3 ${isCollapsedDesktop ? 'justify-center px-0 py-3' : 'px-3 py-2.5'} mx-2 rounded-xl font-semibold text-[13px] tracking-wide transition-all duration-200 ${
        isActive
          ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 text-emerald-300 border border-emerald-500/30 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.15)]'
          : 'text-slate-400 hover:text-white hover:bg-white/5'
      }`}
    >
      {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]" />}
      <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? 'text-emerald-300' : 'text-slate-500 group-hover:text-white'}`} strokeWidth={2.2} />
      {!isCollapsedDesktop && <span className="flex-1 truncate">{item.label}</span>}
      {showBadge && !isCollapsedDesktop && (
        <span data-testid="complaints-badge" className={`inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 rounded-full text-[10px] font-extrabold ${complaintCounts.overdue > 0 ? 'bg-rose-500 text-white' : 'bg-amber-400 text-amber-900'}`}>
          {complaintBadge}
        </span>
      )}
      {showBadge && isCollapsedDesktop && (
        <span data-testid="complaints-badge-dot" className={`absolute top-1.5 right-2 w-2 h-2 rounded-full ${complaintCounts.overdue > 0 ? 'bg-rose-500' : 'bg-amber-400'}`} />
      )}
    </Link>
  );
};

const NavContent = ({ mobile = false, collapsed, branding, isCustomName, grouped, groupOrder, pathname, isComplaintManager, complaintCounts, complaintBadge, user, roleLabel, onNavClick, onLogout }) => {
  const showLabels = !collapsed || mobile;
  return (
    <>
      {/* Brand */}
      <div className={`flex items-center ${showLabels ? 'gap-3 px-5' : 'justify-center px-2'} py-5 border-b border-white/5 flex-shrink-0`}>
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt="logo" className="w-10 h-10 rounded-xl object-cover bg-white/10 border border-white/10 flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/30">
            <GraduationCap className="w-5 h-5 text-white" strokeWidth={2.5} />
          </div>
        )}
        {showLabels && (
          <div className="min-w-0">
            <h1 className="text-base font-extrabold text-white truncate" style={{ fontFamily: 'Nunito' }}>{branding.schoolName}</h1>
            {!isCustomName && <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">Admin Console</p>}
          </div>
        )}
      </div>

      {/* Nav (groups) */}
      <nav className="flex-1 overflow-y-auto py-3 sidebar-scroll">
        {groupOrder.map((g) => {
          const items = grouped[g];
          if (!items || items.length === 0) return null;
          const label = GROUP_LABELS[g];
          return (
            <div key={g} className="mb-3">
              {showLabels && label && (
                <p className="px-5 mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</p>
              )}
              {!showLabels && label && <div className="mx-4 my-1.5 border-t border-white/5" />}
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLinkItem key={item.path} item={item} collapsed={collapsed} mobile={mobile} pathname={pathname} isComplaintManager={isComplaintManager} complaintCounts={complaintCounts} complaintBadge={complaintBadge} onNavClick={onNavClick} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      <div className={`flex-shrink-0 border-t border-white/5 ${showLabels ? 'p-4' : 'p-2'}`}>
        {showLabels ? (
          <>
            <div className="flex items-center gap-3 mb-3 px-1">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-md">
                <span className="text-sm font-extrabold text-white">{(user?.name || user?.username || '?')[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{user?.name || user?.username}</p>
                <p className="text-[11px] text-slate-400 font-medium">{roleLabel}</p>
              </div>
            </div>
            <button onClick={onLogout} data-testid="logout-btn"
              className="flex items-center gap-2 w-full px-3 py-2 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 rounded-lg font-bold text-sm transition-all">
              <LogOut className="w-4 h-4" />Logout
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-md" title={user?.name || user?.username}>
              <span className="text-sm font-extrabold text-white">{(user?.name || user?.username || '?')[0].toUpperCase()}</span>
            </div>
            <button onClick={onLogout} data-testid="logout-btn-collapsed" title="Logout"
              className="p-2 text-rose-300 hover:bg-rose-500/15 hover:text-rose-200 rounded-lg transition-all">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default Layout;
