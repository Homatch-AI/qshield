import { useState } from 'react';
import useAuthStore from '@/stores/auth-store';
import { AuthModal } from '@/components/auth/AuthModal';

export function SignUpBanner() {
  const authenticated = useAuthStore((s) => s.authenticated);
  const [dismissed, setDismissed] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);

  if (authenticated || dismissed) return null;

  return (
    <>
      <div className="relative w-full bg-gradient-to-r from-sky-500/10 to-cyan-500/10 border border-sky-500/20 rounded-lg p-4">
        {/* Dismiss button */}
        <button
          onClick={() => setDismissed(true)}
          className="absolute top-2 right-2 rounded p-1 text-slate-500 hover:text-slate-300 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-3 pr-6">
          {/* Shield icon */}
          <svg
            className="h-8 w-8 shrink-0 text-sky-400"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.82v5c0 4.52-3.13 8.69-7 9.93C8.13 21.69 5 17.52 5 13V8l7-3.82z" />
            <path d="M12 7a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2z" />
          </svg>

          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-300">
              Sign up free to verify your emails and protect recipients from interception
            </p>
          </div>

          <button
            onClick={() => setAuthOpen(true)}
            className="shrink-0 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600"
          >
            Create Free Account
          </button>
        </div>
      </div>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} defaultTab="signup" />
    </>
  );
}
