import { useTrustState } from '@/hooks/useTrustState';
import { TrustScoreGauge } from '@/components/dashboard/TrustScoreGauge';
import { ActiveMonitors } from '@/components/dashboard/ActiveMonitors';
import { RecentEvents } from '@/components/dashboard/RecentEvents';
import { SkeletonDashboard } from '@/components/shared/SkeletonLoader';
import { formatRelativeTime } from '@/lib/formatters';

/** Format uptime seconds into human-readable duration */
function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/**
 * Main dashboard page combining trust gauge, stats, monitors, and events.
 */
export default function Dashboard() {
  const { score, level, lastUpdated, loading, sessionId, uptime, connected } = useTrustState();

  if (loading) return <SkeletonDashboard />;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time trust monitoring and system overview
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {connected ? 'Connected' : 'Disconnected'}
          </div>
          {sessionId && (
            <span>
              Session: <span className="font-mono text-slate-400">{sessionId.slice(0, 8)}</span>
            </span>
          )}
          {uptime > 0 && <span>Uptime: {formatUptime(uptime)}</span>}
          {lastUpdated && <span>Updated {formatRelativeTime(lastUpdated)}</span>}
        </div>
      </div>

      {/* Trust Score Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-900 p-6 lg:col-span-1">
          <TrustScoreGauge score={score} level={level} />
        </div>

        {/* Stats Cards */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-3">
          <StatCard
            label="Trust Score"
            value={Math.round(score).toString()}
            sublabel="Current"
            color={
              level === 'verified' ? 'emerald'
              : level === 'normal' ? 'sky'
              : level === 'elevated' ? 'amber'
              : level === 'warning' ? 'orange'
              : 'red'
            }
          />
          <StatCard
            label="Trust Level"
            value={level.charAt(0).toUpperCase() + level.slice(1)}
            sublabel="Classification"
            color="slate"
          />
          <StatCard
            label="Session ID"
            value={sessionId?.slice(0, 8) ?? '--'}
            sublabel="Active session"
            color="slate"
            mono
          />
          <StatCard
            label="Last Update"
            value={lastUpdated ? formatRelativeTime(lastUpdated) : '--'}
            sublabel="Trust state"
            color="slate"
          />
        </div>
      </div>

      {/* Active Monitors */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Active Monitors</h2>
        </div>
        <ActiveMonitors />
      </section>

      {/* Recent Events */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-100">Recent Events</h2>
          <span className="text-xs text-slate-500">Last 10 signals</span>
        </div>
        <RecentEvents />
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
  color,
  mono = false,
}: {
  label: string;
  value: string;
  sublabel: string;
  color: string;
  mono?: boolean;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-500',
    sky: 'text-sky-500',
    amber: 'text-amber-500',
    orange: 'text-orange-500',
    red: 'text-red-500',
    slate: 'text-slate-100',
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <p
        className={`mt-1 text-xl font-bold ${colorMap[color] ?? 'text-slate-100'} ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </p>
      <span className="text-xs text-slate-600">{sublabel}</span>
    </div>
  );
}
