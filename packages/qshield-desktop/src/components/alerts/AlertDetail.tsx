import type { Alert, AlertSourceMetadata } from '@qshield/core';
import { SEVERITY_COLORS } from '@/lib/constants';
import { formatDate, formatRelativeTime, formatFileSize, formatAdapterName, truncateHash } from '@/lib/formatters';

interface AlertDetailProps {
  alert: Alert;
  onClose: () => void;
  onViewEvidence?: () => void;
}

/**
 * Expandable detail panel showing source-specific alert information.
 * Renders different metadata sections based on the alert source type.
 */
export function AlertDetail({ alert, onClose, onViewEvidence }: AlertDetailProps) {
  const colors = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.low;
  const meta = alert.sourceMetadata;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-700 bg-slate-900/80 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colors.bg} ${colors.text} border ${colors.border}`}
            >
              {alert.severity}
            </span>
            <span className="text-xs font-medium text-slate-500 uppercase">
              {formatAdapterName(alert.source)}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-slate-100">{alert.title}</h3>
          <p className="mt-1 text-xs text-slate-400">{alert.description}</p>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
            <span>{formatDate(alert.timestamp)}</span>
            <span className="text-slate-600">({formatRelativeTime(alert.timestamp)})</span>
            {alert.actionTaken && <span className="text-sky-400">Action: {alert.actionTaken}</span>}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          aria-label="Close alert detail"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Source Details */}
      {meta && (
        <div className="px-5 py-4 space-y-4">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Source Details
          </h4>
          <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-4">
            {alert.source === 'email' && <EmailDetails meta={meta} />}
            {alert.source === 'file' && <FileDetails meta={meta} />}
            {alert.source === 'zoom' && <MeetingDetails meta={meta} platform="Zoom" />}
            {alert.source === 'teams' && <MeetingDetails meta={meta} platform="Teams" />}
            {alert.source === 'api' && <ApiDetails meta={meta} />}
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-700 px-5 py-3">
        {onViewEvidence && (
          <button
            onClick={onViewEvidence}
            className="rounded-md border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs font-medium text-sky-400 transition-colors hover:bg-sky-500/20"
          >
            View Evidence
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded-md border border-slate-600/50 bg-slate-800/50 px-4 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Source-specific sub-components                                     */
/* ------------------------------------------------------------------ */

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="shrink-0 w-28 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
        {label}
      </span>
      <span className="text-xs text-slate-200 break-all">{value}</span>
    </div>
  );
}

function EmailDetails({ meta }: { meta: AlertSourceMetadata }) {
  return (
    <div className="divide-y divide-slate-700/30">
      {meta.sender && <DetailRow label="Sender" value={meta.sender} />}
      {meta.recipient && <DetailRow label="Recipient" value={meta.recipient} />}
      {meta.subject && <DetailRow label="Subject" value={meta.subject} />}
      {meta.headers && Object.keys(meta.headers).length > 0 && (
        <div className="pt-2 mt-2">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Headers
          </span>
          <div className="mt-1.5 rounded-md bg-slate-900/60 p-3 space-y-1">
            {Object.entries(meta.headers).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-slate-500">{key}:</span>
                <span className={`font-mono ${value === 'fail' || value === 'none' || value === 'invalid' ? 'text-red-400' : 'text-slate-300'}`}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FileDetails({ meta }: { meta: AlertSourceMetadata }) {
  return (
    <div className="divide-y divide-slate-700/30">
      {meta.fileName && <DetailRow label="File Name" value={meta.fileName} />}
      {meta.filePath && <DetailRow label="Path" value={<span className="font-mono">{meta.filePath}</span>} />}
      {meta.fileSize != null && <DetailRow label="Size" value={formatFileSize(meta.fileSize)} />}
      {meta.fileHash && (
        <DetailRow
          label="Hash"
          value={<span className="font-mono text-[11px]">{truncateHash(meta.fileHash, 12)}</span>}
        />
      )}
      {meta.operation && (
        <DetailRow
          label="Operation"
          value={
            <span className="inline-flex items-center rounded-full bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 text-[10px] font-medium text-orange-400">
              {meta.operation}
            </span>
          }
        />
      )}
    </div>
  );
}

function MeetingDetails({ meta, platform }: { meta: AlertSourceMetadata; platform: string }) {
  return (
    <div className="divide-y divide-slate-700/30">
      {meta.meetingId && <DetailRow label={`${platform} ID`} value={<span className="font-mono">{meta.meetingId}</span>} />}
      {meta.meetingTitle && <DetailRow label="Title" value={meta.meetingTitle} />}
      {meta.participants && meta.participants.length > 0 && (
        <div className="py-1.5">
          <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Participants ({meta.participants.length})
          </span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {meta.participants.map((p) => {
              const isExternal = !p.endsWith('@company.com');
              return (
                <span
                  key={p}
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    isExternal
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-slate-700/50 text-slate-300 border border-slate-600/30'
                  }`}
                >
                  {p}
                </span>
              );
            })}
          </div>
        </div>
      )}
      {meta.triggerReason && (
        <DetailRow
          label="Trigger"
          value={
            <span className="text-amber-400">{meta.triggerReason}</span>
          }
        />
      )}
    </div>
  );
}

function ApiDetails({ meta }: { meta: AlertSourceMetadata }) {
  const statusColor =
    meta.statusCode && meta.statusCode >= 400
      ? 'text-red-400'
      : meta.statusCode && meta.statusCode >= 300
        ? 'text-amber-400'
        : 'text-emerald-400';

  return (
    <div className="divide-y divide-slate-700/30">
      {meta.endpoint && (
        <DetailRow
          label="Endpoint"
          value={<span className="font-mono">{meta.endpoint}</span>}
        />
      )}
      {meta.method && (
        <DetailRow
          label="Method"
          value={
            <span className="inline-flex items-center rounded-full bg-slate-700/50 border border-slate-600/30 px-2 py-0.5 text-[10px] font-bold font-mono text-slate-300">
              {meta.method}
            </span>
          }
        />
      )}
      {meta.statusCode != null && (
        <DetailRow
          label="Status"
          value={<span className={`font-mono font-bold ${statusColor}`}>{meta.statusCode}</span>}
        />
      )}
      {meta.requestIp && (
        <DetailRow
          label="Request IP"
          value={<span className="font-mono">{meta.requestIp}</span>}
        />
      )}
      {meta.policyViolated && (
        <DetailRow
          label="Policy"
          value={
            <span className="inline-flex items-center rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-400">
              {meta.policyViolated}
            </span>
          }
        />
      )}
    </div>
  );
}
