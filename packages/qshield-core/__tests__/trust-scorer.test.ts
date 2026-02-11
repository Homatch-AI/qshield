import { describe, it, expect } from 'vitest';
import {
  computeTrustScore,
  computeTrustLevel,
  buildTrustState,
  getBreatheDuration,
} from '../src/trust-scorer';
import type { TrustSignal } from '../src/types';

function makeSignal(
  source: TrustSignal['source'],
  score: number,
  timestamp?: string,
): TrustSignal {
  return {
    source,
    score,
    weight: 1,
    timestamp: timestamp ?? new Date().toISOString(),
    metadata: {},
  };
}

describe('computeTrustLevel', () => {
  it('returns verified for scores >= 90', () => {
    expect(computeTrustLevel(100)).toBe('verified');
    expect(computeTrustLevel(90)).toBe('verified');
  });

  it('returns normal for scores 70-89', () => {
    expect(computeTrustLevel(89)).toBe('normal');
    expect(computeTrustLevel(70)).toBe('normal');
  });

  it('returns elevated for scores 50-69', () => {
    expect(computeTrustLevel(69)).toBe('elevated');
    expect(computeTrustLevel(50)).toBe('elevated');
  });

  it('returns warning for scores 30-49', () => {
    expect(computeTrustLevel(49)).toBe('warning');
    expect(computeTrustLevel(30)).toBe('warning');
  });

  it('returns critical for scores 0-29', () => {
    expect(computeTrustLevel(29)).toBe('critical');
    expect(computeTrustLevel(0)).toBe('critical');
  });

  it('clamps out-of-range values', () => {
    expect(computeTrustLevel(150)).toBe('verified');
    expect(computeTrustLevel(-10)).toBe('critical');
  });
});

describe('computeTrustScore', () => {
  it('returns 0 for empty signals', () => {
    expect(computeTrustScore([])).toBe(0);
  });

  it('returns the signal score for a single source', () => {
    const signals = [makeSignal('zoom', 80)];
    expect(computeTrustScore(signals)).toBe(80);
  });

  it('computes weighted average for multiple sources', () => {
    const signals = [
      makeSignal('zoom', 100),
      makeSignal('teams', 100),
      makeSignal('email', 100),
      makeSignal('file', 100),
      makeSignal('api', 100),
    ];
    expect(computeTrustScore(signals)).toBe(100);
  });

  it('normalizes weights to active sources only', () => {
    // Only zoom and teams active (weights 0.25 + 0.25 = 0.5, normalized to 1.0)
    const signals = [makeSignal('zoom', 60), makeSignal('teams', 80)];
    // zoom: 60 * 0.5 = 30, teams: 80 * 0.5 = 40, total = 70
    expect(computeTrustScore(signals)).toBe(70);
  });

  it('uses the latest signal per source', () => {
    const signals = [
      makeSignal('zoom', 50, '2024-01-01T00:00:00Z'),
      makeSignal('zoom', 90, '2024-01-02T00:00:00Z'), // newer, should be used
    ];
    expect(computeTrustScore(signals)).toBe(90);
  });

  it('supports custom weights', () => {
    const signals = [makeSignal('zoom', 100), makeSignal('teams', 0)];
    // Custom: zoom 0.75, teams 0.25
    const score = computeTrustScore(signals, { zoom: 0.75, teams: 0.25 });
    expect(score).toBe(75);
  });

  it('clamps score to 0-100 range', () => {
    const signals = [makeSignal('zoom', 200)];
    expect(computeTrustScore(signals)).toBeLessThanOrEqual(100);
  });
});

describe('buildTrustState', () => {
  it('builds a complete trust state', () => {
    const signals = [makeSignal('zoom', 85)];
    const state = buildTrustState(signals, 'session-1');
    expect(state.score).toBe(85);
    expect(state.level).toBe('normal');
    expect(state.sessionId).toBe('session-1');
    expect(state.signals).toEqual(signals);
    expect(state.lastUpdated).toBeTruthy();
  });

  it('builds critical state for low scores', () => {
    const signals = [makeSignal('zoom', 10)];
    const state = buildTrustState(signals, 'session-2');
    expect(state.level).toBe('critical');
  });
});

describe('getBreatheDuration', () => {
  it('returns correct durations for each level', () => {
    expect(getBreatheDuration('verified')).toBe(4);
    expect(getBreatheDuration('normal')).toBe(3);
    expect(getBreatheDuration('elevated')).toBe(2);
    expect(getBreatheDuration('warning')).toBe(1.5);
    expect(getBreatheDuration('critical')).toBe(0.8);
  });
});
