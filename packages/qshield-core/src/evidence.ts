import { v4 as uuidv4 } from 'uuid';
import { hashEvidenceRecord, hmacSha256, constantTimeEqual } from './crypto';
import type { AdapterType, EvidenceRecord } from './types';

/** Result of a full chain integrity check. */
export interface ChainIntegrity {
  /** Whether the entire chain is valid. */
  valid: boolean;
  /** Total number of records in the chain. */
  length: number;
  /** Zero-based index of the first corrupted record, if any. */
  brokenAt?: number;
  /** Detailed diagnostic messages for each issue found. */
  details: string[];
}

/**
 * Generate a new evidence record with hash chain linking.
 *
 * Each record's HMAC-SHA256 hash depends on the previous record's hash,
 * forming a tamper-evident chain. The genesis record (first in chain) has
 * a null previousHash.
 *
 * @param source - The adapter type that generated this evidence
 * @param eventType - A descriptive event type string (e.g. "meeting-started")
 * @param payload - Arbitrary JSON-serializable data associated with the event
 * @param previousHash - Hash of the preceding record, or null for genesis
 * @param hmacKey - The shared secret key used for HMAC chain integrity
 * @returns A complete EvidenceRecord with computed hash
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
 *
 * Recomputes the HMAC-SHA256 from the record's fields and performs
 * a constant-time comparison against the stored hash to prevent
 * timing side-channel attacks.
 *
 * @param record - The evidence record to verify
 * @param hmacKey - The shared secret key used for HMAC verification
 * @returns true if the record's hash matches the recomputed hash
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

  return constantTimeEqual(record.hash, expectedHash);
}

/**
 * Order evidence records by walking the chain via previousHash pointers.
 *
 * Finds the genesis record (previousHash === null), then follows the chain
 * link-by-link to the tip. This is fully deterministic regardless of
 * timestamps or insertion order, and correctly handles concurrent writes
 * with identical timestamps.
 *
 * Falls back to timestamp sorting if the chain structure is broken or
 * no genesis record is found.
 *
 * @param records - Unsorted array of evidence records
 * @returns A new ordered array (does not mutate the input)
 */
function orderByChain(records: EvidenceRecord[]): EvidenceRecord[] {
  if (records.length <= 1) return [...records];

  // Build lookup: hash -> record
  const byHash = new Map<string, EvidenceRecord>();
  let genesis: EvidenceRecord | undefined;

  for (const record of records) {
    byHash.set(record.hash, record);
    if (record.previousHash === null) {
      genesis = record;
    }
  }

  // If no genesis found, fall back to timestamp sort
  if (!genesis) {
    return [...records].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
  }

  // Walk the chain from genesis to tip
  const ordered: EvidenceRecord[] = [genesis];
  const visited = new Set<string>([genesis.hash]);

  // Build reverse lookup: previousHash -> record (the record that points back to it)
  const byPrevHash = new Map<string, EvidenceRecord>();
  for (const record of records) {
    if (record.previousHash !== null) {
      byPrevHash.set(record.previousHash, record);
    }
  }

  let current = genesis;
  while (ordered.length < records.length) {
    const next = byPrevHash.get(current.hash);
    if (!next || visited.has(next.hash)) break;
    ordered.push(next);
    visited.add(next.hash);
    current = next;
  }

  // If we couldn't walk the entire chain, append remaining records sorted by timestamp
  if (ordered.length < records.length) {
    const remaining = records.filter((r) => !visited.has(r.hash));
    remaining.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    ordered.push(...remaining);
  }

  return ordered;
}

/**
 * Verify an entire chain of evidence records.
 *
 * Checks both hash validity and chain linking (each record's previousHash
 * matches the preceding record's hash). Records are sorted by timestamp
 * before verification, with ID as a tiebreaker for concurrent writes.
 *
 * @param records - The evidence records forming the chain (any order)
 * @param hmacKey - The shared secret key used for HMAC verification
 * @returns Object with validity status and any errors found
 */
export function verifyEvidenceChain(
  records: EvidenceRecord[],
  hmacKey: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (records.length === 0) {
    return { valid: true, errors: [] };
  }

  const ordered = orderByChain(records);

  // First record should have null previousHash
  if (ordered[0].previousHash !== null) {
    errors.push(`First record ${ordered[0].id} should have null previousHash`);
  }

  for (let i = 0; i < ordered.length; i++) {
    const record = ordered[i];

    // Verify individual record hash
    if (!verifyEvidenceRecord(record, hmacKey)) {
      errors.push(`Record ${record.id} hash verification failed`);
    }

    // Verify chain linking (skip first record)
    if (i > 0) {
      const previousRecord = ordered[i - 1];
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
 * Perform a comprehensive chain integrity check.
 *
 * Walks the full chain from genesis to tip, verifying each record's hash
 * and chain linkage. If tampering is detected, identifies the exact index
 * of the first corrupted record.
 *
 * Handles concurrent-write safety by using deterministic sort ordering
 * (timestamp + ID tiebreaker).
 *
 * @param records - The evidence records forming the chain (any order)
 * @param hmacKey - The shared secret key used for HMAC verification
 * @returns Detailed chain integrity report
 */
export function getChainIntegrity(
  records: EvidenceRecord[],
  hmacKey: string,
): ChainIntegrity {
  if (records.length === 0) {
    return { valid: true, length: 0, details: ['Chain is empty'] };
  }

  const ordered = orderByChain(records);
  const details: string[] = [];
  let brokenAt: number | undefined;

  // Check genesis record
  if (ordered[0].previousHash !== null) {
    details.push(`Genesis record ${ordered[0].id} has non-null previousHash: "${ordered[0].previousHash}"`);
    if (brokenAt === undefined) brokenAt = 0;
  }

  for (let i = 0; i < ordered.length; i++) {
    const record = ordered[i];

    // Verify individual record hash integrity
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

    if (!constantTimeEqual(record.hash, expectedHash)) {
      details.push(
        `Record at index ${i} (id: ${record.id}) has corrupted hash. ` +
        `Expected: ${expectedHash.slice(0, 16)}..., Got: ${record.hash.slice(0, 16)}...`,
      );
      if (brokenAt === undefined) brokenAt = i;
    }

    // Verify chain linkage (skip genesis)
    if (i > 0) {
      const previousRecord = ordered[i - 1];
      if (record.previousHash !== previousRecord.hash) {
        details.push(
          `Chain broken at index ${i} (id: ${record.id}): previousHash does not match ` +
          `record at index ${i - 1} (id: ${previousRecord.id})`,
        );
        if (brokenAt === undefined) brokenAt = i;
      }
    }
  }

  const valid = details.length === 0;
  if (valid) {
    details.push(`Chain integrity verified: ${ordered.length} records, all hashes valid`);
  }

  return {
    valid,
    length: ordered.length,
    brokenAt,
    details,
  };
}

/**
 * Compute a signature chain hash for a set of evidence records.
 *
 * Concatenates all record hashes with a pipe separator and computes
 * an HMAC-SHA256 over the result. This produces a single hash that
 * represents the entire evidence set, suitable for embedding in
 * trust certificates.
 *
 * @param records - The evidence records to sign
 * @param hmacKey - The shared secret key for HMAC computation
 * @returns Hex-encoded HMAC-SHA256 signature chain hash (64 characters)
 */
export function computeSignatureChain(records: EvidenceRecord[], hmacKey: string): string {
  const hashes = records.map((r) => r.hash).join('|');
  return hmacSha256(hashes, hmacKey);
}
