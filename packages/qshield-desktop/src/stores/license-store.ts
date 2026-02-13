import { create } from 'zustand';
import { isIPCAvailable } from '@/lib/mock-data';

/**
 * Edition types and features inlined to avoid pulling Node.js-only
 * modules from @qshield/core into the browser bundle.
 */
type QShieldEdition = 'personal' | 'business' | 'enterprise';
type Feature =
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

const EDITION_FEATURES: Record<QShieldEdition, Feature[]> = {
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
  edition: 'personal',
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
      // No license or IPC unavailable — default to personal
      set({ edition: 'personal', features: [], loading: false });
    } catch {
      set({ edition: 'personal', features: [], loading: false });
    }
  },

  hasFeature: (feature: Feature) => {
    return get().features.includes(feature);
  },
}));

export default useLicenseStore;
