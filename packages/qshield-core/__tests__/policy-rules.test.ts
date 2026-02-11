import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  evaluatePolicy,
  createDefaultPolicy,
} from '../src/policy-rules';
import type { PolicyConfig, TrustState, TrustSignal } from '../src/types';

function makeTrustState(signals: TrustSignal[]): TrustState {
  return {
    score: 50,
    level: 'elevated',
    signals,
    lastUpdated: new Date().toISOString(),
    sessionId: 'test-session',
  };
}

function makeSignal(source: TrustSignal['source'], score: number): TrustSignal {
  return {
    source,
    score,
    weight: 1,
    timestamp: new Date().toISOString(),
    metadata: {},
  };
}

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
  });
});

describe('evaluatePolicy', () => {
  it('returns empty results when no rules match', () => {
    const policy: PolicyConfig = {
      rules: [
        {
          id: '1',
          name: 'test',
          condition: { signal: 'zoom', operator: 'lt', threshold: 30 },
          action: 'alert',
          severity: 'high',
          enabled: true,
        },
      ],
      escalation: { channels: [], cooldownMinutes: 15 },
      autoFreeze: { enabled: false, trustScoreThreshold: 20, durationMinutes: 30 },
    };

    const state = makeTrustState([makeSignal('zoom', 80)]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
    expect(result.shouldFreeze).toBe(false);
    expect(result.shouldEscalate).toBe(false);
  });

  it('triggers alert rules', () => {
    const policy: PolicyConfig = {
      rules: [
        {
          id: '1',
          name: 'Low zoom trust',
          condition: { signal: 'zoom', operator: 'lt', threshold: 50 },
          action: 'alert',
          severity: 'high',
          enabled: true,
        },
      ],
      escalation: { channels: [], cooldownMinutes: 15 },
      autoFreeze: { enabled: false, trustScoreThreshold: 20, durationMinutes: 30 },
    };

    const state = makeTrustState([makeSignal('zoom', 30)]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(1);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].severity).toBe('high');
    expect(result.alerts[0].title).toContain('Low zoom trust');
  });

  it('triggers escalation rules', () => {
    const policy: PolicyConfig = {
      rules: [
        {
          id: '1',
          name: 'Critical',
          condition: { signal: 'zoom', operator: 'lt', threshold: 20 },
          action: 'escalate',
          severity: 'critical',
          enabled: true,
        },
      ],
      escalation: { channels: ['webhook'], cooldownMinutes: 15 },
      autoFreeze: { enabled: false, trustScoreThreshold: 20, durationMinutes: 30 },
    };

    const state = makeTrustState([makeSignal('zoom', 10)]);
    const result = evaluatePolicy(policy, state);

    expect(result.shouldEscalate).toBe(true);
  });

  it('triggers freeze rules', () => {
    const policy: PolicyConfig = {
      rules: [
        {
          id: '1',
          name: 'Freeze',
          condition: { signal: 'zoom', operator: 'lt', threshold: 15 },
          action: 'freeze',
          severity: 'critical',
          enabled: true,
        },
      ],
      escalation: { channels: [], cooldownMinutes: 15 },
      autoFreeze: { enabled: false, trustScoreThreshold: 20, durationMinutes: 30 },
    };

    const state = makeTrustState([makeSignal('zoom', 5)]);
    const result = evaluatePolicy(policy, state);

    expect(result.shouldFreeze).toBe(true);
  });

  it('skips disabled rules', () => {
    const policy: PolicyConfig = {
      rules: [
        {
          id: '1',
          name: 'Disabled rule',
          condition: { signal: 'zoom', operator: 'lt', threshold: 100 },
          action: 'alert',
          severity: 'high',
          enabled: false,
        },
      ],
      escalation: { channels: [], cooldownMinutes: 15 },
      autoFreeze: { enabled: false, trustScoreThreshold: 20, durationMinutes: 30 },
    };

    const state = makeTrustState([makeSignal('zoom', 50)]);
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(0);
  });

  it('skips rules for sources with no signals', () => {
    const policy: PolicyConfig = {
      rules: [
        {
          id: '1',
          name: 'Teams rule',
          condition: { signal: 'teams', operator: 'lt', threshold: 50 },
          action: 'alert',
          severity: 'medium',
          enabled: true,
        },
      ],
      escalation: { channels: [], cooldownMinutes: 15 },
      autoFreeze: { enabled: false, trustScoreThreshold: 20, durationMinutes: 30 },
    };

    const state = makeTrustState([makeSignal('zoom', 30)]); // No teams signal
    const result = evaluatePolicy(policy, state);

    expect(result.triggeredRules).toHaveLength(0);
  });

  it('triggers auto-freeze when score below threshold', () => {
    const policy: PolicyConfig = {
      rules: [],
      escalation: { channels: [], cooldownMinutes: 15 },
      autoFreeze: { enabled: true, trustScoreThreshold: 30, durationMinutes: 30 },
    };

    const state = makeTrustState([]);
    state.score = 15;
    const result = evaluatePolicy(policy, state);

    expect(result.shouldFreeze).toBe(true);
  });

  it('does not auto-freeze when disabled', () => {
    const policy: PolicyConfig = {
      rules: [],
      escalation: { channels: [], cooldownMinutes: 15 },
      autoFreeze: { enabled: false, trustScoreThreshold: 30, durationMinutes: 30 },
    };

    const state = makeTrustState([]);
    state.score = 15;
    const result = evaluatePolicy(policy, state);

    expect(result.shouldFreeze).toBe(false);
  });
});

describe('createDefaultPolicy', () => {
  it('creates a valid default policy', () => {
    const policy = createDefaultPolicy();

    expect(policy.rules.length).toBeGreaterThan(0);
    expect(policy.escalation).toBeDefined();
    expect(policy.autoFreeze).toBeDefined();
    expect(policy.autoFreeze.enabled).toBe(true);

    // All rules should have valid structure
    for (const rule of policy.rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.name).toBeTruthy();
      expect(rule.condition.signal).toBeTruthy();
      expect(rule.condition.operator).toBeTruthy();
      expect(typeof rule.condition.threshold).toBe('number');
      expect(['alert', 'escalate', 'freeze']).toContain(rule.action);
      expect(rule.enabled).toBe(true);
    }
  });
});
