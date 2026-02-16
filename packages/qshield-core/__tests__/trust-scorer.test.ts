import { describe, it, expect } from 'vitest';
import {
  computeTrustScore,
  computeTrustLevel,
  buildTrustState,
  getBreatheDuration,
  computeDecayFactor,
  detectAnomaly,
  computeRunningAverage,
  computeTrustDimensions,
  computeCompositeScore,
  DEFAULT_TRUST_SCORER_CONFIG,
  ADAPTER_DIMENSION_MAP,
} from '../src/trust-scorer';
import type { TrustLevel, TrustSignal, TrustDimensionKey } from '../src/types';
import { TRUST_DIMENSION_KEYS } from '../src/types';

const NOW = Date.now();

function makeSignal(
  source: TrustSignal['source'],
  score: number,
  timestamp?: string,
): TrustSignal {
  return {
    source,
    score,
    weight: 1,
    timestamp: timestamp ?? new Date(NOW).toISOString(),
    metadata: {},
  };
}

// ---------------------------------------------------------------------------
// computeTrustLevel
// ---------------------------------------------------------------------------

describe('computeTrustLevel', () => {
  it('returns verified for scores >= 90', () => {
    expect(computeTrustLevel(100)).toBe('verified');
    expect(computeTrustLevel(95)).toBe('verified');
    expect(computeTrustLevel(90)).toBe('verified');
  });

  it('returns normal for scores 70-89', () => {
    expect(computeTrustLevel(89)).toBe('normal');
    expect(computeTrustLevel(80)).toBe('normal');
    expect(computeTrustLevel(70)).toBe('normal');
  });

  it('returns elevated for scores 50-69', () => {
    expect(computeTrustLevel(69)).toBe('elevated');
    expect(computeTrustLevel(60)).toBe('elevated');
    expect(computeTrustLevel(50)).toBe('elevated');
  });

  it('returns warning for scores 30-49', () => {
    expect(computeTrustLevel(49)).toBe('warning');
    expect(computeTrustLevel(40)).toBe('warning');
    expect(computeTrustLevel(30)).toBe('warning');
  });

  it('returns critical for scores 0-29', () => {
    expect(computeTrustLevel(29)).toBe('critical');
    expect(computeTrustLevel(15)).toBe('critical');
    expect(computeTrustLevel(0)).toBe('critical');
  });

  it('clamps values above 100 to verified', () => {
    expect(computeTrustLevel(150)).toBe('verified');
    expect(computeTrustLevel(999)).toBe('verified');
  });

  it('clamps negative values to critical', () => {
    expect(computeTrustLevel(-10)).toBe('critical');
    expect(computeTrustLevel(-999)).toBe('critical');
  });

  it('handles exact boundary values', () => {
    expect(computeTrustLevel(90)).toBe('verified');
    expect(computeTrustLevel(89.99)).toBe('normal');
    expect(computeTrustLevel(70)).toBe('normal');
    expect(computeTrustLevel(69.99)).toBe('elevated');
    expect(computeTrustLevel(50)).toBe('elevated');
    expect(computeTrustLevel(49.99)).toBe('warning');
    expect(computeTrustLevel(30)).toBe('warning');
    expect(computeTrustLevel(29.99)).toBe('critical');
  });

  it('covers every TrustLevel value', () => {
    const levels: TrustLevel[] = ['critical', 'warning', 'elevated', 'normal', 'verified'];
    const scores = [10, 35, 55, 75, 95];
    scores.forEach((s, i) => {
      expect(computeTrustLevel(s)).toBe(levels[i]);
    });
  });
});

// ---------------------------------------------------------------------------
// computeDecayFactor
// ---------------------------------------------------------------------------

