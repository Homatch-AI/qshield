/**
 * Preload script — runs in a sandboxed renderer context.
 * Exposes a typed `window.qshield` API via contextBridge.
 *
 * Security invariants:
 * - All IPC uses invoke (request/response), never send/sendSync
 * - No Node.js APIs leak to the renderer
 * - contextBridge serializes all data (no prototype pollution)
 */
import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, IPC_EVENTS } from './ipc/channels';

// ── Types for the exposed API ────────────────────────────────────────────────

/** IPC structured response envelope */
interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

/** Trust state as returned by the trust monitor */
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

/** Pagination/list options */
interface ListOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: Record<string, unknown>;
}

/** Paginated list result */
interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Evidence record */
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

/** Certificate generation options */
interface CertOptions {
  sessionId: string;
  evidenceIds?: string[];
  includeAllEvidence?: boolean;
}

/** Trust certificate */
interface TrustCertificate {
  id: string;
  sessionId: string;
  generatedAt: string;
  trustScore?: number;
  trustLevel?: string;
  evidenceCount?: number;
}

/** Alert object */
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

/** Policy configuration */
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

/** Adapter status */
interface AdapterStatus {
  id: string;
  name: string;
  enabled: boolean;
  connected: boolean;
  lastEvent?: string;
  eventCount: number;
  error?: string;
}

/** Gateway connection status */
interface GatewayStatus {
  connected: boolean;
  url: string;
}

/** Callback function for event subscriptions */
type EventCallback<T> = (data: T) => void;

// ── Subscription management ──────────────────────────────────────────────────

const unsubscribers = new Map<string, () => void>();

// ── Exposed API ──────────────────────────────────────────────────────────────

/**
 * The `window.qshield` API exposed to the renderer process.
 * All methods return structured IpcResponse objects.
 * All communication uses ipcRenderer.invoke (never send/sendSync).
 */
contextBridge.exposeInMainWorld('qshield', {
  /**
   * Trust monitoring — real-time trust score and signals.
   */
  trust: {
    /** Get current trust state (score, level, signals) */
    getState: (): Promise<IpcResponse<TrustState>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TRUST_GET_STATE),

    /** Subscribe to trust state change events */
    subscribe: (callback: EventCallback<TrustState>): void => {
      const handler = (_event: Electron.IpcRendererEvent, data: TrustState) => callback(data);
      ipcRenderer.on(IPC_EVENTS.TRUST_STATE_UPDATED, handler);
      ipcRenderer.invoke(IPC_CHANNELS.TRUST_SUBSCRIBE);
      unsubscribers.set('trust', () => {
        ipcRenderer.removeListener(IPC_EVENTS.TRUST_STATE_UPDATED, handler);
      });
    },

    /** Unsubscribe from trust state change events */
    unsubscribe: (): void => {
      const unsub = unsubscribers.get('trust');
      if (unsub) {
        unsub();
        unsubscribers.delete('trust');
      }
      ipcRenderer.invoke(IPC_CHANNELS.TRUST_UNSUBSCRIBE);
    },
  },

  /**
   * Evidence vault — tamper-proof evidence records with hash chain.
   */
  evidence: {
    /** List evidence records with pagination */
    list: (opts?: ListOptions): Promise<IpcResponse<ListResult<EvidenceRecord>>> =>
      ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_LIST, opts),

    /** Get a single evidence record by UUID */
    get: (id: string): Promise<IpcResponse<EvidenceRecord>> =>
      ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_GET, id),

    /** Verify the hash chain integrity of an evidence record */
    verify: (id: string): Promise<IpcResponse<{ valid: boolean; errors: string[] }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_VERIFY, id),

    /** Full-text search across evidence records */
    search: (query: string): Promise<IpcResponse<ListResult<EvidenceRecord>>> =>
      ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_SEARCH, query),

    /** Export selected evidence records (rate-limited: 1/min) */
    export: (ids: string[]): Promise<IpcResponse<{ ok: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.EVIDENCE_EXPORT, ids),
  },

  /**
   * Trust certificates — generate and list tamper-proof session certificates.
   */
  certificates: {
    /** Generate a trust certificate for a session (rate-limited: 1/min) */
    generate: (opts: CertOptions): Promise<IpcResponse<TrustCertificate>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CERT_GENERATE, opts),

    /** List all generated certificates */
    list: (): Promise<IpcResponse<TrustCertificate[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CERT_LIST),
  },

  /**
   * Gateway — connection to the QShield server.
   */
  gateway: {
    /** Get current gateway connection status */
    status: (): Promise<IpcResponse<GatewayStatus>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_STATUS),

    /** Connect to a QShield Gateway */
    connect: (url: string): Promise<IpcResponse<GatewayStatus>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_CONNECT, url),

    /** Disconnect from the current gateway */
    disconnect: (): Promise<IpcResponse<GatewayStatus>> =>
      ipcRenderer.invoke(IPC_CHANNELS.GATEWAY_DISCONNECT),
  },

  /**
   * Alerts — real-time security alerts from adapters.
   */
  alerts: {
    /** List all active alerts */
    list: (): Promise<IpcResponse<Alert[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ALERT_LIST),

    /** Dismiss an alert by UUID */
    dismiss: (id: string): Promise<IpcResponse<{ id: string; dismissed: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ALERT_DISMISS, id),

    /** Subscribe to real-time alert events */
    subscribe: (callback: EventCallback<Alert>): void => {
      const handler = (_event: Electron.IpcRendererEvent, data: Alert) => callback(data);
      ipcRenderer.on(IPC_EVENTS.ALERT_RECEIVED, handler);
      ipcRenderer.invoke(IPC_CHANNELS.ALERT_SUBSCRIBE);
      unsubscribers.set('alerts', () => {
        ipcRenderer.removeListener(IPC_EVENTS.ALERT_RECEIVED, handler);
      });
    },
  },

  /**
   * Policy — trust scoring rules and escalation configuration.
   */
  policy: {
    /** Get the current policy configuration */
    get: (): Promise<IpcResponse<PolicyConfig>> =>
      ipcRenderer.invoke(IPC_CHANNELS.POLICY_GET),

    /** Update the policy configuration */
    update: (policy: PolicyConfig): Promise<IpcResponse<PolicyConfig>> =>
      ipcRenderer.invoke(IPC_CHANNELS.POLICY_UPDATE, policy),
  },

  /**
   * Config — application settings (persisted to disk).
   */
  config: {
    /** Read a config value by dot-notation key */
    get: (key: string): Promise<IpcResponse<unknown>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_GET, key),

    /** Write a config value by dot-notation key (rate-limited: 10/min) */
    set: (key: string, value: unknown): Promise<IpcResponse<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SET, key, value),
  },

  /**
   * Adapters — monitoring adapter lifecycle.
   */
  adapters: {
    /** Get status of all monitoring adapters */
    status: (): Promise<IpcResponse<AdapterStatus[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ADAPTER_STATUS),

    /** Enable a monitoring adapter */
    enable: (id: string): Promise<IpcResponse<{ id: string; enabled: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ADAPTER_ENABLE, id),

    /** Disable a monitoring adapter */
    disable: (id: string): Promise<IpcResponse<{ id: string; enabled: boolean }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ADAPTER_DISABLE, id),
  },

  /**
   * App — application-level actions.
   */
  app: {
    /** Get the application version string */
    version: (): Promise<IpcResponse<string>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION),

    /** Request graceful application shutdown */
    quit: (): Promise<IpcResponse<null>> =>
      ipcRenderer.invoke(IPC_CHANNELS.APP_QUIT),
  },
});
