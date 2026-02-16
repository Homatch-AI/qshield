/** Trust score from 0 (no trust) to 100 (full trust) */
export type TrustScore = number;

export type TrustLevel = 'critical' | 'warning' | 'elevated' | 'normal' | 'verified';

/**
 * Five independent trust verification dimensions, mirroring the patent's
 * multi-dimensional quantum state encoding. Each scored 0–100.
 */
export interface TrustDimensions {
  temporal: TrustScore;      // timing consistency
  contextual: TrustScore;    // pattern matching
  cryptographic: TrustScore; // seal/signature validity
  spatial: TrustScore;       // network routing verification
  behavioral: TrustScore;    // historical pattern matching
}

export type TrustDimensionKey = keyof TrustDimensions;

export const TRUST_DIMENSION_KEYS: TrustDimensionKey[] = [
  'temporal', 'contextual', 'cryptographic', 'spatial', 'behavioral',
];

export interface TrustState {
  score: TrustScore;
  level: TrustLevel;
  dimensions: TrustDimensions;
  signals: TrustSignal[];
  lastUpdated: string; // ISO 8601
  sessionId: string;
}

export interface TrustSignal {
  source: AdapterType;
  score: TrustScore;
  weight: number;
  timestamp: string;
  metadata: Record<string, unknown>;
  dimension?: TrustDimensionKey;
}

export type AdapterType = 'zoom' | 'teams' | 'email' | 'file' | 'api' | 'crypto';

export interface DualPathVerification {
  contentValid: boolean;
  structureValid: boolean;
  fullyVerified: boolean;
}

export interface EvidenceRecord {
  id: string; // UUID v4
  hash: string; // HMAC-SHA256 hex (Helix A — Content Chain)
  previousHash: string | null; // Content chain link
  structureHash: string; // HMAC-SHA256 hex (Helix B — Structure Chain)
  previousStructureHash: string | null; // Structure chain link
  vaultPosition: number; // Deterministic position = f(content, session, time, source)
  timestamp: string; // ISO 8601
  source: AdapterType;
  eventType: string;
  payload: Record<string, unknown>;
  verified: boolean;
  dualPathResult?: DualPathVerification;
  signature?: string; // Future: Ed25519
}

export interface AlertSourceMetadata {
  // Email
  sender?: string;
  recipient?: string;
  subject?: string;
  headers?: Record<string, string>;
  // File
  fileName?: string;
  filePath?: string;
  fileSize?: number;
  fileHash?: string;
  operation?: string;
  // Zoom/Teams
  meetingId?: string;
  meetingTitle?: string;
  participants?: string[];
  triggerReason?: string;
  // API
  endpoint?: string;
  method?: string;
  statusCode?: number;
  requestIp?: string;
  policyViolated?: string;
  // Crypto
  walletAddress?: string;
  chain?: string;
  transactionHash?: string;
  riskLevel?: string;
  // Common
  rawEvent?: Record<string, unknown>;
}

export interface Alert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  source: AdapterType;
  timestamp: string;
  dismissed: boolean;
  actionTaken?: string;
  sourceMetadata?: AlertSourceMetadata;
}

export interface PolicyConfig {
  rules: PolicyRule[];
  escalation: EscalationConfig;
  autoFreeze: AutoFreezeConfig;
}

export interface PolicyRule {
  id: string;
  name: string;
  condition: {
    signal: AdapterType;
    operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq';
    threshold: number;
  };
  action: 'alert' | 'escalate' | 'freeze';
  severity: Alert['severity'];
  enabled: boolean;
}

export interface EscalationConfig {
  channels: ('email' | 'webhook' | 'slack')[];
  webhookUrl?: string;
  emailRecipients?: string[];
  cooldownMinutes: number;
}

export interface AutoFreezeConfig {
  enabled: boolean;
  trustScoreThreshold: number;
  durationMinutes: number;
}

export interface TrustCertificate {
  id: string;
  sessionId: string;
  generatedAt: string;
  trustScore: TrustScore;
  trustLevel: TrustLevel;
  dimensions: TrustDimensions;
  evidenceCount: number;
  evidenceHashes: string[];
  signatureChain: string;
  structureChainSignature: string;
  dualPathVerified: boolean;
  activeModules: string[];
  pdfPath?: string;
}

export interface GatewayConfig {
  url: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface AdapterStatus {
  id: AdapterType;
  name: string;
  enabled: boolean;
  connected: boolean;
  lastEvent?: string; // ISO 8601
  eventCount: number;
  error?: string;
}

/** Pagination for list endpoints */
export interface ListOptions {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filter?: Record<string, unknown>;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Certificate generation options */
export interface CertOptions {
  sessionId: string;
  evidenceIds?: string[];
  includeAllEvidence?: boolean;
}

/** Adapter event emitted by monitoring adapters */
export interface AdapterEvent {
  adapterId: AdapterType;
  eventType: string;
  timestamp: string;
  data: Record<string, unknown>;
  trustImpact: number; // -100 to +100
}

/** Supported blockchain networks */
export type CryptoChain = 'bitcoin' | 'ethereum' | 'solana' | 'polygon' | 'arbitrum' | 'optimism';

/** A crypto wallet address with metadata */
export interface CryptoAddress {
  address: string;
  chain: CryptoChain;
  label?: string;
  trusted: boolean;
  addedAt: string; // ISO 8601
  lastSeen?: string;
}

/** A crypto transaction record */
export interface CryptoTransaction {
  hash: string;
  chain: CryptoChain;
  from: string;
  to: string;
  amount: string;
  timestamp: string;
  verified: boolean;
  riskLevel: 'safe' | 'caution' | 'danger';
  alerts: string[];
}

/** Result of a transaction verification check */
export interface TransactionCheck {
  valid: boolean;
  chain: CryptoChain;
  hash: string;
  warnings: string[];
  scamMatch: boolean;
  checksumValid: boolean;
}

/** Clipboard guard state */
export interface ClipboardGuardState {
  enabled: boolean;
  lastCheck: string; // ISO 8601
  detections: number;
  lastDetectedAddress?: string;
  lastDetectedChain?: CryptoChain;
}
