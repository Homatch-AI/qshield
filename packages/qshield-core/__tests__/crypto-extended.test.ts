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

// ── Key Derivation (PBKDF2) ────────────────────────────────────────────────

describe('deriveKey (PBKDF2)', () => {
  it('same password + same salt → same key', () => {
    const salt = Buffer.from('fixed-salt-16bytes!', 'utf8').subarray(0, 16);
    const key1 = deriveKey('my-password', salt);
    const key2 = deriveKey('my-password', salt);
    expect(key1.equals(key2)).toBe(true);
  });

  it('same password + different salt → different key', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const key1 = deriveKey('my-password', salt1);
    const key2 = deriveKey('my-password', salt2);
    expect(key1.equals(key2)).toBe(false);
  });

  it('different password + same salt → different key', () => {
    const salt = generateSalt();
    const key1 = deriveKey('password-a', salt);
    const key2 = deriveKey('password-b', salt);
    expect(key1.equals(key2)).toBe(false);
  });

  it('derived key is 32 bytes (256 bits)', () => {
    const salt = generateSalt();
    const key = deriveKey('test-password', salt);
    expect(key.length).toBe(32);
  });
});

// ── AES-256-GCM Encryption/Decryption ───────────────────────────────────────

describe('AES-256-GCM', () => {
  const key = deriveKey('test-key', Buffer.alloc(16, 0));

  it('round trip: encrypt then decrypt returns original plaintext', () => {
    const plaintext = 'Hello, QShield!';
    const encrypted = encryptAesGcm(plaintext, key);
    const decrypted = decryptAesGcm(encrypted, key);
    expect(decrypted).toBe(plaintext);
  });

  it('two encryptions of same plaintext produce different ciphertexts (unique IVs)', () => {
    const plaintext = 'same data';
    const enc1 = encryptAesGcm(plaintext, key);
    const enc2 = encryptAesGcm(plaintext, key);
    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });

  it('tamper with ciphertext → decryption throws', () => {
    const encrypted = encryptAesGcm('secret data', key);
    encrypted.ciphertext = 'ff' + encrypted.ciphertext.slice(2);
    expect(() => decryptAesGcm(encrypted, key)).toThrow();
  });

  it('tamper with authTag → decryption throws', () => {
    const encrypted = encryptAesGcm('secret data', key);
    // Flip every hex digit to ensure a different auth tag
    encrypted.authTag = encrypted.authTag.split('').map(c => c === 'f' ? '0' : 'f').join('');
    expect(() => decryptAesGcm(encrypted, key)).toThrow();
  });

  it('tamper with IV → decryption throws', () => {
    const encrypted = encryptAesGcm('secret data', key);
    encrypted.iv = 'ff' + encrypted.iv.slice(2);
    expect(() => decryptAesGcm(encrypted, key)).toThrow();
  });

  it('wrong key → decryption throws', () => {
    const encrypted = encryptAesGcm('secret data', key);
    const wrongKey = deriveKey('wrong-key', Buffer.alloc(16, 1));
    expect(() => decryptAesGcm(encrypted, wrongKey)).toThrow();
  });

  it('encrypt empty string → still produces valid encrypted data', () => {
    const encrypted = encryptAesGcm('', key);
    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();
    const decrypted = decryptAesGcm(encrypted, key);
    expect(decrypted).toBe('');
  });

  it('encrypt large payload (10KB) → round trip succeeds', () => {
    const plaintext = 'X'.repeat(10240);
    const encrypted = encryptAesGcm(plaintext, key);
    const decrypted = decryptAesGcm(encrypted, key);
    expect(decrypted).toBe(plaintext);
    expect(decrypted.length).toBe(10240);
  });
});

// ── Key Rotation ────────────────────────────────────────────────────────────

