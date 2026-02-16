import { describe, it, expect } from 'vitest';
import { computeTrustScore, buildTrustState } from '../../src/trust-scorer';
import { evaluatePolicy, createDefaultPolicy } from '../../src/policy-rules';
import {
  createEvidenceRecord,
  verifyEvidenceChain,
  computeSignatureChain,
  computeVaultPosition,
  hashStructureRecord,
} from '../../src/evidence';
import { hashEvidenceRecord } from '../../src/crypto';
import type { TrustSignal, AdapterType, PolicyConfig } from '../../src/types';

const HMAC_KEY = 'policy-integration-key';
const SESSION_ID = 'policy-session';

function makeSignal(source: AdapterType, score: number): TrustSignal {
  return {
    source,
    score,
    weight: 1,
    timestamp: new Date().toISOString(),
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

describe('Policy Evaluation Integration', () => {
  it('signal -> policy evaluation -> alert generation pipeline', () => {
    // Step 1: Incoming signals
    const signals = [
      makeSignal('zoom', 20), // critically low
      makeSignal('teams', 60),
    ];

    // Step 2: Build trust state
    const trustState = buildTrustState(signals, 'policy-session');
    expect(trustState.score).toBeDefined();

    // Step 3: Evaluate against default policy
    const policy = createDefaultPolicy();
    const result = evaluatePolicy(policy, trustState);

    // Step 4: Verify alerts were generated for low zoom score
    expect(result.triggeredRules.length).toBeGreaterThan(0);
    expect(result.alerts.length).toBeGreaterThan(0);

    // Verify alert structure
    for (const alert of result.alerts) {
      expect(alert.id).toBeTruthy();
      expect(alert.severity).toBeTruthy();
      expect(alert.title).toBeTruthy();
      expect(alert.dismissed).toBe(false);
    }
  });

  it('high trust signals produce no alerts with default policy', () => {
    const signals = [
      makeSignal('zoom', 95),
      makeSignal('teams', 90),
      makeSignal('email', 85),
    ];
    const trustState = buildTrustState(signals, 'safe-session');
    const policy = createDefaultPolicy();
    const result = evaluatePolicy(policy, trustState);

    expect(result.triggeredRules).toHaveLength(0);
    expect(result.alerts).toHaveLength(0);
    expect(result.shouldFreeze).toBe(false);
    expect(result.shouldEscalate).toBe(false);
  });

  it('auto-freeze triggers when overall trust score is critically low', () => {
    const signals = [
      makeSignal('zoom', 5),     // contextual
      makeSignal('teams', 10),   // contextual (averaged)
      makeSignal('email', 8),    // temporal
      makeSignal('file', 5),     // cryptographic
      makeSignal('api', 5),      // spatial
      makeSignal('crypto', 5),   // behavioral
    ];
    const trustState = buildTrustState(signals, 'freeze-session');

    const policy = createDefaultPolicy();
    // Trust score should be very low across all 5 dimensions
    expect(trustState.score).toBeLessThan(20);

    const result = evaluatePolicy(policy, trustState);
    expect(result.shouldFreeze).toBe(true);
  });

  it('complete pipeline: signals -> trust -> policy -> evidence -> verification', () => {
    // Step 1: Signals come in
    const signals = [
      makeSignal('zoom', 25),
      makeSignal('email', 35),
    ];

    // Step 2: Compute trust
    const trustState = buildTrustState(signals, 'full-pipeline');

    // Step 3: Evaluate policy
    const policy = createDefaultPolicy();
    const policyResult = evaluatePolicy(policy, trustState);

    // Step 4: Record everything as evidence with explicit timestamps
    const records = [];
    let prevHash: string | null = null;
    let prevStructureHash: string | null = null;
    const baseTime = new Date('2024-06-01T00:00:00Z').getTime();
    let recordIndex = 0;

    // Record the trust state
    const trustRecord = createEvidenceRecord(
      'api',
      'trust-computed',
      { score: trustState.score, level: trustState.level },
      prevHash,
      prevStructureHash,
      SESSION_ID,
      HMAC_KEY,
    );
    setTimestamp(trustRecord, new Date(baseTime + recordIndex++ * 1000).toISOString());
    records.push(trustRecord);
    prevHash = trustRecord.hash;
    prevStructureHash = trustRecord.structureHash;

    // Record each triggered alert
    for (const alert of policyResult.alerts) {
      const alertRecord = createEvidenceRecord(
        alert.source,
        'policy-alert',
        { alertId: alert.id, severity: alert.severity, title: alert.title },
        prevHash,
        prevStructureHash,
        SESSION_ID,
        HMAC_KEY,
      );
      setTimestamp(alertRecord, new Date(baseTime + recordIndex++ * 1000).toISOString());
      records.push(alertRecord);
      prevHash = alertRecord.hash;
      prevStructureHash = alertRecord.structureHash;
    }

    // Step 5: Verify the complete evidence chain
    const chainResult = verifyEvidenceChain(records, SESSION_ID, HMAC_KEY);
    expect(chainResult.valid).toBe(true);

    // Step 6: Generate a signature chain
    const sigChain = computeSignatureChain(records, HMAC_KEY);
    expect(sigChain).toHaveLength(64);
  });

  it('custom policy configuration evaluates correctly', () => {
    const customPolicy: PolicyConfig = {
      rules: [
        {
          id: 'custom-1',
          name: 'Strict email monitoring',
          condition: { signal: 'email', operator: 'lt', threshold: 80 },
          action: 'alert',
          severity: 'medium',
          enabled: true,
        },
        {
          id: 'custom-2',
          name: 'Teams freeze',
          condition: { signal: 'teams', operator: 'lt', threshold: 30 },
          action: 'freeze',
          severity: 'critical',
          enabled: true,
        },
      ],
      escalation: { channels: ['webhook'], cooldownMinutes: 5 },
      autoFreeze: { enabled: true, trustScoreThreshold: 15, durationMinutes: 60 },
    };

    // Scenario: email low, teams fine
    const signals1 = [makeSignal('email', 50), makeSignal('teams', 70)];
    const state1 = buildTrustState(signals1, 'custom-1');
    const result1 = evaluatePolicy(customPolicy, state1);
    expect(result1.triggeredRules).toHaveLength(1);
    expect(result1.triggeredRules[0].id).toBe('custom-1');
    expect(result1.shouldFreeze).toBe(false);

    // Scenario: teams critically low
    const signals2 = [makeSignal('email', 90), makeSignal('teams', 10)];
    const state2 = buildTrustState(signals2, 'custom-2');
    const result2 = evaluatePolicy(customPolicy, state2);
    expect(result2.shouldFreeze).toBe(true);
  });
});
