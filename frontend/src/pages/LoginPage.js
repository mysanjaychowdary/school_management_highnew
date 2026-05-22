import React, { useState } from 'react';
import { GraduationCap, UserCog, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/AuthContext';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useNavigate } from 'react-router-dom';

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const response = await api.login({ username, password });
      login(response.data.user, response.data.role, response.data.roleDetails);
      toast.success(`Welcome, ${response.data.user.name || response.data.user.username}!`);
    } catch (error) {
      toast.error('Invalid username or password');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-14 h-14 bg-gradient-to-br from-sky-400 to-sky-600 rounded-2xl flex items-center justify-center shadow-lg">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900" style={{ fontFamily: 'Nunito' }}>SchoolPro</h1>
            <p className="text-sm text-slate-500">School Management System</p>
          </div>
        </div>

        {!showStaffForm ? (
          /* Role Picker */
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 sm:p-8">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 text-center mb-2">Sign in to your account</h2>
            <p className="text-sm text-slate-500 text-center mb-6">Choose your account type to continue</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Admin / Staff */}
              <button
                data-testid="role-admin-staff-btn"
                onClick={() => setShowStaffForm(true)}
                className="group relative overflow-hidden bg-gradient-to-br from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-2xl p-6 text-left transition-all active:scale-95 shadow-lg"
              >
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <UserCog className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-extrabold mb-1">Admin / Staff</h3>
                <p className="text-sm text-white/90">Super admin, admin, teachers, office staff</p>
                <div className="mt-4 text-xs font-bold uppercase tracking-wide text-white/80">Sign in &rarr;</div>
              </button>

              {/* Parent */}
              <button
                data-testid="role-parent-btn"
                onClick={() => navigate('/parent')}
                className="group relative overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white rounded-2xl p-6 text-left transition-all active:scale-95 shadow-lg"
              >
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Users className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-extrabold mb-1">Parent</h3>
                <p className="text-sm text-white/90">View attendance, fees, homework & more</p>
                <div className="mt-4 text-xs font-bold uppercase tracking-wide text-white/80">Open portal &rarr;</div>
              </button>
            </div>
          </div>
        ) : (
          /* Staff Login Form */
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 sm:p-8 max-w-md mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center">
                <UserCog className="w-6 h-6 text-sky-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Admin / Staff Login</h2>
                <p className="text-xs text-slate-500">Super admin, admin, teacher or office staff</p>
              </div>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label>Username *</Label>
                <Input data-testid="login-username" required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} className="rounded-xl h-12" placeholder="Enter username" />
              </div>
              <div>
                <Label>Password *</Label>
                <Input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-xl h-12" placeholder="Enter password" />
              </div>
              <Button data-testid="login-submit-btn" type="submit" disabled={loading} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl h-12 active:scale-95 transition-transform">
                {loading ? 'Logging in...' : 'Sign In'}
              </Button>
            </form>
            <div className="mt-6 flex items-center justify-between text-sm">
              <button data-testid="back-to-roles-btn" onClick={() => { setShowStaffForm(false); setUsername(''); setPassword(''); }} className="text-slate-500 font-bold hover:text-slate-700">&larr; Back</button>
              <button onClick={() => navigate('/parent')} className="text-sky-600 font-bold hover:underline">Parent Portal &rarr;</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
