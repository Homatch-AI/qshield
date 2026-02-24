import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import log from 'electron-log';
import type { AdapterType, AdapterEvent, ExecutionMode, AgentSession, AgentEnvelope, AITrustState } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

/** Known AI agent process signatures */
const AI_PROCESS_SIGNATURES: Record<string, { name: string; mode: ExecutionMode }> = {
  'claude': { name: 'Claude Code', mode: 'AI_AUTONOMOUS' },
  'cursor': { name: 'Cursor', mode: 'AI_ASSISTED' },
  'copilot': { name: 'GitHub Copilot', mode: 'AI_ASSISTED' },
  'aider': { name: 'Aider', mode: 'AI_AUTONOMOUS' },
  'continue': { name: 'Continue.dev', mode: 'AI_ASSISTED' },
  'openclaw': { name: 'OpenClaw', mode: 'AI_AUTONOMOUS' },
  'codex': { name: 'OpenAI Codex', mode: 'AI_AUTONOMOUS' },
  'sweep': { name: 'Sweep AI', mode: 'AI_AUTONOMOUS' },
  'devin': { name: 'Devin', mode: 'AI_AUTONOMOUS' },
  'mcp': { name: 'MCP Server', mode: 'AI_AUTONOMOUS' },
};

export class AIAgentAdapter extends BaseAdapter {
  readonly id: AdapterType = 'ai';
  readonly name = 'AI Agent Monitor';

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activeSessions: Map<string, AgentSession> = new Map();
  private envelopeChain: Map<string, string> = new Map();
  private stepCounters: Map<string, number> = new Map();
  private frozenSessions: Set<string> = new Set();

  protected defaultInterval = 5000;

  async start(): Promise<void> {
    if (!this.enabled) return;
    this.connected = true;
    this.pollTimer = setInterval(() => this.detectAgents(), 5000);
    log.info('[AIAgent] Started process monitoring for AI agents');
  }

  async stop(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.activeSessions.clear();
    this.connected = false;
    log.info('[AIAgent] Stopped');
  }

  protected generateSimulatedEvent(): AdapterEvent {
    // Not used — we emit events directly from detectAgents()
    return {
      adapterId: 'ai',
      eventType: 'ai-idle',
      timestamp: new Date().toISOString(),
      data: {},
      trustImpact: 0,
    };
  }

  // === Public API ===

  getActiveSessions(): AgentSession[] {
    return [...this.activeSessions.values()];
  }

  getSession(sessionId: string): AgentSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  freezeSession(sessionId: string, reason: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.frozen = true;
    session.frozenReason = reason;
    session.aiTrustState = 'FROZEN';
    this.frozenSessions.add(sessionId);

    log.info(`[AIAgent] FROZEN session "${session.agentName}": ${reason}`);

    this.emitEvent({
      adapterId: 'ai',
      eventType: 'ai-session-frozen',
      timestamp: new Date().toISOString(),
      data: {
        sessionId,
        agentName: session.agentName,
        reason,
        executionMode: session.executionMode,
        totalActions: session.totalActions,
        scopeExpansions: session.scopeExpansions,
      },
      trustImpact: -50,
    });
  }

  unfreezeSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.frozen = false;
    session.frozenReason = undefined;
    session.aiTrustState = 'VALID';
    this.frozenSessions.delete(sessionId);

    log.info(`[AIAgent] UNFROZEN session "${session.agentName}"`);

