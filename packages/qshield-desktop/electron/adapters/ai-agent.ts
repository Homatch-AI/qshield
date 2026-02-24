import path from 'node:path';
import { createHash } from 'node:crypto';
import log from 'electron-log';
import type { AdapterType, AdapterEvent, ExecutionMode, AgentSession, AgentEnvelope, AITrustState, AIProtectedZone } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';
import { safeExec } from '../services/safe-exec';
import type { AssetStore } from '../services/asset-store';

/** A file accessed by an AI agent session, with readable info */
export interface AccessedFile {
  path: string;
  fileName: string;
  pathHash: string;
  firstSeen: string;
  accessCount: number;
}

/**
 * AI agent process signatures using regex for precise matching.
 * Each entry has a `pattern` to match against the full command line,
 * and an optional `exclude` pattern to reject false positives.
 */
const AI_PROCESS_SIGNATURES: Array<{
  pattern: RegExp;
  name: string;
  mode: ExecutionMode;
  exclude?: RegExp;
}> = [
  // Claude Code CLI — bare `claude` binary or node running claude
  // Excludes Claude Desktop app, its helpers, QShield's own Electron, and ShipIt updater
  {
    pattern: /(?:^|\/|\s)claude(?:\s|$)/,
    name: 'Claude Code',
    mode: 'AI_AUTONOMOUS',
    exclude: /Claude\.app|Claude Helper|ShipIt|Electron|electron|qshield/i,
  },
  // Claude Code via node (e.g. node /Users/x/.claude/local/claude)
  {
    pattern: /node\s+.*\.claude\/local/i,
    name: 'Claude Code',
    mode: 'AI_AUTONOMOUS',
    exclude: /Electron|qshield/i,
  },
  // Cursor IDE — NOT macOS CursorUIViewService
  {
    pattern: /Cursor\.app|\/cursor(?:\s|$)/i,
    name: 'Cursor',
    mode: 'AI_ASSISTED',
    exclude: /CursorUIViewService/,
  },
  // GitHub Copilot (runs as extension host / language server)
  {
    pattern: /copilot/i,
    name: 'GitHub Copilot',
    mode: 'AI_ASSISTED',
    exclude: /Electron|electron/i,
  },
  // Aider
  { pattern: /\baider\b/i, name: 'Aider', mode: 'AI_AUTONOMOUS' },
  // Continue.dev
  { pattern: /continue\.dev/i, name: 'Continue.dev', mode: 'AI_ASSISTED' },
  // OpenClaw
  { pattern: /\bopenclaw\b/i, name: 'OpenClaw', mode: 'AI_AUTONOMOUS' },
  // OpenAI Codex CLI
  { pattern: /\bcodex\b/i, name: 'OpenAI Codex', mode: 'AI_AUTONOMOUS' },
  // Sweep AI
  { pattern: /\bsweep\b/i, name: 'Sweep AI', mode: 'AI_AUTONOMOUS' },
  // Devin
  { pattern: /\bdevin\b/i, name: 'Devin', mode: 'AI_AUTONOMOUS' },
  // MCP Server
  { pattern: /\bmcp-server\b/i, name: 'MCP Server', mode: 'AI_AUTONOMOUS' },
  // Sourcegraph Cody
  { pattern: /\bcody\b/i, name: 'Sourcegraph Cody', mode: 'AI_ASSISTED', exclude: /CodyUIViewService/i },
  // Tabnine
  { pattern: /\btabnine\b/i, name: 'Tabnine', mode: 'AI_ASSISTED' },
  // Codeium
  { pattern: /\bcodeium\b/i, name: 'Codeium', mode: 'AI_ASSISTED' },
];

export class AIAgentAdapter extends BaseAdapter {
  readonly id: AdapterType = 'ai';
  readonly name = 'AI Agent Monitor';

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private activeSessions: Map<string, AgentSession> = new Map();
  private envelopeChain: Map<string, string> = new Map();
  private stepCounters: Map<string, number> = new Map();
  private frozenSessions: Set<string> = new Set();
  private accessedFiles: Map<string, Map<string, AccessedFile>> = new Map();
  private assetStore: AssetStore | null = null;

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

