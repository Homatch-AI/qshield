import { useCallback } from 'react';
import { useTrustState } from '@/hooks/useTrustState';
import { BreathingAnimation } from '@/components/shield/BreathingAnimation';
import { TRUST_LEVEL_STROKE_COLORS } from '@/lib/constants';
import { formatTrustScore } from '@/lib/formatters';
import { isIPCAvailable } from '@/lib/mock-data';

/**
 * Compact 80x80 shield overlay widget.
 * - Outer area: -webkit-app-region: drag (allows window dragging)
 * - Inner shield: -webkit-app-region: no-drag (receives mouse events)
 * - Double-click on shield toggles the main QShield Desktop window
 * - Breathing animation pulses based on trust level
 */
export default function ShieldOverlay() {
  const { score, level } = useTrustState();
  const strokeColor = TRUST_LEVEL_STROKE_COLORS[level];

  /** Double-click: focus the main window via IPC */
  const handleDoubleClick = useCallback(() => {
    if (isIPCAvailable() && window.qshield.app.focusMain) {
      window.qshield.app.focusMain();
    }
  }, []);

  return (
    <div
      className="flex h-screen w-screen items-center justify-center bg-transparent select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Inner area: no-drag so it receives click/double-click events */}
      <div
        onDoubleClick={handleDoubleClick}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="cursor-pointer"
      >
        <BreathingAnimation level={level} className="flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {/* Shield SVG — sized for 80x80 window */}
            <svg
              width="60"
              height="70"
              viewBox="0 0 120 140"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-lg"
              style={{ filter: `drop-shadow(0 0 12px ${strokeColor}40)` }}
            >
              <path
                d="M60 8L12 30V62C12 96 32 126 60 134C88 126 108 96 108 62V30L60 8Z"
                fill="rgba(15, 23, 42, 0.85)"
                stroke={strokeColor}
                strokeWidth="4"
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
                <path d="M45 68L55 78L77 56" stroke={strokeColor} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              ) : level === 'critical' || level === 'warning' ? (
                <>
                  <line x1="60" y1="52" x2="60" y2="72" stroke={strokeColor} strokeWidth="5" strokeLinecap="round" />
                  <circle cx="60" cy="82" r="4" fill={strokeColor} />
                </>
              ) : (
                <>
                  <line x1="60" y1="52" x2="60" y2="72" stroke={strokeColor} strokeWidth="4" strokeLinecap="round" />
                  <circle cx="60" cy="80" r="3" fill={strokeColor} />
                </>
              )}
            </svg>

            {/* Score badge */}
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-2 py-px"
              style={{ backgroundColor: `${strokeColor}25`, border: `1px solid ${strokeColor}50` }}
            >
              <span className="text-[10px] font-bold tabular-nums" style={{ color: strokeColor }}>
                {formatTrustScore(score)}
              </span>
            </div>
          </div>
        </BreathingAnimation>
      </div>
    </div>
  );
}
