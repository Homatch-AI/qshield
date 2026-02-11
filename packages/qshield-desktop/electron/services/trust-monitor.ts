import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { TrustState, TrustSignal, AdapterEvent } from '@qshield/core';
import { buildTrustState, createEvidenceRecord } from '@qshield/core';
import type { QShieldAdapter } from '../adapters/adapter-interface';
import { ZoomAdapter } from '../adapters/zoom';
import { TeamsAdapter } from '../adapters/teams';
import { EmailAdapter } from '../adapters/email';
import { FileWatcherAdapter } from '../adapters/file-watcher';
import { ApiListenerAdapter } from '../adapters/api-listener';

type TrustStateSubscriber = (state: TrustState) => void;

/** Threshold for trust impact magnitude to be considered significant enough for evidence */
const EVIDENCE_THRESHOLD = 10;

/** HMAC key for evidence record hashing */
const EVIDENCE_HMAC_KEY = 'qshield-evidence-hmac-key-v1';

/** Maximum number of signals to retain in the rolling window */
const MAX_SIGNALS = 200;

/**
 * Signal aggregation orchestrator.
 * Manages all monitoring adapters, converts their events into trust signals,
 * maintains the current TrustState, and creates tamper-evident evidence records
 * for significant events.
 */
export class TrustMonitor {
  private adapters: QShieldAdapter[];
  private signals: TrustSignal[] = [];
  private subscribers: TrustStateSubscriber[] = [];
  private currentState: TrustState;
  private sessionId: string;
  private lastEvidenceHash: string | null = null;
  private running = false;

  constructor() {
    this.sessionId = uuidv4();
    this.adapters = [
      new ZoomAdapter(),
      new TeamsAdapter(),
      new EmailAdapter(),
      new FileWatcherAdapter(),
      new ApiListenerAdapter(),
    ];

    // Initialize with a baseline trust state (neutral score)
    this.currentState = buildTrustState([], this.sessionId);

    log.info(`[TrustMonitor] Initialized with session ${this.sessionId} and ${this.adapters.length} adapters`);
  }

  /**
   * Initialize and start all adapters, begin monitoring.
   */
  async start(): Promise<void> {
    if (this.running) {
      log.warn('[TrustMonitor] Already running');
      return;
    }

    log.info('[TrustMonitor] Starting all adapters...');

    for (const adapter of this.adapters) {
      try {
        // Subscribe to adapter events before starting
        adapter.onEvent((event: AdapterEvent) => {
          this.handleAdapterEvent(event);
        });

        await adapter.initialize({});
        await adapter.start();
        log.info(`[TrustMonitor] Adapter ${adapter.name} started`);
      } catch (err) {
        log.error(`[TrustMonitor] Failed to start adapter ${adapter.name}:`, err);
      }
    }

    this.running = true;
    log.info('[TrustMonitor] All adapters started, monitoring active');
  }

  /**
   * Stop all adapters and cease monitoring.
   */
  async stop(): Promise<void> {
    if (!this.running) {
      log.warn('[TrustMonitor] Not currently running');
      return;
    }

    log.info('[TrustMonitor] Stopping all adapters...');

    for (const adapter of this.adapters) {
      try {
        await adapter.stop();
        log.info(`[TrustMonitor] Adapter ${adapter.name} stopped`);
      } catch (err) {
        log.error(`[TrustMonitor] Failed to stop adapter ${adapter.name}:`, err);
      }
    }

    this.running = false;
    log.info('[TrustMonitor] Monitoring stopped');
  }

  /**
   * Get the current trust state.
   */
  getState(): TrustState {
    return { ...this.currentState };
  }

  /**
   * Subscribe to trust state updates. The callback is invoked
   * every time the trust state changes.
   */
  subscribe(callback: TrustStateSubscriber): void {
    this.subscribers.push(callback);
    log.debug(`[TrustMonitor] Subscriber added (total: ${this.subscribers.length})`);
  }

  /**
   * Unsubscribe from trust state updates.
   */
  unsubscribe(callback: TrustStateSubscriber): void {
    const index = this.subscribers.indexOf(callback);
    if (index >= 0) {
      this.subscribers.splice(index, 1);
      log.debug(`[TrustMonitor] Subscriber removed (total: ${this.subscribers.length})`);
    }
  }

  /**
   * Get the status of all managed adapters.
   */
  getAdapterStatuses() {
    return this.adapters.map((adapter) => adapter.getStatus());
  }

  /**
   * Destroy all adapters and clean up resources.
   */
  async destroy(): Promise<void> {
    await this.stop();

    for (const adapter of this.adapters) {
      try {
        await adapter.destroy();
      } catch (err) {
        log.error(`[TrustMonitor] Failed to destroy adapter ${adapter.name}:`, err);
      }
    }

    this.subscribers = [];
    this.signals = [];
    log.info('[TrustMonitor] Destroyed');
  }

  /**
   * Handle an incoming adapter event by converting it to a trust signal,
   * updating the trust state, and optionally creating an evidence record.
   */
  private handleAdapterEvent(event: AdapterEvent): void {
    log.debug(
      `[TrustMonitor] Event from ${event.adapterId}: ${event.eventType} (impact: ${event.trustImpact})`,
    );

    // Convert AdapterEvent to TrustSignal
    const signal = this.eventToSignal(event);
    this.signals.push(signal);

    // Trim signals to prevent unbounded growth
    if (this.signals.length > MAX_SIGNALS) {
      this.signals = this.signals.slice(-MAX_SIGNALS);
    }

    // Update trust state
    this.updateTrustState();

    // Create evidence record for significant events
    if (Math.abs(event.trustImpact) >= EVIDENCE_THRESHOLD) {
      this.createEvidence(event);
    }
  }

  /**
   * Convert an AdapterEvent into a TrustSignal.
   * The trust impact (-100 to +100) is mapped to a score (0 to 100).
   */
  private eventToSignal(event: AdapterEvent): TrustSignal {
    // Map trust impact to a 0-100 score centered at 50
    // Positive impacts push toward 100, negative toward 0
    const baseScore = 50;
    const score = Math.max(0, Math.min(100, baseScore + event.trustImpact));

    return {
      source: event.adapterId,
      score,
      weight: 1.0,
      timestamp: event.timestamp,
      metadata: {
        eventType: event.eventType,
        ...event.data,
      },
    };
  }

  /**
   * Rebuild the trust state from the current signal set and notify subscribers.
   */
  private updateTrustState(): void {
    this.currentState = buildTrustState(this.signals, this.sessionId);

    // Notify all subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber(this.currentState);
      } catch (err) {
        log.error('[TrustMonitor] Error in subscriber callback:', err);
      }
    }
  }

  /**
   * Create a tamper-evident evidence record for a significant event.
   * Records are linked via hash chain for integrity verification.
   */
  private createEvidence(event: AdapterEvent): void {
    try {
      const record = createEvidenceRecord(
        event.adapterId,
        event.eventType,
        {
          trustImpact: event.trustImpact,
          ...event.data,
        },
        this.lastEvidenceHash,
        EVIDENCE_HMAC_KEY,
      );

      this.lastEvidenceHash = record.hash;

      log.info(
        `[TrustMonitor] Evidence record created: ${record.id} (${event.eventType}, chain: ${record.hash.substring(0, 12)}...)`,
      );
    } catch (err) {
      log.error('[TrustMonitor] Failed to create evidence record:', err);
    }
  }
}
