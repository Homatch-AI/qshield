import { describe, it, expect } from 'vitest';
import {
  computeTrustScore,
  computeTrustLevel,
  buildTrustState,
  detectAnomaly,
  computeRunningAverage,
  computeDecayFactor,
  getBreatheDuration,
  computeTrustDimensions,
  computeCompositeScore,
  DEFAULT_TRUST_SCORER_CONFIG,
} from '../src/trust-scorer';
import type { TrustSignal, AdapterType, TrustLevel } from '../src/types';

function makeSignal(source: AdapterType, score: number, timestamp?: string): TrustSignal {
  return { source, score, weight: 1, timestamp: timestamp ?? new Date().toISOString(), metadata: {} };
}

// ── Trust Level Boundaries ──────────────────────────────────────────────────

describe('computeTrustLevel — boundary values', () => {
  it('score 100 → verified', () => {
    expect(computeTrustLevel(100)).toBe('verified');
  });

  it('score 90 → verified', () => {
    expect(computeTrustLevel(90)).toBe('verified');
  });

  it('score 89 → normal', () => {
    expect(computeTrustLevel(89)).toBe('normal');
  });

  it('score 70 → normal', () => {
    expect(computeTrustLevel(70)).toBe('normal');
  });

  it('score 69 → elevated', () => {
    expect(computeTrustLevel(69)).toBe('elevated');
  });

  it('score 50 → elevated', () => {
    expect(computeTrustLevel(50)).toBe('elevated');
  });

  it('score 49 → warning', () => {
    expect(computeTrustLevel(49)).toBe('warning');
  });

  it('score 30 → warning', () => {
    expect(computeTrustLevel(30)).toBe('warning');
  });

  it('score 29 → critical', () => {
    expect(computeTrustLevel(29)).toBe('critical');
  });

  it('score 0 → critical', () => {
    expect(computeTrustLevel(0)).toBe('critical');
  });

  it('score -10 → critical (clamping)', () => {
    expect(computeTrustLevel(-10)).toBe('critical');
  });

  it('score 150 → verified (clamping)', () => {
    expect(computeTrustLevel(150)).toBe('verified');
  });
});

// ── Breathing Animation Duration ────────────────────────────────────────────

describe('getBreatheDuration', () => {
  it('verified → 4s', () => {
    expect(getBreatheDuration('verified')).toBe(4);
  });

  it('normal → 3s', () => {
    expect(getBreatheDuration('normal')).toBe(3);
  });

  it('elevated → 2s', () => {
    expect(getBreatheDuration('elevated')).toBe(2);
  });

  it('warning → 1.5s', () => {
    expect(getBreatheDuration('warning')).toBe(1.5);
  });

  it('critical → 0.8s', () => {
    expect(getBreatheDuration('critical')).toBe(0.8);
  });
});

// ── Decay Factor ────────────────────────────────────────────────────────────

describe('computeDecayFactor', () => {
  const halfLifeMs = DEFAULT_TRUST_SCORER_CONFIG.decayHalfLifeMs; // 1 hour

  it('signal at t=0 → factor = 1.0', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    expect(computeDecayFactor(ts, now, halfLifeMs)).toBe(1);
  });

  it('signal at half-life → factor ≈ 0.5', () => {
    const now = Date.now();
    const ts = new Date(now - halfLifeMs).toISOString();
    expect(computeDecayFactor(ts, now, halfLifeMs)).toBeCloseTo(0.5, 5);
  });

  it('signal at 2× half-life → factor ≈ 0.25', () => {
    const now = Date.now();
    const ts = new Date(now - halfLifeMs * 2).toISOString();
    expect(computeDecayFactor(ts, now, halfLifeMs)).toBeCloseTo(0.25, 5);
  });

  it('future signal (negative age) → factor = 1.0', () => {
    const now = Date.now();
    const ts = new Date(now + 60000).toISOString();
    expect(computeDecayFactor(ts, now, halfLifeMs)).toBe(1);
  });
});

// ── Score Computation ───────────────────────────────────────────────────────

describe('computeTrustScore', () => {
  it('empty signals → 0', () => {
    expect(computeTrustScore([])).toBe(0);
  });

  it('single source signal → score equals signal score', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    const signals = [makeSignal('zoom', 80, ts)];
    // Single source: weight normalization makes it 100% of the score
    const score = computeTrustScore(signals, undefined, now);
    expect(score).toBe(80);
  });

  it('multiple sources → weighted average with normalization', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    const signals = [
      makeSignal('zoom', 100, ts),
      makeSignal('teams', 100, ts),
    ];
    const score = computeTrustScore(signals, undefined, now);
    // Both at 100, so average = 100 regardless of weights
    expect(score).toBe(100);
  });

  it('multiple sources with different scores → weighted combination', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    const signals = [
      makeSignal('zoom', 100, ts),
      makeSignal('teams', 0, ts),
    ];
    const score = computeTrustScore(signals, undefined, now);
    // zoom weight=0.18, teams weight=0.18 → normalized 50/50
    expect(score).toBe(50);
  });

  it('only latest signal per source is used', () => {
    const now = Date.now();
    const oldTs = new Date(now - 1000).toISOString();
    const newTs = new Date(now).toISOString();
    const signals = [
      makeSignal('zoom', 10, oldTs),  // older, should be ignored
      makeSignal('zoom', 90, newTs),  // newer, should be used
    ];
    const score = computeTrustScore(signals, undefined, now);
    expect(score).toBe(90);
  });

  it('signals older than maxSignalAgeMs are excluded', () => {
    const now = Date.now();
    const maxAge = DEFAULT_TRUST_SCORER_CONFIG.maxSignalAgeMs;
    const oldTs = new Date(now - maxAge - 1000).toISOString();
    const signals = [makeSignal('zoom', 80, oldTs)];
    const score = computeTrustScore(signals, undefined, now);
    expect(score).toBe(0);
  });

  it('custom weights override defaults', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    const signals = [
      makeSignal('zoom', 100, ts),
      makeSignal('email', 0, ts),
    ];
    // Make zoom weight 0, email weight 1 — score should be 0
    const score = computeTrustScore(signals, { weights: { zoom: 0, email: 1, teams: 0.18, file: 0.12, api: 0.12, crypto: 0.12, ai: 0.12 } }, now);
    expect(score).toBe(0);
  });

  it('score is always clamped to [0, 100]', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    const high = computeTrustScore([makeSignal('zoom', 200, ts)], undefined, now);
    expect(high).toBeLessThanOrEqual(100);
    const low = computeTrustScore([makeSignal('zoom', -50, ts)], undefined, now);
    expect(low).toBeGreaterThanOrEqual(0);
  });
});

