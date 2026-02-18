import { useState } from 'react';

interface ScoreEntry {
  timestamp: string;
  score: number;
  level: string;
}

interface ScoreTrendChartProps {
  history: ScoreEntry[];
  onRangeChange: (days: number) => void;
}

const RANGE_OPTIONS = [30, 60, 90] as const;

const LEVEL_COLORS: Record<string, string> = {
  verified: '#10b981',
  normal: '#0ea5e9',
  elevated: '#f59e0b',
  warning: '#f97316',
  critical: '#ef4444',
};

function getAvgLevel(entries: ScoreEntry[]): string {
  if (entries.length === 0) return 'normal';
  const avg = entries.reduce((sum, e) => sum + e.score, 0) / entries.length;
  if (avg >= 90) return 'verified';
  if (avg >= 70) return 'normal';
  if (avg >= 50) return 'elevated';
  if (avg >= 30) return 'warning';
  return 'critical';
}

export function ScoreTrendChart({ history, onRangeChange }: ScoreTrendChartProps) {
  const [activeRange, setActiveRange] = useState<number>(30);

  const handleRange = (days: number) => {
    setActiveRange(days);
    onRangeChange(days);
  };

  // Chart dimensions
  const width = 600;
  const height = 200;
  const padTop = 20;
  const padBottom = 30;
  const padLeft = 35;
  const padRight = 15;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const data = history.length > 0 ? history : [];
  const lineColor = LEVEL_COLORS[getAvgLevel(data)] ?? '#0ea5e9';

  // Build points
  const points = data.map((entry, i) => {
    const x = padLeft + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2);
    const y = padTop + chartH - (entry.score / 100) * chartH;
    return { x, y, score: entry.score, date: entry.timestamp };
  });

  // SVG path from points
  const linePath = points.length > 0
    ? `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`
    : '';

  // Area path (fill under line)
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x},${padTop + chartH} L ${points[0].x},${padTop + chartH} Z`
    : '';

  // Y-axis labels
  const yLabels = [0, 25, 50, 75, 100];

  // X-axis date labels (show ~5 evenly spaced)
  const xLabelCount = 5;
  const xLabels: Array<{ x: number; label: string }> = [];
  if (data.length > 0) {
    for (let i = 0; i < xLabelCount; i++) {
      const idx = Math.round((i / (xLabelCount - 1)) * (data.length - 1));
      const d = new Date(data[idx].timestamp);
      xLabels.push({
        x: points[idx].x,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
      });
    }
  }

  // Stats
  const scores = data.map(d => d.score);
  const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const min = scores.length > 0 ? Math.round(Math.min(...scores)) : 0;
  const max = scores.length > 0 ? Math.round(Math.max(...scores)) : 0;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Score Trend</h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Avg: <span className="text-slate-300">{avg}</span></span>
            <span>Min: <span className="text-slate-300">{min}</span></span>
            <span>Max: <span className="text-slate-300">{max}</span></span>
          </div>
          <div className="flex rounded-lg border border-slate-700 bg-slate-800">
            {RANGE_OPTIONS.map(days => (
              <button
                key={days}
                onClick={() => handleRange(days)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  activeRange === days
                    ? 'bg-sky-500/20 text-sky-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {yLabels.map(val => {
          const y = padTop + chartH - (val / 100) * chartH;
          return (
            <g key={val}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#334155"
                strokeWidth={0.5}
                strokeDasharray="4,4"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                fill="#64748b"
                fontSize={10}
              >
                {val}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map((label, i) => (
          <text
            key={i}
            x={label.x}
            y={height - 6}
            textAnchor="middle"
            fill="#64748b"
            fontSize={10}
          >
            {label.label}
          </text>
        ))}

        {/* Area fill */}
        {areaPath && (
          <path
            d={areaPath}
            fill={lineColor}
            fillOpacity={0.1}
          />
        )}

        {/* Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 4px ${lineColor}40)` }}
          />
        )}

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={data.length <= 31 ? 2.5 : 1.5}
            fill={lineColor}
            opacity={0.8}
          />
        ))}
      </svg>
    </div>
  );
}
