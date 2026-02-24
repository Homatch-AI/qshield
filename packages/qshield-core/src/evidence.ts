import { v4 as uuidv4 } from 'uuid';
import { hashEvidenceRecord, hmacSha256, constantTimeEqual } from './crypto.js';
import type { AdapterType, DualPathVerification, EvidenceRecord } from './types.js';

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
  /** Whether the content chain (Helix A) is fully intact. */
  contentChainValid: boolean;
  /** Whether the structure chain (Helix B) is fully intact. */
  structureChainValid: boolean;
}

/**
 * Compute deterministic vault position from content hash, session, time, and source.
 * position = f(contentHash, sessionId, timestamp, source)
 * (Patent Claim 3: spatial coordinate as information)
 */
export function computeVaultPosition(
  contentHash: string,
  sessionId: string,
  timestamp: string,
  source: AdapterType,
  hmacKey: string,
): number {
  const data = [contentHash, sessionId, timestamp, source].join('|');
  const hash = hmacSha256(data, hmacKey + ':vault-position');
  return parseInt(hash.slice(0, 8), 16) >>> 0;
}

/**
 * Hash a structure record for the Helix B (Structure Chain).
 * Uses domain-separated HMAC key to prevent cross-chain attacks.
 * (Patent Claim 2: double-helix structure)
 */
export function hashStructureRecord(
  fields: {
    id: string;
    vaultPosition: number;
    previousStructureHash: string | null;
    timestamp: string;
    source: string;
    eventType: string;
  },
  hmacKey: string,
): string {
  const data = [
    fields.id,
    fields.vaultPosition.toString(16),
    fields.previousStructureHash ?? 'structure-genesis',
    fields.timestamp,
    fields.source,
    fields.eventType,
  ].join('|');

  return hmacSha256(data, hmacKey + ':structure-chain');
}

/**
 * Generate a new evidence record with dual hash chain linking.
 *
 * Each record has TWO independent hash chains:
 *   Helix A (Content Chain): HMAC of payload data → detects content tampering
 *   Helix B (Structure Chain): HMAC of positional metadata → detects reordering
 *
 * @param source - The adapter type that generated this evidence
 * @param eventType - A descriptive event type string (e.g. "meeting-started")
 * @param payload - Arbitrary JSON-serializable data associated with the event
 * @param previousHash - Hash of the preceding content record, or null for genesis
 * @param previousStructureHash - Hash of the preceding structure record, or null for genesis
 * @param sessionId - The current session identifier
 * @param hmacKey - The shared secret key used for HMAC chain integrity
 * @returns A complete EvidenceRecord with computed dual hashes
 */
export function createEvidenceRecord(
  source: AdapterType,
  eventType: string,
  payload: Record<string, unknown>,
  previousHash: string | null,
  previousStructureHash: string | null,
  sessionId: string,
  hmacKey: string,
): EvidenceRecord {
  const id = uuidv4();
  const timestamp = new Date().toISOString();
  const payloadStr = JSON.stringify(payload);

  // Helix A: Content chain hash
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

  // Vault position (Patent Claim 3)
  const vaultPosition = computeVaultPosition(hash, sessionId, timestamp, source, hmacKey);

  // Helix B: Structure chain hash
  const structureHash = hashStructureRecord(
    {
      id,
      vaultPosition,
      previousStructureHash,
      timestamp,
      source,
      eventType,
    },
    hmacKey,
  );

  return {
    id,
    hash,
    previousHash,
    structureHash,
    previousStructureHash,
    vaultPosition,
    timestamp,
    source,
    eventType,
    payload,
    verified: false,
  };
}

/**
 * Verify an evidence record using dual-path verification.
 *
 * Path 1 (Content): Recompute content HMAC and compare
 * Path 2 (Structure): Recompute vault position + structure hash and compare
 * fullyVerified = contentValid && structureValid
 *
 * (Patent Claims 4–7: dual decoding + error correction)
 *
 * @param record - The evidence record to verify
 * @param sessionId - The session identifier used to compute vault position
 * @param hmacKey - The shared secret key used for HMAC verification
 * @returns DualPathVerification result
 */
