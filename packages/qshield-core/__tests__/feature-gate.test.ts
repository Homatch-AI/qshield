import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureGate } from '../src/feature-gate';
import { EDITION_FEATURES } from '../src/license-types';
import type { Feature, QShieldEdition, QShieldLicense } from '../src/license-types';

/** Helper: create a valid license with sensible defaults. */
function makeLicense(overrides?: Partial<QShieldLicense>): QShieldLicense {
  return {
    license_id: 'lic-001',
    edition: 'business',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(), // +1 day
    features: EDITION_FEATURES.business,
    limits: { max_devices: 10, evidence_retention_days: 365, max_certificates_per_month: 50 },
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
    it('edition() returns "free"', () => {
      expect(gate.edition()).toBe('free');
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

  // -- Free license --------------------------------------------------------

  describe('with valid free license', () => {
    beforeEach(() => {
      gate.setLicense(makeLicense({
        edition: 'free',
        features: EDITION_FEATURES.free,
        limits: { max_devices: 1, evidence_retention_days: 7, max_certificates_per_month: 1 },
      }));
    });

    it('edition() returns "free"', () => {
      expect(gate.edition()).toBe('free');
    });

    it('has() returns true for free features', () => {
      expect(gate.has('dashboard')).toBe(true);
      expect(gate.has('trust_score')).toBe(true);
      expect(gate.has('overlay_shield')).toBe(true);
      expect(gate.has('clipboard_monitor')).toBe(true);
    });

    it('has() returns false for personal-only features', () => {
      expect(gate.has('zoom_monitor')).toBe(false);
      expect(gate.has('evidence_vault')).toBe(false);
      expect(gate.has('crypto_guard')).toBe(false);
    });

    it('free has exactly 4 features', () => {
      expect(EDITION_FEATURES.free).toHaveLength(4);
    });

    it('limit() returns correct free-tier values', () => {
      expect(gate.limit('max_devices')).toBe(1);
      expect(gate.limit('evidence_retention_days')).toBe(7);
      expect(gate.limit('max_certificates_per_month')).toBe(1);
    });

    it('isActive() returns true', () => {
      expect(gate.isActive()).toBe(true);
    });
  });

  // -- Personal license ----------------------------------------------------

  describe('with valid personal license', () => {
    beforeEach(() => {
      gate.setLicense(makeLicense({
        edition: 'personal',
        features: EDITION_FEATURES.personal,
        limits: { max_devices: 2, evidence_retention_days: 30, max_certificates_per_month: 3 },
      }));
    });

    it('edition() returns "personal"', () => {
      expect(gate.edition()).toBe('personal');
    });

    it('has() returns true for personal features', () => {
      expect(gate.has('dashboard')).toBe(true);
      expect(gate.has('zoom_monitor')).toBe(true);
      expect(gate.has('teams_monitor')).toBe(true);
      expect(gate.has('email_monitor')).toBe(true);
      expect(gate.has('crypto_guard')).toBe(true);
      expect(gate.has('phishing_detection')).toBe(true);
      expect(gate.has('evidence_vault')).toBe(true);
    });

    it('has() returns false for business-only features', () => {
      expect(gate.has('slack_monitor')).toBe(false);
      expect(gate.has('trust_certificates')).toBe(false);
      expect(gate.has('policy_engine')).toBe(false);
      expect(gate.has('api_access')).toBe(false);
    });

    it('personal has exactly 10 features', () => {
      expect(EDITION_FEATURES.personal).toHaveLength(10);
    });

    it('isActive() returns true', () => {
      expect(gate.isActive()).toBe(true);
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
      expect(gate.has('policy_engine')).toBe(true);
      expect(gate.has('api_access')).toBe(true);
      expect(gate.has('dlp_scanning')).toBe(true);
    });

    it('has() returns false for features not in the license', () => {
      expect(gate.has('siem_export')).toBe(false);
      expect(gate.has('enterprise_alerting')).toBe(false);
      expect(gate.has('advanced_analytics')).toBe(false);
      expect(gate.has('multi_tenant')).toBe(false);
    });

    it('business has exactly 22 features', () => {
      expect(EDITION_FEATURES.business).toHaveLength(22);
    });

    it('isActive() returns true', () => {
      expect(gate.isActive()).toBe(true);
    });
  });

  // -- Enterprise license --------------------------------------------------

  describe('with valid enterprise license', () => {
    beforeEach(() => {
      gate.setLicense(makeLicense({
        edition: 'enterprise',
        features: EDITION_FEATURES.enterprise,
        limits: { max_devices: -1, evidence_retention_days: -1, max_certificates_per_month: -1 },
      }));
    });

    it('edition() returns "enterprise"', () => {
      expect(gate.edition()).toBe('enterprise');
    });

    it('has() returns true for all 35 features', () => {
      for (const feature of EDITION_FEATURES.enterprise) {
        expect(gate.has(feature)).toBe(true);
      }
    });

    it('enterprise has exactly 35 features', () => {
      expect(EDITION_FEATURES.enterprise).toHaveLength(35);
    });

    it('uses -1 sentinel for unlimited limits', () => {
      expect(gate.limit('max_devices')).toBe(-1);
      expect(gate.limit('evidence_retention_days')).toBe(-1);
      expect(gate.limit('max_certificates_per_month')).toBe(-1);
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
      expect(gate.limit('max_certificates_per_month')).toBe(50);
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
      expect(gate.edition()).toBe('free');
      expect(gate.has('overlay_shield')).toBe(false);
      expect(gate.limit('max_devices')).toBeUndefined();
    });
  });

  // -- Invalid signature ---------------------------------------------------

  describe('setLicense with empty signature', () => {
    it('rejects the license (gate stays null)', () => {
      gate.setLicense(makeLicense({ signature: '' }));

      expect(gate.isActive()).toBe(false);
      expect(gate.edition()).toBe('free');
      expect(gate.has('overlay_shield')).toBe(false);
    });
  });

  describe('setLicense with empty license_id', () => {
    it('rejects the license (gate stays null)', () => {
      gate.setLicense(makeLicense({ license_id: '' }));

      expect(gate.isActive()).toBe(false);
      expect(gate.edition()).toBe('free');
    });
  });

  // -- EDITION_FEATURES subset validation ----------------------------------

  describe('EDITION_FEATURES subset validation', () => {
    it('free features are a subset of personal', () => {
      for (const feature of EDITION_FEATURES.free) {
        expect(EDITION_FEATURES.personal).toContain(feature);
      }
    });

    it('personal features are a subset of business', () => {
      for (const feature of EDITION_FEATURES.personal) {
        expect(EDITION_FEATURES.business).toContain(feature);
      }
    });

    it('business features are a subset of enterprise', () => {
      for (const feature of EDITION_FEATURES.business) {
        expect(EDITION_FEATURES.enterprise).toContain(feature);
      }
    });

    it('each tier is strictly larger than the previous', () => {
      expect(EDITION_FEATURES.free.length).toBeLessThan(EDITION_FEATURES.personal.length);
      expect(EDITION_FEATURES.personal.length).toBeLessThan(EDITION_FEATURES.business.length);
      expect(EDITION_FEATURES.business.length).toBeLessThan(EDITION_FEATURES.enterprise.length);
    });

    it('all features in enterprise are unique', () => {
      const unique = new Set(EDITION_FEATURES.enterprise);
      expect(unique.size).toBe(EDITION_FEATURES.enterprise.length);
    });

    it('tier sizes match expected counts', () => {
      expect(EDITION_FEATURES.free).toHaveLength(4);
      expect(EDITION_FEATURES.personal).toHaveLength(10);
      expect(EDITION_FEATURES.business).toHaveLength(22);
      expect(EDITION_FEATURES.enterprise).toHaveLength(35);
    });
  });
});
