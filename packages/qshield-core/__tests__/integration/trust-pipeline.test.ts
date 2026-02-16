import { describe, it, expect } from 'vitest';
import {
  computeTrustScore,
  computeTrustLevel,
  buildTrustState,
  computeTrustDimensions,
  computeCompositeScore,
  ADAPTER_DIMENSION_MAP,
} from '../../src/trust-scorer';
import {
  createEvidenceRecord,
  verifyEvidenceRecord,
  verifyEvidenceChain,
  computeSignatureChain,
  computeStructureSignatureChain,
  computeVaultPosition,
  hashStructureRecord,
} from '../../src/evidence';
import { hashEvidenceRecord } from '../../src/crypto';
import type { TrustSignal, AdapterType } from '../../src/types';
import { TRUST_DIMENSION_KEYS } from '../../src/types';

const HMAC_KEY = 'integration-test-hmac-key';
const SESSION_ID = 'integration-session-001';

function makeSignal(source: AdapterType, score: number, timestamp?: string): TrustSignal {
  return {
    source,
    score,
    weight: 1,
    timestamp: timestamp ?? new Date().toISOString(),
    metadata: {},
  };
}

/** Assign an explicit timestamp to a record and recompute both hashes. */
function setTimestamp(
  record: ReturnType<typeof createEvidenceRecord>,
  ts: string,
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
    HMAC_KEY,
  );

  record.vaultPosition = computeVaultPosition(record.hash, SESSION_ID, ts, record.source, HMAC_KEY);

  record.structureHash = hashStructureRecord(
    {
      id: record.id,
      vaultPosition: record.vaultPosition,
      previousStructureHash: record.previousStructureHash,
      timestamp: ts,
      source: record.source,
      eventType: record.eventType,
    },
    HMAC_KEY,
  );
}