describe('rotateKey', () => {
  const oldKey = deriveKey('old-key', Buffer.alloc(16, 0));
  const newKey = deriveKey('new-key', Buffer.alloc(16, 1));

  it('rotate 1 item: decrypt with new key produces original plaintext', () => {
    const original = 'secret message';
    const encrypted = encryptAesGcm(original, oldKey);
    const rotated = rotateKey([encrypted], oldKey, newKey);
    expect(rotated).toHaveLength(1);
    const decrypted = decryptAesGcm(rotated[0], newKey);
    expect(decrypted).toBe(original);
  });

  it('rotate 3 items: all decrypt correctly with new key', () => {
    const items = ['alpha', 'beta', 'gamma'].map(t => encryptAesGcm(t, oldKey));
    const rotated = rotateKey(items, oldKey, newKey);
    expect(rotated).toHaveLength(3);
    expect(decryptAesGcm(rotated[0], newKey)).toBe('alpha');
    expect(decryptAesGcm(rotated[1], newKey)).toBe('beta');
    expect(decryptAesGcm(rotated[2], newKey)).toBe('gamma');
  });

  it('old key can no longer decrypt rotated items', () => {
    const encrypted = encryptAesGcm('secret', oldKey);
    const rotated = rotateKey([encrypted], oldKey, newKey);
    expect(() => decryptAesGcm(rotated[0], oldKey)).toThrow();
  });

  it('empty array rotation → returns empty array', () => {
    const rotated = rotateKey([], oldKey, newKey);
    expect(rotated).toEqual([]);
  });
});

// ── Constant-Time Comparison ────────────────────────────────────────────────

describe('constantTimeEqual', () => {
  it('equal strings → true', () => {
    expect(constantTimeEqual('hello', 'hello')).toBe(true);
  });

  it('different strings → false', () => {
    expect(constantTimeEqual('hello', 'world')).toBe(false);
  });

  it('different lengths → false', () => {
    expect(constantTimeEqual('short', 'longer-string')).toBe(false);
  });

  it('buffer vs string → works correctly', () => {
    const buf = Buffer.from('test', 'utf8');
    expect(constantTimeEqual(buf, 'test')).toBe(true);
    expect(constantTimeEqual(buf, 'nope')).toBe(false);
  });

  it('empty strings → true', () => {
    expect(constantTimeEqual('', '')).toBe(true);
  });
});

// ── Secure Random ───────────────────────────────────────────────────────────

describe('Secure Random Generation', () => {
  it('generateSalt() default → 16 bytes', () => {
    const salt = generateSalt();
    expect(salt.length).toBe(16);
  });

  it('generateSalt(32) → 32 bytes', () => {
    const salt = generateSalt(32);
    expect(salt.length).toBe(32);
  });

  it('two calls produce different values', () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(a.equals(b)).toBe(false);
  });

  it('generateRandomHex() → 64-char hex string', () => {
    const hex = generateRandomHex();
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generateRandomHex(16) → 32-char hex string', () => {
    const hex = generateRandomHex(16);
    expect(hex).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generateSecureRandom(0) → empty buffer', () => {
    const buf = generateSecureRandom(0);
    expect(buf.length).toBe(0);
  });

  it('generateSecureRandom(-1) → throws RangeError', () => {
    expect(() => generateSecureRandom(-1)).toThrow(RangeError);
  });
});

// ── Evidence Record Hashing ─────────────────────────────────────────────────

describe('hashEvidenceRecord', () => {
  it('null previousHash uses genesis sentinel', () => {
    const h1 = hashEvidenceRecord({
      id: 'id-1', previousHash: null, timestamp: 'ts', source: 'email', eventType: 'test', payload: '{}',
    }, 'key');
    // Should not throw and produce valid hex
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deterministic for same inputs', () => {
    const fields = { id: 'id-1', previousHash: 'prev', timestamp: 'ts', source: 'email', eventType: 'test', payload: '{}' };
    const h1 = hashEvidenceRecord(fields, 'key');
    const h2 = hashEvidenceRecord(fields, 'key');
    expect(h1).toBe(h2);
  });

  it('different fields → different hash', () => {
    const base = { id: 'id-1', previousHash: 'prev', timestamp: 'ts', source: 'email', eventType: 'test', payload: '{}' };
    const h1 = hashEvidenceRecord(base, 'key');
    const h2 = hashEvidenceRecord({ ...base, eventType: 'different' }, 'key');
    expect(h1).not.toBe(h2);
  });
});
