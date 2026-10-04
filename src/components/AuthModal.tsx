import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Mail,
  User,
  Phone,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  LogIn,
  UserPlus,
} from 'lucide-react';
import { authApi, AuthUser } from '../services/dealbrizApi';
import { POPULAR_CITIES } from '../data/initialListings';
import { signInWithGoogle } from '../services/firebase';
import { oneSignalService } from '../services/oneSignalService';
import { initialsAvatar } from '../utils/imageUtils';

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
  initialMode?: 'login' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  onClose,
  onSuccess,
  initialMode = 'login',
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const LAST_EMAIL_KEY = 'dealbriz_last_email';

  const [email, setEmail] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_EMAIL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Chandigarh');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
    setSuccessMsg(null);
  }, [initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      let user: AuthUser;
      if (mode === 'login') {
        if (!email.trim() || !password) {
          throw new Error('Please enter both your email address and password.');
        }
        user = await authApi.login(email.trim(), password);
        setSuccessMsg(`Welcome back, ${user.first_name}!`);
      } else {
        if (!firstName.trim() || !lastName.trim()) {
          throw new Error('Please enter your first and last name.');
        }
        if (!email.trim()) {
          throw new Error('Please enter a valid email address.');
        }
        if (password.length < 8) {
          throw new Error('Password must be at least 8 characters long.');
        }
        user = await authApi.signup({
          email: email.trim(),
          password,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || '+91 98000 00000',
          city: city || 'Chandigarh',
        });
        setSuccessMsg(`Account created successfully! Welcome to DealBriz, ${user.first_name}!`);
      }

      setTimeout(() => {
        try {
          localStorage.setItem(LAST_EMAIL_KEY, user.email || email.trim().toLowerCase());
        } catch {
          // ignore
        }
        onSuccess(user);
        onClose();
      }, 650);
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      const fbUser = await signInWithGoogle();
      const names = (fbUser.displayName || '').split(' ');
      const fName = names[0] || fbUser.email?.split('@')[0] || 'DealBriz';
      const lName = names.slice(1).join(' ') || 'User';

      const appUser: AuthUser = {
        id: fbUser.uid,
        email: fbUser.email || 'redevilaed@gmail.com',
        first_name: fName,
        last_name: lName,
        phone: fbUser.phoneNumber || '+91 98000 00000',
        city: 'Chandigarh',
        avatar_url: fbUser.photoURL || initialsAvatar(`${fName} ${lName}`),
        is_admin: fbUser.email === 'redevilaed@gmail.com',
        account_status: 'active',
        created_at: new Date().toISOString(),
      };

      try {
        localStorage.setItem('dealbriz_active_user', JSON.stringify(appUser));
      } catch {
        // ignore
      }

      await oneSignalService.linkUser(fbUser.uid, fbUser.email || undefined);

      setSuccessMsg(`Welcome, ${fName}!`);
      setTimeout(() => {
        onSuccess(appUser);
        onClose();
      }, 500);
    } catch (err: any) {
      setError(err?.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-t-3xl sm:rounded-2xl p-5 db-sheet-bottom-p5 shadow-2xl relative max-h-[92vh] overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-200 text-blue-400 flex items-center justify-center shadow-inner">
              {mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">
                {mode === 'login' ? 'Sign In to DealBriz' : 'Create DealBriz Account'}
              </h3>
              <p className="text-[10px] text-slate-500">Buy, Sell & Chat with Verified Locals</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Continue with Google button (Firebase Auth) */}
        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full mb-3.5 py-2.5 px-3 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 text-slate-800 text-xs font-bold flex items-center justify-center gap-2.5 transition-all shadow-xs"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="relative flex py-1 items-center mb-3">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="shrink-0 mx-2 text-[10px] text-slate-600 font-medium">or with email</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        {/* Tab Switcher: Sign In vs Sign Up */}
        <div className="grid grid-cols-2 p-1 bg-white rounded-xl border border-slate-200 mb-3.5">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mode === 'login'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
            }}
            className={`py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              mode === 'signup'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Create Account
          </button>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div className="mb-3 p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span className="font-medium">{successMsg}</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="mb-3 p-2.5 rounded-xl bg-rose-500/15 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
            <span className="font-medium leading-tight">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {mode === 'signup' && (
            <>
              {/* First Name & Last Name */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    First Name <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Last Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sharma"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Phone & City */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Phone <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <input
                      type="tel"
                      required
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">City</label>
                  <div className="relative">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-2 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-500 appearance-none"
                    >
                      {POPULAR_CITIES.filter((c) => c !== 'All Cities').map((c) => (
                        <option key={c} value={c} className="bg-white text-slate-900">
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Email Address */}
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">
              Email Address <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                name="username"
                id="dealbriz-email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-semibold text-slate-600">
                Password <span className="text-rose-600">*</span>
              </label>
              {mode === 'signup' && (
                <span className="text-[10px] text-slate-500">Min 8 characters</span>
              )}
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                name="password"
                id="dealbriz-password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder={mode === 'login' ? 'Your password' : 'Create strong password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-900"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || Boolean(successMsg)}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-bold text-white text-xs shadow-lg shadow-blue-600/30 flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Verifying...</span>
              </>
            ) : mode === 'login' ? (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In to Account</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Complete Free Registration</span>
              </>
            )}
          </button>
        </form>

        {/* Footer switch prompt */}
        <div className="mt-3 pt-2 text-center text-xs text-slate-500">
          {mode === 'login' ? (
            <p>
              New to DealBriz?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className="text-blue-600 font-bold hover:underline"
              >
                Create Account
              </button>
            </p>
          ) : (
            <p>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className="text-blue-600 font-bold hover:underline"
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

