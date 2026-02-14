import useAuthStore from '@/stores/auth-store';

const EDITION_BADGES: Record<string, { bg: string; text: string }> = {
  personal: { bg: 'bg-slate-600/20', text: 'text-slate-400' },
  business: { bg: 'bg-sky-500/20', text: 'text-sky-400' },
  enterprise: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
};

export function AccountSection() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  if (!user) return null;

  const initial = (user.name || user.email)[0].toUpperCase();
  const badge = EDITION_BADGES[user.edition] ?? EDITION_BADGES.personal;

  return (
    <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-6">
      <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Account</h2>
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-500 text-lg font-bold text-white">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-slate-100 truncate">{user.name}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${badge.bg} ${badge.text}`}>
              {user.edition}
            </span>
          </div>
          <p className="text-sm text-slate-400 truncate">{user.email}</p>
        </div>
        <button
          onClick={logout}
          className="shrink-0 text-sm text-red-400 hover:text-red-300 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
