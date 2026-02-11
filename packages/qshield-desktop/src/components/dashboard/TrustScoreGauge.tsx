import { useEffect, useState } from 'react';
import type { TrustLevel } from '@qshield/core';
import { TRUST_LEVEL_STROKE_COLORS, TRUST_LEVEL_COLORS } from '@/lib/constants';

interface TrustScoreGaugeProps {
  score: number;
  level: TrustLevel;
  size?: number;
}

export function TrustScoreGauge({ score, level, size = 200 }: TrustScoreGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const duration = 1000;
    const startTime = performance.now();
    const startScore = animatedScore;
    const endScore = score;

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startScore + (endScore - startScore) * eased;
      setAnimatedScore(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [score]);

  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * 0.75;
  const filledLength = (animatedScore / 100) * arcLength;
  const center = size / 2;
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
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="transform rotate-[135deg]"
        >
          {/* Background track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
            strokeLinecap="round"
            className="text-slate-800"
          />
          {/* Filled arc */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${filledLength} ${circumference - filledLength}`}
            strokeLinecap="round"
            className="transition-colors duration-500"
            style={{
              filter: `drop-shadow(0 0 6px ${strokeColor}40)`,
            }}
          />
        </svg>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-4xl font-bold tabular-nums ${colors.text}`}
          >
            {Math.round(animatedScore)}
          </span>
          <span className="text-sm text-slate-500 mt-0.5">/ 100</span>
        </div>
      </div>

      {/* Level badge */}
      <div
        className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}
      >
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors.dot}`} />
        {levelLabel}
      </div>
    </div>
  );
}
