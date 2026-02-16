export type Feature =
  // Shield
  | 'shield_basic'
  | 'shield_breathing'
  // Email Verification
  | 'verify_send'
  | 'verify_unlimited'
  | 'verify_remove_branding'
  | 'verify_custom_badge'
  | 'verify_analytics'
  | 'verify_custom_domain'
  // Secure Messages
  | 'secure_message_send'
  | 'secure_message_files'
  | 'secure_message_thread'
  | 'secure_message_analytics'
  // Secure File Attachments
  | 'secure_file_send'
  | 'secure_file_large'
  // Email Signature
  | 'email_signature'
  | 'email_signature_custom'
  // Crypto
  | 'crypto_basic'
  | 'crypto_monitor'
  | 'crypto_analytics'
  // Zoom / Teams
  | 'zoom_verify_limited'
  | 'zoom_monitor'
  | 'teams_monitor'
  // Monitoring
  | 'email_monitor'
  | 'file_monitor'
  | 'api_monitor'
  // Timeline
  | 'timeline_24h'
  | 'timeline_full'
  // Evidence
  | 'evidence_preview'
  | 'evidence_full'
  | 'evidence_export'
  | 'evidence_api_export'
  // Certificates
  | 'cert_basic'
  | 'cert_pro'
  // Alerts & Policy
  | 'alerts_basic'
  | 'alerts_full'
  | 'policy_engine'
  | 'escalation_rules'
  // Compliance & Enterprise
  | 'siem_export'
  | 'sso_scim'
  | 'compliance_dashboard'
  | 'insurance_readiness'
  | 'org_dashboard'
  | 'audit_log';

export type QShieldEdition = 'free' | 'personal' | 'business' | 'enterprise';

export const EDITION_FEATURES: Record<QShieldEdition, Feature[]> = {
  free: [
    'shield_basic',
    'verify_send',
    'email_signature',
    'timeline_24h',
    'evidence_preview',
    'alerts_basic',
  ],
  personal: [
    'shield_basic', 'shield_breathing',
    'verify_send', 'verify_unlimited', 'verify_remove_branding', 'verify_custom_badge',
    'email_signature', 'email_signature_custom',
    'timeline_24h', 'timeline_full',
    'evidence_preview', 'evidence_full',
    'alerts_basic',
    'secure_message_send',
    'crypto_basic',
    'zoom_verify_limited',
    'cert_basic',
  ],
  business: [
    'shield_basic', 'shield_breathing',
    'verify_send', 'verify_unlimited', 'verify_remove_branding', 'verify_custom_badge', 'verify_analytics',
    'email_signature', 'email_signature_custom',
    'timeline_24h', 'timeline_full',
    'evidence_preview', 'evidence_full', 'evidence_export',
    'alerts_basic', 'alerts_full',
    'secure_message_send', 'secure_message_files', 'secure_message_analytics',
    'crypto_basic', 'crypto_monitor',
    'zoom_verify_limited', 'zoom_monitor', 'teams_monitor',
    'cert_basic', 'cert_pro',
    'secure_file_send',
    'email_monitor', 'file_monitor',
    'policy_engine', 'escalation_rules',
  ],
  enterprise: [
    'shield_basic', 'shield_breathing',
    'verify_send', 'verify_unlimited', 'verify_remove_branding', 'verify_custom_badge', 'verify_analytics', 'verify_custom_domain',
    'email_signature', 'email_signature_custom',
    'timeline_24h', 'timeline_full',
    'evidence_preview', 'evidence_full', 'evidence_export', 'evidence_api_export',
    'alerts_basic', 'alerts_full',
    'secure_message_send', 'secure_message_files', 'secure_message_thread', 'secure_message_analytics',
    'crypto_basic', 'crypto_monitor', 'crypto_analytics',
    'zoom_verify_limited', 'zoom_monitor', 'teams_monitor',
    'cert_basic', 'cert_pro',
    'secure_file_send', 'secure_file_large',
    'email_monitor', 'file_monitor', 'api_monitor',
    'policy_engine', 'escalation_rules',
    'siem_export', 'sso_scim', 'compliance_dashboard', 'insurance_readiness', 'org_dashboard', 'audit_log',
  ],
};

