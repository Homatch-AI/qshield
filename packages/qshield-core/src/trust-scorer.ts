import type { AdapterType, TrustDimensionKey, TrustDimensions, TrustLevel, TrustSignal, TrustState } from './types';
import { TRUST_DIMENSION_KEYS } from './types';

/** Configuration for the trust scoring engine. */
export interface TrustScorerConfig {
  /** Weight map per signal source. Weights are normalized at scoring time. */
  weights: Record<AdapterType, number>;
  /** Weight map per trust dimension. Weights are normalized at scoring time. */
  dimensionWeights: Record<TrustDimensionKey, number>;
  /** Signal decay half-life in milliseconds (default: 3,600,000 = 1 hour). */
  decayHalfLifeMs: number;
  /** Maximum signal age in milliseconds. Signals older than this are ignored entirely. */
  maxSignalAgeMs: number;
  /** Anomaly detection: minimum score drop to flag as anomaly (default: 30). */
  anomalyDropThreshold: number;
  /** Anomaly detection: time window in milliseconds for drop detection (default: 300,000 = 5 min). */
  anomalyWindowMs: number;
  /** Running average window size — number of most recent score snapshots to average (default: 5). */
  runningAverageWindow: number;
}

/** Result of anomaly detection analysis. */
export interface AnomalyResult {
  /** Whether an anomaly was detected. */
  detected: boolean;
  /** The magnitude of the score drop (positive number). */
  drop: number;
  /** Time span in milliseconds over which the drop occurred. */
  windowMs: number;
  /** Human-readable description of the anomaly. */
  message: string;
}

/** Default weights for each adapter type. */
const DEFAULT_WEIGHTS: Record<AdapterType, number> = {
  zoom: 0.20,
  teams: 0.20,
  email: 0.18,
  file: 0.14,
  api: 0.13,
  crypto: 0.15,
};

/** Default weights for each trust dimension. */
const DEFAULT_DIMENSION_WEIGHTS: Record<TrustDimensionKey, number> = {
  temporal: 0.20,
  contextual: 0.20,
  cryptographic: 0.25,
  spatial: 0.15,
  behavioral: 0.20,
};

/** Adapter → dimension mapping. */
export const ADAPTER_DIMENSION_MAP: Record<AdapterType, TrustDimensionKey> = {
  zoom: 'contextual',
  teams: 'contextual',
  email: 'temporal',
  file: 'cryptographic',
  api: 'spatial',
  crypto: 'behavioral',
};

/** Default trust scorer configuration. */
export const DEFAULT_TRUST_SCORER_CONFIG: TrustScorerConfig = {
  weights: { ...DEFAULT_WEIGHTS },
  dimensionWeights: { ...DEFAULT_DIMENSION_WEIGHTS },
  decayHalfLifeMs: 60 * 60 * 1000, // 1 hour
  maxSignalAgeMs: 4 * 60 * 60 * 1000, // 4 hours
  anomalyDropThreshold: 30,
  anomalyWindowMs: 5 * 60 * 1000, // 5 minutes
  runningAverageWindow: 5,
};

/** Trust level thresholds (inclusive lower bound). */
const LEVEL_THRESHOLDS: { min: number; level: TrustLevel }[] = [
  { min: 90, level: 'verified' },
  { min: 70, level: 'normal' },
  { min: 50, level: 'elevated' },
  { min: 30, level: 'warning' },
  { min: 0, level: 'critical' },
];

/**
 * Clamp a value to the [0, 100] range.
 * @param value - The value to clamp
 * @returns The clamped value
 */
function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Compute the trust level for a given score.
 *
 * The score is first clamped to [0, 100], then mapped to a trust level
 * based on fixed thresholds: verified (>=90), normal (>=70), elevated (>=50),
 * warning (>=30), critical (<30).
 *
 * @param score - The trust score (will be clamped to 0-100)
 * @returns The corresponding trust level
 */
export function computeTrustLevel(score: number): TrustLevel {
  const clamped = clampScore(score);
  for (const { min, level } of LEVEL_THRESHOLDS) {
    if (clamped >= min) return level;
  }
  return 'critical';
}

/**
 * Breathing animation duration in seconds based on trust level.
 *
 * Lower trust levels produce faster breathing to convey urgency.
 *
 * @param level - The current trust level
 * @returns Duration in seconds for one breathing animation cycle
 */
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
 * Compute exponential decay factor for a signal based on its age.
 *
 * Uses the formula: factor = 2^(-age / halfLife)
 * A signal at exactly the half-life age will have a factor of 0.5.
 *
 * @param signalTimestamp - ISO 8601 timestamp of the signal
 * @param now - Current time in milliseconds since epoch
 * @param halfLifeMs - Decay half-life in milliseconds
 * @returns Decay factor between 0 and 1
 */
