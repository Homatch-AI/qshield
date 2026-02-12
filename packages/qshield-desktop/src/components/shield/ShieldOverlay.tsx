import { useCallback } from 'react';
import { useTrustState } from '@/hooks/useTrustState';
import { BreathingAnimation } from '@/components/shield/BreathingAnimation';
import { TRUST_LEVEL_STROKE_COLORS } from '@/lib/constants';
import { isIPCAvailable } from '@/lib/mock-data';

/**
 * 80x80 shield overlay widget with breathing circle (~44px) + live score.
 * - Entire window: -webkit-app-region: drag (allows window dragging)
 * - Inner content: -webkit-app-region: no-drag (receives double-click)
 * - Double-click toggles the main QShield Desktop window
 */
export default function ShieldOverlay() {
  const { score, level } = useTrustState();
  const strokeColor = TRUST_LEVEL_STROKE_COLORS[level];

  const handleDoubleClick = useCallback(() => {
    console.log('DBLCLICK FIRED');
    if (isIPCAvailable() && window.qshield.app.toggleMainWindow) {
      window.qshield.app.toggleMainWindow();
    }
  }, []);

  return (
    <div
      className="flex h-screen w-screen flex-col items-center justify-center select-none"
      style={{
        WebkitAppRegion: 'drag',
        backgroundColor: 'rgba(0,0,0,0.01)',
      } as React.CSSProperties}
    >
      <div
        onDoubleClick={handleDoubleClick}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="flex flex-col items-center cursor-pointer"
      >
        <BreathingAnimation level={level} className="flex items-center justify-center">
          <svg
            width="36"
            height="42"
            viewBox="0 0 120 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ filter: `drop-shadow(0 0 8px ${strokeColor}40)` }}
          >
            <path
              d="M60 8L12 30V62C12 96 32 126 60 134C88 126 108 96 108 62V30L60 8Z"
              fill="rgba(15, 23, 42, 0.85)"
              stroke={strokeColor}
              strokeWidth="5"
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
              <path d="M45 68L55 78L77 56" stroke={strokeColor} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ) : level === 'critical' || level === 'warning' ? (
              <>
                <line x1="60" y1="52" x2="60" y2="72" stroke={strokeColor} strokeWidth="6" strokeLinecap="round" />
                <circle cx="60" cy="82" r="5" fill={strokeColor} />
              </>
            ) : (
              <>
                <line x1="60" y1="52" x2="60" y2="72" stroke={strokeColor} strokeWidth="5" strokeLinecap="round" />
                <circle cx="60" cy="80" r="4" fill={strokeColor} />
              </>
            )}
          </svg>
        </BreathingAnimation>

        {/* Live trust score */}
        <span
          className="mt-0.5 font-bold tabular-nums leading-none"
          style={{ fontSize: '11px', color: strokeColor, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
        >
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}
