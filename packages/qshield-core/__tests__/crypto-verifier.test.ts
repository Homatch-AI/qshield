import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateAddress,
  verifyTransactionHash,
  verifyEIP55Checksum,
  toEIP55Checksum,
  loadScamDatabase,
  isKnownScamAddress,
  detectChain,
} from '../src/crypto-verifier';

// ── EIP-55 Checksum ──────────────────────────────────────────────────────────

describe('verifyEIP55Checksum', () => {
  it('returns true for all-lowercase address', () => {
    expect(verifyEIP55Checksum('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe(true);
  });

  it('returns true for all-uppercase address (after 0x)', () => {
    expect(verifyEIP55Checksum('0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED')).toBe(true);
  });

  it('returns true for correctly checksummed addresses', () => {
    // Well-known EIP-55 test vectors
    expect(verifyEIP55Checksum('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(true);
    expect(verifyEIP55Checksum('0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359')).toBe(true);
    expect(verifyEIP55Checksum('0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB')).toBe(true);
    expect(verifyEIP55Checksum('0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb')).toBe(true);
  });

  it('returns false for incorrectly checksummed address', () => {
    // Flip one character's case to break the checksum
    expect(verifyEIP55Checksum('0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed')).toBe(false);
  });

  it('returns false for invalid format', () => {
    expect(verifyEIP55Checksum('not-an-address')).toBe(false);
    expect(verifyEIP55Checksum('0x')).toBe(false);
    expect(verifyEIP55Checksum('0x123')).toBe(false);
  });
});

describe('toEIP55Checksum', () => {
  it('converts a lowercase address to checksummed format', () => {
    const result = toEIP55Checksum('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed');
    expect(result).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
  });

  it('produces an address that verifies', () => {
    const addr = '0xd1220a0cf47c7b9be7a2e6ba89f429762e7b9adb';
    const checksummed = toEIP55Checksum(addr);
    expect(verifyEIP55Checksum(checksummed)).toBe(true);
  });

  it('is idempotent', () => {
    const addr = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
    expect(toEIP55Checksum(addr)).toBe(addr);
  });

  it('returns invalid input unchanged', () => {
    expect(toEIP55Checksum('not-an-address')).toBe('not-an-address');
  });
});

// ── Address validation ───────────────────────────────────────────────────────

describe('validateAddress', () => {
  it('validates a correct Ethereum address', () => {
    const result = validateAddress('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', 'ethereum');
    expect(result.valid).toBe(true);
    expect(result.checksumValid).toBe(true);
    expect(result.isScam).toBe(false);
    expect(result.warnings).toHaveLength(0);
  });

  it('validates a lowercase Ethereum address', () => {
    const result = validateAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed', 'ethereum');
    expect(result.valid).toBe(true);
    expect(result.checksumValid).toBe(true);
  });

  it('rejects an invalid Ethereum address format', () => {
    const result = validateAddress('0xINVALID', 'ethereum');
    expect(result.valid).toBe(false);
    expect(result.warnings).toContain('Invalid address format');
  });

  it('warns on bad checksum but still marks as valid format', () => {
    const result = validateAddress('0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', 'ethereum');
    expect(result.valid).toBe(true);
    expect(result.checksumValid).toBe(false);
    expect(result.warnings.some((w) => w.includes('checksum'))).toBe(true);
  });

  it('validates a Bitcoin address', () => {
    const result = validateAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'bitcoin');
    expect(result.valid).toBe(true);
  });

  it('validates EVM chains (polygon, arbitrum, optimism)', () => {
    const addr = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
    for (const chain of ['polygon', 'arbitrum', 'optimism'] as const) {
      const result = validateAddress(addr, chain);
      expect(result.valid).toBe(true);
      expect(result.chain).toBe(chain);
    }
  });

  it('rejects an invalid Bitcoin address', () => {
    const result = validateAddress('not-a-btc-address', 'bitcoin');
    expect(result.valid).toBe(false);
  });
});

// ── Scam database ────────────────────────────────────────────────────────────

describe('scam database', () => {
  beforeEach(() => {
    loadScamDatabase([]);
  });

  it('detects scam addresses after loading database', () => {
    loadScamDatabase(['0xscamaddress1234567890abcdef1234567890abcdef']);
    expect(isKnownScamAddress('0xscamaddress1234567890abcdef1234567890abcdef')).toBe(true);
  });

  it('is case-insensitive', () => {
    loadScamDatabase(['0xABCDEF1234567890abcdef1234567890abcdef12']);
    expect(isKnownScamAddress('0xabcdef1234567890ABCDEF1234567890ABCDEF12')).toBe(true);
  });

  it('returns false for non-scam address', () => {
    loadScamDatabase(['0xbad']);
    expect(isKnownScamAddress('0xgood')).toBe(false);
  });

  it('adds scam warning to validateAddress result', () => {
    const scamAddr = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
    loadScamDatabase([scamAddr]);
    const result = validateAddress(scamAddr, 'ethereum');
    expect(result.isScam).toBe(true);
    expect(result.warnings.some((w) => w.includes('scam'))).toBe(true);
  });
});

// ── Transaction hash verification ────────────────────────────────────────────

describe('verifyTransactionHash', () => {
  it('validates a correct Ethereum tx hash', () => {
    const hash = '0x' + 'a'.repeat(64);
    const result = verifyTransactionHash(hash, 'ethereum');
    expect(result.valid).toBe(true);
  });

  it('validates a correct Bitcoin tx hash', () => {
    const hash = 'a'.repeat(64);
    const result = verifyTransactionHash(hash, 'bitcoin');
    expect(result.valid).toBe(true);
  });

  it('rejects an invalid Ethereum tx hash', () => {
    const result = verifyTransactionHash('not-a-hash', 'ethereum');
    expect(result.valid).toBe(false);
    expect(result.warnings.some((w) => w.includes('Invalid'))).toBe(true);
  });

  it('rejects an invalid Bitcoin tx hash', () => {
    const result = verifyTransactionHash('too-short', 'bitcoin');
    expect(result.valid).toBe(false);
  });

  it('returns correct chain in result', () => {
    const hash = '0x' + 'b'.repeat(64);
    expect(verifyTransactionHash(hash, 'polygon').chain).toBe('polygon');
    expect(verifyTransactionHash(hash, 'arbitrum').chain).toBe('arbitrum');
    expect(verifyTransactionHash(hash, 'optimism').chain).toBe('optimism');
  });
});

// ── Chain detection ──────────────────────────────────────────────────────────

describe('detectChain', () => {
  it('detects Ethereum address', () => {
    expect(detectChain('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed')).toBe('ethereum');
  });

  it('detects Bitcoin bech32 address', () => {
    expect(detectChain('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe('bitcoin');
  });

  it('detects Bitcoin legacy address', () => {
    expect(detectChain('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toBe('bitcoin');
  });

  it('returns undefined for unrecognized format', () => {
    expect(detectChain('not-a-valid-address')).toBeUndefined();
  });
});
