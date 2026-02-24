import { describe, it, expect } from 'vitest';
import { hmacSha256 } from '../../src/crypto';

// ── Agent Session Lifecycle ─────────────────────────────────────────────────

describe('AI Governance - Agent Session Lifecycle', () => {
  function createAgentSession(overrides?: Partial<Record<string, unknown>>) {
    return {
      sessionId: `session-${Date.now()}`,
      agentName: 'Claude Code',
      executionMode: 'AI_AUTONOMOUS' as const,
      aiTrustState: 'VALID' as const,
      riskVelocity: 0,
      scopeExpansions: 0,
      totalActions: 0,
      allowedPaths: [] as string[],
      allowedDomains: [] as string[],
      allowedApis: [] as string[],
      delegationDepth: 0,
      frozen: false,
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      ...overrides,
    };
  }

  function computeAITrustState(riskVelocity: number): string {
    if (riskVelocity >= 90) return 'FROZEN';
    if (riskVelocity >= 70) return 'INVALID';
    if (riskVelocity >= 40) return 'DEGRADED';
    return 'VALID';
  }

  it('new session starts with correct defaults', () => {
    const session = createAgentSession();
    expect(session.aiTrustState).toBe('VALID');
    expect(session.riskVelocity).toBe(0);
    expect(session.frozen).toBe(false);
    expect(session.scopeExpansions).toBe(0);
  });

  it('risk velocity increases accumulate', () => {
    const session = createAgentSession();
    session.riskVelocity += 5; // file access
    expect(session.riskVelocity).toBe(5);
    session.riskVelocity += 8; // network
    expect(session.riskVelocity).toBe(13);
    session.riskVelocity += 5;
    expect(session.riskVelocity).toBe(18);
  });

  it('risk velocity thresholds determine trust state', () => {
    expect(computeAITrustState(0)).toBe('VALID');
    expect(computeAITrustState(39)).toBe('VALID');
    expect(computeAITrustState(40)).toBe('DEGRADED');
    expect(computeAITrustState(69)).toBe('DEGRADED');
    expect(computeAITrustState(70)).toBe('INVALID');
    expect(computeAITrustState(89)).toBe('INVALID');
    expect(computeAITrustState(90)).toBe('FROZEN');
    expect(computeAITrustState(100)).toBe('FROZEN');
  });

  it('scope expansion increments count', () => {
    const session = createAgentSession();
    session.allowedPaths.push('/Users/test/new-dir');
    session.scopeExpansions += 1;
    expect(session.scopeExpansions).toBe(1);

    session.allowedPaths.push('/Users/test/another');
    session.scopeExpansions += 1;
    expect(session.scopeExpansions).toBe(2);
  });

  it('freeze session sets frozen=true and aiTrustState=FROZEN', () => {
    const session = createAgentSession();
    session.frozen = true;
    session.aiTrustState = 'FROZEN';
    expect(session.frozen).toBe(true);
    expect(session.aiTrustState).toBe('FROZEN');
  });

  it('unfreeze sets frozen=false, aiTrustState=DEGRADED (not VALID)', () => {
    const session = createAgentSession({ frozen: true, aiTrustState: 'FROZEN' as const });
    session.frozen = false;
    session.aiTrustState = 'DEGRADED';
    expect(session.frozen).toBe(false);
    expect(session.aiTrustState).toBe('DEGRADED');
  });
});

// ── Agent Envelope Hash Chain ───────────────────────────────────────────────

