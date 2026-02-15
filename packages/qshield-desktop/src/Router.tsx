import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
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
const SecureMessages = lazy(() => import('@/components/messages/SecureMessages'));
const SecureMessagesGuide = lazy(() => import('@/components/messages/SecureMessagesGuide'));
const Settings = lazy(() => import('@/components/settings/Settings'));
const AccountPage = lazy(() => import('@/components/account/AccountPage'));
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
 * Application router — all routes are accessible to all users.
 * Feature gating is handled by sidebar locks and FeatureGuard components,
 * not by the router.
 */
export function Router() {
  const location = useLocation();

  // Shield overlay always renders without Layout (separate window)
  if (location.pathname === '/shield-overlay') {
    return (
      <Routes>
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
      </Routes>
    );
  }

  return (
    <Routes>
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
          path="messages"
          element={
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary>
                <SecureMessages />
              </ErrorBoundary>
            </Suspense>
          }
        />
        <Route
          path="messages/guide"
          element={
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary>
                <SecureMessagesGuide />
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
        <Route
          path="account"
          element={
            <Suspense fallback={<PageLoader />}>
              <ErrorBoundary>
                <AccountPage />
              </ErrorBoundary>
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}
