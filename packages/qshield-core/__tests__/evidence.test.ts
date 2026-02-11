import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  verifyEvidenceRecord,
  verifyEvidenceChain,
  computeSignatureChain,
} from '../src/evidence';
import { hashEvidenceRecord } from '../src/crypto';

const HMAC_KEY = 'test-hmac-key-for-evidence';

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
});

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
});

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
    const r2 = createEvidenceRecord('teams', 'event2', { n: 2 }, r1.hash, HMAC_KEY);
    const r3 = createEvidenceRecord('email', 'event3', { n: 3 }, r2.hash, HMAC_KEY);

    const result = verifyEvidenceChain([r1, r2, r3], HMAC_KEY);
    expect(result.valid).toBe(true);
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
    expect(result.errors.some((e) => e.includes('null previousHash'))).toBe(true);
  });

  it('validates chain regardless of input order', () => {
    // Use explicit well-separated timestamps to ensure deterministic sorting
    const r1 = createEvidenceRecord('zoom', 'event1', {}, null, HMAC_KEY);
    // Override timestamps to ensure they are distinct and sortable
    (r1 as { timestamp: string }).timestamp = '2024-01-01T00:00:01Z';
    // Recompute hash with new timestamp
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
});

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
});
