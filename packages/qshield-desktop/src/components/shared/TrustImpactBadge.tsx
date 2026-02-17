interface TrustImpactBadgeProps {
  impact: 'positive' | 'neutral' | 'negative';
  value?: number | null;
  className?: string;
}

const STYLES = {
  positive: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  neutral: 'bg-slate-700/50 text-slate-400 border-slate-600/50',
  negative: 'bg-red-500/10 text-red-400 border-red-500/20',
} as const;

const ARROWS = {
  positive: '\u2191', // ↑
  neutral: '\u2192',  // →
  negative: '\u2193', // ↓
} as const;

/**
 * Compact badge showing trust impact direction and optional numeric value.
 *
 * - Positive: green "↑ +10"
 * - Negative: red "↓ -15"
 * - Neutral: gray "→ 0"
 */
export function TrustImpactBadge({ impact, value, className = '' }: TrustImpactBadgeProps) {
  const arrow = ARROWS[impact];
  const sign = impact === 'positive' ? '+' : impact === 'negative' ? '' : '';

  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STYLES[impact]} ${className}`}
    >
      <span className="font-semibold">{arrow}</span>
      {value != null ? (
        <span>{sign}{value}</span>
      ) : (
        <span className="capitalize">{impact}</span>
      )}
    </span>
  );
}
