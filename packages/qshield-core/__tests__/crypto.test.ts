import { describe, it, expect } from 'vitest';
import {
  hmacSha256,
  deriveKey,
  generateSalt,
  generateRandomHex,
  generateSecureRandom,
  constantTimeEqual,
  encryptAesGcm,
  decryptAesGcm,
  rotateKey,
  hashEvidenceRecord,
} from '../src/crypto';

// ---------------------------------------------------------------------------
// hmacSha256
// ---------------------------------------------------------------------------

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

  it('handles empty data', () => {
    const result = hmacSha256('', 'key');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it('handles empty key', () => {
    const result = hmacSha256('data', '');
    expect(result).toHaveLength(64);
  });

  // RFC 4231 Test Vector 2
  it('matches known HMAC-SHA256 test vector (RFC 4231 case 2)', () => {
    const key = 'Jefe';
    const data = 'what do ya want for nothing?';
    const result = hmacSha256(data, key);
    expect(result).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
});

// ---------------------------------------------------------------------------
// deriveKey (PBKDF2)
// ---------------------------------------------------------------------------

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

  it('takes measurable time for brute-force resistance', () => {
    const salt = generateSalt();
    const start = performance.now();
    deriveKey('test-password', salt);
    const elapsed = performance.now() - start;
    // Should take at least 10ms with 100k iterations
    expect(elapsed).toBeGreaterThan(10);
  });

  it('handles empty password', () => {
    const salt = generateSalt();
    const key = deriveKey('', salt);
    expect(key.length).toBe(32);
  });

  it('handles long password', () => {
    const salt = generateSalt();
    const key = deriveKey('a'.repeat(10000), salt);
    expect(key.length).toBe(32);
  });
});

// ---------------------------------------------------------------------------
// generateSalt
// ---------------------------------------------------------------------------

