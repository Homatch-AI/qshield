import { useCallback } from 'react';
import type { TrustCertificate } from '@qshield/core';
import { useIPC } from '@/hooks/useIPC';
import { SkeletonCard } from '@/components/shared/SkeletonLoader';
import { formatDate } from '@/lib/formatters';
import { TRUST_LEVEL_COLORS } from '@/lib/constants';
import { isIPCAvailable, mockCertificates } from '@/lib/mock-data';

interface ReportListProps {
  onGenerateClick: () => void;
}

export function ReportList({ onGenerateClick }: ReportListProps) {
  const fetchCertificates = useCallback(async () => {
    if (isIPCAvailable()) return window.qshield.certificates.list();
    return mockCertificates(5);
  }, []);
  const { data: certificates, loading } = useIPC(fetchCertificates);

  const handleExportPdf = async (id: string) => {
    if (isIPCAvailable()) {
      await window.qshield.certificates.exportPdf(id);
    }
  };

  const handleReviewPdf = async (id: string) => {
    if (isIPCAvailable()) {
      await window.qshield.certificates.reviewPdf(id);
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

  const certs = certificates ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-400">
          {certs.length} report{certs.length !== 1 ? 's' : ''} generated
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
      {certs.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <p className="mt-3 text-sm text-slate-400">No reports generated yet</p>
          <p className="text-xs text-slate-600 mt-1">Generate a trust report for audits, compliance, or stakeholders</p>
        </div>
      ) : (
        <div className="space-y-3">
          {certs.map((cert: TrustCertificate) => {
            const colors = TRUST_LEVEL_COLORS[cert.trustLevel];
            return (
              <div
                key={cert.id}
                className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900 p-4 transition-colors hover:bg-slate-800/50"
              >
                <div className="flex items-center gap-4">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${colors.bg}`}>
                    <svg className={`h-6 w-6 ${colors.text}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">
                        Trust Report &mdash; {formatDate(cert.generatedAt)}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${colors.bg} ${colors.text}`}>
                        {cert.trustLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>Score: <strong className={colors.text}>{cert.trustScore}</strong></span>
                      <span>{cert.evidenceCount} events</span>
                      <span>Chain verified</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReviewPdf(cert.id)}
                    className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Review
                  </button>
                  <button
                    onClick={() => handleExportPdf(cert.id)}
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