export function computeDecayFactor(
  signalTimestamp: string,
  now: number,
  halfLifeMs: number,
): number {
  const ageMs = now - new Date(signalTimestamp).getTime();
  if (ageMs <= 0) return 1;
  return Math.pow(2, -ageMs / halfLifeMs);
}

/**
 * Compute the weighted trust score from a set of signals.
 *
 * Only active signals (non-empty) contribute to the score.
 * Weights are normalized to sum to 1.0 based on active signal sources.
 * Signal scores are attenuated by exponential decay based on age.
 * The final score is always clamped to [0, 100].
 *
 * @param signals - Array of trust signals from various adapters
 * @param config - Optional partial configuration (merged with defaults)
 * @param now - Optional current timestamp in ms (default: Date.now())
 * @returns The computed trust score, clamped to [0, 100]
 */
export function computeTrustScore(
  signals: TrustSignal[],
  config?: Partial<TrustScorerConfig>,
  now?: number,
): number {
  if (signals.length === 0) return 0;

  const cfg: TrustScorerConfig = { ...DEFAULT_TRUST_SCORER_CONFIG, ...config };
  if (config?.weights) {
    cfg.weights = { ...DEFAULT_WEIGHTS, ...config.weights };
  }
  const currentTime = now ?? Date.now();

  // Filter out signals older than the max age
  const activeSignals = signals.filter((s) => {
    const ageMs = currentTime - new Date(s.timestamp).getTime();
    return ageMs <= cfg.maxSignalAgeMs;
  });

  if (activeSignals.length === 0) return 0;

  // Group signals by source, take the latest signal for each source
  const latestBySource = new Map<AdapterType, TrustSignal>();
  for (const signal of activeSignals) {
    const existing = latestBySource.get(signal.source);
    if (!existing || signal.timestamp > existing.timestamp) {
      latestBySource.set(signal.source, signal);
    }
  }

  // Normalize weights to sum to 1.0 based on active sources
  const activeSources = new Set(latestBySource.keys());
  let totalWeight = 0;
  for (const source of activeSources) {
    totalWeight += cfg.weights[source] ?? 0;
  }

  if (totalWeight === 0) return 0;

  let score = 0;
  for (const [source, signal] of latestBySource) {
    const normalizedWeight = (cfg.weights[source] ?? 0) / totalWeight;
    const decayFactor = computeDecayFactor(signal.timestamp, currentTime, cfg.decayHalfLifeMs);
    score += signal.score * normalizedWeight * decayFactor;
  }

  return Math.round(clampScore(score) * 100) / 100;
}

/**
 * Compute the 5-dimension trust scores from signals.
 *
 * Each signal is mapped to a dimension via signal.dimension (if set)
 * or via ADAPTER_DIMENSION_MAP. Dimensions with no contributing signals
 * default to 100 (no news = good news).
 *
 * @param signals - Array of trust signals from various adapters
 * @param config - Optional partial configuration (merged with defaults)
 * @param now - Optional current timestamp in ms (default: Date.now())
 * @returns TrustDimensions with all 5 dimension scores
 */
export function computeTrustDimensions(
  signals: TrustSignal[],
  config?: Partial<TrustScorerConfig>,
  now?: number,
): TrustDimensions {
  const cfg: TrustScorerConfig = { ...DEFAULT_TRUST_SCORER_CONFIG, ...config };
  const currentTime = now ?? Date.now();

  // Filter out signals older than the max age
  const activeSignals = signals.filter((s) => {
    const ageMs = currentTime - new Date(s.timestamp).getTime();
    return ageMs <= cfg.maxSignalAgeMs;
  });

  // Group signals by dimension
  const dimensionSignals = new Map<TrustDimensionKey, { score: number; decay: number }[]>();
  for (const key of TRUST_DIMENSION_KEYS) {
    dimensionSignals.set(key, []);
  }

  for (const signal of activeSignals) {
    const dim = signal.dimension ?? ADAPTER_DIMENSION_MAP[signal.source];
    const decayFactor = computeDecayFactor(signal.timestamp, currentTime, cfg.decayHalfLifeMs);
    dimensionSignals.get(dim)!.push({ score: signal.score, decay: decayFactor });
  }

  // Compute average score per dimension (default 100 if no signals)
  const dimensions: TrustDimensions = {
    temporal: 100,
    contextual: 100,
    cryptographic: 100,
    spatial: 100,
    behavioral: 100,
  };

  for (const key of TRUST_DIMENSION_KEYS) {
    const entries = dimensionSignals.get(key)!;
    if (entries.length > 0) {
      const totalDecayedScore = entries.reduce((sum, e) => sum + e.score * e.decay, 0);
      const totalDecay = entries.reduce((sum, e) => sum + e.decay, 0);
      dimensions[key] = Math.round(clampScore(totalDecayedScore / totalDecay) * 100) / 100;
    }
  }

  return dimensions;
}

