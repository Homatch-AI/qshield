import { describe, it, expect } from 'vitest';
import {
  deriveKey,
  generateSalt,
  encryptAesGcm,
  decryptAesGcm,
  hmacSha256,
  hashEvidenceRecord,
} from '../../src/crypto';
import { createEvidenceRecord, verifyEvidenceRecord } from '../../src/evidence';

describe('Crypto-Storage Integration', () => {
  it('encrypt -> store -> retrieve -> decrypt round trip', () => {
    // Step 1: Derive a key from a password
    const salt = generateSalt();
    const key = deriveKey('user-password-123', salt);

    // Step 2: Create some data to store
    const sensitiveData = JSON.stringify({
      trustScore: 85,
      signals: [
        { source: 'zoom', score: 90 },
        { source: 'teams', score: 80 },
      ],
      sessionId: 'session-xyz',
    });

    // Step 3: Encrypt the data
    const encrypted = encryptAesGcm(sensitiveData, key);
    expect(encrypted.ciphertext).toBeTruthy();
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();

    // Step 4: Simulate storage (serialize to JSON)
    const stored = JSON.stringify({
      salt: salt.toString('hex'),
      encrypted,
    });

    // Step 5: Simulate retrieval (deserialize from JSON)
    const retrieved = JSON.parse(stored);
    const retrievedSalt = Buffer.from(retrieved.salt, 'hex');
    const retrievedKey = deriveKey('user-password-123', retrievedSalt);

    // Step 6: Decrypt the data
    const decrypted = decryptAesGcm(retrieved.encrypted, retrievedKey);
    expect(JSON.parse(decrypted)).toEqual(JSON.parse(sensitiveData));
  });

  it('encrypt evidence record payload and verify integrity after decryption', () => {
    const HMAC_KEY = 'test-hmac-key';
    const encKey = deriveKey('enc-pass', generateSalt());

    // Create an evidence record
    const record = createEvidenceRecord(
      'zoom',
      'meeting-encrypted',
      { meetingId: 'abc', participants: ['alice', 'bob'] },
      null,
      null,
      'crypto-test-session',
      HMAC_KEY,
    );

    // Encrypt the payload
    const payloadStr = JSON.stringify(record.payload);
    const encrypted = encryptAesGcm(payloadStr, encKey);

    // Simulate storing encrypted payload alongside the record
    const storedRecord = {
      ...record,
      encryptedPayload: encrypted,
    };

    // Decrypt and verify
    const decryptedPayload = decryptAesGcm(storedRecord.encryptedPayload, encKey);
    expect(JSON.parse(decryptedPayload)).toEqual(record.payload);

    // Original record should still verify
    const verifyResult = verifyEvidenceRecord(record, 'crypto-test-session', HMAC_KEY);
    expect(verifyResult.fullyVerified).toBe(true);
  });

  it('wrong password fails to decrypt stored data', () => {
    const salt = generateSalt();
    const key = deriveKey('correct-password', salt);
    const encrypted = encryptAesGcm('secret data', key);

    // Try to decrypt with wrong password
    const wrongKey = deriveKey('wrong-password', salt);
    expect(() => decryptAesGcm(encrypted, wrongKey)).toThrow();
  });

  it('same salt + same password always derives the same key', () => {
    const salt = generateSalt();
    const key1 = deriveKey('same-password', salt);
    const key2 = deriveKey('same-password', salt);

    expect(key1.equals(key2)).toBe(true);

    // Both keys can decrypt the same data
    const encrypted = encryptAesGcm('test payload', key1);
    const decrypted = decryptAesGcm(encrypted, key2);
    expect(decrypted).toBe('test payload');
  });

  it('HMAC integrity check works across serialize/deserialize', () => {
    const data = 'important evidence data';
    const key = 'hmac-verification-key';

    const mac = hmacSha256(data, key);

    // Simulate storage
    const stored = JSON.stringify({ data, mac });
    const retrieved = JSON.parse(stored);

    // Verify integrity
    const computedMac = hmacSha256(retrieved.data, key);
    expect(computedMac).toBe(retrieved.mac);

    // Tamper and verify detection
    retrieved.data = 'tampered data';
    const tamperedMac = hmacSha256(retrieved.data, key);
    expect(tamperedMac).not.toBe(retrieved.mac);
  });
});
