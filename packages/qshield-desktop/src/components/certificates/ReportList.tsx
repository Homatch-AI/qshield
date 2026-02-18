import { useCallback } from 'react';
import { useIPC } from '@/hooks/useIPC';
import { SkeletonCard } from '@/components/shared/SkeletonLoader';
import { TRUST_LEVEL_COLORS } from '@/lib/constants';
import { isIPCAvailable, mockReports } from '@/lib/mock-data';
import type { TrustLevel } from '@qshield/core';

interface ReportListProps {
  onGenerateClick: () => void;
}

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-400', A: 'text-emerald-400', 'A-': 'text-emerald-400',
  'B+': 'text-sky-400', B: 'text-sky-400', 'B-': 'text-sky-400',
  'C+': 'text-amber-400', C: 'text-amber-400',
  D: 'text-orange-400', F: 'text-red-400',
};

function TypeIcon({ type }: { type: string }) {
  if (type === 'snapshot') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
      </svg>
    );
  }
  if (type === 'period') {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    );
  }
  // asset
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function ReportList({ onGenerateClick }: ReportListProps) {
  const fetchReports = useCallback(async () => {
    if (isIPCAvailable()) return window.qshield.reports.list();
    return mockReports(5);
  }, []);
  const { data: reports, loading } = useIPC(fetchReports);

  const handleExportPdf = async (id: string) => {
    if (isIPCAvailable()) {
      await window.qshield.reports.exportPdf(id);
    }
  };

  const handleReviewPdf = async (id: string) => {
    if (isIPCAvailable()) {
      await window.qshield.reports.reviewPdf(id);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const items = reports ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">
          {items.length} report{items.length !== 1 ? 's' : ''} generated
        </span>
        <button
          onClick={onGenerateClick}
          className="flex items-center gap-2 rounded-lg bg-sky-500/10 border border-sky-500/30 px-4 py-2 text-sm font-medium text-sky-400 transition-colors hover:bg-sky-500/20"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Report
        </button>
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <p className="mt-3 text-sm text-slate-400">No reports generated yet</p>
          <p className="text-xs text-slate-600 mt-1">Generate a trust report for audits, compliance, or stakeholders</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((report) => {
            const colors = TRUST_LEVEL_COLORS[report.trustLevel as TrustLevel] ?? TRUST_LEVEL_COLORS.normal;
            const gradeColor = GRADE_COLORS[report.trustGrade] ?? 'text-slate-400';
            const typeLabel = report.type === 'snapshot' ? 'Snapshot' : report.type === 'period' ? 'Period' : 'Asset';

            return (
              <div
                key={report.id}
                className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-4 transition-colors hover:bg-slate-800/50"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Type Icon */}
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${colors.bg} ${colors.text}`}>
                    <TypeIcon type={report.type} />
                  </div>

                  <div className="min-w-0">
                    {/* Title + badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-200 truncate">
                        {report.title}
                      </span>
                      {/* Score + Grade badge */}
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors.bg}`}>
                        <span className={colors.text}>{Math.round(report.trustScore)}</span>
                        <span className={gradeColor}>{report.trustGrade}</span>
                      </span>
                      {/* Type chip */}
                      <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                        {typeLabel}
                      </span>
                    </div>

                    {/* Key stats */}
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>{report.channelsMonitored} channels</span>
                      <span>{report.totalEvents} events</span>
                      {report.anomaliesDetected > 0 ? (
                        <span className="text-amber-500">{report.anomaliesDetected} anomalies</span>
                      ) : (
                        <span className="text-emerald-500">No anomalies</span>
                      )}
                      <span className="hidden sm:inline">{formatShortDate(report.generatedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <button
                    onClick={() => handleReviewPdf(report.id)}
                    className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Review
                  </button>
                  <button
                    onClick={() => handleExportPdf(report.id)}
                    className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                    </svg>
                    Download PDF
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
