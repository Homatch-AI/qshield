import { create } from 'zustand';
import type { EvidenceRecord } from '@qshield/core';
import { PAGINATION_DEFAULTS } from '@/lib/constants';
import { isIPCAvailable, mockEvidenceChain, mockEvidenceList } from '@/lib/mock-data';

/** Cached mock evidence chain so records remain stable across fetches */
let _mockRecords: EvidenceRecord[] | null = null;
function getMockRecords(): EvidenceRecord[] {
  if (!_mockRecords) _mockRecords = mockEvidenceChain(30);
  return _mockRecords;
}

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
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  selectedIds: Set<string>;
}

interface EvidenceStoreActions {
  fetchList: () => Promise<void>;
  fetchOne: (id: string) => Promise<void>;
  verify: (id: string) => Promise<{ valid: boolean; message: string }>;
  search: (query: string) => Promise<void>;
  exportRecords: (ids: string[]) => Promise<{ path: string }>;
  setPage: (page: number) => void;
  setSelected: (id: string | null) => void;
  setSort: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  toggleSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
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
  sortBy: 'timestamp',
  sortOrder: 'desc',
  selectedIds: new Set(),

  fetchList: async () => {
    const { page, pageSize, sortBy, sortOrder, searchQuery } = get();
    set({ loading: true, error: null });
    try {
      if (isIPCAvailable()) {
        const result = await window.qshield.evidence.list({ page, pageSize });
        set({
          items: result.items,
          total: result.total,
          hasMore: result.hasMore,
          loading: false,
        });
      } else {
        const result = mockEvidenceList(getMockRecords(), {
          page,
          pageSize,
          sortBy,
          sortOrder,
          filter: searchQuery ? { search: searchQuery } : undefined,
        });
        set({
          items: result.items,
          total: result.total,
          hasMore: result.hasMore,
          loading: false,
        });
      }
    } catch (err) {
      // Fallback to mock
      const result = mockEvidenceList(getMockRecords(), { page, pageSize });
      set({
        items: result.items,
        total: result.total,
        hasMore: result.hasMore,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch evidence',
      });
    }
  },

  fetchOne: async (id: string) => {
    set({ loading: true, error: null });
    try {
      if (isIPCAvailable()) {
        const record = await window.qshield.evidence.getOne(id);
        set({ selectedRecord: record, selectedId: id, loading: false });
      } else {
        const record = getMockRecords().find((r) => r.id === id) ?? null;
        set({ selectedRecord: record, selectedId: id, loading: false });
      }
    } catch (err) {
      const record = getMockRecords().find((r) => r.id === id) ?? null;
      set({
        selectedRecord: record,
        selectedId: id,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch evidence record',
      });
    }
  },

  verify: async (id: string) => {
    try {
      if (isIPCAvailable()) {
        const result = await window.qshield.evidence.verify(id);
        const message = result.valid
          ? 'HMAC-SHA256 hash chain verified successfully.'
          : (result.errors?.[0] ?? 'Verification failed');
        if (result.valid) {
          const { items, selectedRecord } = get();
          set({
            items: items.map((item) => (item.id === id ? { ...item, verified: true } : item)),
            selectedRecord: selectedRecord?.id === id ? { ...selectedRecord, verified: true } : selectedRecord,
          });
        }
        return { valid: result.valid, message };
      } else {
        // Mock verification - always succeeds
        const { items } = get();
        set({
          items: items.map((item) => (item.id === id ? { ...item, verified: true } : item)),
        });
        // Also update mock cache
        const mock = getMockRecords();
        const idx = mock.findIndex((r) => r.id === id);
        if (idx >= 0) mock[idx] = { ...mock[idx], verified: true };
        return { valid: true, message: 'HMAC-SHA256 hash chain verified successfully.' };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      return { valid: false, message };
    }
  },

  search: async (query: string) => {
    set({ loading: true, error: null, searchQuery: query, page: 1 });
    try {
      if (!query.trim()) {
        set({ searchQuery: '' });
        await get().fetchList();
        return;
      }
      if (isIPCAvailable()) {
        const results = await window.qshield.evidence.search(query);
        set({
          items: results.items,
          total: results.total,
          hasMore: results.hasMore,
          loading: false,
        });
      } else {
        const result = mockEvidenceList(getMockRecords(), {
          page: 1,
          pageSize: get().pageSize,
          filter: { search: query },
        });
        set({
          items: result.items,
          total: result.total,
          hasMore: result.hasMore,
          loading: false,
        });
      }
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Search failed',
      });
    }
  },

  exportRecords: async (ids: string[]) => {
    if (isIPCAvailable()) {
      return window.qshield.evidence.export(ids);
    }
    return { path: '/mock/export/evidence.json' };
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

  setSort: (sortBy: string, sortOrder: 'asc' | 'desc') => {
    set({ sortBy, sortOrder, page: 1 });
    get().fetchList();
  },

  toggleSelection: (id: string) => {
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: next };
    });
  },

  selectAll: () => {
    set((s) => ({ selectedIds: new Set(s.items.map((i) => i.id)) }));
  },

  clearSelection: () => {
    set({ selectedIds: new Set() });
  },
}));

export default useEvidenceStore;
