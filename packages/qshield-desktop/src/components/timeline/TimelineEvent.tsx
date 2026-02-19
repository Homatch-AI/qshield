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
            {/* Human-readable event details */}
            <EventDetails metadata={signal.metadata as Record<string, unknown> | undefined} />

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

            {/* Technical Details — collapsible raw metadata */}
            {signal.metadata && Object.keys(signal.metadata).filter(k => k !== 'forensics').length > 0 && (
              <TechnicalDetails metadata={signal.metadata} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EventDetails({ metadata }: { metadata: Record<string, unknown> | undefined }) {
  if (!metadata) return null;
  const m = metadata;
  const forensics = m.forensics as Record<string, unknown> | undefined;

  // Extract typed values to avoid `unknown && <JSX>` TS errors
  const fileName = m.fileName ? String(m.fileName) : null;
  const extension = m.extension ? String(m.extension) : null;
  const size = m.size != null ? Number(m.size) : null;
  const filePath = m.path ? String(m.path) : null;
  const owner = m.owner ? String(m.owner) : null;
  const permissions = m.permissions ? String(m.permissions) : null;
  const isHidden = Boolean(m.isHidden);
  const assetName = m.assetName ? String(m.assetName) : null;
  const sensitivity = m.sensitivity ? String(m.sensitivity) : null;
  const trustBefore = m.trustStateBefore ? String(m.trustStateBefore) : null;
  const trustAfter = m.trustStateAfter ? String(m.trustStateAfter) : null;
  const modifiedBy = forensics?.modifiedBy ? String(forensics.modifiedBy) : null;
  const pid = forensics?.pid != null ? Number(forensics.pid) : null;
  const isQuarantined = Boolean(forensics?.isQuarantined);
  const changeSummary = forensics?.changeSummary ? String(forensics.changeSummary) : null;
  const changedFiles = forensics?.changedFiles && Array.isArray(forensics.changedFiles)
    ? (forensics.changedFiles as Array<Record<string, unknown>>)
    : [];

  return (
    <div className="space-y-2 pb-3 border-b border-slate-700/50">
      {/* File info */}
      {fileName && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">File:</span>
          <span className="font-mono text-slate-200">{fileName}</span>
          {extension && (
            <span className="text-xs text-slate-500">({extension})</span>
          )}
          {size != null && (
            <span className="text-xs text-slate-400">{formatBytesCompact(size)}</span>
          )}
        </div>
      )}

      {/* Path */}
      {filePath && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Path:</span>
          <span className="font-mono text-xs text-slate-400 truncate max-w-lg">{filePath}</span>
        </div>
      )}

      {/* Owner / Modified by */}
      {(owner || modifiedBy) && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Owner:</span>
          <span className="font-medium text-slate-200">{owner || 'unknown'}</span>
          {modifiedBy && modifiedBy !== 'unknown process' && (
            <>
              <span className="text-slate-600">via</span>
              <span className="font-medium text-sky-400">{modifiedBy}</span>
            </>
          )}
          {pid != null && (
            <span className="text-xs text-slate-600">(PID {pid})</span>
          )}
        </div>
      )}

      {/* Permissions & flags */}
      {(permissions || isHidden || isQuarantined) && (
        <div className="flex items-center gap-4 text-xs text-slate-500">
          {permissions && <span>Permissions: {permissions}</span>}
          {isHidden && <span className="text-amber-400">Hidden file</span>}
          {isQuarantined && <span className="text-amber-400">Warning: Downloaded from internet</span>}
        </div>
      )}

      {/* High-trust asset info */}
      {assetName && (
        <div className="mt-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-amber-400">{'\uD83D\uDEE1'}</span>
            <span className="font-medium text-amber-300">{assetName}</span>
            {sensitivity && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                sensitivity === 'critical' ? 'bg-red-500/20 text-red-400' :
                sensitivity === 'strict' ? 'bg-amber-500/20 text-amber-400' :
                'bg-blue-500/20 text-blue-400'
              }`}>
                {sensitivity}
              </span>
            )}
          </div>
          {trustBefore && trustAfter && (
            <div className="text-xs text-slate-400 mt-1">
              State: {trustBefore} &rarr; {trustAfter}
            </div>
          )}
        </div>
      )}

      {/* Forensics: changed files list */}
      {changedFiles.length > 0 && (
        <div className="mt-2">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Changed Files</span>
          <div className="mt-1 space-y-1">
            {changedFiles.map((f, i) => {
              const ct = String(f.changeType ?? '');
              const sc = f.sizeChange != null ? Number(f.sizeChange) : null;
              return (
                <div key={i} className="flex items-center gap-2 rounded-md bg-slate-800/50 px-3 py-1.5 text-sm">
                  <span className="text-base">
                    {ct.includes('deleted') ? '\uD83D\uDD34' : ct.includes('created') ? '\uD83D\uDFE2' : '\uD83D\uDFE1'}
                  </span>
                  <span className="font-mono text-slate-300 truncate">{String(f.fileName ?? '')}</span>
                  <span className="text-xs text-slate-500">&mdash;</span>
                  <span className="text-xs text-slate-400">{ct}</span>
                  {sc != null && (
                    <span className="text-xs text-slate-500">({sc >= 0 ? '+' : ''}{formatBytesCompact(sc)})</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Forensics summary */}
      {changeSummary && (
        <div className="text-xs text-slate-500">{changeSummary}</div>
      )}
    </div>
  );
}

function TechnicalDetails({ metadata }: { metadata: Record<string, unknown> }) {
  const [showRaw, setShowRaw] = useState(false);
  const entries = Object.entries(metadata).filter(([key]) => key !== 'forensics');
  if (entries.length === 0) return null;

  return (
    <div>
      <button
        onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}
        className="text-xs text-slate-600 hover:text-slate-400 flex items-center gap-1 transition-colors"
      >
        <span>{showRaw ? '\u25BC' : '\u25B6'}</span> Technical Details
      </button>
      {showRaw && (
        <div className="mt-2 rounded-md bg-slate-800/50 px-3 py-2 space-y-0.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-baseline gap-2 text-xs">
              <span className="text-slate-500 shrink-0">{key}:</span>
              <span className="text-slate-300 truncate font-mono text-[11px]">{String(value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatBytesCompact(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes} B`;
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
