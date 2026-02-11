import { create } from 'zustand';

interface ConfigStoreState {
  config: Record<string, unknown>;
  loading: boolean;
  error: string | null;
}

interface ConfigStoreActions {
  fetchConfig: () => Promise<void>;
  updateConfig: (key: string, value: unknown) => Promise<void>;
}

type ConfigStore = ConfigStoreState & ConfigStoreActions;

const useConfigStore = create<ConfigStore>((set, get) => ({
  config: {},
  loading: false,
  error: null,

  fetchConfig: async () => {
    set({ loading: true, error: null });
    try {
      const config = await window.qshield.config.getAll();
      set({ config, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch config',
      });
    }
  },

  updateConfig: async (key: string, value: unknown) => {
    try {
      await window.qshield.config.set(key, value);
      const { config } = get();
      set({ config: { ...config, [key]: value } });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update config',
      });
    }
  },
}));

export default useConfigStore;
