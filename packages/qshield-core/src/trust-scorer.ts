import type { AdapterType, TrustLevel, TrustSignal, TrustState } from './types';

/** Default weights for each adapter type */
const DEFAULT_WEIGHTS: Record<AdapterType, number> = {
  zoom: 0.25,
  teams: 0.25,
  email: 0.2,
  file: 0.15,
  api: 0.15,
};

/** Trust level thresholds (inclusive lower bound) */
const LEVEL_THRESHOLDS: { min: number; level: TrustLevel }[] = [
  { min: 90, level: 'verified' },
  { min: 70, level: 'normal' },
  { min: 50, level: 'elevated' },
  { min: 30, level: 'warning' },
  { min: 0, level: 'critical' },
];

/** Compute the trust level for a given score */
export function computeTrustLevel(score: number): TrustLevel {
  const clamped = Math.max(0, Math.min(100, score));
  for (const { min, level } of LEVEL_THRESHOLDS) {
    if (clamped >= min) return level;
  }
  return 'critical';
}

/** Breathing animation duration in seconds based on trust level */
export function getBreatheDuration(level: TrustLevel): number {
  const durations: Record<TrustLevel, number> = {
    verified: 4,
    normal: 3,
    elevated: 2,
    warning: 1.5,
    critical: 0.8,
  };
  return durations[level];
}

/**
 * Compute the weighted trust score from a set of signals.
 * Only active signals (non-empty) contribute to the score.
 * Weights are normalized to sum to 1.0 based on active signals.
 */
export function computeTrustScore(
  signals: TrustSignal[],
  customWeights?: Partial<Record<AdapterType, number>>,
): number {
  if (signals.length === 0) return 0;

  const weights = { ...DEFAULT_WEIGHTS, ...customWeights };

  // Normalize weights to sum to 1.0 based on active sources
  const activeSources = new Set(signals.map((s) => s.source));
  let totalWeight = 0;
  for (const source of activeSources) {
    totalWeight += weights[source] ?? 0;
  }

  if (totalWeight === 0) return 0;

  // Group signals by source, take the latest signal for each source
  const latestBySource = new Map<AdapterType, TrustSignal>();
  for (const signal of signals) {
    const existing = latestBySource.get(signal.source);
    if (!existing || signal.timestamp > existing.timestamp) {
      latestBySource.set(signal.source, signal);
    }
  }

  let score = 0;
  for (const [source, signal] of latestBySource) {
    const normalizedWeight = (weights[source] ?? 0) / totalWeight;
    score += signal.score * normalizedWeight;
  }

  return Math.round(Math.max(0, Math.min(100, score)) * 100) / 100;
}

/**
 * Build a complete TrustState from signals.
 */
export function buildTrustState(
  signals: TrustSignal[],
  sessionId: string,
  customWeights?: Partial<Record<AdapterType, number>>,
): TrustState {
  const score = computeTrustScore(signals, customWeights);
  return {
    score,
    level: computeTrustLevel(score),
    signals,
    lastUpdated: new Date().toISOString(),
    sessionId,
  };
}
