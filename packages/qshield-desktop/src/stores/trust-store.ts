import { create } from 'zustand';
import type { TrustState, TrustLevel, TrustSignal } from '@qshield/core';
import { isIPCAvailable, mockTrustState, mockSignal } from '@/lib/mock-data';

interface TrustStoreState {
  score: number;
  level: TrustLevel;
  signals: TrustSignal[];
  lastUpdated: string | null;
  sessionId: string | null;
  loading: boolean;
  error: string | null;
  connected: boolean;
  uptime: number;
  _unsubscribe: (() => void) | null;
  _tickInterval: ReturnType<typeof setInterval> | null;
}

interface TrustStoreActions {
  fetchState: () => Promise<void>;
  setTrustState: (state: TrustState) => void;
  subscribe: () => void;
  unsubscribe: () => void;
  startPeriodicUpdates: () => void;
  stopPeriodicUpdates: () => void;
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
  connected: false,
  uptime: 0,
  _unsubscribe: null,
  _tickInterval: null,

  fetchState: async () => {
    set({ loading: true, error: null });
    try {
      if (isIPCAvailable()) {
        const state = await window.qshield.trust.getState();
        set({
          score: state.score,
          level: state.level,
          signals: state.signals,
          lastUpdated: state.lastUpdated,
          sessionId: state.sessionId,
          loading: false,
          connected: true,
        });
      } else {
        // Use mock data when IPC unavailable
        const state = mockTrustState();
        set({
          score: state.score,
          level: state.level,
          signals: state.signals,
          lastUpdated: state.lastUpdated,
          sessionId: state.sessionId,
          loading: false,
          connected: true,
        });
      }
    } catch (err) {
      // Fallback to mock data on error
      const state = mockTrustState();
      set({
        score: state.score,
        level: state.level,
        signals: state.signals,
        lastUpdated: state.lastUpdated,
        sessionId: state.sessionId,
        loading: false,
        connected: false,
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
    // Guard: trust.subscribe returns void, so use a sentinel function
    if (get()._unsubscribe) return;

    if (isIPCAvailable()) {
      window.qshield.trust.subscribe((state: TrustState) => {
        get().setTrustState(state);
      });
      // Store a sentinel so we know we're subscribed
      set({ _unsubscribe: () => {
        if (isIPCAvailable()) window.qshield.trust.unsubscribe();
      }});
    }

    // Start periodic updates for mock data or uptime tracking
    get().startPeriodicUpdates();
  },

  unsubscribe: () => {
    const unsub = get()._unsubscribe;
    if (unsub) {
      unsub();
      set({ _unsubscribe: null });
    }
    get().stopPeriodicUpdates();
  },

  startPeriodicUpdates: () => {
    if (get()._tickInterval) return;

    const interval = setInterval(() => {
      const { signals, score } = get();

      // Increment uptime
      set((s) => ({ uptime: s.uptime + 10 }));

      // Simulate score drift and new signals in mock mode
      if (!isIPCAvailable()) {
        const drift = (Math.random() - 0.48) * 4;
        const newScore = Math.max(0, Math.min(100, score + drift));
        const newLevel: TrustLevel =
          newScore >= 90 ? 'verified' :
          newScore >= 70 ? 'normal' :
          newScore >= 50 ? 'elevated' :
          newScore >= 30 ? 'warning' : 'critical';

        // Occasionally add a new signal
        const newSignals = Math.random() > 0.6
          ? [mockSignal({ timestamp: new Date().toISOString(), score: Math.round(newScore) }), ...signals].slice(0, 50)
          : signals;

        set({
          score: Math.round(newScore * 10) / 10,
          level: newLevel,
          signals: newSignals,
          lastUpdated: new Date().toISOString(),
        });
      }
    }, 10_000);

    set({ _tickInterval: interval });
  },

  stopPeriodicUpdates: () => {
    const interval = get()._tickInterval;
    if (interval) {
      clearInterval(interval);
      set({ _tickInterval: null });
    }
  },
}));

export default useTrustStore;
