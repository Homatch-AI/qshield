import { useTrustState } from '@/hooks/useTrustState';
import { BreathingAnimation } from '@/components/shield/BreathingAnimation';
import { TRUST_LEVEL_STROKE_COLORS, TRUST_LEVEL_COLORS } from '@/lib/constants';
import { formatTrustScore } from '@/lib/formatters';

export default function ShieldOverlay() {
  const { score, level } = useTrustState();
  const strokeColor = TRUST_LEVEL_STROKE_COLORS[level];
  const colors = TRUST_LEVEL_COLORS[level];

  const levelLabel =
    level === 'verified'
      ? 'Verified'
      : level === 'normal'
      ? 'Normal'
      : level === 'elevated'
      ? 'Elevated'
      : level === 'warning'
      ? 'Warning'
      : 'Critical';

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
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
            {/* Shield shape */}
            <path
              d="M60 8L12 30V62C12 96 32 126 60 134C88 126 108 96 108 62V30L60 8Z"
              fill="rgba(15, 23, 42, 0.85)"
              stroke={strokeColor}
              strokeWidth="3"
              strokeLinejoin="round"
            />

            {/* Inner shield highlight */}
            <path
              d="M60 18L22 36V62C22 90 38 116 60 124C82 116 98 90 98 62V36L60 18Z"
              fill="rgba(15, 23, 42, 0.5)"
              stroke={strokeColor}
              strokeWidth="1"
              strokeOpacity="0.3"
              strokeLinejoin="round"
            />

            {/* Checkmark for verified, exclamation for warning/critical */}
            {level === 'verified' || level === 'normal' ? (
              <path
                d="M45 68L55 78L77 56"
                stroke={strokeColor}
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ) : level === 'critical' || level === 'warning' ? (
              <>
                <line x1="60" y1="52" x2="60" y2="72" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />
                <circle cx="60" cy="82" r="3" fill={strokeColor} />
              </>
            ) : (
              /* Elevated: triangle warning */
              <>
                <line x1="60" y1="52" x2="60" y2="72" stroke={strokeColor} strokeWidth="3.5" strokeLinecap="round" />
                <circle cx="60" cy="80" r="2.5" fill={strokeColor} />
              </>
            )}
          </svg>

          {/* Score badge */}
          <div
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5"
            style={{
              backgroundColor: `${strokeColor}20`,
              border: `1px solid ${strokeColor}40`,
            }}
          >
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: strokeColor }}
            >
              {formatTrustScore(score)}
            </span>
          </div>
        </div>
      </BreathingAnimation>

      {/* Level label */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
          {levelLabel}
        </span>
      </div>
    </div>
  );
}
