import { useEffect, lazy, Suspense } from 'react';
import { useAIStore, type AgentSession } from '@/stores/ai-store';
import { AISessionDetail } from './AISessionDetail';
import { formatRelativeTime } from '@/lib/formatters';

const AIProtectedZones = lazy(() => import('./AIProtectedZones'));

const TRUST_STATE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  VALID: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  DEGRADED: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-500' },
  INVALID: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-500' },
  FROZEN: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-500' },
};

const MODE_LABELS: Record<string, { label: string; color: string }> = {
  HUMAN_DIRECT: { label: 'Human', color: 'text-slate-400' },
  AI_ASSISTED: { label: 'AI Assisted', color: 'text-violet-400' },
  AI_AUTONOMOUS: { label: 'AI Autonomous', color: 'text-purple-400' },
};

/**
 * AI Governance Panel — lists active AI agent sessions with trust state,
 * risk velocity, and controls to freeze/unfreeze/allow.
 */
export default function AIGovernancePanel() {
  const sessions = useAIStore((s) => s.sessions);
  const loading = useAIStore((s) => s.loading);
  const selectedSessionId = useAIStore((s) => s.selectedSessionId);
  const fetchSessions = useAIStore((s) => s.fetchSessions);
  const selectSession = useAIStore((s) => s.selectSession);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions]);

  const selectedSession = sessions.find((s) => s.sessionId === selectedSessionId);

  if (selectedSession) {
    return (
      <div className="p-6 space-y-6">
        <button
          onClick={() => selectSession(null)}
          className="text-sm text-sky-400 hover:text-sky-300 transition-colors"
        >
          &larr; Back to sessions
        </button>
        <AISessionDetail session={selectedSession} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">AI Governance</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor and control AI agent sessions in real-time
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className={`h-2 w-2 rounded-full ${sessions.length > 0 ? 'bg-violet-500' : 'bg-slate-600'}`} />
          {sessions.length} active session{sessions.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard
          label="Active Sessions"
          value={sessions.length.toString()}
          color="violet"
        />
        <SummaryCard
          label="Autonomous"
          value={sessions.filter((s) => s.executionMode === 'AI_AUTONOMOUS').length.toString()}
          color="purple"
        />
        <SummaryCard
          label="Frozen"
          value={sessions.filter((s) => s.frozen).length.toString()}
          color="red"
        />
        <SummaryCard
          label="Avg Risk"
          value={sessions.length > 0
            ? Math.round(sessions.reduce((a, s) => a + s.riskVelocity, 0) / sessions.length).toString()
            : '0'}
          color="amber"
        />
      </div>

      {/* Sessions list */}
      {loading && sessions.length === 0 ? (
        <div className="text-center py-12 text-slate-500">Loading sessions...</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-8 text-center">
          <div className="text-3xl mb-3">🤖</div>
          <h3 className="text-lg font-semibold text-slate-300">No Active AI Sessions</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            QShield monitors AI agents like Claude Code, Cursor, Aider, and others.
            Sessions will appear here when AI tools are detected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.sessionId}
              session={session}
              onSelect={() => selectSession(session.sessionId)}
            />
          ))}
        </div>
      )}

      {/* Protected Zones section */}
      <div className="border-t border-slate-700 pt-6">
        <Suspense fallback={<div className="text-sm text-slate-500">Loading zones...</div>}>
          <AIProtectedZones />
        </Suspense>
      </div>
    </div>
  );
}

function SessionCard({ session, onSelect }: { session: AgentSession; onSelect: () => void }) {
  const freezeSession = useAIStore((s) => s.freezeSession);
  const unfreezeSession = useAIStore((s) => s.unfreezeSession);
  const trustColors = TRUST_STATE_COLORS[session.aiTrustState] ?? TRUST_STATE_COLORS.VALID;
  const modeInfo = MODE_LABELS[session.executionMode] ?? MODE_LABELS.HUMAN_DIRECT;

  return (
    <div
      className="rounded-xl border border-slate-700 bg-slate-900 p-4 hover:border-slate-600 transition-colors cursor-pointer"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onSelect(); }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`h-10 w-10 rounded-lg ${trustColors.bg} flex items-center justify-center`}>
            <span className="text-lg">🤖</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-100">{session.agentName}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${trustColors.bg} ${trustColors.text}`}>
                {session.aiTrustState}
              </span>
              <span className={`text-xs ${modeInfo.color}`}>{modeInfo.label}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
              <span>Started {formatRelativeTime(session.startedAt)}</span>
              <span>{session.totalActions} actions</span>
              <span>{session.scopeExpansions} scope changes</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Risk velocity bar */}
          <div className="w-24">
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
              <span>Risk</span>
              <span>{session.riskVelocity}/100</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  session.riskVelocity >= 70 ? 'bg-red-500'
                  : session.riskVelocity >= 40 ? 'bg-amber-500'
                  : 'bg-emerald-500'
                }`}
                style={{ width: `${session.riskVelocity}%` }}
              />
            </div>
          </div>

          {/* Freeze/Unfreeze button */}
          {session.frozen ? (
            <button
              onClick={(e) => { e.stopPropagation(); unfreezeSession(session.sessionId); }}
              className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              Unfreeze
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); freezeSession(session.sessionId); }}
              className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors"
            >
              Freeze
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  const colorMap: Record<string, string> = {
    violet: 'text-violet-500',
    purple: 'text-purple-500',
    red: 'text-red-500',
    amber: 'text-amber-500',
    emerald: 'text-emerald-500',
  };

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</span>
      <p className={`mt-1 text-xl font-bold ${colorMap[color] ?? 'text-slate-100'}`}>{value}</p>
    </div>
  );
}
