interface TrustGradeDisplayProps {
  grade: string;
  trend: 'improving' | 'stable' | 'declining';
}

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-400',
  'A': 'text-emerald-400',
  'A-': 'text-emerald-400',
  'B+': 'text-sky-400',
  'B': 'text-sky-400',
  'B-': 'text-sky-400',
  'C+': 'text-amber-400',
  'C': 'text-amber-400',
  'D': 'text-orange-400',
  'F': 'text-red-400',
};

const GRADE_BG: Record<string, string> = {
  'A+': 'bg-emerald-500/10 border-emerald-500/30',
  'A': 'bg-emerald-500/10 border-emerald-500/30',
  'A-': 'bg-emerald-500/10 border-emerald-500/30',
  'B+': 'bg-sky-500/10 border-sky-500/30',
  'B': 'bg-sky-500/10 border-sky-500/30',
  'B-': 'bg-sky-500/10 border-sky-500/30',
  'C+': 'bg-amber-500/10 border-amber-500/30',
  'C': 'bg-amber-500/10 border-amber-500/30',
  'D': 'bg-orange-500/10 border-orange-500/30',
  'F': 'bg-red-500/10 border-red-500/30',
};

const TREND_CONFIG = {
  improving: { label: 'Improving', color: 'text-emerald-400', arrow: '\u2191' },
  stable: { label: 'Stable', color: 'text-slate-400', arrow: '\u2192' },
  declining: { label: 'Declining', color: 'text-red-400', arrow: '\u2193' },
} as const;

export function TrustGradeDisplay({ grade, trend }: TrustGradeDisplayProps) {
  const textColor = GRADE_COLORS[grade] ?? 'text-slate-400';
  const bgColor = GRADE_BG[grade] ?? 'bg-slate-500/10 border-slate-500/30';
  const trendConfig = TREND_CONFIG[trend];

  return (
    <div className={`flex items-center gap-4 rounded-xl border p-4 ${bgColor}`}>
      <div className={`text-5xl font-black tracking-tight ${textColor}`}>
        {grade}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Trust Grade
        </span>
        <span className={`flex items-center gap-1 text-sm font-medium ${trendConfig.color}`}>
          <span className="text-lg leading-none">{trendConfig.arrow}</span>
          {trendConfig.label}
        </span>
      </div>
    </div>
  );
}
