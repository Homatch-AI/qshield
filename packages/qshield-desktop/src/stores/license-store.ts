import { create } from 'zustand';
import { isIPCAvailable } from '@/lib/mock-data';

/**
 * Edition types and features inlined to avoid pulling Node.js-only
 * modules from @qshield/core into the browser bundle.
 */
type QShieldEdition = 'free' | 'personal' | 'business' | 'enterprise';
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

const EDITION_ORDER: QShieldEdition[] = ['free', 'personal', 'business', 'enterprise'];

const EDITION_FEATURES: Record<QShieldEdition, Feature[]> = {
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

/** Get the minimum edition required for a feature. */
function getRequiredEdition(feature: Feature): QShieldEdition {
  for (const edition of EDITION_ORDER) {
    if (EDITION_FEATURES[edition].includes(feature)) return edition;
  }
  return 'enterprise';
}

const EDITION_LABELS: Record<QShieldEdition, string> = {
  free: 'Free',
  personal: 'Personal',
  business: 'Business',
  enterprise: 'Enterprise',
};

interface LicenseStoreState {
  edition: QShieldEdition;
  features: Feature[];
  loading: boolean;
}

interface LicenseStoreActions {
  fetchLicense: () => Promise<void>;
  hasFeature: (feature: Feature) => boolean;
  /** Dev-only: switch edition locally without IPC. */
  setDevEdition: (edition: QShieldEdition) => void;
}

type LicenseStore = LicenseStoreState & LicenseStoreActions;

const useLicenseStore = create<LicenseStore>((set, get) => ({
  edition: 'free',
  features: [],
  loading: true,

  fetchLicense: async () => {
    set({ loading: true });
    try {
      if (isIPCAvailable()) {
        const license = await window.qshield.license.get() as {
          edition?: QShieldEdition;
          features?: Feature[];
        } | null;
        if (license && license.edition) {
          set({
            edition: license.edition,
            features: license.features ?? EDITION_FEATURES[license.edition] ?? [],
            loading: false,
          });
          return;
        }
      }
      // No license or IPC unavailable — default to free
      set({ edition: 'free', features: [], loading: false });
    } catch {
      set({ edition: 'free', features: [], loading: false });
    }
  },

  hasFeature: (feature: Feature) => {
    return get().features.includes(feature);
  },

  setDevEdition: (edition: QShieldEdition) => {
    set({
      edition,
      features: EDITION_FEATURES[edition] ?? [],
      loading: false,
    });
  },
}));

export { getRequiredEdition, EDITION_LABELS, EDITION_FEATURES, EDITION_ORDER };
export type { Feature, QShieldEdition };
export default useLicenseStore;
