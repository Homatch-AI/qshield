import log from 'electron-log';
import type { AdapterType, AdapterStatus, AdapterEvent } from '@qshield/core';

/**
 * Interface that all QShield monitoring adapters must implement.
 * Each adapter represents a communication channel or data source
 * that contributes trust signals to the overall trust score.
 */
export interface QShieldAdapter {
  readonly id: AdapterType;
  readonly name: string;
  initialize(config: Record<string, unknown>): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): AdapterStatus;
  onEvent(callback: (event: AdapterEvent) => void): void;
  destroy(): Promise<void>;
}

type EventListener = (event: AdapterEvent) => void;

/**
 * Abstract base class implementing common adapter functionality.
 * Concrete adapters extend this and provide domain-specific event generation.
 */
export abstract class BaseAdapter implements QShieldAdapter {
  abstract readonly id: AdapterType;
  abstract readonly name: string;

  protected enabled = false;
  protected connected = false;
  protected eventCount = 0;
  protected lastEvent: string | undefined;
  protected config: Record<string, unknown> = {};

  private listeners: EventListener[] = [];
  private simulationTimer: ReturnType<typeof setTimeout> | null = null;

  /** Minimum interval in ms between simulated events (default 5000) */
  protected simulatedEventMinInterval = 5000;

  /** Maximum interval in ms between simulated events (default 15000) */
  protected simulatedEventMaxInterval = 15000;

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.config = { ...config };
    this.enabled = true;
    log.info(`[${this.name}] Adapter initialized`);
  }

  async start(): Promise<void> {
    if (!this.enabled) {
      log.warn(`[${this.name}] Cannot start: adapter not initialized`);
      return;
    }
    this.connected = true;
    log.info(`[${this.name}] Adapter started`);
    this.scheduleNextEvent();
  }

  async stop(): Promise<void> {
    this.connected = false;
    if (this.simulationTimer !== null) {
      clearTimeout(this.simulationTimer);
      this.simulationTimer = null;
    }
    log.info(`[${this.name}] Adapter stopped`);
  }

  getStatus(): AdapterStatus {
    return {
      id: this.id,
      name: this.name,
      enabled: this.enabled,
      connected: this.connected,
      lastEvent: this.lastEvent,
      eventCount: this.eventCount,
    };
  }

  onEvent(callback: EventListener): void {
    this.listeners.push(callback);
  }

  async destroy(): Promise<void> {
    await this.stop();
    this.listeners = [];
    this.enabled = false;
    this.eventCount = 0;
    this.lastEvent = undefined;
    log.info(`[${this.name}] Adapter destroyed`);
  }

  /**
   * Emit an event to all registered listeners and update internal state.
   */
  protected emitEvent(event: AdapterEvent): void {
    this.eventCount++;
    this.lastEvent = event.timestamp;
    log.debug(`[${this.name}] Event emitted: ${event.eventType} (impact: ${event.trustImpact})`);

    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        log.error(`[${this.name}] Error in event listener:`, err);
      }
    }
  }

  /**
   * Generate a simulated event. Concrete adapters must implement this
   * to produce domain-specific events.
   */
  protected abstract generateSimulatedEvent(): AdapterEvent;

  /**
   * Schedule the next simulated event at a random interval within
   * the configured min/max range.
   */
  private scheduleNextEvent(): void {
    if (!this.connected) return;

    const delay =
      this.simulatedEventMinInterval +
      Math.random() * (this.simulatedEventMaxInterval - this.simulatedEventMinInterval);

    this.simulationTimer = setTimeout(() => {
      if (!this.connected) return;
      const event = this.generateSimulatedEvent();
      this.emitEvent(event);
      this.scheduleNextEvent();
    }, delay);
  }
}
