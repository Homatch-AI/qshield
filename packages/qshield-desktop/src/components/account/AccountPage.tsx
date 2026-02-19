import useLicenseStore, { EDITION_LABELS } from '@/stores/license-store';
import { openUpgradeUrl } from '@/lib/upgrade-urls';
import { DevEditionSwitcher } from './DevEditionSwitcher';

const EDITION_BADGES: Record<string, { bg: string; text: string }> = {
  trial: { bg: 'bg-sky-500/20', text: 'text-sky-400' },
  personal: { bg: 'bg-slate-600/20', text: 'text-slate-400' },
  pro: { bg: 'bg-sky-500/20', text: 'text-sky-400' },
  business: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  enterprise: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
};

const PLAN_FEATURES: Record<string, { name: string; price: string; features: string[] }> = {
  personal: {
    name: 'Personal',
    price: '$9/mo',
    features: ['Dashboard', 'Trust Score', 'Shield Overlay', 'Clipboard Monitor', 'Basic Monitoring'],
  },
  pro: {
    name: 'Pro',
    price: '$29/mo',
    features: ['All Monitors', 'Email Notifications', 'Trust Reports', 'Evidence Vault', 'Crypto Guard'],
  },
  business: {
    name: 'Business',
    price: '$79/mo',
    features: ['Unlimited Assets', 'Asset Reports', 'API Access', 'Priority Support', 'Key Rotation'],
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    features: ['Custom Branding', 'SIEM Export', 'SSO & SCIM', 'Dedicated Support', 'Unlimited everything'],
  },
};

function PlanCard({
  plan,
  currentTier,
}: {
  plan: string;
  currentTier: string;
}) {
  const info = PLAN_FEATURES[plan];
  if (!info) return null;
  const isCurrent = plan === currentTier;
  const badge = EDITION_BADGES[plan] ?? EDITION_BADGES.personal;

  const tierOrder = ['personal', 'pro', 'business', 'enterprise'];
  const currentIdx = tierOrder.indexOf(currentTier);
  const planIdx = tierOrder.indexOf(plan);
  const showUpgrade = planIdx > currentIdx;

  const handleUpgrade = () => {
    if (plan === 'enterprise') {
      openUpgradeUrl('contact_sales');
    } else if (plan === 'business') {
      openUpgradeUrl('personal_to_business');
    } else if (plan === 'pro') {
      openUpgradeUrl('free_to_personal');
    }
  };

  return (
    <div
      className={`rounded-xl bg-slate-800/50 border p-5 flex flex-col ${
        isCurrent ? 'border-sky-500' : 'border-slate-700'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base font-semibold text-slate-100">{info.name}</span>
        {isCurrent && (
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-sky-500/20 text-sky-400">
            Current Plan
          </span>
        )}
      </div>
      <span className="text-lg font-bold text-slate-100 mb-4">{info.price}</span>

      <ul className="space-y-2 flex-1 mb-4">
        {info.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <svg className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className={`${isCurrent ? 'text-slate-300' : 'text-slate-400'}`}>{f}</span>
          </li>
        ))}
      </ul>

      {showUpgrade && (
        <button
          onClick={handleUpgrade}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
            plan === 'enterprise'
              ? 'border border-purple-500/40 text-purple-400 hover:bg-purple-500/10'
              : 'bg-sky-500 text-white hover:bg-sky-600'
          }`}
        >
          {plan === 'enterprise' ? 'Contact Sales' : `Upgrade to ${info.name}`}
        </button>
      )}
      {isCurrent && !showUpgrade && (
        <span className={`text-center text-xs font-medium uppercase tracking-wider ${badge.text}`}>
          {info.name}
        </span>
      )}
    </div>
  );
}

export default function AccountPage() {
  const tier = useLicenseStore((s) => s.tier);
  const email = useLicenseStore((s) => s.email);
  const isTrial = useLicenseStore((s) => s.isTrial);
  const isExpired = useLicenseStore((s) => s.isExpired);
  const daysRemaining = useLicenseStore((s) => s.daysRemaining);

  const badge = EDITION_BADGES[tier] ?? EDITION_BADGES.personal;
  const tierLabel = EDITION_LABELS[tier] ?? tier;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-slate-100">Account</h1>

      <DevEditionSwitcher />

      {/* License Info */}
      <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">License</h2>
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sky-500/20">
            <svg className="h-8 w-8 text-sky-400" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-semibold text-slate-100">{tierLabel}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium uppercase ${badge.bg} ${badge.text}`}>
                {tier}
              </span>
              {isTrial && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 font-medium">
                  Trial
                </span>
              )}
              {isExpired && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
                  Expired
                </span>
              )}
            </div>
            {email && <p className="text-sm text-slate-400 truncate">{email}</p>}
            <p className="text-xs text-slate-500 mt-1">
              {isTrial
                ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining in trial`
                : isExpired
                  ? 'License expired — features limited to Personal tier'
                  : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`}
            </p>
          </div>
        </div>
      </div>

      {/* Plan Comparison & Upgrade */}
      <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <PlanCard plan="personal" currentTier={tier} />
          <PlanCard plan="pro" currentTier={tier} />
          <PlanCard plan="business" currentTier={tier} />
          <PlanCard plan="enterprise" currentTier={tier} />
        </div>
      </div>
    </div>
  );
}
