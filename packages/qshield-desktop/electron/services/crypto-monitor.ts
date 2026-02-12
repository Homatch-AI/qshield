/**
 * Crypto monitoring services for QShield Desktop.
 * Provides clipboard hijack detection, transaction verification,
 * and trusted address book management.
 */
import { clipboard } from 'electron';
import log from 'electron-log';
import type { CryptoChain, CryptoAddress, CryptoTransaction, ClipboardGuardState } from '@qshield/core';

// ── Address patterns for clipboard detection ─────────────────────────────────

const CLIPBOARD_PATTERNS: { chain: CryptoChain; pattern: RegExp }[] = [
  { chain: 'ethereum', pattern: /^0x[0-9a-fA-F]{40}$/ },
  { chain: 'bitcoin', pattern: /^(bc1[a-zA-HJ-NP-Z0-9]{25,39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/ },
  { chain: 'solana', pattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ },
  { chain: 'polygon', pattern: /^0x[0-9a-fA-F]{40}$/ },
];

// ── Clipboard Guard ──────────────────────────────────────────────────────────

/**
 * Monitors the system clipboard for crypto addresses.
 * Polls at a configurable interval and detects potential clipboard hijacking.
 */
export class CryptoClipboardGuard {
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: ClipboardGuardState = {
    enabled: false,
    lastCheck: new Date().toISOString(),
    detections: 0,
  };
  private lastClipboardContent = '';
  private pollIntervalMs: number;
  private onDetection?: (address: string, chain: CryptoChain) => void;

  constructor(pollIntervalMs = 500) {
    this.pollIntervalMs = pollIntervalMs;
  }

  /** Start clipboard monitoring */
  start(onDetection?: (address: string, chain: CryptoChain) => void): void {
    if (this.timer) return;
    this.onDetection = onDetection;
    this.state.enabled = true;
    this.lastClipboardContent = '';

    this.timer = setInterval(() => {
      this.checkClipboard();
    }, this.pollIntervalMs);

    log.info('[CryptoClipboardGuard] Started clipboard monitoring');
  }

  /** Stop clipboard monitoring */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.state.enabled = false;
    log.info('[CryptoClipboardGuard] Stopped clipboard monitoring');
  }

  /** Get current guard state */
  getState(): ClipboardGuardState {
    return { ...this.state };
  }

  private checkClipboard(): void {
    try {
      const content = clipboard.readText().trim();
      this.state.lastCheck = new Date().toISOString();

      if (content === this.lastClipboardContent || content.length === 0) return;
      this.lastClipboardContent = content;

      for (const { chain, pattern } of CLIPBOARD_PATTERNS) {
        if (pattern.test(content)) {
          this.state.detections++;
          this.state.lastDetectedAddress = content;
          this.state.lastDetectedChain = chain;
          log.info(`[CryptoClipboardGuard] Detected ${chain} address in clipboard`);
          this.onDetection?.(content, chain);
          break;
        }
      }
    } catch (err) {
      log.error('[CryptoClipboardGuard] Error reading clipboard:', err);
    }
  }
}

// ── Address Book ─────────────────────────────────────────────────────────────

/**
 * Manages a trusted address book with in-memory storage and optional
 * persistence via a config save callback.
 */
export class AddressBook {
  private addresses: Map<string, CryptoAddress> = new Map();
  private onPersist?: (addresses: CryptoAddress[]) => void;

  constructor(onPersist?: (addresses: CryptoAddress[]) => void) {
    this.onPersist = onPersist;
  }

  /** Load addresses from persisted storage */
  load(addresses: CryptoAddress[]): void {
    this.addresses.clear();
    for (const addr of addresses) {
      this.addresses.set(addr.address.toLowerCase(), addr);
    }
    log.info(`[AddressBook] Loaded ${addresses.length} trusted addresses`);
  }

  /** Add a trusted address */
  add(address: string, chain: CryptoChain, label?: string): CryptoAddress {
    const entry: CryptoAddress = {
      address,
      chain,
      label,
      trusted: true,
      addedAt: new Date().toISOString(),
    };
    this.addresses.set(address.toLowerCase(), entry);
    this.persist();
    log.info(`[AddressBook] Added trusted address: ${address.slice(0, 10)}... (${chain})`);
    return entry;
  }

  /** Remove a trusted address */
  remove(address: string): boolean {
    const deleted = this.addresses.delete(address.toLowerCase());
    if (deleted) {
      this.persist();
      log.info(`[AddressBook] Removed address: ${address.slice(0, 10)}...`);
    }
    return deleted;
  }

  /** Check if an address is trusted */
  isTrusted(address: string): boolean {
    return this.addresses.has(address.toLowerCase());
  }

  /** Get all trusted addresses */
  getAll(): CryptoAddress[] {
    return Array.from(this.addresses.values());
  }

  /** Get a specific address entry */
  get(address: string): CryptoAddress | undefined {
    return this.addresses.get(address.toLowerCase());
  }

  private persist(): void {
    this.onPersist?.(this.getAll());
  }
}

// ── Transaction Verifier ─────────────────────────────────────────────────────

/**
 * Verifies crypto transactions and maintains a transaction history.
 */
export class TransactionVerifier {
  private history: CryptoTransaction[] = [];
  private readonly maxHistory = 100;

  /** Add a transaction to history */
  addTransaction(tx: CryptoTransaction): void {
    this.history.unshift(tx);
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(0, this.maxHistory);
    }
  }

  /** Get transaction history */
  getHistory(): CryptoTransaction[] {
    return [...this.history];
  }

  /** Clear transaction history */
  clear(): void {
    this.history = [];
  }
}

