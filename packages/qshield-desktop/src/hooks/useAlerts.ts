import { useEffect } from 'react';
import useAlertStore from '@/stores/alert-store';
import { useToastStore } from '@/components/shared/ToastContainer';

// Module-level flag: initialize alert subscription once across all components
let alertInitialized = false;

/**
 * Hook for alert data with active/dismissed filtering, toast integration,
 * and auto-dismiss timers.
 * Subscription is initialized once (module-level), not per component.
 */
export function useAlerts() {
  const alerts = useAlertStore((s) => s.alerts);
  const loading = useAlertStore((s) => s.loading);
  const error = useAlertStore((s) => s.error);
  const dismiss = useAlertStore((s) => s.dismiss);
  const acknowledge = useAlertStore((s) => s.acknowledge);
  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    if (!alertInitialized) {
      alertInitialized = true;
      const store = useAlertStore.getState();
      store.subscribe();
    }

    // Always fetch latest alerts when the Alerts page mounts
    useAlertStore.getState().fetchAlerts();

    // No cleanup — alert subscription lives for the app lifetime
  }, []);

  const activeAlerts = alerts.filter((a) => !a.dismissed);
  const dismissedAlerts = alerts.filter((a) => a.dismissed);

  return {
    alerts,
    activeAlerts,
    dismissedAlerts,
    loading,
    error,
    dismiss,
    acknowledge,
    pushToast,
  };
}