describe('generateSalt', () => {
  it('generates a buffer of default length 16', () => {
    const salt = generateSalt();
    expect(salt).toBeInstanceOf(Buffer);
    expect(salt.length).toBe(16);
  });

  it('generates different values each time', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a.equals(b)).toBe(false);
  });

  it('supports custom length', () => {
    expect(generateSalt(32).length).toBe(32);
    expect(generateSalt(8).length).toBe(8);
  });

  it('generates sufficient entropy — no repeated salts in 1000 generations', () => {
    const salts = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      salts.add(generateSalt().toString('hex'));
    }
    expect(salts.size).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// generateRandomHex
// ---------------------------------------------------------------------------

describe('generateRandomHex', () => {
  it('generates a hex string of correct length', () => {
    const hex = generateRandomHex(32);
    expect(hex).toHaveLength(64);
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });

  it('generates unique values', () => {
    const a = generateRandomHex();
    const b = generateRandomHex();
    expect(a).not.toBe(b);
  });

  it('supports custom byte lengths', () => {
    expect(generateRandomHex(16)).toHaveLength(32);
    expect(generateRandomHex(8)).toHaveLength(16);
    expect(generateRandomHex(1)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// generateSecureRandom
// ---------------------------------------------------------------------------

describe('generateSecureRandom', () => {
  it('generates buffer of requested size', () => {
    expect(generateSecureRandom(16).length).toBe(16);
    expect(generateSecureRandom(32).length).toBe(32);
  });

  it('generates zero-length buffer', () => {
    expect(generateSecureRandom(0).length).toBe(0);
  });

  it('throws for negative bytes', () => {
    expect(() => generateSecureRandom(-1)).toThrow(RangeError);
  });

  it('throws for non-integer bytes', () => {
    expect(() => generateSecureRandom(1.5)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// constantTimeEqual
// ---------------------------------------------------------------------------

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(constantTimeEqual('abc', 'xyz')).toBe(false);
  });

  it('returns false for different length strings', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });

  it('works with buffers', () => {
    const a = Buffer.from('hello');
    const b = Buffer.from('hello');
    expect(constantTimeEqual(a, b)).toBe(true);
    expect(constantTimeEqual(a, Buffer.from('world'))).toBe(false);
  });

  it('returns true for empty strings', () => {
    expect(constantTimeEqual('', '')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AES-256-GCM encryption
// ---------------------------------------------------------------------------

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

  it('IV is 12 bytes (24 hex chars)', () => {
    const encrypted = encryptAesGcm('test', key);
    expect(encrypted.iv).toHaveLength(24);
  });

  it('auth tag is 16 bytes (32 hex chars)', () => {
    const encrypted = encryptAesGcm('test', key);
    expect(encrypted.authTag).toHaveLength(32);
  });

  it('fails to decrypt with wrong key', () => {
    const encrypted = encryptAesGcm('secret', key);
    const wrongKey = deriveKey('wrong-password', generateSalt());
    expect(() => decryptAesGcm(encrypted, wrongKey)).toThrow();
  });

  it('handles empty string', () => {
    const encrypted = encryptAesGcm('', key);
    const decrypted = decryptAesGcm(encrypted, key);
    expect(decrypted).toBe('');
  });

  it('handles large data (100KB)', () => {
    const plaintext = 'x'.repeat(100_000);
    const encrypted = encryptAesGcm(plaintext, key);
    const decrypted = decryptAesGcm(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('handles large data (1MB)', () => {
    const plaintext = 'A'.repeat(1_000_000);
    const encrypted = encryptAesGcm(plaintext, key);
    const decrypted = decryptAesGcm(encrypted, key);
    expect(decrypted.length).toBe(1_000_000);
  });

  it('handles JSON payload', () => {
    const payload = JSON.stringify({ key: 'value', nested: { array: [1, 2, 3] } });
    const encrypted = encryptAesGcm(payload, key);
    const decrypted = decryptAesGcm(encrypted, key);
    expect(JSON.parse(decrypted)).toEqual(JSON.parse(payload));
  });

  it('all IVs are unique across 1000 encryptions', () => {
    const ivSet = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const encrypted = encryptAesGcm('test', key);
      ivSet.add(encrypted.iv);
    }
    expect(ivSet.size).toBe(1000);
  });

  it('detects tampered ciphertext', () => {
    const encrypted = encryptAesGcm('secret', key);
    encrypted.ciphertext = 'ff' + encrypted.ciphertext.slice(2);
    expect(() => decryptAesGcm(encrypted, key)).toThrow();
  });

  it('detects tampered IV', () => {
    const encrypted = encryptAesGcm('secret', key);
    encrypted.iv = 'ff' + encrypted.iv.slice(2);
    expect(() => decryptAesGcm(encrypted, key)).toThrow();
  });

  it('detects tampered auth tag', () => {
    const encrypted = encryptAesGcm('secret', key);
    // Flip every hex digit to ensure a different auth tag
    encrypted.authTag = encrypted.authTag.split('').map(c => c === 'f' ? '0' : 'f').join('');
    expect(() => decryptAesGcm(encrypted, key)).toThrow();
  });

  it('detects completely replaced ciphertext', () => {
    const encrypted = encryptAesGcm('original data', key);
    encrypted.ciphertext = 'ab'.repeat(encrypted.ciphertext.length / 2);
    expect(() => decryptAesGcm(encrypted, key)).toThrow();
  });

  it('detects truncated ciphertext', () => {
    const encrypted = encryptAesGcm('a longer secret message', key);
    encrypted.ciphertext = encrypted.ciphertext.slice(0, encrypted.ciphertext.length / 2);
    expect(() => decryptAesGcm(encrypted, key)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// rotateKey
// ---------------------------------------------------------------------------

describe('rotateKey', () => {
  it('re-encrypts items with new key', () => {
    const oldKey = deriveKey('old-pass', generateSalt());
    const newKey = deriveKey('new-pass', generateSalt());

    const items = [
      encryptAesGcm('secret-1', oldKey),
      encryptAesGcm('secret-2', oldKey),
    ];

    const rotated = rotateKey(items, oldKey, newKey);
    expect(rotated).toHaveLength(2);

    // Old key can't decrypt rotated items
    expect(() => decryptAesGcm(rotated[0], oldKey)).toThrow();

    // New key can decrypt rotated items
    expect(decryptAesGcm(rotated[0], newKey)).toBe('secret-1');
    expect(decryptAesGcm(rotated[1], newKey)).toBe('secret-2');
  });

  it('handles empty array', () => {
    const oldKey = deriveKey('old', generateSalt());
    const newKey = deriveKey('new', generateSalt());
    expect(rotateKey([], oldKey, newKey)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hashEvidenceRecord
// ---------------------------------------------------------------------------

describe('hashEvidenceRecord', () => {
  it('produces a 64-character hex hash', () => {
    const hash = hashEvidenceRecord(
      { id: 'test-id', previousHash: null, timestamp: '2024-01-01T00:00:00Z', source: 'zoom', eventType: 'test', payload: '{}' },
      'hmac-key',
    );
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for same input', () => {
    const fields = { id: 'id', previousHash: null, timestamp: 'ts', source: 'zoom', eventType: 'evt', payload: '{}' };
    expect(hashEvidenceRecord(fields, 'key')).toBe(hashEvidenceRecord(fields, 'key'));
  });

  it('produces different hashes for different IDs', () => {
    const base = { id: 'a', previousHash: null, timestamp: 'ts', source: 'zoom', eventType: 'evt', payload: '{}' };
    expect(hashEvidenceRecord(base, 'key')).not.toBe(
      hashEvidenceRecord({ ...base, id: 'b' }, 'key'),
    );
  });

  it('produces different hashes for different keys', () => {
    const fields = { id: 'id', previousHash: null, timestamp: 'ts', source: 'zoom', eventType: 'evt', payload: '{}' };
    expect(hashEvidenceRecord(fields, 'key1')).not.toBe(hashEvidenceRecord(fields, 'key2'));
  });

  it('null and non-null previousHash produce different hashes', () => {
    const fields = { id: 'id', timestamp: 'ts', source: 'zoom', eventType: 'evt', payload: '{}' };
    expect(hashEvidenceRecord({ ...fields, previousHash: null }, 'key')).not.toBe(
      hashEvidenceRecord({ ...fields, previousHash: 'abc' }, 'key'),
    );
  });
});
