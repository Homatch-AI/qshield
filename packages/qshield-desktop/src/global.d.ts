import type {
  TrustState,
  EvidenceRecord,
  Alert,
  TrustCertificate,
  AdapterStatus,
  ListOptions,
  ListResult,
  CertOptions,
  GatewayConfig,
} from '@qshield/core';

interface QShieldTrustAPI {
  getState(): Promise<TrustState>;
  subscribe(callback: (state: TrustState) => void): () => void;
}

interface QShieldEvidenceAPI {
  list(options: ListOptions): Promise<ListResult<EvidenceRecord>>;
  getOne(id: string): Promise<EvidenceRecord>;
  verify(id: string): Promise<{ valid: boolean; message: string }>;
  search(query: string): Promise<EvidenceRecord[]>;
  export(ids: string[]): Promise<{ path: string }>;
}

interface QShieldCertificatesAPI {
  list(): Promise<TrustCertificate[]>;
  generate(options: CertOptions): Promise<TrustCertificate>;
  exportPdf(id: string): Promise<{ path: string }>;
}

interface QShieldGatewayAPI {
  getStatus(): Promise<{ connected: boolean; latency: number }>;
  reconnect(): Promise<void>;
}

interface QShieldAlertsAPI {
  list(): Promise<Alert[]>;
  dismiss(id: string): Promise<void>;
  subscribe(callback: (alert: Alert) => void): () => void;
}

interface QShieldPolicyAPI {
  getConfig(): Promise<import('@qshield/core').PolicyConfig>;
  updateConfig(config: Partial<import('@qshield/core').PolicyConfig>): Promise<void>;
}

interface QShieldConfigAPI {
  get<T = unknown>(key: string): Promise<T>;
  set(key: string, value: unknown): Promise<void>;
  getAll(): Promise<Record<string, unknown>>;
}

interface QShieldAdaptersAPI {
  list(): Promise<AdapterStatus[]>;
  enable(id: string): Promise<void>;
  disable(id: string): Promise<void>;
}

interface QShieldAppAPI {
  getVersion(): Promise<string>;
  quit(): Promise<void>;
  minimize(): Promise<void>;
  toggleShieldOverlay(): Promise<void>;
}

interface QShieldAPI {
  trust: QShieldTrustAPI;
  evidence: QShieldEvidenceAPI;
  certificates: QShieldCertificatesAPI;
  gateway: QShieldGatewayAPI;
  alerts: QShieldAlertsAPI;
  policy: QShieldPolicyAPI;
  config: QShieldConfigAPI;
  adapters: QShieldAdaptersAPI;
  app: QShieldAppAPI;
}

declare global {
  interface Window {
    qshield: QShieldAPI;
  }
}

export {};
