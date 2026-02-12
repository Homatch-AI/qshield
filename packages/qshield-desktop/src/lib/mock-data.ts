/**
 * Mock data generators for development and when IPC is unavailable.
 * All generators produce data conforming to @qshield/core types.
 */
import type {
  TrustState,
  TrustLevel,
  TrustSignal,
  AdapterType,
  EvidenceRecord,
  Alert,
  AdapterStatus,
  TrustCertificate,
  ListResult,
  ListOptions,
  PolicyRule,
} from '@qshield/core';

let _idCounter = 0;
function uid(): string {
  _idCounter += 1;
  const hex = (n: number) => n.toString(16).padStart(8, '0');
  const a = hex(Date.now());
  const b = hex(Math.floor(Math.random() * 0xffffffff));
  const c = hex(_idCounter);
  const d = hex(Math.floor(Math.random() * 0xffffffff));
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-${c.slice(0, 4)}-${d}${c.slice(4, 8)}`;
}

function fakeHash(): string {
  const chars = '0123456789abcdef';
  let h = '';
  for (let i = 0; i < 64; i++) {
    h += chars[Math.floor(Math.random() * 16)];
  }
  return h;
}

function randomItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString();
}

function hoursAgo(h: number): string {
  return minutesAgo(h * 60);
}

function daysAgo(d: number): string {
  return hoursAgo(d * 24);
}

const ADAPTERS: AdapterType[] = ['zoom', 'teams', 'email', 'file', 'api'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

const EVENT_TYPES: Record<AdapterType, string[]> = {
  zoom: ['meeting.started', 'meeting.ended', 'participant.joined', 'screen.shared', 'recording.started'],
  teams: ['call.started', 'call.ended', 'message.sent', 'file.shared', 'presence.changed'],
  email: ['email.sent', 'email.received', 'attachment.downloaded', 'link.clicked', 'email.forwarded'],
  file: ['file.created', 'file.modified', 'file.deleted', 'file.moved', 'file.accessed'],
  api: ['request.inbound', 'request.outbound', 'auth.success', 'auth.failure', 'rate.limited'],
};

const SIGNAL_DESCRIPTIONS: Record<AdapterType, string[]> = {
  zoom: [
    'Video meeting started with 4 participants',
    'Screen sharing initiated by host',
    'Meeting recording enabled',
    'External participant joined from unknown domain',
    'Meeting ended after 45 minutes',
  ],
  teams: [
    'Teams call connected successfully',
    'File shared in project channel',
    'Presence updated to available',
    'Voice call started with 2 participants',
    'Message sent in general channel',
  ],
  email: [
    'Email sent to external domain',
    'Attachment downloaded from known sender',
    'Suspicious link detected in email body',
    'Email forwarded to personal address',
    'Received email from trusted partner',
  ],
  file: [
    'Confidential document accessed',
    'File modified in protected directory',
    'New file created in workspace',
    'File moved to external storage',
    'Bulk file access detected',
  ],
  api: [
    'API authentication successful',
    'Rate limit threshold reached',
    'Outbound API request to external service',
    'Authentication token refreshed',
    'Unauthorized API access attempt blocked',
  ],
};

const ALERT_TITLES = [
  'Trust Score Below Threshold',
  'Unusual File Access Pattern',
  'External Domain Communication',
  'Screen Sharing to Unknown Participant',
  'Multiple Failed Authentication Attempts',
  'Data Exfiltration Risk Detected',
  'Policy Violation: File Copy to External Drive',
  'Anomalous API Request Volume',
  'Unverified Meeting Participant',
  'Confidential Document Accessed Outside Hours',
];

const ALERT_DESCRIPTIONS = [
  'Trust score dropped below the configured threshold of 40. Immediate review recommended.',
  'Detected unusual file access patterns that deviate from normal behavior baseline.',
  'Communication initiated with an unrecognized external domain. Review sender reputation.',
  'Screen was shared with a participant from an unverified domain during a video call.',
  'Multiple failed authentication attempts detected from the same session.',
  'Potential data exfiltration detected: large file transfer to external endpoint.',
  'A file was copied to an external storage device, violating data protection policy.',
  'API request volume exceeds normal baseline by 300%. Potential automated access.',
  'An unverified participant joined a meeting containing sensitive content.',
  'A classified document was accessed outside of authorized working hours.',
];

const SESSION_ID = uid();

/** Generate a single mock TrustSignal */
export function mockSignal(overrides?: Partial<TrustSignal>): TrustSignal {
  const source = randomItem(ADAPTERS);
  return {
    source,
    score: Math.floor(Math.random() * 100),
    weight: +(Math.random() * 2 - 0.5).toFixed(2),
    timestamp: minutesAgo(Math.floor(Math.random() * 120)),
    metadata: {
      description: randomItem(SIGNAL_DESCRIPTIONS[source]),
      eventType: randomItem(EVENT_TYPES[source]),
      duration: Math.floor(Math.random() * 3600),
    },
    ...overrides,
  };
}

/** Generate multiple mock signals sorted by timestamp desc */
export function mockSignals(count: number = 25): TrustSignal[] {
  return Array.from({ length: count }, (_, i) => mockSignal({
    timestamp: minutesAgo(i * 5 + Math.floor(Math.random() * 5)),
  })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/** Generate mock TrustState */
export function mockTrustState(): TrustState {
  const score = 65 + Math.floor(Math.random() * 30);
  const level: TrustLevel =
    score >= 90 ? 'verified' :
    score >= 70 ? 'normal' :
    score >= 50 ? 'elevated' :
    score >= 30 ? 'warning' : 'critical';

  return {
    score,
    level,
    signals: mockSignals(25),
    lastUpdated: minutesAgo(Math.floor(Math.random() * 3)),
    sessionId: SESSION_ID,
  };
}

/** Generate a single mock EvidenceRecord, optionally chained to a previous hash */
export function mockEvidence(prevHash: string | null = null, overrides?: Partial<EvidenceRecord>): EvidenceRecord {
  const source = randomItem(ADAPTERS);
  const eventType = randomItem(EVENT_TYPES[source]);
  return {
    id: uid(),
    hash: fakeHash(),
    previousHash: prevHash,
    timestamp: minutesAgo(Math.floor(Math.random() * 1440)),
    source,
    eventType,
    payload: {
      description: randomItem(SIGNAL_DESCRIPTIONS[source]),
      eventType,
      sessionId: SESSION_ID,
      confidence: +(Math.random() * 100).toFixed(1),
      ip: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
    },
    verified: Math.random() > 0.3,
    ...overrides,
  };
}

/** Generate a chain of mock evidence records with linked hashes */
export function mockEvidenceChain(count: number = 25): EvidenceRecord[] {
  const records: EvidenceRecord[] = [];
  let prevHash: string | null = null;
  for (let i = 0; i < count; i++) {
    const record = mockEvidence(prevHash, {
      timestamp: minutesAgo((count - i) * 10 + Math.floor(Math.random() * 10)),
    });
    prevHash = record.hash;
    records.push(record);
  }
  return records.reverse(); // newest first
}

/** Generate paginated evidence results */
export function mockEvidenceList(records: EvidenceRecord[], options: ListOptions): ListResult<EvidenceRecord> {
  const { page, pageSize, sortBy, sortOrder, filter } = options;
  let items = [...records];

  // Apply search filter
  if (filter?.search && typeof filter.search === 'string') {
    const q = (filter.search as string).toLowerCase();
    items = items.filter(
      (r) =>
        r.hash.toLowerCase().includes(q) ||
        r.source.toLowerCase().includes(q) ||
        r.eventType.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q),
    );
  }

  // Sort
  if (sortBy) {
    items.sort((a, b) => {
      const av = String((a as unknown as Record<string, unknown>)[sortBy] ?? '');
      const bv = String((b as unknown as Record<string, unknown>)[sortBy] ?? '');
      const cmp = av.localeCompare(bv);
      return sortOrder === 'desc' ? -cmp : cmp;
    });
  }

  const total = items.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: items.slice(start, end),
    total,
    page,
    pageSize,
    hasMore: end < total,
  };
}

/** Generate a single mock Alert */
export function mockAlert(overrides?: Partial<Alert>): Alert {
  const idx = Math.floor(Math.random() * ALERT_TITLES.length);
  const severity = randomItem(SEVERITIES);
  return {
    id: uid(),
    severity,
    title: ALERT_TITLES[idx],
    description: ALERT_DESCRIPTIONS[idx],
    source: randomItem(ADAPTERS),
    timestamp: minutesAgo(Math.floor(Math.random() * 480)),
    dismissed: false,
    ...overrides,
  };
}

/** Generate a list of mock alerts */
export function mockAlerts(count: number = 12): Alert[] {
  const alerts: Alert[] = [];
  for (let i = 0; i < count; i++) {
    alerts.push(
      mockAlert({
        timestamp: minutesAgo(i * 30 + Math.floor(Math.random() * 30)),
        dismissed: i >= 5, // first 5 active, rest dismissed
      }),
    );
  }
  return alerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/** Generate mock adapter statuses */
export function mockAdapterStatuses(): AdapterStatus[] {
  return [
    {
      id: 'zoom',
      name: 'Zoom Monitor',
      enabled: true,
      connected: true,
      lastEvent: minutesAgo(2),
      eventCount: 1247,
    },
    {
      id: 'teams',
      name: 'Microsoft Teams',
      enabled: true,
      connected: true,
      lastEvent: minutesAgo(5),
      eventCount: 893,
    },
    {
      id: 'email',
      name: 'Email Monitor',
      enabled: true,
      connected: true,
      lastEvent: minutesAgo(8),
      eventCount: 2156,
    },
    {
      id: 'file',
      name: 'File Monitor',
      enabled: true,
      connected: false,
      lastEvent: hoursAgo(2),
      eventCount: 534,
      error: 'File watcher disconnected — retrying in 30s',
    },
    {
      id: 'api',
      name: 'API Gateway',
      enabled: false,
      connected: false,
      eventCount: 0,
    },
  ] as AdapterStatus[];
}

/** Generate mock TrustCertificates */
export function mockCertificates(count: number = 5): TrustCertificate[] {
  return Array.from({ length: count }, (_, i) => ({
    id: uid(),
    sessionId: i === 0 ? SESSION_ID : uid(),
    generatedAt: daysAgo(i),
    trustScore: 70 + Math.floor(Math.random() * 25),
    trustLevel: randomItem(['verified', 'normal', 'elevated'] as TrustLevel[]),
    evidenceCount: 10 + Math.floor(Math.random() * 40),
    evidenceHashes: Array.from({ length: 3 }, () => fakeHash()),
    signatureChain: fakeHash(),
  }));
}

/** Generate mock default config */
export function mockConfig(): Record<string, unknown> {
  return {
    gatewayUrl: 'http://localhost:3001',
    gatewayTimeout: 5000,
    gatewayRetryAttempts: 3,
    gatewayRetryDelay: 1000,
    notificationsEnabled: true,
    notificationSeverityThreshold: 'medium',
    shieldOverlay: true,
    shieldOpacity: 0.85,
    shieldPosition: 'bottom-right',
    storagePath: '~/.qshield/data',
    storageQuotaMB: 500,
    storageUsedMB: 127,
  };
}

/** Generate mock PolicyRules */
export function mockPolicyRules(): PolicyRule[] {
  return [
    {
      id: uid(),
      name: 'Low trust score alert',
      condition: { signal: 'api', operator: 'lt', threshold: 40 },
      action: 'alert',
      severity: 'critical',
      enabled: true,
    },
    {
      id: uid(),
      name: 'External file transfer warning',
      condition: { signal: 'file', operator: 'gt', threshold: 3 },
      action: 'escalate',
      severity: 'high',
      enabled: true,
    },
    {
      id: uid(),
      name: 'Elevated email risk',
      condition: { signal: 'email', operator: 'gte', threshold: 60 },
      action: 'alert',
      severity: 'medium',
      enabled: true,
    },
    {
      id: uid(),
      name: 'Auto-freeze on critical',
      condition: { signal: 'api', operator: 'lt', threshold: 20 },
      action: 'freeze',
      severity: 'critical',
      enabled: false,
    },
  ];
}

/** Check if IPC bridge is available */
export function isIPCAvailable(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as Record<string, unknown>).qshield === 'object' && (window as unknown as Record<string, unknown>).qshield !== null;
}
