import { useState, useEffect } from 'react';
import { useAssetStore } from '@/stores/asset-store';

// ── Types (renderer-safe) ────────────────────────────────────────────────────

type AssetSensitivity = 'normal' | 'strict' | 'critical';
type AssetTrustState = 'verified' | 'changed' | 'unverified';

interface HighTrustAsset {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  sensitivity: AssetSensitivity;
  trustState: AssetTrustState;
  trustScore: number;
  contentHash: string | null;
  verifiedHash: string | null;
  createdAt: string;
  lastVerified: string | null;
  lastChanged: string | null;
  changeCount: number;
  evidenceCount: number;
  enabled: boolean;
}

interface AssetChangeEvent {
  assetId: string;
  path: string;
  sensitivity: AssetSensitivity;
  eventType: string;
  previousHash: string | null;
  newHash: string | null;
  trustStateBefore: string;
  trustStateAfter: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

// ── Color maps ───────────────────────────────────────────────────────────────

const TRUST_STATE_COLORS: Record<AssetTrustState, { bg: string; text: string; border: string; label: string }> = {
  verified: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/30', label: 'Verified' },
  changed:  { bg: 'bg-amber-500/10',   text: 'text-amber-500',   border: 'border-amber-500/30',   label: 'Changed'  },
  unverified: { bg: 'bg-slate-500/10', text: 'text-slate-400',   border: 'border-slate-500/30',   label: 'Unverified' },
};

const SENSITIVITY_COLORS: Record<AssetSensitivity, { bg: string; text: string; border: string }> = {
  normal:   { bg: 'bg-sky-500/10',   text: 'text-sky-400',   border: 'border-sky-500/30'   },
  strict:   { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  critical: { bg: 'bg-red-500/10',   text: 'text-red-400',   border: 'border-red-500/30'   },
};

// ── Score ring ───────────────────────────────────────────────────────────────

function ScoreRing({ score, state }: { score: number; state: AssetTrustState }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const strokeColor = state === 'verified' ? '#10b981' : state === 'changed' ? '#f59e0b' : '#64748b';

  return (
    <div className="relative flex h-12 w-12 items-center justify-center">
      <svg className="h-12 w-12 -rotate-90" viewBox="0 0 44 44">
        <circle cx="22" cy="22" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-700" />
        <circle
          cx="22" cy="22" r={radius} fill="none"
          stroke={strokeColor} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-xs font-bold text-slate-200">{score}</span>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function truncateHash(hash: string | null): string {
  if (!hash) return '—';
  return hash.slice(0, 10) + '...';
}

// ── Component ────────────────────────────────────────────────────────────────

interface AssetCardProps {
  asset: HighTrustAsset;
}

export function AssetCard({ asset }: AssetCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const verifyAsset = useAssetStore((s) => s.verifyAsset);
  const acceptChanges = useAssetStore((s) => s.acceptChanges);
  const removeAsset = useAssetStore((s) => s.removeAsset);
  const updateSensitivity = useAssetStore((s) => s.updateSensitivity);
  const fetchChangeLog = useAssetStore((s) => s.fetchChangeLog);
  const changeLogs = useAssetStore((s) => s.changeLogs);

  // Check lock status on mount
  useEffect(() => {
    window.qshield.assets.lockStatus(asset.id)
      .then((result) => setIsLocked(result.locked))
      .catch(() => {});
  }, [asset.id]);

  const stateColors = TRUST_STATE_COLORS[asset.trustState];
  const sensColors = SENSITIVITY_COLORS[asset.sensitivity];
  const changeLog = changeLogs[asset.id] ?? [];

  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action);
    try {
      await fn();
    } catch (err) {
      console.error(`[AssetCard] ${action} failed:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && changeLog.length === 0) {
      fetchChangeLog(asset.id);
    }
  };

  return (
    <div className={`rounded-xl border ${stateColors.border} bg-slate-900 transition-colors hover:bg-slate-800/50`}>
      {/* Main row */}
      <div className="flex items-center gap-4 p-4">
        {/* Shield icon */}
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg shrink-0 ${stateColors.bg}`}>
          <svg className={`h-6 w-6 ${stateColors.text}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200 truncate">{asset.name}</span>
            {/* Trust state badge */}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${stateColors.bg} ${stateColors.text}`}>
              {stateColors.label}
              {asset.trustState === 'verified' && ' \u2713'}
              {asset.trustState === 'changed' && ' \u26A0'}
              {asset.trustState === 'unverified' && ' \u25CB'}
            </span>
            {/* Sensitivity badge */}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${sensColors.bg} ${sensColors.text}`}>
              {asset.sensitivity}
            </span>
            {/* Type badge */}
            <span className="inline-flex items-center rounded-full bg-slate-700/50 px-2 py-0.5 text-[10px] font-medium text-slate-400">
              {asset.type}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500 font-mono truncate">{asset.path}</p>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
            <span>Verified: <strong className="text-slate-400">{formatTimestamp(asset.lastVerified)}</strong></span>
            {asset.lastChanged && (
              <span>Changed: <strong className="text-amber-400">{formatTimestamp(asset.lastChanged)}</strong></span>
            )}
            <span>Changes: <strong className="text-slate-400">{asset.changeCount}</strong></span>
          </div>
        </div>

        {/* Score ring */}
        <ScoreRing score={asset.trustScore} state={asset.trustState} />

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => handleAction('verify', () => verifyAsset(asset.id))}
            disabled={actionLoading !== null}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-sky-400 hover:bg-sky-500/10 disabled:opacity-50 transition-colors"
            title="Verify hash integrity"
          >
            {actionLoading === 'verify' ? '...' : 'Verify'}
          </button>
          {asset.trustState === 'changed' && (
            <button
              onClick={() => handleAction('accept', () => acceptChanges(asset.id))}
              disabled={actionLoading !== null}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
              title="Accept changes as new verified state"
            >
              {actionLoading === 'accept' ? '...' : 'Accept'}
            </button>
          )}

          {/* Lock / Unlock toggle */}
          <button
            onClick={() => handleAction(isLocked ? 'unlock' : 'lock', async () => {
              if (isLocked) {
                const result = await window.qshield.assets.unlock(asset.id);
                setIsLocked(result.locked);
              } else {
                const result = await window.qshield.assets.lock(asset.id);
                setIsLocked(result.locked);
              }
            })}
            disabled={actionLoading !== null}
            className={`rounded-lg p-1.5 text-xs disabled:opacity-50 transition-colors ${
              isLocked
                ? 'text-amber-400 bg-amber-500/10 hover:bg-amber-500/20'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
            }`}
            title={isLocked ? 'Unlock (restore permissions)' : 'Lock (set read-only)'}
          >
            {actionLoading === 'lock' || actionLoading === 'unlock' ? '...' : isLocked ? '🔒' : '🔓'}
          </button>

          {/* Sensitivity dropdown */}
          <select
            value={asset.sensitivity}
            onChange={(e) => handleAction('sensitivity', () => updateSensitivity(asset.id, e.target.value as 'normal' | 'strict' | 'critical'))}
            disabled={actionLoading !== null}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-300 focus:border-sky-500 focus:outline-none disabled:opacity-50"
          >
            <option value="normal">Normal</option>
            <option value="strict">Strict</option>
            <option value="critical">Critical</option>
          </select>

          <button
            onClick={() => handleAction('remove', () => removeAsset(asset.id))}
            disabled={actionLoading !== null}
            className="rounded-lg p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
            title="Remove asset"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>

          {/* Expand toggle */}
          <button
            onClick={handleExpand}
            className="rounded-lg p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
            title="Show change log"
          >
            <svg className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expandable change log */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-4 py-3">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Recent Changes</h4>
          {changeLog.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">No changes recorded yet.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {changeLog.map((entry: AssetChangeEvent, idx: number) => (
                <div key={idx} className="flex items-start gap-3 text-xs">
                  <div className="shrink-0 mt-0.5">
                    <div className={`h-2 w-2 rounded-full ${
                      entry.trustStateAfter === 'verified' ? 'bg-emerald-500' :
                      entry.trustStateAfter === 'changed' ? 'bg-amber-500' : 'bg-slate-500'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-300">{entry.eventType.replace('asset-', '')}</span>
                      <span className="text-slate-600">{formatTimestamp(entry.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-slate-500">
                      <span>{entry.trustStateBefore} → {entry.trustStateAfter}</span>
                      {entry.newHash && (
                        <span className="font-mono">{truncateHash(entry.newHash)}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
