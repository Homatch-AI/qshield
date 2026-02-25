import { useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { Router } from '@/Router';
import { ToastContainer } from '@/components/shared/ToastContainer';
import { useDeepLink } from '@/hooks/useDeepLink';
import useLicenseStore from '@/stores/license-store';

/** Handles main-process navigation events (tray menu, IPC) */
function NavigationListener() {
  useDeepLink();
  return null;
}

/**
 * Root application component. Wraps the router in a HashRouter
 * and renders the global ToastContainer for alert notifications.
 */
export function App() {
  useEffect(() => {
    useLicenseStore.getState().fetchLicense();
  }, []);

  // Intercept all <a> clicks with external URLs and open in system browser
  // This prevents Electron from navigating the BrowserWindow away from the app
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      if (href.startsWith('http://') || href.startsWith('https://')) {
        // Skip localhost (Vite dev server)
        try {
          const url = new URL(href);
          if (url.hostname === 'localhost') return;
        } catch { return; }
        e.preventDefault();
        e.stopPropagation();
        window.qshield.app.openExternal(href);
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  return (
    <HashRouter>
      <NavigationListener />
      <Router />
      <ToastContainer />
    </HashRouter>
  );
}
