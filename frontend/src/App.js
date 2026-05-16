import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, canAccess, getDefaultRoute } from './lib/AuthContext';
import Dashboard from './pages/Dashboard';
import Classes from './pages/Classes';
import Students from './pages/Students';
import StudentDetail from './pages/StudentDetail';
import Attendance from './pages/Attendance';
import Fees from './pages/Fees';
import Expenses from './pages/Expenses';
import Inventory from './pages/Inventory';
import EventCalendar from './pages/EventCalendar';
import HomeworkPage from './pages/HomeworkPage';
import StaffPage from './pages/StaffPage';
import Approvals from './pages/Approvals';
import Marks from './pages/Marks';
import Settings from './pages/Settings';
import ParentPortal from './pages/ParentPortal';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import { Toaster } from './components/ui/sonner';
import './App.css';

const ProtectedRoute = ({ path, children }) => {
  const { role } = useAuth();
  if (!canAccess(role, path)) return <Navigate to={getDefaultRoute(role)} replace />;
  return children;
};

const AppRoutes = () => {
  const { user, role, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div></div>;

  if (!user) return (
    <Routes>
      <Route path="/parent" element={<ParentPortal />} />
      <Route path="*" element={<LoginPage />} />
    </Routes>
  );

  return (
    <Routes>
      <Route path="/parent" element={<ParentPortal />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<ProtectedRoute path="/"><Dashboard /></ProtectedRoute>} />
        <Route path="classes" element={<ProtectedRoute path="/classes"><Classes /></ProtectedRoute>} />
        <Route path="students" element={<ProtectedRoute path="/students"><Students /></ProtectedRoute>} />
        <Route path="students/:id" element={<ProtectedRoute path="/students"><StudentDetail /></ProtectedRoute>} />
        <Route path="attendance" element={<ProtectedRoute path="/attendance"><Attendance /></ProtectedRoute>} />
        <Route path="fees" element={<ProtectedRoute path="/fees"><Fees /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute path="/expenses"><Expenses /></ProtectedRoute>} />
        <Route path="inventory" element={<ProtectedRoute path="/inventory"><Inventory /></ProtectedRoute>} />
        <Route path="calendar" element={<ProtectedRoute path="/calendar"><EventCalendar /></ProtectedRoute>} />
        <Route path="homework" element={<ProtectedRoute path="/homework"><HomeworkPage /></ProtectedRoute>} />
        <Route path="staff" element={<ProtectedRoute path="/staff"><StaffPage /></ProtectedRoute>} />
        <Route path="approvals" element={<ProtectedRoute path="/approvals"><Approvals /></ProtectedRoute>} />
        <Route path="marks" element={<ProtectedRoute path="/marks"><Marks /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute path="/settings"><Settings /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={getDefaultRoute(role)} replace />} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
