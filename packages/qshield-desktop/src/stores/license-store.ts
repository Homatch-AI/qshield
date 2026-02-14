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

const EDITION_ORDER: QShieldEdition[] = ['free', 'personal', 'business', 'enterprise'];

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

const EDITION_FEATURES: Record<QShieldEdition, Feature[]> = {
  free: FREE_FEATURES,
  personal: PERSONAL_FEATURES,
  business: BUSINESS_FEATURES,
  enterprise: ENTERPRISE_FEATURES,
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
}));

export { getRequiredEdition, EDITION_LABELS, EDITION_FEATURES, EDITION_ORDER };
export type { Feature, QShieldEdition };
export default useLicenseStore;
