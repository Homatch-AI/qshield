import { useState } from 'react';
import useAuthStore from '@/stores/auth-store';

const EDITIONS = ['free', 'personal', 'business', 'enterprise'] as const;

export function DevEditionSwitcher() {
  if (!import.meta.env.DEV) return null;

  const user = useAuthStore((s) => s.user);
  const switchEdition = useAuthStore((s) => s.switchEdition);
  const [switching, setSwitching] = useState<string | null>(null);

  if (!user) return null;

  const currentEdition = user.edition;

  const handleSwitch = async (edition: string) => {
    if (edition === currentEdition) return;
    setSwitching(edition);
    await switchEdition(edition);
    setSwitching(null);
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-amber-400">Developer Mode</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">Switch edition to test feature gating</p>
      <div className="flex gap-2">
        {EDITIONS.map((edition) => {
          const isActive = edition === currentEdition;
          const isLoading = switching === edition;
          return (
            <button
              key={edition}
              onClick={() => handleSwitch(edition)}
              disabled={isLoading || switching !== null}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors ${
                isActive
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              } ${switching !== null && !isLoading ? 'opacity-50' : ''}`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Switching
                </span>
              ) : (
                edition
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
