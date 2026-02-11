import log from 'electron-log';
import type { TrustState, PolicyConfig, Alert } from '@qshield/core';
import { evaluatePolicy, createDefaultPolicy } from '@qshield/core';
import type { PolicyEvaluationResult } from '@qshield/core';

type AlertCallback = (alert: Alert) => void;

/**
 * Policy evaluation and alerting service.
 * Evaluates trust state against configured policy rules, generates alerts
 * for violations, tracks escalation cooldowns to prevent alert spam,
 * and manages auto-freeze state.
 */
export class PolicyEnforcer {
  private policy: PolicyConfig;
  private alertListeners: AlertCallback[] = [];
  private frozen = false;
  private frozenAt: string | null = null;
  private frozenUntil: string | null = null;

  /**
   * Tracks the last time each rule triggered an alert.
   * Keyed by rule ID, value is ISO 8601 timestamp.
   * Used to enforce escalation cooldown periods.
   */
  private ruleCooldowns: Map<string, string> = new Map();

  constructor() {
    this.policy = createDefaultPolicy();
    log.info('[PolicyEnforcer] Initialized with default policy');
  }

  /**
   * Evaluate the current trust state against all enabled policy rules.
   * Returns triggered rules, generated alerts, and freeze/escalation flags.
   * Respects escalation cooldowns to prevent alert spam.
   */
  evaluate(trustState: TrustState): PolicyEvaluationResult {
    // Check if currently frozen and whether freeze has expired
    this.checkFreezeExpiry();

    // Evaluate all policy rules against the trust state
    const result = evaluatePolicy(this.policy, trustState);

    // Filter alerts through cooldown check
    const cooledDownAlerts: Alert[] = [];
    for (let i = 0; i < result.alerts.length; i++) {
      const alert = result.alerts[i];
      const rule = result.triggeredRules[i];

      if (rule && this.isRuleInCooldown(rule.id)) {
        log.debug(
          `[PolicyEnforcer] Alert suppressed for rule "${rule.name}" (in cooldown)`,
        );
        continue;
      }

      // Record this trigger time for cooldown tracking
      if (rule) {
        this.ruleCooldowns.set(rule.id, new Date().toISOString());
      }

      cooledDownAlerts.push(alert);
    }

    // Emit alerts to listeners
    for (const alert of cooledDownAlerts) {
      this.emitAlert(alert);
    }

    // Handle auto-freeze
    if (result.shouldFreeze && !this.frozen) {
      this.activateFreeze();
    }

    log.debug(
      `[PolicyEnforcer] Evaluation complete: ${result.triggeredRules.length} rules triggered, ${cooledDownAlerts.length} alerts emitted, freeze=${this.frozen}`,
    );

    return {
      triggeredRules: result.triggeredRules,
      alerts: cooledDownAlerts,
      shouldFreeze: result.shouldFreeze,
      shouldEscalate: result.shouldEscalate,
    };
  }

  /**
   * Get the current policy configuration.
   */
  getPolicy(): PolicyConfig {
    return { ...this.policy };
  }

  /**
   * Update the policy configuration.
   * Returns the updated policy.
   */
  updatePolicy(config: PolicyConfig): PolicyConfig {
    this.policy = { ...config };
    // Clear cooldowns when policy changes since rule IDs may have changed
    this.ruleCooldowns.clear();
    log.info('[PolicyEnforcer] Policy updated');
    return this.getPolicy();
  }

  /**
   * Register a callback to be invoked when an alert is generated.
   */
  onAlert(callback: AlertCallback): void {
    this.alertListeners.push(callback);
  }

  /**
   * Whether the system is currently in a frozen state.
   */
  isFrozen(): boolean {
    this.checkFreezeExpiry();
    return this.frozen;
  }

  /**
   * Get freeze status details.
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
   */
  releaseFreeze(): void {
    if (this.frozen) {
      this.frozen = false;
      this.frozenAt = null;
      this.frozenUntil = null;
      log.info('[PolicyEnforcer] Freeze manually released');
    }
  }

  /**
   * Check if a rule is within its cooldown period.
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
   */
  private activateFreeze(): void {
    const now = new Date();
    this.frozen = true;
    this.frozenAt = now.toISOString();

    const durationMs = this.policy.autoFreeze.durationMinutes * 60 * 1000;
    this.frozenUntil = new Date(now.getTime() + durationMs).toISOString();

    log.warn(
      `[PolicyEnforcer] Auto-freeze activated until ${this.frozenUntil}`,
    );

    // Emit a freeze alert
    const freezeAlert: Alert = {
      id: `freeze-${now.getTime()}`,
      severity: 'critical',
      title: 'System Auto-Freeze Activated',
      description: `Trust score dropped below threshold (${this.policy.autoFreeze.trustScoreThreshold}). System frozen for ${this.policy.autoFreeze.durationMinutes} minutes.`,
      source: 'zoom', // Source is required; use a general source
      timestamp: now.toISOString(),
      dismissed: false,
      actionTaken: 'auto-freeze',
    };

    this.emitAlert(freezeAlert);
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
      log.info('[PolicyEnforcer] Freeze expired, system unfrozen');
    }
  }

  /**
   * Emit an alert to all registered listeners.
   */
  private emitAlert(alert: Alert): void {
    log.info(
      `[PolicyEnforcer] Alert: [${alert.severity.toUpperCase()}] ${alert.title}`,
    );

    for (const listener of this.alertListeners) {
      try {
        listener(alert);
      } catch (err) {
        log.error('[PolicyEnforcer] Error in alert listener:', err);
      }
    }
  }
}