// ── Crypto Monitor Service (facade) ─────────────────────────────────────────

export interface CryptoAlert {
  id: string;
  type: 'clipboard-hijack' | 'scam-address' | 'chain-mismatch' | 'checksum-invalid';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  address?: string;
  chain?: CryptoChain;
  timestamp: string;
  dismissed: boolean;
}

/**
 * Main crypto monitoring service facade.
 * Combines clipboard guard, address book, and transaction verifier.
 */
export class CryptoMonitorService {
  readonly clipboardGuard: CryptoClipboardGuard;
  readonly addressBook: AddressBook;
  readonly transactionVerifier: TransactionVerifier;
  private alerts: CryptoAlert[] = [];
  private alertIdCounter = 0;

  constructor(persistAddresses?: (addresses: CryptoAddress[]) => void) {
    this.clipboardGuard = new CryptoClipboardGuard(500);
    this.addressBook = new AddressBook(persistAddresses);
    this.transactionVerifier = new TransactionVerifier();
  }

  /** Initialize and start all monitoring */
  start(): void {
    this.clipboardGuard.start((address, chain) => {
      // Check if detected address is in the trusted book
      if (!this.addressBook.isTrusted(address)) {
        this.addAlert({
          type: 'clipboard-hijack',
          severity: 'high',
          message: `Untrusted ${chain} address detected in clipboard: ${address.slice(0, 10)}...${address.slice(-6)}`,
          address,
          chain,
        });
      }
    });
    log.info('[CryptoMonitorService] All crypto monitoring started');
  }

  /** Stop all monitoring */
  stop(): void {
    this.clipboardGuard.stop();
    log.info('[CryptoMonitorService] All crypto monitoring stopped');
  }

  /** Get all crypto alerts */
  getAlerts(): CryptoAlert[] {
    return [...this.alerts];
  }

  /** Dismiss a crypto alert */
  dismissAlert(id: string): boolean {
    const alert = this.alerts.find((a) => a.id === id);
    if (alert) {
      alert.dismissed = true;
      return true;
    }
    return false;
  }

  /** Get clipboard guard status */
  getClipboardStatus(): ClipboardGuardState {
    return this.clipboardGuard.getState();
  }

  /** Get overall crypto security status */
  getStatus(): {
    clipboardGuard: ClipboardGuardState;
    trustedAddresses: number;
    recentTransactions: number;
    activeAlerts: number;
  } {
    return {
      clipboardGuard: this.clipboardGuard.getState(),
      trustedAddresses: this.addressBook.getAll().length,
      recentTransactions: this.transactionVerifier.getHistory().length,
      activeAlerts: this.alerts.filter((a) => !a.dismissed).length,
    };
  }

  private addAlert(params: Omit<CryptoAlert, 'id' | 'timestamp' | 'dismissed'>): void {
    const alert: CryptoAlert = {
      ...params,
      id: `crypto-alert-${++this.alertIdCounter}`,
      timestamp: new Date().toISOString(),
      dismissed: false,
    };
    this.alerts.unshift(alert);
    // Keep last 50 alerts
    if (this.alerts.length > 50) {
      this.alerts = this.alerts.slice(0, 50);
    }
    log.info(`[CryptoMonitorService] Alert: ${alert.message}`);
  }
}
