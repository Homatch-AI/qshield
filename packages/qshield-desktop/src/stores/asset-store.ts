import { create } from 'zustand';
import { isIPCAvailable } from '@/lib/mock-data';

// ── Types (renderer-safe, no value imports from @qshield/core) ────────────────

type AssetSensitivity = 'normal' | 'strict' | 'critical';
type AssetTrustState = 'verified' | 'changed' | 'unverified';

interface HighTrustAsset {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  sensitivity: AssetSensitivity;
  trustState: AssetTrustState;
  trustScore: number;
  contentHash: string | null;
  verifiedHash: string | null;
  createdAt: string;
  lastVerified: string | null;
  lastChanged: string | null;
  changeCount: number;
  evidenceCount: number;
  enabled: boolean;
}

interface AssetChangeEvent {
  assetId: string;
  path: string;
  sensitivity: AssetSensitivity;
  eventType: string;
  previousHash: string | null;
  newHash: string | null;
  trustStateBefore: string;
  trustStateAfter: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

interface AssetStats {
  total: number;
  verified: number;
  changed: number;
  unverified: number;
  bySensitivity: Record<string, number>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface AssetState {
  assets: HighTrustAsset[];
  loading: boolean;
  error: string | null;
  stats: AssetStats | null;
  changeLogs: Record<string, AssetChangeEvent[]>;
  _subscribed: boolean;

  fetchAssets: () => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchChangeLog: (id: string) => Promise<void>;
  addAsset: (path: string, type: 'file' | 'directory', sensitivity: AssetSensitivity, name?: string) => Promise<HighTrustAsset>;
  removeAsset: (id: string) => Promise<void>;
  verifyAsset: (id: string) => Promise<void>;
  acceptChanges: (id: string) => Promise<void>;
  updateSensitivity: (id: string, sensitivity: AssetSensitivity) => Promise<void>;
  enableAsset: (id: string, enabled: boolean) => Promise<void>;
  browseForPath: () => Promise<string | null>;
  subscribe: () => void;
}

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: [],
  loading: false,
  error: null,
  stats: null,
  changeLogs: {},
  _subscribed: false,

  fetchAssets: async () => {
    set({ loading: true, error: null });
    try {
      if (isIPCAvailable()) {
        const assets = await window.qshield.assets.list();
        set({ assets, loading: false });
      } else {
        set({ assets: [], loading: false });
      }
    } catch (err) {
      set({
        assets: [],
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch assets',
      });
    }
  },

  fetchStats: async () => {
    try {
      if (isIPCAvailable()) {
        const stats = await window.qshield.assets.stats();
        set({ stats });
      }
    } catch (err) {
      console.error('[AssetStore] Failed to fetch stats:', err);
    }
  },

  fetchChangeLog: async (id: string) => {
    try {
      if (isIPCAvailable()) {
        const log = await window.qshield.assets.changeLog(id, 20);
        set((s) => ({ changeLogs: { ...s.changeLogs, [id]: log } }));
      }
    } catch (err) {
      console.error('[AssetStore] Failed to fetch change log:', err);
    }
  },

  addAsset: async (assetPath, type, sensitivity, name) => {
    if (!isIPCAvailable()) throw new Error('IPC not available');
    const asset = await window.qshield.assets.add(assetPath, type, sensitivity, name);
    // Refresh list and stats
    await get().fetchAssets();
    await get().fetchStats();
    return asset;
  },

  removeAsset: async (id) => {
    if (!isIPCAvailable()) return;
    await window.qshield.assets.remove(id);
    await get().fetchAssets();
    await get().fetchStats();
  },

  verifyAsset: async (id) => {
    if (!isIPCAvailable()) return;
    await window.qshield.assets.verify(id);
    await get().fetchAssets();
    await get().fetchStats();
  },

  acceptChanges: async (id) => {
    if (!isIPCAvailable()) return;
    await window.qshield.assets.accept(id);
    await get().fetchAssets();
    await get().fetchStats();
  },

  updateSensitivity: async (id, sensitivity) => {
    if (!isIPCAvailable()) return;
    await window.qshield.assets.updateSensitivity(id, sensitivity);
    await get().fetchAssets();
  },

  enableAsset: async (id, enabled) => {
    if (!isIPCAvailable()) return;
    await window.qshield.assets.enable(id, enabled);
    await get().fetchAssets();
  },

  browseForPath: async () => {
    if (!isIPCAvailable()) return null;
    const result = await window.qshield.assets.browse();
    if (result.canceled || !result.path) return null;
    return result.path;
  },

  subscribe: () => {
    if (get()._subscribed) return;
    set({ _subscribed: true });
    if (isIPCAvailable()) {
      window.qshield.assets.onChanged(() => {
        // Auto-refresh on any asset change event
        get().fetchAssets();
        get().fetchStats();
      });
    }
  },
}));
