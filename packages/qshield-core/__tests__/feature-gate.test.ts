import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureGate } from '../src/feature-gate';
import type { QShieldLicense } from '../src/license-types';

/** Helper: create a valid license with sensible defaults. */
function makeLicense(overrides?: Partial<QShieldLicense>): QShieldLicense {
  return {
    license_id: 'lic-001',
    edition: 'business',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(), // +1 day
    features: [
      'overlay_shield',
      'evidence_vault',
      'zoom_monitor',
      'teams_monitor',
      'email_monitor',
      'policy_engine',
      'trust_certificates',
    ],
    limits: { max_devices: 10, evidence_retention_days: 365 },
    signature: 'sig-placeholder',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FeatureGate
// ---------------------------------------------------------------------------

describe('FeatureGate', () => {
  let gate: FeatureGate;

  beforeEach(() => {
    gate = new FeatureGate();
  });

  // -- Default (no license) ------------------------------------------------

  describe('default state (no license)', () => {
    it('edition() returns "personal"', () => {
      expect(gate.edition()).toBe('personal');
    });

    it('has() returns false for all features', () => {
      expect(gate.has('overlay_shield')).toBe(false);
      expect(gate.has('evidence_vault')).toBe(false);
      expect(gate.has('siem_export')).toBe(false);
    });

    it('isActive() returns false', () => {
      expect(gate.isActive()).toBe(false);
    });

    it('limit() returns undefined', () => {
      expect(gate.limit('max_devices')).toBeUndefined();
    });
  });

  // -- Valid business license ----------------------------------------------

  describe('with valid business license', () => {
    beforeEach(() => {
      gate.setLicense(makeLicense());
    });

    it('edition() returns "business"', () => {
      expect(gate.edition()).toBe('business');
    });

    it('has() returns true for included features', () => {
      expect(gate.has('overlay_shield')).toBe(true);
      expect(gate.has('evidence_vault')).toBe(true);
      expect(gate.has('trust_certificates')).toBe(true);
    });

    it('has() returns false for features not in the license', () => {
      expect(gate.has('siem_export')).toBe(false);
      expect(gate.has('enterprise_alerting')).toBe(false);
      expect(gate.has('advanced_analytics')).toBe(false);
    });

    it('isActive() returns true', () => {
      expect(gate.isActive()).toBe(true);
    });
  });

  // -- Expired license -----------------------------------------------------

  describe('with expired license', () => {
    beforeEach(() => {
      gate.setLicense(makeLicense({
        expires_at: new Date(Date.now() - 86_400_000).toISOString(), // -1 day
      }));
    });

    it('has() returns false for all features', () => {
      expect(gate.has('overlay_shield')).toBe(false);
      expect(gate.has('evidence_vault')).toBe(false);
    });

    it('isActive() returns false', () => {
      expect(gate.isActive()).toBe(false);
    });

    it('edition() still returns the license edition', () => {
      expect(gate.edition()).toBe('business');
    });
  });

  // -- Limits --------------------------------------------------------------

  describe('limit()', () => {
    it('returns correct value for existing keys', () => {
      gate.setLicense(makeLicense());
      expect(gate.limit('max_devices')).toBe(10);
      expect(gate.limit('evidence_retention_days')).toBe(365);
    });

    it('returns undefined for missing keys', () => {
      gate.setLicense(makeLicense());
      expect(gate.limit('nonexistent')).toBeUndefined();
    });

    it('returns undefined when license has no limits', () => {
      gate.setLicense(makeLicense({ limits: undefined }));
      expect(gate.limit('max_devices')).toBeUndefined();
    });
  });

  // -- clearLicense --------------------------------------------------------

  describe('clearLicense()', () => {
    it('resets gate to default state', () => {
      gate.setLicense(makeLicense());
      expect(gate.isActive()).toBe(true);
      expect(gate.edition()).toBe('business');

      gate.clearLicense();

      expect(gate.isActive()).toBe(false);
      expect(gate.edition()).toBe('personal');
      expect(gate.has('overlay_shield')).toBe(false);
      expect(gate.limit('max_devices')).toBeUndefined();
    });
  });

  // -- Invalid signature ---------------------------------------------------

  describe('setLicense with empty signature', () => {
    it('rejects the license (gate stays null)', () => {
      gate.setLicense(makeLicense({ signature: '' }));

      expect(gate.isActive()).toBe(false);
      expect(gate.edition()).toBe('personal');
      expect(gate.has('overlay_shield')).toBe(false);
    });
  });

  describe('setLicense with empty license_id', () => {
    it('rejects the license (gate stays null)', () => {
      gate.setLicense(makeLicense({ license_id: '' }));

      expect(gate.isActive()).toBe(false);
      expect(gate.edition()).toBe('personal');
    });
  });
});
