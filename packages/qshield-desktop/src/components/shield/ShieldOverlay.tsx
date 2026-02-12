import { useState } from 'react';
import { useTrustState } from '@/hooks/useTrustState';
import { BreathingAnimation } from '@/components/shield/BreathingAnimation';
import { TRUST_LEVEL_STROKE_COLORS, TRUST_LEVEL_COLORS } from '@/lib/constants';
import { formatTrustScore, formatRelativeTime, formatAdapterName } from '@/lib/formatters';

/**
 * Compact shield overlay with breathing animation and expandable mini dashboard.
 * Click the shield to expand and see the last 3 events.
 */
export default function ShieldOverlay() {
  const { score, level, signals } = useTrustState();
  const [expanded, setExpanded] = useState(false);
  const strokeColor = TRUST_LEVEL_STROKE_COLORS[level];
  const colors = TRUST_LEVEL_COLORS[level];

  const levelLabel =
    level === 'verified' ? 'Verified'
    : level === 'normal' ? 'Normal'
    : level === 'elevated' ? 'Elevated'
    : level === 'warning' ? 'Warning'
    : 'Critical';

  const lastThreeEvents = signals
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 3);

  return (
    <div
      className="flex h-screen w-screen items-center justify-center bg-transparent select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <BreathingAnimation level={level} className="flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {/* Shield SVG */}
            <svg
              width="120"
              height="140"
              viewBox="0 0 120 140"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-lg"
              style={{ filter: `drop-shadow(0 0 20px ${strokeColor}40)` }}
            >
              <path
                d="M60 8L12 30V62C12 96 32 126 60 134C88 126 108 96 108 62V30L60 8Z"
                fill="rgba(15, 23, 42, 0.85)"
                stroke={strokeColor}
                strokeWidth="3"
                strokeLinejoin="round"
              />
              <path
                d="M60 18L22 36V62C22 90 38 116 60 124C82 116 98 90 98 62V36L60 18Z"
                fill="rgba(15, 23, 42, 0.5)"
                stroke={strokeColor}
                strokeWidth="1"
                strokeOpacity="0.3"
                strokeLinejoin="round"
              />
              {level === 'verified' || level === 'normal' ? (
                <path d="M45 68L55 78L77 56" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ) : level === 'critical' || level === 'warning' ? (
                <>
                  <line x1="60" y1="52" x2="60" y2="72" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />
                  <circle cx="60" cy="82" r="3" fill={strokeColor} />
                </>
              ) : (
                <>
                  <line x1="60" y1="52" x2="60" y2="72" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" />
                  <circle cx="60" cy="80" r="2.5" fill={strokeColor} />
                </>
              )}
            </svg>

            {/* Score badge */}
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5"
              style={{ backgroundColor: `${strokeColor}20`, border: `1px solid ${strokeColor}40` }}
            >
              <span className="text-sm font-bold tabular-nums" style={{ color: strokeColor }}>
                {formatTrustScore(score)}
              </span>
            </div>
          </div>
        </BreathingAnimation>
      </div>

      {/* Level label */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
          {levelLabel}
        </span>
      </div>

      {/* Expanded mini dashboard */}
      {expanded && (
        <div
          className="absolute top-4 right-4 w-72 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-sm shadow-xl overflow-hidden animate-in slide-in-from-right duration-300"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div className="border-b border-slate-700 px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Trust Status</h3>
              <div className="flex items-center gap-1.5">
                <span className={`text-lg font-bold ${colors.text}`}>{Math.round(score)}</span>
                <span className="text-xs text-slate-500">/100</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-700 ${colors.dot}`}
                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
              />
            </div>
          </div>

          {lastThreeEvents.length > 0 && (
            <div className="p-3 space-y-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Recent Events
              </span>
              {lastThreeEvents.map((signal, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md bg-slate-800/50 px-2.5 py-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full ${signal.score >= 50 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="text-[11px] text-slate-300 flex-1 truncate">
                    {formatAdapterName(signal.source)}
                    {typeof signal.metadata?.description === 'string' ? `: ${signal.metadata.description}` : ''}
                  </span>
                  <span className="text-[10px] text-slate-500 shrink-0">
                    {formatRelativeTime(signal.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
