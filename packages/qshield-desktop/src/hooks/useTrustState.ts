import { useEffect } from 'react';
import useTrustStore from '@/stores/trust-store';

/**
 * Hook to access trust state with automatic fetch and subscription.
 * Also tracks connection status and session uptime.
 */
export function useTrustState() {
  const {
    score,
    level,
    signals,
    lastUpdated,
    sessionId,
    loading,
    error,
    connected,
    uptime,
    fetchState,
    subscribe,
    unsubscribe,
  } = useTrustStore();

  useEffect(() => {
    fetchState();
    subscribe();
    return () => {
      unsubscribe();
    };
  }, [fetchState, subscribe, unsubscribe]);

  return {
    score,
    level,
    signals,
    lastUpdated,
    sessionId,
    loading,
    error,
    connected,
    uptime,
  };
}
