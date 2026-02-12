import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  verifyEvidenceRecord,
  verifyEvidenceChain,
  computeSignatureChain,
  getChainIntegrity,
} from '../src/evidence';
import { hashEvidenceRecord } from '../src/crypto';

const HMAC_KEY = 'test-hmac-key-for-evidence';

/** Assign an explicit timestamp to a record and recompute its hash. */
function setTimestamp(
  record: ReturnType<typeof createEvidenceRecord>,
  ts: string,
  hmacKey: string = HMAC_KEY,
): void {
  (record as { timestamp: string }).timestamp = ts;
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
}

/** Build a chain of N records with consistent hash links and explicit timestamps */
function buildChain(n: number, hmacKey: string = HMAC_KEY) {
  const records = [];
  let prevHash: string | null = null;
  const baseTime = new Date('2024-06-01T00:00:00Z').getTime();
  for (let i = 0; i < n; i++) {
    const record = createEvidenceRecord(
      'zoom',
      `event-${i}`,
      { index: i },
      prevHash,
      hmacKey,
    );
    // Assign explicit sequential timestamp to ensure deterministic sort order
    setTimestamp(record, new Date(baseTime + i * 1000).toISOString(), hmacKey);
    records.push(record);
    prevHash = record.hash;
  }
  return records;
}

// ---------------------------------------------------------------------------
// createEvidenceRecord
// ---------------------------------------------------------------------------

describe('createEvidenceRecord', () => {
  it('creates a record with valid structure', () => {
    const record = createEvidenceRecord('zoom', 'meeting-started', { meetingId: '123' }, null, HMAC_KEY);

    expect(record.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(record.hash).toHaveLength(64);
    expect(record.previousHash).toBeNull();
    expect(record.source).toBe('zoom');
    expect(record.eventType).toBe('meeting-started');
    expect(record.payload).toEqual({ meetingId: '123' });
    expect(record.verified).toBe(false);
    expect(record.timestamp).toBeTruthy();
  });

  it('links to previous hash', () => {
    const first = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    const second = createEvidenceRecord('teams', 'event2', {}, first.hash, HMAC_KEY);

    expect(second.previousHash).toBe(first.hash);
  });

  it('produces unique IDs and hashes', () => {
    const a = createEvidenceRecord('zoom', 'event', {}, null, HMAC_KEY);
    const b = createEvidenceRecord('zoom', 'event', {}, null, HMAC_KEY);

    expect(a.id).not.toBe(b.id);
    expect(a.hash).not.toBe(b.hash);
  });

  it('genesis record has null previousHash', () => {
    const record = createEvidenceRecord('zoom', 'genesis', {}, null, HMAC_KEY);
    expect(record.previousHash).toBeNull();
  });

  it('stores complex payloads', () => {
    const payload = { deeply: { nested: { data: [1, 2, 3] } }, flag: true };
    const record = createEvidenceRecord('email', 'complex', payload, null, HMAC_KEY);
    expect(record.payload).toEqual(payload);
  });

  it('different event types produce different hashes', () => {
    const a = createEvidenceRecord('zoom', 'type-a', {}, null, HMAC_KEY);
    const b = createEvidenceRecord('zoom', 'type-b', {}, null, HMAC_KEY);
    expect(a.hash).not.toBe(b.hash);
  });

  it('different sources produce different hashes', () => {
    const a = createEvidenceRecord('zoom', 'event', {}, null, HMAC_KEY);
    const b = createEvidenceRecord('teams', 'event', {}, null, HMAC_KEY);
    expect(a.hash).not.toBe(b.hash);
  });

  it('always sets verified to false', () => {
    const record = createEvidenceRecord('api', 'call', {}, null, HMAC_KEY);
    expect(record.verified).toBe(false);
  });

  it('timestamp is a valid ISO 8601 string', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, HMAC_KEY);
    expect(() => new Date(record.timestamp)).not.toThrow();
    expect(new Date(record.timestamp).toISOString()).toBe(record.timestamp);
  });
});

// ---------------------------------------------------------------------------
// verifyEvidenceRecord
// ---------------------------------------------------------------------------

