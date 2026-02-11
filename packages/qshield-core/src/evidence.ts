import { v4 as uuidv4 } from 'uuid';
import { hashEvidenceRecord, hmacSha256 } from './crypto';
import type { AdapterType, EvidenceRecord } from './types';

/**
 * Generate a new evidence record with hash chain linking.
 * Each record's hash depends on the previous record's hash,
 * forming a tamper-evident chain.
 */
export function createEvidenceRecord(
  source: AdapterType,
  eventType: string,
  payload: Record<string, unknown>,
  previousHash: string | null,
  hmacKey: string,
): EvidenceRecord {
  const id = uuidv4();
  const timestamp = new Date().toISOString();
  const payloadStr = JSON.stringify(payload);

  const hash = hashEvidenceRecord(
    {
      id,
      previousHash,
      timestamp,
      source,
      eventType,
      payload: payloadStr,
    },
    hmacKey,
  );

  return {
    id,
    hash,
    previousHash,
    timestamp,
    source,
    eventType,
    payload,
    verified: false,
  };
}

/**
 * Verify that an evidence record's hash is valid.
 * Recomputes the HMAC and compares against the stored hash.
 */
export function verifyEvidenceRecord(record: EvidenceRecord, hmacKey: string): boolean {
  const expectedHash = hashEvidenceRecord(
    {
      id: record.id,
      previousHash: record.previousHash,
      timestamp: record.timestamp,
      source: record.source,
      eventType: record.eventType,
      payload: JSON.stringify(record.payload),
    },
    hmacKey,
  );

  return record.hash === expectedHash;
}

/**
 * Verify an entire chain of evidence records.
 * Checks both hash validity and chain linking (each record's previousHash
 * matches the preceding record's hash).
 * @returns object with validity status and any errors found
 */
export function verifyEvidenceChain(
  records: EvidenceRecord[],
  hmacKey: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (records.length === 0) {
    return { valid: true, errors: [] };
  }

  // Sort by timestamp to ensure correct order
  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  // First record should have null previousHash
  if (sorted[0].previousHash !== null) {
    errors.push(`First record ${sorted[0].id} should have null previousHash`);
  }

  for (let i = 0; i < sorted.length; i++) {
    const record = sorted[i];

    // Verify individual record hash
    if (!verifyEvidenceRecord(record, hmacKey)) {
      errors.push(`Record ${record.id} hash verification failed`);
    }

    // Verify chain linking (skip first record)
    if (i > 0) {
      const previousRecord = sorted[i - 1];
      if (record.previousHash !== previousRecord.hash) {
        errors.push(
          `Record ${record.id} previousHash does not match preceding record ${previousRecord.id}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute a signature chain hash for a set of evidence records.
 * Used in trust certificates to verify the complete evidence set.
 */
export function computeSignatureChain(records: EvidenceRecord[], hmacKey: string): string {
  const hashes = records.map((r) => r.hash).join('|');
  return hmacSha256(hashes, hmacKey);
}
