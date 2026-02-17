import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { TrustState, TrustSignal, AdapterEvent, Alert, EvidenceRecord } from '@qshield/core';
import { buildTrustState, createEvidenceRecord } from '@qshield/core';
import type { QShieldAdapter } from '../adapters/adapter-interface';
import type { AdapterOptions } from '../adapters/adapter-interface';
import { ZoomAdapter } from '../adapters/zoom';
import { TeamsAdapter } from '../adapters/teams';
import { EmailAdapter } from '../adapters/email';
import { FileWatcherAdapter } from '../adapters/file-watcher';
import { ApiListenerAdapter } from '../adapters/api-listener';
import { PolicyEnforcer } from './policy-enforcer';
import type { GoogleAuthService } from './google-auth';

/** Events emitted by the TrustMonitor */
export type TrustMonitorEvent = 'state-change' | 'signal' | 'alert';

type TrustStateSubscriber = (state: TrustState) => void;
type MonitorEventCallback = (event: TrustMonitorEvent, data?: unknown) => void;

/** Threshold for trust impact magnitude to be considered significant enough for evidence */
const EVIDENCE_THRESHOLD = 10;

/** HMAC key for evidence record hashing */
const EVIDENCE_HMAC_KEY = 'qshield-evidence-hmac-key-v1';

/** Maximum number of signals to retain in the rolling window */
const MAX_SIGNALS = 200;

/** Maximum number of evidence records to retain */
const MAX_EVIDENCE = 200;

/**
 * Central trust monitoring orchestrator.
 *
 * Manages all 5 monitoring adapters (Zoom, Teams, Email, File Watcher,
 * API Listener), converts their events into TrustSignals, maintains
 * the current TrustState via the trust scorer, creates tamper-evident
 * evidence records for significant events, and feeds signals to the
 * policy enforcer for rule evaluation.
 *
 * Emits events for: state-change, signal, alert.
 */
export class TrustMonitor {
  private adapters: QShieldAdapter[];
  private signals: TrustSignal[] = [];
  private subscribers: TrustStateSubscriber[] = [];
  private eventListeners: MonitorEventCallback[] = [];
  private currentState: TrustState;
  private sessionId: string;
  private evidenceRecords: EvidenceRecord[] = [];
  private lastEvidenceHash: string | null = null;
  private lastStructureHash: string | null = null;
  private running = false;
  private policyEnforcer: PolicyEnforcer;

  /**
   * Create a new TrustMonitor with all adapters and a policy enforcer.
   * @param googleAuth - optional GoogleAuthService for Gmail adapter (if omitted, email adapter starts idle)
   * @param policyEnforcer - optional policy enforcer instance (creates default if omitted)
   */
  constructor(googleAuth?: GoogleAuthService, policyEnforcer?: PolicyEnforcer) {
    this.sessionId = uuidv4();
    this.policyEnforcer = policyEnforcer ?? new PolicyEnforcer();

    // GoogleAuthService is required by EmailAdapter; create a default if not provided
    const authService = googleAuth ?? (new (require('./google-auth').GoogleAuthService)() as GoogleAuthService);

    this.adapters = [
      new ZoomAdapter(),
      new TeamsAdapter(),
      new EmailAdapter(authService),  // REAL — needs GoogleAuthService
      // FileWatcherAdapter disabled — chokidar opens thousands of FDs on
      // large directories, exhausting the FD pool and causing EBADF errors
      // for all other adapters that use execSync (Zoom, Teams).
      // new FileWatcherAdapter(),
      new ApiListenerAdapter(),
    ];

    // Initialize with a baseline trust state (neutral score)
    this.currentState = buildTrustState([], this.sessionId);

    // Wire up policy enforcer alert events
    this.policyEnforcer.onAlert((alert: Alert) => {
      this.emitMonitorEvent('alert', alert);
    });

    log.info(
      `[TrustMonitor] Initialized with session ${this.sessionId} and ${this.adapters.length} adapters`,
    );
  }

