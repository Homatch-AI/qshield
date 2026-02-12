import { HashRouter } from 'react-router-dom';
import { Router } from '@/Router';
import { ToastContainer } from '@/components/shared/ToastContainer';

/**
 * Root application component. Wraps the router in a HashRouter
 * and renders the global ToastContainer for alert notifications.
 */
export function App() {
  return (
    <HashRouter>
      <Router />
      <ToastContainer />
    </HashRouter>
  );
}
