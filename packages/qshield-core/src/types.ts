/** Trust score from 0 (no trust) to 100 (full trust) */
export type TrustScore = number;

export type TrustLevel = 'critical' | 'warning' | 'elevated' | 'normal' | 'verified';

export interface TrustState {
  score: TrustScore;
  level: TrustLevel;
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
}

export type AdapterType = 'zoom' | 'teams' | 'email' | 'file' | 'api';

export interface EvidenceRecord {
  id: string; // UUID v4
  hash: string; // HMAC-SHA256 hex
  previousHash: string | null; // Hash chain
  timestamp: string; // ISO 8601
  source: AdapterType;
  eventType: string;
  payload: Record<string, unknown>;
  verified: boolean;
  signature?: string; // Future: Ed25519
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
  evidenceCount: number;
  evidenceHashes: string[];
  signatureChain: string;
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
