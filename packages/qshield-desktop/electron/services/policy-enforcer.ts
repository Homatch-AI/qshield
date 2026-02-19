import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { TrustState, TrustSignal, PolicyConfig, PolicyRule, Alert, AlertSourceMetadata, AdapterType } from '@qshield/core';
import { createDefaultPolicy } from '@qshield/core';

/** Events emitted by the PolicyEnforcer */
export type PolicyEvent = 'alert' | 'escalation' | 'freeze' | 'unfreeze';

type AlertCallback = (alert: Alert) => void;
type PolicyEventCallback = (event: PolicyEvent, data?: unknown) => void;

/** Extended operator set for flexible rule matching */
type ExtendedOperator = PolicyRule['condition']['operator'] | 'neq' | 'contains' | 'matches';

/** Extended rule condition supporting additional operators */
export interface ExtendedCondition {
  field: string;
  operator: ExtendedOperator;
  value: number | string;
  signal?: AdapterType;
}

/** Alert acknowledgement tracking */
interface AlertAck {
  alertId: string;
  ruleId: string;
  acknowledgedAt: string | null;
  escalatedAt: string | null;
  severity: Alert['severity'];
}

/**
 * Policy evaluation and alerting service.
 *
 * Evaluates trust state and individual signals against configured policy
 * rules, generates alerts for violations, manages escalation chains with
 * acknowledgement tracking, enforces cooldown windows to prevent alert spam,
 * and manages auto-freeze state when trust drops below threshold.
 *
 * Emits events for: alert, escalation, freeze, unfreeze.
 */
export class PolicyEnforcer {
  private policy: PolicyConfig;
  private alertListeners: AlertCallback[] = [];
  private eventListeners: PolicyEventCallback[] = [];
  private frozen = false;
  private frozenAt: string | null = null;
  private frozenUntil: string | null = null;
  private freezeTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Tracks the last time each rule triggered an alert.
   * Keyed by rule ID, value is ISO 8601 timestamp.
   */
  private ruleCooldowns: Map<string, string> = new Map();

  /**
   * Tracks unacknowledged alerts for escalation.
   * Keyed by alert ID.
   */
  private pendingAcks: Map<string, AlertAck> = new Map();

  /** Default cooldown window in minutes */
  private static readonly DEFAULT_COOLDOWN_MINUTES = 15;

  /** Default freeze duration in minutes */
  private static readonly DEFAULT_FREEZE_MINUTES = 30;

  /** Default auto-freeze threshold */
  private static readonly DEFAULT_FREEZE_THRESHOLD = 20;

  /**
   * Create a new PolicyEnforcer with the default policy.
   */
  constructor() {
    this.policy = createDefaultPolicy();
    log.info('[PolicyEnforcer] Initialized with default policy');
  }

