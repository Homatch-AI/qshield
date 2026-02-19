/// <reference types="vite/client" />

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
  reviewPdf(id: string): Promise<void>;
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

interface EmailNotificationConfig {
  enabled: boolean;
  recipientEmail: string;
  events: {
    assetChanges: boolean;
    scoreDrops: boolean;
    spfDkimFailures: boolean;
    dailySummary: boolean;
  };
  scoreThreshold: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  rateLimit: number;
  resendApiKey: string;
}

interface QShieldEmailNotifyAPI {
  getConfig(): Promise<EmailNotificationConfig>;
  setConfig(config: Partial<EmailNotificationConfig>): Promise<null>;
  sendTest(): Promise<{ sent: boolean; error?: string }>;
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
  offNavigate(callback: (...args: unknown[]) => void): void;
  openExternal(url: string): Promise<void>;
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

interface QShieldLicenseInfo {
  tier: 'trial' | 'personal' | 'pro' | 'business' | 'enterprise';
  email: string;
  issuedAt: string;
  expiresAt: string;
  machineId: string;
  isValid: boolean;
  isExpired: boolean;
  daysRemaining: number;
  features: QShieldFeatureFlags;
}

interface QShieldFeatureFlags {
  maxAdapters: number;
  maxHighTrustAssets: number;
  emailNotifications: boolean;
  dailySummary: boolean;
  trustReports: boolean;
  assetReports: boolean;
  trustProfile: boolean;
  keyRotation: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
  customBranding: boolean;
}

interface QShieldLicenseAPI {
  get(): Promise<QShieldLicenseInfo>;
  activate(key: string): Promise<QShieldLicenseInfo>;
  deactivate(): Promise<QShieldLicenseInfo>;
  generateTest(tier: string, days?: number): Promise<{ key: string }>;
  checkFeature(feature: string): Promise<{ allowed: boolean }>;
  getFlags(): Promise<QShieldFeatureFlags>;
}

interface QShieldSecureMessageAPI {
  create(opts: {
    subject: string;
    content: string;
    expiresIn: '1h' | '24h' | '7d' | '30d';
    maxViews: number;
    requireVerification: boolean;
    allowedRecipients: string[];
  }): Promise<{
    id: string;
    subject: string;
    createdAt: string;
    expiresAt: string;
    status: string;
    currentViews: number;
    maxViews: number;
    shareUrl: string;
  }>;
  list(): Promise<Array<{
    id: string;
    subject: string;
    createdAt: string;
    expiresAt: string;
    status: string;
    currentViews: number;
    maxViews: number;
    shareUrl: string;
  }>>;
  get(id: string): Promise<unknown>;
  destroy(id: string): Promise<boolean>;
  getAccessLog(id: string): Promise<Array<{
    timestamp: string;
    ip: string;
    userAgent: string;
    recipientEmail?: string;
    action: string;
  }>>;
  copyLink(id: string): Promise<null>;
}

interface QShieldApiInfoAPI {
  getInfo(): Promise<{ port: number; token: string; running: boolean }>;
  regenerateToken(): Promise<{ token: string }>;
}

interface QShieldGmailAPI {
  connect(): Promise<{ email: string }>;
  disconnect(): Promise<void>;
  getStatus(): Promise<{ connected: boolean; email: string | null }>;
}

interface QShieldFileWatcherAPI {
  configure(config: Record<string, unknown>): Promise<void>;
  getWatchedPaths(): Promise<string[]>;
}

interface QShieldHighTrustAsset {
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

interface QShieldAssetChangeEvent {
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

interface QShieldAssetsAPI {
  list(): Promise<QShieldHighTrustAsset[]>;
  add(path: string, type: 'file' | 'directory', sensitivity: 'normal' | 'strict' | 'critical', name?: string): Promise<QShieldHighTrustAsset>;
  remove(id: string): Promise<void>;
  get(id: string): Promise<QShieldHighTrustAsset | null>;
  verify(id: string): Promise<QShieldHighTrustAsset | null>;
  accept(id: string): Promise<QShieldHighTrustAsset | null>;
  updateSensitivity(id: string, sensitivity: 'normal' | 'strict' | 'critical'): Promise<QShieldHighTrustAsset | null>;
  enable(id: string, enabled: boolean): Promise<boolean>;
  stats(): Promise<{ total: number; verified: number; changed: number; unverified: number; bySensitivity: Record<string, number> }>;
  changeLog(id: string, limit?: number): Promise<QShieldAssetChangeEvent[]>;
  browse(type: 'file' | 'directory'): Promise<string | null>;
  onChanged(callback: (data: { event: QShieldAssetChangeEvent; asset: QShieldHighTrustAsset }) => void): void;
}

interface QShieldScoreHistoryEntry {
  timestamp: string;
  score: number;
  level: string;
}

interface QShieldMilestone {
  id: string;
  title: string;
  description: string;
  icon: string;
  earnedAt: string;
}

interface QShieldDailySummary {
  date: string;
  avgScore: number;
  minScore: number;
  maxScore: number;
  snapshotCount: number;
  totalEvents: number;
  totalAnomalies: number;
  grade: string;
  streak: number;
}

interface QShieldLifetimeStats {
  totalDays: number;
  avgScore: number;
  currentStreak: number;
  longestStreak: number;
  currentGrade: string;
  trend: 'improving' | 'stable' | 'declining';
  totalSnapshots: number;
  totalEvents: number;
  totalAnomalies: number;
  milestones: QShieldMilestone[];
  recentScores: QShieldScoreHistoryEntry[];
}

interface QShieldProfileAPI {
  get(): Promise<QShieldLifetimeStats>;
  history(days: number): Promise<QShieldScoreHistoryEntry[]>;
  milestones(): Promise<QShieldMilestone[]>;
  dailySummaries(from: string, to: string): Promise<QShieldDailySummary[]>;
}

interface QShieldReportOptions {
  type: 'snapshot' | 'period' | 'asset';
  fromDate?: string;
  toDate?: string;
  assetId?: string;
  notes?: string;
}

interface QShieldTrustReport {
  id: string;
  type: 'snapshot' | 'period' | 'asset';
  title: string;
  generatedAt: string;
  trustScore: number;
  trustGrade: string;
  trustLevel: string;
  fromDate: string;
  toDate: string;
  channelsMonitored: number;
  assetsMonitored: number;
  totalEvents: number;
  anomaliesDetected: number;
  anomaliesResolved: number;
  emailScore: number;
  fileScore: number;
  meetingScore: number;
  assetScore: number;
  evidenceCount: number;
  chainIntegrity: boolean;
  signatureChain: string;
  notes?: string;
  assetId?: string;
  assetName?: string;
  pdfPath?: string;
}

interface QShieldReportsAPI {
  generate(opts: QShieldReportOptions): Promise<QShieldTrustReport>;
  list(): Promise<QShieldTrustReport[]>;
  exportPdf(id: string): Promise<{ saved: boolean; path?: string }>;
  reviewPdf(id: string): Promise<void>;
  get(id: string): Promise<QShieldTrustReport | null>;
}

interface QShieldSecurityAPI {
  keyStatus(): Promise<{ initialized: boolean; safeStorageAvailable: boolean; backend: string }>;
}

interface QShieldFeaturesAPI {
  check(feature: string): Promise<{ allowed: boolean }>;
  flags(): Promise<QShieldFeatureFlags>;
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
  features: QShieldFeaturesAPI;
  secureMessage: QShieldSecureMessageAPI;
  api: QShieldApiInfoAPI;
  gmail: QShieldGmailAPI;
  fileWatcher: QShieldFileWatcherAPI;
  assets: QShieldAssetsAPI;
  profile: QShieldProfileAPI;
  emailNotify: QShieldEmailNotifyAPI;
  reports: QShieldReportsAPI;
  security: QShieldSecurityAPI;
  trustHistory: {
    getLifetimeStats(): Promise<QShieldLifetimeStats>;
    getDailySummary(date: string): Promise<QShieldDailySummary | null>;
    getDailySummaries(from: string, to: string): Promise<QShieldDailySummary[]>;
    getScoreHistory(days: number): Promise<QShieldScoreHistoryEntry[]>;
    getMilestones(): Promise<QShieldMilestone[]>;
    getTrend(days: number): Promise<'improving' | 'stable' | 'declining'>;
  };
  app: QShieldAppAPI;
}

declare global {
  interface Window {
    qshield: QShieldAPI;
  }
}

export {};
