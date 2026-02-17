import { useState, useMemo } from 'react';
import type { Alert } from '@qshield/core';
import { useNavigate } from 'react-router-dom';
import { SEVERITY_COLORS } from '@/lib/constants';
import { formatRelativeTime, formatAdapterName } from '@/lib/formatters';
import { groupAlerts, isGroupedAlert } from '@/lib/alert-grouping';
import type { GroupedAlert } from '@/lib/alert-grouping';
import { describeAlert } from '@/lib/alert-descriptions';
import { AlertDetail } from '@/components/alerts/AlertDetail';

interface AlertPanelProps {
  alerts: Alert[];
  onDismiss: (id: string) => void;
  onAcknowledge: (id: string, action: string) => void;
}

/**
 * List of active alerts with smart grouping, plain-English descriptions,
 * and contextual action buttons. Clicking a card expands inline details.
 */
export function AlertPanel({ alerts, onDismiss, onAcknowledge }: AlertPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const navigate = useNavigate();

  const grouped = useMemo(() => groupAlerts(alerts), [alerts]);

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

  const handleDismissGroup = (group: GroupedAlert) => {
    for (const a of group.alerts) {
      onDismiss(a.id);
    }
  };

  return (
    <div className="space-y-3">
      {grouped.map((item) => {
        if (isGroupedAlert(item)) {
          return (
            <GroupedAlertCard
              key={item.id}
              group={item}
              isExpanded={expandedGroupId === item.id}
              onToggleExpand={() =>
                setExpandedGroupId(expandedGroupId === item.id ? null : item.id)
              }
              onDismissAll={() => handleDismissGroup(item)}
              selectedAlertId={selectedId}
              onSelectAlert={(id) => setSelectedId(selectedId === id ? null : id)}
              onDismiss={onDismiss}
              onAcknowledge={onAcknowledge}
              onNavigate={(path) => navigate(path)}
            />
          );
        }

        return (
          <div key={item.id}>
            <SingleAlertCard
              alert={item}
              isSelected={selectedId === item.id}
              onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
              onDismiss={onDismiss}
              onAcknowledge={onAcknowledge}
              onNavigate={(path) => navigate(path)}
            />
            {selectedId === item.id && (
              <div className="mt-2">
                <AlertDetail
                  alert={item}
                  onClose={() => setSelectedId(null)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Grouped Alert Card                                                 */
/* ------------------------------------------------------------------ */

function GroupedAlertCard({
  group,
  isExpanded,
  onToggleExpand,
  onDismissAll,
  selectedAlertId,
  onSelectAlert,
  onDismiss,
  onAcknowledge,
  onNavigate,
}: {
  group: GroupedAlert;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDismissAll: () => void;
  selectedAlertId: string | null;
  onSelectAlert: (id: string) => void;
  onDismiss: (id: string) => void;
  onAcknowledge: (id: string, action: string) => void;
  onNavigate: (path: string) => void;
}) {
  const colors = SEVERITY_COLORS[group.severity] ?? SEVERITY_COLORS.low;

  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} overflow-hidden`}>
      {/* Group header */}
      <div
        className="flex items-start justify-between gap-3 p-4 cursor-pointer hover:brightness-110 transition-colors"
        onClick={onToggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className={`mt-0.5 shrink-0 ${colors.text}`}>
            <SeverityIcon severity={group.severity} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-700/60 px-1.5 text-[10px] font-bold text-slate-200">
                {group.count}
              </span>
              <h3 className="text-sm font-semibold text-slate-100">{group.summary}</h3>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}>
                {group.severity}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-500">
              <span className="font-medium uppercase">{formatAdapterName(group.source)}</span>
              <span>{formatRelativeTime(group.latestTimestamp)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onToggleExpand}
            className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20"
          >
            {isExpanded ? 'Collapse' : 'View Details'}
          </button>
          <button
            onClick={onDismissAll}
            className="rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
          >
            Dismiss All
          </button>
        </div>
      </div>

      {/* Expanded: show individual alerts */}
      {isExpanded && (
        <div className="border-t border-slate-700/30 bg-slate-900/30 p-3 space-y-2">
          {group.alerts.map((alert) => (
            <div key={alert.id}>
              <SingleAlertCard
                alert={alert}
                isSelected={selectedAlertId === alert.id}
                onSelect={() => onSelectAlert(alert.id)}
                onDismiss={onDismiss}
                onAcknowledge={onAcknowledge}
                onNavigate={onNavigate}
                compact
              />
              {selectedAlertId === alert.id && (
                <div className="mt-2">
                  <AlertDetail
                    alert={alert}
                    onClose={() => onSelectAlert(alert.id)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Single Alert Card                                                  */
/* ------------------------------------------------------------------ */

function SingleAlertCard({
  alert,
  isSelected,
  onSelect,
  onDismiss,
  onAcknowledge,
  onNavigate,
  compact = false,
}: {
  alert: Alert;
  isSelected: boolean;
  onSelect: () => void;
  onDismiss: (id: string) => void;
  onAcknowledge: (id: string, action: string) => void;
  onNavigate: (path: string) => void;
  compact?: boolean;
}) {
  const [showAckInput, setShowAckInput] = useState(false);
  const [ackNote, setAckNote] = useState('');
  const colors = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.low;
  const described = describeAlert(alert);

  const handleAck = () => {
    onAcknowledge(alert.id, ackNote || 'Acknowledged');
    setShowAckInput(false);
    setAckNote('');
  };

  const handleAction = (action: typeof described.actions[number], e: React.MouseEvent) => {
    e.stopPropagation();
    if (action.actionType === 'dismiss') {
      onDismiss(alert.id);
    } else if (action.actionType === 'accept_changes') {
      onAcknowledge(alert.id, 'Changes accepted');
    } else if (action.navigateTo) {
      onNavigate(action.navigateTo);
    }
  };

  return (
    <div
      className={`rounded-xl border ${colors.border} ${colors.bg} ${compact ? 'p-3' : 'p-4'} transition-colors cursor-pointer ${isSelected ? 'ring-1 ring-sky-500/40' : 'hover:brightness-110'}`}
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
            <SeverityIcon severity={alert.severity} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-slate-100`}>{described.title}</h3>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}>
                {alert.severity}
              </span>
            </div>
            <p className={`mt-1 ${compact ? 'text-[11px]' : 'text-xs'} text-slate-400`}>{described.description}</p>
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

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {described.actions.map((action) => (
            <button
              key={action.label}
              onClick={(e) => handleAction(action, e)}
              className={
                action.variant === 'primary'
                  ? 'rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20'
                  : 'rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200'
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Acknowledge input (via right-click or long-press — keeping as hidden power feature) */}
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

/* ------------------------------------------------------------------ */
/*  Severity icon helper                                               */
/* ------------------------------------------------------------------ */

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'critical') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    );
  }
  if (severity === 'high') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  );
}