describe('verifyEvidenceRecord', () => {
  it('verifies a valid record', () => {
    const record = createEvidenceRecord('email', 'email-sent', { to: 'user@example.com' }, null, HMAC_KEY);
    expect(verifyEvidenceRecord(record, HMAC_KEY)).toBe(true);
  });

  it('rejects a tampered record (modified payload)', () => {
    const record = createEvidenceRecord('email', 'email-sent', { to: 'user@example.com' }, null, HMAC_KEY);
    record.payload = { to: 'attacker@evil.com' };
    expect(verifyEvidenceRecord(record, HMAC_KEY)).toBe(false);
  });

  it('rejects a tampered record (modified hash)', () => {
    const record = createEvidenceRecord('file', 'file-created', {}, null, HMAC_KEY);
    record.hash = 'a'.repeat(64);
    expect(verifyEvidenceRecord(record, HMAC_KEY)).toBe(false);
  });

  it('rejects verification with wrong key', () => {
    const record = createEvidenceRecord('api', 'api-call', {}, null, HMAC_KEY);
    expect(verifyEvidenceRecord(record, 'wrong-key')).toBe(false);
  });

  it('rejects tampered eventType', () => {
    const record = createEvidenceRecord('zoom', 'original-event', {}, null, HMAC_KEY);
    record.eventType = 'altered-event';
    expect(verifyEvidenceRecord(record, HMAC_KEY)).toBe(false);
  });

  it('rejects tampered source', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, HMAC_KEY);
    (record as { source: string }).source = 'teams';
    expect(verifyEvidenceRecord(record, HMAC_KEY)).toBe(false);
  });

  it('rejects tampered timestamp', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, HMAC_KEY);
    (record as { timestamp: string }).timestamp = '2099-01-01T00:00:00Z';
    expect(verifyEvidenceRecord(record, HMAC_KEY)).toBe(false);
  });

  it('rejects tampered id', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, HMAC_KEY);
    (record as { id: string }).id = '00000000-0000-4000-8000-000000000000';
    expect(verifyEvidenceRecord(record, HMAC_KEY)).toBe(false);
  });

  it('verifies record with non-null previousHash', () => {
    const first = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    const second = createEvidenceRecord('teams', 'event2', {}, first.hash, HMAC_KEY);
    expect(verifyEvidenceRecord(second, HMAC_KEY)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// verifyEvidenceChain
// ---------------------------------------------------------------------------

describe('verifyEvidenceChain', () => {
  it('validates an empty chain', () => {
    const result = verifyEvidenceChain([], HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates a single-record chain', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, HMAC_KEY);
    const result = verifyEvidenceChain([record], HMAC_KEY);
    expect(result.valid).toBe(true);
  });

  it('validates a multi-record chain', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', { n: 1 }, null, HMAC_KEY);
    setTimestamp(r1, '2024-06-01T00:00:01Z');
    const r2 = createEvidenceRecord('teams', 'event2', { n: 2 }, r1.hash, HMAC_KEY);
    setTimestamp(r2, '2024-06-01T00:00:02Z');
    const r3 = createEvidenceRecord('email', 'event3', { n: 3 }, r2.hash, HMAC_KEY);
    setTimestamp(r3, '2024-06-01T00:00:03Z');

    const result = verifyEvidenceChain([r1, r2, r3], HMAC_KEY);
    expect(result.valid).toBe(true);
  });

  it('validates a chain of 100+ records', () => {
    const records = buildChain(110);
    const result = verifyEvidenceChain(records, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects tampered record at position 0 (genesis)', () => {
    const records = buildChain(5);
    records[0].payload = { tampered: true };
    const result = verifyEvidenceChain(records, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes(records[0].id))).toBe(true);
  });

  it('detects tampered record in the middle', () => {
    const records = buildChain(5);
    records[2].payload = { tampered: true };
    const result = verifyEvidenceChain(records, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes(records[2].id))).toBe(true);
  });

  it('detects tampered record at the end', () => {
    const records = buildChain(5);
    records[4].payload = { tampered: true };
    const result = verifyEvidenceChain(records, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes(records[4].id))).toBe(true);
  });

  it('detects broken chain link', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, 'wrong-hash', HMAC_KEY);

    const result = verifyEvidenceChain([r1, r2], HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('detects tampered record in chain', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, r1.hash, HMAC_KEY);
    r2.payload = { tampered: true };

    const result = verifyEvidenceChain([r1, r2], HMAC_KEY);
    expect(result.valid).toBe(false);
  });

  it('detects first record with non-null previousHash', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, 'some-hash', HMAC_KEY);
    const result = verifyEvidenceChain([r1], HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('null previousHash'))).toBe(true);
  });

  it('verifies chain linking: each record.previousHash matches prior hash', () => {
    const records = buildChain(10);
    for (let i = 1; i < records.length; i++) {
      expect(records[i].previousHash).toBe(records[i - 1].hash);
    }
    const result = verifyEvidenceChain(records, HMAC_KEY);
    expect(result.valid).toBe(true);
  });

  it('validates chain regardless of input order', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    (r1 as { timestamp: string }).timestamp = '2024-01-01T00:00:01Z';
    r1.hash = hashEvidenceRecord(
      { id: r1.id, previousHash: r1.previousHash, timestamp: r1.timestamp, source: r1.source, eventType: r1.eventType, payload: JSON.stringify(r1.payload) },
      HMAC_KEY,
    );

    const r2 = createEvidenceRecord('teams', 'event2', {}, r1.hash, HMAC_KEY);
    (r2 as { timestamp: string }).timestamp = '2024-01-01T00:00:02Z';
    r2.hash = hashEvidenceRecord(
      { id: r2.id, previousHash: r2.previousHash, timestamp: r2.timestamp, source: r2.source, eventType: r2.eventType, payload: JSON.stringify(r2.payload) },
      HMAC_KEY,
    );

    const r3 = createEvidenceRecord('email', 'event3', {}, r2.hash, HMAC_KEY);
    (r3 as { timestamp: string }).timestamp = '2024-01-01T00:00:03Z';
    r3.hash = hashEvidenceRecord(
      { id: r3.id, previousHash: r3.previousHash, timestamp: r3.timestamp, source: r3.source, eventType: r3.eventType, payload: JSON.stringify(r3.payload) },
      HMAC_KEY,
    );

    // Pass in reverse order — chain verification should sort by timestamp
    const result = verifyEvidenceChain([r3, r1, r2], HMAC_KEY);
    expect(result.valid).toBe(true);
  });

  it('reports multiple errors when multiple records are tampered', () => {
    const records = buildChain(5);
    records[1].payload = { tampered: 1 };
    records[3].payload = { tampered: 3 };
    const result = verifyEvidenceChain(records, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// computeSignatureChain
// ---------------------------------------------------------------------------

describe('computeSignatureChain', () => {
  it('produces a 64-character hex hash', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    const chain = computeSignatureChain([r1], HMAC_KEY);
    expect(chain).toHaveLength(64);
    expect(chain).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different results for different record sets', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, null, HMAC_KEY);

    const chain1 = computeSignatureChain([r1], HMAC_KEY);
    const chain2 = computeSignatureChain([r2], HMAC_KEY);
    expect(chain1).not.toBe(chain2);
  });

  it('produces consistent results for same records', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    const chain1 = computeSignatureChain([r1], HMAC_KEY);
    const chain2 = computeSignatureChain([r1], HMAC_KEY);
    expect(chain1).toBe(chain2);
  });

  it('order of records matters', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, null, HMAC_KEY);

    const chainAB = computeSignatureChain([r1, r2], HMAC_KEY);
    const chainBA = computeSignatureChain([r2, r1], HMAC_KEY);
    expect(chainAB).not.toBe(chainBA);
  });

  it('different keys produce different signature chains', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
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
// getChainIntegrity
// ---------------------------------------------------------------------------

describe('getChainIntegrity', () => {
  it('returns valid for empty chain', () => {
    const result = getChainIntegrity([], HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.length).toBe(0);
    expect(result.brokenAt).toBeUndefined();
    expect(result.details).toContain('Chain is empty');
  });

  it('returns valid for a single-record chain', () => {
    const record = createEvidenceRecord('zoom', 'event', {}, null, HMAC_KEY);
    const result = getChainIntegrity([record], HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.length).toBe(1);
    expect(result.brokenAt).toBeUndefined();
  });

  it('returns valid for a multi-record chain', () => {
    const records = buildChain(5);
    const result = getChainIntegrity(records, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.length).toBe(5);
    expect(result.brokenAt).toBeUndefined();
    expect(result.details.some(d => d.includes('all hashes valid'))).toBe(true);
  });

  it('returns valid for a large chain (100+ records)', () => {
    const records = buildChain(110);
    const result = getChainIntegrity(records, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.length).toBe(110);
  });

  it('detects corrupted hash at genesis', () => {
    const records = buildChain(3);
    records[0].hash = 'a'.repeat(64);
    const result = getChainIntegrity(records, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
    expect(result.details.some(d => d.includes('corrupted hash'))).toBe(true);
  });

  it('detects corrupted hash in the middle', () => {
    const records = buildChain(5);
    records[2].payload = { tampered: true };
    const result = getChainIntegrity(records, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBeDefined();
    expect(result.details.length).toBeGreaterThan(0);
  });

  it('detects corrupted hash at the end', () => {
    const records = buildChain(5);
    records[4].payload = { tampered: true };
    const result = getChainIntegrity(records, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.details.some(d => d.includes(records[4].id))).toBe(true);
  });

  it('detects broken chain link', () => {
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    const r2 = createEvidenceRecord('teams', 'event2', {}, 'wrong-hash', HMAC_KEY);
    const result = getChainIntegrity([r1, r2], HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.details.some(d => d.includes('Chain broken'))).toBe(true);
  });

  it('detects genesis with non-null previousHash', () => {
    const r1 = createEvidenceRecord('zoom', 'event', {}, 'some-hash', HMAC_KEY);
    const result = getChainIntegrity([r1], HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.details.some(d => d.includes('non-null previousHash'))).toBe(true);
    expect(result.brokenAt).toBe(0);
  });

  it('identifies the exact brokenAt index for multiple corruptions', () => {
    const records = buildChain(10);
    // Corrupt records at index 3 and 7
    records[3].payload = { tampered: true };
    records[7].payload = { tampered: true };
    const result = getChainIntegrity(records, HMAC_KEY);
    expect(result.valid).toBe(false);
    // brokenAt should point to the first corruption
    expect(result.brokenAt).toBeLessThanOrEqual(3);
    expect(result.details.length).toBeGreaterThanOrEqual(2);
  });

  it('details array contains diagnostic messages', () => {
    const records = buildChain(3);
    const result = getChainIntegrity(records, HMAC_KEY);
    expect(result.details).toBeInstanceOf(Array);
    expect(result.details.length).toBeGreaterThan(0);
    expect(typeof result.details[0]).toBe('string');
  });
});
