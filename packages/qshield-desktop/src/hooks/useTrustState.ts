import { useEffect } from 'react';
import useTrustStore from '@/stores/trust-store';

export function useTrustState() {
  const {
    score,
    level,
    signals,
    lastUpdated,
    sessionId,
    loading,
    error,
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
  };
}
