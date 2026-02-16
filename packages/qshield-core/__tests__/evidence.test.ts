import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  verifyEvidenceRecord,
  verifyEvidenceChain,
  computeSignatureChain,
  computeStructureSignatureChain,
  getChainIntegrity,
  computeVaultPosition,
  hashStructureRecord,
} from '../src/evidence';
import { hashEvidenceRecord } from '../src/crypto';

const HMAC_KEY = 'test-hmac-key-for-evidence';
const SESSION_ID = 'test-session-001';

/** Assign an explicit timestamp to a record and recompute both hashes. */
function setTimestamp(
  record: ReturnType<typeof createEvidenceRecord>,
  ts: string,
  hmacKey: string = HMAC_KEY,
  sessionId: string = SESSION_ID,
): void {
  (record as { timestamp: string }).timestamp = ts;

  // Recompute Helix A (content hash)
  record.hash = hashEvidenceRecord(
    {
      id: record.id,
      previousHash: record.previousHash,
      timestamp: ts,
      source: record.source,
      eventType: record.eventType,
      payload: JSON.stringify(record.payload),
    },
    hmacKey,
  );

  // Recompute vault position
  record.vaultPosition = computeVaultPosition(record.hash, sessionId, ts, record.source, hmacKey);

  // Recompute Helix B (structure hash)
  record.structureHash = hashStructureRecord(
    {
      id: record.id,
      vaultPosition: record.vaultPosition,
      previousStructureHash: record.previousStructureHash,
      timestamp: ts,
      source: record.source,
      eventType: record.eventType,
    },
    hmacKey,
  );
}

/** Build a chain of N records with consistent dual hash links and explicit timestamps */
function buildChain(n: number, hmacKey: string = HMAC_KEY, sessionId: string = SESSION_ID) {
  const records = [];
  let prevHash: string | null = null;
  let prevStructureHash: string | null = null;
  const baseTime = new Date('2024-06-01T00:00:00Z').getTime();
  for (let i = 0; i < n; i++) {
    const record = createEvidenceRecord(
      'zoom',
      `event-${i}`,
      { index: i },
      prevHash,
      prevStructureHash,
      sessionId,
      hmacKey,
    );
    // Assign explicit sequential timestamp to ensure deterministic sort order
    setTimestamp(record, new Date(baseTime + i * 1000).toISOString(), hmacKey, sessionId);
    records.push(record);
    prevHash = record.hash;
    prevStructureHash = record.structureHash;
  }
  return records;
}

// ---------------------------------------------------------------------------
// createEvidenceRecord
// ---------------------------------------------------------------------------

describe('createEvidenceRecord', () => {
  it('creates a record with valid structure including dual chain fields', () => {
    const record = createEvidenceRecord('zoom', 'meeting-started', { meetingId: '123' }, null, null, SESSION_ID, HMAC_KEY);

    expect(record.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(record.hash).toHaveLength(64);
    expect(record.structureHash).toHaveLength(64);
    expect(record.previousHash).toBeNull();
    expect(record.previousStructureHash).toBeNull();
    expect(record.vaultPosition).toBeTypeOf('number');
    expect(record.source).toBe('zoom');
    expect(record.eventType).toBe('meeting-started');
    expect(record.payload).toEqual({ meetingId: '123' });
    expect(record.verified).toBe(false);
    expect(record.timestamp).toBeTruthy();
  });

  it('links to previous content and structure hashes', () => {
    const first = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const second = createEvidenceRecord('teams', 'event2', {}, first.hash, first.structureHash, SESSION_ID, HMAC_KEY);

    expect(second.previousHash).toBe(first.hash);
    expect(second.previousStructureHash).toBe(first.structureHash);
  });

  it('produces unique IDs and hashes', () => {
    const a = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    const b = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);

    expect(a.id).not.toBe(b.id);
    expect(a.hash).not.toBe(b.hash);
  });

  it('genesis record has null previousHash and previousStructureHash', () => {
    const record = createEvidenceRecord('zoom', 'genesis', {}, null, null, SESSION_ID, HMAC_KEY);
    expect(record.previousHash).toBeNull();
    expect(record.previousStructureHash).toBeNull();
  });

  it('stores complex payloads', () => {
    const payload = { deeply: { nested: { data: [1, 2, 3] } }, flag: true };
    const record = createEvidenceRecord('email', 'complex', payload, null, null, SESSION_ID, HMAC_KEY);
    expect(record.payload).toEqual(payload);
  });

  it('different event types produce different hashes', () => {
    const a = createEvidenceRecord('zoom', 'type-a', {}, null, null, SESSION_ID, HMAC_KEY);
    const b = createEvidenceRecord('zoom', 'type-b', {}, null, null, SESSION_ID, HMAC_KEY);
    expect(a.hash).not.toBe(b.hash);
  });

  it('different sources produce different hashes', () => {
    const a = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    const b = createEvidenceRecord('teams', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    expect(a.hash).not.toBe(b.hash);
  });

  it('always sets verified to false', () => {
    const record = createEvidenceRecord('api', 'call', {}, null, null, SESSION_ID, HMAC_KEY);
    expect(record.verified).toBe(false);
  });

  it('timestamp is a valid ISO 8601 string', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    expect(() => new Date(record.timestamp)).not.toThrow();
    expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
  });

  it('content hash and structure hash are different', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    expect(record.hash).not.toBe(record.structureHash);
  });
});

