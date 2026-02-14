import { useState } from 'react';
import useAuthStore from '@/stores/auth-store';
import useLicenseStore from '@/stores/license-store';
import { UpgradeModal } from '@/components/shared/UpgradeModal';
import { openUpgradeUrl } from '@/lib/upgrade-urls';

const EDITION_BADGES: Record<string, { bg: string; text: string }> = {
  free: { bg: 'bg-zinc-600/20', text: 'text-zinc-400' },
  personal: { bg: 'bg-slate-600/20', text: 'text-slate-400' },
  business: { bg: 'bg-sky-500/20', text: 'text-sky-400' },
  enterprise: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
};

const EDITION_FEATURES: Record<string, string[]> = {
  free: ['Dashboard', 'Trust Score', 'Shield Overlay', 'Clipboard Monitor'],
  personal: ['Communication Monitors', 'Crypto Guard', 'Phishing Detection', 'Evidence Vault'],
  business: ['All Monitors', 'Trust Certificates', 'Policy Engine', 'DLP Scanning', 'API Access'],
  enterprise: ['SIEM Export', 'Enterprise Alerting', 'Advanced Analytics', 'Unlimited Everything'],
};

const EDITION_LIMITS: Record<string, { retention: string; certs: string; devices: string }> = {
  free: { retention: '7 days', certs: '1 / month', devices: '1 of 1' },
  personal: { retention: '30 days', certs: '3 / month', devices: '1 of 2' },
  business: { retention: '365 days', certs: '50 / month', devices: '5 of 10' },
  enterprise: { retention: 'Unlimited', certs: 'Unlimited', devices: 'Unlimited' },
};

const EDITION_METER: Record<string, { retention: number; certs: number; devices: number }> = {
  free: { retention: 70, certs: 50, devices: 100 },
  personal: { retention: 40, certs: 66, devices: 50 },
  business: { retention: 20, certs: 10, devices: 50 },
  enterprise: { retention: 100, certs: 100, devices: 100 },
};

function UsageMeter({ label, value, percent }: { label: string; value: string; percent: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-medium">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-sky-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

export function SubscriptionSection() {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const edition = useLicenseStore((s) => s.edition);

  const currentEdition = user?.edition ?? edition;
  const badge = EDITION_BADGES[currentEdition] ?? EDITION_BADGES.free;
  const features = EDITION_FEATURES[currentEdition] ?? EDITION_FEATURES.free;
  const limits = EDITION_LIMITS[currentEdition] ?? EDITION_LIMITS.free;
  const meters = EDITION_METER[currentEdition] ?? EDITION_METER.free;
  const isEnterprise = currentEdition === 'enterprise';

  return (
    <>
      <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Subscription</h2>

        {/* Plan name */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg font-semibold text-slate-100 capitalize">{currentEdition} Plan</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${badge.bg} ${badge.text}`}>
            {currentEdition}
          </span>
          {isEnterprise && (
            <svg className="h-5 w-5 text-emerald-400 ml-1" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>

        {/* Features included */}
        <div className="mb-5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Features included</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {features.map((f) => (
              <span key={f} className="text-xs bg-slate-700/50 text-slate-300 px-2.5 py-1 rounded-md">
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Usage meters */}
        <div className="space-y-3 mb-5">
          <UsageMeter label="Evidence Retention" value={limits.retention} percent={meters.retention} />
          <UsageMeter label="Certificates" value={limits.certs} percent={meters.certs} />
          <UsageMeter label="Devices" value={limits.devices} percent={meters.devices} />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {!isEnterprise && (
            <button
              onClick={() => setUpgradeOpen(true)}
              className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-600"
            >
              Upgrade Plan
            </button>
          )}
          <button
            onClick={() => openUpgradeUrl('manage_billing')}
            className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
          >
            Manage Billing
          </button>
        </div>
      </div>

      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} />
    </>
  );
}
