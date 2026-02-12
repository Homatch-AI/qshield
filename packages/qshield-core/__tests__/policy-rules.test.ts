import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluatePolicy,
  createDefaultPolicy,
} from '../src/policy-rules';
import type { PolicyConfig, PolicyRule, TrustState, TrustSignal } from '../src/types';

function makeTrustState(signals: TrustSignal[], score?: number): TrustState {
  return {
    score: score ?? 50,
    level: 'elevated',
    signals,
    lastUpdated: new Date().toISOString(),
    sessionId: 'test-session',
  };
}

function makeSignal(source: TrustSignal['source'], score: number, timestamp?: string): TrustSignal {
  return {
    source,
    score,
    weight: 1,
    timestamp: timestamp ?? new Date().toISOString(),
    metadata: {},
  };
}

function makeRule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: 'rule-1',
    name: 'Test rule',
    condition: { signal: 'zoom', operator: 'lt', threshold: 50 },
    action: 'alert',
    severity: 'high',
    enabled: true,
    ...overrides,
  };
}

function makePolicy(overrides: Partial<PolicyConfig> = {}): PolicyConfig {
  return {
    rules: [],
    escalation: { channels: [], cooldownMinutes: 15 },
    autoFreeze: { enabled: false, trustScoreThreshold: 20, durationMinutes: 30 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// evaluateCondition
// ---------------------------------------------------------------------------

describe('evaluateCondition', () => {
  it('evaluates "lt" correctly', () => {
    expect(evaluateCondition('lt', 10, 20)).toBe(true);
    expect(evaluateCondition('lt', 20, 20)).toBe(false);
    expect(evaluateCondition('lt', 30, 20)).toBe(false);
  });

  it('evaluates "lte" correctly', () => {
    expect(evaluateCondition('lte', 10, 20)).toBe(true);
    expect(evaluateCondition('lte', 20, 20)).toBe(true);
    expect(evaluateCondition('lte', 30, 20)).toBe(false);
  });

  it('evaluates "gt" correctly', () => {
    expect(evaluateCondition('gt', 30, 20)).toBe(true);
    expect(evaluateCondition('gt', 20, 20)).toBe(false);
    expect(evaluateCondition('gt', 10, 20)).toBe(false);
  });

  it('evaluates "gte" correctly', () => {
    expect(evaluateCondition('gte', 30, 20)).toBe(true);
    expect(evaluateCondition('gte', 20, 20)).toBe(true);
    expect(evaluateCondition('gte', 10, 20)).toBe(false);
  });

  it('evaluates "eq" correctly', () => {
    expect(evaluateCondition('eq', 20, 20)).toBe(true);
    expect(evaluateCondition('eq', 10, 20)).toBe(false);
    expect(evaluateCondition('eq', 30, 20)).toBe(false);
  });

  it('returns false for unknown operator', () => {
    expect(evaluateCondition('unknown' as PolicyRule['condition']['operator'], 10, 20)).toBe(false);
  });

  it('handles zero values', () => {
    expect(evaluateCondition('eq', 0, 0)).toBe(true);
    expect(evaluateCondition('gte', 0, 0)).toBe(true);
    expect(evaluateCondition('lte', 0, 0)).toBe(true);
    expect(evaluateCondition('gt', 0, 0)).toBe(false);
    expect(evaluateCondition('lt', 0, 0)).toBe(false);
  });

  it('handles negative values', () => {
    expect(evaluateCondition('lt', -5, 0)).toBe(true);
    expect(evaluateCondition('gt', 0, -5)).toBe(true);
  });

  it('handles floating point values', () => {
    expect(evaluateCondition('lt', 49.9, 50)).toBe(true);
    expect(evaluateCondition('gte', 50.0, 50)).toBe(true);
    expect(evaluateCondition('gt', 50.1, 50)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// evaluatePolicy
// ---------------------------------------------------------------------------

describe('evaluatePolicy', () => {
  it('returns empty results when no rules match', () => {
    const policy = makePolicy({
      rules: [makeRule({ condition: { signal: 'zoom', operator: 'lt', threshold: 30 } })],
    });
    const state = makeTrustState([makeSignal('zoom', 80)]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
    expect(result.shouldFreeze).toBe(false);
    expect(result.shouldEscalate).toBe(false);
  });

  it('triggers alert rules', () => {
    const policy = makePolicy({
      rules: [makeRule({ name: 'Low zoom trust', condition: { signal: 'zoom', operator: 'lt', threshold: 50 } })],
    });
    const state = makeTrustState([makeSignal('zoom', 30)]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(1);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].severity).toBe('high');
    expect(result.alerts[0].title).toContain('Low zoom trust');
  });

  it('alert has correct structure', () => {
    const policy = makePolicy({
      rules: [makeRule({ name: 'Test alert' })],
    });
    const state = makeTrustState([makeSignal('zoom', 30)]);
    const result = evaluatePolicy(policy, state);
    const alert = result.alerts[0];

    expect(alert.id).toBeTruthy();
    expect(alert.severity).toBe('high');
    expect(alert.title).toContain('Test alert');
    expect(alert.description).toBeTruthy();
    expect(alert.source).toBe('zoom');
    expect(alert.timestamp).toBeTruthy();
    expect(alert.dismissed).toBe(false);
  });

  it('triggers escalation rules', () => {
    const policy = makePolicy({
      rules: [makeRule({ action: 'escalate', severity: 'critical', condition: { signal: 'zoom', operator: 'lt', threshold: 20 } })],
    });
    const state = makeTrustState([makeSignal('zoom', 10)]);
    const result = evaluatePolicy(policy, state);

    expect(result.shouldEscalate).toBe(true);
  });

  it('triggers freeze rules', () => {
    const policy = makePolicy({
      rules: [makeRule({ action: 'freeze', severity: 'critical', condition: { signal: 'zoom', operator: 'lt', threshold: 15 } })],
    });
    const state = makeTrustState([makeSignal('zoom', 5)]);
    const result = evaluatePolicy(policy, state);

    expect(result.shouldFreeze).toBe(true);
  });

  it('skips disabled rules', () => {
    const policy = makePolicy({
      rules: [makeRule({ enabled: false, condition: { signal: 'zoom', operator: 'lt', threshold: 100 } })],
    });
    const state = makeTrustState([makeSignal('zoom', 50)]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(0);
  });

  it('skips rules for sources with no signals', () => {
    const policy = makePolicy({
      rules: [makeRule({ condition: { signal: 'teams', operator: 'lt', threshold: 50 } })],
    });
    const state = makeTrustState([makeSignal('zoom', 30)]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(0);
  });

  it('triggers auto-freeze when score below threshold', () => {
    const policy = makePolicy({
      autoFreeze: { enabled: true, trustScoreThreshold: 30, durationMinutes: 30 },
    });
    const state = makeTrustState([], 15);
    const result = evaluatePolicy(policy, state);

    expect(result.shouldFreeze).toBe(true);
  });

  it('does not auto-freeze when disabled', () => {
    const policy = makePolicy({
      autoFreeze: { enabled: false, trustScoreThreshold: 30, durationMinutes: 30 },
    });
    const state = makeTrustState([], 15);
    const result = evaluatePolicy(policy, state);

    expect(result.shouldFreeze).toBe(false);
  });

  it('does not auto-freeze when score is above threshold', () => {
    const policy = makePolicy({
      autoFreeze: { enabled: true, trustScoreThreshold: 30, durationMinutes: 30 },
    });
    const state = makeTrustState([], 50);
    const result = evaluatePolicy(policy, state);

    expect(result.shouldFreeze).toBe(false);
  });

  it('evaluates multiple rules and triggers all that match', () => {
    const policy = makePolicy({
      rules: [
        makeRule({ id: 'r1', name: 'Rule 1', condition: { signal: 'zoom', operator: 'lt', threshold: 50 } }),
        makeRule({ id: 'r2', name: 'Rule 2', condition: { signal: 'zoom', operator: 'lt', threshold: 40 } }),
        makeRule({ id: 'r3', name: 'Rule 3 (no match)', condition: { signal: 'zoom', operator: 'lt', threshold: 10 } }),
      ],
    });
    const state = makeTrustState([makeSignal('zoom', 25)]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(2);
    expect(result.alerts).toHaveLength(2);
  });

  it('handles empty ruleset without errors', () => {
    const policy = makePolicy({ rules: [] });
    const state = makeTrustState([makeSignal('zoom', 50)]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
    expect(result.shouldFreeze).toBe(false);
    expect(result.shouldEscalate).toBe(false);
  });

  it('uses the latest signal when multiple exist for a source', () => {
    const policy = makePolicy({
      rules: [makeRule({ condition: { signal: 'zoom', operator: 'lt', threshold: 50 } })],
    });
    const state = makeTrustState([
      makeSignal('zoom', 20, '2024-01-01T00:00:00Z'),
      makeSignal('zoom', 80, '2024-01-02T00:00:00Z'),
    ]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(0);
  });

  it('generates unique alert IDs', () => {
    const policy = makePolicy({
      rules: [
        makeRule({ id: 'r1', condition: { signal: 'zoom', operator: 'lt', threshold: 50 } }),
        makeRule({ id: 'r2', condition: { signal: 'zoom', operator: 'lt', threshold: 60 } }),
      ],
    });
    const state = makeTrustState([makeSignal('zoom', 30)]);
    const result = evaluatePolicy(policy, state);

    const ids = result.alerts.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('freeze from both rule and auto-freeze', () => {
    const policy = makePolicy({
      rules: [makeRule({ action: 'freeze', condition: { signal: 'zoom', operator: 'lt', threshold: 50 } })],
      autoFreeze: { enabled: true, trustScoreThreshold: 30, durationMinutes: 30 },
    });
    const state = makeTrustState([makeSignal('zoom', 10)], 10);
    const result = evaluatePolicy(policy, state);

    expect(result.shouldFreeze).toBe(true);
  });

  it('escalate and freeze can both be true', () => {
    const policy = makePolicy({
      rules: [
        makeRule({ id: 'r1', action: 'escalate', condition: { signal: 'zoom', operator: 'lt', threshold: 50 } }),
        makeRule({ id: 'r2', action: 'freeze', condition: { signal: 'teams', operator: 'lt', threshold: 50 } }),
      ],
    });
    const state = makeTrustState([makeSignal('zoom', 10), makeSignal('teams', 10)]);
    const result = evaluatePolicy(policy, state);

    expect(result.shouldEscalate).toBe(true);
    expect(result.shouldFreeze).toBe(true);
  });

  it('evaluates rules across different adapter sources', () => {
    const policy = makePolicy({
      rules: [
        makeRule({ id: 'r1', condition: { signal: 'zoom', operator: 'lt', threshold: 50 } }),
        makeRule({ id: 'r2', condition: { signal: 'email', operator: 'lt', threshold: 40 } }),
        makeRule({ id: 'r3', condition: { signal: 'teams', operator: 'gt', threshold: 80 } }),
      ],
    });
    const state = makeTrustState([
      makeSignal('zoom', 30),
      makeSignal('email', 50),
      makeSignal('teams', 90),
    ]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(2);
    expect(result.triggeredRules.map(r => r.id)).toContain('r1');
    expect(result.triggeredRules.map(r => r.id)).toContain('r3');
  });

  it('alert description includes signal details', () => {
    const policy = makePolicy({
      rules: [makeRule({ condition: { signal: 'zoom', operator: 'lt', threshold: 50 } })],
    });
    const state = makeTrustState([makeSignal('zoom', 25)]);
    const result = evaluatePolicy(policy, state);

    expect(result.alerts[0].description).toContain('zoom');
    expect(result.alerts[0].description).toContain('25');
    expect(result.alerts[0].description).toContain('lt');
    expect(result.alerts[0].description).toContain('50');
  });
});

// ---------------------------------------------------------------------------
// createDefaultPolicy
// ---------------------------------------------------------------------------

describe('createDefaultPolicy', () => {
  it('creates a valid default policy', () => {
    const policy = createDefaultPolicy();

    expect(policy.rules.length).toBeGreaterThan(0);
    expect(policy.escalation).toBeDefined();
    expect(policy.autoFreeze).toBeDefined();
    expect(policy.autoFreeze.enabled).toBe(true);
  });

  it('all rules have valid structure', () => {
    const policy = createDefaultPolicy();
    for (const rule of policy.rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(['lt', 'lte', 'gt', 'gte', 'eq']).toContain(rule.condition.operator);
      expect(typeof rule.condition.threshold).toBe('number');
      expect(['alert', 'escalate', 'freeze']).toContain(rule.action);
      expect(typeof rule.enabled).toBe('boolean');
      expect(['critical', 'high', 'medium', 'low']).toContain(rule.severity);
    }
  });

  it('all default rules are enabled', () => {
    const policy = createDefaultPolicy();
    for (const rule of policy.rules) {
      expect(rule.enabled).toBe(true);
    }
  });

  it('has unique rule IDs', () => {
    const policy = createDefaultPolicy();
    const ids = policy.rules.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('escalation config has valid structure', () => {
    const policy = createDefaultPolicy();
    expect(Array.isArray(policy.escalation.channels)).toBe(true);
    expect(typeof policy.escalation.cooldownMinutes).toBe('number');
    expect(policy.escalation.cooldownMinutes).toBeGreaterThan(0);
  });

  it('auto-freeze config has valid structure', () => {
    const policy = createDefaultPolicy();
    expect(typeof policy.autoFreeze.enabled).toBe('boolean');
    expect(typeof policy.autoFreeze.trustScoreThreshold).toBe('number');
    expect(typeof policy.autoFreeze.durationMinutes).toBe('number');
    expect(policy.autoFreeze.durationMinutes).toBeGreaterThan(0);
  });
});
