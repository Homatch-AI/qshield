import { useState } from 'react';
import useLicenseStore, { EDITION_LABELS } from '@/stores/license-store';
import type { FeatureFlags } from '@/stores/license-store';
import { SettingsSection } from './Settings';
import { openUpgradeUrl } from '@/lib/upgrade-urls';

const TIER_BADGE_STYLES: Record<string, string> = {
  trial: 'bg-sky-500/20 text-sky-400',
  personal: 'bg-slate-600/20 text-slate-400',
  pro: 'bg-sky-500/20 text-sky-400',
  business: 'bg-purple-500/20 text-purple-400',
  enterprise: 'bg-amber-500/20 text-amber-400',
};

const FEATURE_LABELS: Record<keyof FeatureFlags, string> = {
  maxAdapters: 'Adapters',
  maxHighTrustAssets: 'High-Trust Assets',
  emailNotifications: 'Email Notifications',
  dailySummary: 'Daily Summary',
  trustReports: 'Trust Reports',
  assetReports: 'Asset Reports',
  trustProfile: 'Trust Profile',
  keyRotation: 'Key Rotation',
  apiAccess: 'API Access',
  prioritySupport: 'Priority Support',
  customBranding: 'Custom Branding',
};

export function LicenseSettings() {
  const tier = useLicenseStore((s) => s.tier);
  const email = useLicenseStore((s) => s.email);
  const isTrial = useLicenseStore((s) => s.isTrial);
  const isExpired = useLicenseStore((s) => s.isExpired);
  const daysRemaining = useLicenseStore((s) => s.daysRemaining);
  const features = useLicenseStore((s) => s.features);
  const storeError = useLicenseStore((s) => s.error);
  const activate = useLicenseStore((s) => s.activate);
  const deactivate = useLicenseStore((s) => s.deactivate);

  const [key, setKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChangeKey, setShowChangeKey] = useState(false);

  const handleActivate = async () => {
    if (!key.trim()) return;
    setActivating(true);
    setError(null);
    try {
      await activate(key.trim());
      setKey('');
      setShowChangeKey(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid license key');
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivate = async () => {
    await deactivate();
    setShowChangeKey(false);
  };

  const badgeStyle = TIER_BADGE_STYLES[tier] ?? TIER_BADGE_STYLES.personal;

  // State 3: Expired trial
  if (isTrial && isExpired) {
    return (
      <SettingsSection title="License" description="Your trial has expired">
        <div className="space-y-4">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <span className="text-sm font-semibold text-red-400">Trial Expired</span>
            </div>
            <p className="text-xs text-slate-400">
              Features are limited to the Personal tier. Activate a license key to unlock full functionality.
            </p>
          </div>

          <KeyInput
            value={key}
            onChange={setKey}
            onActivate={handleActivate}
            activating={activating}
            error={error || storeError}
          />

          <button
            onClick={() => openUpgradeUrl('free_to_personal')}
            className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-sky-500"
          >
            Get QShield Pro
          </button>
        </div>
      </SettingsSection>
    );
  }

  // State 1: Trial active
  if (isTrial) {
    return (
      <SettingsSection title="License" description="Free trial — all features unlocked">
        <div className="space-y-4">
          <div className="rounded-lg bg-sky-500/10 border border-sky-500/20 p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-sky-400">Free Trial</span>
              <span className={`text-xs font-medium ${daysRemaining <= 3 ? 'text-amber-400' : 'text-sky-400'}`}>
                {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining
              </span>
            </div>
            <p className="text-xs text-slate-400">
              All features are unlocked during the trial period. Enter a license key to continue after the trial ends.
            </p>
          </div>

          <KeyInput
            value={key}
            onChange={setKey}
            onActivate={handleActivate}
            activating={activating}
            error={error || storeError}
          />
        </div>
      </SettingsSection>
    );
  }

  // State 2: License active
  return (
    <SettingsSection title="License" description="Active license">
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold uppercase ${badgeStyle}`}>
                {EDITION_LABELS[tier] ?? tier}
              </span>
              {isExpired && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
                  Expired
                </span>
              )}
            </div>
            <span className="text-xs text-slate-500">
              {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Expired'}
            </span>
          </div>

          {email && (
            <div className="text-xs text-slate-400 mb-3">
              Licensed to <span className="text-slate-300">{email}</span>
            </div>
          )}

          {/* Feature list */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {(Object.keys(FEATURE_LABELS) as (keyof FeatureFlags)[]).map((featureKey) => {
              const val = features[featureKey];
              const enabled = typeof val === 'boolean' ? val : typeof val === 'number' ? val > 0 : false;
              return (
                <div key={featureKey} className="flex items-center gap-2 text-xs">
                  {enabled ? (
                    <svg className="h-3.5 w-3.5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth={2.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5 text-slate-600 shrink-0" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={enabled ? 'text-slate-300' : 'text-slate-500'}>
                    {FEATURE_LABELS[featureKey]}
                    {typeof val === 'number' && val > 0 && ` (${val >= 999 ? '∞' : val})`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Change Key / Deactivate */}
        {showChangeKey ? (
          <div className="space-y-3">
            <KeyInput
              value={key}
              onChange={setKey}
              onActivate={handleActivate}
              activating={activating}
              error={error || storeError}
            />
            <button
              onClick={() => setShowChangeKey(false)}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowChangeKey(true)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
            >
              Change Key
            </button>
            <button
              onClick={handleDeactivate}
              className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
            >
              Deactivate
            </button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}

function KeyInput({
  value,
  onChange,
  onActivate,
  activating,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  onActivate: () => void;
  activating: boolean;
  error: string | null;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">License Key</label>
      <div className="mt-1.5 flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onActivate()}
          placeholder="QS-PRO-2026-..."
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 font-mono placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
        />
        <button
          onClick={onActivate}
          disabled={activating || !value.trim()}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {activating ? 'Activating...' : 'Activate'}
        </button>
      </div>
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}
