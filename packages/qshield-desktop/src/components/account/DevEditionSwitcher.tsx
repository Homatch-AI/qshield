import { useState } from 'react';
import useLicenseStore from '@/stores/license-store';
import { isIPCAvailable } from '@/lib/mock-data';

const TIERS = ['personal', 'pro', 'business', 'enterprise'] as const;

const TIER_COLORS: Record<string, string> = {
  trial: 'bg-sky-500 text-white',
  personal: 'bg-slate-500 text-white',
  pro: 'bg-sky-500 text-white',
  business: 'bg-purple-500 text-white',
  enterprise: 'bg-amber-500 text-white',
};

export function DevEditionSwitcher() {
  if (!import.meta.env.DEV) return null;

  const tier = useLicenseStore((s) => s.tier);
  const isTrial = useLicenseStore((s) => s.isTrial);
  const activate = useLicenseStore((s) => s.activate);
  const deactivate = useLicenseStore((s) => s.deactivate);
  const [switching, setSwitching] = useState<string | null>(null);

  const currentDisplay = isTrial ? 'trial' : tier;

  const handleSwitch = async (targetTier: string) => {
    if (targetTier === currentDisplay) return;
    setSwitching(targetTier);
    try {
      if (targetTier === 'trial') {
        await deactivate();
      } else if (isIPCAvailable()) {
        const result = await window.qshield.license.generateTest(targetTier, 365);
        await activate(result.key);
      }
    } catch {
      // Silently fail in dev
    }
    setSwitching(null);
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-amber-400">Developer Mode</span>
      </div>
      <p className="text-xs text-slate-500 mb-3">Switch tier to test feature gating</p>
      <div className="flex gap-2">
        <button
          onClick={() => handleSwitch('trial')}
          disabled={switching !== null}
          className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium capitalize transition-colors ${
            currentDisplay === 'trial'
              ? TIER_COLORS.trial
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          } ${switching !== null && switching !== 'trial' ? 'opacity-50' : ''}`}
        >
          {switching === 'trial' ? (
            <span className="flex items-center justify-center gap-1.5">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </span>
          ) : (
            'trial'
          )}
        </button>
        {TIERS.map((t) => {
          const isActive = t === currentDisplay;
          const isLoading = switching === t;
          return (
            <button
              key={t}
              onClick={() => handleSwitch(t)}
              disabled={isLoading || switching !== null}
              className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium capitalize transition-colors ${
                isActive
                  ? TIER_COLORS[t]
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              } ${switching !== null && !isLoading ? 'opacity-50' : ''}`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-1.5">
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </span>
              ) : (
                t
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
