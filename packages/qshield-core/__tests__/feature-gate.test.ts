import { describe, it, expect, beforeEach } from 'vitest';
import { LicenseFeatureGate } from '../src/feature-gate';
import { EDITION_FEATURES } from '../src/types/features';
import {
  LICENSE_LIMITS,
  getRequiredEdition,
  isEditionAtLeast,
} from '../src/license-types';
import type { QShieldLicense, LicenseLimits } from '../src/license-types';

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

describe('LicenseFeatureGate', () => {
  let gate: LicenseFeatureGate;

  beforeEach(() => {
    gate = new LicenseFeatureGate();
  });

  // -- No license (unregistered) -------------------------------------------

  describe('no license (unregistered)', () => {
    it('edition() returns "free"', () => {
      expect(gate.edition()).toBe('free');
    });

    it('has("shield_basic") returns true', () => {
      expect(gate.has('shield_basic')).toBe(true);
    });

    it('has("verify_send") returns false', () => {
      expect(gate.has('verify_send')).toBe(false);
    });

    it('has("zoom_monitor") returns false', () => {
      expect(gate.has('zoom_monitor')).toBe(false);
    });

    it('limits() returns free limits', () => {
      expect(gate.limits()).toEqual(LICENSE_LIMITS.free);
    });

    it('isActive() returns false', () => {
      expect(gate.isActive()).toBe(false);
    });

    it('getLicense() returns null', () => {
      expect(gate.getLicense()).toBeNull();
    });

    it('limit("max_devices") returns 1', () => {
      expect(gate.limit('max_devices')).toBe(1);
    });

    it('isUnlimited("max_devices") returns false', () => {
      expect(gate.isUnlimited('max_devices')).toBe(false);
    });
  });

  // -- Free license --------------------------------------------------------

  describe('with free license', () => {
    beforeEach(() => {
      gate.setLicense(makeLicense({
        edition: 'free',
        features: EDITION_FEATURES.free,
        limits: LICENSE_LIMITS.free,
      }));
    });

    it('edition() returns "free"', () => {
      expect(gate.edition()).toBe('free');
    });

    it('has("shield_basic") returns true', () => {
      expect(gate.has('shield_basic')).toBe(true);
    });

    it('has("verify_send") returns true', () => {
      expect(gate.has('verify_send')).toBe(true);
    });

    it('has("email_signature") returns true', () => {
      expect(gate.has('email_signature')).toBe(true);
    });

    it('has("shield_breathing") returns false', () => {
      expect(gate.has('shield_breathing')).toBe(false);
    });

    it('has("crypto_basic") returns false', () => {
      expect(gate.has('crypto_basic')).toBe(false);
    });

    it('limit("verifications_per_day") returns 20', () => {
      expect(gate.limit('verifications_per_day')).toBe(20);
    });

    it('limit("certs_per_month") returns 0', () => {
      expect(gate.limit('certs_per_month')).toBe(0);
    });

    it('isActive() returns true', () => {
      expect(gate.isActive()).toBe(true);
    });
  });

  // -- Personal license ----------------------------------------------------

  describe('with personal license', () => {
    beforeEach(() => {
      gate.setLicense(makeLicense({
        edition: 'personal',
        features: EDITION_FEATURES.personal,
        limits: LICENSE_LIMITS.personal,
      }));
    });

    it('edition() returns "personal"', () => {
      expect(gate.edition()).toBe('personal');
    });

    it('has("crypto_basic") returns true', () => {
      expect(gate.has('crypto_basic')).toBe(true);
    });

    it('has("shield_breathing") returns true', () => {
      expect(gate.has('shield_breathing')).toBe(true);
    });

    it('has("evidence_full") returns true', () => {
      expect(gate.has('evidence_full')).toBe(true);
    });

    it('has("verify_custom_badge") returns true', () => {
      expect(gate.has('verify_custom_badge')).toBe(true);
    });

    it('has("zoom_monitor") returns false', () => {
      expect(gate.has('zoom_monitor')).toBe(false);
    });

    it('has("policy_engine") returns false', () => {
      expect(gate.has('policy_engine')).toBe(false);
    });

    it('limit("evidence_retention_days") returns 30', () => {
      expect(gate.limit('evidence_retention_days')).toBe(30);
    });

    it('limit("certs_per_month") returns 3', () => {
      expect(gate.limit('certs_per_month')).toBe(3);
    });

    it('isUnlimited("verifications_per_day") returns true', () => {
      expect(gate.isUnlimited('verifications_per_day')).toBe(true);
    });
  });

  // -- Business license ----------------------------------------------------

  describe('with business license', () => {
    beforeEach(() => {
      gate.setLicense(makeLicense());
    });

    it('edition() returns "business"', () => {
      expect(gate.edition()).toBe('business');
    });

    it('has("zoom_monitor") returns true', () => {
      expect(gate.has('zoom_monitor')).toBe(true);
    });

    it('has("teams_monitor") returns true', () => {
      expect(gate.has('teams_monitor')).toBe(true);
    });

    it('has("policy_engine") returns true', () => {
      expect(gate.has('policy_engine')).toBe(true);
    });

    it('has("crypto_monitor") returns true', () => {
      expect(gate.has('crypto_monitor')).toBe(true);
    });

    it('has("sso_scim") returns false', () => {
      expect(gate.has('sso_scim')).toBe(false);
    });

    it('has("siem_export") returns false', () => {
      expect(gate.has('siem_export')).toBe(false);
    });

    it('has("cert_pro") returns true', () => {
      expect(gate.has('cert_pro')).toBe(true);
    });

    it('limit("max_devices") returns 10', () => {
      expect(gate.limit('max_devices')).toBe(10);
    });

    it('isActive() returns true', () => {
      expect(gate.isActive()).toBe(true);
    });
  });

  // -- Enterprise license --------------------------------------------------

  describe('with enterprise license', () => {
    beforeEach(() => {
      gate.setLicense(makeLicense({
        edition: 'enterprise',
        features: EDITION_FEATURES.enterprise,
        limits: LICENSE_LIMITS.enterprise,
      }));
    });

    it('edition() returns "enterprise"', () => {
      expect(gate.edition()).toBe('enterprise');
    });

    it('has() returns true for ALL features', () => {
      for (const feature of EDITION_FEATURES.enterprise) {
        expect(gate.has(feature)).toBe(true);
      }
    });

    it('all limits are -1 (unlimited)', () => {
      const lim = gate.limits();
      for (const key of Object.keys(lim) as (keyof LicenseLimits)[]) {
        expect(lim[key]).toBe(-1);
      }
    });

    it('isUnlimited("max_devices") returns true', () => {
      expect(gate.isUnlimited('max_devices')).toBe(true);
    });

    it('isUnlimited("certs_per_month") returns true', () => {
      expect(gate.isUnlimited('certs_per_month')).toBe(true);
    });

    it('isActive() returns true', () => {
      expect(gate.isActive()).toBe(true);
    });
  });

  // -- Expired license -----------------------------------------------------

  describe('with expired license', () => {
    beforeEach(() => {
      gate.setLicense(makeLicense({
        expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      }));
    });

    it('has("shield_basic") returns true (unregistered fallback)', () => {
      expect(gate.has('shield_basic')).toBe(true);
    });

    it('has("verify_send") returns false', () => {
      expect(gate.has('verify_send')).toBe(false);
    });

    it('has("zoom_monitor") returns false', () => {
      expect(gate.has('zoom_monitor')).toBe(false);
    });

    it('edition() returns "free"', () => {
      expect(gate.edition()).toBe('free');
    });

    it('limits() returns free limits', () => {
      expect(gate.limits()).toEqual(LICENSE_LIMITS.free);
    });

    it('isActive() returns false', () => {
      expect(gate.isActive()).toBe(false);
    });
  });

  // -- setLicense with invalid signature -----------------------------------

  describe('setLicense with empty signature', () => {
    it('returns false and license stays null', () => {
      const result = gate.setLicense(makeLicense({ signature: '' }));

      expect(result).toBe(false);
      expect(gate.isActive()).toBe(false);
      expect(gate.getLicense()).toBeNull();
      expect(gate.edition()).toBe('free');
    });
  });

  describe('setLicense with empty license_id', () => {
    it('returns false and license stays null', () => {
      const result = gate.setLicense(makeLicense({ license_id: '' }));

      expect(result).toBe(false);
      expect(gate.isActive()).toBe(false);
      expect(gate.getLicense()).toBeNull();
    });
  });

  describe('setLicense with valid license', () => {
    it('returns true', () => {
      const result = gate.setLicense(makeLicense());
      expect(result).toBe(true);
    });
  });

  // -- clearLicense --------------------------------------------------------

  describe('clearLicense()', () => {
    it('resets to unregistered state', () => {
      gate.setLicense(makeLicense());
      expect(gate.isActive()).toBe(true);
      expect(gate.edition()).toBe('business');

      gate.clearLicense();

      expect(gate.isActive()).toBe(false);
      expect(gate.edition()).toBe('free');
      expect(gate.getLicense()).toBeNull();
      expect(gate.has('shield_basic')).toBe(true);
      expect(gate.has('verify_send')).toBe(false);
      expect(gate.has('zoom_monitor')).toBe(false);
    });
  });

  // -- Edition feature subset validation -----------------------------------

  describe('EDITION_FEATURES subset validation', () => {
    it('free is a subset of personal', () => {
      for (const f of EDITION_FEATURES.free) {
        expect(EDITION_FEATURES.personal).toContain(f);
      }
    });

    it('personal is a subset of business', () => {
      for (const f of EDITION_FEATURES.personal) {
        expect(EDITION_FEATURES.business).toContain(f);
      }
    });

    it('business is a subset of enterprise', () => {
      for (const f of EDITION_FEATURES.business) {
        expect(EDITION_FEATURES.enterprise).toContain(f);
      }
    });

    it('each tier is strictly larger than the previous', () => {
      expect(EDITION_FEATURES.free.length).toBeLessThan(EDITION_FEATURES.personal.length);
      expect(EDITION_FEATURES.personal.length).toBeLessThan(EDITION_FEATURES.business.length);
      expect(EDITION_FEATURES.business.length).toBeLessThan(EDITION_FEATURES.enterprise.length);
    });
  });
});