  getAccessedFiles(sessionId: string): AccessedFile[] {
    const files = this.accessedFiles.get(sessionId);
    if (!files) return [];
    return [...files.values()].sort((a, b) => b.accessCount - a.accessCount);
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

  setAssetStore(store: AssetStore): void {
    this.assetStore = store;
    log.info('[AIAgent] Asset store connected for zone protection');
  }

  // === Process Detection ===

  private scanCount = 0;

  private async detectAgents(): Promise<void> {
    if (process.platform !== 'darwin' && process.platform !== 'linux') return;

    try {
      // Use ps -eo for clean PID + full command output (no truncation or column alignment issues)
      const psOutput = (await safeExec(
        'ps -eo pid,command 2>/dev/null',
        { timeout: 5000 },
      )).trim();

      const lines = psOutput.split('\n').slice(1); // skip header
      const detectedAgents = new Map<string, { pid: string; name: string; mode: ExecutionMode; cmd: string }>();

      for (const line of lines) {
        const match = line.trim().match(/^\s*(\d+)\s+(.+)$/);
        if (!match) continue;

        const pid = match[1];
        const fullCmd = match[2];

        for (const sig of AI_PROCESS_SIGNATURES) {
          if (sig.pattern.test(fullCmd)) {
            // Check exclusion pattern to avoid false positives
            if (sig.exclude && sig.exclude.test(fullCmd)) continue;
            // Skip ps/grep commands themselves
            if (fullCmd.includes('ps -eo') || fullCmd.includes('grep')) continue;

            const key = `${sig.name}:${pid}`;
            if (!detectedAgents.has(key)) {
              detectedAgents.set(key, { pid, name: sig.name, mode: sig.mode, cmd: fullCmd });
            }
            break; // Only match first signature per process
          }
        }
      }

      // Log detection results periodically (every ~30s)
      this.scanCount++;
      if (this.scanCount % 6 === 1) {
        if (detectedAgents.size > 0) {
          log.info(`[AIAgent] Detected ${detectedAgents.size} AI agent(s):`);
          for (const [key, agent] of detectedAgents) {
            log.info(`[AIAgent]   ${key} CMD=${agent.cmd.slice(0, 120)}`);
          }
        } else {
          log.debug('[AIAgent] No AI agents detected');
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
          log.info(`[AIAgent] NEW session: "${agent.name}" PID=${agent.pid} CMD=${agent.cmd.slice(0, 120)}`);
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
    this.accessedFiles.delete(key);
  }

  private async monitorAgentActivity(session: AgentSession, pid: string): Promise<void> {
    if (process.platform !== 'darwin') return;

    try {
      const lsofOutput = (await safeExec(
        `lsof -p ${pid} -Fn 2>/dev/null | grep "^n/" | head -20`,
        { timeout: 3000 },
      )).trim();

      if (!lsofOutput) return;

      const accessedPaths = lsofOutput.split('\n')
        .map(l => l.replace(/^n/, ''))
        .filter(p => !p.includes('/dev/') && !p.includes('/Library/') && !p.includes('/System/'));

      // Initialize file map for this session if needed
      if (!this.accessedFiles.has(session.sessionId)) {
        this.accessedFiles.set(session.sessionId, new Map());
      }
      const sessionFiles = this.accessedFiles.get(session.sessionId)!;

      for (const accessedPath of accessedPaths) {
        const pathHash = createHash('sha256').update(accessedPath).digest('hex').slice(0, 16);

        if (!sessionFiles.has(pathHash)) {
          // New file accessed — store readable info
          const fileName = path.basename(accessedPath);
          sessionFiles.set(pathHash, {
            path: accessedPath,
            fileName,
            pathHash,
            firstSeen: new Date().toISOString(),
            accessCount: 1,
          });

          // Check AI-Protected Zones
          if (this.assetStore) {
            const zone = this.assetStore.getProtectedZoneByPath(accessedPath);
            if (zone) {
              this.handleZoneViolation(session, zone, accessedPath);
            }
          }

          session.allowedPaths.push(pathHash);
          session.scopeExpansions++;
          session.totalActions++;
          session.riskVelocity = Math.min(100, session.riskVelocity + 5);

          const envelope = this.createEnvelope(session, 'file_access', { pathHash, fileName, path: accessedPath });
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
                newFile: fileName,
                newFilePath: accessedPath,
                envelope,
              },
              trustImpact: session.executionMode === 'AI_AUTONOMOUS' ? -8 : -3,
            });
          }
        } else {
          // Existing file — increment count
          sessionFiles.get(pathHash)!.accessCount++;
        }
      }

      // Check network connections
      try {
        const netOutput = (await safeExec(
          `lsof -p ${pid} -iTCP -sTCP:ESTABLISHED -Fn 2>/dev/null | grep "^n" | head -10`,
          { timeout: 3000 },
        )).trim();

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

  private handleZoneViolation(session: AgentSession, zone: AIProtectedZone, accessedPath: string): void {
    const fileName = path.basename(accessedPath);

    log.warn(`[AIAgent] ZONE VIOLATION: "${session.agentName}" accessed protected zone "${zone.name}" — file: ${fileName}`);

    // Record violation in DB
    this.assetStore?.recordZoneViolation(zone.id);

    let actionTaken: string;

    switch (zone.protectionLevel) {
      case 'freeze':
        this.freezeSession(session.sessionId, `Accessed AI-protected zone "${zone.name}" (${fileName})`);
        actionTaken = 'frozen';
        break;
      case 'block':
        actionTaken = 'blocked';
        session.riskVelocity = Math.min(100, session.riskVelocity + 30);
        this.evaluateRisk(session, this.createEnvelope(session, 'zone_violation', {
          pathHash: createHash('sha256').update(accessedPath).digest('hex').slice(0, 16),
          zoneName: zone.name,
        }));
        break;
      case 'warn':
      default:
        actionTaken = 'warned';
        session.riskVelocity = Math.min(100, session.riskVelocity + 15);
        break;
    }

    // Emit violation event
    this.emitEvent({
      adapterId: 'ai',
      eventType: 'ai-zone-violation',
      timestamp: new Date().toISOString(),
      data: {
        sessionId: session.sessionId,
        agentName: session.agentName,
        executionMode: session.executionMode,
        zoneId: zone.id,
        zoneName: zone.name,
        zonePath: zone.path,
        protectionLevel: zone.protectionLevel,
        accessedFile: accessedPath,
        accessedFileName: fileName,
        actionTaken,
        violationCount: zone.violationCount + 1,
      },
      trustImpact: zone.protectionLevel === 'freeze' ? -50 : zone.protectionLevel === 'block' ? -30 : -15,
    });
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
