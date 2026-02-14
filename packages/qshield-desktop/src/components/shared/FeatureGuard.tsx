import { useState } from 'react';
import type { Feature } from '@qshield/core';
import { useFeature } from '@/hooks/useFeature';
import { UpgradeModal } from './UpgradeModal';

interface FeatureGuardProps {
  feature: Feature;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** Edition label for display — shows which plan unlocks the gated feature. */
const EDITION_LABEL: Record<string, string> = {
  free: 'Personal',
  personal: 'Business',
  business: 'Enterprise',
  enterprise: 'Enterprise',
};

/** Render children only if the feature is enabled, otherwise show a locked fallback. */
export function FeatureGuard({ feature, children, fallback }: FeatureGuardProps) {
  const { enabled, edition } = useFeature(feature);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  if (enabled) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  const requiredEdition = EDITION_LABEL[edition] ?? 'Business';

  return (
    <>
      <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-700/50">
          <svg className="h-6 w-6 text-slate-400" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-slate-200">Feature Locked</h3>
        <p className="mt-1 text-xs text-slate-400">
          This feature requires the <span className="font-medium text-sky-400">{requiredEdition}</span> plan
        </p>
        <button
          onClick={() => setUpgradeOpen(true)}
          className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
        >
          Upgrade
        </button>
      </div>
      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} requiredFeature={feature} />
    </>
  );
}