describe('AI Governance - Envelope Hash Chain', () => {
  const ENVELOPE_KEY = 'envelope-test-key';

  function createEnvelope(
    step: number,
    actionType: string,
    resourceRef: string,
    prevChainHash: string,
  ) {
    const data = `${prevChainHash}|${step}|${actionType}|${resourceRef}`;
    return {
      step,
      actionType,
      resourceRef,
      prevChainHash,
      chainHash: hmacSha256(data, ENVELOPE_KEY),
      timestamp: new Date().toISOString(),
      aiTrustState: 'VALID' as const,
      scopeChange: false,
    };
  }

  function verifyEnvelopeChain(
    envelopes: ReturnType<typeof createEnvelope>[],
  ): { valid: boolean; brokenAt?: number } {
    for (let i = 0; i < envelopes.length; i++) {
      const env = envelopes[i];
      const data = `${env.prevChainHash}|${env.step}|${env.actionType}|${env.resourceRef}`;
      const expectedHash = hmacSha256(data, ENVELOPE_KEY);
      if (env.chainHash !== expectedHash) {
        return { valid: false, brokenAt: i };
      }
      if (i > 0 && env.prevChainHash !== envelopes[i - 1].chainHash) {
        return { valid: false, brokenAt: i };
      }
    }
    return { valid: true };
  }

  it('first envelope: prevChainHash = genesis', () => {
    const env = createEnvelope(0, 'init', 'none', 'genesis');
    expect(env.prevChainHash).toBe('genesis');
    expect(env.chainHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('chain of 5 envelopes: each depends on previous', () => {
    const envelopes = [];
    let prevHash = 'genesis';

    for (let i = 0; i < 5; i++) {
      const env = createEnvelope(i, `action-${i}`, `/path/${i}`, prevHash);
      envelopes.push(env);
      prevHash = env.chainHash;
    }

    const result = verifyEnvelopeChain(envelopes);
    expect(result.valid).toBe(true);
  });

  it('modifying envelope 2 breaks envelope 3 verification', () => {
    const envelopes = [];
    let prevHash = 'genesis';

    for (let i = 0; i < 5; i++) {
      const env = createEnvelope(i, `action-${i}`, `/path/${i}`, prevHash);
      envelopes.push(env);
      prevHash = env.chainHash;
    }

    // Tamper with envelope 2's actionType (recalculate its hash)
    envelopes[2].actionType = 'TAMPERED';
    // Don't recalculate chainHash — it now mismatches
    const result = verifyEnvelopeChain(envelopes);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it('verify chain integrity by recomputing hashes', () => {
    const envelopes = [];
    let prevHash = 'genesis';

    for (let i = 0; i < 3; i++) {
      const env = createEnvelope(i, `read`, `/file-${i}.txt`, prevHash);
      envelopes.push(env);
      prevHash = env.chainHash;
    }

    // Verify forward
    for (let i = 0; i < envelopes.length; i++) {
      const env = envelopes[i];
      const data = `${env.prevChainHash}|${env.step}|${env.actionType}|${env.resourceRef}`;
      const recomputed = hmacSha256(data, ENVELOPE_KEY);
      expect(recomputed).toBe(env.chainHash);
    }
  });
});

// ── Trust Decay Rates ───────────────────────────────────────────────────────

describe('AI Governance - Trust Decay', () => {
  const DECAY_RATES: Record<string, number> = {
    HUMAN_DIRECT: 300,
    AI_ASSISTED: 180,
    AI_AUTONOMOUS: 120,
  };

  function computeTrustAtTime(mode: string, elapsedSeconds: number): number {
    const halfLife = DECAY_RATES[mode];
    return 100 * Math.pow(2, -elapsedSeconds / halfLife);
  }

  it('HUMAN_DIRECT decays slowest', () => {
    const trust = computeTrustAtTime('HUMAN_DIRECT', 300);
    expect(trust).toBeCloseTo(50, 0);
  });

  it('AI_ASSISTED decays faster than HUMAN_DIRECT', () => {
    const human = computeTrustAtTime('HUMAN_DIRECT', 180);
    const assisted = computeTrustAtTime('AI_ASSISTED', 180);
    expect(assisted).toBeLessThan(human);
    expect(assisted).toBeCloseTo(50, 0); // at half-life
  });

  it('AI_AUTONOMOUS decays fastest', () => {
    const autonomous = computeTrustAtTime('AI_AUTONOMOUS', 120);
    expect(autonomous).toBeCloseTo(50, 0); // at half-life
  });

  it('at t=0, trust = 100%', () => {
    expect(computeTrustAtTime('HUMAN_DIRECT', 0)).toBe(100);
    expect(computeTrustAtTime('AI_ASSISTED', 0)).toBe(100);
    expect(computeTrustAtTime('AI_AUTONOMOUS', 0)).toBe(100);
  });

  it('at half-life, trust ≈ 50%', () => {
    for (const [mode, halfLife] of Object.entries(DECAY_RATES)) {
      expect(computeTrustAtTime(mode, halfLife)).toBeCloseTo(50, 1);
    }
  });
});

// ── Risk Velocity State Machine ─────────────────────────────────────────────

describe('AI Governance - Risk Velocity State Machine', () => {
  function computeState(velocity: number): string {
    if (velocity >= 90) return 'FROZEN';
    if (velocity >= 70) return 'INVALID';
    if (velocity >= 40) return 'DEGRADED';
    return 'VALID';
  }

  it('VALID → DEGRADED at 40', () => {
    let velocity = 0;
    expect(computeState(velocity)).toBe('VALID');

    // Add file accesses
    velocity += 15; // 15
    velocity += 15; // 30
    expect(computeState(velocity)).toBe('VALID');

    velocity += 10; // 40
    expect(computeState(velocity)).toBe('DEGRADED');
  });

  it('DEGRADED → INVALID at 70', () => {
    let velocity = 40;
    expect(computeState(velocity)).toBe('DEGRADED');

    velocity += 30; // 70
    expect(computeState(velocity)).toBe('INVALID');
  });

  it('INVALID → FROZEN at 90', () => {
    let velocity = 70;
    expect(computeState(velocity)).toBe('INVALID');

    velocity += 20; // 90
    expect(computeState(velocity)).toBe('FROZEN');
  });

  it('risk velocity capped at 100', () => {
    let velocity = 95;
    velocity = Math.min(100, velocity + 10);
    expect(velocity).toBe(100);
    expect(computeState(velocity)).toBe('FROZEN');
  });
});

// ── Protected Zone Violation Logic ──────────────────────────────────────────

describe('AI Governance - Protected Zone Violations', () => {
  function pathInsideZone(filePath: string, zone: { path: string; type: string }): boolean {
    if (zone.type === 'file') return filePath === zone.path;
    if (zone.type === 'directory') {
      return filePath === zone.path || filePath.startsWith(zone.path + '/');
    }
    return false;
  }

  it('file zone: exact match → true', () => {
    expect(pathInsideZone('/home/secret.key', { path: '/home/secret.key', type: 'file' })).toBe(true);
  });

  it('file zone: different file → false', () => {
    expect(pathInsideZone('/home/other.txt', { path: '/home/secret.key', type: 'file' })).toBe(false);
  });

  it('directory zone: file inside → true', () => {
    expect(pathInsideZone('/home/secrets/key.pem', { path: '/home/secrets', type: 'directory' })).toBe(true);
  });

  it('directory zone: file in subdirectory → true', () => {
    expect(pathInsideZone('/home/secrets/sub/deep/file.txt', { path: '/home/secrets', type: 'directory' })).toBe(true);
  });

  it('directory zone: file outside → false', () => {
    expect(pathInsideZone('/home/public/file.txt', { path: '/home/secrets', type: 'directory' })).toBe(false);
  });

  it('directory zone: exact directory path → true', () => {
    expect(pathInsideZone('/home/secrets', { path: '/home/secrets', type: 'directory' })).toBe(true);
  });

  it('multiple zones: first match wins', () => {
    const zones = [
      { path: '/home/secrets', type: 'directory', level: 'warn' },
      { path: '/home/secrets/critical', type: 'directory', level: 'freeze' },
    ];
    const filePath = '/home/secrets/critical/key.pem';
    const match = zones.find(z => pathInsideZone(filePath, z));
    expect(match).toBeDefined();
    expect(match!.level).toBe('warn'); // first match
  });

  it('protection levels: risk velocity impacts', () => {
    const impacts: Record<string, number> = { warn: 15, block: 30, freeze: 100 };

    let velocity = 0;
    velocity += impacts['warn'];
    expect(velocity).toBe(15);

    velocity += impacts['block'];
    expect(velocity).toBe(45);

    velocity = 0;
    velocity += impacts['freeze'];
    expect(velocity).toBeGreaterThanOrEqual(90); // auto-freeze threshold
  });
});
