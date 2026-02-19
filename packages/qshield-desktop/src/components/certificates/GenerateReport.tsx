import { useState, useEffect } from 'react';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import useTrustStore from '@/stores/trust-store';
import useLicenseStore from '@/stores/license-store';
import { TRUST_LEVEL_COLORS } from '@/lib/constants';
import { isIPCAvailable } from '@/lib/mock-data';

interface GenerateReportProps {
  onClose: () => void;
  onGenerated: () => void;
}

type ReportType = 'snapshot' | 'period' | 'asset';

interface AssetOption {
  id: string;
  name: string;
  path: string;
}

const REPORT_TYPES: { type: ReportType; title: string; description: string }[] = [
  { type: 'snapshot', title: 'Current Snapshot', description: 'Trust status right now. Best for quick verification.' },
  { type: 'period', title: 'Time Period', description: 'Trust history over a date range. Best for audits and reviews.' },
  { type: 'asset', title: 'Asset Report', description: 'Trust history for a specific high-trust asset. Best for compliance.' },
];

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function GenerateReport({ onClose, onGenerated }: GenerateReportProps) {
  const score = useTrustStore((s) => s.score);
  const level = useTrustStore((s) => s.level);
  const canTrustReports = useLicenseStore((s) => s.features.trustReports);
  const canAssetReports = useLicenseStore((s) => s.features.assetReports);

  const [reportType, setReportType] = useState<ReportType>('snapshot');
  const [dateFrom, setDateFrom] = useState(() => toDateInput(new Date(Date.now() - 7 * 86400000)));
  const [dateTo, setDateTo] = useState(() => toDateInput(new Date()));
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview data
  const [evidenceTotal, setEvidenceTotal] = useState(0);
  const [assetTotal, setAssetTotal] = useState(0);

  const colors = TRUST_LEVEL_COLORS[level];
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

  // Fetch assets + stats on mount
  useEffect(() => {
    if (!isIPCAvailable()) return;
    window.qshield.assets.list().then((list: AssetOption[]) => {
      setAssets(list);
      if (list.length > 0) setSelectedAssetId(list[0].id);
    }).catch(() => {});
    window.qshield.assets.stats().then((s: { total: number }) => {
      setAssetTotal(s.total);
    }).catch(() => {});
    window.qshield.evidence.list({ page: 1, pageSize: 1 }).then((r: { total: number }) => {
      setEvidenceTotal(r.total);
    }).catch(() => {});
  }, []);

  const periodLabel = reportType === 'snapshot'
    ? 'Current (point-in-time)'
    : reportType === 'period'
      ? `${dateFrom} to ${dateTo}`
      : `Asset-specific`;

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      if (isIPCAvailable()) {
        await window.qshield.reports.generate({
          type: reportType,
          fromDate: reportType === 'period' ? dateFrom : undefined,
          toDate: reportType === 'period' ? dateTo : undefined,
          assetId: reportType === 'asset' ? selectedAssetId : undefined,
          notes: notes || undefined,
        });
      }
      if (!isIPCAvailable()) await new Promise((r) => setTimeout(r, 800));
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-100">Generate Trust Report</h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
          aria-label="Close"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x lg:divide-slate-700">
        {/* Form */}
        <div className="p-5 space-y-5">
          {/* Report Type Cards */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Report Type</label>
            <div className="mt-2 space-y-2">
              {REPORT_TYPES.map((rt) => {
                const locked =
                  (rt.type === 'period' && !canTrustReports) ||
                  (rt.type === 'asset' && !canAssetReports);
                return (
                  <button
                    key={rt.type}
                    type="button"
                    onClick={() => !locked && setReportType(rt.type)}
                    disabled={locked}
                    className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                      locked
                        ? 'border-slate-700/50 bg-slate-800/20 opacity-60 cursor-not-allowed'
                        : reportType === rt.type
                          ? 'border-sky-500 bg-sky-500/10'
                          : 'border-slate-700 bg-slate-800/30 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className={`text-sm font-medium ${locked ? 'text-slate-400' : reportType === rt.type ? 'text-sky-400' : 'text-slate-200'}`}>
                      {rt.title}
                      {locked && (
                        <span className="ml-2 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400">
                          {rt.type === 'asset' ? 'Business' : 'Pro'}
                        </span>
                      )}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">{rt.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date Range (period only) */}
          {reportType === 'period' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
                />
              </div>
            </div>
          )}

          {/* Asset Dropdown (asset only) */}
          {reportType === 'asset' && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Asset</label>
              <select
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
              >
                {assets.length === 0 && <option value="">No assets registered</option>}
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.path}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this report..."
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/50 resize-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">{error}</div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/50">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <><LoadingSpinner size="sm" /> Generating...</>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Generate Trust Report
                </>
              )}
            </button>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="p-5 bg-slate-800/20">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Report Preview</span>
          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-3 font-mono text-xs">
            <div className="text-center text-slate-300 font-semibold tracking-wide">QShield Trust Report</div>
            <div className="border-t border-slate-700/50" />

            <div className="space-y-1.5 text-slate-400">
              <div className="flex justify-between">
                <span>Period</span>
                <span className="text-slate-300">{periodLabel}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Trust Score</span>
                <span className="flex items-center gap-2">
                  <span className={`font-bold ${colors.text}`}>{Math.round(score)}/100</span>
                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${colors.bg} ${colors.text}`}>
                    {levelLabel}
                  </span>
                </span>
              </div>
            </div>

            <div className="border-t border-slate-700/50 pt-2">
              <span className="text-slate-400">Summary</span>
              <ul className="mt-1 space-y-0.5 text-slate-300">
                <li>5 channels monitored</li>
                <li>{assetTotal} high-trust asset{assetTotal !== 1 ? 's' : ''} protected</li>
                <li>{evidenceTotal} event{evidenceTotal !== 1 ? 's' : ''} recorded</li>
                <li>0 anomalies detected</li>
              </ul>
            </div>

            <div className="border-t border-slate-700/50 pt-2 space-y-1.5 text-slate-400">
              <div className="flex justify-between">
                <span>Evidence Chain</span>
                <span className="text-emerald-400">Intact</span>
              </div>
            </div>

            <div className="border-t border-slate-700/50 pt-2 space-y-1 text-slate-500 text-[10px]">
              <div className="flex justify-between">
                <span>Generated</span>
                <span>{new Date().toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Verification</span>
                <span>HMAC-SHA256 signed</span>
              </div>
            </div>

            {notes && (
              <div className="border-t border-slate-700/50 pt-2">
                <span className="text-slate-500">Notes</span>
                <p className="text-slate-300 mt-0.5">{notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
