import { hmacSha256, constantTimeEqual } from '@qshield/core';

export interface ChainVerificationResult {
  valid: boolean;
  recordCount: number;
  brokenAt?: number;
  details: string[];
  serverVerifiedAt: string;
  serverSignature: string;
}

export class EvidenceVerifier {
  private serverHmacKey: string;

  constructor(serverHmacKey?: string) {
    this.serverHmacKey = serverHmacKey || process.env.QSHIELD_SERVER_HMAC_KEY || 'qshield-gateway-hmac-v1';
  }

  /**
   * Verify an evidence chain submitted by a desktop client.
   *
   * 1. Walk the chain from genesis (previousHash === null)
   * 2. Recompute each record's HMAC-SHA256 hash
   * 3. Verify chain linking (each record's previousHash matches the previous record's hash)
   * 4. If valid, compute a server-side attestation signature
   */
  verifyChain(records: EvidenceChainRecord[], clientHmacKey: string): ChainVerificationResult {
    const ordered = this.orderByChain(records);
    const details: string[] = [];
    let brokenAt: number | undefined;

    if (ordered.length === 0) {
      return {
        valid: true, recordCount: 0, details: ['Empty chain'],
        serverVerifiedAt: new Date().toISOString(), serverSignature: '',
      };
    }

    // Check genesis — previousHash should be null (or undefined) for first record
    const genesisPrev = ordered[0].previousHash ?? ordered[0].previous_hash;
    if (genesisPrev != null) {
      details.push('Genesis record has non-null previousHash');
      brokenAt = 0;
    }

    for (let i = 0; i < ordered.length; i++) {
      const record = ordered[i];

      // Recompute hash
      const expectedHash = this.recomputeHash(record, clientHmacKey);
      if (!constantTimeEqual(record.hash, expectedHash)) {
        details.push(`Record ${i} (${record.id}): hash mismatch`);
        if (brokenAt === undefined) brokenAt = i;
      }

      // Check chain link
      if (i > 0) {
        const prev = record.previousHash ?? record.previous_hash;
        if (prev !== ordered[i - 1].hash) {
          details.push(`Record ${i} (${record.id}): broken chain link`);
          if (brokenAt === undefined) brokenAt = i;
        }
      }
    }

    const valid = details.length === 0;
    const serverVerifiedAt = new Date().toISOString();

    // Server attestation: HMAC over all record hashes + verification timestamp
    const attestationData = ordered.map(r => r.hash).join('|') + '|' + serverVerifiedAt;
    const serverSignature = hmacSha256(attestationData, this.serverHmacKey);

    if (valid) {
      details.push(`Chain verified: ${ordered.length} records, all hashes valid`);
    }

    return { valid, recordCount: ordered.length, brokenAt, details, serverVerifiedAt, serverSignature };
  }

  /**
   * Verify a certificate's signatureChain against stored evidence.
   */
  verifyCertificate(signatureChain: string, evidenceHashes: string[], clientHmacKey: string): { valid: boolean; details: string[] } {
    const expectedChain = hmacSha256(evidenceHashes.join('|'), clientHmacKey);
    const valid = constantTimeEqual(signatureChain, expectedChain);
    return {
      valid,
      details: valid
        ? [`Certificate signature valid (${evidenceHashes.length} evidence records)`]
        : [`Certificate signature mismatch`],
    };
  }

  private recomputeHash(record: EvidenceChainRecord, hmacKey: string): string {
    const prev = record.previousHash ?? record.previous_hash ?? 'genesis';
    const eventType = record.eventType ?? record.event_type ?? 'unknown';
    const payload = typeof record.payload === 'string' ? record.payload : JSON.stringify(record.payload);
    const data = [record.id, prev, record.timestamp, record.source, eventType, payload].join('|');
    return hmacSha256(data, hmacKey);
  }

  private orderByChain(records: EvidenceChainRecord[]): EvidenceChainRecord[] {
    if (records.length <= 1) return [...records];

    const genesis = records.find(r => (r.previousHash ?? r.previous_hash) == null);
    if (!genesis) {
      return [...records].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    const byPrevHash = new Map<string, EvidenceChainRecord>();
    for (const r of records) {
      const prev = r.previousHash ?? r.previous_hash;
      if (prev !== null && prev !== undefined) byPrevHash.set(prev, r);
    }

    const ordered = [genesis];
    let current = genesis;
    while (ordered.length < records.length) {
      const next = byPrevHash.get(current.hash);
      if (!next) break;
      ordered.push(next);
      current = next;
    }

    return ordered;
  }
}

// Flexible record type to accept both camelCase (desktop) and snake_case (DB) fields
export interface EvidenceChainRecord {
  id: string;
  hash: string;
  previousHash?: string | null;
  previous_hash?: string | null;
  timestamp: string;
  source: string;
  eventType?: string;
  event_type?: string;
  payload: string | Record<string, unknown>;
  [key: string]: unknown;
}
