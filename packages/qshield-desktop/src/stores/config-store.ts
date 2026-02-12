import { create } from 'zustand';
import { isIPCAvailable, mockConfig, mockPolicyRules } from '@/lib/mock-data';
import type { PolicyRule } from '@qshield/core';

interface ConfigStoreState {
  config: Record<string, unknown>;
  policyRules: PolicyRule[];
  loading: boolean;
  error: string | null;
}

interface ConfigStoreActions {
  fetchConfig: () => Promise<void>;
  updateConfig: (key: string, value: unknown) => Promise<void>;
  addPolicyRule: (rule: PolicyRule) => void;
  updatePolicyRule: (id: string, updates: Partial<PolicyRule>) => void;
  removePolicyRule: (id: string) => void;
}

type ConfigStore = ConfigStoreState & ConfigStoreActions;

const useConfigStore = create<ConfigStore>((set, get) => ({
  config: {},
  policyRules: [],
  loading: false,
  error: null,

  fetchConfig: async () => {
    set({ loading: true, error: null });
    try {
      if (isIPCAvailable()) {
        const config = await window.qshield.config.getAll();
        set({ config, loading: false, policyRules: mockPolicyRules() });
      } else {
        set({ config: mockConfig(), loading: false, policyRules: mockPolicyRules() });
      }
    } catch (err) {
      set({
        config: mockConfig(),
        policyRules: mockPolicyRules(),
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch config',
      });
    }
  },

  updateConfig: async (key: string, value: unknown) => {
    try {
      if (isIPCAvailable()) {
        await window.qshield.config.set(key, value);
      }
      const { config } = get();
      set({ config: { ...config, [key]: value } });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update config',
      });
    }
  },

  addPolicyRule: (rule: PolicyRule) => {
    set((s) => ({ policyRules: [...s.policyRules, rule] }));
  },

  updatePolicyRule: (id: string, updates: Partial<PolicyRule>) => {
    set((s) => ({
      policyRules: s.policyRules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    }));
  },

  removePolicyRule: (id: string) => {
    set((s) => ({ policyRules: s.policyRules.filter((r) => r.id !== id) }));
  },
}));

export default useConfigStore;