  /**
   * Evaluate the current trust state against all enabled policy rules.
   * Checks auto-freeze conditions, applies cooldowns, and emits alerts.
   * Returns triggered rules and generated alerts.
   * @param trustState - the current trust state to evaluate
   * @returns evaluation result with triggered rules and alerts
   */
  evaluate(trustState: TrustState): {
    triggeredRules: PolicyRule[];
    alerts: Alert[];
    shouldFreeze: boolean;
    shouldEscalate: boolean;
  } {
    this.checkFreezeExpiry();
    this.checkEscalations();

    const triggeredRules: PolicyRule[] = [];
    const alerts: Alert[] = [];
    let shouldEscalate = false;
    let shouldFreeze = false;

    for (const rule of this.policy.rules) {
      if (!rule.enabled) continue;

      // Find the latest signal score for this rule's signal source
      const signalScore = this.getLatestSignalScore(trustState.signals, rule.condition.signal);
      if (signalScore === null) continue;

      const triggered = this.evaluateCondition(
        rule.condition.operator,
        signalScore,
        rule.condition.threshold,
      );

      if (!triggered) continue;

      triggeredRules.push(rule);

      // Check cooldown
      if (this.isRuleInCooldown(rule.id)) {
        log.debug(`[PolicyEnforcer] Alert suppressed for rule "${rule.name}" (in cooldown)`);
        continue;
      }

      // Record trigger time
      this.ruleCooldowns.set(rule.id, new Date().toISOString());

      // Extract metadata from the latest signal to enrich the alert
      const latestSignal = this.getLatestSignal(trustState.signals, rule.condition.signal);
      const meta = latestSignal?.metadata as Record<string, unknown> | undefined;
      const forensicsRaw = meta?.forensics as Record<string, unknown> | undefined;
      const sourceMetadata = meta
        ? {
            fileName: (meta.changedFileName ?? meta.fileName) as string | undefined,
            filePath: (meta.changedFile ?? meta.path ?? meta.fullPath) as string | undefined,
            fileSize: meta.size as number | undefined,
            fileHash: (meta.newHash ?? meta.sha256) as string | undefined,
            operation: meta.eventType as string | undefined,
            ...(forensicsRaw ? { forensics: forensicsRaw as AlertSourceMetadata['forensics'] } : {}),
            rawEvent: meta,
          }
        : undefined;

      // Build a human-readable description
      const descParts: string[] = [];
      if (forensicsRaw?.owner) descParts.push(`User: ${forensicsRaw.owner}`);
      if (forensicsRaw?.modifiedBy) descParts.push(`App: ${forensicsRaw.modifiedBy}`);
      // Show the actual changed file, then the asset/directory name if different
      const changedFile = meta?.changedFileName ?? meta?.fileName;
      const assetName = meta?.assetName ?? meta?.directoryName;
      if (changedFile) {
        descParts.push(`File: ${changedFile}`);
        if (assetName && assetName !== changedFile) {
          descParts.push(`Asset: ${assetName}`);
        }
      } else if (assetName) {
        descParts.push(`Asset: ${assetName}`);
      }
      if (meta?.eventType) descParts.push(`Event: ${meta.eventType}`);
      const description = descParts.length > 0
        ? descParts.join(' | ')
        : `Signal ${rule.condition.signal} score ${signalScore} ${rule.condition.operator} ${rule.condition.threshold}`;

      // Create alert
      const alert: Alert = {
        id: uuidv4(),
        severity: rule.severity,
        title: `Policy violation: ${rule.name}`,
        description,
        source: rule.condition.signal,
        timestamp: new Date().toISOString(),
        dismissed: false,
        sourceMetadata,
      };

      alerts.push(alert);
      this.emitAlert(alert);

      // Track for escalation
      this.pendingAcks.set(alert.id, {
        alertId: alert.id,
        ruleId: rule.id,
        acknowledgedAt: null,
        escalatedAt: null,
        severity: rule.severity,
      });

      if (rule.action === 'escalate') {
        shouldEscalate = true;
      }
      if (rule.action === 'freeze') {
        shouldFreeze = true;
      }
    }

    // Check auto-freeze threshold
    if (
      this.policy.autoFreeze.enabled &&
      trustState.score < this.policy.autoFreeze.trustScoreThreshold &&
      !this.frozen
    ) {
      shouldFreeze = true;
    }

    // Activate freeze if needed
    if (shouldFreeze && !this.frozen) {
      this.activateFreeze();
    }

    if (shouldEscalate) {
      this.emitPolicyEvent('escalation', { triggeredRules, trustState });
    }

    log.debug(
      `[PolicyEnforcer] Evaluation: ${triggeredRules.length} rules triggered, ${alerts.length} alerts, freeze=${this.frozen}`,
    );

    return { triggeredRules, alerts, shouldFreeze, shouldEscalate };
  }

  /**
   * Evaluate a single condition operator against a value.
   * Supports: eq, neq, gt, lt, gte, lte, contains, matches (regex).
   * @param operator - comparison operator
   * @param value - the value to test
   * @param threshold - the threshold to compare against
   * @returns true if the condition is met
   */
  private evaluateCondition(
    operator: string,
    value: number | string,
    threshold: number | string,
  ): boolean {
    switch (operator) {
      case 'eq':
        return value === threshold;
      case 'neq':
        return value !== threshold;
      case 'gt':
        return value > threshold;
      case 'lt':
        return value < threshold;
      case 'gte':
        return value >= threshold;
      case 'lte':
        return value <= threshold;
      case 'contains':
        return String(value).includes(String(threshold));
      case 'matches':
        try {
          return new RegExp(String(threshold)).test(String(value));
        } catch {
          log.warn(`[PolicyEnforcer] Invalid regex pattern: ${threshold}`);
          return false;
        }
      default:
        return false;
    }
  }

