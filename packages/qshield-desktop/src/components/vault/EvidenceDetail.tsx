import { useState } from 'react';
import type { EvidenceRecord } from '@qshield/core';
import { formatDate, formatAdapterName, truncateHash } from '@/lib/formatters';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface EvidenceDetailProps {
  record: EvidenceRecord | null;
  loading: boolean;
  onVerify: (id: string) => Promise<{ valid: boolean; message: string }>;
  onClose: () => void;
}

/**
 * Detail panel showing full evidence record with hash chain visualization,
 * all metadata fields, verify button, and export button.
 */
export function EvidenceDetail({ record, loading, onVerify, onClose }: EvidenceDetailProps) {
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ valid: boolean; message: string } | null>(null);

  if (!record && !loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
        <svg className="h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p className="mt-3 text-sm text-slate-400">Select a record to view details</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-700 bg-slate-900">
        <LoadingSpinner />
      </div>
    );
  }

  if (!record) return null;

  const handleVerify = async () => {
    setVerifying(true);
    setVerifyResult(null);
    const result = await onVerify(record.id);
    setVerifyResult(result);
    setVerifying(false);
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-100">Evidence Detail</h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
          aria-label="Close detail panel"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-300px)]">
        <DetailField label="Record ID" value={record.id} mono />
        <DetailField label="Hash (HMAC-SHA256)" value={record.hash} mono />

        {/* Hash Chain Visualization */}
        <div>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Hash Chain
          </span>
          <div className="mt-1.5 flex items-center gap-2 overflow-x-auto">
            {record.previousHash ? (
              <>
                <div className="shrink-0 rounded-md border border-slate-700 bg-slate-800/50 px-2.5 py-1.5">
                  <span className="text-[9px] text-slate-500 block">Previous</span>
                  <span className="font-mono text-[11px] text-slate-400">{truncateHash(record.previousHash, 10)}</span>
                </div>
                <svg className="h-4 w-6 shrink-0 text-slate-600" viewBox="0 0 24 16" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 8h16m0 0l-4-4m4 4l-4 4" />
                </svg>
                <div className="shrink-0 rounded-md border border-sky-500/30 bg-sky-500/5 px-2.5 py-1.5">
                  <span className="text-[9px] text-sky-400 block">Current</span>
                  <span className="font-mono text-[11px] text-sky-300">{truncateHash(record.hash, 10)}</span>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5">
                <span className="text-[9px] text-emerald-400 block">Genesis</span>
                <span className="font-mono text-[11px] text-emerald-300">{truncateHash(record.hash, 10)}</span>
              </div>
            )}
          </div>
        </div>

        <DetailField label="Source" value={formatAdapterName(record.source)} />
        <DetailField label="Event Type" value={record.eventType} />
        <DetailField label="Timestamp" value={formatDate(record.timestamp)} />

        {/* Verified Status */}
        <div>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Verified</span>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                record.verified
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {record.verified ? 'Verified' : 'Unverified'}
            </span>
          </div>
        </div>

        {record.signature && <DetailField label="Signature" value={record.signature} mono />}

        {/* Payload */}
        <div>
          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Payload</span>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-slate-800/70 border border-slate-700/50 p-3 text-xs text-slate-300 font-mono leading-relaxed">
            {JSON.stringify(record.payload, null, 2)}
          </pre>
        </div>

        {/* Actions */}
        <div className="pt-2 border-t border-slate-700/50 space-y-2">
          <button
            onClick={handleVerify}
            disabled={verifying || record.verified}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500/10 border border-sky-500/30 px-4 py-2.5 text-sm font-medium text-sky-400 transition-colors hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {verifying ? (
              <><LoadingSpinner size="sm" /> Verifying...</>
            ) : record.verified ? (
              <>
                <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Already Verified
              </>
            ) : (
              <>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                Verify Record
              </>
            )}
          </button>

          {verifyResult && (
            <div
              className={`rounded-lg p-3 text-xs ${
                verifyResult.valid
                  ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                  : 'bg-red-500/10 border border-red-500/20 text-red-400'
              }`}
            >
              {verifyResult.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <p className={`mt-0.5 text-sm text-slate-300 break-all ${mono ? 'font-mono text-xs leading-relaxed' : ''}`}>
        {value}
      </p>
    </div>
  );
}
