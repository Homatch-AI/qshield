/** User edition tiers — each is a superset of the tier below. */
export type QShieldEdition = 'free' | 'personal' | 'business' | 'enterprise';

/** All feature flags in the system. */
export type Feature =
  // Shield
  | 'shield_basic'
  | 'shield_breathing'
  // Email verification (viral engine)
  | 'verify_send'
  | 'verify_tls_check'
  | 'verify_routing_check'
  | 'verify_intercept_scan'
  | 'verify_custom_badge'
  | 'verify_remove_branding'
  | 'verify_analytics'
  | 'verify_bulk_api'
  | 'verify_custom_domain'
  // Timeline
  | 'timeline_24h'
  | 'timeline_full'
  // Evidence
  | 'evidence_preview'
  | 'evidence_full'
  | 'evidence_export'
  | 'evidence_api_export'
  // Crypto
  | 'crypto_basic'
  | 'crypto_monitor'
  | 'crypto_analytics'
  // Monitoring adapters
  | 'zoom_monitor'
  | 'teams_monitor'
  | 'email_monitor'
  | 'file_monitor'
  | 'api_monitor'
  // Certificates
  | 'cert_basic'
  | 'cert_pro'
  | 'email_signature'
  // Policy & alerts
  | 'alerts_basic'
  | 'alerts_full'
  | 'policy_engine'
  | 'auto_freeze'
  | 'escalation_rules'
  | 'policy_templates'
  // Compliance & enterprise
  | 'siem_export'
  | 'audit_log'
  | 'compliance_dashboard'
  | 'sso_scim'
  | 'org_dashboard'
  | 'soc_routing'
  | 'insurance_readiness';

/** License limits per edition. Use -1 for unlimited. */
export interface EditionLimits {
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
  limits: EditionLimits;
  /** Cryptographic signature over the license payload. */
  signature: string;
}

// ── Edition feature sets ─────────────────────────────────────────────────────

const FREE_FEATURES: Feature[] = [
  'shield_basic', 'verify_send', 'email_signature',
  'timeline_24h', 'evidence_preview', 'alerts_basic',
];

const PERSONAL_FEATURES: Feature[] = [
  ...FREE_FEATURES,
  'shield_breathing', 'verify_tls_check', 'verify_routing_check',
  'verify_custom_badge', 'verify_remove_branding',
  'timeline_full', 'evidence_full', 'cert_basic', 'crypto_basic',
];

const BUSINESS_FEATURES: Feature[] = [
  ...PERSONAL_FEATURES,
  'verify_intercept_scan', 'verify_analytics', 'verify_bulk_api',
  'zoom_monitor', 'teams_monitor', 'email_monitor',
  'evidence_export', 'alerts_full', 'policy_engine', 'auto_freeze',
  'audit_log', 'crypto_monitor',
];

const ENTERPRISE_FEATURES: Feature[] = [
  ...BUSINESS_FEATURES,
  'verify_custom_domain', 'file_monitor', 'api_monitor',
  'evidence_api_export', 'cert_pro', 'escalation_rules', 'policy_templates',
  'siem_export', 'compliance_dashboard', 'sso_scim', 'org_dashboard',
  'soc_routing', 'insurance_readiness', 'crypto_analytics',
];

/** Features included in each edition. */
export const EDITION_FEATURES: Record<QShieldEdition, Feature[]> = {
  free: FREE_FEATURES,
  personal: PERSONAL_FEATURES,
  business: BUSINESS_FEATURES,
  enterprise: ENTERPRISE_FEATURES,
};

/** Default limits for each edition. */
export const EDITION_LIMITS: Record<QShieldEdition, EditionLimits> = {
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
