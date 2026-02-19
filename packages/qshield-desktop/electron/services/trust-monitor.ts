import log from 'electron-log';
import { v4 as uuidv4 } from 'uuid';
import type { TrustState, TrustSignal, AdapterEvent, Alert, EvidenceRecord, AssetChangeEvent, AssetSensitivity } from '@qshield/core';
import { buildTrustState, createEvidenceRecord, SENSITIVITY_MULTIPLIERS } from '@qshield/core';
import type { AssetMonitor } from './asset-monitor';
import type { AssetStore } from './asset-store';
import type { EmailNotifierService } from './email-notifier';
import type { QShieldAdapter } from '../adapters/adapter-interface';
import type { AdapterOptions } from '../adapters/adapter-interface';
import { ZoomAdapter } from '../adapters/zoom';
import { TeamsAdapter } from '../adapters/teams';
import { EmailAdapter } from '../adapters/email';
import { FileWatcherAdapter } from '../adapters/file-watcher';
import { ApiListenerAdapter } from '../adapters/api-listener';
import { PolicyEnforcer } from './policy-enforcer';
import type { GoogleAuthService } from './google-auth';
import { TrustHistoryService } from './trust-history';

/** Events emitted by the TrustMonitor */
export type TrustMonitorEvent = 'state-change' | 'signal' | 'alert';

type TrustStateSubscriber = (state: TrustState) => void;
type MonitorEventCallback = (event: TrustMonitorEvent, data?: unknown) => void;

/** Threshold for trust impact magnitude to be considered significant enough for evidence */
const EVIDENCE_THRESHOLD = 10;

/** Maximum number of signals to retain in the rolling window */
const MAX_SIGNALS = 200;

/** Maximum number of evidence records to retain */
const MAX_EVIDENCE = 200;

/** Base trust impact for high-trust asset event types */
const ASSET_BASE_IMPACT: Record<string, number> = {
  'asset-created': -5,
  'asset-modified': -15,
  'asset-deleted': -30,
  'asset-renamed': -10,
  'asset-permission-changed': -20,
};

/**
 * Compute global trust impact for a high-trust asset change event.
 * Uses SENSITIVITY_MULTIPLIERS (normal: 1.5x, strict: 3x, critical: 5x)
 * to amplify the base impact for higher sensitivity assets.
 */
