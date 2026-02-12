import type { TrustLevel } from '@qshield/core';
import { TRUST_LEVEL_STROKE_COLORS } from '@/lib/constants';

interface BreathingAnimationProps {
  level: TrustLevel;
  children: React.ReactNode;
  className?: string;
}

/**
 * CSS keyframe breathing animation. Speed mapped to trust level:
 * verified=4s, normal=2.5s, elevated=1.5s, warning=1s, critical=0.8s.
 * Glow color matches trust level (emerald to red).
 */
const breathingSpeed: Record<TrustLevel, string> = {
  verified: '4s',
  normal: '2.5s',
  elevated: '1.5s',
  warning: '1s',
  critical: '0.8s',
};

export function BreathingAnimation({ level, children, className = '' }: BreathingAnimationProps) {
  const duration = breathingSpeed[level];
  const color = TRUST_LEVEL_STROKE_COLORS[level];

  return (
    <div
      className={`relative ${className}`}
      style={
        {
          '--breathing-duration': duration,
          '--breathing-color': color,
        } as React.CSSProperties
      }
    >
      {/* Outer glow ring */}
      <div
        className="absolute inset-0 rounded-full opacity-30"
        style={{
          animation: `breathing-glow var(--breathing-duration) ease-in-out infinite`,
          boxShadow: `0 0 30px 10px ${color}`,
        }}
      />

      {/* Pulse ring */}
      <div
        className="absolute inset-[-8px] rounded-full border-2"
        style={{
          borderColor: color,
          animation: `breathing-ring var(--breathing-duration) ease-in-out infinite`,
          opacity: 0.2,
        }}
      />

      {/* Content */}
      <div
        style={{
          animation: `breathing-scale var(--breathing-duration) ease-in-out infinite`,
        }}
      >
        {children}
      </div>

      <style>{`
        @keyframes breathing-glow {
          0%, 100% { opacity: 0.15; transform: scale(0.95); }
          50% { opacity: 0.4; transform: scale(1.05); }
        }
        @keyframes breathing-ring {
          0%, 100% { opacity: 0.1; transform: scale(0.98); }
          50% { opacity: 0.3; transform: scale(1.04); }
        }
        @keyframes breathing-scale {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
      `}</style>
    </div>
  );
}
