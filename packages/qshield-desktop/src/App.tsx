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

  return (
    <HashRouter>
      <NavigationListener />
      <Router />
      <ToastContainer />
    </HashRouter>
  );
}
