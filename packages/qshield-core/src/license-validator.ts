import type { QShieldLicense } from './license-types.js';

/**
 * Verify the cryptographic signature of a license.
 *
 * TODO: Implement RSA-256 signature verification against the QShield public key.
 * Currently performs a basic non-empty check as a placeholder.
 *
 * @param license - The license to verify
 * @returns True if the signature is valid
 */
export function verifyLicenseSignature(license: QShieldLicense): boolean {
  return license.signature.length > 0 && license.license_id.length > 0;
}

/**
 * Check whether a license has expired.
 *
 * @param license - The license to check
 * @returns True if the license expiration date is in the past
 */
export function isLicenseExpired(license: QShieldLicense): boolean {
  return new Date(license.expires_at).getTime() < Date.now();
}