  /**
   * Initialize and start all adapters, begin monitoring.
   * Subscribes to adapter events and starts event generation.
   */
  async start(): Promise<void> {
    if (this.running) {
      log.warn('[TrustMonitor] Already running');
      return;
    }

    log.info('[TrustMonitor] Starting all adapters...');

    for (const adapter of this.adapters) {
      try {
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
   * Adapters can be restarted with start().
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
   * @returns a copy of the current TrustState
   */
  getState(): TrustState {
    return { ...this.currentState };
  }

  /**
   * Get the current session ID.
   * @returns the session UUID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get all stored evidence records (newest first).
   * @returns array of evidence records
   */
  getEvidenceRecords(): EvidenceRecord[] {
    return [...this.evidenceRecords];
  }

  /**
   * Get the policy enforcer instance for direct access.
   * @returns the policy enforcer
   */
  getPolicyEnforcer(): PolicyEnforcer {
    return this.policyEnforcer;
  }

  /**
   * Subscribe to trust state updates. The callback is invoked
   * every time the trust state changes.
   * @param callback - function receiving the new trust state
   */
  subscribe(callback: TrustStateSubscriber): void {
    this.subscribers.push(callback);
    log.debug(`[TrustMonitor] Subscriber added (total: ${this.subscribers.length})`);
  }

  /**
   * Unsubscribe from trust state updates.
   * @param callback - the callback to remove
   */
  unsubscribe(callback: TrustStateSubscriber): void {
    const index = this.subscribers.indexOf(callback);
    if (index >= 0) {
      this.subscribers.splice(index, 1);
      log.debug(`[TrustMonitor] Subscriber removed (total: ${this.subscribers.length})`);
    }
  }

  /**
   * Register a callback for monitor lifecycle events.
   * Events: 'state-change', 'signal', 'alert'
   * @param callback - function receiving event type and optional data
   */
  onEvent(callback: MonitorEventCallback): void {
    this.eventListeners.push(callback);
  }

  /**
   * Get the status of all managed adapters.
   * @returns array of adapter status objects
   */
  getAdapterStatuses() {
    return this.adapters.map((adapter) => adapter.getStatus());
  }

  /**
   * Configure a specific adapter by its ID.
   * @param adapterId - the adapter type to configure
   * @param options - configuration options to apply
   * @returns true if the adapter was found and configured
   */
  configureAdapter(adapterId: string, options: AdapterOptions): boolean {
    const adapter = this.adapters.find((a) => a.id === adapterId);
    if (!adapter) {
      log.warn(`[TrustMonitor] Adapter not found: ${adapterId}`);
      return false;
    }
    adapter.configure(options);
    return true;
  }

  /**
   * Start a specific adapter by its ID.
   * @param adapterId - the adapter type to start
   * @returns true if the adapter was found and started
   */
  async startAdapter(adapterId: string): Promise<boolean> {
    const adapter = this.adapters.find((a) => a.id === adapterId);
    if (!adapter) return false;
    await adapter.start();
    return true;
  }

  /**
   * Stop a specific adapter by its ID.
   * @param adapterId - the adapter type to stop
   * @returns true if the adapter was found and stopped
   */
  async stopAdapter(adapterId: string): Promise<boolean> {
    const adapter = this.adapters.find((a) => a.id === adapterId);
    if (!adapter) return false;
    await adapter.stop();
    return true;
  }

  /**
   * Destroy all adapters and clean up resources.
   * The monitor cannot be restarted after destruction.
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
    this.eventListeners = [];
    this.signals = [];
    log.info('[TrustMonitor] Destroyed');
  }

  /**
   * Handle an incoming adapter event by converting it to a trust signal,
   * updating the trust state, creating evidence for significant events,
   * and feeding the signal to the policy enforcer.
   * @param event - the adapter event to process
   */
  private handleAdapterEvent(event: AdapterEvent): void {
    log.info(
      `[TrustMonitor] EVENT RECEIVED: ${event.adapterId} ${event.eventType} (impact: ${event.trustImpact})`,
    );

    // Convert AdapterEvent to TrustSignal
    const signal = this.eventToSignal(event);
    this.signals.push(signal);

    // Trim signals to prevent unbounded growth
    if (this.signals.length > MAX_SIGNALS) {
      this.signals = this.signals.slice(-MAX_SIGNALS);
    }

    // Emit signal event
    this.emitMonitorEvent('signal', signal);

    // Update trust state
    const previousScore = this.currentState.score;
    this.updateTrustState();

    // Create evidence record for significant events
    if (Math.abs(event.trustImpact) >= EVIDENCE_THRESHOLD) {
      this.createEvidence(event);
    }

    // Feed to policy enforcer (only if score changed significantly)
    if (Math.abs(this.currentState.score - previousScore) > 0) {
      const result = this.policyEnforcer.evaluate(this.currentState);

      // If policy enforcer triggered a freeze, stop all adapters
      if (result.shouldFreeze && this.policyEnforcer.isFrozen()) {
        log.warn('[TrustMonitor] Policy freeze triggered, stopping adapters');
        this.stop();
      }
    }
  }

  /**
   * Convert an AdapterEvent into a TrustSignal.
   * The trust impact (-100 to +100) is mapped to a score (0 to 100),
   * centered at 50.
   * @param event - the adapter event to convert
   * @returns the corresponding TrustSignal
   */
  private eventToSignal(event: AdapterEvent): TrustSignal {
    const baseScore = 50;
    const score = Math.max(0, Math.min(100, baseScore + event.trustImpact));

    // Deep-clone metadata via JSON round-trip to ensure all values are
    // plain JSON-safe primitives. Without this, Electron's structured clone
    // serialisation over IPC can produce garbled Unicode replacement
    // characters (U+FFFD) for certain value types (e.g. Buffers leaking
    // from child_process, or object prototypes that don't survive cloning).
    const rawMetadata = {
      eventType: event.eventType,
      ...event.data,
    };
    const metadata: Record<string, unknown> = JSON.parse(JSON.stringify(rawMetadata));

    return {
      source: event.adapterId,
      score,
      weight: 1.0,
      timestamp: event.timestamp,
      metadata,
    };
  }

  /**
   * Rebuild the trust state from the current signal set and notify
   * all subscribers and event listeners.
   */
  private updateTrustState(): void {
    const previousLevel = this.currentState.level;
    this.currentState = buildTrustState(this.signals, this.sessionId);

    // Notify subscribers
    for (const subscriber of this.subscribers) {
      try {
        subscriber(this.currentState);
      } catch (err) {
        log.error('[TrustMonitor] Error in subscriber callback:', err);
      }
    }

    // Emit state-change event if level changed
    if (this.currentState.level !== previousLevel) {
      this.emitMonitorEvent('state-change', {
        previousLevel,
        currentLevel: this.currentState.level,
        score: this.currentState.score,
      });
    }
  }

  /**
   * Create a tamper-evident evidence record for a significant event.
   * Records are linked via hash chain for integrity verification.
   * @param event - the adapter event to record
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
        this.lastStructureHash,
        this.sessionId,
        EVIDENCE_HMAC_KEY,
      );

      this.lastEvidenceHash = record.hash;
      this.lastStructureHash = record.structureHash;

      // Store the record (newest first, capped)
      this.evidenceRecords.unshift(record);
      if (this.evidenceRecords.length > MAX_EVIDENCE) {
        this.evidenceRecords = this.evidenceRecords.slice(0, MAX_EVIDENCE);
      }

      log.info(
        `[TrustMonitor] Evidence record created: ${record.id} (${event.eventType}, chain: ${record.hash.substring(0, 12)}...)`,
      );
    } catch (err) {
      log.error('[TrustMonitor] Failed to create evidence record:', err);
    }
  }

  /**
   * Emit a monitor lifecycle event to all registered event listeners.
   * @param event - the event type
   * @param data - optional event data
   */
  private emitMonitorEvent(event: TrustMonitorEvent, data?: unknown): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event, data);
      } catch (err) {
        log.error('[TrustMonitor] Error in event listener:', err);
      }
    }
  }
}
