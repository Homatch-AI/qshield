import { useEffect } from 'react';
import useTrustStore from '@/stores/trust-store';

// Module-level flag: initialize trust subscription once across all components
let trustInitialized = false;

/**
 * Hook to access trust state with automatic fetch and subscription.
 * Subscription is initialized once (module-level), not per component.
 */
export function useTrustState() {
  const score = useTrustStore((s) => s.score);
  const level = useTrustStore((s) => s.level);
  const signals = useTrustStore((s) => s.signals);
  const lastUpdated = useTrustStore((s) => s.lastUpdated);
  const sessionId = useTrustStore((s) => s.sessionId);
  const loading = useTrustStore((s) => s.loading);
  const error = useTrustStore((s) => s.error);
  const connected = useTrustStore((s) => s.connected);
  const uptime = useTrustStore((s) => s.uptime);

  useEffect(() => {
    if (trustInitialized) return;
    trustInitialized = true;

    const store = useTrustStore.getState();
    store.fetchState();
    store.subscribe();

    // No cleanup — trust subscription lives for the app lifetime
  }, []);

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