// ── Helper function tests ──────────────────────────────────────────────────

describe('getRequiredEdition()', () => {
  it('returns "free" for shield_basic', () => {
    expect(getRequiredEdition('shield_basic')).toBe('free');
  });

  it('returns "free" for verify_send', () => {
    expect(getRequiredEdition('verify_send')).toBe('free');
  });

  it('returns "personal" for crypto_basic', () => {
    expect(getRequiredEdition('crypto_basic')).toBe('personal');
  });

  it('returns "personal" for shield_breathing', () => {
    expect(getRequiredEdition('shield_breathing')).toBe('personal');
  });

  it('returns "business" for zoom_monitor', () => {
    expect(getRequiredEdition('zoom_monitor')).toBe('business');
  });

  it('returns "business" for policy_engine', () => {
    expect(getRequiredEdition('policy_engine')).toBe('business');
  });

  it('returns "enterprise" for sso_scim', () => {
    expect(getRequiredEdition('sso_scim')).toBe('enterprise');
  });

  it('returns "enterprise" for siem_export', () => {
    expect(getRequiredEdition('siem_export')).toBe('enterprise');
  });

  it('returns "enterprise" for insurance_readiness', () => {
    expect(getRequiredEdition('insurance_readiness')).toBe('enterprise');
  });
});

describe('isEditionAtLeast()', () => {
  it('business >= personal', () => {
    expect(isEditionAtLeast('business', 'personal')).toBe(true);
  });

  it('free < personal', () => {
    expect(isEditionAtLeast('free', 'personal')).toBe(false);
  });

  it('enterprise >= enterprise', () => {
    expect(isEditionAtLeast('enterprise', 'enterprise')).toBe(true);
  });

  it('personal >= free', () => {
    expect(isEditionAtLeast('personal', 'free')).toBe(true);
  });

  it('free >= free', () => {
    expect(isEditionAtLeast('free', 'free')).toBe(true);
  });

  it('personal < business', () => {
    expect(isEditionAtLeast('personal', 'business')).toBe(false);
  });
});
