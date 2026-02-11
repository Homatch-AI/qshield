import { create } from 'zustand';
import type { TrustState, TrustLevel, TrustSignal } from '@qshield/core';

interface TrustStoreState {
  score: number;
  level: TrustLevel;
  signals: TrustSignal[];
  lastUpdated: string | null;
  sessionId: string | null;
  loading: boolean;
  error: string | null;
  _unsubscribe: (() => void) | null;
}

interface TrustStoreActions {
  fetchState: () => Promise<void>;
  setTrustState: (state: TrustState) => void;
  subscribe: () => void;
  unsubscribe: () => void;
}

type TrustStore = TrustStoreState & TrustStoreActions;

const useTrustStore = create<TrustStore>((set, get) => ({
  score: 0,
  level: 'normal',
  signals: [],
  lastUpdated: null,
  sessionId: null,
  loading: false,
  error: null,
  _unsubscribe: null,

  fetchState: async () => {
    set({ loading: true, error: null });
    try {
      const state = await window.qshield.trust.getState();
      set({
        score: state.score,
        level: state.level,
        signals: state.signals,
        lastUpdated: state.lastUpdated,
        sessionId: state.sessionId,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch trust state',
      });
    }
  },

  setTrustState: (state: TrustState) => {
    set({
      score: state.score,
      level: state.level,
      signals: state.signals,
      lastUpdated: state.lastUpdated,
      sessionId: state.sessionId,
    });
  },

  subscribe: () => {
    const existing = get()._unsubscribe;
    if (existing) return;

    const unsubscribe = window.qshield.trust.subscribe((state: TrustState) => {
      get().setTrustState(state);
    });
    set({ _unsubscribe: unsubscribe });
  },

  unsubscribe: () => {
    const unsub = get()._unsubscribe;
    if (unsub) {
      unsub();
      set({ _unsubscribe: null });
    }
  },
}));

export default useTrustStore;
