import { describe, it, expect } from 'vitest';
import { verifyLicenseSignature, isLicenseExpired } from '../src/license-validator';
import { EDITION_FEATURES } from '../src/types/features';
import { LICENSE_LIMITS } from '../src/license-types';
import type { QShieldLicense } from '../src/license-types';

/** Helper: create a valid license with sensible defaults. */
function makeLicense(overrides?: Partial<QShieldLicense>): QShieldLicense {
  return {
    license_id: 'lic-001',
    edition: 'business',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    features: EDITION_FEATURES.business,
    limits: LICENSE_LIMITS.business,
    signature: 'sig-placeholder',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// verifyLicenseSignature
// ---------------------------------------------------------------------------

describe('verifyLicenseSignature', () => {
  it('returns true for non-empty signature and license_id', () => {
    expect(verifyLicenseSignature(makeLicense())).toBe(true);
  });

  it('returns false when signature is empty', () => {
    expect(verifyLicenseSignature(makeLicense({ signature: '' }))).toBe(false);
  });

  it('returns false when license_id is empty', () => {
    expect(verifyLicenseSignature(makeLicense({ license_id: '' }))).toBe(false);
  });

  it('returns false when both are empty', () => {
    expect(verifyLicenseSignature(makeLicense({ signature: '', license_id: '' }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isLicenseExpired
// ---------------------------------------------------------------------------

describe('isLicenseExpired', () => {
  it('returns false for a future expiration date', () => {
    expect(isLicenseExpired(makeLicense({
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }))).toBe(false);
  });

  it('returns true for a past expiration date', () => {
    expect(isLicenseExpired(makeLicense({
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
    }))).toBe(true);
  });

  it('returns true for an expiration date exactly now (edge case)', () => {
    // Date.now() at construction vs evaluation may differ by a few ms,
    // so a timestamp equal to "now" should be treated as expired.
    const past = new Date(Date.now() - 1).toISOString();
    expect(isLicenseExpired(makeLicense({ expires_at: past }))).toBe(true);
  });
});
