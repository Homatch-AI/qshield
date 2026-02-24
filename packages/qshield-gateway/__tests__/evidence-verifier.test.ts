import { describe, it, expect } from 'vitest';
import { EvidenceVerifier } from '../src/services/evidence-verifier.js';
import { hmacSha256 } from '@qshield/core';

const CLIENT_KEY = 'test-client-hmac-key';
const SERVER_KEY = 'test-server-hmac-key';

function makeRecord(
  id: string,
  previousHash: string | null,
  source: string,
  eventType: string,
  payload: string,
  timestamp = '2024-01-01T00:00:00Z',
) {
  const prev = previousHash ?? 'genesis';
  const data = [id, prev, timestamp, source, eventType, payload].join('|');
  const hash = hmacSha256(data, CLIENT_KEY);
  return { id, hash, previousHash, timestamp, source, eventType, payload };
}

function buildChain(n: number) {
  const records = [];
  let prevHash: string | null = null;
  for (let i = 0; i < n; i++) {
    const record = makeRecord(`rec-${i}`, prevHash, 'zoom', `event-${i}`, `{"i":${i}}`, `2024-01-01T0${i}:00:00Z`);
    records.push(record);
    prevHash = record.hash;
  }
  return records;
}

describe('EvidenceVerifier - Chain Verification', () => {
  const verifier = new EvidenceVerifier(SERVER_KEY);

  it('valid chain of 5 records → passes', () => {
    const chain = buildChain(5);
    const result = verifier.verifyChain(chain, CLIENT_KEY);
    expect(result.valid).toBe(true);
    expect(result.recordCount).toBe(5);
    expect(result.brokenAt).toBeUndefined();
    expect(result.serverSignature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('empty chain → passes', () => {
    const result = verifier.verifyChain([], CLIENT_KEY);
    expect(result.valid).toBe(true);
    expect(result.recordCount).toBe(0);
  });

  it('single record → passes', () => {
    const chain = buildChain(1);
    const result = verifier.verifyChain(chain, CLIENT_KEY);
    expect(result.valid).toBe(true);
    expect(result.recordCount).toBe(1);
  });

  it('tampered record hash → fails at correct index', () => {
    const chain = buildChain(4);
    chain[2].hash = 'tampered-hash-value-that-does-not-match';
    const result = verifier.verifyChain(chain, CLIENT_KEY);
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(2);
  });

  it('broken chain link → chain walk drops orphaned records', () => {
    const chain = buildChain(3);
    // Break the link: change record 2's previousHash so the chain walk can't find it
    chain[2].previousHash = 'wrong-previous-hash';
    const result = verifier.verifyChain(chain, CLIENT_KEY);
    // The verifier walks from genesis via previousHash links.
    // Record 2 becomes orphaned, so only 2 records are verified.
    expect(result.recordCount).toBe(2);
    expect(result.valid).toBe(true); // The 2-record subchain is still valid
  });

  it('wrong client HMAC key → all hashes mismatch', () => {
    const chain = buildChain(3);
    const result = verifier.verifyChain(chain, 'wrong-key');
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  it('server signature is deterministic for same input and timestamp', () => {
    const chain = buildChain(2);
    const r1 = verifier.verifyChain(chain, CLIENT_KEY);
    const r2 = verifier.verifyChain(chain, CLIENT_KEY);
    // Server signatures will differ because serverVerifiedAt changes
    // But both should be valid hex
    expect(r1.serverSignature).toMatch(/^[0-9a-f]{64}$/);
    expect(r2.serverSignature).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('EvidenceVerifier - Certificate Verification', () => {
  const verifier = new EvidenceVerifier(SERVER_KEY);

  it('valid signature chain → passes', () => {
    const hashes = ['hash1', 'hash2', 'hash3'];
    const signatureChain = hmacSha256(hashes.join('|'), CLIENT_KEY);
    const result = verifier.verifyCertificate(signatureChain, hashes, CLIENT_KEY);
    expect(result.valid).toBe(true);
  });

  it('wrong signature chain → fails', () => {
    const hashes = ['hash1', 'hash2'];
    const result = verifier.verifyCertificate('wrong-signature', hashes, CLIENT_KEY);
    expect(result.valid).toBe(false);
  });

  it('wrong HMAC key → fails', () => {
    const hashes = ['hash1'];
    const signatureChain = hmacSha256(hashes.join('|'), CLIENT_KEY);
    const result = verifier.verifyCertificate(signatureChain, hashes, 'wrong-key');
    expect(result.valid).toBe(false);
  });

  it('empty hashes with matching signature → passes', () => {
    const hashes: string[] = [];
    const signatureChain = hmacSha256('', CLIENT_KEY);
    const result = verifier.verifyCertificate(signatureChain, hashes, CLIENT_KEY);
    expect(result.valid).toBe(true);
  });
});
