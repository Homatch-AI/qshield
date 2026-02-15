import { useCallback } from 'react';
import type { TrustCertificate } from '@qshield/core';
import { useIPC } from '@/hooks/useIPC';
import { SkeletonCard } from '@/components/shared/SkeletonLoader';
import { formatDate, truncateHash } from '@/lib/formatters';
import { TRUST_LEVEL_COLORS } from '@/lib/constants';
import { isIPCAvailable, mockCertificates } from '@/lib/mock-data';

interface CertificateListProps {
  onGenerateClick: () => void;
}

/**
 * Table of generated certificates with trust level badge, session ID,
 * timestamp, evidence count, and Export PDF button per row.
 */
export function CertificateList({ onGenerateClick }: CertificateListProps) {
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
          {certs.length} certificate{certs.length !== 1 ? 's' : ''} generated
        </span>
        <button
          onClick={onGenerateClick}
          className="flex items-center gap-2 rounded-lg bg-sky-500/10 border border-sky-500/30 px-4 py-2 text-sm font-medium text-sky-400 transition-colors hover:bg-sky-500/20"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Generate Certificate
        </button>
      </div>

      {/* List */}
      {certs.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          <p className="mt-3 text-sm text-slate-400">No certificates generated yet</p>
          <p className="text-xs text-slate-600 mt-1">Generate a trust certificate to create a verifiable record</p>
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
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200">
                        Session {truncateHash(cert.sessionId, 6)}
                      </span>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${colors.bg} ${colors.text}`}>
                        {cert.trustLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span>Score: <strong className={colors.text}>{cert.trustScore}</strong></span>
                      <span>Evidence: {cert.evidenceCount}</span>
                      <span>{formatDate(cert.generatedAt)}</span>
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
                    className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-100"
                  >
                    Export PDF
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
