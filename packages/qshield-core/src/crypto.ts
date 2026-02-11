import { createHmac, createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'crypto';

const AES_ALGORITHM = 'aes-256-gcm';
const HMAC_ALGORITHM = 'sha256';
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 32; // 256 bits
const PBKDF2_DIGEST = 'sha256';
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Compute HMAC-SHA256 of data with the given key.
 * @returns hex-encoded HMAC
 */
export function hmacSha256(data: string, key: string): string {
  return createHmac(HMAC_ALGORITHM, key).update(data).digest('hex');
}

/**
 * Derive an encryption key from a password using PBKDF2.
 * @returns Buffer containing the derived key
 */
export function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST);
}

/**
 * Generate a cryptographically secure random salt.
 */
export function generateSalt(length: number = 32): Buffer {
  return randomBytes(length);
}

/**
 * Generate a cryptographically secure random hex string.
 */
export function generateRandomHex(byteLength: number = 32): string {
  return randomBytes(byteLength).toString('hex');
}

/** Encrypted data with IV and auth tag for AES-256-GCM */
export interface EncryptedData {
  ciphertext: string; // hex-encoded
  iv: string; // hex-encoded
  authTag: string; // hex-encoded
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * @param plaintext - the data to encrypt
 * @param key - 32-byte encryption key
 * @returns encrypted data with IV and authentication tag
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
 * @param encrypted - the encrypted data with IV and auth tag
 * @param key - 32-byte encryption key
 * @returns decrypted plaintext
 * @throws if authentication fails (tampered data)
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
 * Hash a record payload for the evidence chain.
 * Combines all record fields into a deterministic string and computes HMAC.
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
