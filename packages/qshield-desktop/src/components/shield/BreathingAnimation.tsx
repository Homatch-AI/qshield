import type { TrustLevel } from '@qshield/core';
import { TRUST_LEVEL_STROKE_COLORS } from '@/lib/constants';

type ExecutionMode = 'HUMAN_DIRECT' | 'AI_ASSISTED' | 'AI_AUTONOMOUS';
type RiskSource = 'ENVIRONMENT' | 'AI_EXECUTION' | 'MIXED';

interface BreathingAnimationProps {
  level: TrustLevel;
  children: React.ReactNode;
  className?: string;
  executionMode?: ExecutionMode;
  riskSource?: RiskSource;
}

/**
 * CSS keyframe breathing animation. Speed mapped to trust level:
 * verified=4s, normal=2.5s, elevated=1.5s, warning=1s, critical=0.8s.
 * Glow color matches trust level (emerald to red).
 *
 * When AI execution is active, the animation gets additional visual cues:
 * - AI_ASSISTED: violet tint ring overlay
 * - AI_AUTONOMOUS: pulsing violet ring + faster speed multiplier
 */
const breathingSpeed: Record<TrustLevel, string> = {
  verified: '4s',
  normal: '2.5s',
  elevated: '1.5s',
  warning: '1s',
  critical: '0.8s',
};

/** AI modes speed up the breathing to convey urgency */
const AI_SPEED_MULTIPLIER: Record<ExecutionMode, number> = {
  HUMAN_DIRECT: 1.0,
  AI_ASSISTED: 0.85,
  AI_AUTONOMOUS: 0.7,
};

export function BreathingAnimation({ level, children, className = '', executionMode, riskSource }: BreathingAnimationProps) {
  const baseDuration = parseFloat(breathingSpeed[level]);
  const multiplier = executionMode ? AI_SPEED_MULTIPLIER[executionMode] : 1.0;
  const duration = `${(baseDuration * multiplier).toFixed(2)}s`;
  const color = TRUST_LEVEL_STROKE_COLORS[level];

  const isAI = executionMode && executionMode !== 'HUMAN_DIRECT';
  const aiColor = '#8b5cf6'; // violet-500

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

      {/* AI execution indicator ring */}
      {isAI && (
        <div
          className="absolute inset-[-8px] rounded-full border-2"
          style={{
            borderColor: aiColor,
            animation: `breathing-ring var(--breathing-duration) ease-in-out infinite`,
            opacity: executionMode === 'AI_AUTONOMOUS' ? 0.5 : 0.25,
            boxShadow: executionMode === 'AI_AUTONOMOUS' ? `0 0 12px 2px ${aiColor}` : 'none',
          }}
        />
      )}

      {/* Pulse ring */}
      <div
        className="absolute inset-[-6px] rounded-full border"
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

      {/* AI mode badge */}
      {isAI && (
        <div
          className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[8px] font-bold text-white"
          style={{
            width: 16,
            height: 16,
            backgroundColor: riskSource === 'AI_EXECUTION' ? '#ef4444' : aiColor,
          }}
          title={`${executionMode}${riskSource ? ` (${riskSource})` : ''}`}
        >
          AI
        </div>
      )}

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
