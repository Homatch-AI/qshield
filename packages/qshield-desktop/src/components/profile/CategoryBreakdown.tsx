import type { TrustSignal } from '@qshield/core';

interface CategoryScore {
  label: string;
  icon: React.ReactNode;
  score: number;
  stats: Array<{ label: string; value: string | number }>;
}

interface CategoryBreakdownProps {
  signals: TrustSignal[];
  assetStats: { total: number; verified: number; changed: number } | null;
}

function computeAvgScore(signals: TrustSignal[]): number {
  if (signals.length === 0) return 100;
  return Math.round(signals.reduce((sum, s) => sum + s.score, 0) / signals.length);
}

function scoreColor(score: number): string {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 70) return 'text-sky-400';
  if (score >= 50) return 'text-amber-400';
  if (score >= 30) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 90) return 'bg-emerald-500';
  if (score >= 70) return 'bg-sky-500';
  if (score >= 50) return 'bg-amber-500';
  if (score >= 30) return 'bg-orange-500';
  return 'bg-red-500';
}

const EmailIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>
);

const FileIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const MeetingIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const AssetIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

export function CategoryBreakdown({ signals, assetStats }: CategoryBreakdownProps) {
  const emailSignals = signals.filter(s => s.source === 'email');
  const fileSignals = signals.filter(s => s.source === 'file');
  const meetingSignals = signals.filter(s => s.source === 'zoom' || s.source === 'teams');

  const assets = assetStats ?? { total: 0, verified: 0, changed: 0 };
  const assetScore = assets.total > 0
    ? Math.round((assets.verified / assets.total) * 100)
    : 100;

  const categories: CategoryScore[] = [
    {
      label: 'Email Security',
      icon: <EmailIcon />,
      score: computeAvgScore(emailSignals),
      stats: [
        { label: 'Events', value: emailSignals.length },
        { label: 'External', value: emailSignals.filter(s => s.metadata?.isExternal).length },
        { label: 'Risky', value: emailSignals.filter(s => s.metadata?.hasRiskyAttachment).length },
      ],
    },
    {
      label: 'File Integrity',
      icon: <FileIcon />,
      score: computeAvgScore(fileSignals),
      stats: [
        { label: 'Events', value: fileSignals.length },
        { label: 'Modified', value: fileSignals.filter(s => s.metadata?.eventType === 'file.modified').length },
        { label: 'Verified', value: assets.verified },
      ],
    },
    {
      label: 'Meetings',
      icon: <MeetingIcon />,
      score: computeAvgScore(meetingSignals),
      stats: [
        { label: 'Events', value: meetingSignals.length },
        { label: 'Calls', value: meetingSignals.filter(s => String(s.metadata?.eventType ?? '').includes('started')).length },
        { label: 'Shares', value: meetingSignals.filter(s => String(s.metadata?.eventType ?? '').includes('screen')).length },
      ],
    },
    {
      label: 'Asset Protection',
      icon: <AssetIcon />,
      score: assetScore,
      stats: [
        { label: 'Monitored', value: assets.total },
        { label: 'Verified', value: assets.verified },
        { label: 'Changed', value: assets.changed },
      ],
    },
  ];

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
      <h3 className="mb-4 text-sm font-semibold text-slate-200">Category Breakdown</h3>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {categories.map(cat => (
          <div
            key={cat.label}
            className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-4"
          >
            <div className="mb-3 flex items-center gap-2 text-slate-400">
              {cat.icon}
              <span className="text-xs font-medium">{cat.label}</span>
            </div>

            <div className={`mb-2 text-2xl font-bold ${scoreColor(cat.score)}`}>
              {cat.score}
            </div>

            {/* Mini bar */}
            <div className="mb-3 h-1 w-full rounded-full bg-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-500 ${scoreBg(cat.score)}`}
                style={{ width: `${Math.min(100, Math.max(0, cat.score))}%` }}
              />
            </div>

            <div className="space-y-1">
              {cat.stats.map(stat => (
                <div key={stat.label} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{stat.label}</span>
                  <span className="text-slate-300">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
