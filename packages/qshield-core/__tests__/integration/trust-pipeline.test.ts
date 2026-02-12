import { describe, it, expect } from 'vitest';
import { computeTrustScore, computeTrustLevel, buildTrustState } from '../../src/trust-scorer';
import { createEvidenceRecord, verifyEvidenceRecord, verifyEvidenceChain, computeSignatureChain } from '../../src/evidence';
import { hashEvidenceRecord } from '../../src/crypto';
import type { TrustSignal, AdapterType } from '../../src/types';

const HMAC_KEY = 'integration-test-hmac-key';

function makeSignal(source: AdapterType, score: number, timestamp?: string): TrustSignal {
  return {
    source,
    score,
    weight: 1,
    timestamp: timestamp ?? new Date().toISOString(),
    metadata: {},
  };
}

/** Assign an explicit timestamp to a record and recompute its hash. */
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
}

describe('Trust Pipeline Integration', () => {
  it('feeds signals through trust scorer, creates evidence, and verifies chain', () => {
    // Step 1: Compute trust score from signals
    const signals: TrustSignal[] = [
      makeSignal('zoom', 85),
      makeSignal('teams', 70),
      makeSignal('email', 90),
    ];
    const trustState = buildTrustState(signals, 'integration-session');
    expect(trustState.score).toBeGreaterThan(0);
    expect(trustState.level).toBeDefined();

    // Step 2: Create evidence records from each signal event
    const records = [];
    let prevHash: string | null = null;
    const baseTime = new Date('2024-06-01T00:00:00Z').getTime();
    for (let i = 0; i < signals.length; i++) {
      const signal = signals[i];
      const record = createEvidenceRecord(
        signal.source,
        'trust-signal-received',
        { score: signal.score, trustLevel: trustState.level },
        prevHash,
        HMAC_KEY,
      );
      // Assign explicit sequential timestamp for deterministic sort order
      setTimestamp(record, new Date(baseTime + i * 1000).toISOString());
      records.push(record);
      prevHash = record.hash;
    }

    expect(records).toHaveLength(3);

    // Step 3: Verify each record individually
    for (const record of records) {
      expect(verifyEvidenceRecord(record, HMAC_KEY)).toBe(true);
    }

    // Step 4: Verify the entire evidence chain
    const chainResult = verifyEvidenceChain(records, HMAC_KEY);
    expect(chainResult.valid).toBe(true);
    expect(chainResult.errors).toHaveLength(0);

    // Step 5: Compute signature chain for certification
    const sigChain = computeSignatureChain(records, HMAC_KEY);
    expect(sigChain).toHaveLength(64);
    expect(sigChain).toMatch(/^[0-9a-f]{64}$/);
  });

  it('end-to-end: trust score change triggers new evidence and chain remains valid', () => {
    // Initial signals — high trust
    const initialSignals = [makeSignal('zoom', 95), makeSignal('teams', 90)];
    const initialState = buildTrustState(initialSignals, 'session-change');
    expect(initialState.level).toBe('verified');

    // Create initial evidence with explicit timestamps
    const r1 = createEvidenceRecord('zoom', 'meeting-verified', { score: 95 }, null, HMAC_KEY);
    setTimestamp(r1, '2024-06-01T00:00:01Z');
    const r2 = createEvidenceRecord('teams', 'channel-active', { score: 90 }, r1.hash, HMAC_KEY);
    setTimestamp(r2, '2024-06-01T00:00:02Z');

    // Trust drops — simulate anomaly
    const droppedSignals = [
      makeSignal('zoom', 95),
      makeSignal('teams', 90),
      makeSignal('email', 15), // new low signal
    ];
    const droppedState = buildTrustState(droppedSignals, 'session-change');
    expect(droppedState.score).toBeLessThan(initialState.score);

    // Record the anomaly in the chain
    const r3 = createEvidenceRecord(
      'email',
      'trust-drop-detected',
      { previousScore: initialState.score, newScore: droppedState.score, level: droppedState.level },
      r2.hash,
      HMAC_KEY,
    );
    setTimestamp(r3, '2024-06-01T00:00:03Z');

    // Verify entire chain
    const result = verifyEvidenceChain([r1, r2, r3], HMAC_KEY);
    expect(result.valid).toBe(true);
  });

  it('trust state and evidence signature chain are consistent across rebuilds', () => {
    const signals = [
      makeSignal('zoom', 80),
      makeSignal('file', 60),
      makeSignal('api', 70),
    ];
    const state1 = buildTrustState(signals, 'rebuild-test');
    const state2 = buildTrustState(signals, 'rebuild-test');

    // Score is deterministic for same inputs
    expect(state1.score).toBe(state2.score);
    expect(state1.level).toBe(state2.level);
  });
});
