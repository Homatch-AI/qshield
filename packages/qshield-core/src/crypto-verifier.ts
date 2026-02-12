/**
 * Cryptocurrency address and transaction verification utilities.
 * Provides address format validation, EIP-55 checksum verification,
 * scam database lookups, and transaction hash validation.
 */
import { createHash } from 'crypto';
import type { CryptoChain, TransactionCheck } from './types';

// ── Address format patterns ──────────────────────────────────────────────────

const ADDRESS_PATTERNS: Record<CryptoChain, RegExp> = {
  bitcoin: /^(bc1[a-zA-HJ-NP-Z0-9]{25,39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/,
  ethereum: /^0x[0-9a-fA-F]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  polygon: /^0x[0-9a-fA-F]{40}$/,
  arbitrum: /^0x[0-9a-fA-F]{40}$/,
  optimism: /^0x[0-9a-fA-F]{40}$/,
};

const TX_HASH_PATTERNS: Record<CryptoChain, RegExp> = {
  bitcoin: /^[0-9a-fA-F]{64}$/,
  ethereum: /^0x[0-9a-fA-F]{64}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{87,88}$/,
  polygon: /^0x[0-9a-fA-F]{64}$/,
  arbitrum: /^0x[0-9a-fA-F]{64}$/,
  optimism: /^0x[0-9a-fA-F]{64}$/,
};

// ── Scam database ────────────────────────────────────────────────────────────

let scamAddresses: Set<string> = new Set();

/**
 * Load scam addresses from a JSON array.
 * @param addresses - Array of known scam addresses (lowercase)
 */
export function loadScamDatabase(addresses: string[]): void {
  scamAddresses = new Set(addresses.map((a) => a.toLowerCase()));
}

/**
 * Check if an address is in the scam database.
 * @param address - The address to check
 * @returns true if the address is a known scam address
 */
export function isKnownScamAddress(address: string): boolean {
  return scamAddresses.has(address.toLowerCase());
}

// ── EIP-55 checksum ──────────────────────────────────────────────────────────

/**
 * Verify EIP-55 mixed-case checksum for an Ethereum-style address.
 * Returns true if the address has a valid checksum or is all-lowercase/all-uppercase.
 *
 * @param address - The 0x-prefixed Ethereum address
 * @returns true if checksum is valid
 */
export function verifyEIP55Checksum(address: string): boolean {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;

  const addr = address.slice(2);
  const addrLower = addr.toLowerCase();

  // All-lowercase or all-uppercase addresses are valid (no checksum encoding)
  if (addr === addrLower || addr === addr.toUpperCase()) return true;

  // Compute keccak256 hash of lowercase address for checksum
  const hash = keccak256(addrLower);

  for (let i = 0; i < 40; i++) {
    const hashNibble = parseInt(hash[i], 16);
    if (hashNibble >= 8) {
      if (addr[i] !== addr[i].toUpperCase()) return false;
    } else {
      if (addr[i] !== addr[i].toLowerCase()) return false;
    }
  }

  return true;
}

/**
 * Convert an Ethereum address to EIP-55 checksummed format.
 * @param address - The 0x-prefixed Ethereum address
 * @returns The checksummed address
 */
export function toEIP55Checksum(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return address;

  const addr = address.slice(2).toLowerCase();
  const hash = keccak256(addr);
  let checksummed = '0x';

  for (let i = 0; i < 40; i++) {
    const hashNibble = parseInt(hash[i], 16);
    checksummed += hashNibble >= 8 ? addr[i].toUpperCase() : addr[i];
  }

  return checksummed;
}

/**
 * Simple keccak256 using Node.js crypto (sha3-256).
 * @param input - The string to hash
 * @returns hex-encoded hash string
 */
function keccak256(input: string): string {
  return createHash('sha3-256').update(input).digest('hex');
}

// ── Address validation ───────────────────────────────────────────────────────

export interface AddressValidationResult {
  valid: boolean;
  chain: CryptoChain;
  address: string;
  checksumValid: boolean;
  isScam: boolean;
  warnings: string[];
}

/**
 * Validate a crypto address for a specific chain.
 * Checks format, checksum (for EVM chains), and scam database.
 *
 * @param address - The address to validate
 * @param chain - The blockchain network
 * @returns Validation result with warnings
 */
export function validateAddress(address: string, chain: CryptoChain): AddressValidationResult {
  const warnings: string[] = [];
  const pattern = ADDRESS_PATTERNS[chain];

  if (!pattern) {
    return { valid: false, chain, address, checksumValid: false, isScam: false, warnings: [`Unsupported chain: ${chain}`] };
  }

  const formatValid = pattern.test(address);
  if (!formatValid) {
    return { valid: false, chain, address, checksumValid: false, isScam: false, warnings: ['Invalid address format'] };
  }

  // EIP-55 checksum for EVM chains
  let checksumValid = true;
  const evmChains: CryptoChain[] = ['ethereum', 'polygon', 'arbitrum', 'optimism'];
  if (evmChains.includes(chain)) {
    checksumValid = verifyEIP55Checksum(address);
    if (!checksumValid) {
      warnings.push('EIP-55 checksum mismatch — address may be mistyped');
    }
  }

  // Scam database check
  const isScam = isKnownScamAddress(address);
  if (isScam) {
    warnings.push('WARNING: This address is flagged as a known scam address');
  }

  return {
    valid: formatValid,
    chain,
    address,
    checksumValid,
    isScam,
    warnings,
  };
}

// ── Transaction verification ─────────────────────────────────────────────────

/**
 * Verify a transaction hash format for a given chain.
 *
 * @param hash - The transaction hash to verify
 * @param chain - The blockchain network
 * @returns Transaction check result
 */
export function verifyTransactionHash(hash: string, chain: CryptoChain): TransactionCheck {
  const warnings: string[] = [];
  const pattern = TX_HASH_PATTERNS[chain];

  if (!pattern) {
    return { valid: false, chain, hash, warnings: [`Unsupported chain: ${chain}`], scamMatch: false, checksumValid: false };
  }

  const valid = pattern.test(hash);
  if (!valid) {
    warnings.push('Invalid transaction hash format');
  }

  return {
    valid,
    chain,
    hash,
    warnings,
    scamMatch: false,
    checksumValid: true,
  };
}

// ── Chain detection ──────────────────────────────────────────────────────────

/**
 * Attempt to auto-detect the blockchain network from an address format.
 * Returns undefined if the chain cannot be determined.
 *
 * @param address - The address to analyze
 * @returns The detected chain or undefined
 */
export function detectChain(address: string): CryptoChain | undefined {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return 'ethereum';
  if (/^(bc1[a-zA-HJ-NP-Z0-9]{25,39}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address)) return 'bitcoin';
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return 'solana';
  return undefined;
}
