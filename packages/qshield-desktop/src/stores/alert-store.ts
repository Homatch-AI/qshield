import { create } from 'zustand';
import type { Alert } from '@qshield/core';

interface AlertStoreState {
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  _unsubscribe: (() => void) | null;
}

interface AlertStoreActions {
  fetchAlerts: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  subscribe: () => void;
  unsubscribe: () => void;
}

type AlertStore = AlertStoreState & AlertStoreActions;

const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: [],
  loading: false,
  error: null,
  _unsubscribe: null,

  fetchAlerts: async () => {
    set({ loading: true, error: null });
    try {
      const alerts = await window.qshield.alerts.list();
      set({ alerts, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch alerts',
      });
    }
  },

  dismiss: async (id: string) => {
    try {
      await window.qshield.alerts.dismiss(id);
      const { alerts } = get();
      set({
        alerts: alerts.map((a) => (a.id === id ? { ...a, dismissed: true } : a)),
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to dismiss alert',
      });
    }
  },

  subscribe: () => {
    const existing = get()._unsubscribe;
    if (existing) return;

    const unsubscribe = window.qshield.alerts.subscribe((alert: Alert) => {
      const { alerts } = get();
      const exists = alerts.find((a) => a.id === alert.id);
      if (exists) {
        set({ alerts: alerts.map((a) => (a.id === alert.id ? alert : a)) });
      } else {
        set({ alerts: [alert, ...alerts] });
      }
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

export default useAlertStore;
