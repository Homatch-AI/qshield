import { describe, it, expect } from 'vitest';
import { FeatureGate, EDITION_FEATURES } from '../types/features';

describe('FeatureGate', () => {
  it('free edition has basic features', () => {
    const gate = new FeatureGate('free');
    expect(gate.has('shield_basic')).toBe(true);
    expect(gate.has('verify_send')).toBe(true);
    expect(gate.has('timeline_24h')).toBe(true);
    expect(gate.has('evidence_preview')).toBe(true);
  });

  it('free edition lacks paid features', () => {
    const gate = new FeatureGate('free');
    expect(gate.has('shield_breathing')).toBe(false);
    expect(gate.has('secure_message_send')).toBe(false);
    expect(gate.has('crypto_basic')).toBe(false);
    expect(gate.has('zoom_verify_limited')).toBe(false);
    expect(gate.has('cert_basic')).toBe(false);
    expect(gate.has('secure_file_send')).toBe(false);
  });

  it('personal has secure messages + crypto + zoom', () => {
    const gate = new FeatureGate('personal');
    expect(gate.has('secure_message_send')).toBe(true);
    expect(gate.has('crypto_basic')).toBe(true);
    expect(gate.has('zoom_verify_limited')).toBe(true);
    expect(gate.has('cert_basic')).toBe(true);
    expect(gate.has('evidence_full')).toBe(true);
    expect(gate.has('timeline_full')).toBe(true);
  });

  it('personal lacks business features', () => {
    const gate = new FeatureGate('personal');
    expect(gate.has('secure_file_send')).toBe(false);
    expect(gate.has('zoom_monitor')).toBe(false);
    expect(gate.has('teams_monitor')).toBe(false);
    expect(gate.has('policy_engine')).toBe(false);
    expect(gate.has('evidence_export')).toBe(false);
  });

  it('business has file attachments + full monitoring', () => {
    const gate = new FeatureGate('business');
    expect(gate.has('secure_file_send')).toBe(true);
    expect(gate.has('zoom_monitor')).toBe(true);
    expect(gate.has('teams_monitor')).toBe(true);
    expect(gate.has('email_monitor')).toBe(true);
    expect(gate.has('file_monitor')).toBe(true);
    expect(gate.has('policy_engine')).toBe(true);
    expect(gate.has('evidence_export')).toBe(true);
    expect(gate.has('verify_analytics')).toBe(true);
    expect(gate.has('secure_message_files')).toBe(true);
  });

  it('business lacks enterprise features', () => {
    const gate = new FeatureGate('business');
    expect(gate.has('siem_export')).toBe(false);
    expect(gate.has('sso_scim')).toBe(false);
    expect(gate.has('compliance_dashboard')).toBe(false);
    expect(gate.has('secure_message_thread')).toBe(false);
    expect(gate.has('verify_custom_domain')).toBe(false);
    expect(gate.has('api_monitor')).toBe(false);
  });

  it('enterprise has all features', () => {
    const gate = new FeatureGate('enterprise');
    expect(gate.has('siem_export')).toBe(true);
    expect(gate.has('sso_scim')).toBe(true);
    expect(gate.has('compliance_dashboard')).toBe(true);
    expect(gate.has('insurance_readiness')).toBe(true);
    expect(gate.has('secure_message_thread')).toBe(true);
    expect(gate.has('verify_custom_domain')).toBe(true);
    expect(gate.has('secure_file_large')).toBe(true);
    expect(gate.has('api_monitor')).toBe(true);
    expect(gate.has('audit_log')).toBe(true);
  });

  it('limits are correct for each edition', () => {
    const free = new FeatureGate('free');
    expect(free.getLimit('verificationsPerDay')).toBe(20);
    expect(free.getLimit('maxDevices')).toBe(1);
    expect(free.getLimit('secureMessagesPerMonth')).toBe(0);

    const personal = new FeatureGate('personal');
    expect(personal.getLimit('verificationsPerDay')).toBe(-1);
    expect(personal.getLimit('secureMessagesPerMonth')).toBe(10);
    expect(personal.getLimit('zoomMeetingsPerMonth')).toBe(5);
    expect(personal.getLimit('secureFilesPerMonth')).toBe(0);

    const business = new FeatureGate('business');
    expect(business.getLimit('secureFilesPerMonth')).toBe(50);
    expect(business.getLimit('zoomMeetingsPerMonth')).toBe(-1);
    expect(business.getLimit('secureMessagesPerMonth')).toBe(100);

    const enterprise = new FeatureGate('enterprise');
    expect(enterprise.isUnlimited('maxDevices')).toBe(true);
    expect(enterprise.isUnlimited('secureFilesPerMonth')).toBe(true);
  });

  it('getRequiredEdition returns correct tier', () => {
    expect(FeatureGate.getRequiredEdition('shield_basic')).toBe('free');
    expect(FeatureGate.getRequiredEdition('secure_message_send')).toBe('personal');
    expect(FeatureGate.getRequiredEdition('crypto_basic')).toBe('personal');
    expect(FeatureGate.getRequiredEdition('zoom_verify_limited')).toBe('personal');
    expect(FeatureGate.getRequiredEdition('secure_file_send')).toBe('business');
    expect(FeatureGate.getRequiredEdition('zoom_monitor')).toBe('business');
    expect(FeatureGate.getRequiredEdition('siem_export')).toBe('enterprise');
    expect(FeatureGate.getRequiredEdition('sso_scim')).toBe('enterprise');
  });

  it('each higher edition is a superset of lower', () => {
    const editions: Array<'free' | 'personal' | 'business' | 'enterprise'> = [
      'free', 'personal', 'business', 'enterprise',
    ];
    for (let i = 0; i < editions.length - 1; i++) {
      const lower = new Set(EDITION_FEATURES[editions[i]]);
      const higher = new Set(EDITION_FEATURES[editions[i + 1]]);
      for (const feature of lower) {
        expect(higher.has(feature)).toBe(true);
      }
    }
  });
});