export function verifyEvidenceRecord(
  record: EvidenceRecord,
  sessionId: string,
  hmacKey: string,
): DualPathVerification {
  // Path 1: Content chain verification (Helix A)
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
  const contentValid = constantTimeEqual(record.hash, expectedHash);

  // Path 2: Structure chain verification (Helix B)
  const expectedVaultPosition = computeVaultPosition(
    record.hash,
    sessionId,
    record.timestamp,
    record.source,
    hmacKey,
  );
  const expectedStructureHash = hashStructureRecord(
    {
      id: record.id,
      vaultPosition: expectedVaultPosition,
      previousStructureHash: record.previousStructureHash,
      timestamp: record.timestamp,
      source: record.source,
      eventType: record.eventType,
    },
    hmacKey,
  );
  const structureValid =
    record.vaultPosition === expectedVaultPosition &&
    constantTimeEqual(record.structureHash, expectedStructureHash);

  return {
    contentValid,
    structureValid,
    fullyVerified: contentValid && structureValid,
  };
}

/**
 * Order evidence records by walking the chain via previousHash pointers.
 *
 * Finds the genesis record (previousHash === null), then follows the chain
 * link-by-link to the tip. Falls back to timestamp sorting if the chain
 * structure is broken or no genesis record is found.
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
 * Verify an entire chain of evidence records with dual-path integrity.
 *
 * Checks both content chain links (Helix A) and structure chain links (Helix B).
 *
 * @param records - The evidence records forming the chain (any order)
 * @param sessionId - The session identifier for vault position computation
 * @param hmacKey - The shared secret key used for HMAC verification
 * @returns Object with validity status and any errors found
 */
