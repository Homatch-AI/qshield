import { useEffect } from 'react';
import useAlertStore from '@/stores/alert-store';

export function useAlerts() {
  const {
    alerts,
    loading,
    error,
    fetchAlerts,
    dismiss,
    subscribe,
    unsubscribe,
  } = useAlertStore();

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
  };
}
