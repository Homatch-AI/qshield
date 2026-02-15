import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Listen for navigation requests from the main process (tray menu, IPC)
 * and route the renderer accordingly.
 */
export function useDeepLink() {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (route: string) => {
      navigate(route);
    };

    window.qshield?.app?.onNavigate?.(handler);

    return () => {
      window.qshield?.app?.offNavigate?.(handler as unknown as (...args: unknown[]) => void);
    };
  }, [navigate]);
}
