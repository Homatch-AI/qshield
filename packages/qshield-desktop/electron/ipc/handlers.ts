/**
 * IPC handler registration with validation, rate limiting, and structured responses.
 * Every handler validates input, logs calls with timing, and returns structured results.
 */
import { ipcMain, app } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS } from './channels';
import {
  IpcValidationError,
  validateListOptions,
  validateUuid,
  validateSearchQuery,
  validateExportIds,
  validateCertOptions,
  validateUrl,
  validateAlertId,
  validateAdapterId,
  validateConfigKey,
  validatePolicyConfig,
  type ListOptionsInput,
  type CertOptionsInput,
  type PolicyConfigInput,
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
    generate: (opts: CertOptionsInput) => unknown;
    list: () => unknown;
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
    set: (key: string, value: unknown) => unknown;
  };
  adapterManager: {
    getStatus: () => unknown;
    enable: (id: string) => unknown;
    disable: (id: string) => unknown;
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
    return ok(services.certGenerator.generate(validOpts));
  });

  wrapHandler(IPC_CHANNELS.CERT_LIST, async () => {
    return ok(services.certGenerator.list());
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

  // ── App ──────────────────────────────────────────────────────────────
  wrapHandler(IPC_CHANNELS.APP_VERSION, async () => {
    return ok(app.getVersion());
  });

  wrapHandler(IPC_CHANNELS.APP_QUIT, async () => {
    app.quit();
    return ok(null);
  });

  log.info('All IPC handlers registered');
}
