import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/shared/Layout';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { SkeletonDashboard } from '@/components/shared/SkeletonLoader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const Dashboard = lazy(() => import('@/components/dashboard/Dashboard'));
const TrustTimeline = lazy(() => import('@/components/timeline/TrustTimeline'));
const EvidenceVault = lazy(() => import('@/components/vault/EvidenceVault'));
const CertificatesPage = lazy(() => import('@/components/certificates/CertificatesPage'));
const AlertsPage = lazy(() => import('@/components/alerts/AlertsPage'));
const CryptoSecurity = lazy(() => import('@/components/crypto/CryptoSecurity'));
const Settings = lazy(() => import('@/components/settings/Settings'));
const ShieldOverlay = lazy(() => import('@/components/shield/ShieldOverlay'));

/** Full-page skeleton used during lazy-load suspense */
function PageLoader() {
  return <SkeletonDashboard />;
}

/** Minimal spinner for the overlay route */
function OverlayLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-transparent">
      <LoadingSpinner size="lg" />
    </div>
  );
}

/**
 * Application router with error boundaries around each route
 * and suspense fallbacks for lazy-loaded pages.
 */
export function Router() {
  return (
    <Routes>
      {/* Shield overlay renders without the main layout */}
      <Route
        path="/shield-overlay"
        element={
          <Suspense fallback={<OverlayLoader />}>
            <ErrorBoundary>
              <ShieldOverlay />
            </ErrorBoundary>
          </Suspense>
        }
      />

      {/* Main app layout */}
      <Route element={<Layout />}>
        <Route
          index
          element={
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary>
                <Dashboard />
              </ErrorBoundary>
            </Suspense>
          }
        />
        <Route
          path="timeline"
          element={
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary>
                <TrustTimeline />
              </ErrorBoundary>
            </Suspense>
          }
        />
        <Route
          path="vault"
          element={
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary>
                <EvidenceVault />
              </ErrorBoundary>
            </Suspense>
          }
        />
        <Route
          path="certificates"
          element={
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary>
                <CertificatesPage />
              </ErrorBoundary>
            </Suspense>
          }
        />
        <Route
          path="alerts"
          element={
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary>
                <AlertsPage />
              </ErrorBoundary>
            </Suspense>
          }
        />
        <Route
          path="crypto"
          element={
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary>
                <CryptoSecurity />
              </ErrorBoundary>
            </Suspense>
          }
        />
        <Route
          path="settings"
          element={
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary>
                <Settings />
              </ErrorBoundary>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