export function verifyEvidenceChain(
  records: EvidenceRecord[],
  sessionId: string,
  hmacKey: string,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (records.length === 0) {
    return { valid: true, errors: [] };
  }

  const ordered = orderByChain(records);

  // First record should have null previousHash (content genesis)
  if (ordered[0].previousHash !== null) {
    errors.push(`First record ${ordered[0].id} should have null previousHash (Content chain / Helix A)`);
  }

  // First record should have null previousStructureHash (structure genesis)
  if (ordered[0].previousStructureHash !== null) {
    errors.push(`First record ${ordered[0].id} should have null previousStructureHash (Structure chain / Helix B)`);
  }

  for (let i = 0; i < ordered.length; i++) {
    const record = ordered[i];

    // Verify individual record with dual-path
    const dualPath = verifyEvidenceRecord(record, sessionId, hmacKey);

    if (!dualPath.contentValid) {
      errors.push(`Record ${record.id} Helix A (content) hash verification failed`);
    }

    if (!dualPath.structureValid) {
      errors.push(`Record ${record.id} Helix B (structure) hash verification failed`);
    }

    // Verify content chain linking (skip first record)
    if (i > 0) {
      const previousRecord = ordered[i - 1];
      if (record.previousHash !== previousRecord.hash) {
        errors.push(
          `Record ${record.id} Content chain broken: previousHash does not match preceding record ${previousRecord.id}`,
        );
      }
      if (record.previousStructureHash !== previousRecord.structureHash) {
        errors.push(
          `Record ${record.id} Structure chain broken: previousStructureHash does not match preceding record ${previousRecord.id}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Perform a comprehensive chain integrity check with dual-path analysis.
 *
 * Walks the full chain from genesis to tip, verifying each record's
 * content hash, structure hash, and chain linkage for both chains.
 *
 * @param records - The evidence records forming the chain (any order)
 * @param sessionId - The session identifier for vault position computation
 * @param hmacKey - The shared secret key used for HMAC verification
 * @returns Detailed chain integrity report with per-chain status
 */
export function getChainIntegrity(
  records: EvidenceRecord[],
  sessionId: string,
  hmacKey: string,
): ChainIntegrity {
  if (records.length === 0) {
    return {
      valid: true,
      length: 0,
      details: ['Chain is empty'],
      contentChainValid: true,
      structureChainValid: true,
    };
  }

  const ordered = orderByChain(records);
  const details: string[] = [];
  let brokenAt: number | undefined;
  let contentChainValid = true;
  let structureChainValid = true;

  // Check genesis record — content chain
  if (ordered[0].previousHash !== null) {
    details.push(`Genesis record ${ordered[0].id} has non-null previousHash: "${ordered[0].previousHash}"`);
    if (brokenAt === undefined) brokenAt = 0;
    contentChainValid = false;
  }

  // Check genesis record — structure chain
  if (ordered[0].previousStructureHash !== null) {
    details.push(`Genesis record ${ordered[0].id} has non-null previousStructureHash: "${ordered[0].previousStructureHash}"`);
    if (brokenAt === undefined) brokenAt = 0;
    structureChainValid = false;
  }

  for (let i = 0; i < ordered.length; i++) {
    const record = ordered[i];

    // Verify dual-path
    const dualPath = verifyEvidenceRecord(record, sessionId, hmacKey);

    if (!dualPath.contentValid) {
      details.push(
        `Record at index ${i} (id: ${record.id}) has corrupted content hash (Helix A). ` +
        `Got: ${record.hash.slice(0, 16)}...`,
      );
      if (brokenAt === undefined) brokenAt = i;
      contentChainValid = false;
    }

    if (!dualPath.structureValid) {
      details.push(
        `Record at index ${i} (id: ${record.id}) has corrupted structure hash (Helix B). ` +
        `Got: ${record.structureHash.slice(0, 16)}...`,
      );
      if (brokenAt === undefined) brokenAt = i;
      structureChainValid = false;
    }

    // Verify chain linkage (skip genesis)
    if (i > 0) {
      const previousRecord = ordered[i - 1];
      if (record.previousHash !== previousRecord.hash) {
        details.push(
          `Content chain broken at index ${i} (id: ${record.id}): previousHash does not match ` +
          `record at index ${i - 1} (id: ${previousRecord.id})`,
        );
        if (brokenAt === undefined) brokenAt = i;
        contentChainValid = false;
      }
      if (record.previousStructureHash !== previousRecord.structureHash) {
        details.push(
          `Structure chain broken at index ${i} (id: ${record.id}): previousStructureHash does not match ` +
          `record at index ${i - 1} (id: ${previousRecord.id})`,
        );
        if (brokenAt === undefined) brokenAt = i;
        structureChainValid = false;
      }
    }
  }

  const valid = details.length === 0;
  if (valid) {
    details.push(`Double-Helix integrity verified: ${ordered.length} records, Helix A \u2713, Helix B \u2713`);
  }

  return {
    valid,
    length: ordered.length,
    brokenAt,
    details,
    contentChainValid,
    structureChainValid,
  };
}

/**
 * Compute a content signature chain hash for a set of evidence records.
 *
 * Concatenates all content record hashes with a pipe separator and computes
 * an HMAC-SHA256 over the result.
 *
 * @param records - The evidence records to sign
 * @param hmacKey - The shared secret key for HMAC computation
 * @returns Hex-encoded HMAC-SHA256 signature chain hash (64 characters)
 */
export function computeSignatureChain(records: EvidenceRecord[], hmacKey: string): string {
  const hashes = records.map((r) => r.hash).join('|');
  return hmacSha256(hashes, hmacKey);
}

/**
 * Compute a structure signature chain hash for a set of evidence records.
 *
 * Concatenates all structure chain hashes with a pipe separator and computes
 * an HMAC-SHA256 using a domain-separated key.
 *
 * @param records - The evidence records to sign
 * @param hmacKey - The shared secret key for HMAC computation
 * @returns Hex-encoded HMAC-SHA256 structure signature chain hash (64 characters)
 */
export function computeStructureSignatureChain(records: EvidenceRecord[], hmacKey: string): string {
  const hashes = records.map((r) => r.structureHash).join('|');
  return hmacSha256(hashes, hmacKey + ':structure-signature');
}
