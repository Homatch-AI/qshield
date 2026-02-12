import { useState } from 'react';
import { useAlerts } from '@/hooks/useAlerts';
import { AlertPanel } from '@/components/alerts/AlertPanel';
import { AlertHistory } from '@/components/alerts/AlertHistory';
import { SkeletonTable } from '@/components/shared/SkeletonLoader';

/**
 * Alert management page with Active/History tabs and count badges.
 */
export default function AlertsPage() {
  const { alerts, activeAlerts, loading, dismiss, acknowledge } = useAlerts();
  const [tab, setTab] = useState<'active' | 'history'>('active');

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Alerts</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor and manage trust policy alerts
          </p>
        </div>
        {activeAlerts.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500/20 px-2 text-xs font-bold text-red-400">
              {activeAlerts.length}
            </span>
            <span className="text-sm text-slate-400">active</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-700">
        <button
          onClick={() => setTab('active')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'active' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Active
          {activeAlerts.length > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/20 px-1 text-[10px] font-bold text-red-400">
              {activeAlerts.length}
            </span>
          )}
          {tab === 'active' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setTab('history')}
          className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
            tab === 'history' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          History
          <span className="ml-2 text-xs text-slate-600">{alerts.length}</span>
          {tab === 'history' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <SkeletonTable rows={5} cols={4} />
      ) : tab === 'active' ? (
        <AlertPanel alerts={activeAlerts} onDismiss={dismiss} onAcknowledge={acknowledge} />
      ) : (
        <AlertHistory alerts={alerts} />
      )}
    </div>
  );
}
