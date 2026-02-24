/**
 * Preload script — runs in a sandboxed renderer context.
 * Exposes a typed `window.qshield` API via contextBridge.
 *
 * Security invariants:
 * - All IPC uses invoke (request/response), never send/sendSync
 * - No Node.js APIs leak to the renderer
 * - contextBridge serializes all data (no prototype pollution)
 *
 * IPC envelope unwrapping:
 * - Main process handlers return { success, data } or { success: false, error }
 * - This preload auto-unwraps: returns `data` on success, throws on failure
 * - Renderer code receives clean data, never sees the envelope
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from './ipc/channels';

// ── IPC envelope unwrapper ────────────────────────────────────────────────────

/**
 * Invoke an IPC channel and unwrap the structured response envelope.
 * Returns `data` on success, throws Error on failure.
 */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = await ipcRenderer.invoke(channel, ...args);

  // Handle the { success, data, error } envelope from wrapHandler
  if (response && typeof response === 'object' && 'success' in response) {
    if (response.success) {
      return response.data as T;
    }
    const errMsg = response.error?.message ?? 'IPC call failed';
    const err = new Error(errMsg);
    (err as Error & { code?: string }).code = response.error?.code;
    throw err;
  }

  // If the response is not an envelope (shouldn't happen), return as-is
  return response as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrustState {
  score: number;
  level: 'critical' | 'warning' | 'elevated' | 'normal' | 'verified';
  signals: Array<{
    source: string;
    score: number;
    weight: number;
    timestamp: string;
    metadata: Record<string, unknown>;
  }>;
  lastUpdated: string;
  sessionId: string;
}

interface ListOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: Record<string, unknown>;
}

interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface EvidenceRecord {
  id: string;
  hash: string;
  previousHash: string | null;
  timestamp: string;
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
  verified: boolean;
  signature?: string;
}

interface CertOptions {
  sessionId: string;
  evidenceIds?: string[];
  includeAllEvidence?: boolean;
}

interface TrustCertificate {
  id: string;
  sessionId: string;
  generatedAt: string;
  trustScore?: number;
  trustLevel?: string;
  evidenceCount?: number;
  pdfPath?: string;
}

interface Alert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  source: string;
  timestamp: string;
  dismissed: boolean;
  actionTaken?: string;
}

interface PolicyConfig {
  rules: Array<{
    id: string;
    name: string;
    condition: { signal: string; operator: string; threshold: number };
    action: string;
    severity: string;
    enabled: boolean;
  }>;
  escalation: {
    channels: string[];
    webhookUrl?: string;
    emailRecipients?: string[];
    cooldownMinutes: number;
  };
  autoFreeze: {
    enabled: boolean;
    trustScoreThreshold: number;
    durationMinutes: number;
  };
}

interface AdapterStatus {
  id: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  lastEvent?: string;
  eventCount: number;
  error?: string;
}

interface GatewayStatus {
  connected: boolean;
  url: string;
}

interface HighTrustAsset {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  sensitivity: 'normal' | 'strict' | 'critical';
  trustState: 'verified' | 'changed' | 'unverified';
  trustScore: number;
  contentHash: string | null;
  verifiedHash: string | null;
  createdAt: string;
  lastVerified: string | null;
  lastChanged: string | null;
  changeCount: number;
  evidenceCount: number;
  enabled: boolean;
}

