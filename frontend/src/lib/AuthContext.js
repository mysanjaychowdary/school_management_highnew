import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getToken, setToken as persistToken, clearToken } from './api';

const AuthContext = createContext();

// Default permission fallback when no role details
const DEFAULT_PERMS = {
  modules: [],
  canEdit: false, canDelete: false, canExport: false,
  canEditFees: false, canRevertFees: false, canApproveConcession: false, canSeeFullMobile: false,
  modulePerms: {},
};

// Module key -> route path
const MODULE_PATHS = {
  dashboard: '/', classes: '/classes', students: '/students', attendance: '/attendance',
  fees: '/fees', expenses: '/expenses', inventory: '/inventory', calendar: '/calendar',
  homework: '/homework', marks: '/marks', staff: '/staff', approvals: '/approvals',
  roles: '/roles', complaints: '/complaints', settings: '/settings', busTracking: '/bus-tracking',
  hallTickets: '/hall-tickets',
};
const PATH_TO_MODULE = Object.fromEntries(Object.entries(MODULE_PATHS).map(([m, p]) => [p, m]));

export const AVAILABLE_MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'classes', label: 'Classes' },
  { key: 'students', label: 'Students' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'fees', label: 'Fees' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'homework', label: 'Homework' },
  { key: 'marks', label: 'Marks' },
  { key: 'staff', label: 'Staff' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'complaints', label: 'Complaints' },
  { key: 'roles', label: 'Roles' },
  { key: 'settings', label: 'Settings' },
  { key: 'busTracking', label: 'Bus Tracking' },
  { key: 'hallTickets', label: 'Hall Tickets' },
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [perms, setPerms] = useState(DEFAULT_PERMS);
  const [loaded, setLoaded] = useState(false);
  const [impersonating, setImpersonating] = useState(false);
  const [adminSession, setAdminSession] = useState(null);
  const [disabledModules, setDisabledModules] = useState([]);

  const refreshDisabledModules = useCallback(async () => {
    try {
      const r = await api.getEnabledModules();
      setDisabledModules(r.data?.disabledModules || []);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('schoolpro_auth');
    if (stored) {
      try {
        const d = JSON.parse(stored);
        setUser(d.user);
        setRole(d.role);
        setPerms(d.perms || DEFAULT_PERMS);
        setImpersonating(!!d.impersonating);
        setAdminSession(d.adminSession || null);
      } catch (e) { /* ignore */ }
    }
    refreshDisabledModules().finally(() => setLoaded(true));
  }, [refreshDisabledModules]);

  const persist = (userData, roleName, p, impersonatingFlag, adminSessionData) => {
    localStorage.setItem('schoolpro_auth', JSON.stringify({ user: userData, role: roleName, perms: p, impersonating: impersonatingFlag, adminSession: adminSessionData }));
  };

  const login = (userData, roleName, roleDetails, token) => {
    const p = roleDetails ? { ...DEFAULT_PERMS, ...roleDetails } : DEFAULT_PERMS;
    setUser(userData); setRole(roleName); setPerms(p); setImpersonating(false); setAdminSession(null);
    persist(userData, roleName, p, false, null);
    persistToken(token);
    refreshDisabledModules();
  };

  const logout = () => {
    setUser(null); setRole(null); setPerms(DEFAULT_PERMS); setImpersonating(false); setAdminSession(null);
    localStorage.removeItem('schoolpro_auth');
    clearToken();
  };

  const impersonateStaff = (userData, roleName, roleDetails, token) => {
    const p = roleDetails ? { ...DEFAULT_PERMS, ...roleDetails } : DEFAULT_PERMS;
    const snapshot = impersonating ? adminSession : { user, role, perms, token: getToken() };
    setAdminSession(snapshot); setImpersonating(true);
    setUser(userData); setRole(roleName); setPerms(p);
    persist(userData, roleName, p, true, snapshot);
    persistToken(token);
    refreshDisabledModules();
  };

  const returnToAdmin = () => {
    if (!adminSession) return;
    setUser(adminSession.user); setRole(adminSession.role); setPerms(adminSession.perms);
    setImpersonating(false); setAdminSession(null);
    persist(adminSession.user, adminSession.role, adminSession.perms, false, null);
    if (adminSession.token) persistToken(adminSession.token);
  };

  return (
    <AuthContext.Provider value={{ user, role, perms, login, logout, loaded, impersonating, adminSession, impersonateStaff, returnToAdmin, disabledModules, refreshDisabledModules }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

// ----- Access helpers -----

// Permission helpers (read from auth perms loaded at login)
export const canAccess = (perms, path, disabledModules = []) => {
  if (!perms) return false;
  const mod = PATH_TO_MODULE[path];
  if (!mod) return false;
  return (perms.modules || []).includes(mod) && !disabledModules.includes(mod);
};

export const getNavItems = (perms) => (perms?.modules || []);

// Role-based capability checks — now driven by perms object (NOT hardcoded role strings)
// Optional `module` arg lets pages check per-module CRUD permissions.
// If modulePerms[module][action] is explicitly true|false, that wins; otherwise we fall
// back to the global canEdit / canDelete flag for backward compatibility.
const _modulePerm = (perms, module, action) => {
  if (!perms || !module) return undefined;
  const mp = perms.modulePerms || {};
  const m = mp[module];
  if (!m) return undefined;
  const v = m[action];
  return typeof v === 'boolean' ? v : undefined;
};

export const canEdit = (roleOrPerms, module) => {
  const p = typeof roleOrPerms === 'object' ? roleOrPerms : null;
  if (!p) return false;
  const override = _modulePerm(p, module, 'edit');
  if (override !== undefined) return override;
  return !!p.canEdit;
};

export const canCreate = (roleOrPerms, module) => {
  const p = typeof roleOrPerms === 'object' ? roleOrPerms : null;
  if (!p) return false;
  const override = _modulePerm(p, module, 'create');
  if (override !== undefined) return override;
  // Falls back to canEdit since the existing single flag covered create+edit
  return !!p.canEdit;
};

export const canDelete = (roleOrPerms, module) => {
  const p = typeof roleOrPerms === 'object' ? roleOrPerms : null;
  if (!p) return false;
  const override = _modulePerm(p, module, 'delete');
  if (override !== undefined) return override;
  // Existing UIs gated delete with canEdit too (legacy behavior). Honor canDelete when set, else canEdit.
  if (typeof p.canDelete === 'boolean' && p.canDelete) return true;
  return !!p.canEdit;
};
export const canEditFees = (roleOrPerms) => {
  const p = typeof roleOrPerms === 'object' ? roleOrPerms : null;
  return p ? !!p.canEditFees : false;
};
export const canRevertFees = (roleOrPerms) => {
  const p = typeof roleOrPerms === 'object' ? roleOrPerms : null;
  return p ? !!p.canRevertFees : false;
};
export const canExport = (roleOrPerms) => {
  const p = typeof roleOrPerms === 'object' ? roleOrPerms : null;
  return p ? !!p.canExport : false;
};
export const canApproveConcession = (roleOrPerms) => {
  const p = typeof roleOrPerms === 'object' ? roleOrPerms : null;
  return p ? !!p.canApproveConcession : false;
};
export const canSeeFullMobile = (roleOrPerms) => {
  const p = typeof roleOrPerms === 'object' ? roleOrPerms : null;
  return p ? !!p.canSeeFullMobile : false;
};
export const maskMobile = (mobile) => {
  if (!mobile) return '';
  const s = String(mobile);
  if (s.length <= 4) return s;
  return s.slice(0, 2) + '*'.repeat(s.length - 4) + s.slice(-2);
};
