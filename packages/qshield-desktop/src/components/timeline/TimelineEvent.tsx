import { useState } from 'react';
import type { TrustSignal } from '@qshield/core';
import { formatDate, formatAdapterName } from '@/lib/formatters';
import { describeEvent } from '@/lib/event-descriptions';

interface TimelineEventProps {
  signal: TrustSignal;
}

/**
 * Expandable timeline event card. Collapsed shows source, score, and time.
 * Expanded reveals full metadata, evidence link, and impact breakdown.
 */
export function TimelineEvent({ signal }: TimelineEventProps) {
  const [expanded, setExpanded] = useState(false);
  const isPositive = signal.score >= 50;
  const impact = signal.weight;

  const sourceColors: Record<string, string> = {
    zoom: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    teams: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    email: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    file: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
    api: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    crypto: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  };

  const dotColor = isPositive ? 'bg-emerald-500' : signal.score < 30 ? 'bg-red-500' : 'bg-amber-500';

  return (
    <div className="group relative flex gap-4 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[17px] top-9 bottom-0 w-px bg-slate-700 group-last:hidden" />

      {/* Color-coded dot */}
      <div
        className={`relative z-10 mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 cursor-pointer transition-transform hover:scale-110 ${
          isPositive
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : signal.score < 30
            ? 'border-red-500/30 bg-red-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`h-3 w-3 rounded-full ${dotColor}`} />
      </div>

      {/* Content */}
      <div
        className="min-w-0 flex-1 rounded-lg border border-slate-700/50 bg-slate-900 transition-colors hover:bg-slate-800/50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                  sourceColors[signal.source] ?? 'bg-slate-700/50 text-slate-400 border-slate-600'
                }`}
              >
                {formatAdapterName(signal.source)}
              </span>

              {typeof signal.metadata?.eventType === 'string' && (
                <span className="text-sm text-slate-300 font-medium">
                  {describeEvent(signal.source, signal.metadata.eventType as string, signal.metadata as Record<string, unknown>)}
                </span>
              )}

              <span
                className={`text-sm font-semibold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {isPositive ? '+' : ''}{impact.toFixed(1)} weight
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-slate-500">{formatDate(signal.timestamp)}</span>
              <svg
                className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>

          {/* Collapsed summary */}
          <div className="mt-2 flex items-center gap-4">
            <div>
              <span className="text-xs text-slate-500">Score</span>
              <p className="text-sm font-medium text-slate-200">{signal.score}</p>
            </div>
            <div>
              <span className="text-xs text-slate-500">Weight</span>
              <p className="text-sm font-medium text-slate-200">{signal.weight.toFixed(2)}</p>
            </div>
            {typeof signal.metadata?.description === 'string' && (
              <div className="flex-1 min-w-0">
                <span className="text-xs text-slate-500">Description</span>
                <p className="text-sm text-slate-300 truncate">{signal.metadata.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="border-t border-slate-700/50 p-4 space-y-3 animate-in slide-in-from-top-1 duration-200">
            {/* Impact breakdown */}
            <div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Impact Breakdown
              </span>
              <div className="mt-1.5 grid grid-cols-3 gap-3">
                <div className="rounded-md bg-slate-800/50 p-2.5">
                  <span className="text-[10px] text-slate-500">Raw Score</span>
                  <p className="text-sm font-bold text-slate-200">{signal.score}/100</p>
                </div>
                <div className="rounded-md bg-slate-800/50 p-2.5">
                  <span className="text-[10px] text-slate-500">Weight</span>
                  <p className="text-sm font-bold text-slate-200">{signal.weight.toFixed(3)}</p>
                </div>
                <div className="rounded-md bg-slate-800/50 p-2.5">
                  <span className="text-[10px] text-slate-500">Weighted Impact</span>
                  <p className={`text-sm font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(signal.score * signal.weight / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Forensics detail panel */}
            {signal.metadata?.forensics != null && (
              <ForensicsPanel forensics={signal.metadata.forensics as Record<string, unknown>} />
            )}

            {/* Full metadata */}
            {signal.metadata && Object.keys(signal.metadata).length > 0 && (
              <div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  Full Metadata
                </span>
                <div className="mt-1 rounded-md bg-slate-800/50 px-3 py-2 space-y-0.5">
                  {Object.entries(signal.metadata)
                    .filter(([key]) => key !== 'forensics')
                    .map(([key, value]) => (
                    <div key={key} className="flex items-baseline gap-2 text-xs">
                      <span className="text-slate-500 shrink-0">{key}:</span>
                      <span className="text-slate-300 truncate font-mono text-[11px]">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ForensicsPanel({ forensics }: { forensics: Record<string, unknown> }) {
  const f = forensics;
  const changedFiles = (Array.isArray(f.changedFiles) ? f.changedFiles : []) as Array<Record<string, unknown>>;
  const owner = f.owner ? String(f.owner) : null;
  const modifiedBy = f.modifiedBy ? String(f.modifiedBy) : null;
  const pid = f.pid != null ? Number(f.pid) : null;
  const changeSummary = f.changeSummary ? String(f.changeSummary) : '';
  const filePermissions = f.filePermissions ? String(f.filePermissions) : null;
  const isQuarantined = Boolean(f.isQuarantined);

  return (
    <div>
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
        File Change Forensics
      </span>
      <div className="mt-1.5 space-y-2">
        {/* WHO */}
        <div className="rounded-md bg-slate-800/50 px-3 py-2">
          <span className="text-[10px] text-slate-500 uppercase">Who</span>
          <p className="text-sm text-slate-200">
            {owner ? `Modified by: ${owner}` : 'Owner unknown'}
            {modifiedBy ? ` via ${modifiedBy}` : ''}
            {pid ? ` (PID ${pid})` : ''}
          </p>
        </div>

        {/* WHAT — changed files list */}
        {changedFiles.length > 0 && (
          <div className="rounded-md bg-slate-800/50 px-3 py-2">
            <span className="text-[10px] text-slate-500 uppercase">Changed Files</span>
            <div className="mt-1 space-y-0.5">
              {changedFiles.map((cf, i) => {
                const changeType = String(cf.changeType ?? '');
                const sizeChange = cf.sizeChange != null ? Number(cf.sizeChange) : null;
                const lineCountChange = cf.lineCountChange != null ? Number(cf.lineCountChange) : null;
                return (
                  <div key={i} className="flex items-baseline gap-2 text-xs">
                    <span className={`shrink-0 font-semibold ${
                      changeType.includes('deleted')
                        ? 'text-red-400'
                        : changeType.includes('created')
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}>
                      {changeType.includes('deleted') ? '-'
                        : changeType.includes('created') ? '+'
                        : '~'}
                    </span>
                    <span className="text-slate-300 font-mono text-[11px] truncate">
                      {String(cf.fileName ?? '')}
                    </span>
                    {sizeChange !== null && (
                      <span className="text-slate-500 text-[10px]">
                        {sizeChange >= 0 ? '+' : ''}{sizeChange} B
                      </span>
                    )}
                    {lineCountChange !== null && (
                      <span className="text-slate-500 text-[10px]">
                        {lineCountChange >= 0 ? '+' : ''}{lineCountChange} lines
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SUMMARY */}
        <div className="rounded-md bg-slate-800/50 px-3 py-2">
          <span className="text-[10px] text-slate-500 uppercase">Summary</span>
          <p className="text-sm text-slate-300">{changeSummary}</p>
          {filePermissions && (
            <p className="text-xs text-slate-500 mt-0.5">Permissions: {filePermissions}</p>
          )}
          {isQuarantined && (
            <p className="text-xs text-amber-400 mt-0.5 font-medium">
              Quarantine flag detected (macOS Gatekeeper)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
