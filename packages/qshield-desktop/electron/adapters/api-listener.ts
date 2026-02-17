import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

/**
 * API Listener adapter.
 *
 * Monitors the local QShield API server for requests.
 * Currently starts in idle mode — no simulated events.
 * Real events will come from the local API server when it receives requests.
 */
export class ApiListenerAdapter extends BaseAdapter {
  readonly id: AdapterType = 'api';
  readonly name = 'API Listener';
  protected override defaultInterval = 12000;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[ApiListenerAdapter] Configured for API monitoring');
  }

  /**
   * Start in idle mode — no simulation timer.
   * Real events are pushed via emitEvent() when the local API receives requests.
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      log.warn('[ApiListenerAdapter] Cannot start: adapter not initialized');
      return;
    }
    this.connected = true;
    log.info('[ApiListenerAdapter] Monitoring API activity (idle — no simulation)');
  }

  async stop(): Promise<void> {
    await super.stop();
    log.info('[ApiListenerAdapter] Stopped API monitoring');
  }

  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[ApiListenerAdapter] API listener adapter destroyed');
  }

  /** Required by BaseAdapter but never called — real events come from the API server. */
  protected generateSimulatedEvent(): AdapterEvent {
    throw new Error('ApiListenerAdapter uses real events, not simulation');
  }
}
