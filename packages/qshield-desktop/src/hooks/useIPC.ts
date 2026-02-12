import { useState, useEffect, useCallback, useRef } from 'react';

interface IPCResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  retryCount: number;
}

/**
 * Generic IPC hook with loading/error states, retry, and refetch.
 * Automatically calls the fetcher on mount and exposes a refetch callback.
 */
export function useIPC<T>(fetcher: () => Promise<T>, maxRetries: number = 2): IPCResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const mountedRef = useRef(true);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      if (mountedRef.current) {
        setData(result);
        setRetryCount(0);
      }
    } catch (err) {
      if (mountedRef.current) {
        const msg = err instanceof Error ? err.message : 'IPC call failed';
        setError(msg);
        setData(null);

        // Auto-retry with backoff
        setRetryCount((prev) => {
          if (prev < maxRetries) {
            setTimeout(() => {
              if (mountedRef.current) execute();
            }, Math.min(1000 * 2 ** prev, 5000));
            return prev + 1;
          }
          return prev;
        });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetcher, maxRetries]);

  useEffect(() => {
    mountedRef.current = true;
    execute();
    return () => {
      mountedRef.current = false;
    };
  }, [execute]);

  return { data, loading, error, refetch: execute, retryCount };
}
