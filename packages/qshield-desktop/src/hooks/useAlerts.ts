import { useEffect } from 'react';
import useAlertStore from '@/stores/alert-store';
import { useToastStore } from '@/components/shared/ToastContainer';

/**
 * Hook for alert data with active/dismissed filtering, toast integration,
 * and auto-dismiss timers.
 */
export function useAlerts() {
  const {
    alerts,
    loading,
    error,
    fetchAlerts,
    dismiss,
    acknowledge,
    subscribe,
    unsubscribe,
  } = useAlertStore();

  const pushToast = useToastStore((s) => s.push);

  useEffect(() => {
    fetchAlerts();
    subscribe();
    return () => {
      unsubscribe();
    };
  }, [fetchAlerts, subscribe, unsubscribe]);

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