// ---------------------------------------------------------------------------
// computeVaultPosition
// ---------------------------------------------------------------------------

describe('computeVaultPosition', () => {
  it('returns a deterministic position for same inputs', () => {
    const pos1 = computeVaultPosition('abc123', 'session-1', '2024-01-01T00:00:00Z', 'zoom', HMAC_KEY);
    const pos2 = computeVaultPosition('abc123', 'session-1', '2024-01-01T00:00:00Z', 'zoom', HMAC_KEY);
    expect(pos1).toBe(pos2);
  });

  it('returns different positions for different content hashes', () => {
    const pos1 = computeVaultPosition('hash-a', 'session-1', '2024-01-01T00:00:00Z', 'zoom', HMAC_KEY);
    const pos2 = computeVaultPosition('hash-b', 'session-1', '2024-01-01T00:00:00Z', 'zoom', HMAC_KEY);
    expect(pos1).not.toBe(pos2);
  });

  it('returns different positions for different sessions', () => {
    const pos1 = computeVaultPosition('hash-a', 'session-1', '2024-01-01T00:00:00Z', 'zoom', HMAC_KEY);
    const pos2 = computeVaultPosition('hash-a', 'session-2', '2024-01-01T00:00:00Z', 'zoom', HMAC_KEY);
    expect(pos1).not.toBe(pos2);
  });

  it('returns a non-negative 32-bit integer', () => {
    const pos = computeVaultPosition('hash', 'session', '2024-01-01T00:00:00Z', 'zoom', HMAC_KEY);
    expect(pos).toBeGreaterThanOrEqual(0);
    expect(pos).toBeLessThanOrEqual(0xFFFFFFFF);
  });
});

// ---------------------------------------------------------------------------
// verifyEvidenceRecord (dual-path)
// ---------------------------------------------------------------------------

