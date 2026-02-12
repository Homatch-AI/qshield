import { create } from 'zustand';
import type { Alert } from '@qshield/core';
import { isIPCAvailable, mockAlerts, mockAlert } from '@/lib/mock-data';
import { useToastStore } from '@/components/shared/ToastContainer';

interface AlertStoreState {
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  _unsubscribe: (() => void) | null;
  _mockInterval: ReturnType<typeof setInterval> | null;
}

interface AlertStoreActions {
  fetchAlerts: () => Promise<void>;
  dismiss: (id: string) => Promise<void>;
  acknowledge: (id: string, action: string) => void;
  subscribe: () => void;
  unsubscribe: () => void;
}

type AlertStore = AlertStoreState & AlertStoreActions;

const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: [],
  loading: false,
  error: null,
  _unsubscribe: null,
  _mockInterval: null,

  fetchAlerts: async () => {
    set({ loading: true, error: null });
    try {
      if (isIPCAvailable()) {
        const alerts = await window.qshield.alerts.list();
        set({ alerts, loading: false });
      } else {
        set({ alerts: mockAlerts(12), loading: false });
      }
    } catch (err) {
      set({
        alerts: mockAlerts(12),
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to fetch alerts',
      });
    }
  },

  dismiss: async (id: string) => {
    try {
      if (isIPCAvailable()) {
        await window.qshield.alerts.dismiss(id);
      }
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

  acknowledge: (id: string, action: string) => {
    const { alerts } = get();
    set({
      alerts: alerts.map((a) =>
        a.id === id ? { ...a, dismissed: true, actionTaken: action } : a,
      ),
    });
  },

  subscribe: () => {
    const existing = get()._unsubscribe;
    if (existing) return;

    if (isIPCAvailable()) {
      const unsubscribe = window.qshield.alerts.subscribe((alert: Alert) => {
        const { alerts } = get();
        const exists = alerts.find((a) => a.id === alert.id);
        if (exists) {
          set({ alerts: alerts.map((a) => (a.id === alert.id ? alert : a)) });
        } else {
          set({ alerts: [alert, ...alerts] });
          // Push toast for new alerts
          useToastStore.getState().push({
            title: alert.title,
            message: alert.description,
            severity: alert.severity,
          });
        }
      });
      set({ _unsubscribe: unsubscribe });
    } else {
      // Simulate periodic new alerts in mock mode
      const interval = setInterval(() => {
        if (Math.random() > 0.7) {
          const alert = mockAlert({ timestamp: new Date().toISOString() });
          const { alerts } = get();
          set({ alerts: [alert, ...alerts] });
          useToastStore.getState().push({
            title: alert.title,
            message: alert.description,
            severity: alert.severity,
          });
        }
      }, 30_000);
      set({ _mockInterval: interval });
    }
  },

  unsubscribe: () => {
    const unsub = get()._unsubscribe;
    if (unsub) {
      unsub();
      set({ _unsubscribe: null });
    }
    const interval = get()._mockInterval;
    if (interval) {
      clearInterval(interval);
      set({ _mockInterval: null });
    }
  },
}));

export default useAlertStore;
