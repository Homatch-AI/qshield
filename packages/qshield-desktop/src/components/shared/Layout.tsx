import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Sidebar } from '@/components/shared/Sidebar';
import { StatusBar } from '@/components/shared/StatusBar';
import { isIPCAvailable } from '@/lib/mock-data';

let navigateListenerInitialized = false;

export function Layout() {
  const navigate = useNavigate();

  // Listen for route change requests from main process (e.g. tray menu, shield click)
  useEffect(() => {
    if (navigateListenerInitialized) return;
    navigateListenerInitialized = true;

    if (isIPCAvailable() && window.qshield.app.onNavigate) {
      window.qshield.app.onNavigate((route) => {
        navigate(route);
      });
    }
  }, [navigate]);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