    this.emitEvent({
      adapterId: 'ai',
      eventType: 'ai-session-unfrozen',
      timestamp: new Date().toISOString(),
      data: { sessionId, agentName: session.agentName },
      trustImpact: 10,
    });
  }

  allowAction(sessionId: string, scope: 'once' | 'session'): void {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    log.info(`[AIAgent] Allowed ${scope} for "${session.agentName}"`);

    if (scope === 'session') {
      session.riskVelocity = Math.max(0, session.riskVelocity - 20);
      session.aiTrustState = 'VALID';
    }
  }

  // === Process Detection ===

  private detectAgents(): void {
    if (process.platform !== 'darwin' && process.platform !== 'linux') return;

    try {
      const psOutput = execSync(
        'ps aux 2>/dev/null | head -200',
        { timeout: 5000, encoding: 'utf-8' },
      ).trim();

      const lines = psOutput.split('\n').slice(1);
      const detectedAgents = new Map<string, { pid: string; name: string; mode: ExecutionMode }>();

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 11) continue;

        const pid = parts[1];
        const cmd = parts.slice(10).join(' ').toLowerCase();

        for (const [signature, info] of Object.entries(AI_PROCESS_SIGNATURES)) {
          if (cmd.includes(signature)) {
            const key = `${info.name}:${pid}`;
            if (!detectedAgents.has(key)) {
              detectedAgents.set(key, { pid, name: info.name, mode: info.mode });
            }
          }
        }
      }

      // Decay risk velocity for active sessions with no new scope changes
      for (const session of this.activeSessions.values()) {
        if (!session.frozen) {
          session.riskVelocity = Math.max(0, session.riskVelocity - 1);
        }
      }

      // Check for new agents
      for (const [key, agent] of detectedAgents) {
        if (!this.activeSessions.has(key) && !this.frozenSessions.has(key)) {
          this.startSession(key, agent.name, agent.mode, agent.pid);
        } else {
          const session = this.activeSessions.get(key);
          if (session && !session.frozen) {
            session.lastActivityAt = new Date().toISOString();
            this.monitorAgentActivity(session, agent.pid);
          }
        }
      }

      // Check for ended agents
      const detectedKeys = new Set(detectedAgents.keys());
      for (const [key, session] of this.activeSessions) {
        if (!detectedKeys.has(key) && !session.frozen) {
          this.endSession(key);
        }
      }
    } catch (err) {
      log.debug('[AIAgent] Detection error:', err);
    }
  }

  private startSession(key: string, agentName: string, mode: ExecutionMode, pid: string): void {
    const session: AgentSession = {
      sessionId: key,
      agentName,
      executionMode: mode,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      aiTrustState: 'VALID',
      riskVelocity: 0,
      scopeExpansions: 0,
      totalActions: 0,
      allowedPaths: [],
      allowedDomains: [],
      allowedApis: [],
      delegationDepth: 0,
      frozen: false,
    };

    this.activeSessions.set(key, session);
    this.envelopeChain.set(key, '0'.repeat(64));
    this.stepCounters.set(key, 0);

    log.info(`[AIAgent] Session started: "${agentName}" (${mode}) PID ${pid}`);

    this.emitEvent({
      adapterId: 'ai',
      eventType: 'ai-session-started',
      timestamp: new Date().toISOString(),
      data: {
        sessionId: key,
        agentName,
        executionMode: mode,
        pid,
      },
      trustImpact: mode === 'AI_AUTONOMOUS' ? -10 : -5,
    });
  }

  private endSession(key: string): void {
    const session = this.activeSessions.get(key);
    if (!session) return;

    log.info(`[AIAgent] Session ended: "${session.agentName}" (${session.totalActions} actions)`);

    this.emitEvent({
      adapterId: 'ai',
      eventType: 'ai-session-ended',
      timestamp: new Date().toISOString(),
      data: {
        sessionId: key,
        agentName: session.agentName,
        executionMode: session.executionMode,
        totalActions: session.totalActions,
        scopeExpansions: session.scopeExpansions,
        duration: Date.now() - new Date(session.startedAt).getTime(),
      },
      trustImpact: 5,
    });

    this.activeSessions.delete(key);
    this.envelopeChain.delete(key);
    this.stepCounters.delete(key);
  }

  private monitorAgentActivity(session: AgentSession, pid: string): void {
    if (process.platform !== 'darwin') return;

    try {
      const lsofOutput = execSync(
        `lsof -p ${pid} -Fn 2>/dev/null | grep "^n/" | head -20`,
        { timeout: 3000, encoding: 'utf-8' },
      ).trim();

      if (!lsofOutput) return;

      const accessedPaths = lsofOutput.split('\n')
        .map(l => l.replace(/^n/, ''))
        .filter(p => !p.includes('/dev/') && !p.includes('/Library/') && !p.includes('/System/'));

      for (const accessedPath of accessedPaths) {
        const pathHash = createHash('sha256').update(accessedPath).digest('hex').slice(0, 16);

        if (!session.allowedPaths.includes(pathHash)) {
          session.allowedPaths.push(pathHash);
          session.scopeExpansions++;
          session.totalActions++;
          session.riskVelocity = Math.min(100, session.riskVelocity + 5);

          const envelope = this.createEnvelope(session, 'file_access', { pathHash });
          this.evaluateRisk(session, envelope);

          if (session.scopeExpansions % 5 === 0 || session.riskVelocity > 40) {
            this.emitEvent({
              adapterId: 'ai',
              eventType: 'ai-scope-expansion',
              timestamp: new Date().toISOString(),
              data: {
                sessionId: session.sessionId,
                agentName: session.agentName,
                executionMode: session.executionMode,
                scopeExpansions: session.scopeExpansions,
                riskVelocity: session.riskVelocity,
                aiTrustState: session.aiTrustState,
                envelope,
              },
              trustImpact: session.executionMode === 'AI_AUTONOMOUS' ? -8 : -3,
            });
          }
        }
      }

      // Check network connections
      try {
        const netOutput = execSync(
          `lsof -p ${pid} -iTCP -sTCP:ESTABLISHED -Fn 2>/dev/null | grep "^n" | head -10`,
          { timeout: 3000, encoding: 'utf-8' },
        ).trim();

        if (netOutput) {
          const domains = netOutput.split('\n')
            .map(l => l.replace(/^n/, '').split(':')[0])
            .filter(d => d && !session.allowedDomains.includes(d));

          for (const domain of domains) {
            session.allowedDomains.push(domain);
            session.scopeExpansions++;
            session.riskVelocity = Math.min(100, session.riskVelocity + 8);

            const envelope = this.createEnvelope(session, 'network_request', { domain });
            this.evaluateRisk(session, envelope);
          }
        }
      } catch { /* network check optional */ }
    } catch (err) {
      log.debug('[AIAgent] Activity monitoring error:', err);
    }
  }

  // === Envelope Chain ===

  private createEnvelope(session: AgentSession, actionType: string, resourceRef: Record<string, string>): AgentEnvelope {
    const step = (this.stepCounters.get(session.sessionId) || 0) + 1;
    this.stepCounters.set(session.sessionId, step);

    const prevHash = this.envelopeChain.get(session.sessionId) || '0'.repeat(64);
    const chainInput = `${prevHash}:${step}:${actionType}:${JSON.stringify(resourceRef)}`;
    const chainHash = createHash('sha256').update(chainInput).digest('hex');
    this.envelopeChain.set(session.sessionId, chainHash);

    return {
      agentSessionId: session.sessionId,
      step,
      actionType,
      executionMode: session.executionMode,
      resourceRef,
      prevChainHash: prevHash,
      chainHash,
      timestamp: new Date().toISOString(),
      aiTrustState: session.aiTrustState,
      scopeChange: true,
    };
  }

  // === Risk Evaluation ===

  private evaluateRisk(session: AgentSession, _envelope: AgentEnvelope): void {
    const prev = session.aiTrustState;

    if (session.riskVelocity >= 90) {
      session.aiTrustState = 'FROZEN';
      if (prev !== 'FROZEN') {
        this.freezeSession(session.sessionId, `Risk velocity exceeded threshold (${session.riskVelocity})`);
      }
    } else if (session.riskVelocity >= 70) {
      session.aiTrustState = 'INVALID';
      if (prev !== 'INVALID' && prev !== 'FROZEN') {
        this.emitStateChange(session, prev, 'INVALID');
      }
    } else if (session.riskVelocity >= 40) {
      session.aiTrustState = 'DEGRADED';
      if (prev === 'VALID') {
        this.emitStateChange(session, prev, 'DEGRADED');
      }
    }
  }

  private emitStateChange(session: AgentSession, from: AITrustState, to: AITrustState): void {
    log.info(`[AIAgent] Trust state: ${from} -> ${to} for "${session.agentName}"`);

    this.emitEvent({
      adapterId: 'ai',
      eventType: 'ai-trust-state-changed',
      timestamp: new Date().toISOString(),
      data: {
        sessionId: session.sessionId,
        agentName: session.agentName,
        executionMode: session.executionMode,
        previousState: from,
        newState: to,
        riskVelocity: session.riskVelocity,
        scopeExpansions: session.scopeExpansions,
        totalActions: session.totalActions,
      },
      trustImpact: to === 'FROZEN' ? -50 : to === 'INVALID' ? -30 : -15,
    });
  }
}
