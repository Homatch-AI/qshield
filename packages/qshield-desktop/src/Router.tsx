import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/shared/Layout';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const Dashboard = lazy(() => import('@/components/dashboard/Dashboard'));
const TrustTimeline = lazy(() => import('@/components/timeline/TrustTimeline'));
const EvidenceVault = lazy(() => import('@/components/vault/EvidenceVault'));
const CertificatesPage = lazy(() => import('@/components/certificates/CertificatesPage'));
const AlertsPage = lazy(() => import('@/components/alerts/AlertsPage'));
const Settings = lazy(() => import('@/components/settings/Settings'));
const ShieldOverlay = lazy(() => import('@/components/shield/ShieldOverlay'));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}

export function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Shield overlay renders without the main layout */}
        <Route path="/shield-overlay" element={<ShieldOverlay />} />

        {/* Main app layout */}
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="timeline" element={<TrustTimeline />} />
          <Route path="vault" element={<EvidenceVault />} />
          <Route path="certificates" element={<CertificatesPage />} />
          <Route path="alerts" element={<AlertsPage />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
