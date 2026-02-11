import type { TrustState, EvidenceRecord, Alert } from '@qshield/core';

export const mockTrustState: TrustState = {
  score: 85,
  level: 'normal',
  signals: [
    {
      source: 'zoom',
      score: 90,
      weight: 0.25,
      timestamp: '2024-01-15T10:30:00Z',
      metadata: { meetingId: 'meeting-123' },
    },
    {
      source: 'teams',
      score: 80,
      weight: 0.25,
      timestamp: '2024-01-15T10:25:00Z',
      metadata: {},
    },
    {
      source: 'email',
      score: 85,
      weight: 0.2,
      timestamp: '2024-01-15T10:20:00Z',
      metadata: {},
    },
  ],
  lastUpdated: '2024-01-15T10:30:00Z',
  sessionId: 'test-session-001',
};

export const mockEvidenceRecords: EvidenceRecord[] = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    hash: 'a'.repeat(64),
    previousHash: null,
    timestamp: '2024-01-15T10:00:00Z',
    source: 'zoom',
    eventType: 'meeting-started',
    payload: { meetingId: 'meeting-123', participants: 5 },
    verified: true,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    hash: 'b'.repeat(64),
    previousHash: 'a'.repeat(64),
    timestamp: '2024-01-15T10:05:00Z',
    source: 'zoom',
    eventType: 'encryption-verified',
    payload: { meetingId: 'meeting-123', encryption: 'AES-256-GCM' },
    verified: true,
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440003',
    hash: 'c'.repeat(64),
    previousHash: 'b'.repeat(64),
    timestamp: '2024-01-15T10:10:00Z',
    source: 'email',
    eventType: 'email-received',
    payload: { from: 'colleague@company.com', subject: 'Meeting notes' },
    verified: false,
  },
];

export const mockAlerts: Alert[] = [
  {
    id: '660e8400-e29b-41d4-a716-446655440001',
    severity: 'high',
    title: 'Unusual zoom activity detected',
    description: 'Trust score for Zoom dropped below threshold',
    source: 'zoom',
    timestamp: '2024-01-15T10:15:00Z',
    dismissed: false,
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440002',
    severity: 'medium',
    title: 'Email encryption not detected',
    description: 'Outgoing email was sent without encryption',
    source: 'email',
    timestamp: '2024-01-15T09:45:00Z',
    dismissed: false,
  },
];
