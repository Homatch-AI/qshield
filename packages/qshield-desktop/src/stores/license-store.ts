import { create } from 'zustand';
import { isIPCAvailable } from '@/lib/mock-data';

/**
 * Edition types and features inlined to avoid pulling Node.js-only
 * modules from @qshield/core into the browser bundle.
 */
type QShieldEdition = 'free' | 'personal' | 'business' | 'enterprise';
type Feature =
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

const EDITION_FEATURES: Record<QShieldEdition, Feature[]> = {
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

export default useLicenseStore;
