import { ipcMain } from 'electron';
import log from 'electron-log';
import { IPC_CHANNELS } from './channels';
import {
  validateString,
  validateUuid,
  validateListOptions,
  validateUrl,
  validateStringArray,
  validatePolicyConfig,
  validateConfigKey,
  validateAdapterId,
  validateCertOptions,
  ValidationError,
} from './validators';

/** Service registry passed to handler registration */
export interface ServiceRegistry {
  trustMonitor: {
    getState: () => unknown;
    subscribe: () => void;
    unsubscribe: () => void;
  };
  evidenceStore: {
    list: (opts: ReturnType<typeof validateListOptions>) => unknown;
    get: (id: string) => unknown;
    verify: (id: string) => unknown;
    search: (query: string) => unknown;
    export: (ids: string[]) => unknown;
  };
  certGenerator: {
    generate: (opts: ReturnType<typeof validateCertOptions>) => unknown;
    list: () => unknown;
  };
  gatewayClient: {
    getStatus: () => unknown;
    connect: (url: string) => unknown;
    disconnect: () => unknown;
  };
  policyEnforcer: {
    getPolicy: () => unknown;
    updatePolicy: (config: unknown) => unknown;
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

/**
 * Wraps an IPC handler with error handling and logging.
 */
function wrapHandler(
  channel: string,
  handler: (_event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>,
) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      if (error instanceof ValidationError) {
        log.warn(`IPC validation error on ${channel}:`, error.message);
        return { error: error.message, code: 'VALIDATION_ERROR' };
      }
      log.error(`IPC error on ${channel}:`, error);
      return { error: 'Internal error', code: 'INTERNAL_ERROR' };
    }
  });
}

/**
 * Register all IPC handlers with input validation.
 */
export function registerIpcHandlers(services: ServiceRegistry): void {
  // Trust
  wrapHandler(IPC_CHANNELS.TRUST_GET_STATE, async () => {
    return services.trustMonitor.getState();
  });

  wrapHandler(IPC_CHANNELS.TRUST_SUBSCRIBE, async () => {
    services.trustMonitor.subscribe();
    return { ok: true };
  });

  wrapHandler(IPC_CHANNELS.TRUST_UNSUBSCRIBE, async () => {
    services.trustMonitor.unsubscribe();
    return { ok: true };
  });

  // Evidence
  wrapHandler(IPC_CHANNELS.EVIDENCE_LIST, async (_event, opts) => {
    const validated = validateListOptions(opts);
    return services.evidenceStore.list(validated);
  });

  wrapHandler(IPC_CHANNELS.EVIDENCE_GET, async (_event, id) => {
    const validId = validateUuid(id, 'evidence ID');
    return services.evidenceStore.get(validId);
  });

  wrapHandler(IPC_CHANNELS.EVIDENCE_VERIFY, async (_event, id) => {
    const validId = validateUuid(id, 'evidence ID');
    return services.evidenceStore.verify(validId);
  });

  wrapHandler(IPC_CHANNELS.EVIDENCE_SEARCH, async (_event, query) => {
    const validQuery = validateString(query, 'search query');
    return services.evidenceStore.search(validQuery);
  });

  wrapHandler(IPC_CHANNELS.EVIDENCE_EXPORT, async (_event, ids) => {
    const validIds = validateStringArray(ids, 'evidence IDs');
    return services.evidenceStore.export(validIds);
  });

  // Certificates
  wrapHandler(IPC_CHANNELS.CERT_GENERATE, async (_event, opts) => {
    const validOpts = validateCertOptions(opts);
    return services.certGenerator.generate(validOpts);
  });

  wrapHandler(IPC_CHANNELS.CERT_LIST, async () => {
    return services.certGenerator.list();
  });

  // Gateway
  wrapHandler(IPC_CHANNELS.GATEWAY_STATUS, async () => {
    return services.gatewayClient.getStatus();
  });

  wrapHandler(IPC_CHANNELS.GATEWAY_CONNECT, async (_event, url) => {
    const validUrl = validateUrl(url, 'gateway URL');
    return services.gatewayClient.connect(validUrl);
  });

  wrapHandler(IPC_CHANNELS.GATEWAY_DISCONNECT, async () => {
    return services.gatewayClient.disconnect();
  });

  // Alerts
  wrapHandler(IPC_CHANNELS.ALERT_LIST, async () => {
    return services.alertService.list();
  });

  wrapHandler(IPC_CHANNELS.ALERT_DISMISS, async (_event, id) => {
    const validId = validateUuid(id, 'alert ID');
    return services.alertService.dismiss(validId);
  });

  wrapHandler(IPC_CHANNELS.ALERT_SUBSCRIBE, async () => {
    // Subscription handled via IPC events pushed from main
    return { ok: true };
  });

  // Policy
  wrapHandler(IPC_CHANNELS.POLICY_GET, async () => {
    return services.policyEnforcer.getPolicy();
  });

  wrapHandler(IPC_CHANNELS.POLICY_UPDATE, async (_event, config) => {
    validatePolicyConfig(config);
    return services.policyEnforcer.updatePolicy(config);
  });

  // Config
  wrapHandler(IPC_CHANNELS.CONFIG_GET, async (_event, key) => {
    const validKey = validateConfigKey(key);
    return services.configManager.get(validKey);
  });

  wrapHandler(IPC_CHANNELS.CONFIG_SET, async (_event, key, value) => {
    const validKey = validateConfigKey(key);
    return services.configManager.set(validKey, value);
  });

  // Adapters
  wrapHandler(IPC_CHANNELS.ADAPTER_STATUS, async () => {
    return services.adapterManager.getStatus();
  });

  wrapHandler(IPC_CHANNELS.ADAPTER_ENABLE, async (_event, id) => {
    const validId = validateAdapterId(id);
    return services.adapterManager.enable(validId);
  });

  wrapHandler(IPC_CHANNELS.ADAPTER_DISABLE, async (_event, id) => {
    const validId = validateAdapterId(id);
    return services.adapterManager.disable(validId);
  });

  // App
  wrapHandler(IPC_CHANNELS.APP_VERSION, async () => {
    const { app } = await import('electron');
    return app.getVersion();
  });

  wrapHandler(IPC_CHANNELS.APP_QUIT, async () => {
    const { app } = await import('electron');
    app.quit();
    return { ok: true };
  });

  log.info('All IPC handlers registered');
}
