import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ShieldAlert, Eye, EyeOff, Loader2 } from 'lucide-react';

// Supabase anon client for frontend auth — uses PUBLIC anon key (safe in browser)
// Values are injected via Vite env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
// Fall back to empty string so the app compiles even without .env configured
const supabaseUrl  = (import.meta as any).env?.VITE_SUPABASE_URL  || '';
const supabaseAnon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnon ? createClient(supabaseUrl, supabaseAnon) : null;

export interface AuthUser {
  id: string;
  email: string;
  role: 'viewer' | 'operator';
}

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
  isDarkMode: boolean;
}

export default function LoginPage({ onLogin, isDarkMode }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'viewer' | 'operator'>('viewer');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const themeBg    = isDarkMode ? 'bg-[#0b0f19]' : 'bg-slate-50';
  const themeCard  = isDarkMode ? 'bg-[#111827] border-[#1f2937]' : 'bg-white border-slate-200 shadow-lg';
  const themeText  = isDarkMode ? 'text-[#e2e8f0]' : 'text-slate-800';
  const themeMuted = isDarkMode ? 'text-slate-400' : 'text-slate-500';
  const themeInput = isDarkMode
    ? 'bg-[#0c1220] border-slate-700 text-white placeholder-slate-500 focus:border-teal-500'
    : 'bg-white border-slate-300 text-slate-800 placeholder-slate-400 focus:border-teal-500';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (!supabase) {
        // Demo mode — no Supabase configured. Accept any login as operator.
        onLogin({ id: 'demo-user', email: email || 'demo@urbanpulse.local', role: 'operator' });
        return;
      }

      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { role } },
        });
        if (signUpError) throw signUpError;
        if (data.user && !data.session) {
          setInfo('Check your email to confirm your account, then log in.');
          setMode('login');
        } else if (data.user) {
          onLogin({
            id: data.user.id,
            email: data.user.email!,
            role: (data.user.user_metadata?.role as 'viewer' | 'operator') || 'viewer',
          });
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        if (data.user) {
          onLogin({
            id: data.user.id,
            email: data.user.email!,
            role: (data.user.user_metadata?.role as 'viewer' | 'operator') || 'viewer',
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  function handleDemoLogin() {
    onLogin({ id: 'demo', email: 'operator@demo.local', role: 'operator' });
  }

  return (
    <div className={`min-h-screen w-screen flex items-center justify-center ${themeBg} transition-colors duration-300`}>
      {/* Background grid pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(20,184,166,0.08)_0%,transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
           style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,1) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,1) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

      <div className="relative w-full max-w-md px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/30 mb-4">
            <ShieldAlert className="w-7 h-7 text-teal-400" />
          </div>
          <h1 className={`text-2xl font-bold tracking-tight ${themeText}`}>UrbanPulse</h1>
          <p className={`text-sm mt-1 ${themeMuted}`}>Mumbai Convergence Intelligence Platform</p>
        </div>

        {/* Card */}
        <div className={`rounded-2xl border p-8 ${themeCard}`}>
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-xl bg-slate-800/50 mb-6">
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setInfo(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  mode === m
                    ? 'bg-teal-600 text-white shadow'
                    : `${themeMuted} hover:text-white`
                }`}
              >
                {m === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${themeMuted} uppercase tracking-wider`}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="operator@urbanpulse.com"
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-colors ${themeInput}`}
              />
            </div>

            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${themeMuted} uppercase tracking-wider`}>
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="••••••••"
                  className={`w-full px-3.5 py-2.5 pr-10 rounded-xl border text-sm outline-none transition-colors ${themeInput}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${themeMuted} hover:text-white transition-colors`}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label className={`block text-xs font-semibold mb-1.5 ${themeMuted} uppercase tracking-wider`}>
                  Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['viewer', 'operator'] as const).map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${
                        role === r
                          ? r === 'operator'
                            ? 'bg-teal-600/20 border-teal-500/50 text-teal-300'
                            : 'bg-slate-700/50 border-slate-600 text-white'
                          : `border-slate-700 ${themeMuted} hover:border-slate-600`
                      }`}
                    >
                      {r === 'viewer' ? '👁 Viewer' : '⚡ Operator'}
                      <div className={`text-[9px] mt-0.5 font-normal ${themeMuted}`}>
                        {r === 'viewer' ? 'Read-only dashboard' : 'Full access + Agent Console'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                {error}
              </div>
            )}
            {info && (
              <div className="px-3.5 py-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 text-xs">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {/* Demo bypass */}
          <div className="mt-4 pt-4 border-t border-slate-800">
            <button
              onClick={handleDemoLogin}
              className={`w-full py-2.5 rounded-xl border border-slate-700 text-xs font-semibold ${themeMuted} hover:text-white hover:border-slate-500 transition-colors`}
            >
              ⚡ Enter Demo Mode (no account needed)
            </button>
            <p className={`text-center text-[10px] mt-2 ${themeMuted}`}>
              Demo mode uses local mock data — no Supabase connection required
            </p>
          </div>
        </div>

        <p className={`text-center text-[10px] mt-4 ${themeMuted}`}>
          UrbanPulse Mumbai Digital Twin Pilot · Stage K
        </p>
      </div>
    </div>
  );
}
