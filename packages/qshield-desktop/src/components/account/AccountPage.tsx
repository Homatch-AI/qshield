import useAuthStore from '@/stores/auth-store';
import useLicenseStore from '@/stores/license-store';
import { openUpgradeUrl } from '@/lib/upgrade-urls';
import { DevEditionSwitcher } from './DevEditionSwitcher';

const EDITION_BADGES: Record<string, { bg: string; text: string }> = {
  personal: { bg: 'bg-slate-600/20', text: 'text-slate-400' },
  business: { bg: 'bg-sky-500/20', text: 'text-sky-400' },
  enterprise: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
};

const EDITION_LIMITS: Record<string, { retention: string; certs: string; devices: string }> = {
  personal: { retention: '30 days', certs: '3 / month', devices: '1 of 2' },
  business: { retention: '365 days', certs: '50 / month', devices: '5 of 10' },
  enterprise: { retention: 'Unlimited', certs: 'Unlimited', devices: 'Unlimited' },
};

const EDITION_METER: Record<string, { retention: number; certs: number; devices: number }> = {
  personal: { retention: 40, certs: 66, devices: 50 },
  business: { retention: 20, certs: 10, devices: 50 },
  enterprise: { retention: 100, certs: 100, devices: 100 },
};

const PLAN_FEATURES: Record<string, { name: string; price: string; features: string[] }> = {
  personal: {
    name: 'Personal',
    price: '$9/mo',
    features: ['Shield Overlay', 'Basic Trust Scoring', 'Dashboard', '30-day retention', '3 certificates/month'],
  },
  business: {
    name: 'Business',
    price: '$29/seat/mo',
    features: ['Evidence Vault', 'Trust Certificates', 'All Monitors', 'Policy Engine', '365-day retention'],
  },
  enterprise: {
    name: 'Enterprise',
    price: 'Custom',
    features: ['SIEM Export', 'Enterprise Alerting', 'Advanced Analytics', 'Unlimited retention', 'Unlimited everything'],
  },
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
            percent >= 90 ? 'bg-red-500' : percent >= 75 ? 'bg-amber-500' : 'bg-sky-500'
          }`}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  currentEdition,
}: {
  plan: string;
  currentEdition: string;
}) {
  const info = PLAN_FEATURES[plan];
  const isCurrent = plan === currentEdition;
  const badge = EDITION_BADGES[plan] ?? EDITION_BADGES.personal;

  const handleUpgrade = () => {
    if (plan === 'enterprise') {
      openUpgradeUrl('contact_sales');
    } else if (currentEdition === 'personal' && plan === 'business') {
      openUpgradeUrl('personal_to_business');
    } else {
      openUpgradeUrl('business_to_enterprise');
    }
  };

  const showUpgrade =
    (currentEdition === 'personal' && (plan === 'business' || plan === 'enterprise')) ||
    (currentEdition === 'business' && plan === 'enterprise');

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
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const edition = useLicenseStore((s) => s.edition);

  if (!user) return null;

  const currentEdition = user.edition ?? edition;
  const badge = EDITION_BADGES[currentEdition] ?? EDITION_BADGES.personal;
  const limits = EDITION_LIMITS[currentEdition] ?? EDITION_LIMITS.personal;
  const meters = EDITION_METER[currentEdition] ?? EDITION_METER.personal;
  const initial = (user.name || user.email)[0].toUpperCase();
  const createdAt = (user as { createdAt?: string }).createdAt;
  const memberSince = createdAt
    ? new Date(createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Recently';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">Account</h1>

      <DevEditionSwitcher />

      {/* Profile */}
      <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Profile</h2>
        <div className="flex items-start gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sky-500 text-2xl font-bold text-white">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-semibold text-slate-100 truncate">{user.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${badge.bg} ${badge.text}`}>
                {currentEdition}
              </span>
            </div>
            <p className="text-sm text-slate-400 truncate">{user.email}</p>
            <p className="text-xs text-slate-500 mt-1">Member since {memberSince}</p>
          </div>
          <button
            onClick={logout}
            className="shrink-0 text-sm text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-400/40 rounded-lg px-4 py-2 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Subscription & Usage */}
      <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Subscription & Usage</h2>
        <div className="flex items-center gap-2 mb-5">
          <span className="text-lg font-semibold text-slate-100 capitalize">{currentEdition} Plan</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${badge.bg} ${badge.text}`}>
            {currentEdition}
          </span>
        </div>
        <div className="space-y-3">
          <UsageMeter label="Evidence Retention" value={limits.retention} percent={meters.retention} />
          <UsageMeter label="Certificates" value={limits.certs} percent={meters.certs} />
          <UsageMeter label="Devices" value={limits.devices} percent={meters.devices} />
        </div>
      </div>

      {/* Plan Comparison & Upgrade */}
      <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Upgrade Your Plan</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <PlanCard plan="personal" currentEdition={currentEdition} />
          <PlanCard plan="business" currentEdition={currentEdition} />
          <PlanCard plan="enterprise" currentEdition={currentEdition} />
        </div>
      </div>
    </div>
  );
}
