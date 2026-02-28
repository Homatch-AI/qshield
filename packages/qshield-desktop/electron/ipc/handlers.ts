/**
 * IPC handler registration with validation, rate limiting, and structured responses.
 * Every handler validates input, logs calls with timing, and returns structured results.
 */
import { ipcMain, app, clipboard, dialog, shell, BrowserWindow } from 'electron';
import { copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import log from 'electron-log';
import { IPC_CHANNELS } from './channels';
import {
  IpcValidationError,
  validateListOptions,
  validateUuid,
  validateString,
  validateSearchQuery,
  validateExportIds,
  validateCertOptions,
  validateUrl,
  validateAlertId,
  validateAdapterId,
  validateConfigKey,
  validatePolicyConfig,
  validateCryptoAddress,
  validateCryptoTransaction,
  validateCryptoAddressBookEntry,
  type ListOptionsInput,
  type CertOptionsInput,
  type PolicyConfigInput,
  type CryptoAddressInput,
  type CryptoTransactionInput,
  type CryptoAddressBookEntryInput,
} from './validators';

// ── Types ────────────────────────────────────────────────────────────────────

/** Structured success response from an IPC handler */
export interface IpcSuccess<T = unknown> {
  success: true;
  data: T;
}

/** Structured error response from an IPC handler */
export interface IpcError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** Union type for all IPC responses */
export type IpcResponse<T = unknown> = IpcSuccess<T> | IpcError;

/** Service registry passed to handler registration */
export interface ServiceRegistry {
  trustMonitor: {
    getState: () => unknown;
    subscribe: () => void;
    unsubscribe: () => void;
  };
  evidenceStore: {
    list: (opts: ListOptionsInput) => unknown;
    get: (id: string) => unknown;
    verify: (id: string) => unknown;
    search: (query: string) => unknown;
    export: (ids: string[]) => unknown;
  };
  certGenerator: {
    generate: (opts: CertOptionsInput) => Promise<unknown> | unknown;
    list: () => unknown;
    getPdfPath: (id: string) => string | null;
  };
  gatewayClient: {
    getStatus: () => unknown;
    connect: (url: string) => unknown;
    disconnect: () => unknown;
  };
  policyEnforcer: {
    getPolicy: () => unknown;
    updatePolicy: (config: PolicyConfigInput) => unknown;
  };
  alertService: {
    list: () => unknown;
    dismiss: (id: string) => unknown;
  };
  configManager: {
    get: (key: string) => unknown;
    getAll: () => unknown;
    set: (key: string, value: unknown) => unknown;
  };
  adapterManager: {
    getStatus: () => unknown;
    enable: (id: string) => unknown;
    disable: (id: string) => unknown;
  };
  signatureGenerator: {
    generate: (config: unknown, trustScore: number) => unknown;
    getConfig: () => unknown;
    setConfig: (config: unknown) => void;
    getCurrentTrustScore: () => number;
  };
  verificationService: {
    getStats: () => unknown;
    createRecord: (opts: { senderName: string; senderEmail: string; trustScore: number; trustLevel: string; emailSubject?: string }) => { verificationId: string; verifyUrl: string; referralId: string };
    recordClick: (verificationId: string) => void;
  };
  cryptoService: {
    getStatus: () => unknown;
    verifyAddress: (input: CryptoAddressInput) => unknown;
    verifyTransaction: (input: CryptoTransactionInput) => unknown;
    getAddressBook: () => unknown;
    addTrustedAddress: (input: CryptoAddressBookEntryInput) => unknown;
    removeTrustedAddress: (address: string) => unknown;
    getAlerts: () => unknown;
    getClipboardStatus: () => unknown;
  };
  licenseManager: {
    getLicense: () => unknown;
    activate: (key: string) => unknown;
    deactivate: () => unknown;
    hasFeature: (feature: string) => boolean;
    getTier: () => string;
    generateKey: (opts: { tier: string; email?: string; durationDays?: number }) => string;
  };
  featureGate: {
    getFeatures: () => unknown;
  };
  localApiManager: {
    getInfo: () => { port: number; token: string; running: boolean };
    regenerateToken: () => { token: string };
  };
  secureFileService: {
    upload: (opts: { fileName: string; mimeType: string; data: Buffer; expiresIn: string; maxDownloads: number }, senderName: string, senderEmail: string) => unknown;
    list: () => unknown;
    get: (id: string) => unknown;
    destroy: (id: string) => boolean;
    getEncryptedData: (id: string) => { data: Buffer; iv: string; authTag: string } | null;
    recordDownload: (id: string, entry: { action: 'downloaded'; ip: string; userAgent: string }) => boolean;
    recordView: (id: string, entry: { action: 'viewed'; ip: string; userAgent: string }) => boolean;
    getMaxFileSize: () => number;
  };
  secureMessageService: {
    create: (opts: unknown, senderName: string, senderEmail: string) => unknown;
    list: () => unknown;
    get: (id: string) => unknown;
    destroy: (id: string) => unknown;
    getAccessLog: (id: string) => unknown;
    copyLink: (id: string) => void;
    recordAccess: (id: string, entry: { ip: string; userAgent: string; recipientEmail?: string; action: 'viewed' | 'downloaded' | 'file_downloaded' | 'verified' | 'expired' | 'destroyed' }) => boolean;
    getDecryptedContent: (id: string) => string | null;
  };
  trustHistory: {
    getLifetimeStats: () => unknown;
    getDailySummary: (date: string) => unknown;
    getDailySummaries: (from: string, to: string) => unknown;
    getScoreHistory: (days: number) => unknown;
    getMilestones: () => unknown;
    getTrend: (days: number) => unknown;
  };
  emailNotifier: {
    getConfig: () => unknown;
    setConfig: (config: unknown) => void;
    sendTest: () => Promise<{ sent: boolean; error?: string }>;
  };
  assetService: {
    list: () => unknown;
    add: (assetPath: string, type: 'file' | 'directory', sensitivity: string, name?: string) => Promise<unknown>;
    getByPath: (assetPath: string) => unknown;
    remove: (id: string) => Promise<void>;
    get: (id: string) => unknown;
    verify: (id: string) => Promise<unknown>;
    accept: (id: string) => Promise<unknown>;
    updateSensitivity: (id: string, sensitivity: string) => unknown;
    enable: (id: string, enabled: boolean) => boolean;
    stats: () => unknown;
    changeLog: (id: string, limit?: number) => unknown;
    browse: () => Promise<{ canceled: boolean; path?: string }>;
  };
  reportService: {
    generate: (opts: { type: string; fromDate?: string; toDate?: string; assetId?: string; notes?: string }) => Promise<unknown>;
    list: () => unknown;
    get: (id: string) => unknown;
    getPdfPath: (id: string) => string | null;
  };
  keyManager?: {
    getStatus: () => { initialized: boolean; safeStorageAvailable: boolean; backend: string };
  };
  aiAdapter: {
    getActiveSessions: () => unknown[];
    getSession: (id: string) => unknown | undefined;
    freezeSession: (id: string, reason: string) => void;
    unfreezeSession: (id: string) => void;
    allowAction: (id: string, scope: 'once' | 'session') => void;
    getAccessedFiles: (id: string) => unknown[];
  };
}

// ── Rate limiter ─────────────────────────────────────────────────────────────

/** Simple sliding-window rate limiter for IPC channels */
class RateLimiter {
  private windows = new Map<string, number[]>();

  /**
   * Check whether a call is allowed under the rate limit.
   * @param key - unique identifier for the rate limit bucket (typically the channel name)
   * @param maxCalls - maximum allowed calls in the window
   * @param windowMs - sliding window duration in milliseconds
   * @returns true if allowed, false if rate-limited
   */
  check(key: string, maxCalls: number, windowMs: number): boolean {
    const now = Date.now();
    const timestamps = this.windows.get(key) ?? [];
    const validTimestamps = timestamps.filter((t) => now - t < windowMs);

    if (validTimestamps.length >= maxCalls) {
      this.windows.set(key, validTimestamps);
      return false;
    }

    validTimestamps.push(now);
    this.windows.set(key, validTimestamps);
    return true;
  }
}

const rateLimiter = new RateLimiter();

/** Rate limit configuration per channel */
const RATE_LIMITS: Partial<Record<string, { maxCalls: number; windowMs: number }>> = {
  [IPC_CHANNELS.CERT_GENERATE]: { maxCalls: 1, windowMs: 60_000 },
  [IPC_CHANNELS.EVIDENCE_EXPORT]: { maxCalls: 1, windowMs: 60_000 },
  [IPC_CHANNELS.CONFIG_SET]: { maxCalls: 10, windowMs: 60_000 },
  [IPC_CHANNELS.EMAIL_NOTIFY_TEST]: { maxCalls: 1, windowMs: 60_000 },
  [IPC_CHANNELS.REPORT_GENERATE]: { maxCalls: 1, windowMs: 60_000 },
};

// ── Handler wrapper ──────────────────────────────────────────────────────────

/** Build a structured success response */
function ok<T>(data: T): IpcSuccess<T> {
  return { success: true, data };
}

/** Build a structured error response */
function fail(code: string, message: string, details?: unknown): IpcError {
  return { success: false, error: { code, message, details } };
}

/**
 * Wrap an IPC handler with validation, rate limiting, structured responses, and logging.
 * Logs channel name and call duration (never logs the data for security).
 */
function wrapHandler(
  channel: string,
  handler: (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<IpcResponse>,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const start = performance.now();

    // Rate limiting check
    const limit = RATE_LIMITS[channel];
    if (limit && !rateLimiter.check(channel, limit.maxCalls, limit.windowMs)) {
      const duration = (performance.now() - start).toFixed(1);
      log.warn(`IPC ${channel} rate-limited (${duration}ms)`);
      return fail('RATE_LIMITED', `Too many requests. Try again later.`);
    }

    try {
      const result = await handler(event, ...args);
      const duration = (performance.now() - start).toFixed(1);
      log.debug(`IPC ${channel} OK (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = (performance.now() - start).toFixed(1);

      if (error instanceof IpcValidationError) {
        log.warn(`IPC ${channel} validation error (${duration}ms): ${error.message}`);
        return fail('VALIDATION_ERROR', error.message, error.issues);
      }

      // Never expose stack traces or internal details to renderer
      log.error(`IPC ${channel} internal error (${duration}ms):`, error);
      return fail('INTERNAL_ERROR', 'An internal error occurred');
    }
  });
}

// ── Handler registration ─────────────────────────────────────────────────────

/**
 * Register all IPC handlers with input validation, rate limiting, and structured responses.
 * Must be called once during app initialization.
 */
export function registerIpcHandlers(services: ServiceRegistry): void {
  // ── Trust ────────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.TRUST_GET_STATE, async () => {
    return ok(services.trustMonitor.getState());
  });

  wrapHandler(IPC_CHANNELS.TRUST_SUBSCRIBE, async () => {
    services.trustMonitor.subscribe();
    return ok(null);
  });

  wrapHandler(IPC_CHANNELS.TRUST_UNSUBSCRIBE, async () => {
    services.trustMonitor.unsubscribe();
    return ok(null);
  });

  // ── Evidence ─────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.EVIDENCE_LIST, async (_event, opts) => {
    const validated = validateListOptions(opts);
    return ok(services.evidenceStore.list(validated));
  });

  wrapHandler(IPC_CHANNELS.EVIDENCE_GET, async (_event, id) => {
    const validId = validateUuid(id);
    return ok(services.evidenceStore.get(validId));
  });

  wrapHandler(IPC_CHANNELS.EVIDENCE_VERIFY, async (_event, id) => {
    const validId = validateUuid(id);
    return ok(services.evidenceStore.verify(validId));
  });

  wrapHandler(IPC_CHANNELS.EVIDENCE_SEARCH, async (_event, query) => {
    const validQuery = validateSearchQuery(query);
    return ok(services.evidenceStore.search(validQuery));
  });

  wrapHandler(IPC_CHANNELS.EVIDENCE_EXPORT, async (_event, ids) => {
    const validIds = validateExportIds(ids);
    return ok(services.evidenceStore.export(validIds));
  });

  // ── Certificates ─────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.CERT_GENERATE, async (_event, opts) => {
    const validOpts = validateCertOptions(opts);
    log.info('CERT_GENERATE: starting PDF generation via StandaloneCertGenerator');

    // Delegate to StandaloneCertGenerator — generates PDF on disk + tracks in internal list
    const cert = await services.certGenerator.generate(validOpts) as {
      id: string;
      sessionId: string;
      generatedAt: string;
      trustScore: number;
      trustLevel: string;
      evidenceCount: number;
      pdfPath: string;
    };
    log.info(`CERT_GENERATE: cert ${cert.id} generated, PDF at ${cert.pdfPath}`);

    // Show save dialog so user can choose where to save a copy
    const visibleWindows = BrowserWindow.getAllWindows().filter((w) => w.isVisible() && !w.isDestroyed());
    const parentWin = visibleWindows[0];
    const dialogOpts: Electron.SaveDialogOptions = {
      title: 'Save Trust Certificate',
      defaultPath: `QShield-Trust-Certificate-${cert.sessionId.slice(0, 8)}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    };
    const result = parentWin
      ? await dialog.showSaveDialog(parentWin, dialogOpts)
      : await dialog.showSaveDialog(dialogOpts);

    if (!result.canceled && result.filePath) {
      await copyFile(cert.pdfPath, result.filePath);
      log.info(`CERT_GENERATE: PDF exported to ${result.filePath}`);
    } else {
      log.info('CERT_GENERATE: user cancelled save dialog');
    }

    return ok({
      id: cert.id,
      sessionId: cert.sessionId,
      generatedAt: cert.generatedAt,
      trustScore: cert.trustScore,
      trustLevel: cert.trustLevel,
      evidenceCount: cert.evidenceCount,
      pdfPath: cert.pdfPath,
    });
  });

  wrapHandler(IPC_CHANNELS.CERT_LIST, async () => {
    return ok(services.certGenerator.list());
  });

  wrapHandler(IPC_CHANNELS.CERT_EXPORT_PDF, async (_event, id) => {
    const validId = validateUuid(id);
    log.info(`CERT_EXPORT_PDF: request for id=${validId}`);

    // Check for pre-existing PDF; if not found, generate one on the fly
    let pdfPath = services.certGenerator.getPdfPath(validId);
    log.info(`CERT_EXPORT_PDF: existing pdfPath=${pdfPath}`);

    if (!pdfPath) {
      // Generate a fresh cert/PDF for this export request
      log.info('CERT_EXPORT_PDF: no existing PDF, generating on the fly...');
      const cert = await services.certGenerator.generate({ sessionId: validId });
      pdfPath = (cert as { pdfPath?: string })?.pdfPath ?? services.certGenerator.getPdfPath((cert as { id?: string })?.id ?? '');
      log.info(`CERT_EXPORT_PDF: generated pdfPath=${pdfPath}`);
      if (!pdfPath) {
        return fail('GENERATION_FAILED', 'Failed to generate PDF certificate');
      }
    }

    // Find a visible window for the save dialog (exclude the hidden PDF window)
    const visibleWindows = BrowserWindow.getAllWindows().filter((w) => w.isVisible() && !w.isDestroyed());
    const win = visibleWindows[0];
    if (!win) {
      return fail('NO_WINDOW', 'No visible window for save dialog');
    }

    log.info('CERT_EXPORT_PDF: showing save dialog...');
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Trust Certificate',
      defaultPath: `qshield-certificate-${validId.slice(0, 8)}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (result.canceled || !result.filePath) {
      log.info('CERT_EXPORT_PDF: user canceled save dialog');
      return ok({ saved: false });
    }

    await copyFile(pdfPath, result.filePath);
    log.info(`CERT_EXPORT_PDF: PDF exported to ${result.filePath}`);
    return ok({ saved: true, path: result.filePath });
  });

  wrapHandler(IPC_CHANNELS.CERT_REVIEW_PDF, async (_event, id) => {
    const validId = validateUuid(id);
    log.info(`CERT_REVIEW_PDF: request for id=${validId}`);

    // Check for pre-existing PDF; if not found, generate one on the fly
    let pdfPath = services.certGenerator.getPdfPath(validId);
    if (!pdfPath) {
      log.info('CERT_REVIEW_PDF: no existing PDF, generating on the fly...');
      const cert = await services.certGenerator.generate({ sessionId: validId });
      pdfPath = (cert as { pdfPath?: string })?.pdfPath ?? services.certGenerator.getPdfPath((cert as { id?: string })?.id ?? '');
      if (!pdfPath) {
        return fail('GENERATION_FAILED', 'Failed to generate PDF certificate');
      }
    }

    // Copy to temp dir with a readable name and open in system viewer
    const tempPath = join(app.getPath('temp'), `qshield-cert-${validId.slice(0, 8)}.pdf`);
    await copyFile(pdfPath, tempPath);
    const errMsg = await shell.openPath(tempPath);
    if (errMsg) {
      log.error(`CERT_REVIEW_PDF: shell.openPath failed: ${errMsg}`);
      return fail('OPEN_FAILED', `Failed to open PDF: ${errMsg}`);
    }

    log.info(`CERT_REVIEW_PDF: opened ${tempPath}`);
    return ok(null);
  });

  // ── Gateway ──────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.GATEWAY_STATUS, async () => {
    return ok(services.gatewayClient.getStatus());
  });

  wrapHandler(IPC_CHANNELS.GATEWAY_CONNECT, async (_event, url) => {
    const validUrl = validateUrl(url);
    return ok(services.gatewayClient.connect(validUrl));
  });

  wrapHandler(IPC_CHANNELS.GATEWAY_DISCONNECT, async () => {
    return ok(services.gatewayClient.disconnect());
  });

  // ── Alerts ───────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.ALERT_LIST, async () => {
    return ok(services.alertService.list());
  });

  wrapHandler(IPC_CHANNELS.ALERT_DISMISS, async (_event, id) => {
    const validId = validateAlertId(id);
    return ok(services.alertService.dismiss(validId));
  });

  wrapHandler(IPC_CHANNELS.ALERT_SUBSCRIBE, async () => {
    return ok(null);
  });

  // ── Policy ───────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.POLICY_GET, async () => {
    return ok(services.policyEnforcer.getPolicy());
  });

  wrapHandler(IPC_CHANNELS.POLICY_UPDATE, async (_event, config) => {
    const validConfig = validatePolicyConfig(config);
    return ok(services.policyEnforcer.updatePolicy(validConfig));
  });

  // ── Config ───────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.CONFIG_GET, async (_event, key) => {
    const validKey = validateConfigKey(key);
    return ok(services.configManager.get(validKey));
  });

  wrapHandler(IPC_CHANNELS.CONFIG_GET_ALL, async () => {
    return ok(services.configManager.getAll());
  });

  wrapHandler(IPC_CHANNELS.CONFIG_SET, async (_event, key, value) => {
    const validKey = validateConfigKey(key);
    services.configManager.set(validKey, value);
    return ok(null);
  });

  // ── Adapters ─────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.ADAPTER_STATUS, async () => {
    return ok(services.adapterManager.getStatus());
  });

  wrapHandler(IPC_CHANNELS.ADAPTER_ENABLE, async (_event, id) => {
    const validId = validateAdapterId(id);
    return ok(services.adapterManager.enable(validId));
  });

  wrapHandler(IPC_CHANNELS.ADAPTER_DISABLE, async (_event, id) => {
    const validId = validateAdapterId(id);
    return ok(services.adapterManager.disable(validId));
  });

  // ── Signature ────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.SIGNATURE_GENERATE, async (_event, config) => {
    const score = services.signatureGenerator.getCurrentTrustScore();
    const result = services.signatureGenerator.generate(config, score);
    log.info(`[Signature] generate: style=${(config as Record<string, unknown>)?.style}, score=${score}, html=${(result as { html?: string }).html?.length ?? 0} chars`);
    return ok(result);
  });

  wrapHandler(IPC_CHANNELS.SIGNATURE_COPY, async (_event, config) => {
    const score = services.signatureGenerator.getCurrentTrustScore();
    const result = services.signatureGenerator.generate(config, score) as { html: string; trustScore: number };
    log.info(`[Signature] copy: html=${result.html?.length ?? 0} chars, score=${result.trustScore}`);
    clipboard.write({ html: result.html, text: result.html });
    return ok({ copied: true, trustScore: result.trustScore });
  });

  wrapHandler(IPC_CHANNELS.SIGNATURE_GET_CONFIG, async () => {
    return ok(services.signatureGenerator.getConfig());
  });

  wrapHandler(IPC_CHANNELS.SIGNATURE_SET_CONFIG, async (_event, config) => {
    services.signatureGenerator.setConfig(config);
    return ok(null);
  });

  // ── Verification ────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.VERIFY_GET_STATS, async () => {
    return ok(services.verificationService.getStats());
  });

  // ── Crypto ──────────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.CRYPTO_GET_STATUS, async () => {
    return ok(services.cryptoService.getStatus());
  });

  wrapHandler(IPC_CHANNELS.CRYPTO_VERIFY_ADDRESS, async (_event, input) => {
    const validated = validateCryptoAddress(input);
    return ok(services.cryptoService.verifyAddress(validated));
  });

  wrapHandler(IPC_CHANNELS.CRYPTO_VERIFY_TRANSACTION, async (_event, input) => {
    const validated = validateCryptoTransaction(input);
    return ok(services.cryptoService.verifyTransaction(validated));
  });

  wrapHandler(IPC_CHANNELS.CRYPTO_GET_ADDRESS_BOOK, async () => {
    return ok(services.cryptoService.getAddressBook());
  });

  wrapHandler(IPC_CHANNELS.CRYPTO_ADD_TRUSTED_ADDRESS, async (_event, input) => {
    const validated = validateCryptoAddressBookEntry(input);
    return ok(services.cryptoService.addTrustedAddress(validated));
  });

  wrapHandler(IPC_CHANNELS.CRYPTO_REMOVE_TRUSTED_ADDRESS, async (_event, address) => {
    const validAddress = validateString(address, 'address');
    return ok(services.cryptoService.removeTrustedAddress(validAddress));
  });

  wrapHandler(IPC_CHANNELS.CRYPTO_GET_ALERTS, async () => {
    return ok(services.cryptoService.getAlerts());
  });

  wrapHandler(IPC_CHANNELS.CRYPTO_CLIPBOARD_STATUS, async () => {
    return ok(services.cryptoService.getClipboardStatus());
  });

  // ── License ────────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.LICENSE_GET, async () => {
    return ok(services.licenseManager.getLicense());
  });

  wrapHandler(IPC_CHANNELS.LICENSE_ACTIVATE, async (_event, key) => {
    const validKey = validateString(key, 'key');
    return ok(services.licenseManager.activate(validKey));
  });

  wrapHandler(IPC_CHANNELS.LICENSE_DEACTIVATE, async () => {
    return ok(services.licenseManager.deactivate());
  });

  const validTiers = ['trial', 'personal', 'pro', 'business', 'enterprise'];

  wrapHandler(IPC_CHANNELS.LICENSE_GENERATE_TEST, async (_event, tier, days) => {
    if (typeof tier !== 'string' || !validTiers.includes(tier)) {
      return fail('VALIDATION_ERROR', 'Tier must be "trial", "personal", "pro", "business", or "enterprise"');
    }
    const durationDays = typeof days === 'number' && days > 0 ? days : 365;
    const key = services.licenseManager.generateKey({ tier, durationDays });
    return ok({ key });
  });

  wrapHandler(IPC_CHANNELS.FEATURE_CHECK, async (_event, feature) => {
    const validFeature = validateString(feature, 'feature');
    return ok({
      allowed: services.licenseManager.hasFeature(validFeature),
    });
  });

  wrapHandler(IPC_CHANNELS.FEATURE_FLAGS, async () => {
    return ok(services.featureGate.getFeatures());
  });

  // ── Local API ───────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.API_GET_INFO, async () => {
    return ok(services.localApiManager.getInfo());
  });

  wrapHandler(IPC_CHANNELS.API_REGENERATE_TOKEN, async () => {
    return ok(services.localApiManager.regenerateToken());
  });

  // ── AI Governance ──────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.AI_SESSIONS, async () => {
    return ok(services.aiAdapter.getActiveSessions());
  });

  wrapHandler(IPC_CHANNELS.AI_SESSION, async (_event, id) => {
    const validId = validateString(id, 'sessionId');
    const session = services.aiAdapter.getSession(validId);
    if (!session) return fail('NOT_FOUND', 'AI session not found');
    return ok(session);
  });

  wrapHandler(IPC_CHANNELS.AI_FREEZE, async (_event, id, reason) => {
    const validId = validateString(id, 'sessionId');
    const validReason = typeof reason === 'string' ? reason : 'Manual freeze by user';
    services.aiAdapter.freezeSession(validId, validReason);
    return ok(null);
  });

  wrapHandler(IPC_CHANNELS.AI_UNFREEZE, async (_event, id) => {
    const validId = validateString(id, 'sessionId');
    services.aiAdapter.unfreezeSession(validId);
    return ok(null);
  });

  wrapHandler(IPC_CHANNELS.AI_ALLOW, async (_event, id, scope) => {
    const validId = validateString(id, 'sessionId');
    if (scope !== 'once' && scope !== 'session') {
      return fail('VALIDATION_ERROR', 'scope must be "once" or "session"');
    }
    services.aiAdapter.allowAction(validId, scope);
    return ok(null);
  });

  wrapHandler(IPC_CHANNELS.AI_SESSION_FILES, async (_event, id) => {
    const validId = validateString(id, 'sessionId');
    return ok(services.aiAdapter.getAccessedFiles(validId));
  });

  // ── App ──────────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.APP_VERSION, async () => {
    return ok(app.getVersion());
  });

  wrapHandler(IPC_CHANNELS.APP_QUIT, async () => {
    app.quit();
    return ok(null);
  });

  wrapHandler(IPC_CHANNELS.APP_FOCUS_MAIN, async () => {
    const windows = BrowserWindow.getAllWindows();
    const mainWin = windows.find((w) => !w.isAlwaysOnTop());
    if (mainWin) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
    return ok(null);
  });

  // NOTE: APP_TOGGLE_MAIN is registered in main.ts (needs direct mainWindow access)

  // ── Secure Messages ────────────────────────────────────────────────
  const validExpiresIn = ['1h', '24h', '7d', '30d'];

  wrapHandler(IPC_CHANNELS.SECURE_MSG_CREATE, async (_event, opts) => {
    if (!opts || typeof opts !== 'object') {
      return fail('VALIDATION_ERROR', 'Message options are required');
    }
    const { subject, content, attachments, expiresIn, maxViews, requireVerification, allowedRecipients } = opts as Record<string, unknown>;
    if (!subject || typeof subject !== 'string' || subject.trim().length === 0) {
      return fail('VALIDATION_ERROR', 'Subject is required');
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return fail('VALIDATION_ERROR', 'Content is required');
    }
    if (!expiresIn || typeof expiresIn !== 'string' || !validExpiresIn.includes(expiresIn)) {
      return fail('VALIDATION_ERROR', 'expiresIn must be one of: 1h, 24h, 7d, 30d');
    }
    if (typeof maxViews !== 'number' || maxViews < -1) {
      return fail('VALIDATION_ERROR', 'maxViews must be >= -1');
    }
    const licenseEmail = (services.licenseManager.getLicense() as { email?: string }).email;
    const senderName = 'QShield User';
    const senderEmail = licenseEmail || 'user@qshield.app';
    return ok(services.secureMessageService.create(
      { subject: subject as string, content: content as string, attachments: Array.isArray(attachments) ? attachments : undefined, expiresIn: expiresIn as string, maxViews: maxViews as number, requireVerification: !!requireVerification, allowedRecipients: Array.isArray(allowedRecipients) ? allowedRecipients : [] },
      senderName,
      senderEmail,
    ));
  });

  wrapHandler(IPC_CHANNELS.SECURE_MSG_LIST, async () => {
    return ok(services.secureMessageService.list());
  });

  wrapHandler(IPC_CHANNELS.SECURE_MSG_GET, async (_event, id) => {
    const validId = validateString(id, 'id');
    return ok(services.secureMessageService.get(validId));
  });

  wrapHandler(IPC_CHANNELS.SECURE_MSG_DESTROY, async (_event, id) => {
    const validId = validateString(id, 'id');
    return ok(services.secureMessageService.destroy(validId));
  });

  wrapHandler(IPC_CHANNELS.SECURE_MSG_ACCESS_LOG, async (_event, id) => {
    const validId = validateString(id, 'id');
    return ok(services.secureMessageService.getAccessLog(validId));
  });

  wrapHandler(IPC_CHANNELS.SECURE_MSG_COPY_LINK, async (_event, id) => {
    const validId = validateString(id, 'id');
    services.secureMessageService.copyLink(validId);
    return ok(null);
  });

  // ── Secure Files ──────────────────────────────────────────────────
  const validFileExpiresIn = ['1h', '24h', '7d', '30d'];

  wrapHandler(IPC_CHANNELS.SECURE_FILE_UPLOAD, async (_event, opts) => {
    if (!opts || typeof opts !== 'object') {
      return fail('VALIDATION_ERROR', 'File upload options are required');
    }
    const { fileName, mimeType, data, expiresIn, maxDownloads } = opts as Record<string, unknown>;
    if (!fileName || typeof fileName !== 'string') {
      return fail('VALIDATION_ERROR', 'fileName is required');
    }
    if (!data || typeof data !== 'string') {
      return fail('VALIDATION_ERROR', 'data (base64) is required');
    }
    if (!expiresIn || typeof expiresIn !== 'string' || !validFileExpiresIn.includes(expiresIn)) {
      return fail('VALIDATION_ERROR', 'expiresIn must be one of: 1h, 24h, 7d, 30d');
    }
    const buf = Buffer.from(data as string, 'base64');
    const licEmail = (services.licenseManager.getLicense() as { email?: string }).email;
    return ok(services.secureFileService.upload(
      { fileName: fileName as string, mimeType: (mimeType as string) || 'application/octet-stream', data: buf, expiresIn: expiresIn as '1h' | '24h' | '7d' | '30d', maxDownloads: typeof maxDownloads === 'number' ? maxDownloads : -1 },
      'QShield User',
      licEmail || 'user@qshield.app',
    ));
  });

  wrapHandler(IPC_CHANNELS.SECURE_FILE_LIST, async () => {
    return ok(services.secureFileService.list());
  });

  wrapHandler(IPC_CHANNELS.SECURE_FILE_GET, async (_event, id) => {
    const validId = validateString(id, 'id');
    return ok(services.secureFileService.get(validId));
  });

  wrapHandler(IPC_CHANNELS.SECURE_FILE_DESTROY, async (_event, id) => {
    const validId = validateString(id, 'id');
    return ok(services.secureFileService.destroy(validId));
  });

  // ── High-Trust Assets ──────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.ASSET_LIST, async () => {
    return ok(services.assetService.list());
  });

  wrapHandler(IPC_CHANNELS.ASSET_ADD, async (_event, opts) => {
    if (!opts || typeof opts !== 'object') {
      return fail('VALIDATION_ERROR', 'Asset options are required');
    }
    const { path: assetPath, type, sensitivity, name } = opts as Record<string, unknown>;
    if (!assetPath || typeof assetPath !== 'string') {
      return fail('VALIDATION_ERROR', 'path is required');
    }
    if (type !== 'file' && type !== 'directory') {
      return fail('VALIDATION_ERROR', 'type must be "file" or "directory"');
    }
    const validSensitivities = ['normal', 'strict', 'critical'];
    if (!sensitivity || typeof sensitivity !== 'string' || !validSensitivities.includes(sensitivity)) {
      return fail('VALIDATION_ERROR', 'sensitivity must be "normal", "strict", or "critical"');
    }
    // Duplicate check
    const existing = services.assetService.getByPath(assetPath as string);
    if (existing) {
      return fail('DUPLICATE_ASSET', 'This file is already being monitored');
    }
    // Feature gate: check asset limit
    const license = services.licenseManager.getLicense() as { features: { maxHighTrustAssets: number } };
    const currentAssets = services.assetService.list() as unknown[];
    const maxAssets = license.features.maxHighTrustAssets;
    if (currentAssets.length >= maxAssets) {
      return fail('FEATURE_LIMIT', `Your plan allows ${maxAssets} high-trust asset${maxAssets !== 1 ? 's' : ''}. Upgrade to add more.`);
    }
    const result = await services.assetService.add(
      assetPath as string,
      type as 'file' | 'directory',
      sensitivity as string,
      typeof name === 'string' ? name : undefined,
    );
    return ok(result);
  });

  wrapHandler(IPC_CHANNELS.ASSET_REMOVE, async (_event, id) => {
    const validId = validateString(id, 'id');
    await services.assetService.remove(validId);
    return ok(null);
  });

  wrapHandler(IPC_CHANNELS.ASSET_GET, async (_event, id) => {
    const validId = validateString(id, 'id');
    return ok(services.assetService.get(validId));
  });

  wrapHandler(IPC_CHANNELS.ASSET_VERIFY, async (_event, id) => {
    const validId = validateString(id, 'id');
    return ok(await services.assetService.verify(validId));
  });

  wrapHandler(IPC_CHANNELS.ASSET_ACCEPT, async (_event, id) => {
    const validId = validateString(id, 'id');
    return ok(await services.assetService.accept(validId));
  });

  wrapHandler(IPC_CHANNELS.ASSET_UPDATE_SENSITIVITY, async (_event, id, sensitivity) => {
    const validId = validateString(id, 'id');
    const validSensitivities = ['normal', 'strict', 'critical'];
    if (typeof sensitivity !== 'string' || !validSensitivities.includes(sensitivity)) {
      return fail('VALIDATION_ERROR', 'sensitivity must be "normal", "strict", or "critical"');
    }
    return ok(services.assetService.updateSensitivity(validId, sensitivity));
  });

  wrapHandler(IPC_CHANNELS.ASSET_ENABLE, async (_event, id, enabled) => {
    const validId = validateString(id, 'id');
    if (typeof enabled !== 'boolean') {
      return fail('VALIDATION_ERROR', 'enabled must be a boolean');
    }
    return ok(services.assetService.enable(validId, enabled));
  });

  wrapHandler(IPC_CHANNELS.ASSET_STATS, async () => {
    return ok(services.assetService.stats());
  });

  wrapHandler(IPC_CHANNELS.ASSET_CHANGE_LOG, async (_event, id, limit) => {
    const validId = validateString(id, 'id');
    const validLimit = typeof limit === 'number' && limit > 0 ? limit : 50;
    return ok(services.assetService.changeLog(validId, validLimit));
  });

  wrapHandler(IPC_CHANNELS.ASSET_BROWSE, async () => {
    return ok(await services.assetService.browse());
  });

  // ── Trust History ──────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.TRUST_HISTORY_LIFETIME, async () => {
    return ok(services.trustHistory.getLifetimeStats());
  });

  wrapHandler(IPC_CHANNELS.TRUST_HISTORY_DAILY, async (_event, date) => {
    const validDate = validateString(date, 'date');
    return ok(services.trustHistory.getDailySummary(validDate));
  });

  wrapHandler(IPC_CHANNELS.TRUST_HISTORY_DAILY_RANGE, async (_event, from, to) => {
    const validFrom = validateString(from, 'from');
    const validTo = validateString(to, 'to');
    return ok(services.trustHistory.getDailySummaries(validFrom, validTo));
  });

  wrapHandler(IPC_CHANNELS.TRUST_HISTORY_SCORE_HISTORY, async (_event, days) => {
    const validDays = typeof days === 'number' && days > 0 ? days : 7;
    return ok(services.trustHistory.getScoreHistory(validDays));
  });

  wrapHandler(IPC_CHANNELS.TRUST_HISTORY_MILESTONES, async () => {
    return ok(services.trustHistory.getMilestones());
  });

  wrapHandler(IPC_CHANNELS.TRUST_HISTORY_TREND, async (_event, days) => {
    const validDays = typeof days === 'number' && days > 0 ? days : 14;
    return ok(services.trustHistory.getTrend(validDays));
  });

  // ── Email Notifications ─────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.EMAIL_NOTIFY_GET_CONFIG, async () => {
    return ok(services.emailNotifier.getConfig());
  });

  wrapHandler(IPC_CHANNELS.EMAIL_NOTIFY_SET_CONFIG, async (_event, config) => {
    // Feature gate: check emailNotifications
    if (!services.licenseManager.hasFeature('emailNotifications')) {
      return fail('FEATURE_LOCKED', 'Email notifications require a Pro plan or higher.');
    }
    services.emailNotifier.setConfig(config as Record<string, unknown>);
    return ok(null);
  });

  wrapHandler(IPC_CHANNELS.EMAIL_NOTIFY_TEST, async () => {
    return ok(await services.emailNotifier.sendTest());
  });

  // ── Security ────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.SECURITY_KEY_STATUS, async () => {
    if (!services.keyManager) {
      return ok({ initialized: false, safeStorageAvailable: false, backend: 'none' });
    }
    return ok(services.keyManager.getStatus());
  });

  // ── Trust Profile (aliases for trustHistory) ───────────────────────
  wrapHandler(IPC_CHANNELS.TRUST_PROFILE, async () => {
    return ok(services.trustHistory.getLifetimeStats());
  });

  wrapHandler(IPC_CHANNELS.TRUST_HISTORY, async (_event, days) => {
    const validDays = typeof days === 'number' && days > 0 ? days : 7;
    return ok(services.trustHistory.getScoreHistory(validDays));
  });

  wrapHandler(IPC_CHANNELS.TRUST_MILESTONES, async () => {
    return ok(services.trustHistory.getMilestones());
  });

  wrapHandler(IPC_CHANNELS.TRUST_DAILY_SUMMARIES, async (_event, from, to) => {
    const validFrom = validateString(from, 'from');
    const validTo = validateString(to, 'to');
    return ok(services.trustHistory.getDailySummaries(validFrom, validTo));
  });

  // ── Trust Reports ──────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.REPORT_GENERATE, async (_event, opts) => {
    if (!opts || typeof opts !== 'object') {
      return fail('VALIDATION_ERROR', 'Report options are required');
    }
    const { type, fromDate, toDate, assetId, notes } = opts as Record<string, unknown>;
    const validTypes = ['snapshot', 'period', 'asset'];
    if (typeof type !== 'string' || !validTypes.includes(type)) {
      return fail('VALIDATION_ERROR', 'type must be "snapshot", "period", or "asset"');
    }
    // Feature gate: check report type access
    if (type === 'period' && !services.licenseManager.hasFeature('trustReports')) {
      return fail('FEATURE_LOCKED', 'Period reports require a Pro plan or higher.');
    }
    if (type === 'asset' && !services.licenseManager.hasFeature('assetReports')) {
      return fail('FEATURE_LOCKED', 'Asset reports require a Business plan or higher.');
    }
    const report = await services.reportService.generate({
      type: type as string,
      fromDate: typeof fromDate === 'string' ? fromDate : undefined,
      toDate: typeof toDate === 'string' ? toDate : undefined,
      assetId: typeof assetId === 'string' ? assetId : undefined,
      notes: typeof notes === 'string' ? notes : undefined,
    });
    return ok(report);
  });

  wrapHandler(IPC_CHANNELS.REPORT_LIST, async () => {
    return ok(services.reportService.list());
  });

  wrapHandler(IPC_CHANNELS.REPORT_GET, async (_event, id) => {
    const validId = validateString(id, 'id');
    return ok(services.reportService.get(validId));
  });

  wrapHandler(IPC_CHANNELS.REPORT_EXPORT_PDF, async (_event, id) => {
    const validId = validateString(id, 'id');
    const pdfPath = services.reportService.getPdfPath(validId);
    if (!pdfPath) {
      return fail('NOT_FOUND', 'No PDF found for this report');
    }

    const visibleWindows = BrowserWindow.getAllWindows().filter((w) => w.isVisible() && !w.isDestroyed());
    const win = visibleWindows[0];
    if (!win) {
      return fail('NO_WINDOW', 'No visible window for save dialog');
    }

    const result = await dialog.showSaveDialog(win, {
      title: 'Save Trust Report',
      defaultPath: `QShield-Trust-Report-${validId.slice(0, 8)}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    });

    if (result.canceled || !result.filePath) {
      return ok({ saved: false });
    }

    await copyFile(pdfPath, result.filePath);
    log.info(`REPORT_EXPORT_PDF: PDF exported to ${result.filePath}`);
    return ok({ saved: true, path: result.filePath });
  });

  wrapHandler(IPC_CHANNELS.REPORT_REVIEW_PDF, async (_event, id) => {
    const validId = validateString(id, 'id');
    const pdfPath = services.reportService.getPdfPath(validId);
    if (!pdfPath) {
      return fail('NOT_FOUND', 'No PDF found for this report');
    }

    const tempPath = join(app.getPath('temp'), `qshield-report-${validId.slice(0, 8)}.pdf`);
    await copyFile(pdfPath, tempPath);
    const errMsg = await shell.openPath(tempPath);
    if (errMsg) {
      log.error(`REPORT_REVIEW_PDF: shell.openPath failed: ${errMsg}`);
      return fail('OPEN_FAILED', `Failed to open PDF: ${errMsg}`);
    }
    return ok(null);
  });

  log.info('All IPC handlers registered');
}
