import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Bus, LogOut, Play, Square, MapPin } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Toaster } from '../components/ui/sonner';
import GlobalLoader from '../components/GlobalLoader';

const LOCATION_SEND_INTERVAL_MS = 10000;

const DriverPortal = () => {
  const [bus, setBus] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [driving, setDriving] = useState(false);
  const [stopCode, setStopCode] = useState('');
  const [showStopForm, setShowStopForm] = useState(false);
  const [stopLoading, setStopLoading] = useState(false);
  const watchIdRef = useRef(null);
  const lastSentRef = useRef(0);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startWatching = useCallback((busId) => {
    if (!navigator.geolocation) { toast.error('Geolocation is not supported on this device'); return; }
    lastSentRef.current = 0;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSentRef.current < LOCATION_SEND_INTERVAL_MS) return;
        lastSentRef.current = now;
        api.updateBusLocation(busId, { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
      },
      () => { toast.error('Could not get location. Please allow location access.'); },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }, []);

  useEffect(() => () => stopWatching(), [stopWatching]);

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const r = await api.busDriverLogin({ username, password });
      const b = r.data.bus;
      setBus(b);
      if (b.status === 'driving') {
        setDriving(true);
        startWatching(b.id);
      }
    } catch (error) { toast.error('Invalid credentials'); }
    finally { setLoading(false); }
  };

  const handleLogout = () => {
    stopWatching();
    setBus(null); setDriving(false); setUsername(''); setPassword(''); setShowStopForm(false); setStopCode('');
  };

  const handleStart = async () => {
    try {
      await api.startBus(bus.id);
      setDriving(true);
      startWatching(bus.id);
      toast.success('Started driving');
    } catch (error) { toast.error('Failed to start'); }
  };

  const handleStop = async (e) => {
    e.preventDefault();
    try {
      setStopLoading(true);
      await api.stopBus(bus.id, { code: stopCode });
      stopWatching();
      setDriving(false);
      setShowStopForm(false);
      setStopCode('');
      toast.success('Stopped driving');
    } catch (error) { toast.error(error.response?.data?.detail || 'Invalid or expired code'); }
    finally { setStopLoading(false); }
  };

  if (!bus) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-emerald-50 flex items-center justify-center p-4">
        <GlobalLoader />
        <Toaster position="top-right" richColors />
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-8">
            <div className="flex flex-col items-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-sky-400 to-sky-600 rounded-3xl flex items-center justify-center shadow-lg">
                <Bus className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-4" style={{ fontFamily: 'Nunito' }}>Driver Portal</h1>
              <p className="text-sm text-slate-500 mt-1">Sign in to start driving</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-4">
              <div><Label className="font-bold">Username</Label><Input data-testid="driver-username" required value={username} onChange={(e) => setUsername(e.target.value)} className="rounded-2xl h-12 mt-1.5" placeholder="Enter driver username" /></div>
              <div><Label className="font-bold">Password</Label><Input data-testid="driver-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-2xl h-12 mt-1.5" placeholder="Enter password" /></div>
              <Button data-testid="driver-login-btn" type="submit" disabled={loading} className="w-full bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold rounded-2xl h-12 active:scale-95 transition-all shadow-md shadow-sky-200">
                {loading ? 'Logging in...' : 'Sign In'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <GlobalLoader />
      <Toaster position="top-right" richColors />
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-sky-100 flex items-center justify-center flex-shrink-0"><Bus className="w-7 h-7 text-sky-600" /></div>
              <div>
                <h1 className="text-xl font-extrabold text-slate-900" style={{ fontFamily: 'Nunito' }}>{bus.busName}</h1>
                <p className="text-sm text-slate-500">{bus.driverName}</p>
              </div>
            </div>
            <button data-testid="driver-logout-btn" onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold transition-colors">
              <LogOut className="w-3.5 h-3.5" />Logout
            </button>
          </div>

          <div className="flex items-center justify-center">
            <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${driving ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              <MapPin className="w-4 h-4" />{driving ? 'Currently Driving' : 'Not Driving'}
            </span>
          </div>

          {!driving && (
            <Button data-testid="start-driving-btn" onClick={handleStart} className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold rounded-2xl h-14 active:scale-95 transition-all shadow-md shadow-emerald-200 text-base">
              <Play className="w-5 h-5 mr-2" />Start Driving
            </Button>
          )}

          {driving && !showStopForm && (
            <Button data-testid="stop-driving-btn" onClick={() => setShowStopForm(true)} className="w-full bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold rounded-2xl h-14 active:scale-95 transition-all shadow-md shadow-rose-200 text-base">
              <Square className="w-5 h-5 mr-2" />Stop Driving
            </Button>
          )}

          {driving && showStopForm && (
            <form onSubmit={handleStop} className="space-y-3">
              <div>
                <Label className="font-bold">Enter Stop Code</Label>
                <p className="text-xs text-slate-500 mt-0.5 mb-1.5">Ask the admin for the code to confirm stopping.</p>
                <Input data-testid="stop-code-input" required value={stopCode} onChange={(e) => setStopCode(e.target.value)} className="rounded-2xl h-12" placeholder="6-digit code" />
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={() => { setShowStopForm(false); setStopCode(''); }} className="flex-1 rounded-2xl h-12">Cancel</Button>
                <Button type="submit" disabled={stopLoading} data-testid="confirm-stop-btn" className="flex-1 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-2xl h-12">{stopLoading ? 'Checking...' : 'Confirm Stop'}</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverPortal;
