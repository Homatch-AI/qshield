import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { NAV_ITEMS } from '@/lib/constants';
import useTrustStore from '@/stores/trust-store';
import useAlertStore from '@/stores/alert-store';
import useLicenseStore, { getRequiredEdition, EDITION_LABELS } from '@/stores/license-store';
import type { Feature, QShieldEdition } from '@/stores/license-store';
import useAuthStore from '@/stores/auth-store';
import { UpgradeModal } from './UpgradeModal';
import { AuthModal } from '@/components/auth/AuthModal';

const EDITION_BADGE_STYLES: Record<QShieldEdition, string> = {
  free: 'bg-slate-600/20 text-slate-400',
  personal: 'bg-sky-500/20 text-sky-400',
  business: 'bg-purple-500/20 text-purple-400',
  enterprise: 'bg-amber-500/20 text-amber-400',
};

const NAV_BADGE_COLORS: Record<QShieldEdition, string> = {
  free: 'bg-slate-500/20 text-slate-400',
  personal: 'bg-sky-500/20 text-sky-400',
  business: 'bg-purple-500/20 text-purple-400',
  enterprise: 'bg-amber-500/20 text-amber-400',
};

function NavIcon({ icon, className = '' }: { icon: string; className?: string }) {
  const iconPaths: Record<string, React.ReactNode> = {
    gauge: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z"
      />
    ),
    clock: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
    vault: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75"
      />
    ),
    certificate: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    ),
    bell: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
      />
    ),
    'shield-check': (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    ),
    settings: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
    ),
  };

  return (
    <svg
      className={`h-5 w-5 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      {iconPaths[icon] ?? iconPaths.gauge}
    </svg>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<string | undefined>();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'signin' | 'signup'>('signin');
  const score = useTrustStore((s) => s.score);
  const level = useTrustStore((s) => s.level);
  const activeAlertCount = useAlertStore((s) => s.alerts.filter((a) => !a.dismissed).length);
  const hasFeature = useLicenseStore((s) => s.hasFeature);
  const user = useAuthStore((s) => s.user);
  const authenticated = useAuthStore((s) => s.authenticated);
  const navigate = useNavigate();

  return (
    <aside
      className={`flex flex-col border-r border-slate-700 bg-slate-900 transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Header */}
      <div className="flex h-14 items-center border-b border-slate-700 px-4">
        <div className="flex items-center gap-2 overflow-hidden">
          <svg
            className="h-7 w-7 shrink-0 text-sky-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.82v5c0 4.52-3.13 8.69-7 9.93C8.13 21.69 5 17.52 5 13V8l7-3.82z" />
            <path d="M12 7a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2z" />
          </svg>
          {!collapsed && (
            <span className="text-lg font-semibold text-slate-100">QShield</span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            // No requiredFeature → always show as active NavLink
            if (!item.requiredFeature) {
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-sky-500/10 text-sky-500'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                      }`
                    }
                  >
                    <NavIcon icon={item.icon} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </NavLink>
                </li>
              );
            }

            const hasRequired = hasFeature(item.requiredFeature as Parameters<typeof hasFeature>[0]);

            // User has the required feature → show as active NavLink
            if (hasRequired) {
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-sky-500/10 text-sky-500'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                      }`
                    }
                  >
                    <NavIcon icon={item.icon} className="shrink-0" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.icon === 'bell' && activeAlertCount > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/20 px-1.5 text-[10px] font-bold text-red-400">
                        {activeAlertCount}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            }

            // Has visibleFrom and user has it → show as locked (paywalled)
            const hasVisible = item.visibleFrom && hasFeature(item.visibleFrom as Parameters<typeof hasFeature>[0]);
            if (hasVisible) {
              const reqEdition = getRequiredEdition(item.requiredFeature as Feature);
              const badgeLabel = EDITION_LABELS[reqEdition]?.toUpperCase() ?? 'PRO';
              const badgeColor = NAV_BADGE_COLORS[reqEdition] ?? 'bg-sky-500/20 text-sky-400';
              return (
                <li key={item.path}>
                  <div
                    onClick={() => { setUpgradeFeature(item.requiredFeature); setUpgradeOpen(true); }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-slate-400 opacity-50 cursor-pointer hover:bg-slate-800/50"
                  >
                    <NavIcon icon={item.icon} className="shrink-0" />
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        <span className={`ml-auto text-[9px] font-bold uppercase ${badgeColor} px-1.5 rounded-full`}>{badgeLabel}</span>
                      </>
                    )}
                  </div>
                </li>
              );
            }

            // No visibleFrom or user doesn't have it → hide entirely
            return null;
          })}
        </ul>
      </nav>

      {/* Trust Score Mini */}
      {!collapsed && (
        <div className="border-t border-slate-700 p-3">
          <div className="rounded-lg bg-slate-800/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Trust Score
              </span>
              <span
                className={`text-lg font-bold ${
                  level === 'verified'
                    ? 'text-emerald-500'
                    : level === 'normal'
                    ? 'text-sky-500'
                    : level === 'elevated'
                    ? 'text-amber-500'
                    : level === 'warning'
                    ? 'text-orange-500'
                    : 'text-red-500'
                }`}
              >
                {Math.round(score)}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  level === 'verified'
                    ? 'bg-emerald-500'
                    : level === 'normal'
                    ? 'bg-sky-500'
                    : level === 'elevated'
                    ? 'bg-amber-500'
                    : level === 'warning'
                    ? 'bg-orange-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* User Account / Sign In */}
      {authenticated && user ? (
        <div className="border-t border-slate-700 p-2">
          <div
            onClick={() => navigate('/account')}
            className="flex items-center gap-3 rounded-lg px-2 py-2 cursor-pointer hover:bg-slate-800 transition-colors"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500 text-xs font-bold text-white">
              {(user.name || user.email)[0].toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <span className="block text-sm text-slate-300 truncate leading-tight">{user.name}</span>
                <span className={`inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-0.5 ${EDITION_BADGE_STYLES[user.edition as QShieldEdition] ?? EDITION_BADGE_STYLES.free}`}>
                  {(user.edition ?? 'free').toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="border-t border-slate-700 p-2">
          {collapsed ? (
            <button
              onClick={() => { setAuthModalTab('signin'); setAuthModalOpen(true); }}
              className="flex w-full items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              aria-label="Sign In"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </button>
          ) : (
            <div className="space-y-1.5 px-1">
              <button
                onClick={() => { setAuthModalTab('signin'); setAuthModalOpen(true); }}
                className="flex w-full items-center justify-center rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-100 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => { setAuthModalTab('signup'); setAuthModalOpen(true); }}
                className="flex w-full items-center justify-center rounded-lg bg-sky-500/10 px-3 py-1.5 text-sm text-sky-400 hover:bg-sky-500/20 transition-colors"
              >
                Create Free Account
              </button>
            </div>
          )}
        </div>
      )}

      {/* Collapse Button */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex h-10 items-center justify-center border-t border-slate-700 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <svg
          className={`h-4 w-4 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
      </button>

      <UpgradeModal isOpen={upgradeOpen} onClose={() => setUpgradeOpen(false)} requiredFeature={upgradeFeature} />
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} defaultTab={authModalTab} />
    </aside>
  );
}
