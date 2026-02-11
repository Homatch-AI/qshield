import type { TrustSignal } from '@qshield/core';
import { formatDate, formatAdapterName } from '@/lib/formatters';

interface TimelineEventProps {
  signal: TrustSignal;
}

export function TimelineEvent({ signal }: TimelineEventProps) {
  const isPositive = signal.score >= 50;
  const impact = signal.weight;

  const sourceColors: Record<string, string> = {
    zoom: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    teams: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    email: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    file: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    api: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  };

  return (
    <div className="group relative flex gap-4 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[17px] top-9 bottom-0 w-px bg-slate-700 group-last:hidden" />

      {/* Dot */}
      <div
        className={`relative z-10 mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 ${
          isPositive
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-red-500/30 bg-red-500/10'
        }`}
      >
        <svg
          className={`h-4 w-4 ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          {isPositive ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
          )}
        </svg>
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 rounded-lg border border-slate-700/50 bg-slate-900 p-4 transition-colors hover:bg-slate-800/50">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                sourceColors[signal.source] ?? 'bg-slate-700/50 text-slate-400 border-slate-600'
              }`}
            >
              {formatAdapterName(signal.source)}
            </span>

            <span
              className={`text-sm font-semibold ${
                isPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {isPositive ? '+' : ''}
              {impact.toFixed(1)} weight
            </span>
          </div>

          <span className="shrink-0 text-xs text-slate-500">
            {formatDate(signal.timestamp)}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-4">
          <div>
            <span className="text-xs text-slate-500">Score</span>
            <p className="text-sm font-medium text-slate-200">{signal.score}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Weight</span>
            <p className="text-sm font-medium text-slate-200">{signal.weight.toFixed(2)}</p>
          </div>
        </div>

        {signal.metadata && Object.keys(signal.metadata).length > 0 && (
          <div className="mt-2 rounded-md bg-slate-800/50 px-3 py-2">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
              Metadata
            </span>
            <div className="mt-1 space-y-0.5">
              {Object.entries(signal.metadata).map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-2 text-xs">
                  <span className="text-slate-500">{key}:</span>
                  <span className="text-slate-300 truncate font-mono text-[11px]">
                    {String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
