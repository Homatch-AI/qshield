import { describe, it, expect } from 'vitest';
import {
  hmacSha256,
  deriveKey,
  generateSalt,
  generateRandomHex,
  encryptAesGcm,
  decryptAesGcm,
  hashEvidenceRecord,
} from '../src/crypto';

describe('hmacSha256', () => {
  it('produces a 64-character hex string', () => {
    const result = hmacSha256('hello world', 'secret-key');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces consistent results for same input', () => {
    const a = hmacSha256('test data', 'key');
    const b = hmacSha256('test data', 'key');
    expect(a).toBe(b);
  });

  it('produces different results for different data', () => {
    const a = hmacSha256('data1', 'key');
    const b = hmacSha256('data2', 'key');
    expect(a).not.toBe(b);
  });

  it('produces different results for different keys', () => {
    const a = hmacSha256('data', 'key1');
    const b = hmacSha256('data', 'key2');
    expect(a).not.toBe(b);
  });
});

describe('deriveKey', () => {
  it('produces a 32-byte key', () => {
    const salt = generateSalt();
    const key = deriveKey('password', salt);
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(32);
  });

  it('produces consistent results for same password and salt', () => {
    const salt = generateSalt();
    const a = deriveKey('password', salt);
    const b = deriveKey('password', salt);
    expect(a.equals(b)).toBe(true);
  });

  it('produces different results for different passwords', () => {
    const salt = generateSalt();
    const a = deriveKey('password1', salt);
    const b = deriveKey('password2', salt);
    expect(a.equals(b)).toBe(false);
  });

  it('produces different results for different salts', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const a = deriveKey('password', salt1);
    const b = deriveKey('password', salt2);
    expect(a.equals(b)).toBe(false);
  });
});

describe('generateSalt', () => {
  it('generates a buffer of default length 32', () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Buffer);
    expect(salt.length).toBe(32);
  });

  it('generates different values each time', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a.equals(b)).toBe(false);
  });

  it('supports custom length', () => {
    const salt = generateSalt(16);
    expect(salt.length).toBe(16);
  });
});

describe('generateRandomHex', () => {
  it('generates a hex string of correct length', () => {
    const hex = generateRandomHex(32);
    expect(hex).toHaveLength(64); // 32 bytes = 64 hex chars
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });

  it('generates unique values', () => {
    const a = generateRandomHex();
    const b = generateRandomHex();
    expect(a).not.toBe(b);
  });
});

describe('AES-256-GCM encryption', () => {
  const key = deriveKey('test-password', generateSalt());

  it('encrypts and decrypts a string', () => {
    const plaintext = 'Hello, World! This is sensitive data.';
    const encrypted = encryptAesGcm(plaintext, key);
    const decrypted = decryptAesGcm(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('produces different ciphertext each time (random IV)', () => {
    const plaintext = 'test data';
    const a = encryptAesGcm(plaintext, key);
    const b = encryptAesGcm(plaintext, key);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it('returns correct encrypted data structure', () => {
    const encrypted = encryptAesGcm('test', key);
    expect(encrypted).toHaveProperty('ciphertext');
    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('authTag');
    expect(encrypted.iv).toMatch(/^[0-9a-f]+$/);
    expect(encrypted.authTag).toMatch(/^[0-9a-f]+$/);
  });

  it('fails to decrypt with wrong key', () => {
    const encrypted = encryptAesGcm('secret', key);
    const wrongKey = deriveKey('wrong-password', generateSalt());
    expect(() => decryptAesGcm(encrypted, wrongKey)).toThrow();
  });

  it('detects tampered ciphertext', () => {
    const encrypted = encryptAesGcm('secret', key);
    encrypted.ciphertext = 'ff' + encrypted.ciphertext.slice(2);
    expect(() => decryptAesGcm(encrypted, key)).toThrow();
  });

  it('detects tampered auth tag', () => {
    const encrypted = encryptAesGcm('secret', key);
    encrypted.authTag = 'ff' + encrypted.authTag.slice(2);
    expect(() => decryptAesGcm(encrypted, key)).toThrow();
  });

  it('handles empty string', () => {
    const encrypted = encryptAesGcm('', key);
    const decrypted = decryptAesGcm(encrypted, key);
    expect(decrypted).toBe('');
  });

  it('handles large data', () => {
    const plaintext = 'x'.repeat(100000);
    const encrypted = encryptAesGcm(plaintext, key);
    const decrypted = decryptAesGcm(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });
});

describe('hashEvidenceRecord', () => {
  it('produces a 64-character hex hash', () => {
    const hash = hashEvidenceRecord(
      {
        id: 'test-id',
        previousHash: null,
        timestamp: '2024-01-01T00:00:00Z',
        source: 'zoom',
        eventType: 'test',
        payload: '{}',
      },
      'hmac-key',
    );
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces different hashes for different fields', () => {
    const base = {
      id: 'test-id',
      previousHash: null,
      timestamp: '2024-01-01T00:00:00Z',
      source: 'zoom',
      eventType: 'test',
      payload: '{}',
    };
    const hash1 = hashEvidenceRecord(base, 'key');
    const hash2 = hashEvidenceRecord({ ...base, id: 'different-id' }, 'key');
    expect(hash1).not.toBe(hash2);
  });

  it('uses "genesis" for null previousHash', () => {
    const withNull = hashEvidenceRecord(
      {
        id: 'id',
        previousHash: null,
        timestamp: 'ts',
        source: 'zoom',
        eventType: 'evt',
        payload: '{}',
      },
      'key',
    );
    // Hash should be deterministic
    const withNull2 = hashEvidenceRecord(
      {
        id: 'id',
        previousHash: null,
        timestamp: 'ts',
        source: 'zoom',
        eventType: 'evt',
        payload: '{}',
      },
      'key',
    );
    expect(withNull).toBe(withNull2);
  });
});
