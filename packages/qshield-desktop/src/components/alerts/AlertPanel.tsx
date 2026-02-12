import { useState } from 'react';
import type { Alert } from '@qshield/core';
import { SEVERITY_COLORS } from '@/lib/constants';
import { formatRelativeTime, formatAdapterName } from '@/lib/formatters';
import { AlertDetail } from '@/components/alerts/AlertDetail';

interface AlertPanelProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
  onAcknowledge: (id: string, action: string) => void;
}

/**
 * List of active alerts with severity icons, dismiss and acknowledge buttons.
 * Clicking a card expands an inline detail panel showing source-specific metadata.
 */
export function AlertPanel({ alerts, onDismiss, onAcknowledge }: AlertPanelProps) {
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-12 text-center">
        <svg className="mx-auto h-12 w-12 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="mt-3 text-sm text-slate-400">All clear — no active alerts</p>
        <p className="text-xs text-slate-600 mt-1">Alerts will appear here when policy rules are triggered</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert) => (
        <div key={alert.id}>
          <AlertCard
            alert={alert}
            isSelected={selectedAlertId === alert.id}
            onSelect={() =>
              setSelectedAlertId(selectedAlertId === alert.id ? null : alert.id)
            }
            onDismiss={onDismiss}
            onAcknowledge={onAcknowledge}
          />
          {selectedAlertId === alert.id && (
            <div className="mt-2">
              <AlertDetail
                alert={alert}
                onClose={() => setSelectedAlertId(null)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AlertCard({
  alert,
  isSelected,
  onSelect,
  onDismiss,
  onAcknowledge,
}: {
  alert: Alert;
  isSelected: boolean;
  onSelect: () => void;
  onDismiss: (id: string) => void;
  onAcknowledge: (id: string, action: string) => void;
}) {
  const [showAckInput, setShowAckInput] = useState(false);
  const [ackNote, setAckNote] = useState('');
  const colors = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.low;

  const handleAck = () => {
    onAcknowledge(alert.id, ackNote || 'Acknowledged');
    setShowAckInput(false);
    setAckNote('');
  };

  return (
    <div
      className={`rounded-xl border ${colors.border} ${colors.bg} p-4 transition-colors cursor-pointer ${isSelected ? 'ring-1 ring-sky-500/40' : 'hover:brightness-110'}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`mt-0.5 shrink-0 ${colors.text}`}>
            {alert.severity === 'critical' ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            ) : alert.severity === 'high' ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100">{alert.title}</h3>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}>
                {alert.severity}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{alert.description}</p>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
              <span className="font-medium uppercase">{formatAdapterName(alert.source)}</span>
              <span>{formatRelativeTime(alert.timestamp)}</span>
              {alert.actionTaken && <span className="text-sky-400">Action: {alert.actionTaken}</span>}
              {alert.sourceMetadata && (
                <span className="text-sky-500/70">
                  {isSelected ? 'Click to collapse' : 'Click for details'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowAckInput(!showAckInput);
            }}
            className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20"
          >
            Acknowledge
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(alert.id);
            }}
            className="rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
          >
            Dismiss
          </button>
        </div>
      </div>

      {/* Acknowledge input */}
      {showAckInput && (
        <div
          className="mt-3 flex items-center gap-2 border-t border-slate-700/30 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            value={ackNote}
            onChange={(e) => setAckNote(e.target.value)}
            placeholder="Add a note (optional)..."
            className="flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleAck()}
          />
          <button
            onClick={handleAck}
            className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 transition-colors"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}
