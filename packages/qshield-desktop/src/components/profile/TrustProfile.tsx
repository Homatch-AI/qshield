import { useEffect, useState } from 'react';
import useTrustStore from '@/stores/trust-store';
import useProfileStore from '@/stores/profile-store';
import { TrustScoreGauge } from '@/components/dashboard/TrustScoreGauge';
import { TrustGradeDisplay } from './TrustGradeDisplay';
import { ScoreTrendChart } from './ScoreTrendChart';
import { CategoryBreakdown } from './CategoryBreakdown';
import { MilestoneList } from './MilestoneList';
import { isIPCAvailable } from '@/lib/mock-data';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-200">{value}</span>
    </div>
  );
}

function TrustProfile() {
  const score = useTrustStore((s) => s.score);
  const level = useTrustStore((s) => s.level);
  const signals = useTrustStore((s) => s.signals);

  const stats = useProfileStore((s) => s.stats);
  const history = useProfileStore((s) => s.history);
  const loading = useProfileStore((s) => s.loading);
  const fetchProfile = useProfileStore((s) => s.fetchProfile);
  const fetchHistory = useProfileStore((s) => s.fetchHistory);
  const fetchMilestones = useProfileStore((s) => s.fetchMilestones);

  useEffect(() => {
    fetchProfile();
    fetchHistory(30);
    fetchMilestones();
  }, [fetchProfile, fetchHistory, fetchMilestones]);

  // Fetch asset stats for category breakdown
  const [assetStats, setAssetStats] = useState<{ total: number; verified: number; changed: number } | null>(null);
  useEffect(() => {
    if (isIPCAvailable()) {
      window.qshield.assets.stats().then(s => {
        setAssetStats({ total: s.total, verified: s.verified, changed: s.changed });
      }).catch(() => {});
    } else {
      setAssetStats({ total: 5, verified: 3, changed: 1 });
    }
  }, []);

  const grade = stats?.currentGrade ?? 'B';
  const trend = stats?.trend ?? 'stable';
  const milestones = stats?.milestones ?? [];

  if (loading && !stats) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  const startDate = stats
    ? formatDate(new Date(Date.now() - (stats.totalDays - 1) * 86_400_000).toISOString())
    : 'N/A';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Your Trust Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          Your data security reputation over time
        </p>
      </div>

      {/* Top row: Score Gauge + Stats Panel */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Score Gauge */}
        <div className="flex items-center justify-center rounded-xl border border-slate-700 bg-slate-900 p-6">
          <TrustScoreGauge score={score} level={level} size={180} />
        </div>

        {/* Stats Panel */}
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-6">
          <TrustGradeDisplay grade={grade} trend={trend} />

          <div className="mt-4 divide-y divide-slate-800">
            <StatItem label="Current streak" value={`${stats?.currentStreak ?? 0} days above 80`} />
            <StatItem label="Longest streak" value={`${stats?.longestStreak ?? 0} days`} />
            <StatItem label="Monitoring since" value={startDate} />
            <StatItem label="Total events" value={(stats?.totalEvents ?? 0).toLocaleString()} />
            <StatItem
              label="Anomalies resolved"
              value={`${stats?.totalAnomalies ?? 0}/${stats?.totalAnomalies ?? 0}`}
            />
            <StatItem label="Total snapshots" value={(stats?.totalSnapshots ?? 0).toLocaleString()} />
          </div>
        </div>
      </div>

      {/* Score Trend Chart */}
      <ScoreTrendChart
        history={history}
        onRangeChange={(days) => fetchHistory(days)}
      />

      {/* Category Breakdown */}
      <CategoryBreakdown signals={signals} assetStats={assetStats} />

      {/* Milestones */}
      <MilestoneList earned={milestones} />
    </div>
  );
}

export default TrustProfile;
