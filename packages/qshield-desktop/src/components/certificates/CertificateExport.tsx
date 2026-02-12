import { useState } from 'react';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import useTrustStore from '@/stores/trust-store';
import { TRUST_LEVEL_COLORS } from '@/lib/constants';
import { isIPCAvailable } from '@/lib/mock-data';

interface CertificateExportProps {
  onClose: () => void;
  onGenerated: () => void;
}

/**
 * Certificate generation form with session selector, notes field,
 * evidence scope selection, and preview panel.
 */
export function CertificateExport({ onClose, onGenerated }: CertificateExportProps) {
  const sessionId = useTrustStore((s) => s.sessionId);
  const score = useTrustStore((s) => s.score);
  const level = useTrustStore((s) => s.level);
  const [includeAllEvidence, setIncludeAllEvidence] = useState(true);
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colors = TRUST_LEVEL_COLORS[level];
  const levelLabel = level.charAt(0).toUpperCase() + level.slice(1);

  const handleGenerate = async () => {
    if (!sessionId) {
      setError('No active session. Cannot generate certificate.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      if (isIPCAvailable()) {
        // Generate the cert (creates the PDF file on disk)
        const cert = await window.qshield.certificates.generate({ sessionId, includeAllEvidence });
        // Immediately trigger the save dialog so user can save the PDF
        if (cert?.id) {
          await window.qshield.certificates.exportPdf(cert.id);
        }
      }
      // Simulate brief delay in mock mode
      if (!isIPCAvailable()) await new Promise((r) => setTimeout(r, 800));
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate certificate');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-100">Generate Trust Certificate</h3>
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
          {/* Session Info */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Session</label>
            <div className="mt-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2.5">
              {sessionId ? (
                <span className="font-mono text-sm text-slate-300">{sessionId}</span>
              ) : (
                <span className="text-sm text-slate-500 italic">No active session</span>
              )}
            </div>
          </div>

          {/* Evidence Scope */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Evidence Scope</label>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3 cursor-pointer transition-colors hover:bg-slate-800/60">
                <input
                  type="radio"
                  name="evidenceScope"
                  checked={includeAllEvidence}
                  onChange={() => setIncludeAllEvidence(true)}
                  className="h-4 w-4 border-slate-600 text-sky-500 focus:ring-sky-500/50 focus:ring-offset-slate-900"
                />
                <div>
                  <span className="text-sm font-medium text-slate-200">All Evidence</span>
                  <p className="text-xs text-slate-500 mt-0.5">Include all evidence records from the current session</p>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800/30 px-4 py-3 cursor-pointer transition-colors hover:bg-slate-800/60">
                <input
                  type="radio"
                  name="evidenceScope"
                  checked={!includeAllEvidence}
                  onChange={() => setIncludeAllEvidence(false)}
                  className="h-4 w-4 border-slate-600 text-sky-500 focus:ring-sky-500/50 focus:ring-offset-slate-900"
                />
                <div>
                  <span className="text-sm font-medium text-slate-200">Verified Only</span>
                  <p className="text-xs text-slate-500 mt-0.5">Only include cryptographically verified evidence records</p>
                </div>
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this certificate..."
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
              disabled={generating || !sessionId}
              className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? (
                <><LoadingSpinner size="sm" /> Generating...</>
              ) : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Generate PDF
                </>
              )}
            </button>
          </div>
        </div>

        {/* Preview Panel */}
        <div className="p-5 bg-slate-800/20">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Certificate Preview</span>
          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">QShield Trust Certificate</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${colors.bg} ${colors.text}`}>
                {levelLabel}
              </span>
            </div>
            <div className="border-t border-slate-700/50 pt-3 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Session</span>
                <span className="font-mono text-slate-300">{sessionId?.slice(0, 12) ?? '—'}...</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Trust Score</span>
                <span className={`font-bold ${colors.text}`}>{Math.round(score)}/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Evidence Scope</span>
                <span className="text-slate-300">{includeAllEvidence ? 'All Records' : 'Verified Only'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Generated</span>
                <span className="text-slate-300">{new Date().toLocaleDateString()}</span>
              </div>
              {notes && (
                <div className="border-t border-slate-700/50 pt-2">
                  <span className="text-slate-500">Notes</span>
                  <p className="text-slate-300 mt-0.5">{notes}</p>
                </div>
              )}
            </div>
            <div className="border-t border-slate-700/50 pt-2 text-center">
              <span className="text-[10px] text-slate-600">Cryptographically signed • HMAC-SHA256 chain</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