export interface EditionLimits {
  maxDevices: number;
  retentionDays: number;
  certsPerMonth: number;
  verificationsPerDay: number;
  verificationHistoryDays: number;
  secureMessagesPerMonth: number;
  secureMessageMaxSize: number;
  secureFilesPerMonth: number;
  secureFileMaxSize: number;
  zoomMeetingsPerMonth: number;
}

export const EDITION_LIMITS: Record<QShieldEdition, EditionLimits> = {
  free: {
    maxDevices: 1,
    retentionDays: 7,
    certsPerMonth: 0,
    verificationsPerDay: 20,
    verificationHistoryDays: 7,
    secureMessagesPerMonth: 0,
    secureMessageMaxSize: 0,
    secureFilesPerMonth: 0,
    secureFileMaxSize: 0,
    zoomMeetingsPerMonth: 0,
  },
  personal: {
    maxDevices: 2,
    retentionDays: 30,
    certsPerMonth: 3,
    verificationsPerDay: -1,
    verificationHistoryDays: 30,
    secureMessagesPerMonth: 10,
    secureMessageMaxSize: 1 * 1024 * 1024,
    secureFilesPerMonth: 0,
    secureFileMaxSize: 0,
    zoomMeetingsPerMonth: 5,
  },
  business: {
    maxDevices: 10,
    retentionDays: 365,
    certsPerMonth: 50,
    verificationsPerDay: -1,
    verificationHistoryDays: 365,
    secureMessagesPerMonth: 100,
    secureMessageMaxSize: 10 * 1024 * 1024,
    secureFilesPerMonth: 50,
    secureFileMaxSize: 10 * 1024 * 1024,
    zoomMeetingsPerMonth: -1,
  },
  enterprise: {
    maxDevices: -1,
    retentionDays: -1,
    certsPerMonth: -1,
    verificationsPerDay: -1,
    verificationHistoryDays: -1,
    secureMessagesPerMonth: -1,
    secureMessageMaxSize: 100 * 1024 * 1024,
    secureFilesPerMonth: -1,
    secureFileMaxSize: 100 * 1024 * 1024,
    zoomMeetingsPerMonth: -1,
  },
};

export class FeatureGate {
  private features: Set<Feature>;
  private edition: QShieldEdition;
  private limits: EditionLimits;

  constructor(edition: QShieldEdition = 'free') {
    this.edition = edition;
    this.features = new Set(EDITION_FEATURES[edition]);
    this.limits = EDITION_LIMITS[edition];
  }

  has(feature: Feature): boolean {
    return this.features.has(feature);
  }

  getEdition(): QShieldEdition {
    return this.edition;
  }

  getLimits(): EditionLimits {
    return this.limits;
  }

  getLimit<K extends keyof EditionLimits>(key: K): EditionLimits[K] {
    return this.limits[key];
  }

  isUnlimited(key: keyof EditionLimits): boolean {
    return this.limits[key] === -1;
  }

  /** Returns the minimum edition required for a feature */
  static getRequiredEdition(feature: Feature): QShieldEdition {
    const editions: QShieldEdition[] = ['free', 'personal', 'business', 'enterprise'];
    for (const ed of editions) {
      if (EDITION_FEATURES[ed].includes(feature)) return ed;
    }
    return 'enterprise';
  }

  /** Returns human-readable edition label */
  static editionLabel(edition: QShieldEdition): string {
    const labels: Record<QShieldEdition, string> = {
      free: 'Free',
      personal: 'Personal',
      business: 'Business',
      enterprise: 'Enterprise',
    };
    return labels[edition];
  }

  /** Returns price string for display */
  static editionPrice(edition: QShieldEdition): string {
    const prices: Record<QShieldEdition, string> = {
      free: 'Free',
      personal: '$9/mo',
      business: '$29/seat/mo',
      enterprise: 'Custom',
    };
    return prices[edition];
  }
}
