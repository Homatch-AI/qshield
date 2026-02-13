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
  subscribe(callback: (state: TrustState) => void): void;
  unsubscribe(): void;
}

interface QShieldEvidenceAPI {
  list(options: ListOptions): Promise<ListResult<EvidenceRecord>>;
  getOne(id: string): Promise<EvidenceRecord>;
  verify(id: string): Promise<{ valid: boolean; errors: string[] }>;
  search(query: string): Promise<ListResult<EvidenceRecord>>;
  export(ids: string[]): Promise<{ path: string }>;
}

interface QShieldCertificatesAPI {
  list(): Promise<TrustCertificate[]>;
  generate(options: CertOptions): Promise<TrustCertificate>;
  exportPdf(id: string): Promise<{ saved: boolean; path?: string }>;
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

interface SignatureConfig {
  style: 'inline' | 'banner' | 'minimal';
  primaryText: string;
  secondaryText: string;
  accentColor: string;
  showScore: boolean;
  showLink: boolean;
  showIcon: boolean;
  showTimestamp: boolean;
  senderName: string;
  showTagline: boolean;
  showDownloadCta: boolean;
}

interface SignatureResult {
  html: string;
  trustScore: number;
  trustLevel: string;
  verificationHash: string;
  verificationId: string;
  verifyUrl: string;
  generatedAt: string;
}

interface VerificationStats {
  totalGenerated: number;
  totalClicks: number;
  clickThroughRate: number;
  recentVerifications: Array<{
    verificationId: string;
    senderName: string;
    trustScore: number;
    timestamp: string;
    clicked: boolean;
    clickCount: number;
  }>;
}

interface QShieldSignatureAPI {
  generate(config: Partial<SignatureConfig>): Promise<SignatureResult>;
  copy(config?: Partial<SignatureConfig>): Promise<{ copied: boolean; trustScore: number }>;
  getConfig(): Promise<SignatureConfig>;
  setConfig(config: SignatureConfig): Promise<void>;
}

interface QShieldAppAPI {
  getVersion(): Promise<string>;
  quit(): Promise<void>;
  minimize(): Promise<void>;
  toggleShieldOverlay(): Promise<void>;
  focusMain(): Promise<void>;
  toggleMainWindow(): Promise<void>;
  setShieldPosition(position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'): Promise<void>;
  setShieldOpacity(opacity: number): Promise<void>;
  showAlerts(): Promise<void>;
  onNavigate(callback: (route: string) => void): void;
}

interface QShieldVerificationAPI {
  getStats(): Promise<VerificationStats>;
}

interface QShieldCryptoAPI {
  getStatus(): Promise<{
    clipboardGuard: { enabled: boolean; lastCheck: string; detections: number; lastDetectedAddress?: string; lastDetectedChain?: string };
    trustedAddresses: number;
    recentTransactions: number;
    activeAlerts: number;
  }>;
  verifyAddress(address: string, chain: string): Promise<{
    valid: boolean;
    chain: string;
    address: string;
    checksumValid: boolean;
    isScam: boolean;
    warnings: string[];
  }>;
  verifyTransaction(hash: string, chain: string): Promise<{
    valid: boolean;
    chain: string;
    hash: string;
    warnings: string[];
    scamMatch: boolean;
    checksumValid: boolean;
  }>;
  getAddressBook(): Promise<Array<{
    address: string;
    chain: string;
    label?: string;
    trusted: boolean;
    addedAt: string;
    lastSeen?: string;
  }>>;
  addTrustedAddress(address: string, chain: string, label?: string): Promise<{
    address: string;
    chain: string;
    label?: string;
    trusted: boolean;
    addedAt: string;
  }>;
  removeTrustedAddress(address: string): Promise<boolean>;
  getAlerts(): Promise<Array<{
    id: string;
    type: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    message: string;
    address?: string;
    chain?: string;
    timestamp: string;
    dismissed: boolean;
  }>>;
  getClipboardStatus(): Promise<{
    enabled: boolean;
    lastCheck: string;
    detections: number;
    lastDetectedAddress?: string;
    lastDetectedChain?: string;
  }>;
}

interface QShieldLicenseAPI {
  get(): Promise<unknown>;
  set(license: unknown): Promise<unknown>;
  clear(): Promise<void>;
  checkFeature(feature: string): Promise<unknown>;
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
  signature: QShieldSignatureAPI;
  verification: QShieldVerificationAPI;
  crypto: QShieldCryptoAPI;
  license: QShieldLicenseAPI;
  app: QShieldAppAPI;
}

declare global {
  interface Window {
    qshield: QShieldAPI;
  }
}

export {};
