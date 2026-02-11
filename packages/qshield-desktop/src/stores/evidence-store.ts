import { create } from 'zustand';
import type { EvidenceRecord } from '@qshield/core';
import { PAGINATION_DEFAULTS } from '@/lib/constants';

interface EvidenceStoreState {
  items: EvidenceRecord[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  selectedRecord: EvidenceRecord | null;
  searchQuery: string;
}

interface EvidenceStoreActions {
  fetchList: () => Promise<void>;
  fetchOne: (id: string) => Promise<void>;
  verify: (id: string) => Promise<{ valid: boolean; message: string }>;
  search: (query: string) => Promise<void>;
  exportRecords: (ids: string[]) => Promise<{ path: string }>;
  setPage: (page: number) => void;
  setSelected: (id: string | null) => void;
}

type EvidenceStore = EvidenceStoreState & EvidenceStoreActions;

const useEvidenceStore = create<EvidenceStore>((set, get) => ({
  items: [],
  total: 0,
  page: PAGINATION_DEFAULTS.initialPage,
  pageSize: PAGINATION_DEFAULTS.pageSize,
  hasMore: false,
  loading: false,
  error: null,
  selectedId: null,
  selectedRecord: null,
  searchQuery: '',

  fetchList: async () => {
    const { page, pageSize } = get();
    set({ loading: true, error: null });
    try {
      const result = await window.qshield.evidence.list({ page, pageSize });
      set({
        items: result.items,
        total: result.total,
        hasMore: result.hasMore,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch evidence',
      });
    }
  },

  fetchOne: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const record = await window.qshield.evidence.getOne(id);
      set({ selectedRecord: record, selectedId: id, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch evidence record',
      });
    }
  },

  verify: async (id: string) => {
    try {
      const result = await window.qshield.evidence.verify(id);
      if (result.valid) {
        const { items } = get();
        set({
          items: items.map((item) =>
            item.id === id ? { ...item, verified: true } : item,
          ),
        });
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      return { valid: false, message };
    }
  },

  search: async (query: string) => {
    set({ loading: true, error: null, searchQuery: query });
    try {
      if (!query.trim()) {
        await get().fetchList();
        return;
      }
      const results = await window.qshield.evidence.search(query);
      set({
        items: results,
        total: results.length,
        hasMore: false,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Search failed',
      });
    }
  },

  exportRecords: async (ids: string[]) => {
    return window.qshield.evidence.export(ids);
  },

  setPage: (page: number) => {
    set({ page });
    get().fetchList();
  },

  setSelected: (id: string | null) => {
    set({ selectedId: id, selectedRecord: null });
    if (id) {
      get().fetchOne(id);
    }
  },
}));

export default useEvidenceStore;
