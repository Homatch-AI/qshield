/** Supported QShield product editions. */
export type QShieldEdition = 'free' | 'personal' | 'business' | 'enterprise';

/** Gated features that may be enabled or disabled per edition. */
export type Feature =
  // Monitoring (11)
  | 'dashboard'
  | 'trust_score'
  | 'overlay_shield'
  | 'zoom_monitor'
  | 'teams_monitor'
  | 'email_monitor'
  | 'slack_monitor'
  | 'gdrive_monitor'
  | 'browser_monitor'
  | 'screen_monitor'
  | 'clipboard_monitor'
  // Security (8)
  | 'crypto_guard'
  | 'phishing_detection'
  | 'dlp_scanning'
  | 'device_trust'
  | 'network_monitor'
  | 'usb_monitor'
  | 'evidence_vault'
  | 'trust_certificates'
  // Reporting (5)
  | 'custom_reports'
  | 'compliance_dashboard'
  | 'scheduled_reports'
  | 'audit_trail'
  | 'advanced_analytics'
  // Integration (5)
  | 'api_access'
  | 'webhook_notifications'
  | 'sso_integration'
  | 'ldap_sync'
  | 'siem_export'
  // Management (6)
  | 'policy_engine'
  | 'enterprise_alerting'
  | 'multi_tenant'
  | 'role_based_access'
  | 'remote_wipe'
  | 'custom_branding';

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
  /** Optional usage limits. Use -1 for unlimited. */
  limits?: {
    max_devices?: number;
    evidence_retention_days?: number;
    max_certificates_per_month?: number;
    max_users?: number;
    max_monitors?: number;
    max_policies?: number;
  };
  /** Cryptographic signature over the license payload. */
  signature: string;
}

/** Features included in each edition. */
export const EDITION_FEATURES: Record<QShieldEdition, Feature[]> = {
  free: [
    'dashboard',
    'trust_score',
    'overlay_shield',
    'clipboard_monitor',
  ],
  personal: [
    'dashboard',
    'trust_score',
    'overlay_shield',
    'clipboard_monitor',
    'zoom_monitor',
    'teams_monitor',
    'email_monitor',
    'crypto_guard',
    'phishing_detection',
    'evidence_vault',
  ],
  business: [
    'dashboard',
    'trust_score',
    'overlay_shield',
    'clipboard_monitor',
    'zoom_monitor',
    'teams_monitor',
    'email_monitor',
    'crypto_guard',
    'phishing_detection',
    'evidence_vault',
    'slack_monitor',
    'gdrive_monitor',
    'browser_monitor',
    'screen_monitor',
    'dlp_scanning',
    'device_trust',
    'network_monitor',
    'usb_monitor',
    'trust_certificates',
    'custom_reports',
    'policy_engine',
    'api_access',
  ],
  enterprise: [
    'dashboard',
    'trust_score',
    'overlay_shield',
    'clipboard_monitor',
    'zoom_monitor',
    'teams_monitor',
    'email_monitor',
    'crypto_guard',
    'phishing_detection',
    'evidence_vault',
    'slack_monitor',
    'gdrive_monitor',
    'browser_monitor',
    'screen_monitor',
    'dlp_scanning',
    'device_trust',
    'network_monitor',
    'usb_monitor',
    'trust_certificates',
    'custom_reports',
    'policy_engine',
    'api_access',
    'compliance_dashboard',
    'scheduled_reports',
    'audit_trail',
    'advanced_analytics',
    'webhook_notifications',
    'sso_integration',
    'ldap_sync',
    'siem_export',
    'enterprise_alerting',
    'multi_tenant',
    'role_based_access',
    'remote_wipe',
    'custom_branding',
  ],
};