function computeAssetTrustImpact(event: AssetChangeEvent): number {
  const base = ASSET_BASE_IMPACT[event.eventType] ?? -10;
  const multiplier = SENSITIVITY_MULTIPLIERS[event.sensitivity as AssetSensitivity] ?? 1.5;
  return Math.round(base * multiplier);
}

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
  private trustHistory: TrustHistoryService;
  private snapshotInterval: ReturnType<typeof setInterval> | null = null;
  private assetStoreRef: AssetStore | null = null;
  private emailNotifierRef: EmailNotifierService | null = null;
  private hmacKey: string;

  /**
   * Create a new TrustMonitor with all adapters and a policy enforcer.
   * @param googleAuth - optional GoogleAuthService for Gmail adapter (if omitted, email adapter starts idle)
   * @param policyEnforcer - optional policy enforcer instance (creates default if omitted)
   * @param hmacKey - optional HMAC key for evidence hashing (falls back to legacy default)
   */
  constructor(googleAuth?: GoogleAuthService, policyEnforcer?: PolicyEnforcer, hmacKey?: string) {
    this.hmacKey = hmacKey ?? 'qshield-evidence-hmac-key-v1';
    this.sessionId = uuidv4();
    this.policyEnforcer = policyEnforcer ?? new PolicyEnforcer();
    this.trustHistory = new TrustHistoryService();

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
      this.checkEmailNotification(alert);
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

    // Compute yesterday's daily summary if it hasn't been computed yet
    try {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      const existing = this.trustHistory.getDailySummary(yesterday);
      if (!existing) {
        this.trustHistory.computeDailySummary(yesterday);
      }
    } catch (err) {
      log.warn('[TrustMonitor] Failed to compute yesterday summary:', err);
    }

    // Start 5-minute snapshot interval
    this.snapshotInterval = setInterval(() => {
      this.recordTrustSnapshot();
    }, 5 * 60 * 1000);

    // Record an initial snapshot right away
    this.recordTrustSnapshot();

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

    // Stop snapshot interval
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
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
   * Inject pre-built evidence records (for seed/demo data).
   * Records are prepended (newest first) and the chain pointers are NOT updated
   * so they stay independent of the live chain.
   */
  injectSeedEvidence(records: EvidenceRecord[]): void {
    this.evidenceRecords.push(...records);
    this.evidenceRecords.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    // Also inject corresponding TrustSignals so they appear in the timeline
    for (const record of records) {
      const payload = record.payload as Record<string, unknown>;
      const trustImpact = (payload.trustImpact as number) ?? 0;
      const score = Math.max(0, Math.min(100, 50 + trustImpact));

      // Build metadata from payload, excluding trustImpact (already used for score)
      const { trustImpact: _unused, ...rest } = payload;
      const metadata: Record<string, unknown> = {
        eventType: record.eventType,
        ...rest,
      };

      this.signals.push({
        source: record.source,
        score,
        weight: 1.0,
        timestamp: record.timestamp,
        metadata,
      });
    }

    // Trim signals if needed
    if (this.signals.length > MAX_SIGNALS) {
      this.signals = this.signals.slice(-MAX_SIGNALS);
    }

    // Rebuild trust state with the new signals
    this.updateTrustState();

    log.info(`[TrustMonitor] Injected ${records.length} seed evidence records + signals`);
  }

  /**
   * Get the HMAC key used for evidence record hashing.
   * @returns the HMAC key string
   */
  getHmacKey(): string {
    return this.hmacKey;
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
   * Connect an AssetStore so that snapshot stats include asset counts.
   * @param store - the asset store instance
   */
  connectAssetStore(store: AssetStore): void {
    this.assetStoreRef = store;
    log.info('[TrustMonitor] AssetStore connected for snapshot stats');
  }

  /**
   * Connect an EmailNotifierService so that policy alerts trigger email notifications.
   */
  connectEmailNotifier(notifier: EmailNotifierService): void {
    this.emailNotifierRef = notifier;
    log.info('[TrustMonitor] EmailNotifier connected — alerts will trigger email notifications');
  }

  /**
   * Check whether an alert should trigger an email notification and send it.
   */
  private async checkEmailNotification(alert: Alert): Promise<void> {
    if (!this.emailNotifierRef) return;

    const config = this.emailNotifierRef.getConfig();
    if (!config.enabled || !config.recipientEmail) return;

    const meta = (alert.sourceMetadata?.rawEvent ?? {}) as Record<string, unknown>;
    const source = alert.source ?? '';
    const title = alert.title ?? '';

    log.info(`[TrustMonitor] Checking email notification: "${title}" source=${source} sensitivity=${meta.sensitivity ?? 'none'}`);

    // High-trust asset change
    if (source === 'file' && meta.sensitivity) {
      const sensitivity = meta.sensitivity as string;
      if (sensitivity === 'strict' || sensitivity === 'critical') {
        await this.emailNotifierRef.notifyAssetChange({
          name: (meta.assetName as string) ?? 'Unknown asset',
          path: (meta.path as string) ?? '',
          event: (meta.eventType as string) ?? 'modified',
        });
        return;
      }
    }

    // SPF/DKIM failure
    const titleLower = title.toLowerCase();
    if (titleLower.includes('spf') && titleLower.includes('fail')) {
      await this.emailNotifierRef.notifySpfDkimFailure({
        email: (meta.from as string) ?? (meta.domain as string) ?? 'unknown',
        failure: 'SPF check failed',
      });
      return;
    }
    if (titleLower.includes('dkim') && titleLower.includes('fail')) {
      await this.emailNotifierRef.notifySpfDkimFailure({
        email: (meta.from as string) ?? (meta.domain as string) ?? 'unknown',
        failure: 'DKIM check failed',
      });
      return;
    }

    // Score drop — check in handleAdapterEvent instead (below threshold)
  }

  /**
   * Get the TrustHistoryService instance for direct access.
   * @returns the trust history service
   */
  getTrustHistory(): TrustHistoryService {
    return this.trustHistory;
  }

  /**
   * Connect an AssetMonitor so that high-trust asset changes feed into
   * the global trust scoring pipeline as AdapterEvents.
   * @param assetMonitor - the asset monitor instance to wire up
   */
  connectAssetMonitor(assetMonitor: AssetMonitor): void {
    assetMonitor.onAssetChange((event, asset) => {
      const adapterEvent: AdapterEvent = {
        adapterId: 'file',
        eventType: `high-trust:${event.eventType}`,
        timestamp: event.timestamp,
        data: {
          assetId: event.assetId,
          assetName: asset.name,
          sensitivity: event.sensitivity,
          previousHash: event.previousHash,
          newHash: event.newHash,
          trustStateBefore: event.trustStateBefore,
          trustStateAfter: event.trustStateAfter,
          path: event.path,
        },
        trustImpact: computeAssetTrustImpact(event),
      };
      this.handleAdapterEvent(adapterEvent);
    });
    log.info('[TrustMonitor] AssetMonitor connected — high-trust asset changes feed into trust score');
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

    // Close trust history database
    try {
      this.trustHistory.close();
    } catch (err) {
      log.error('[TrustMonitor] Failed to close trust history:', err);
    }

    this.subscribers = [];
    this.eventListeners = [];
    this.signals = [];
    log.info('[TrustMonitor] Destroyed');
  }

  /**
   * Record a trust snapshot with current stats from adapters and asset store.
   * Called every 5 minutes by the snapshot interval.
   */
  private recordTrustSnapshot(): void {
    try {
      const adapterStatuses = this.getAdapterStatuses();
      const assetStats = this.assetStoreRef?.getStats();

      this.trustHistory.recordSnapshot(this.currentState.score, this.currentState.level, {
        eventCount: this.evidenceRecords.length,
        anomalyCount: this.signals.filter((s) => s.score < 30).length,
        channelsActive: adapterStatuses.filter((a) => a.connected).length,
        assetsMonitored: assetStats?.total ?? 0,
        assetsVerified: assetStats?.verified ?? 0,
        assetsChanged: assetStats?.changed ?? 0,
      });

      // Check milestones after each snapshot
      const streak = this.trustHistory.getCurrentStreak();
      this.trustHistory.checkMilestones(
        this.currentState.score,
        streak,
        this.evidenceRecords.length,
        assetStats?.total ?? 0,
      );
    } catch (err) {
      log.error('[TrustMonitor] Failed to record trust snapshot:', err);
    }
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

    // Check for score drop email notification
    if (this.emailNotifierRef && this.currentState.score < previousScore) {
      this.emailNotifierRef.notifyScoreDrop(this.currentState.score, previousScore).catch((err) => {
        log.error('[TrustMonitor] Email score-drop notification failed:', err);
      });
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
        this.hmacKey,
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