/**
 * Compute a composite trust score as a weighted average of all 5 dimensions.
 *
 * @param dimensions - The 5-dimension trust scores
 * @param config - Optional partial configuration (merged with defaults)
 * @returns Composite trust score, clamped to [0, 100]
 */
export function computeCompositeScore(
  dimensions: TrustDimensions,
  config?: Partial<TrustScorerConfig>,
): number {
  const cfg: TrustScorerConfig = { ...DEFAULT_TRUST_SCORER_CONFIG, ...config };
  const dimWeights = config?.dimensionWeights
    ? { ...DEFAULT_DIMENSION_WEIGHTS, ...config.dimensionWeights }
    : cfg.dimensionWeights;

  let totalWeight = 0;
  let score = 0;
  for (const key of TRUST_DIMENSION_KEYS) {
    const w = dimWeights[key];
    totalWeight += w;
    score += dimensions[key] * w;
  }

  if (totalWeight === 0) return 0;
  return Math.round(clampScore(score / totalWeight) * 100) / 100;
}

/**
 * Detect anomalous score drops over a short time window.
 *
 * Compares the current score against the maximum score seen in the
 * recent history within the configured anomaly window. If the drop
 * exceeds the threshold, an anomaly is flagged.
 *
 * @param scoreHistory - Array of { score, timestamp } snapshots, most recent last
 * @param currentScore - The current trust score
 * @param config - Optional partial configuration (merged with defaults)
 * @returns Anomaly detection result
 */
export function detectAnomaly(
  scoreHistory: Array<{ score: number; timestamp: number }>,
  currentScore: number,
  config?: Partial<TrustScorerConfig>,
): AnomalyResult {
  const cfg: TrustScorerConfig = { ...DEFAULT_TRUST_SCORER_CONFIG, ...config };
  const now = Date.now();
  const windowStart = now - cfg.anomalyWindowMs;

  // Find the max score in the recent window
  const recentScores = scoreHistory.filter((s) => s.timestamp >= windowStart);

  if (recentScores.length === 0) {
    return { detected: false, drop: 0, windowMs: cfg.anomalyWindowMs, message: 'No recent history' };
  }

  const maxRecent = Math.max(...recentScores.map((s) => s.score));
  const drop = maxRecent - currentScore;

  if (drop >= cfg.anomalyDropThreshold) {
    return {
      detected: true,
      drop,
      windowMs: cfg.anomalyWindowMs,
      message: `Anomaly detected: score dropped ${drop.toFixed(1)} points (from ${maxRecent.toFixed(1)} to ${currentScore.toFixed(1)}) within ${(cfg.anomalyWindowMs / 1000 / 60).toFixed(1)} minutes`,
    };
  }

  return {
    detected: false,
    drop: Math.max(0, drop),
    windowMs: cfg.anomalyWindowMs,
    message: 'No anomaly',
  };
}

/**
 * Compute a running average of the most recent score snapshots.
 *
 * Uses a sliding window of the configured size. If fewer snapshots
 * exist than the window size, all available snapshots are averaged.
 *
 * @param scoreHistory - Array of score values, most recent last
 * @param windowSize - Number of recent scores to average (default: 5)
 * @returns The running average score, clamped to [0, 100]
 */
export function computeRunningAverage(
  scoreHistory: number[],
  windowSize?: number,
): number {
  const size = windowSize ?? DEFAULT_TRUST_SCORER_CONFIG.runningAverageWindow;
  if (scoreHistory.length === 0) return 0;

  const window = scoreHistory.slice(-size);
  const sum = window.reduce((acc, s) => acc + s, 0);
  return Math.round(clampScore(sum / window.length) * 100) / 100;
}

/**
 * Build a complete TrustState from signals.
 *
 * Combines 5-dimension scoring, composite score computation, level
 * determination, and signal data into a single state object suitable
 * for rendering and policy evaluation.
 *
 * @param signals - Array of trust signals from various adapters
 * @param sessionId - The current session identifier
 * @param config - Optional partial trust scorer configuration
 * @returns Complete trust state with score, level, dimensions, and metadata
 */
export function buildTrustState(
  signals: TrustSignal[],
  sessionId: string,
  config?: Partial<TrustScorerConfig>,
): TrustState {
  const dimensions = computeTrustDimensions(signals, config);
  const score = computeCompositeScore(dimensions, config);
  return {
    score,
    level: computeTrustLevel(score),
    dimensions,
    signals,
    lastUpdated: new Date().toISOString(),
    sessionId,
  };
}
