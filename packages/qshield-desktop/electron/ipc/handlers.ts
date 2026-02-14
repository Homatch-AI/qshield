/**
 * IPC handler registration with validation, rate limiting, and structured responses.
 * Every handler validates input, logs calls with timing, and returns structured results.
 */
import { ipcMain, app, clipboard, dialog, BrowserWindow } from 'electron';
import { copyFile } from 'node:fs/promises';
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
    setLicense: (license: unknown) => unknown;
    clearLicense: () => unknown;
    hasFeature: (feature: string) => boolean;
    getEdition: () => string;
    loadMockLicense: (edition: string) => void;
  };
  authService: {
    login: (credentials: { email: string; password: string }) => Promise<unknown>;
    register: (credentials: { email: string; password: string; name: string }) => Promise<unknown>;
    logout: () => Promise<void>;
    getSession: () => unknown;
    getUser: () => unknown;
    restore: () => Promise<boolean>;
    switchEdition: (edition: string) => Promise<unknown>;
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
    return ok(result);
  });

  wrapHandler(IPC_CHANNELS.SIGNATURE_COPY, async (_event, config) => {
    const score = services.signatureGenerator.getCurrentTrustScore();
    const result = services.signatureGenerator.generate(config, score) as { html: string; trustScore: number };
    clipboard.writeHTML(result.html);
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

  wrapHandler(IPC_CHANNELS.LICENSE_SET, async (_event, license) => {
    if (!license || typeof license !== 'object') {
      return fail('VALIDATION_ERROR', 'License object is required');
    }
    const result = services.licenseManager.setLicense(license);
    return ok({ accepted: result, edition: services.licenseManager.getEdition() });
  });

  wrapHandler(IPC_CHANNELS.LICENSE_CLEAR, async () => {
    services.licenseManager.clearLicense();
    return ok(null);
  });

  wrapHandler(IPC_CHANNELS.LICENSE_CHECK_FEATURE, async (_event, feature) => {
    const validFeature = validateString(feature, 'feature');
    return ok({
      feature: validFeature,
      allowed: services.licenseManager.hasFeature(validFeature),
      edition: services.licenseManager.getEdition(),
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.AUTH_LOGIN, async (_event, credentials) => {
    if (!credentials || typeof credentials !== 'object') {
      return fail('VALIDATION_ERROR', 'Login credentials are required');
    }
    const { email, password } = credentials as { email?: string; password?: string };
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return fail('VALIDATION_ERROR', 'Valid email address is required');
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return fail('VALIDATION_ERROR', 'Password must be at least 8 characters');
    }
    const session = await services.authService.login({ email, password });
    services.licenseManager.loadMockLicense((session as { user: { edition: string } }).user.edition);
    return ok(session);
  });

  wrapHandler(IPC_CHANNELS.AUTH_REGISTER, async (_event, credentials) => {
    if (!credentials || typeof credentials !== 'object') {
      return fail('VALIDATION_ERROR', 'Registration credentials are required');
    }
    const { email, password, name } = credentials as { email?: string; password?: string; name?: string };
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return fail('VALIDATION_ERROR', 'Valid email address is required');
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return fail('VALIDATION_ERROR', 'Password must be at least 8 characters');
    }
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return fail('VALIDATION_ERROR', 'Name is required');
    }
    const session = await services.authService.register({ email, password, name });
    services.licenseManager.loadMockLicense((session as { user: { edition: string } }).user.edition);
    return ok(session);
  });

  wrapHandler(IPC_CHANNELS.AUTH_LOGOUT, async () => {
    await services.authService.logout();
    services.licenseManager.clearLicense();
    return ok(null);
  });

  wrapHandler(IPC_CHANNELS.AUTH_GET_SESSION, async () => {
    return ok(services.authService.getSession());
  });

  wrapHandler(IPC_CHANNELS.AUTH_GET_USER, async () => {
    return ok(services.authService.getUser());
  });

  wrapHandler(IPC_CHANNELS.AUTH_RESTORE, async () => {
    const restored = await services.authService.restore();
    if (restored) {
      const user = services.authService.getUser() as { edition: string } | null;
      if (user) {
        services.licenseManager.loadMockLicense(user.edition);
      }
    }
    return ok(restored);
  });

  const validEditions = ['free', 'personal', 'business', 'enterprise'];

  wrapHandler(IPC_CHANNELS.AUTH_SWITCH_EDITION, async (_event, edition) => {
    if (typeof edition !== 'string' || !validEditions.includes(edition)) {
      return fail('VALIDATION_ERROR', 'Edition must be "free", "personal", "business", or "enterprise"');
    }
    const session = await services.authService.switchEdition(edition);
    services.licenseManager.loadMockLicense(edition);
    return ok(session);
  });

  wrapHandler(IPC_CHANNELS.LICENSE_LOAD_MOCK, async (_event, edition) => {
    if (typeof edition !== 'string' || !validEditions.includes(edition)) {
      return fail('VALIDATION_ERROR', 'Edition must be "free", "personal", "business", or "enterprise"');
    }
    services.licenseManager.loadMockLicense(edition);
    return ok(null);
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

  log.info('All IPC handlers registered');
}