interface AssetChangeEvent {
  assetId: string;
  path: string;
  sensitivity: 'normal' | 'strict' | 'critical';
  eventType: string;
  previousHash: string | null;
  newHash: string | null;
  trustStateBefore: string;
  trustStateAfter: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface AssetStats {
  total: number;
  verified: number;
  changed: number;
  unverified: number;
  bySensitivity: Record<string, number>;
}

type EventCallback<T> = (data: T) => void;

// ── Subscription management ──────────────────────────────────────────────────

const unsubscribers = new Map<string, () => void>();

// ── Exposed API ──────────────────────────────────────────────────────────────

/**
 * The `window.qshield` API exposed to the renderer process.
 * All invoke-based methods auto-unwrap the IPC envelope:
 *   - Returns `data` directly on success
 *   - Throws Error on failure
 */
contextBridge.exposeInMainWorld('qshield', {
  trust: {
    getState: (): Promise<TrustState> =>
      invoke<TrustState>(IPC_CHANNELS.TRUST_GET_STATE),

    subscribe: (callback: EventCallback<TrustState>): void => {
      const handler = (_event: Electron.IpcRendererEvent, data: TrustState) => callback(data);
      ipcRenderer.on(IPC_EVENTS.TRUST_STATE_UPDATED, handler);
      ipcRenderer.invoke(IPC_CHANNELS.TRUST_SUBSCRIBE);
      unsubscribers.set('trust', () => {
        ipcRenderer.removeListener(IPC_EVENTS.TRUST_STATE_UPDATED, handler);
      });
    },

    unsubscribe: (): void => {
      const unsub = unsubscribers.get('trust');
      if (unsub) {
        unsub();
        unsubscribers.delete('trust');
      }
      ipcRenderer.invoke(IPC_CHANNELS.TRUST_UNSUBSCRIBE);
    },
  },

  evidence: {
    list: (opts?: ListOptions): Promise<ListResult<EvidenceRecord>> =>
      invoke<ListResult<EvidenceRecord>>(IPC_CHANNELS.EVIDENCE_LIST, opts),

    get: (id: string): Promise<EvidenceRecord> =>
      invoke<EvidenceRecord>(IPC_CHANNELS.EVIDENCE_GET, id),

    getOne: (id: string): Promise<EvidenceRecord> =>
      invoke<EvidenceRecord>(IPC_CHANNELS.EVIDENCE_GET, id),

    verify: (id: string): Promise<{ valid: boolean; errors: string[] }> =>
      invoke<{ valid: boolean; errors: string[] }>(IPC_CHANNELS.EVIDENCE_VERIFY, id),

    search: (query: string): Promise<ListResult<EvidenceRecord>> =>
      invoke<ListResult<EvidenceRecord>>(IPC_CHANNELS.EVIDENCE_SEARCH, query),

    export: (ids: string[]): Promise<{ ok: boolean }> =>
      invoke<{ ok: boolean }>(IPC_CHANNELS.EVIDENCE_EXPORT, ids),
  },

  certificates: {
    generate: (opts: CertOptions): Promise<TrustCertificate> =>
      invoke<TrustCertificate>(IPC_CHANNELS.CERT_GENERATE, opts),

    list: (): Promise<TrustCertificate[]> =>
      invoke<TrustCertificate[]>(IPC_CHANNELS.CERT_LIST),

    exportPdf: (id: string): Promise<{ saved: boolean; path?: string }> =>
      invoke<{ saved: boolean; path?: string }>(IPC_CHANNELS.CERT_EXPORT_PDF, id),

    reviewPdf: (id: string): Promise<void> =>
      invoke<void>(IPC_CHANNELS.CERT_REVIEW_PDF, id),
  },

  gateway: {
    status: (): Promise<GatewayStatus> =>
      invoke<GatewayStatus>(IPC_CHANNELS.GATEWAY_STATUS),

    getStatus: (): Promise<GatewayStatus> =>
      invoke<GatewayStatus>(IPC_CHANNELS.GATEWAY_STATUS),

    connect: (url: string): Promise<GatewayStatus> =>
      invoke<GatewayStatus>(IPC_CHANNELS.GATEWAY_CONNECT, url),

    disconnect: (): Promise<GatewayStatus> =>
      invoke<GatewayStatus>(IPC_CHANNELS.GATEWAY_DISCONNECT),

    reconnect: (): Promise<GatewayStatus> =>
      invoke<GatewayStatus>(IPC_CHANNELS.GATEWAY_DISCONNECT)
        .then(() => invoke<GatewayStatus>(IPC_CHANNELS.GATEWAY_STATUS)),
  },

  alerts: {
    list: (): Promise<Alert[]> =>
      invoke<Alert[]>(IPC_CHANNELS.ALERT_LIST),

    dismiss: (id: string): Promise<{ id: string; dismissed: boolean }> =>
      invoke<{ id: string; dismissed: boolean }>(IPC_CHANNELS.ALERT_DISMISS, id),

    subscribe: (callback: EventCallback<Alert>): void => {
      const handler = (_event: Electron.IpcRendererEvent, data: Alert) => callback(data);
      ipcRenderer.on(IPC_EVENTS.ALERT_RECEIVED, handler);
      ipcRenderer.invoke(IPC_CHANNELS.ALERT_SUBSCRIBE);
      unsubscribers.set('alerts', () => {
        ipcRenderer.removeListener(IPC_EVENTS.ALERT_RECEIVED, handler);
      });
    },
  },

  policy: {
    get: (): Promise<PolicyConfig> =>
      invoke<PolicyConfig>(IPC_CHANNELS.POLICY_GET),

    update: (policy: PolicyConfig): Promise<PolicyConfig> =>
      invoke<PolicyConfig>(IPC_CHANNELS.POLICY_UPDATE, policy),
  },

  config: {
    get: (key: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.CONFIG_GET, key),

    getAll: (): Promise<Record<string, unknown>> =>
      invoke<Record<string, unknown>>(IPC_CHANNELS.CONFIG_GET_ALL),

    set: (key: string, value: unknown): Promise<null> =>
      invoke<null>(IPC_CHANNELS.CONFIG_SET, key, value),
  },

  adapters: {
    status: (): Promise<AdapterStatus[]> =>
      invoke<AdapterStatus[]>(IPC_CHANNELS.ADAPTER_STATUS),

    list: (): Promise<AdapterStatus[]> =>
      invoke<AdapterStatus[]>(IPC_CHANNELS.ADAPTER_STATUS),

    enable: (id: string): Promise<{ id: string; enabled: boolean }> =>
      invoke<{ id: string; enabled: boolean }>(IPC_CHANNELS.ADAPTER_ENABLE, id),

    disable: (id: string): Promise<{ id: string; enabled: boolean }> =>
      invoke<{ id: string; enabled: boolean }>(IPC_CHANNELS.ADAPTER_DISABLE, id),
  },

  signature: {
    generate: (config: unknown): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.SIGNATURE_GENERATE, config),

    copy: (config?: unknown): Promise<{ copied: boolean; trustScore: number }> =>
      invoke<{ copied: boolean; trustScore: number }>(IPC_CHANNELS.SIGNATURE_COPY, config),

    getConfig: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.SIGNATURE_GET_CONFIG),

    setConfig: (config: unknown): Promise<null> =>
      invoke<null>(IPC_CHANNELS.SIGNATURE_SET_CONFIG, config),
  },