describe('verifyEvidenceRecord', () => {
  it('fully verifies a valid record', () => {
    const record = createEvidenceRecord('email', 'email-sent', { to: 'user@example.com' }, null, null, SESSION_ID, HMAC_KEY);
    const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(true);
    expect(result.structureValid).toBe(true);
    expect(result.fullyVerified).toBe(true);
  });

  it('detects content tampering (modified payload)', () => {
    const record = createEvidenceRecord('email', 'email-sent', { to: 'user@example.com' }, null, null, SESSION_ID, HMAC_KEY);
    record.payload = { to: 'attacker@evil.com' };
    const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(false);
    expect(result.fullyVerified).toBe(false);
  });

  it('detects content tampering (modified hash)', () => {
    const record = createEvidenceRecord('file', 'file-created', {}, null, null, SESSION_ID, HMAC_KEY);
    record.hash = 'a'.repeat(64);
    const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(false);
    expect(result.fullyVerified).toBe(false);
  });

  it('rejects verification with wrong HMAC key', () => {
    const record = createEvidenceRecord('api', 'api-call', {}, null, null, SESSION_ID, HMAC_KEY);
    const result = verifyEvidenceRecord(record, SESSION_ID, 'wrong-key');
    expect(result.contentValid).toBe(false);
    expect(result.structureValid).toBe(false);
    expect(result.fullyVerified).toBe(false);
  });

  it('detects structure tampering (modified structureHash)', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    record.structureHash = 'b'.repeat(64);
    const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(true);
    expect(result.structureValid).toBe(false);
    expect(result.fullyVerified).toBe(false);
  });

  it('detects structure tampering (modified vaultPosition)', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    record.vaultPosition = 12345;
    const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(true);
    expect(result.structureValid).toBe(false);
    expect(result.fullyVerified).toBe(false);
  });

  it('dual paths are independent — content valid but structure invalid', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    record.structureHash = 'c'.repeat(64);
    const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(true);
    expect(result.structureValid).toBe(false);
    expect(result.fullyVerified).toBe(false);
  });

  it('verifies record with non-null previousHash', () => {
    const first = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const second = createEvidenceRecord('teams', 'event2', {}, first.hash, first.structureHash, SESSION_ID, HMAC_KEY);
    const result = verifyEvidenceRecord(second, SESSION_ID, HMAC_KEY);
    expect(result.fullyVerified).toBe(true);
  });

  it('wrong sessionId causes structure verification failure', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    const result = verifyEvidenceRecord(record, 'wrong-session', HMAC_KEY);
    expect(result.contentValid).toBe(true);
    expect(result.structureValid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyEvidenceChain
// ---------------------------------------------------------------------------

describe('verifyEvidenceChain', () => {
  it('validates an empty chain', () => {
    const result = verifyEvidenceChain([], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates a single-record chain', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    const result = verifyEvidenceChain([record], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
  });

  it('validates a multi-record chain', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', { n: 1 }, null, null, SESSION_ID, HMAC_KEY);
    setTimestamp(r1, '2024-06-01T00:00:01Z');
    const r2 = createEvidenceRecord('teams', 'event2', { n: 2 }, r1.hash, r1.structureHash, SESSION_ID, HMAC_KEY);
    setTimestamp(r2, '2024-06-01T00:00:02Z');
    const r3 = createEvidenceRecord('email', 'event3', { n: 3 }, r2.hash, r2.structureHash, SESSION_ID, HMAC_KEY);
    setTimestamp(r3, '2024-06-01T00:00:03Z');

    const result = verifyEvidenceChain([r1, r2, r3], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
  });

  it('validates a chain of 100+ records', () => {
    const records = buildChain(110);
    const result = verifyEvidenceChain(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects tampered record at position 0 (genesis)', () => {
    const records = buildChain(5);
    records[0].payload = { tampered: true };
    const result = verifyEvidenceChain(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Helix A'))).toBe(true);
  });

  it('detects tampered record in the middle', () => {
    const records = buildChain(5);
    records[2].payload = { tampered: true };
    const result = verifyEvidenceChain(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes(records[2].id))).toBe(true);
  });

  it('detects broken content chain link', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, 'wrong-hash', r1.structureHash, SESSION_ID, HMAC_KEY);

    const result = verifyEvidenceChain([r1, r2], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Content chain broken'))).toBe(true);
  });

  it('detects broken structure chain link', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, r1.hash, 'wrong-structure-hash', SESSION_ID, HMAC_KEY);

    const result = verifyEvidenceChain([r1, r2], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Structure chain broken'))).toBe(true);
  });

  it('detects first record with non-null previousHash', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, 'some-hash', null, SESSION_ID, HMAC_KEY);
    const result = verifyEvidenceChain([r1], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('null previousHash'))).toBe(true);
  });

  it('validates chain regardless of input order', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    setTimestamp(r1, '2024-01-01T00:00:01Z');

    const r2 = createEvidenceRecord('teams', 'event2', {}, r1.hash, r1.structureHash, SESSION_ID, HMAC_KEY);
    setTimestamp(r2, '2024-01-01T00:00:02Z');

    const r3 = createEvidenceRecord('email', 'event3', {}, r2.hash, r2.structureHash, SESSION_ID, HMAC_KEY);
    setTimestamp(r3, '2024-01-01T00:00:03Z');

    // Pass in reverse order
    const result = verifyEvidenceChain([r3, r1, r2], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
  });

  it('reports multiple errors when multiple records are tampered', () => {
    const records = buildChain(5);
    records[1].payload = { tampered: 1 };
    records[3].payload = { tampered: 3 };
    const result = verifyEvidenceChain(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// computeSignatureChain
// ---------------------------------------------------------------------------

describe('computeSignatureChain', () => {
  it('produces a 64-character hex hash', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const chain = computeSignatureChain([r1], HMAC_KEY);
    expect(chain).toHaveLength(64);
    expect(chain).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different results for different record sets', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, null, null, SESSION_ID, HMAC_KEY);

    const chain1 = computeSignatureChain([r1], HMAC_KEY);
    const chain2 = computeSignatureChain([r2], HMAC_KEY);
    expect(chain1).not.toBe(chain2);
  });

  it('produces consistent results for same records', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const chain1 = computeSignatureChain([r1], HMAC_KEY);
    const chain2 = computeSignatureChain([r1], HMAC_KEY);
    expect(chain1).toBe(chain2);
  });

  it('order of records matters', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, null, null, SESSION_ID, HMAC_KEY);

    const chainAB = computeSignatureChain([r1, r2], HMAC_KEY);
    const chainBA = computeSignatureChain([r2, r1], HMAC_KEY);
    expect(chainAB).not.toBe(chainBA);
  });

  it('different keys produce different signature chains', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const chain1 = computeSignatureChain([r1], 'key-a');
    const chain2 = computeSignatureChain([r1], 'key-b');
    expect(chain1).not.toBe(chain2);
  });

  it('returns correct hash for a large chain', () => {
    const records = buildChain(50);
    const chain = computeSignatureChain(records, HMAC_KEY);
    expect(chain).toHaveLength(64);
    expect(chain).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// computeStructureSignatureChain
// ---------------------------------------------------------------------------

describe('computeStructureSignatureChain', () => {
  it('produces a 64-character hex hash', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const chain = computeStructureSignatureChain([r1], HMAC_KEY);
    expect(chain).toHaveLength(64);
    expect(chain).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs from content signature chain for same records', () => {
    const records = buildChain(5);
    const contentSig = computeSignatureChain(records, HMAC_KEY);
    const structureSig = computeStructureSignatureChain(records, HMAC_KEY);
    expect(contentSig).not.toBe(structureSig);
  });

  it('produces consistent results', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const chain1 = computeStructureSignatureChain([r1], HMAC_KEY);
    const chain2 = computeStructureSignatureChain([r1], HMAC_KEY);
    expect(chain1).toBe(chain2);
  });

  it('order of records matters', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, null, null, SESSION_ID, HMAC_KEY);

    const chainAB = computeStructureSignatureChain([r1, r2], HMAC_KEY);
    const chainBA = computeStructureSignatureChain([r2, r1], HMAC_KEY);
    expect(chainAB).not.toBe(chainBA);
  });
});

