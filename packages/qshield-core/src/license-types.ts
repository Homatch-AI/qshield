/** Supported QShield product editions. */
export type QShieldEdition = 'personal' | 'business' | 'enterprise';

/** Gated features that may be enabled or disabled per edition. */
export type Feature =
  | 'overlay_shield'
  | 'evidence_vault'
  | 'zoom_monitor'
  | 'teams_monitor'
  | 'email_monitor'
  | 'policy_engine'
  | 'siem_export'
  | 'enterprise_alerting'
  | 'trust_certificates'
  | 'advanced_analytics';

/** A signed QShield license payload. */
export interface QShieldLicense {
  /** Unique license identifier. */
  license_id: string;
  /** Product edition. */
  edition: QShieldEdition;
  /** ISO 8601 expiration timestamp. */
  expires_at: string;
  /** Features granted by this license. */
  features: Feature[];
  /** Optional usage limits. */
  limits?: {
    max_devices?: number;
    evidence_retention_days?: number;
  };
  /** Cryptographic signature over the license payload. */
  signature: string;
}

/** Features included in each edition. */
export const EDITION_FEATURES: Record<QShieldEdition, Feature[]> = {
  personal: ['overlay_shield'],
  business: [
    'overlay_shield',
    'evidence_vault',
    'zoom_monitor',
    'teams_monitor',
    'email_monitor',
    'policy_engine',
    'trust_certificates',
  ],
  enterprise: [
    'overlay_shield',
    'evidence_vault',
    'zoom_monitor',
    'teams_monitor',
    'email_monitor',
    'policy_engine',
    'siem_export',
    'enterprise_alerting',
    'trust_certificates',
    'advanced_analytics',
  ],
};
