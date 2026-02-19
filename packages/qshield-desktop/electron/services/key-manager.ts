/**
 * KeyManager — centralizes all HMAC key management using Electron's safeStorage
 * (OS Keychain on macOS, DPAPI on Windows, libsecret on Linux).
 *
 * Generates a 64-byte master secret on first run, encrypts it via safeStorage,
 * and stores the encrypted blob in electron-store. All per-purpose HMAC keys are
 * derived from the master secret using HMAC-SHA256(purpose, masterSecret).
 */
import { safeStorage } from 'electron';
import { createHmac, randomBytes } from 'node:crypto';
import log from 'electron-log';
import Store from 'electron-store';

// ── Purpose strings for key derivation ───────────────────────────────────────

const KEY_PURPOSES = {
  evidenceEncryption: 'qshield:v1:evidence:encryption',
  evidenceHmac: 'qshield:v1:evidence:hmac',
  trustMonitorHmac: 'qshield:v1:trust-monitor:hmac',
  signatureHmac: 'qshield:v1:signature:hmac',
  verificationHmac: 'qshield:v1:verification:hmac',
  secureFileHmac: 'qshield:v1:secure-file:hmac',
  secureMessageHmac: 'qshield:v1:secure-message:hmac',
  reportHmac: 'qshield:v1:report:hmac',
  seedEvidenceHmac: 'qshield:v1:seed-evidence:hmac',
} as const;

// ── Store schema ─────────────────────────────────────────────────────────────

interface KeyStoreSchema {
  encryptedMasterSecret: string; // base64-encoded encrypted blob (safeStorage)
  plaintextMasterSecret: string; // fallback when safeStorage unavailable
}

// ── KeyManager ───────────────────────────────────────────────────────────────

export class KeyManager {
  private store: Store<KeyStoreSchema>;
  private masterSecret: string | null = null;
  private initialized = false;
  private usingSafeStorage = false;

  constructor() {
    this.store = new Store<KeyStoreSchema>({
      name: 'qshield-keys',
      encryptionKey: undefined, // we handle encryption ourselves
    });
  }

  /**
   * Load or generate the master secret.
   * Must be called after app.whenReady() (safeStorage requires it).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const safeStorageAvailable = safeStorage.isEncryptionAvailable();
    this.usingSafeStorage = safeStorageAvailable;

    if (safeStorageAvailable) {
      this.masterSecret = this.loadWithSafeStorage();
    } else {
      log.warn('[KeyManager] safeStorage unavailable — falling back to plaintext store');
      this.masterSecret = this.loadPlaintext();
    }

    this.initialized = true;
    log.info(
      `[KeyManager] Initialized successfully (backend: ${safeStorageAvailable ? 'safeStorage' : 'plaintext'})`,
    );
  }

  /** Whether the key manager has been initialized. */
  isReady(): boolean {
    return this.initialized;
  }

  /** Get status information for the IPC handler. */
  getStatus(): { initialized: boolean; safeStorageAvailable: boolean; backend: string } {
    return {
      initialized: this.initialized,
      safeStorageAvailable: this.usingSafeStorage,
      backend: this.usingSafeStorage ? 'safeStorage' : 'plaintext',
    };
  }

  // ── Per-purpose key getters ──────────────────────────────────────────────

  getEvidenceEncryptionSecret(): string {
    return this.deriveKey(KEY_PURPOSES.evidenceEncryption);
  }

  getEvidenceHmacKey(): string {
    return this.deriveKey(KEY_PURPOSES.evidenceHmac);
  }

  getTrustMonitorHmacKey(): string {
    return this.deriveKey(KEY_PURPOSES.trustMonitorHmac);
  }

  getSignatureHmacKey(): string {
    return this.deriveKey(KEY_PURPOSES.signatureHmac);
  }

  getVerificationHmacKey(): string {
    return this.deriveKey(KEY_PURPOSES.verificationHmac);
  }

  getSecureFileHmacKey(): string {
    return this.deriveKey(KEY_PURPOSES.secureFileHmac);
  }

  getSecureMessageHmacKey(): string {
    return this.deriveKey(KEY_PURPOSES.secureMessageHmac);
  }

  getReportHmacKey(): string {
    return this.deriveKey(KEY_PURPOSES.reportHmac);
  }

  getSeedEvidenceHmacKey(): string {
    return this.deriveKey(KEY_PURPOSES.seedEvidenceHmac);
  }

  /** Clear the master secret from memory. */
  destroy(): void {
    this.masterSecret = null;
    this.initialized = false;
    log.info('[KeyManager] Destroyed — master secret cleared from memory');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Derive a per-purpose key from the master secret using HMAC-SHA256.
   * Returns a hex-encoded key string.
   */
  private deriveKey(purpose: string): string {
    if (!this.masterSecret) {
      throw new Error('[KeyManager] Not initialized — call initialize() first');
    }
    return createHmac('sha256', this.masterSecret).update(purpose).digest('hex');
  }

  /**
   * Load or generate the master secret using safeStorage encryption.
   * The encrypted blob is stored as base64 in electron-store.
   */
  private loadWithSafeStorage(): string {
    const existing = this.store.get('encryptedMasterSecret');

    if (existing) {
      try {
        const encrypted = Buffer.from(existing, 'base64');
        const decrypted = safeStorage.decryptString(encrypted);
        log.info('[KeyManager] Master secret loaded from secure storage');
        return decrypted;
      } catch (err) {
        log.error('[KeyManager] Failed to decrypt stored master secret, generating new one:', err);
      }
    }

    // Generate new master secret
    const secret = randomBytes(64).toString('hex');
    const encrypted = safeStorage.encryptString(secret);
    this.store.set('encryptedMasterSecret', encrypted.toString('base64'));
    log.info('[KeyManager] Generated new master secret (safeStorage)');
    return secret;
  }

  /**
   * Load or generate the master secret using plaintext storage.
   * Used as a fallback when safeStorage is not available (e.g., Linux without keyring).
   */
  private loadPlaintext(): string {
    const existing = this.store.get('plaintextMasterSecret');

    if (existing) {
      log.info('[KeyManager] Master secret loaded from plaintext store');
      return existing;
    }

    const secret = randomBytes(64).toString('hex');
    this.store.set('plaintextMasterSecret', secret);
    log.info('[KeyManager] Generated new master secret (plaintext fallback)');
    return secret;
  }
}
