import type { Feature, QShieldEdition } from './types/features';
import { EDITION_FEATURES } from './types/features';

/** License-specific limits (snake_case, used by QShieldLicense payloads). */
export interface LicenseLimits {
  /** Maximum number of devices. -1 = unlimited. */
  max_devices: number;
  /** Evidence retention in days. -1 = unlimited. */
  evidence_retention_days: number;
  /** Certificates per month. -1 = unlimited. */
  certs_per_month: number;
  /** Number of integrations. -1 = unlimited. */
  integrations: number;
  /** Email verifications per day. -1 = unlimited. */
  verifications_per_day: number;
  /** Verification history retention in days. -1 = unlimited. */
  verification_history_days: number;
}

/** Signed license payload. */
export interface QShieldLicense {
  /** Unique license identifier. */
  license_id: string;
  /** Product edition. */
  edition: QShieldEdition;
  /** ISO 8601 expiration timestamp. */
  expires_at: string;
  /** Features granted by this license. */
  features: Feature[];
  /** Usage limits for this license. */
  limits: LicenseLimits;
  /** Cryptographic signature over the license payload. */
  signature: string;
}

// ── Edition license limits ──────────────────────────────────────────────────

/** Default license limits for each edition. */
export const LICENSE_LIMITS: Record<QShieldEdition, LicenseLimits> = {
  free:       { max_devices: 1,  evidence_retention_days: 7,   certs_per_month: 0,  integrations: 0,  verifications_per_day: 20, verification_history_days: 7 },
  personal:   { max_devices: 2,  evidence_retention_days: 30,  certs_per_month: 3,  integrations: 0,  verifications_per_day: -1, verification_history_days: 30 },
  business:   { max_devices: 10, evidence_retention_days: 365, certs_per_month: 50, integrations: 3,  verifications_per_day: -1, verification_history_days: 365 },
  enterprise: { max_devices: -1, evidence_retention_days: -1,  certs_per_month: -1, integrations: -1, verifications_per_day: -1, verification_history_days: -1 },
};

/** Human-readable edition labels. */
export const EDITION_LABELS: Record<QShieldEdition, string> = {
  free: 'Free',
  personal: 'Personal',
  business: 'Business',
  enterprise: 'Enterprise',
};

/** Edition sort order for comparison UIs. */
export const EDITION_ORDER: QShieldEdition[] = ['free', 'personal', 'business', 'enterprise'];

/**
 * Get the minimum edition required for a feature.
 *
 * @param feature - The feature to look up
 * @returns The lowest edition that includes this feature
 */
export function getRequiredEdition(feature: Feature): QShieldEdition {
  for (const edition of EDITION_ORDER) {
    if (EDITION_FEATURES[edition].includes(feature)) return edition;
  }
  return 'enterprise';
}

/**
 * Check if edition A is at least as high as edition B.
 *
 * @param current - The edition to check
 * @param required - The minimum required edition
 * @returns True if current >= required in the edition hierarchy
 */
export function isEditionAtLeast(current: QShieldEdition, required: QShieldEdition): boolean {
  return EDITION_ORDER.indexOf(current) >= EDITION_ORDER.indexOf(required);
}
