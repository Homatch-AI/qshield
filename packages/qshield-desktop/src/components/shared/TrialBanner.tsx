import { useNavigate } from 'react-router-dom';
import useLicenseStore from '@/stores/license-store';

export function TrialBanner() {
  const isTrial = useLicenseStore((s) => s.isTrial);
  const isExpired = useLicenseStore((s) => s.isExpired);
  const daysRemaining = useLicenseStore((s) => s.daysRemaining);
  const navigate = useNavigate();

  if (!isTrial && !isExpired) return null;

  return (
    <div
      className={`rounded-lg px-4 py-2.5 text-sm flex items-center justify-between ${
        isExpired
          ? 'bg-red-500/10 border border-red-500/20 text-red-400'
          : daysRemaining <= 3
          ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
          : 'bg-sky-500/10 border border-sky-500/20 text-sky-400'
      }`}
    >
      <span>
        {isExpired
          ? 'Trial expired — features limited to Personal tier'
          : `Free trial: ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`}
      </span>
      <button
        onClick={() => navigate('/settings')}
        className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
          isExpired
            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300'
            : 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-300'
        }`}
      >
        Activate Key
      </button>
    </div>
  );
}
