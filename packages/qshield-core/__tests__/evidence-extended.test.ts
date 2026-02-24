import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  verifyEvidenceRecord,
  verifyEvidenceChain,
  getChainIntegrity,
  computeSignatureChain,
} from '../src/evidence';
import { hashEvidenceRecord } from '../src/crypto';
import type { AdapterType, EvidenceRecord } from '../src/types';

const HMAC_KEY = 'extended-evidence-test-key';
const SESSION_ID = 'ext-test-session-001';

function buildChain(n: number, hmacKey = HMAC_KEY, sessionId = SESSION_ID): EvidenceRecord[] {
  const records: EvidenceRecord[] = [];
  let prevHash: string | null = null;
  let prevStructureHash: string | null = null;

  for (let i = 0; i < n; i++) {
    const record = createEvidenceRecord(
      'email',
      `event-${i}`,
      { index: i, data: `test-${i}` },
      prevHash,
      prevStructureHash,
      sessionId,
      hmacKey,
    );
    records.push(record);
    prevHash = record.hash;
    prevStructureHash = record.structureHash;
  }
  return records;
}

// ── Record Creation ─────────────────────────────────────────────────────────

describe('Evidence Record Creation', () => {
  it('genesis record has previousHash === null', () => {
    const record = createEvidenceRecord('email', 'test-event', { a: 1 }, null, null, SESSION_ID, HMAC_KEY);
    expect(record.previousHash).toBeNull();
    expect(record.previousStructureHash).toBeNull();
  });

  it('second record has previousHash === first.hash', () => {
    const first = createEvidenceRecord('email', 'event-1', { a: 1 }, null, null, SESSION_ID, HMAC_KEY);
    const second = createEvidenceRecord('email', 'event-2', { a: 2 }, first.hash, first.structureHash, SESSION_ID, HMAC_KEY);
    expect(second.previousHash).toBe(first.hash);
    expect(second.previousStructureHash).toBe(first.structureHash);
  });

  it('hash is 64-char hex string', () => {
    const record = createEvidenceRecord('email', 'test', { x: 1 }, null, null, SESSION_ID, HMAC_KEY);
    expect(record.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.structureHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different payloads produce different hashes', () => {
    const r1 = createEvidenceRecord('email', 'test', { x: 1 }, null, null, SESSION_ID, HMAC_KEY);
    const r2 = createEvidenceRecord('email', 'test', { x: 2 }, null, null, SESSION_ID, HMAC_KEY);
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('same inputs produce same hash (deterministic)', () => {
    const fields = {
      id: 'test-id-001',
      previousHash: null,
      timestamp: '2024-01-01T00:00:00.000Z',
      source: 'email',
      eventType: 'test',
      payload: JSON.stringify({ x: 1 }),
    };
    const h1 = hashEvidenceRecord(fields, HMAC_KEY);
    const h2 = hashEvidenceRecord(fields, HMAC_KEY);
    expect(h1).toBe(h2);
  });
});

// ── Tamper Detection ────────────────────────────────────────────────────────

describe('Evidence Tamper Detection', () => {
  it('modify record payload after creation → content invalid', () => {
    const record = createEvidenceRecord('email', 'test', { original: true }, null, null, SESSION_ID, HMAC_KEY);
    record.payload = { tampered: true };
    const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(false);
    expect(result.fullyVerified).toBe(false);
  });

  it('modify record timestamp after creation → content invalid', () => {
    const record = createEvidenceRecord('email', 'test', { a: 1 }, null, null, SESSION_ID, HMAC_KEY);
    (record as any).timestamp = '2000-01-01T00:00:00.000Z';
    const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(false);
  });

  it('modify record eventType → content invalid', () => {
    const record = createEvidenceRecord('email', 'original-event', { a: 1 }, null, null, SESSION_ID, HMAC_KEY);
    (record as any).eventType = 'tampered-event';
    const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(false);
  });

  it('modify record previousHash → content invalid', () => {
    const chain = buildChain(2);
    const second = chain[1];
    (second as any).previousHash = 'aaaa'.repeat(16);
    const result = verifyEvidenceRecord(second, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(false);
  });

  it('unmodified record → both paths valid', () => {
    const record = createEvidenceRecord('email', 'test', { a: 1 }, null, null, SESSION_ID, HMAC_KEY);
    const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
    expect(result.contentValid).toBe(true);
    expect(result.structureValid).toBe(true);
    expect(result.fullyVerified).toBe(true);
  });

  it('wrong HMAC key → both paths invalid', () => {
    const record = createEvidenceRecord('email', 'test', { a: 1 }, null, null, SESSION_ID, HMAC_KEY);
    const result = verifyEvidenceRecord(record, SESSION_ID, 'wrong-key');
    expect(result.contentValid).toBe(false);
    expect(result.structureValid).toBe(false);
  });
});

// ── Chain Verification ──────────────────────────────────────────────────────

describe('Evidence Chain Verification', () => {
  it('empty chain → valid', () => {
    const result = verifyEvidenceChain([], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('single genesis record → valid', () => {
    const chain = buildChain(1);
    const result = verifyEvidenceChain(chain, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
  });

  it('3-record chain properly linked → valid', () => {
    const chain = buildChain(3);
    const result = verifyEvidenceChain(chain, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('chain with tampered middle record → invalid', () => {
    const chain = buildChain(3);
    chain[1].payload = { tampered: true };
    const result = verifyEvidenceChain(chain, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some(e => e.includes(chain[1].id))).toBe(true);
  });

  it('chain with broken link → invalid', () => {
    const chain = buildChain(3);
    (chain[2] as any).previousHash = 'bbbb'.repeat(16);
    const result = verifyEvidenceChain(chain, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
  });

  it('chain with non-null genesis previousHash → error mentions genesis', () => {
    const chain = buildChain(2);
    (chain[0] as any).previousHash = 'fake-hash';
    // Need to also recompute content hash to avoid content validation errors obscuring the test
    const result = verifyEvidenceChain(chain, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('previousHash') || e.includes('Helix A'))).toBe(true);
  });

  it('records passed in random order → still verified correctly', () => {
    const chain = buildChain(5);
    // Shuffle the array
    const shuffled = [...chain].sort(() => Math.random() - 0.5);
    const result = verifyEvidenceChain(shuffled, SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
  });
});

// ── Chain Integrity (getChainIntegrity) ─────────────────────────────────────

describe('getChainIntegrity', () => {
  it('empty chain → valid, length 0', () => {
    const integrity = getChainIntegrity([], SESSION_ID, HMAC_KEY);
    expect(integrity.valid).toBe(true);
    expect(integrity.length).toBe(0);
  });

  it('valid 5-record chain → valid, length 5, no brokenAt', () => {
    const chain = buildChain(5);
    const integrity = getChainIntegrity(chain, SESSION_ID, HMAC_KEY);
    expect(integrity.valid).toBe(true);
    expect(integrity.length).toBe(5);
    expect(integrity.brokenAt).toBeUndefined();
    expect(integrity.contentChainValid).toBe(true);
    expect(integrity.structureChainValid).toBe(true);
  });

  it('chain with corruption at index 2 → brokenAt === 2', () => {
    const chain = buildChain(5);
    chain[2].payload = { corrupted: true };
    const integrity = getChainIntegrity(chain, SESSION_ID, HMAC_KEY);
    expect(integrity.valid).toBe(false);
    expect(integrity.brokenAt).toBe(2);
    expect(integrity.contentChainValid).toBe(false);
  });

  it('chain with broken genesis → brokenAt === 0', () => {
    const chain = buildChain(3);
    (chain[0] as any).previousHash = 'not-null';
    const integrity = getChainIntegrity(chain, SESSION_ID, HMAC_KEY);
    expect(integrity.valid).toBe(false);
    expect(integrity.brokenAt).toBe(0);
  });
});

// ── Signature Chain ─────────────────────────────────────────────────────────

describe('computeSignatureChain', () => {
  it('produces 64-char hex', () => {
    const chain = buildChain(3);
    const sig = computeSignatureChain(chain, HMAC_KEY);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different record sets produce different signatures', () => {
    const chain1 = buildChain(3);
    const chain2 = buildChain(4);
    const sig1 = computeSignatureChain(chain1, HMAC_KEY);
    const sig2 = computeSignatureChain(chain2, HMAC_KEY);
    expect(sig1).not.toBe(sig2);
  });

  it('same records always produce same signature (deterministic)', () => {
    const chain = buildChain(3);
    const sig1 = computeSignatureChain(chain, HMAC_KEY);
    const sig2 = computeSignatureChain(chain, HMAC_KEY);
    expect(sig1).toBe(sig2);
  });

  it('signature changes if any record hash changes', () => {
    const chain = buildChain(3);
    const sigBefore = computeSignatureChain(chain, HMAC_KEY);
    // Tamper with a hash
    chain[1].hash = 'cccc'.repeat(16);
    const sigAfter = computeSignatureChain(chain, HMAC_KEY);
    expect(sigBefore).not.toBe(sigAfter);
  });
});