// ── Anomaly Detection ───────────────────────────────────────────────────────

describe('detectAnomaly', () => {
  it('no history → no anomaly', () => {
    const result = detectAnomaly([], 50);
    expect(result.detected).toBe(false);
  });

  it('small drop within threshold → no anomaly', () => {
    const now = Date.now();
    const history = [{ score: 80, timestamp: now - 10000 }];
    const result = detectAnomaly(history, 70);
    expect(result.detected).toBe(false);
    expect(result.drop).toBe(10);
  });

  it('large drop exceeding threshold → anomaly detected', () => {
    const now = Date.now();
    const history = [{ score: 90, timestamp: now - 10000 }];
    const result = detectAnomaly(history, 40);
    expect(result.detected).toBe(true);
    expect(result.drop).toBe(50);
    expect(result.message).toContain('Anomaly detected');
    expect(result.message).toContain('50.0');
  });

  it('drop outside time window → no anomaly', () => {
    const now = Date.now();
    const windowMs = DEFAULT_TRUST_SCORER_CONFIG.anomalyWindowMs;
    const history = [{ score: 90, timestamp: now - windowMs - 10000 }];
    const result = detectAnomaly(history, 40);
    expect(result.detected).toBe(false);
  });

  it('score increase → no anomaly (drop is 0 or negative)', () => {
    const now = Date.now();
    const history = [{ score: 50, timestamp: now - 10000 }];
    const result = detectAnomaly(history, 90);
    expect(result.detected).toBe(false);
    expect(result.drop).toBe(0); // drop clamped to 0
  });
});

// ── Running Average ─────────────────────────────────────────────────────────

describe('computeRunningAverage', () => {
  it('empty history → 0', () => {
    expect(computeRunningAverage([])).toBe(0);
  });

  it('single value → that value', () => {
    expect(computeRunningAverage([75])).toBe(75);
  });

  it('3 values with window=5 → average of all 3', () => {
    const avg = computeRunningAverage([80, 70, 90], 5);
    expect(avg).toBe(80);
  });

  it('10 values with window=5 → average of last 5 only', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const avg = computeRunningAverage(values, 5);
    // Last 5: 60, 70, 80, 90, 100 → avg = 80
    expect(avg).toBe(80);
  });

  it('values outside [0,100] → clamped', () => {
    const avg = computeRunningAverage([200, 150], 5);
    // (200+150)/2 = 175 → clamped to 100
    expect(avg).toBe(100);
  });
});

// ── buildTrustState ─────────────────────────────────────────────────────────

describe('buildTrustState', () => {
  it('returns TrustState with score, level, signals, lastUpdated, sessionId', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    const signals = [makeSignal('zoom', 95, ts)];
    const state = buildTrustState(signals, 'session-123');

    expect(state).toHaveProperty('score');
    expect(state).toHaveProperty('level');
    expect(state).toHaveProperty('signals');
    expect(state).toHaveProperty('lastUpdated');
    expect(state).toHaveProperty('sessionId', 'session-123');
    expect(state.signals).toHaveLength(1);
    expect(typeof state.score).toBe('number');
    expect(typeof state.level).toBe('string');
  });

  it('deterministic score for same inputs', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    const signals = [makeSignal('zoom', 85, ts), makeSignal('email', 75, ts)];

    // Build trust dimensions directly to check determinism (buildTrustState uses Date.now internally for decay)
    const dims1 = computeTrustDimensions(signals, undefined, now);
    const dims2 = computeTrustDimensions(signals, undefined, now);
    expect(dims1).toEqual(dims2);

    const score1 = computeCompositeScore(dims1);
    const score2 = computeCompositeScore(dims2);
    expect(score1).toBe(score2);
  });
});

// ── Trust Dimensions ────────────────────────────────────────────────────────

describe('computeTrustDimensions', () => {
  it('no signals → all dimensions default to 100', () => {
    const dims = computeTrustDimensions([]);
    expect(dims.temporal).toBe(100);
    expect(dims.contextual).toBe(100);
    expect(dims.cryptographic).toBe(100);
    expect(dims.spatial).toBe(100);
    expect(dims.behavioral).toBe(100);
  });

  it('email signal maps to temporal dimension', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    const signals = [makeSignal('email', 40, ts)];
    const dims = computeTrustDimensions(signals, undefined, now);
    expect(dims.temporal).toBe(40);
    // Others stay at 100
    expect(dims.contextual).toBe(100);
  });

  it('zoom/teams signals map to contextual dimension', () => {
    const now = Date.now();
    const ts = new Date(now).toISOString();
    const signals = [makeSignal('zoom', 60, ts), makeSignal('teams', 80, ts)];
    const dims = computeTrustDimensions(signals, undefined, now);
    // Average of 60 and 80 = 70
    expect(dims.contextual).toBe(70);
  });
});
