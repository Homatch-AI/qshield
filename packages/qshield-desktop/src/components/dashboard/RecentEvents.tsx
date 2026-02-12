import { useState } from 'react';
import type { TrustSignal } from '@qshield/core';
import { useTrustState } from '@/hooks/useTrustState';
import { SkeletonEventRow } from '@/components/shared/SkeletonLoader';
import { formatRelativeTime, formatAdapterName, formatDate } from '@/lib/formatters';

/**
 * Auto-scrolling feed of latest TrustSignals. New events slide in from top.
 * Each row is clickable to expand full metadata details.
 */
export function RecentEvents() {
  const { signals, loading } = useTrustState();

  const recentSignals = signals
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  if (loading) {
    return (
      <div className="space-y-2">
        <SkeletonEventRow />
        <SkeletonEventRow />
        <SkeletonEventRow />
        <SkeletonEventRow />
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
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm">No recent events</p>
        <p className="text-xs text-slate-600 mt-1">Events will appear here as adapters report activity</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recentSignals.map((signal, index) => (
        <EventRow key={`${signal.timestamp}-${index}`} signal={signal} isNew={index === 0} />
      ))}
    </div>
  );
}

function EventRow({ signal, isNew }: { signal: TrustSignal; isNew: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const isPositive = signal.score >= 50;
  const impact = signal.weight;

  return (
    <div
      className={`rounded-lg border border-slate-700/50 bg-slate-900 transition-all hover:bg-slate-800/50 cursor-pointer ${
        isNew ? 'animate-in slide-in-from-top duration-300' : ''
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Impact indicator */}
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
            isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
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
            <span className="text-xs text-slate-500">Score: {signal.score}</span>
          </div>
          {typeof signal.metadata?.description === 'string' && (
            <p className="mt-0.5 truncate text-xs text-slate-400">{signal.metadata.description}</p>
          )}
        </div>

        {/* Timestamp */}
        <span className="shrink-0 text-xs text-slate-500">{formatRelativeTime(signal.timestamp)}</span>

        {/* Expand chevron */}
        <svg
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-3 space-y-2 animate-in slide-in-from-top-1 duration-200">
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-slate-500">Source</span>
              <p className="text-slate-300 font-medium">{formatAdapterName(signal.source)}</p>
            </div>
            <div>
              <span className="text-slate-500">Weight</span>
              <p className="text-slate-300 font-medium">{signal.weight.toFixed(3)}</p>
            </div>
            <div>
              <span className="text-slate-500">Timestamp</span>
              <p className="text-slate-300 font-medium">{formatDate(signal.timestamp)}</p>
            </div>
          </div>
          {signal.metadata && Object.keys(signal.metadata).length > 0 && (
            <div className="rounded-md bg-slate-800/50 px-3 py-2">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Metadata</span>
              <div className="mt-1 space-y-0.5">
                {Object.entries(signal.metadata).map(([key, value]) => (
                  <div key={key} className="flex items-baseline gap-2 text-xs">
                    <span className="text-slate-500">{key}:</span>
                    <span className="text-slate-300 truncate font-mono text-[11px]">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
