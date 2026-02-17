import { Fragment, useState, useMemo } from 'react';
import type { Alert } from '@qshield/core';
import { SEVERITY_COLORS } from '@/lib/constants';
import { formatDate, formatAdapterName } from '@/lib/formatters';
import { describeAlert } from '@/lib/alert-descriptions';
import { AlertDetail } from '@/components/alerts/AlertDetail';

interface AlertHistoryProps {
  alerts: Alert[];
}

const SEVERITY_OPTIONS = ['all', 'critical', 'high', 'medium', 'low'] as const;

export function AlertHistory({ alerts }: AlertHistoryProps) {
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  const filteredAlerts = useMemo(() => {
    let filtered = alerts.slice().sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    if (severityFilter !== 'all') {
      filtered = filtered.filter((a) => a.severity === severityFilter);
    }

    if (dateFilter) {
      const from = new Date(dateFilter).getTime();
      filtered = filtered.filter((a) => new Date(a.timestamp).getTime() >= from);
    }

    return filtered;
  }, [alerts, severityFilter, dateFilter]);

  const handleRowClick = (alertId: string) => {
    setSelectedAlertId(selectedAlertId === alertId ? null : alertId);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Severity:</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 focus:border-sky-500 focus:outline-none"
          >
            {SEVERITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === 'all' ? 'All' : option.charAt(0).toUpperCase() + option.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500">From:</span>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300 focus:border-sky-500 focus:outline-none"
          />
        </div>

        {(severityFilter !== 'all' || dateFilter) && (
          <button
            onClick={() => {
              setSeverityFilter('all');
              setDateFilter('');
            }}
            className="text-xs text-sky-500 hover:text-sky-400"
          >
            Clear
          </button>
        )}
      </div>

      {/* Count */}
      <span className="text-xs text-slate-500">
        {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? 's' : ''}
      </span>

      {/* List */}
      {filteredAlerts.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center text-sm text-slate-500">
          No alerts match the current filters
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-700">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/80">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Severity
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filteredAlerts.map((alert) => {
                const colors = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.low;
                const isSelected = selectedAlertId === alert.id;
                const described = describeAlert(alert);
                return (
                  <Fragment key={alert.id}>
                    <tr
                      className={`bg-slate-900 cursor-pointer transition-colors ${isSelected ? 'bg-slate-800/70' : 'hover:bg-slate-800/50'}`}
                      onClick={() => handleRowClick(alert.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleRowClick(alert.id);
                        }
                      }}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}
                        >
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-slate-200">{described.title}</span>
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xs">
                          {described.description}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs uppercase">
                        {formatAdapterName(alert.source)}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {formatDate(alert.timestamp)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            alert.dismissed
                              ? 'bg-slate-800 text-slate-500'
                              : 'bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {alert.dismissed ? 'Dismissed' : 'Active'}
                        </span>
                      </td>
                    </tr>
                    {isSelected && (
                      <tr key={`${alert.id}-detail`}>
                        <td colSpan={5} className="p-0">
                          <div className="px-4 py-3 bg-slate-900/60">
                            <AlertDetail
                              alert={alert}
                              onClose={() => setSelectedAlertId(null)}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
