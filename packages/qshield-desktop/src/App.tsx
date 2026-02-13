import { useEffect } from 'react';
import { HashRouter } from 'react-router-dom';
import { Router } from '@/Router';
import { ToastContainer } from '@/components/shared/ToastContainer';
import useLicenseStore from '@/stores/license-store';

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
      <Router />
      <ToastContainer />
    </HashRouter>
  );
}
