import { create } from 'zustand';
import { isIPCAvailable } from '@/lib/mock-data';

/**
 * License tier and feature types — inlined to avoid pulling Node.js-only
 * modules from @qshield/core into the browser bundle.
 */
type LicenseTier = 'trial' | 'personal' | 'pro' | 'business' | 'enterprise';

/** Keep the old QShieldEdition type as an alias for backward compat */
type QShieldEdition = LicenseTier;

interface FeatureFlags {
  maxAdapters: number;
  maxHighTrustAssets: number;
  emailNotifications: boolean;
  dailySummary: boolean;
  trustReports: boolean;
  assetReports: boolean;
  trustProfile: boolean;
  keyRotation: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
  customBranding: boolean;
}

// ── Legacy Feature type for sidebar nav gating ──────────────────────────

type Feature =
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

const EDITION_ORDER: QShieldEdition[] = ['personal', 'pro', 'business', 'enterprise'];

/** Map tiers to legacy Feature arrays for sidebar nav compatibility */
const EDITION_FEATURES: Record<string, Feature[]> = {
  trial: [
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
  personal: [
    'shield_basic',
    'verify_send',
    'email_signature',
    'timeline_24h',
    'evidence_preview',
    'alerts_basic',
    'crypto_basic',
    'cert_basic',
  ],
  pro: [
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
    'email_monitor', 'file_monitor',
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
    'email_monitor', 'file_monitor', 'api_monitor',
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
  // Legacy aliases
  free: [
    'shield_basic',
    'verify_send',
    'email_signature',
    'timeline_24h',
    'evidence_preview',
    'alerts_basic',
  ],
};

/** Get the minimum edition required for a feature. */
function getRequiredEdition(feature: Feature): QShieldEdition {
  for (const edition of EDITION_ORDER) {
    if (EDITION_FEATURES[edition]?.includes(feature)) return edition;
  }
  return 'enterprise';
}

const EDITION_LABELS: Record<string, string> = {
  trial: 'Trial',
  personal: 'Personal',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
  free: 'Free',
};

const DEFAULT_FEATURES: FeatureFlags = {
  maxAdapters: 6,
  maxHighTrustAssets: 5,
  emailNotifications: true,
  dailySummary: true,
  trustReports: true,
  assetReports: true,
  trustProfile: true,
  keyRotation: false,
  apiAccess: false,
  prioritySupport: false,
  customBranding: false,
};

interface LicenseStoreState {
  tier: LicenseTier;
  /** @deprecated Use tier instead */
  edition: QShieldEdition;
  email: string;
  isValid: boolean;
  isExpired: boolean;
  daysRemaining: number;
  isTrial: boolean;
  features: FeatureFlags;
  legacyFeatures: Feature[];
  loading: boolean;
  error: string | null;
}

interface LicenseStoreActions {
  fetchLicense: () => Promise<void>;
  activate: (key: string) => Promise<void>;
  deactivate: () => Promise<void>;
  hasFeature: (feature: Feature | keyof FeatureFlags) => boolean;
}

type LicenseStore = LicenseStoreState & LicenseStoreActions;

const useLicenseStore = create<LicenseStore>((set, get) => ({
  tier: 'trial',
  edition: 'trial',
  email: '',
  isValid: true,
  isExpired: false,
  daysRemaining: 14,
  isTrial: true,
  features: DEFAULT_FEATURES,
  legacyFeatures: EDITION_FEATURES.trial ?? [],
  loading: true,
  error: null,

  fetchLicense: async () => {
    set({ loading: true, error: null });
    try {
      if (isIPCAvailable()) {
        const license = await window.qshield.license.get();
        const info = license as {
          tier: LicenseTier;
          email: string;
          isValid: boolean;
          isExpired: boolean;
          daysRemaining: number;
          features: FeatureFlags;
        };
        set({
          tier: info.tier,
          edition: info.tier,
          email: info.email,
          isValid: info.isValid,
          isExpired: info.isExpired,
          daysRemaining: info.daysRemaining,
          isTrial: info.tier === 'trial',
          features: info.features ?? DEFAULT_FEATURES,
          legacyFeatures: EDITION_FEATURES[info.tier] ?? EDITION_FEATURES.trial ?? [],
          loading: false,
        });
        return;
      }
      set({ loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load license' });
    }
  },

  activate: async (key: string) => {
    set({ loading: true, error: null });
    try {
      if (!isIPCAvailable()) throw new Error('IPC not available');
      const license = await window.qshield.license.activate(key);
      const info = license as {
        tier: LicenseTier;
        email: string;
        isValid: boolean;
        isExpired: boolean;
        daysRemaining: number;
        features: FeatureFlags;
      };
      set({
        tier: info.tier,
        edition: info.tier,
        email: info.email,
        isValid: info.isValid,
        isExpired: info.isExpired,
        daysRemaining: info.daysRemaining,
        isTrial: info.tier === 'trial',
        features: info.features ?? DEFAULT_FEATURES,
        legacyFeatures: EDITION_FEATURES[info.tier] ?? [],
        loading: false,
        error: null,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Invalid license key' });
      throw err;
    }
  },

  deactivate: async () => {
    set({ loading: true, error: null });
    try {
      if (!isIPCAvailable()) throw new Error('IPC not available');
      const license = await window.qshield.license.deactivate();
      const info = license as {
        tier: LicenseTier;
        email: string;
        isValid: boolean;
        isExpired: boolean;
        daysRemaining: number;
        features: FeatureFlags;
      };
      set({
        tier: info.tier,
        edition: info.tier,
        email: info.email,
        isValid: info.isValid,
        isExpired: info.isExpired,
        daysRemaining: info.daysRemaining,
        isTrial: true,
        features: info.features ?? DEFAULT_FEATURES,
        legacyFeatures: EDITION_FEATURES.trial ?? [],
        loading: false,
        error: null,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to deactivate' });
    }
  },

  hasFeature: (feature: Feature | keyof FeatureFlags) => {
    const state = get();
    // Check new FeatureFlags first
    if (feature in state.features) {
      const val = state.features[feature as keyof FeatureFlags];
      if (typeof val === 'boolean') return val;
      if (typeof val === 'number') return val > 0;
    }
    // Fall back to legacy feature list
    return state.legacyFeatures.includes(feature as Feature);
  },
}));

export { getRequiredEdition, EDITION_LABELS, EDITION_FEATURES, EDITION_ORDER, DEFAULT_FEATURES };
export type { Feature, QShieldEdition, LicenseTier, FeatureFlags };
export default useLicenseStore;