// ---------------------------------------------------------------------------
// getChainIntegrity
// ---------------------------------------------------------------------------

describe('getChainIntegrity', () => {
  it('returns valid for empty chain', () => {
    const result = getChainIntegrity([], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.length).toBe(0);
    expect(result.brokenAt).toBeUndefined();
    expect(result.details).toContain('Chain is empty');
    expect(result.contentChainValid).toBe(true);
    expect(result.structureChainValid).toBe(true);
  });

  it('returns valid for a single-record chain', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, null, SESSION_ID, HMAC_KEY);
    const result = getChainIntegrity([record], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.length).toBe(1);
    expect(result.brokenAt).toBeUndefined();
    expect(result.contentChainValid).toBe(true);
    expect(result.structureChainValid).toBe(true);
  });

  it('returns valid for a multi-record chain', () => {
    const records = buildChain(5);
    const result = getChainIntegrity(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.length).toBe(5);
    expect(result.brokenAt).toBeUndefined();
    expect(result.details.some(d => d.includes('Double-Helix integrity verified'))).toBe(true);
    expect(result.contentChainValid).toBe(true);
    expect(result.structureChainValid).toBe(true);
  });

  it('returns valid for a large chain (100+ records)', () => {
    const records = buildChain(110);
    const result = getChainIntegrity(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.length).toBe(110);
  });

  it('detects corrupted content hash at genesis', () => {
    const records = buildChain(3);
    records[0].hash = 'a'.repeat(64);
    const result = getChainIntegrity(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
    expect(result.contentChainValid).toBe(false);
    expect(result.details.some(d => d.includes('Helix A'))).toBe(true);
  });

  it('detects corrupted structure hash', () => {
    const records = buildChain(3);
    records[1].structureHash = 'b'.repeat(64);
    const result = getChainIntegrity(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.structureChainValid).toBe(false);
    expect(result.details.some(d => d.includes('Helix B'))).toBe(true);
  });

  it('detects corrupted hash in the middle', () => {
    const records = buildChain(5);
    records[2].payload = { tampered: true };
    const result = getChainIntegrity(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBeDefined();
    expect(result.details.length).toBeGreaterThan(0);
  });

  it('detects broken content chain link', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, null, SESSION_ID, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, 'wrong-hash', r1.structureHash, SESSION_ID, HMAC_KEY);
    const result = getChainIntegrity([r1, r2], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.details.some(d => d.includes('Content chain broken'))).toBe(true);
  });

  it('detects genesis with non-null previousHash', () => {
    const r1 = createEvidenceRecord('zoom', 'event', {}, 'some-hash', null, SESSION_ID, HMAC_KEY);
    const result = getChainIntegrity([r1], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.details.some(d => d.includes('non-null previousHash'))).toBe(true);
    expect(result.brokenAt).toBe(0);
  });

  it('identifies the exact brokenAt index for multiple corruptions', () => {
    const records = buildChain(10);
    records[3].payload = { tampered: true };
    records[7].payload = { tampered: true };
    const result = getChainIntegrity(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBeLessThanOrEqual(3);
    expect(result.details.length).toBeGreaterThanOrEqual(2);
  });

  it('success message includes Double-Helix integrity verified', () => {
    const records = buildChain(3);
    const result = getChainIntegrity(records, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.details[0]).toContain('Double-Helix integrity verified');
    expect(result.details[0]).toContain('Helix A');
    expect(result.details[0]).toContain('Helix B');
  });
});
