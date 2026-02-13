import { create } from 'zustand';
import type { QShieldEdition, Feature } from '@qshield/core';
import { EDITION_FEATURES } from '@qshield/core';
import { isIPCAvailable } from '@/lib/mock-data';

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