describe('Trust Pipeline Integration', () => {
  it('full pipeline: 5D scoring -> dual-chain evidence -> dual-path verification', () => {
    // Step 1: Compute 5D trust from signals
    const signals: TrustSignal[] = [
      makeSignal('zoom', 85),
      makeSignal('teams', 70),
      makeSignal('email', 90),
    ];
    const trustState = buildTrustState(signals, SESSION_ID);
    expect(trustState.score).toBeGreaterThan(0);
    expect(trustState.level).toBeDefined();
    expect(trustState.dimensions).toBeDefined();
    for (const key of TRUST_DIMENSION_KEYS) {
      expect(trustState.dimensions[key]).toBeTypeOf('number');
    }

    // Step 2: Create dual-chain evidence records
    const records = [];
    let prevHash: string | null = null;
    let prevStructureHash: string | null = null;
    const baseTime = new Date('2024-06-01T00:00:00Z').getTime();
    for (let i = 0; i < signals.length; i++) {
      const signal = signals[i];
      const record = createEvidenceRecord(
        signal.source,
        'trust-signal-received',
        { score: signal.score, trustLevel: trustState.level },
        prevHash,
        prevStructureHash,
        SESSION_ID,
        HMAC_KEY,
      );
      setTimestamp(record, new Date(baseTime + i * 1000).toISOString());
      records.push(record);
      prevHash = record.hash;
      prevStructureHash = record.structureHash;
    }

    expect(records).toHaveLength(3);

    // Step 3: Dual-path verify each record individually
    for (const record of records) {
      const result = verifyEvidenceRecord(record, SESSION_ID, HMAC_KEY);
      expect(result.contentValid).toBe(true);
      expect(result.structureValid).toBe(true);
      expect(result.fullyVerified).toBe(true);
    }

    // Step 4: Verify the entire dual evidence chain
    const chainResult = verifyEvidenceChain(records, SESSION_ID, HMAC_KEY);
    expect(chainResult.valid).toBe(true);
    expect(chainResult.errors).toHaveLength(0);

    // Step 5: Compute both signature chains
    const contentSig = computeSignatureChain(records, HMAC_KEY);
    expect(contentSig).toHaveLength(64);
    expect(contentSig).toMatch(/^[0-9a-f]{64}$/);

    const structureSig = computeStructureSignatureChain(records, HMAC_KEY);
    expect(structureSig).toHaveLength(64);
    expect(structureSig).toMatch(/^[0-9a-f]{64}$/);

    // Content and structure signatures must differ
    expect(contentSig).not.toBe(structureSig);
  });

  it('computeTrustDimensions maps different adapters to correct dimensions', () => {
    const signals: TrustSignal[] = [
      makeSignal('email', 50),   // -> temporal
      makeSignal('zoom', 70),    // -> contextual
      makeSignal('file', 60),    // -> cryptographic
      makeSignal('api', 80),     // -> spatial
      makeSignal('crypto', 90),  // -> behavioral
    ];

    const dims = computeTrustDimensions(signals);
    expect(dims.temporal).toBe(50);      // email
    expect(dims.contextual).toBe(70);    // zoom
    expect(dims.cryptographic).toBe(60); // file
    expect(dims.spatial).toBe(80);       // api
    expect(dims.behavioral).toBe(90);    // crypto

    // Verify mapping is correct
    expect(ADAPTER_DIMENSION_MAP.email).toBe('temporal');
    expect(ADAPTER_DIMENSION_MAP.zoom).toBe('contextual');
    expect(ADAPTER_DIMENSION_MAP.file).toBe('cryptographic');
    expect(ADAPTER_DIMENSION_MAP.api).toBe('spatial');
    expect(ADAPTER_DIMENSION_MAP.crypto).toBe('behavioral');
  });

  it('computeCompositeScore reflects dimension weights', () => {
    // All dimensions same → composite = same
    const uniformDims = { temporal: 80, contextual: 80, cryptographic: 80, spatial: 80, behavioral: 80 };
    expect(computeCompositeScore(uniformDims)).toBe(80);

    // Non-uniform → weighted average
    const mixedDims = { temporal: 100, contextual: 100, cryptographic: 0, spatial: 100, behavioral: 100 };
    const score = computeCompositeScore(mixedDims);
    // cryptographic weight is 0.25 out of 1.0, so score = 75
    expect(score).toBe(75);
  });

  it('end-to-end: trust score change triggers new evidence and dual chain remains valid', () => {
    // Initial signals — high trust
    const initialSignals = [makeSignal('zoom', 95), makeSignal('teams', 90)];
    const initialState = buildTrustState(initialSignals, SESSION_ID);
    expect(initialState.level).toBe('verified');

    // Create initial dual-chain evidence
    const r1 = createEvidenceRecord('zoom', 'meeting-verified', { score: 95 }, null, null, SESSION_ID, HMAC_KEY);
    setTimestamp(r1, '2024-06-01T00:00:01Z');
    const r2 = createEvidenceRecord('teams', 'channel-active', { score: 90 }, r1.hash, r1.structureHash, SESSION_ID, HMAC_KEY);
    setTimestamp(r2, '2024-06-01T00:00:02Z');

    // Trust drops — simulate anomaly
    const droppedSignals = [
      makeSignal('zoom', 95),
      makeSignal('teams', 90),
      makeSignal('email', 15),
    ];
    const droppedState = buildTrustState(droppedSignals, SESSION_ID);
    expect(droppedState.score).toBeLessThan(initialState.score);

    // Record the anomaly in the dual chain
    const r3 = createEvidenceRecord(
      'email',
      'trust-drop-detected',
      { previousScore: initialState.score, newScore: droppedState.score, level: droppedState.level },
      r2.hash,
      r2.structureHash,
      SESSION_ID,
      HMAC_KEY,
    );
    setTimestamp(r3, '2024-06-01T00:00:03Z');

    // Verify entire dual chain
    const result = verifyEvidenceChain([r1, r2, r3], SESSION_ID, HMAC_KEY);
    expect(result.valid).toBe(true);
  });

  it('trust state and evidence signature chains are consistent across rebuilds', () => {
    const signals = [
      makeSignal('zoom', 80),
      makeSignal('file', 60),
      makeSignal('api', 70),
    ];
    const state1 = buildTrustState(signals, 'rebuild-test');
    const state2 = buildTrustState(signals, 'rebuild-test');

    // Score and dimensions are deterministic for same inputs
    expect(state1.score).toBe(state2.score);
    expect(state1.level).toBe(state2.level);
    expect(state1.dimensions).toEqual(state2.dimensions);
  });

  it('computeSignatureChain and computeStructureSignatureChain produce different outputs', () => {
    const records = [];
    let prevHash: string | null = null;
    let prevStructureHash: string | null = null;
    const baseTime = new Date('2024-06-01T00:00:00Z').getTime();
    for (let i = 0; i < 5; i++) {
      const record = createEvidenceRecord(
        'zoom',
        `event-${i}`,
        { index: i },
        prevHash,
        prevStructureHash,
        SESSION_ID,
        HMAC_KEY,
      );
      setTimestamp(record, new Date(baseTime + i * 1000).toISOString());
      records.push(record);
      prevHash = record.hash;
      prevStructureHash = record.structureHash;
    }

    const contentSig = computeSignatureChain(records, HMAC_KEY);
    const structureSig = computeStructureSignatureChain(records, HMAC_KEY);
    expect(contentSig).not.toBe(structureSig);
    expect(contentSig).toHaveLength(64);
    expect(structureSig).toHaveLength(64);
  });
});
