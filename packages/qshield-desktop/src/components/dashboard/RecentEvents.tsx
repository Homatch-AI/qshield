import type { TrustSignal } from '@qshield/core';
import { useTrustState } from '@/hooks/useTrustState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { formatRelativeTime, formatAdapterName } from '@/lib/formatters';

export function RecentEvents() {
  const { signals, loading } = useTrustState();

  const recentSignals = signals
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (recentSignals.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center text-slate-500">
        <svg
          className="mx-auto h-10 w-10 text-slate-600 mb-3"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="text-sm">No recent events</p>
        <p className="text-xs text-slate-600 mt-1">Events will appear here as adapters report activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recentSignals.map((signal, index) => (
        <EventRow key={`${signal.timestamp}-${index}`} signal={signal} />
      ))}
    </div>
  );
}

function EventRow({ signal }: { signal: TrustSignal }) {
  const isPositive = signal.score >= 50;
  const impact = signal.weight;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-700/50 bg-slate-900 px-4 py-3 transition-colors hover:bg-slate-800/50">
      {/* Impact indicator */}
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
          isPositive
            ? 'bg-emerald-500/10 text-emerald-400'
            : 'bg-red-500/10 text-red-400'
        }`}
      >
        {isPositive ? '+' : '-'}
        {Math.abs(impact).toFixed(0)}
      </div>

      {/* Source and info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-slate-700/50 px-2 py-0.5 text-[11px] font-medium text-slate-300 uppercase tracking-wider">
            {formatAdapterName(signal.source)}
          </span>
          <span className="text-xs text-slate-500">
            Score: {signal.score}
          </span>
        </div>
        {typeof signal.metadata?.description === 'string' && (
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {signal.metadata.description}
          </p>
        )}
      </div>

      {/* Timestamp */}
      <span className="shrink-0 text-xs text-slate-500">
        {formatRelativeTime(signal.timestamp)}
      </span>
    </div>
  );
}
