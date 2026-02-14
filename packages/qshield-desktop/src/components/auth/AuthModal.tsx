import { useState, useEffect, useRef, type FormEvent } from 'react';
import useAuthStore from '@/stores/auth-store';

type Tab = 'signin' | 'signup';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: Tab;
}

export function AuthModal({ isOpen, onClose, defaultTab = 'signin' }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const clearError = useAuthStore((s) => s.clearError);

  const displayError = localError || error;

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTab(defaultTab);
      setEmail('');
      setPassword('');
      setName('');
      setConfirmPassword('');
      setLocalError(null);
      clearError();
    }
  }, [isOpen, defaultTab, clearError]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function switchTab(t: Tab) {
    setTab(t);
    setLocalError(null);
    clearError();
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!email.includes('@')) {
      setLocalError('Please enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }
    const success = await login(email, password);
    if (success) onClose();
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!name.trim()) {
      setLocalError('Name is required');
      return;
    }
    if (!email.includes('@')) {
      setLocalError('Please enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }
    const success = await register(email, password, name.trim());
    if (success) onClose();
  }

  const inputClass =
    'w-full rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full mx-auto mt-24 p-8 shadow-2xl">
        {/* Logo */}
        <div className="mb-6 flex flex-col items-center">
          <svg
            className="h-10 w-10 text-sky-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.82v5c0 4.52-3.13 8.69-7 9.93C8.13 21.69 5 17.52 5 13V8l7-3.82z" />
            <path d="M12 7a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2z" />
          </svg>
          <span className="mt-2 text-lg font-semibold text-slate-100">QShield</span>
        </div>

        {/* Tab switcher */}
        <div className="mb-6 flex rounded-lg border border-slate-700 bg-slate-800 p-1">
          <button
            onClick={() => switchTab('signin')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === 'signin'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => switchTab('signup')}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === 'signup'
                ? 'bg-slate-700 text-slate-100'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Error */}
        {displayError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {displayError}
          </div>
        )}

        {/* Sign In form */}
        {tab === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoFocus
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-lg bg-sky-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        )}

        {/* Create Account form */}
        {tab === 'signup' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              autoFocus
              className={inputClass}
            />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-lg bg-sky-500 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-sky-600 disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account...
                </span>
              ) : (
                'Create Free Account'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