  verification: {
    getStats: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.VERIFY_GET_STATS),
  },

  crypto: {
    getStatus: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.CRYPTO_GET_STATUS),

    verifyAddress: (address: string, chain: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.CRYPTO_VERIFY_ADDRESS, { address, chain }),

    verifyTransaction: (hash: string, chain: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.CRYPTO_VERIFY_TRANSACTION, { hash, chain }),

    getAddressBook: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.CRYPTO_GET_ADDRESS_BOOK),

    addTrustedAddress: (address: string, chain: string, label?: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.CRYPTO_ADD_TRUSTED_ADDRESS, { address, chain, label }),

    removeTrustedAddress: (address: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.CRYPTO_REMOVE_TRUSTED_ADDRESS, address),

    getAlerts: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.CRYPTO_GET_ALERTS),

    getClipboardStatus: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.CRYPTO_CLIPBOARD_STATUS),
  },

  license: {
    get: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.LICENSE_GET),

    activate: (key: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.LICENSE_ACTIVATE, key),

    deactivate: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.LICENSE_DEACTIVATE),

    generateTest: (tier: string, days?: number): Promise<{ key: string }> =>
      invoke<{ key: string }>(IPC_CHANNELS.LICENSE_GENERATE_TEST, tier, days),

    checkFeature: (feature: string): Promise<{ allowed: boolean }> =>
      invoke<{ allowed: boolean }>(IPC_CHANNELS.FEATURE_CHECK, feature),

    getFlags: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.FEATURE_FLAGS),
  },

  features: {
    check: (feature: string): Promise<{ allowed: boolean }> =>
      invoke<{ allowed: boolean }>(IPC_CHANNELS.FEATURE_CHECK, feature),

    flags: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.FEATURE_FLAGS),
  },

  api: {
    getInfo: (): Promise<{ port: number; token: string; running: boolean }> =>
      invoke<{ port: number; token: string; running: boolean }>(IPC_CHANNELS.API_GET_INFO),

    regenerateToken: (): Promise<{ token: string }> =>
      invoke<{ token: string }>(IPC_CHANNELS.API_REGENERATE_TOKEN),
  },

  secureMessage: {
    create: (opts: unknown): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.SECURE_MSG_CREATE, opts),

    list: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.SECURE_MSG_LIST),

    get: (id: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.SECURE_MSG_GET, id),

    destroy: (id: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.SECURE_MSG_DESTROY, id),

    getAccessLog: (id: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.SECURE_MSG_ACCESS_LOG, id),

    copyLink: (id: string): Promise<null> =>
      invoke<null>(IPC_CHANNELS.SECURE_MSG_COPY_LINK, id),
  },

  gmail: {
    connect: (): Promise<{ email: string }> =>
      invoke<{ email: string }>(IPC_CHANNELS.GMAIL_CONNECT),

    disconnect: (): Promise<void> =>
      invoke<void>(IPC_CHANNELS.GMAIL_DISCONNECT),

    getStatus: (): Promise<{ connected: boolean; email: string | null }> =>
      invoke<{ connected: boolean; email: string | null }>(IPC_CHANNELS.GMAIL_STATUS),
  },

  fileWatcher: {
    configure: (config: Record<string, unknown>): Promise<void> =>
      invoke<void>(IPC_CHANNELS.FILE_WATCHER_CONFIGURE, config),

    getWatchedPaths: (): Promise<string[]> =>
      invoke<string[]>(IPC_CHANNELS.FILE_WATCHER_PATHS),
  },

  assets: {
    list: (): Promise<HighTrustAsset[]> =>
      invoke<HighTrustAsset[]>(IPC_CHANNELS.ASSET_LIST),

    add: (assetPath: string, type: 'file' | 'directory', sensitivity: 'normal' | 'strict' | 'critical', name?: string): Promise<HighTrustAsset> =>
      invoke<HighTrustAsset>(IPC_CHANNELS.ASSET_ADD, { path: assetPath, type, sensitivity, name }),

    remove: (id: string): Promise<void> =>
      invoke<void>(IPC_CHANNELS.ASSET_REMOVE, id),

    get: (id: string): Promise<HighTrustAsset | null> =>
      invoke<HighTrustAsset | null>(IPC_CHANNELS.ASSET_GET, id),

    verify: (id: string): Promise<HighTrustAsset | null> =>
      invoke<HighTrustAsset | null>(IPC_CHANNELS.ASSET_VERIFY, id),

    accept: (id: string): Promise<HighTrustAsset | null> =>
      invoke<HighTrustAsset | null>(IPC_CHANNELS.ASSET_ACCEPT, id),

    updateSensitivity: (id: string, sensitivity: 'normal' | 'strict' | 'critical'): Promise<HighTrustAsset | null> =>
      invoke<HighTrustAsset | null>(IPC_CHANNELS.ASSET_UPDATE_SENSITIVITY, id, sensitivity),

    enable: (id: string, enabled: boolean): Promise<boolean> =>
      invoke<boolean>(IPC_CHANNELS.ASSET_ENABLE, id, enabled),

    stats: (): Promise<AssetStats> =>
      invoke<AssetStats>(IPC_CHANNELS.ASSET_STATS),

    changeLog: (id: string, limit?: number): Promise<AssetChangeEvent[]> =>
      invoke<AssetChangeEvent[]>(IPC_CHANNELS.ASSET_CHANGE_LOG, id, limit),

    browse: (type: 'file' | 'directory'): Promise<string | null> =>
      invoke<string | null>(IPC_CHANNELS.ASSET_BROWSE, type),

    pause: (id: string, durationSeconds: number): Promise<null> =>
      invoke<null>(IPC_CHANNELS.ASSET_PAUSE, id, durationSeconds),

    resume: (id: string): Promise<null> =>
      invoke<null>(IPC_CHANNELS.ASSET_RESUME, id),

    lock: (id: string): Promise<{ locked: boolean }> =>
      invoke<{ locked: boolean }>(IPC_CHANNELS.ASSET_LOCK, id),

    unlock: (id: string): Promise<{ locked: boolean }> =>
      invoke<{ locked: boolean }>(IPC_CHANNELS.ASSET_UNLOCK, id),

    lockStatus: (id: string): Promise<{ locked: boolean }> =>
      invoke<{ locked: boolean }>(IPC_CHANNELS.ASSET_LOCK_STATUS, id),

    onChanged: (callback: EventCallback<{ event: AssetChangeEvent; asset: HighTrustAsset }>): void => {
      const handler = (_event: Electron.IpcRendererEvent, data: { event: AssetChangeEvent; asset: HighTrustAsset }) => callback(data);
      ipcRenderer.on(IPC_EVENTS.ASSET_CHANGED, handler);
      unsubscribers.set('asset-changed', () => {
        ipcRenderer.removeListener(IPC_EVENTS.ASSET_CHANGED, handler);
      });
    },
  },

  profile: {
    get: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.TRUST_PROFILE),

    history: (days: number): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.TRUST_HISTORY, days),

    milestones: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.TRUST_MILESTONES),

    dailySummaries: (from: string, to: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.TRUST_DAILY_SUMMARIES, from, to),
  },

  reports: {
    generate: (opts: { type: 'snapshot' | 'period' | 'asset'; fromDate?: string; toDate?: string; assetId?: string; notes?: string }): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.REPORT_GENERATE, opts),

    list: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.REPORT_LIST),

    exportPdf: (id: string): Promise<{ saved: boolean; path?: string }> =>
      invoke<{ saved: boolean; path?: string }>(IPC_CHANNELS.REPORT_EXPORT_PDF, id),

    reviewPdf: (id: string): Promise<void> =>
      invoke<void>(IPC_CHANNELS.REPORT_REVIEW_PDF, id),

    get: (id: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.REPORT_GET, id),
  },

  emailNotify: {
    getConfig: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.EMAIL_NOTIFY_GET_CONFIG),

    setConfig: (config: Record<string, unknown>): Promise<null> =>
      invoke<null>(IPC_CHANNELS.EMAIL_NOTIFY_SET_CONFIG, config),

    sendTest: (): Promise<{ sent: boolean; error?: string }> =>
      invoke<{ sent: boolean; error?: string }>(IPC_CHANNELS.EMAIL_NOTIFY_TEST),
  },

  trustHistory: {
    getLifetimeStats: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.TRUST_HISTORY_LIFETIME),

    getDailySummary: (date: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.TRUST_HISTORY_DAILY, date),

    getDailySummaries: (from: string, to: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.TRUST_HISTORY_DAILY_RANGE, from, to),

    getScoreHistory: (days: number): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.TRUST_HISTORY_SCORE_HISTORY, days),

    getMilestones: (): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.TRUST_HISTORY_MILESTONES),

    getTrend: (days: number): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.TRUST_HISTORY_TREND, days),
  },

  security: {
    keyStatus: (): Promise<{ initialized: boolean; safeStorageAvailable: boolean; backend: string }> =>
      invoke<{ initialized: boolean; safeStorageAvailable: boolean; backend: string }>(IPC_CHANNELS.SECURITY_KEY_STATUS),
  },

  update: {
    check: (): Promise<null> =>
      invoke<null>(IPC_CHANNELS.UPDATE_CHECK),

    download: (): Promise<null> =>
      invoke<null>(IPC_CHANNELS.UPDATE_DOWNLOAD),

    install: (): Promise<null> =>
      invoke<null>(IPC_CHANNELS.UPDATE_INSTALL),

    onChecking: (callback: () => void): void => {
      ipcRenderer.on(IPC_EVENTS.UPDATE_CHECKING, () => callback());
    },

    onAvailable: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void): void => {
      ipcRenderer.on(IPC_EVENTS.UPDATE_AVAILABLE, (_event: Electron.IpcRendererEvent, info: { version: string; releaseDate?: string; releaseNotes?: string }) => callback(info));
    },

    onNotAvailable: (callback: () => void): void => {
      ipcRenderer.on(IPC_EVENTS.UPDATE_NOT_AVAILABLE, () => callback());
    },

    onProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void): void => {
      ipcRenderer.on(IPC_EVENTS.UPDATE_PROGRESS, (_event: Electron.IpcRendererEvent, progress: { percent: number; transferred: number; total: number }) => callback(progress));
    },

    onDownloaded: (callback: (info: { version: string }) => void): void => {
      ipcRenderer.on(IPC_EVENTS.UPDATE_DOWNLOADED, (_event: Electron.IpcRendererEvent, info: { version: string }) => callback(info));
    },

    onError: (callback: (err: { message: string }) => void): void => {
      ipcRenderer.on(IPC_EVENTS.UPDATE_ERROR, (_event: Electron.IpcRendererEvent, err: { message: string }) => callback(err));
    },
  },

  ai: {
    sessions: (): Promise<unknown[]> =>
      invoke<unknown[]>(IPC_CHANNELS.AI_SESSIONS),

    session: (id: string): Promise<unknown> =>
      invoke<unknown>(IPC_CHANNELS.AI_SESSION, id),

    freeze: (id: string, reason?: string): Promise<null> =>
      invoke<null>(IPC_CHANNELS.AI_FREEZE, id, reason),

    unfreeze: (id: string): Promise<null> =>
      invoke<null>(IPC_CHANNELS.AI_UNFREEZE, id),

    allow: (id: string, scope: 'once' | 'session'): Promise<null> =>
      invoke<null>(IPC_CHANNELS.AI_ALLOW, id, scope),
  },

  app: {
    version: (): Promise<string> =>
      invoke<string>(IPC_CHANNELS.APP_VERSION),

    getVersion: (): Promise<string> =>
      invoke<string>(IPC_CHANNELS.APP_VERSION),

    quit: (): Promise<null> =>
      invoke<null>(IPC_CHANNELS.APP_QUIT),

    focusMain: (): Promise<null> =>
      invoke<null>(IPC_CHANNELS.APP_FOCUS_MAIN),

    toggleMainWindow: (): Promise<null> =>
      invoke<null>(IPC_CHANNELS.APP_TOGGLE_MAIN),

    toggleShieldOverlay: (): Promise<null> =>
      invoke<null>(IPC_CHANNELS.APP_TOGGLE_SHIELD),

    setShieldPosition: (position: string): Promise<null> =>
      invoke<null>(IPC_CHANNELS.SHIELD_SET_POSITION, position),

    setShieldOpacity: (opacity: number): Promise<null> =>
      invoke<null>(IPC_CHANNELS.SHIELD_SET_OPACITY, opacity),

    showAlerts: (): Promise<null> =>
      invoke<null>(IPC_CHANNELS.APP_SHOW_ALERTS),

    onNavigate: (callback: (route: string) => void): void => {
      ipcRenderer.on('navigate', (_event: Electron.IpcRendererEvent, route: string) => callback(route));
    },

    offNavigate: (callback: (...args: unknown[]) => void): void => {
      ipcRenderer.removeListener('navigate', callback);
    },

    openExternal: (url: string): Promise<null> =>
      invoke<null>(IPC_CHANNELS.APP_OPEN_EXTERNAL, url),
  },

  shell: {
    showInFolder: (filePath: string): Promise<null> =>
      invoke<null>(IPC_CHANNELS.SHELL_SHOW_IN_FOLDER, filePath),
  },

  investigate: {
    checkProcesses: (targetPath: string): Promise<{ processes: Array<{ name: string; pid: string; user: string }>; summary: string }> =>
      invoke<{ processes: Array<{ name: string; pid: string; user: string }>; summary: string }>(IPC_CHANNELS.INVESTIGATE_CHECK_PROCESSES, targetPath),
  },
});