  /**
   * Get the latest signal score for a given adapter source.
   * @param signals - array of trust signals
   * @param source - adapter type to filter by
   * @returns latest score or null if no signals from this source
   */
  private getLatestSignalScore(signals: TrustSignal[], source: AdapterType): number | null {
    const signal = this.getLatestSignal(signals, source);
    return signal?.score ?? null;
  }

  /**
   * Get the latest trust signal for a given adapter source.
   * @param signals - array of trust signals
   * @param source - adapter type to filter by
   * @returns latest signal or null if no signals from this source
   */
  private getLatestSignal(signals: TrustSignal[], source: AdapterType): TrustSignal | null {
    const sourceSignals = signals.filter((s) => s.source === source);
    if (sourceSignals.length === 0) return null;

    sourceSignals.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return sourceSignals[0];
  }

  /**
   * Acknowledge an alert, stopping its escalation timer.
   * @param alertId - the ID of the alert to acknowledge
   * @returns true if the alert was found and acknowledged
   */
  acknowledgeAlert(alertId: string): boolean {
    const ack = this.pendingAcks.get(alertId);
    if (!ack) return false;

    ack.acknowledgedAt = new Date().toISOString();
    log.info(`[PolicyEnforcer] Alert ${alertId} acknowledged`);
    return true;
  }

  /**
   * Get the current policy configuration.
   * @returns a copy of the current policy
   */
  getPolicy(): PolicyConfig {
    return { ...this.policy };
  }

  /**
   * Update the policy configuration.
   * Clears all cooldowns since rule IDs may have changed.
   * @param config - the new policy configuration
   * @returns the updated policy
   */
  updatePolicy(config: PolicyConfig): PolicyConfig {
    this.policy = { ...config };
    this.ruleCooldowns.clear();
    this.pendingAcks.clear();
    log.info('[PolicyEnforcer] Policy updated');
    return this.getPolicy();
  }

  /**
   * Register a callback to be invoked when an alert is generated.
   * @param callback - function receiving the alert
   */
  onAlert(callback: AlertCallback): void {
    this.alertListeners.push(callback);
  }

  /**
   * Register a callback for policy lifecycle events.
   * Events: 'alert', 'escalation', 'freeze', 'unfreeze'
   * @param callback - function receiving event type and optional data
   */
  onEvent(callback: PolicyEventCallback): void {
    this.eventListeners.push(callback);
  }

  /**
   * Whether the system is currently in a frozen state.
   * @returns true if frozen
   */
  isFrozen(): boolean {
    this.checkFreezeExpiry();
    return this.frozen;
  }

  /**
   * Get detailed freeze status.
   * @returns freeze state with timestamps
   */
  getFreezeStatus(): { frozen: boolean; frozenAt: string | null; frozenUntil: string | null } {
    this.checkFreezeExpiry();
    return {
      frozen: this.frozen,
      frozenAt: this.frozenAt,
      frozenUntil: this.frozenUntil,
    };
  }

  /**
   * Manually release a freeze state.
   * Emits an 'unfreeze' event.
   */
  releaseFreeze(): void {
    if (this.frozen) {
      this.frozen = false;
      this.frozenAt = null;
      this.frozenUntil = null;
      if (this.freezeTimer) {
        clearTimeout(this.freezeTimer);
        this.freezeTimer = null;
      }
      log.info('[PolicyEnforcer] Freeze manually released');
      this.emitPolicyEvent('unfreeze');
    }
  }

  /**
   * Check if a rule is within its cooldown period.
   * @param ruleId - the rule ID to check
   * @returns true if the rule is in cooldown
   */
  private isRuleInCooldown(ruleId: string): boolean {
    const lastTriggered = this.ruleCooldowns.get(ruleId);
    if (!lastTriggered) return false;

    const cooldownMs = this.policy.escalation.cooldownMinutes * 60 * 1000;
    const elapsed = Date.now() - new Date(lastTriggered).getTime();

    return elapsed < cooldownMs;
  }

