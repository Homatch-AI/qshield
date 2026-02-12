import { createHmac, createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';

const AES_ALGORITHM = 'aes-256-gcm';
const HMAC_ALGORITHM = 'sha256';
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const PBKDF2_DIGEST = 'sha512';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 16; // 128 bits for PBKDF2 salt

/**
 * Compute HMAC-SHA256 of data with the given key.
 * @param data - The data to authenticate
 * @param key - The secret key for the HMAC
 * @returns hex-encoded HMAC string (64 characters)
 */
export function hmacSha256(data: string, key: string): string {
  return createHmac(HMAC_ALGORITHM, key).update(data).digest('hex');
}

/**
 * Derive an encryption key from a password using PBKDF2 with SHA-512.
 *
 * Uses 100,000 iterations to make brute-force attacks computationally expensive.
 * The salt MUST be unique per password to prevent rainbow table attacks.
 *
 * @param password - The user passphrase or master secret
 * @param salt - A cryptographically random salt (at least 16 bytes recommended)
 * @returns Buffer containing the 32-byte derived key
 */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST);
}

/**
 * Generate a cryptographically secure random salt.
 * @param length - Salt length in bytes (default: 16 bytes / 128 bits)
 * @returns Buffer containing random bytes
 */
export function generateSalt(length: number = SALT_LENGTH): Buffer {
  return randomBytes(length);
}

/**
 * Generate a cryptographically secure random hex string.
 * @param byteLength - Number of random bytes (default: 32, producing 64 hex chars)
 * @returns Hex-encoded random string
 */
export function generateRandomHex(byteLength: number = 32): string {
  return randomBytes(byteLength).toString('hex');
}

/**
 * Generate cryptographically secure random bytes.
 * @param bytes - Number of random bytes to generate
 * @returns Buffer containing the random bytes
 * @throws {RangeError} If bytes is negative or not an integer
 */
export function generateSecureRandom(bytes: number): Buffer {
  if (!Number.isInteger(bytes) || bytes < 0) {
    throw new RangeError('bytes must be a non-negative integer');
  }
  return randomBytes(bytes);
}

/**
 * Perform a constant-time comparison of two buffers or strings.
 *
 * This prevents timing side-channel attacks when comparing HMAC digests
 * or other secret values. The comparison always takes the same amount of
 * time regardless of where (or whether) the values differ.
 *
 * @param a - First value to compare (string or Buffer)
 * @param b - Second value to compare (string or Buffer)
 * @returns true if a and b are equal, false otherwise
 */
export function constantTimeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const bufA = typeof a === 'string' ? Buffer.from(a, 'utf8') : a;
  const bufB = typeof b === 'string' ? Buffer.from(b, 'utf8') : b;

  if (bufA.length !== bufB.length) {
    // Still do a comparison to avoid leaking length info through timing
    // Compare bufA against itself to burn the same amount of time
    timingSafeEqual(bufA, bufA);
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/** Encrypted data with IV and auth tag for AES-256-GCM */
export interface EncryptedData {
  /** Hex-encoded ciphertext */
  ciphertext: string;
  /** Hex-encoded initialization vector (12 bytes / 96 bits) */
  iv: string;
  /** Hex-encoded authentication tag (16 bytes / 128 bits) */
  authTag: string;
}

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * A unique random 12-byte IV is generated for every encryption call.
 * The GCM mode provides both confidentiality and authenticity — any
 * tampering with the ciphertext will be detected during decryption.
 *
 * @param plaintext - The data to encrypt
 * @param key - 32-byte encryption key (e.g. from {@link deriveKey})
 * @returns Encrypted data containing ciphertext, IV, and authentication tag
 */
export function encryptAesGcm(plaintext: string, key: Buffer): EncryptedData {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt AES-256-GCM encrypted data.
 *
 * Verifies the authentication tag before returning plaintext.
 * If the ciphertext, IV, or auth tag have been tampered with,
 * decryption will throw an error.
 *
 * @param encrypted - The encrypted data with IV and auth tag
 * @param key - 32-byte encryption key (same key used for encryption)
 * @returns Decrypted plaintext string
 * @throws {Error} If authentication fails (data has been tampered with)
 */
export function decryptAesGcm(encrypted: EncryptedData, key: Buffer): string {
  const iv = Buffer.from(encrypted.iv, 'hex');
  const authTag = Buffer.from(encrypted.authTag, 'hex');
  const decipher = createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Re-encrypt data that was encrypted with an old key using a new key.
 *
 * Decrypts each item with the old key, then re-encrypts with the new key.
 * This is used during key rotation to migrate all stored data.
 *
 * @param items - Array of encrypted data objects to rotate
 * @param oldKey - The current 32-byte encryption key
 * @param newKey - The new 32-byte encryption key
 * @returns Array of re-encrypted data objects with fresh IVs
 * @throws {Error} If any item fails to decrypt with the old key
 */
export function rotateKey(
  items: EncryptedData[],
  oldKey: Buffer,
  newKey: Buffer,
): EncryptedData[] {
  return items.map((item) => {
    const plaintext = decryptAesGcm(item, oldKey);
    return encryptAesGcm(plaintext, newKey);
  });
}

/**
 * Hash a record payload for the evidence chain.
 *
 * Combines all record fields into a deterministic pipe-separated string
 * and computes an HMAC-SHA256. The null previousHash is encoded as
 * the literal string "genesis" to distinguish it from an empty string.
 *
 * @param fields - The record fields to hash
 * @param key - The HMAC secret key for chain integrity
 * @returns Hex-encoded HMAC-SHA256 hash (64 characters)
 */
export function hashEvidenceRecord(
  fields: {
    id: string;
    previousHash: string | null;
    timestamp: string;
    source: string;
    eventType: string;
    payload: string;
  },
  key: string,
): string {
  const data = [
    fields.id,
    fields.previousHash ?? 'genesis',
    fields.timestamp,
    fields.source,
    fields.eventType,
    fields.payload,
  ].join('|');

  return hmacSha256(data, key);
}
