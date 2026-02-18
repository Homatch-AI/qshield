import type {
  Alert,
  AdapterType,
  PolicyConfig,
  PolicyRule,
  TrustSignal,
  TrustState,
} from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Evaluate a single policy rule condition against a signal score.
 */
export function evaluateCondition(
  operator: PolicyRule['condition']['operator'],
  value: number,
  threshold: number,
): boolean {
  switch (operator) {
    case 'lt':
      return value < threshold;
    case 'lte':
      return value <= threshold;
    case 'gt':
      return value > threshold;
    case 'gte':
      return value >= threshold;
    case 'eq':
      return value === threshold;
    default:
      return false;
  }
}

/**
 * Find the latest signal score for a given adapter source.
 */
function getLatestSignalScore(signals: TrustSignal[], source: AdapterType): number | null {
  const sourceSignals = signals.filter((s) => s.source === source);
  if (sourceSignals.length === 0) return null;

  sourceSignals.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return sourceSignals[0].score;
}

/** Result of evaluating all policy rules against current trust state */
export interface PolicyEvaluationResult {
  triggeredRules: PolicyRule[];
  alerts: Alert[];
  shouldFreeze: boolean;
  shouldEscalate: boolean;
}

/**
 * Evaluate all enabled policy rules against the current trust state.
 * Returns any triggered rules and generated alerts.
 */
export function evaluatePolicy(
  policy: PolicyConfig,
  trustState: TrustState,
): PolicyEvaluationResult {
  const triggeredRules: PolicyRule[] = [];
  const alerts: Alert[] = [];
  let shouldEscalate = false;
  let shouldFreeze = false;

  for (const rule of policy.rules) {
    if (!rule.enabled) continue;

    const signalScore = getLatestSignalScore(trustState.signals, rule.condition.signal);
    if (signalScore === null) continue;

    if (evaluateCondition(rule.condition.operator, signalScore, rule.condition.threshold)) {
      triggeredRules.push(rule);

      const alert: Alert = {
        id: uuidv4(),
        severity: rule.severity,
        title: `Policy violation: ${rule.name}`,
        description: `Signal ${rule.condition.signal} score ${signalScore} ${rule.condition.operator} ${rule.condition.threshold}`,
        source: rule.condition.signal,
        timestamp: new Date().toISOString(),
        dismissed: false,
      };
      alerts.push(alert);

      if (rule.action === 'escalate') {
        shouldEscalate = true;
      }
      if (rule.action === 'freeze') {
        shouldFreeze = true;
      }
    }
  }

  // Check auto-freeze threshold
  if (policy.autoFreeze.enabled && trustState.score < policy.autoFreeze.trustScoreThreshold) {
    shouldFreeze = true;
  }

  return { triggeredRules, alerts, shouldFreeze, shouldEscalate };
}

/** Create a default policy configuration */
export function createDefaultPolicy(): PolicyConfig {
  return {
    rules: [
      {
        id: uuidv4(),
        name: 'Critical trust drop',
        condition: { signal: 'zoom', operator: 'lt', threshold: 30 },
        action: 'escalate',
        severity: 'critical',
        enabled: true,
      },
      {
        id: uuidv4(),
        name: 'Low trust warning',
        condition: { signal: 'zoom', operator: 'lt', threshold: 50 },
        action: 'alert',
        severity: 'high',
        enabled: true,
      },
      {
        id: uuidv4(),
        name: 'Email anomaly',
        condition: { signal: 'email', operator: 'lt', threshold: 40 },
        action: 'alert',
        severity: 'medium',
        enabled: true,
      },
      {
        id: uuidv4(),
        name: 'High-trust asset change',
        condition: { signal: 'file', operator: 'lt', threshold: 45 },
        action: 'alert',
        severity: 'high',
        enabled: true,
      },
      {
        id: uuidv4(),
        name: 'Critical asset compromise',
        condition: { signal: 'file', operator: 'lt', threshold: 25 },
        action: 'escalate',
        severity: 'critical',
        enabled: true,
      },
    ],
    escalation: {
      channels: ['webhook'],
      cooldownMinutes: 15,
    },
    autoFreeze: {
      enabled: true,
      trustScoreThreshold: 20,
      durationMinutes: 30,
    },
  };
}
