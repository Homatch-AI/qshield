import { useMemo } from 'react';
import type { TrustDimensions } from '@qshield/core';

interface TrustDimensionRadarProps {
  dimensions: TrustDimensions;
  size?: number;
}

const AXES: { key: keyof TrustDimensions; label: string; icon: string }[] = [
  { key: 'temporal', label: 'Temporal', icon: '\u23F1' },
  { key: 'contextual', label: 'Contextual', icon: '\uD83D\uDD0D' },
  { key: 'cryptographic', label: 'Cryptographic', icon: '\uD83D\uDD10' },
  { key: 'spatial', label: 'Spatial', icon: '\uD83C\uDF10' },
  { key: 'behavioral', label: 'Behavioral', icon: '\uD83D\uDCCA' },
];

function getColor(avg: number): string {
  if (avg >= 90) return '#10b981'; // emerald
  if (avg >= 70) return '#0ea5e9'; // sky
  if (avg >= 50) return '#f59e0b'; // amber
  if (avg >= 30) return '#f97316'; // orange
  return '#ef4444'; // red
}

export function TrustDimensionRadar({ dimensions, size = 200 }: TrustDimensionRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 30;
  const rings = 4;

  const { points, avg, color } = useMemo(() => {
    const n = AXES.length;
    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2; // top

    const pts = AXES.map((axis, i) => {
      const value = dimensions[axis.key];
      const r = (value / 100) * radius;
      const angle = startAngle + i * angleStep;
      return {
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        labelX: cx + (radius + 18) * Math.cos(angle),
        labelY: cy + (radius + 18) * Math.sin(angle),
        value,
        axis,
      };
    });

    const avgScore = AXES.reduce((sum, a) => sum + dimensions[a.key], 0) / AXES.length;

    return {
      points: pts,
      avg: Math.round(avgScore),
      color: getColor(avgScore),
    };
  }, [dimensions, cx, cy, radius]);

  const polygon = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Ring paths
  const ringPaths = Array.from({ length: rings }, (_, i) => {
    const r = ((i + 1) / rings) * radius;
    const n = AXES.length;
    const angleStep = (2 * Math.PI) / n;
    const startAngle = -Math.PI / 2;
    const pts = Array.from({ length: n }, (__, j) => {
      const angle = startAngle + j * angleStep;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    });
    return pts.join(' ');
  });

  // Axis lines
  const axisLines = AXES.map((_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / AXES.length;
    return {
      x2: cx + radius * Math.cos(angle),
      y2: cy + radius * Math.sin(angle),
    };
  });

  return (
    <div className="flex flex-col items-center">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-semibold text-slate-200">5-Dimension Trust</h3>
        <span className="rounded-full bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 text-[9px] font-semibold text-sky-400 uppercase tracking-wider">
          Patent Claim 1
        </span>
      </div>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Ring backgrounds */}
        {ringPaths.map((pts, i) => (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="rgb(51, 65, 85)"
            strokeWidth={0.5}
            opacity={0.5}
          />
        ))}

        {/* Axis lines */}
        {axisLines.map((line, i) => (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={line.x2}
            y2={line.y2}
            stroke="rgb(51, 65, 85)"
            strokeWidth={0.5}
            opacity={0.5}
          />
        ))}

        {/* Data polygon */}
        <polygon
          points={polygon}
          fill={color}
          fillOpacity={0.15}
          stroke={color}
          strokeWidth={2}
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={color} />
        ))}

        {/* Axis labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.labelX}
            y={p.labelY}
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[9px] fill-slate-400"
          >
            {p.axis.icon}
          </text>
        ))}
      </svg>

      {/* Legend */}
      <div className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[10px] text-slate-500">
        {points.map((p, i) => (
          <span key={i}>
            {p.axis.icon} {p.axis.label}: <span className="text-slate-300 font-medium">{p.value}</span>
          </span>
        ))}
      </div>
      <div className="mt-1 text-xs text-slate-400">
        Avg: <span className="font-semibold" style={{ color }}>{avg}</span>
      </div>
    </div>
  );
}