  /**
   * Activate the auto-freeze state based on policy configuration.
   * Schedules automatic unfreeze after the configured duration.
   */
  private activateFreeze(): void {
    const now = new Date();
    this.frozen = true;
    this.frozenAt = now.toISOString();

    const durationMs = this.policy.autoFreeze.durationMinutes * 60 * 1000;
    this.frozenUntil = new Date(now.getTime() + durationMs).toISOString();

    log.warn(`[PolicyEnforcer] Auto-freeze activated until ${this.frozenUntil}`);

    // Schedule auto-unfreeze
    this.freezeTimer = setTimeout(() => {
      this.checkFreezeExpiry();
    }, durationMs);

    // Emit freeze alert
    const freezeAlert: Alert = {
      id: `freeze-${now.getTime()}`,
      severity: 'critical',
      title: 'System Auto-Freeze Activated',
      description: `Trust score dropped below threshold (${this.policy.autoFreeze.trustScoreThreshold}). System frozen for ${this.policy.autoFreeze.durationMinutes} minutes.`,
      source: 'zoom', // Generic source
      timestamp: now.toISOString(),
      dismissed: false,
      actionTaken: 'auto-freeze',
    };

    this.emitAlert(freezeAlert);
    this.emitPolicyEvent('freeze', { frozenUntil: this.frozenUntil });
  }

  /**
   * Check if the current freeze has expired and release it if so.
   */
  private checkFreezeExpiry(): void {
    if (!this.frozen || !this.frozenUntil) return;

    if (Date.now() >= new Date(this.frozenUntil).getTime()) {
      this.frozen = false;
      this.frozenAt = null;
      this.frozenUntil = null;
      if (this.freezeTimer) {
        clearTimeout(this.freezeTimer);
        this.freezeTimer = null;
      }
      log.info('[PolicyEnforcer] Freeze expired, system unfrozen');
      this.emitPolicyEvent('unfreeze');
    }
  }

  /**
   * Check for unacknowledged alerts that should be escalated.
   * Escalates alerts that haven't been acknowledged within the cooldown period.
   */
  private checkEscalations(): void {
    const cooldownMs = this.policy.escalation.cooldownMinutes * 60 * 1000;

    for (const [alertId, ack] of this.pendingAcks) {
      if (ack.acknowledgedAt) continue;
      if (ack.escalatedAt) continue;

      // Check if cooldown has elapsed since the alert was created
      const ruleLastTriggered = this.ruleCooldowns.get(ack.ruleId);
      if (!ruleLastTriggered) continue;

      const elapsed = Date.now() - new Date(ruleLastTriggered).getTime();
      if (elapsed >= cooldownMs) {
        // Escalate: increase severity
        const escalatedSeverity = this.escalateSeverity(ack.severity);
        ack.escalatedAt = new Date().toISOString();

        const escalationAlert: Alert = {
          id: uuidv4(),
          severity: escalatedSeverity,
          title: `Escalation: Unacknowledged alert ${alertId}`,
          description: `Alert was not acknowledged within ${this.policy.escalation.cooldownMinutes} minutes. Severity escalated from ${ack.severity} to ${escalatedSeverity}.`,
          source: 'zoom',
          timestamp: new Date().toISOString(),
          dismissed: false,
          actionTaken: 'escalated',
        };

        this.emitAlert(escalationAlert);
        this.emitPolicyEvent('escalation', { originalAlertId: alertId, escalatedSeverity });

        log.warn(
          `[PolicyEnforcer] Alert ${alertId} escalated: ${ack.severity} → ${escalatedSeverity}`,
        );
      }
    }
  }

  /**
   * Escalate severity to the next higher level.
   * @param current - current severity level
   * @returns next higher severity level
   */
  private escalateSeverity(current: Alert['severity']): Alert['severity'] {
    const levels: Alert['severity'][] = ['low', 'medium', 'high', 'critical'];
    const idx = levels.indexOf(current);
    return levels[Math.min(idx + 1, levels.length - 1)];
  }

  /**
   * Emit an alert to all registered alert listeners.
   * @param alert - the alert to emit
   */
  private emitAlert(alert: Alert): void {
    log.info(`[PolicyEnforcer] Alert: [${alert.severity.toUpperCase()}] ${alert.title}`);

    for (const listener of this.alertListeners) {
      try {
        listener(alert);
      } catch (err) {
        log.error('[PolicyEnforcer] Error in alert listener:', err);
      }
    }

    this.emitPolicyEvent('alert', alert);
  }

  /**
   * Emit a policy lifecycle event to all registered event listeners.
   * @param event - the event type
   * @param data - optional event data
   */
  private emitPolicyEvent(event: PolicyEvent, data?: unknown): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event, data);
      } catch (err) {
        log.error('[PolicyEnforcer] Error in event listener:', err);
      }
    }
  }
}
