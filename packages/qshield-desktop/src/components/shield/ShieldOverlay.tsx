import { useCallback, useEffect, useRef, useState } from 'react';
import { useTrustState } from '@/hooks/useTrustState';
import { BreathingAnimation } from '@/components/shield/BreathingAnimation';
import { TRUST_LEVEL_STROKE_COLORS } from '@/lib/constants';
import { isIPCAvailable } from '@/lib/mock-data';
import type { TrustLevel } from '@qshield/core';

/** Severity → stroke color */
const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#f59e0b',
  low: '#0ea5e9',
};

/** Map severity to breathing animation speed level */
const SEVERITY_TO_LEVEL: Record<string, TrustLevel> = {
  critical: 'critical',
  high: 'warning',
  medium: 'elevated',
  low: 'normal',
};

interface ActiveAlert {
  severity: string;
  title: string;
}

let alertSubInitialized = false;

/**
 * 80x80 shield overlay widget with breathing circle (~44px) + live score.
 * - Entire window: -webkit-app-region: drag (allows window dragging)
 * - Inner content: -webkit-app-region: no-drag (receives clicks)
 * - Single-click: opens main window to alerts page (when alert active)
 * - Double-click: toggles the main QShield Desktop window
 * - Changes color when an alert fires, returns to trust color after 8s
 */
export default function ShieldOverlay() {
  const { score, level } = useTrustState();
  const strokeColor = TRUST_LEVEL_STROKE_COLORS[level];

  const [activeAlert, setActiveAlert] = useState<ActiveAlert | null>(null);
  const popupTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Subscribe to alert push events (once, module-level flag)
  useEffect(() => {
    if (alertSubInitialized) return;
    alertSubInitialized = true;

    if (isIPCAvailable() && window.qshield.alerts.subscribe) {
      window.qshield.alerts.subscribe((alert) => {
        if (alert && !alert.dismissed) {
          setActiveAlert({ severity: alert.severity, title: alert.title });
          clearTimeout(popupTimeoutRef.current);
          popupTimeoutRef.current = setTimeout(() => {
            setActiveAlert(null);
          }, 8000);
        }
      });
    }
  }, []);

  // Derive effective color and level from active alert or trust state
  const effectiveColor = activeAlert
    ? SEVERITY_COLORS[activeAlert.severity] ?? strokeColor
    : strokeColor;
  const effectiveLevel = activeAlert
    ? SEVERITY_TO_LEVEL[activeAlert.severity] ?? level
    : level;

  // Icon shape: show exclamation when alert active, else trust-level icon
  const showExclamation = !!activeAlert;

  // Single-click: open alerts page (with 300ms delay to disambiguate from dblclick)
  const handleClick = useCallback(() => {
    clickTimeoutRef.current = setTimeout(() => {
      if (isIPCAvailable() && window.qshield.app.showAlerts) {
        window.qshield.app.showAlerts();
      }
      setActiveAlert(null);
      clearTimeout(popupTimeoutRef.current);
    }, 300);
  }, []);

  // Double-click: toggle main window (cancel pending single-click)
  const handleDoubleClick = useCallback(() => {
    clearTimeout(clickTimeoutRef.current);
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
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        className="flex flex-col items-center cursor-pointer"
      >
        <BreathingAnimation level={effectiveLevel} className="flex items-center justify-center">
          <svg
            width="36"
            height="42"
            viewBox="0 0 120 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ filter: `drop-shadow(0 0 8px ${effectiveColor}40)` }}
          >
            <path
              d="M60 8L12 30V62C12 96 32 126 60 134C88 126 108 96 108 62V30L60 8Z"
              fill="rgba(15, 23, 42, 0.85)"
              stroke={effectiveColor}
              strokeWidth="5"
              strokeLinejoin="round"
            />
            <path
              d="M60 18L22 36V62C22 90 38 116 60 124C82 116 98 90 98 62V36L60 18Z"
              fill="rgba(15, 23, 42, 0.5)"
              stroke={effectiveColor}
              strokeWidth="1"
              strokeOpacity="0.3"
              strokeLinejoin="round"
            />
            {showExclamation ? (
              <>
                <line x1="60" y1="48" x2="60" y2="74" stroke={effectiveColor} strokeWidth="7" strokeLinecap="round" />
                <circle cx="60" cy="86" r="5" fill={effectiveColor} />
              </>
            ) : level === 'verified' || level === 'normal' ? (
              <path d="M45 68L55 78L77 56" stroke={effectiveColor} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            ) : level === 'critical' || level === 'warning' ? (
              <>
                <line x1="60" y1="52" x2="60" y2="72" stroke={effectiveColor} strokeWidth="6" strokeLinecap="round" />
                <circle cx="60" cy="82" r="5" fill={effectiveColor} />
              </>
            ) : (
              <>
                <line x1="60" y1="52" x2="60" y2="72" stroke={effectiveColor} strokeWidth="5" strokeLinecap="round" />
                <circle cx="60" cy="80" r="4" fill={effectiveColor} />
              </>
            )}
          </svg>
        </BreathingAnimation>

        {/* Live trust score or severity badge */}
        {activeAlert ? (
          <span
            className="mt-0.5 rounded-full px-1.5 py-px font-bold uppercase leading-none tracking-wider"
            style={{
              fontSize: '8px',
              color: effectiveColor,
              backgroundColor: `${effectiveColor}20`,
              textShadow: '0 1px 3px rgba(0,0,0,0.6)',
            }}
          >
            {activeAlert.severity}
          </span>
        ) : (
          <span
            className="mt-0.5 font-bold tabular-nums leading-none"
            style={{ fontSize: '11px', color: strokeColor, textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
          >
            {Math.round(score)}
          </span>
        )}
      </div>
    </div>
  );
}
