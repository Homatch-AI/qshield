import log from 'electron-log';
import type { AdapterType, AdapterStatus, AdapterEvent } from '@qshield/core';

/**
 * Configuration options for adapter behavior.
 */
export interface AdapterOptions {
  /** Interval in milliseconds between simulated events */
  pollInterval?: number;
  /** Whether the adapter is enabled */
  enabled?: boolean;
  /** Custom configuration key-value pairs */
  [key: string]: unknown;
}

/**
 * Interface that all QShield monitoring adapters must implement.
 * Each adapter represents a communication channel or data source
 * that contributes trust signals to the overall trust score.
 */
export interface QShieldAdapter {
  /** Unique identifier for this adapter type */
  readonly id: AdapterType;
  /** Human-readable display name */
  readonly name: string;

  /**
   * Initialize the adapter with the given configuration.
   * Must be called before start().
   * @param config - key-value configuration options
   */
  initialize(config: Record<string, unknown>): Promise<void>;

  /**
   * Start the adapter and begin generating events.
   * Requires prior initialization via initialize().
   */
  start(): Promise<void>;

  /**
   * Stop the adapter and cease event generation.
   * Can be restarted with start().
   */
  stop(): Promise<void>;

  /**
   * Get the current operational status of this adapter.
   * @returns snapshot of adapter health and counters
   */
  getStatus(): AdapterStatus;

  /**
   * Register a callback to receive adapter events.
   * @param callback - function invoked with each emitted event
   */
  onEvent(callback: (event: AdapterEvent) => void): void;

  /**
   * Update the adapter's runtime configuration.
   * @param options - configuration options to apply
   */
  configure(options: AdapterOptions): void;

  /**
   * Permanently destroy the adapter, releasing all resources.
   * Cannot be restarted after destruction.
   */
  destroy(): Promise<void>;
}

type EventListener = (event: AdapterEvent) => void;

/**
 * Abstract base class implementing common adapter functionality.
 * Concrete adapters extend this and provide domain-specific event generation
 * via the `generateSimulatedEvent()` method.
 *
 * Provides:
 * - Lifecycle management (initialize, start, stop, destroy)
 * - Event emission to registered listeners
 * - Configurable simulation interval
 * - Error counting and status reporting
 */
export abstract class BaseAdapter implements QShieldAdapter {
  abstract readonly id: AdapterType;
  abstract readonly name: string;

  protected enabled = false;
  protected connected = false;
  protected eventCount = 0;
  protected errorCount = 0;
  protected lastEvent: string | undefined;
  protected lastError: string | undefined;
  protected config: Record<string, unknown> = {};

  private listeners: EventListener[] = [];
  private simulationTimer: ReturnType<typeof setTimeout> | null = null;

  /** Default event interval in milliseconds (subclasses should override) */
  protected defaultInterval = 10000;

  /** Current configured poll interval in milliseconds */
  protected pollInterval: number;

  /** Jitter factor (0-1) applied to interval to prevent synchronization */
  private static readonly JITTER_FACTOR = 0.3;

  constructor() {
    this.pollInterval = this.defaultInterval;
  }

  /**
   * Initialize the adapter with the given configuration.
   * Sets the adapter to enabled state, ready to start.
   * @param config - key-value configuration options
   */
  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = { ...config };
    if (typeof config.pollInterval === 'number' && config.pollInterval > 0) {
      this.pollInterval = config.pollInterval;
    }
    this.enabled = true;
    log.info(`[${this.name}] Adapter initialized (interval: ${this.pollInterval}ms)`);
  }

  /**
   * Start the adapter and begin generating simulated events.
   * @throws if the adapter has not been initialized
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      log.warn(`[${this.name}] Cannot start: adapter not initialized`);
      return;
    }
    this.connected = true;
    log.info(`[${this.name}] Adapter started`);
    this.scheduleNextEvent();
  }

  /**
   * Stop the adapter and cease event generation.
   * Internal state (event counts, etc.) is preserved.
   */
  async stop(): Promise<void> {
    this.connected = false;
    if (this.simulationTimer !== null) {
      clearTimeout(this.simulationTimer);
      this.simulationTimer = null;
    }
    log.info(`[${this.name}] Adapter stopped`);
  }

  /**
   * Get the current operational status of this adapter.
   * @returns snapshot including connection state, event count, and errors
   */
  getStatus(): AdapterStatus {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      connected: this.connected,
      lastEvent: this.lastEvent,
      eventCount: this.eventCount,
      error: this.lastError,
    };
  }

  /**
   * Register a callback to receive adapter events.
   * Multiple listeners can be registered.
   * @param callback - function invoked with each emitted event
   */
  onEvent(callback: EventListener): void {
    this.listeners.push(callback);
  }

  /**
   * Update the adapter's runtime configuration without restarting.
   * Applies new poll interval immediately (takes effect on next scheduled event).
   * @param options - configuration options to apply
   */
  configure(options: AdapterOptions): void {
    if (typeof options.pollInterval === 'number' && options.pollInterval > 0) {
      this.pollInterval = options.pollInterval;
      log.info(`[${this.name}] Poll interval updated to ${this.pollInterval}ms`);
    }
    if (typeof options.enabled === 'boolean') {
      this.enabled = options.enabled;
      if (!this.enabled && this.connected) {
        this.stop();
      }
    }
    // Merge remaining config
    const { pollInterval: _, enabled: __, ...rest } = options;
    Object.assign(this.config, rest);
  }

  /**
   * Permanently destroy the adapter, releasing all resources.
   * Stops event generation, clears all listeners, and resets counters.
   */
  async destroy(): Promise<void> {
    await this.stop();
    this.listeners = [];
    this.enabled = false;
    this.eventCount = 0;
    this.errorCount = 0;
    this.lastEvent = undefined;
    this.lastError = undefined;
    log.info(`[${this.name}] Adapter destroyed`);
  }

  /**
   * Emit an event to all registered listeners and update internal counters.
   * Errors in individual listeners are caught and logged without affecting others.
   * @param event - the adapter event to emit
   */
  protected emitEvent(event: AdapterEvent): void {
    this.eventCount++;
    this.lastEvent = event.timestamp;
    log.debug(`[${this.name}] Event emitted: ${event.eventType} (impact: ${event.trustImpact})`);

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.errorCount++;
        this.lastError = err instanceof Error ? err.message : String(err);
        log.error(`[${this.name}] Error in event listener:`, err);
      }
    }
  }

  /**
   * Generate a simulated event. Concrete adapters must implement this
   * to produce domain-specific events with realistic metadata.
   * @returns a fully populated AdapterEvent
   */
  protected abstract generateSimulatedEvent(): AdapterEvent;

  /**
   * Schedule the next simulated event with jitter to prevent
   * all adapters from firing simultaneously.
   */
  private scheduleNextEvent(): void {
    if (!this.connected) return;

    const jitter = 1 - BaseAdapter.JITTER_FACTOR + Math.random() * BaseAdapter.JITTER_FACTOR * 2;
    const delay = Math.round(this.pollInterval * jitter);

    this.simulationTimer = setTimeout(() => {
      if (!this.connected) return;
      try {
        const event = this.generateSimulatedEvent();
        this.emitEvent(event);
      } catch (err) {
        this.errorCount++;
        this.lastError = err instanceof Error ? err.message : String(err);
        log.error(`[${this.name}] Error generating event:`, err);
      }
      this.scheduleNextEvent();
    }, delay);
  }
}
