import React, { createContext, useContext, useState, useEffect } from 'react';

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
  roles: '/roles', complaints: '/complaints', settings: '/settings',
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
];

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [perms, setPerms] = useState(DEFAULT_PERMS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('schoolpro_auth');
    if (stored) {
      try {
        const d = JSON.parse(stored);
        setUser(d.user);
        setRole(d.role);
        setPerms(d.perms || DEFAULT_PERMS);
      } catch (e) { /* ignore */ }
    }
    setLoaded(true);
  }, []);

  const login = (userData, roleName, roleDetails) => {
    const p = roleDetails ? { ...DEFAULT_PERMS, ...roleDetails } : DEFAULT_PERMS;
    setUser(userData); setRole(roleName); setPerms(p);
    localStorage.setItem('schoolpro_auth', JSON.stringify({ user: userData, role: roleName, perms: p }));
  };

  const logout = () => {
    setUser(null); setRole(null); setPerms(DEFAULT_PERMS);
    localStorage.removeItem('schoolpro_auth');
  };

  return (
    <AuthContext.Provider value={{ user, role, perms, login, logout, loaded }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

// ----- Access helpers -----

// Permission helpers (read from auth perms loaded at login)
export const canAccess = (perms, path) => {
  if (!perms) return false;
  const mod = PATH_TO_MODULE[path];
  if (!mod) return false;
  return (perms.modules || []).includes(mod);
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
