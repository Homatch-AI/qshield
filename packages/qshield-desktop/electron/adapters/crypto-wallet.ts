import log from 'electron-log';
import type { AdapterType, AdapterEvent } from '@qshield/core';
import { BaseAdapter } from './adapter-interface';

/**
 * Crypto Wallet adapter.
 *
 * Monitors cryptocurrency wallet activity including clipboard hijack detection,
 * transaction signing, wallet connections, and address verification.
 * Currently starts in idle mode — no simulated events.
 * Real events are pushed via emitEvent() from the crypto IPC handlers.
 */
export class CryptoWalletAdapter extends BaseAdapter {
  readonly id: AdapterType = 'crypto';
  readonly name = 'Crypto Wallet Monitor';
  protected override defaultInterval = 12000;

  constructor() {
    super();
    this.pollInterval = this.defaultInterval;
  }

  async initialize(config: Record<string, unknown>): Promise<void> {
    await super.initialize(config);
    log.info('[CryptoWalletAdapter] Configured for crypto wallet monitoring');
  }

  /**
   * Start in idle mode — no simulation timer.
   * Real events are pushed via emitEvent() from crypto IPC handlers.
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      log.warn('[CryptoWalletAdapter] Cannot start: adapter not initialized');
      return;
    }
    this.connected = true;
    log.info('[CryptoWalletAdapter] Monitoring crypto wallet activity (idle — no simulation)');
  }

  async stop(): Promise<void> {
    await super.stop();
    log.info('[CryptoWalletAdapter] Stopped crypto monitoring');
  }

  async destroy(): Promise<void> {
    await super.destroy();
    log.info('[CryptoWalletAdapter] Crypto adapter destroyed');
  }

  /** Required by BaseAdapter but never called — real events come from crypto IPC handlers. */
  protected generateSimulatedEvent(): AdapterEvent {
    throw new Error('CryptoWalletAdapter uses real events, not simulation');
  }
}
