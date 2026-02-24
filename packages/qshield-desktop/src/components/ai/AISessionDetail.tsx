import { useState, useEffect } from 'react';
import { useAIStore, type AgentSession } from '@/stores/ai-store';
import { formatRelativeTime } from '@/lib/formatters';
import { isIPCAvailable } from '@/lib/mock-data';

const TRUST_STATE_COLORS: Record<string, { bg: string; text: string }> = {
  VALID: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  DEGRADED: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  INVALID: { bg: 'bg-orange-500/10', text: 'text-orange-400' },
  FROZEN: { bg: 'bg-red-500/10', text: 'text-red-400' },
};

interface AccessedFile {
  path: string;
  fileName: string;
  pathHash: string;
  firstSeen: string;
  accessCount: number;
}

interface Props {
  session: AgentSession;
}

/** Extract a clean display name and PID from the session ID (format: "AgentName:PID") */
function parseSessionId(sessionId: string): { displayName: string; pid: string } {
  const colonIdx = sessionId.lastIndexOf(':');
  if (colonIdx > 0) {
    return { displayName: sessionId.slice(0, colonIdx), pid: sessionId.slice(colonIdx + 1) };
  }
  return { displayName: sessionId, pid: '' };
}

/**
 * Detailed view of a single AI agent session.
 * Shows trust state, risk velocity, scope tracking, and control actions.
 */
export function AISessionDetail({ session }: Props) {
  const freezeSession = useAIStore((s) => s.freezeSession);
  const unfreezeSession = useAIStore((s) => s.unfreezeSession);
  const allowAction = useAIStore((s) => s.allowAction);
  const trustColors = TRUST_STATE_COLORS[session.aiTrustState] ?? TRUST_STATE_COLORS.VALID;

  const [accessedFiles, setAccessedFiles] = useState<AccessedFile[]>([]);
  const { pid } = parseSessionId(session.sessionId);

  // Fetch accessed files for this session
  useEffect(() => {
    if (!isIPCAvailable()) return;
    let cancelled = false;
    const fetchFiles = async () => {
      try {
        const files = await window.qshield.ai.sessionFiles(session.sessionId);
        if (!cancelled) setAccessedFiles(files);
      } catch { /* ignore */ }
    };
    fetchFiles();
    const interval = setInterval(fetchFiles, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [session.sessionId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-12 w-12 rounded-lg ${trustColors.bg} flex items-center justify-center`}>
            <span className="text-2xl">🤖</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-100">{session.agentName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${trustColors.bg} ${trustColors.text}`}>
                {session.aiTrustState}
              </span>
              <span className="text-xs text-slate-500">{session.executionMode.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {session.frozen ? (
            <button
              onClick={() => unfreezeSession(session.sessionId)}
              className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              Unfreeze Session
            </button>
          ) : (
            <>
              <button
                onClick={() => allowAction(session.sessionId, 'once')}
                className="rounded-lg bg-sky-500/10 border border-sky-500/30 px-4 py-2 text-sm font-medium text-sky-400 hover:bg-sky-500/20 transition-colors"
              >
                Allow Once
              </button>
              <button
                onClick={() => allowAction(session.sessionId, 'session')}
                className="rounded-lg bg-violet-500/10 border border-violet-500/30 px-4 py-2 text-sm font-medium text-violet-400 hover:bg-violet-500/20 transition-colors"
              >
                Allow Session
              </button>
              <button
                onClick={() => freezeSession(session.sessionId)}
                className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20 transition-colors"
              >
                Freeze
              </button>
            </>
          )}
        </div>
      </div>

      {/* Frozen reason banner */}
      {session.frozen && session.frozenReason && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
          <span className="font-semibold">Frozen:</span> {session.frozenReason}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatBox label="Risk Velocity" value={`${session.riskVelocity}/100`} color={
          session.riskVelocity >= 70 ? 'red' : session.riskVelocity >= 40 ? 'amber' : 'emerald'
        } />
        <StatBox label="Total Actions" value={session.totalActions.toString()} color="sky" />
        <StatBox label="Scope Expansions" value={session.scopeExpansions.toString()} color="violet" />
        <StatBox label="Delegation Depth" value={session.delegationDepth.toString()} color="slate" />
      </div>

      {/* Risk velocity bar */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-300">Risk Velocity</h3>
          <span className={`text-sm font-bold ${
            session.riskVelocity >= 70 ? 'text-red-400'
            : session.riskVelocity >= 40 ? 'text-amber-400'
            : 'text-emerald-400'
          }`}>{session.riskVelocity}%</span>
        </div>
        <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              session.riskVelocity >= 70 ? 'bg-red-500'
              : session.riskVelocity >= 40 ? 'bg-amber-500'
              : 'bg-emerald-500'
            }`}
            style={{ width: `${session.riskVelocity}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[10px] text-slate-600">
          <span>VALID</span>
          <span>DEGRADED (40)</span>
          <span>INVALID (70)</span>
          <span>FROZEN (90)</span>
        </div>
      </div>

      {/* Scope tracking */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FileAccessSection files={accessedFiles} />
        <DomainSection domains={session.allowedDomains} />
        <ScopeSection
          title="API Calls"
          items={session.allowedApis}
          icon="⚡"
          emptyMessage="No API calls detected"
        />
      </div>

      {/* Timeline info */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Session Timeline</h3>
        <div className="flex items-center gap-6 text-xs text-slate-400">
          <div>
            <span className="text-slate-500">Started:</span>{' '}
            {formatRelativeTime(session.startedAt)}
          </div>
          <div>
            <span className="text-slate-500">Last Activity:</span>{' '}
            {formatRelativeTime(session.lastActivityAt)}
          </div>
          {pid && (
            <div>
              <span className="text-slate-500">PID:</span>{' '}
              <span className="font-mono">{pid}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-500',
    sky: 'text-sky-500',
    violet: 'text-violet-500',
    amber: 'text-amber-500',
    red: 'text-red-500',
    slate: 'text-slate-100',
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      <p className={`mt-1 text-xl font-bold ${colorMap[color] ?? 'text-slate-100'}`}>{value}</p>
    </div>
  );
}

function FileAccessSection({ files }: { files: AccessedFile[] }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span>📁</span>
        <h3 className="text-sm font-semibold text-slate-300">File Access</h3>
        <span className="text-xs text-slate-500">({files.length})</span>
      </div>
      {files.length === 0 ? (
        <p className="text-xs text-slate-600">No file access detected</p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {files.map((file) => (
            <div key={file.pathHash} className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-slate-300 truncate block" title={file.path}>
                  {file.fileName}
                </span>
                <span className="text-slate-600 truncate block text-[10px]" title={file.path}>
                  {file.path}
                </span>
              </div>
              <span className="shrink-0 text-slate-500 tabular-nums">{file.accessCount}x</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DomainSection({ domains }: { domains: string[] }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span>🌐</span>
        <h3 className="text-sm font-semibold text-slate-300">Network Domains</h3>
        <span className="text-xs text-slate-500">({domains.length})</span>
      </div>
      {domains.length === 0 ? (
        <p className="text-xs text-slate-600">No network connections</p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {domains.map((domain, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shrink-0" />
              <span className="font-mono text-slate-400 truncate">{domain}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScopeSection({ title, items, icon, emptyMessage }: {
  title: string;
  items: string[];
  icon: string;
  emptyMessage: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span>{icon}</span>
        <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
        <span className="text-xs text-slate-500">({items.length})</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-600">{emptyMessage}</p>
      ) : (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {items.map((item, i) => (
            <div key={i} className="text-xs font-mono text-slate-400 truncate">
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