describe('computeDecayFactor', () => {
  it('returns 1 for signals at current time', () => {
    const ts = new Date(NOW).toISOString();
    expect(computeDecayFactor(ts, NOW, 3600000)).toBe(1);
  });

  it('returns 0.5 at exactly one half-life', () => {
    const halfLife = 3600000; // 1 hour
    const ts = new Date(NOW - halfLife).toISOString();
    expect(computeDecayFactor(ts, NOW, halfLife)).toBeCloseTo(0.5, 5);
  });

  it('returns ~0.25 at two half-lives', () => {
    const halfLife = 3600000;
    const ts = new Date(NOW - 2 * halfLife).toISOString();
    expect(computeDecayFactor(ts, NOW, halfLife)).toBeCloseTo(0.25, 5);
  });

  it('returns 1 for future timestamps', () => {
    const ts = new Date(NOW + 60000).toISOString();
    expect(computeDecayFactor(ts, NOW, 3600000)).toBe(1);
  });

  it('decays towards 0 for very old signals', () => {
    const ts = new Date(NOW - 100 * 3600000).toISOString();
    expect(computeDecayFactor(ts, NOW, 3600000)).toBeLessThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// computeTrustScore
// ---------------------------------------------------------------------------

describe('computeTrustScore', () => {
  it('returns 0 for empty signals', () => {
    expect(computeTrustScore([])).toBe(0);
  });

  it('returns the signal score for a single source (current timestamp)', () => {
    const signals = [makeSignal('zoom', 80)];
    expect(computeTrustScore(signals, undefined, NOW)).toBe(80);
  });

  it('returns 0 when the only signal has score 0', () => {
    expect(computeTrustScore([makeSignal('zoom', 0)], undefined, NOW)).toBe(0);
  });

  it('returns 100 when the only signal has score 100', () => {
    expect(computeTrustScore([makeSignal('zoom', 100)], undefined, NOW)).toBe(100);
  });

  it('computes weighted average for all six sources at max', () => {
    const signals = [
      makeSignal('zoom', 100),
      makeSignal('teams', 100),
      makeSignal('email', 100),
      makeSignal('file', 100),
      makeSignal('api', 100),
      makeSignal('crypto', 100),
    ];
    expect(computeTrustScore(signals, undefined, NOW)).toBe(100);
  });

  it('computes weighted average for all six sources at zero', () => {
    const signals = [
      makeSignal('zoom', 0),
      makeSignal('teams', 0),
      makeSignal('email', 0),
      makeSignal('file', 0),
      makeSignal('api', 0),
      makeSignal('crypto', 0),
    ];
    expect(computeTrustScore(signals, undefined, NOW)).toBe(0);
  });

  it('normalizes weights to active sources only', () => {
    const signals = [makeSignal('zoom', 60), makeSignal('teams', 80)];
    expect(computeTrustScore(signals, undefined, NOW)).toBe(70);
  });

  it('uses the latest signal per source', () => {
    const ts1 = new Date(NOW - 2000).toISOString();
    const ts2 = new Date(NOW).toISOString();
    const signals = [
      makeSignal('zoom', 50, ts1),
      makeSignal('zoom', 90, ts2),
    ];
    expect(computeTrustScore(signals, undefined, NOW)).toBe(90);
  });

  it('uses the latest signal when many signals share a source', () => {
    const signals = [
      makeSignal('zoom', 10, new Date(NOW - 4000).toISOString()),
      makeSignal('zoom', 20, new Date(NOW - 3000).toISOString()),
      makeSignal('zoom', 30, new Date(NOW - 2000).toISOString()),
      makeSignal('zoom', 99, new Date(NOW).toISOString()),
    ];
    expect(computeTrustScore(signals, undefined, NOW)).toBe(99);
  });

  it('supports custom weights via config', () => {
    const signals = [makeSignal('zoom', 100), makeSignal('teams', 0)];
    const score = computeTrustScore(signals, { weights: { zoom: 0.75, teams: 0.25, email: 0.2, file: 0.15, api: 0.15 } }, NOW);
    expect(score).toBe(75);
  });

  it('works when custom weights do not sum to 1', () => {
    const signals = [makeSignal('zoom', 80), makeSignal('teams', 40)];
    const score = computeTrustScore(signals, { weights: { zoom: 2, teams: 3, email: 0.2, file: 0.15, api: 0.15 } }, NOW);
    // zoom: 2/(2+3)=0.4, teams: 3/(2+3)=0.6 => 80*0.4+40*0.6 = 32+24 = 56
    expect(score).toBe(56);
  });

  it('clamps score to at most 100', () => {
    const signals = [makeSignal('zoom', 200)];
    expect(computeTrustScore(signals, undefined, NOW)).toBeLessThanOrEqual(100);
  });

  it('clamps score to at least 0', () => {
    const signals = [makeSignal('zoom', -50)];
    expect(computeTrustScore(signals, undefined, NOW)).toBeGreaterThanOrEqual(0);
  });

  it('always returns a number in [0, 100]', () => {
    const cases = [0, 1, 50, 99, 100, 150, -10];
    for (const val of cases) {
      const score = computeTrustScore([makeSignal('zoom', val)], undefined, NOW);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('filters out signals older than maxSignalAgeMs', () => {
    const oldTs = new Date(NOW - 5 * 60 * 60 * 1000).toISOString(); // 5 hours ago
    const signals = [makeSignal('zoom', 80, oldTs)];
    // Default maxSignalAgeMs is 4 hours, so this should be filtered
    expect(computeTrustScore(signals, undefined, NOW)).toBe(0);
  });

  it('signals within maxSignalAgeMs are included', () => {
    const recentTs = new Date(NOW - 1000).toISOString();
    const signals = [makeSignal('zoom', 80, recentTs)];
    const score = computeTrustScore(signals, undefined, NOW);
    expect(score).toBeGreaterThan(0);
  });

  it('applies decay to older signals', () => {
    const freshTs = new Date(NOW).toISOString();
    const olderTs = new Date(NOW - 2 * 60 * 60 * 1000).toISOString(); // 2 hours ago

    const freshScore = computeTrustScore([makeSignal('zoom', 80, freshTs)], undefined, NOW);
    const olderScore = computeTrustScore([makeSignal('zoom', 80, olderTs)], undefined, NOW);

    expect(freshScore).toBeGreaterThan(olderScore);
  });

  it('handles 100 signals across multiple sources', () => {
    const sources: TrustSignal['source'][] = ['zoom', 'teams', 'email', 'file', 'api', 'crypto'];
    const signals: TrustSignal[] = [];
    for (let i = 0; i < 100; i++) {
      const source = sources[i % sources.length];
      const ts = new Date(NOW - i * 100).toISOString(); // spread over 10s
      signals.push(makeSignal(source, 70, ts));
    }
    const score = computeTrustScore(signals, undefined, NOW);
    // All latest signals have score 70, decay should be negligible over 10s
    expect(score).toBeCloseTo(70, 0);
  });
});

// ---------------------------------------------------------------------------
// detectAnomaly
// ---------------------------------------------------------------------------

describe('detectAnomaly', () => {
  it('returns no anomaly when history is empty', () => {
    const result = detectAnomaly([], 50);
    expect(result.detected).toBe(false);
  });

  it('detects large score drop within window', () => {
    const history = [
      { score: 85, timestamp: Date.now() - 60000 },
      { score: 80, timestamp: Date.now() - 30000 },
    ];
    const result = detectAnomaly(history, 45); // drop of 40
    expect(result.detected).toBe(true);
    expect(result.drop).toBeGreaterThanOrEqual(30);
  });

  it('no anomaly for small drop', () => {
    const history = [
      { score: 70, timestamp: Date.now() - 60000 },
    ];
    const result = detectAnomaly(history, 60); // drop of 10
    expect(result.detected).toBe(false);
  });

  it('ignores history outside the window', () => {
    const history = [
      { score: 95, timestamp: Date.now() - 10 * 60 * 1000 }, // 10 min ago, outside 5 min window
    ];
    const result = detectAnomaly(history, 20);
    expect(result.detected).toBe(false);
  });

  it('custom threshold changes detection sensitivity', () => {
    const history = [
      { score: 60, timestamp: Date.now() - 60000 },
    ];
    // Drop of 20 — default threshold is 30, should not trigger
    const result1 = detectAnomaly(history, 40);
    expect(result1.detected).toBe(false);

    // With threshold of 10, should trigger
    const result2 = detectAnomaly(history, 40, { anomalyDropThreshold: 10 });
    expect(result2.detected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeRunningAverage
// ---------------------------------------------------------------------------

describe('computeRunningAverage', () => {
  it('returns 0 for empty history', () => {
    expect(computeRunningAverage([])).toBe(0);
  });

  it('returns the single value for one-element history', () => {
    expect(computeRunningAverage([75])).toBe(75);
  });

  it('averages the last N scores', () => {
    const scores = [60, 70, 80, 90, 100];
    // Default window is 5, average = (60+70+80+90+100)/5 = 80
    expect(computeRunningAverage(scores)).toBe(80);
  });

  it('uses only the most recent window entries', () => {
    const scores = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    // Window of 3 → last 3: 80, 90, 100 → average = 90
    expect(computeRunningAverage(scores, 3)).toBe(90);
  });

  it('clamps result to [0, 100]', () => {
    expect(computeRunningAverage([150, 200])).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// buildTrustState
// ---------------------------------------------------------------------------

describe('buildTrustState', () => {
  it('builds a complete trust state with dimensions', () => {
    const signals = [makeSignal('zoom', 85)];
    const state = buildTrustState(signals, 'session-1');
    expect(state.score).toBeGreaterThan(0);
    expect(state.level).toBeDefined();
    expect(state.sessionId).toBe('session-1');
    expect(state.signals).toEqual(signals);
    expect(state.lastUpdated).toBeTruthy();
    expect(state.dimensions).toBeDefined();
    for (const key of TRUST_DIMENSION_KEYS) {
      expect(state.dimensions[key]).toBeTypeOf('number');
    }
  });

  it('builds critical state for low scores across all dimensions', () => {
    const signals = [
      makeSignal('zoom', 10),   // contextual
      makeSignal('email', 10),  // temporal
      makeSignal('file', 10),   // cryptographic
      makeSignal('api', 10),    // spatial
      makeSignal('crypto', 10), // behavioral
    ];
    const state = buildTrustState(signals, 'session-2');
    expect(state.level).toBe('critical');
  });

  it('builds state with empty signals — dimensions default to 100', () => {
    const state = buildTrustState([], 'session-4');
    expect(state.score).toBe(100);
    expect(state.level).toBe('verified');
    expect(state.signals).toEqual([]);
    for (const key of TRUST_DIMENSION_KEYS) {
      expect(state.dimensions[key]).toBe(100);
    }
  });

  it('returns ISO 8601 lastUpdated', () => {
    const state = buildTrustState([makeSignal('zoom', 50)], 's');
    expect(() => new Date(state.lastUpdated)).not.toThrow();
    expect(new Date(state.lastUpdated).toISOString()).toBe(state.lastUpdated);
  });

  it('preserves all signals in the state', () => {
    const signals = [
      makeSignal('zoom', 80),
      makeSignal('teams', 60),
      makeSignal('email', 40),
    ];
    const state = buildTrustState(signals, 's');
    expect(state.signals).toHaveLength(3);
    expect(state.signals).toBe(signals);
  });

  it('dimensions object has all 5 keys', () => {
    const signals = [makeSignal('zoom', 80), makeSignal('email', 60)];
    const state = buildTrustState(signals, 'session-5');
    expect(Object.keys(state.dimensions)).toHaveLength(5);
    expect(state.dimensions).toHaveProperty('temporal');
    expect(state.dimensions).toHaveProperty('contextual');
    expect(state.dimensions).toHaveProperty('cryptographic');
    expect(state.dimensions).toHaveProperty('spatial');
    expect(state.dimensions).toHaveProperty('behavioral');
  });
});

// ---------------------------------------------------------------------------
// computeTrustDimensions
// ---------------------------------------------------------------------------

describe('computeTrustDimensions', () => {
  it('returns all dimensions at 100 when no signals', () => {
    const dims = computeTrustDimensions([], undefined, NOW);
    for (const key of TRUST_DIMENSION_KEYS) {
      expect(dims[key]).toBe(100);
    }
  });

  it('maps adapter types to correct dimensions', () => {
    const emailSignal = makeSignal('email', 50);
    const dims = computeTrustDimensions([emailSignal], undefined, NOW);
    // email maps to 'temporal' — should be 50
    expect(dims.temporal).toBe(50);
    // Others should remain 100
    expect(dims.cryptographic).toBe(100);
    expect(dims.spatial).toBe(100);
    expect(dims.behavioral).toBe(100);
  });

  it('respects signal.dimension override', () => {
    const signal: TrustSignal = {
      ...makeSignal('zoom', 40),
      dimension: 'spatial' as TrustDimensionKey,
    };
    const dims = computeTrustDimensions([signal], undefined, NOW);
    // Should override ADAPTER_DIMENSION_MAP (zoom -> contextual) with explicit 'spatial'
    expect(dims.spatial).toBe(40);
    expect(dims.contextual).toBe(100); // not populated since override applies
  });

  it('averages multiple signals in same dimension', () => {
    const signals = [
      makeSignal('zoom', 60),
      makeSignal('teams', 80),
    ];
    // Both map to 'contextual'
    const dims = computeTrustDimensions(signals, undefined, NOW);
    expect(dims.contextual).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// computeCompositeScore
// ---------------------------------------------------------------------------

describe('computeCompositeScore', () => {
  it('returns 100 when all dimensions are 100', () => {
    const dims = { temporal: 100, contextual: 100, cryptographic: 100, spatial: 100, behavioral: 100 };
    expect(computeCompositeScore(dims)).toBe(100);
  });

  it('returns 0 when all dimensions are 0', () => {
    const dims = { temporal: 0, contextual: 0, cryptographic: 0, spatial: 0, behavioral: 0 };
    expect(computeCompositeScore(dims)).toBe(0);
  });

  it('reflects dimension weights', () => {
    // cryptographic has highest default weight (0.25), set it low
    const dims = { temporal: 100, contextual: 100, cryptographic: 0, spatial: 100, behavioral: 100 };
    const score = computeCompositeScore(dims);
    // Should be < 100 since cryptographic is 0
    expect(score).toBeLessThan(100);
    expect(score).toBeGreaterThan(0);
    // With crypto weight 0.25 and all others at 100: score = 75
    expect(score).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// getBreatheDuration
// ---------------------------------------------------------------------------

describe('getBreatheDuration', () => {
  it('returns correct durations for each level', () => {
    expect(getBreatheDuration('verified')).toBe(4);
    expect(getBreatheDuration('normal')).toBe(3);
    expect(getBreatheDuration('elevated')).toBe(2);
    expect(getBreatheDuration('warning')).toBe(1.5);
    expect(getBreatheDuration('critical')).toBe(0.8);
  });

  it('returns higher durations for higher trust levels', () => {
    const levels: TrustLevel[] = ['critical', 'warning', 'elevated', 'normal', 'verified'];
    const durations = levels.map(getBreatheDuration);
    for (let i = 1; i < durations.length; i++) {
      expect(durations[i]).toBeGreaterThan(durations[i - 1]);
    }
  });

  it('returns a positive number for every level', () => {
    const levels: TrustLevel[] = ['critical', 'warning', 'elevated', 'normal', 'verified'];
    for (const level of levels) {
      expect(getBreatheDuration(level)).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_TRUST_SCORER_CONFIG
// ---------------------------------------------------------------------------

describe('DEFAULT_TRUST_SCORER_CONFIG', () => {
  it('has valid default values', () => {
    expect(DEFAULT_TRUST_SCORER_CONFIG.decayHalfLifeMs).toBeGreaterThan(0);
    expect(DEFAULT_TRUST_SCORER_CONFIG.maxSignalAgeMs).toBeGreaterThan(0);
    expect(DEFAULT_TRUST_SCORER_CONFIG.anomalyDropThreshold).toBeGreaterThan(0);
    expect(DEFAULT_TRUST_SCORER_CONFIG.anomalyWindowMs).toBeGreaterThan(0);
    expect(DEFAULT_TRUST_SCORER_CONFIG.runningAverageWindow).toBeGreaterThan(0);
  });

  it('has weights for all adapter types', () => {
    expect(DEFAULT_TRUST_SCORER_CONFIG.weights.zoom).toBeDefined();
    expect(DEFAULT_TRUST_SCORER_CONFIG.weights.teams).toBeDefined();
    expect(DEFAULT_TRUST_SCORER_CONFIG.weights.email).toBeDefined();
    expect(DEFAULT_TRUST_SCORER_CONFIG.weights.file).toBeDefined();
    expect(DEFAULT_TRUST_SCORER_CONFIG.weights.api).toBeDefined();
    expect(DEFAULT_TRUST_SCORER_CONFIG.weights.crypto).toBeDefined();
  });
});
