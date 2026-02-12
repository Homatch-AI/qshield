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
  },

  gateway: {
    status: (): Promise<GatewayStatus> =>
      invoke<GatewayStatus>(IPC_CHANNELS.GATEWAY_STATUS),

    connect: (url: string): Promise<GatewayStatus> =>
      invoke<GatewayStatus>(IPC_CHANNELS.GATEWAY_CONNECT, url),

    disconnect: (): Promise<GatewayStatus> =>
      invoke<GatewayStatus>(IPC_CHANNELS.GATEWAY_DISCONNECT),
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

    set: (key: string, value: unknown): Promise<null> =>
      invoke<null>(IPC_CHANNELS.CONFIG_SET, key, value),
  },

  adapters: {
    status: (): Promise<AdapterStatus[]> =>
      invoke<AdapterStatus[]>(IPC_CHANNELS.ADAPTER_STATUS),

    enable: (id: string): Promise<{ id: string; enabled: boolean }> =>
      invoke<{ id: string; enabled: boolean }>(IPC_CHANNELS.ADAPTER_ENABLE, id),

    disable: (id: string): Promise<{ id: string; enabled: boolean }> =>
      invoke<{ id: string; enabled: boolean }>(IPC_CHANNELS.ADAPTER_DISABLE, id),
  },

  app: {
    version: (): Promise<string> =>
      invoke<string>(IPC_CHANNELS.APP_VERSION),

    quit: (): Promise<null> =>
      invoke<null>(IPC_CHANNELS.APP_QUIT),

    focusMain: (): Promise<null> =>
      invoke<null>(IPC_CHANNELS.APP_FOCUS_MAIN),
  },
});
