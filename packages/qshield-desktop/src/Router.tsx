import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Layout } from '@/components/shared/Layout';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { SkeletonDashboard } from '@/components/shared/SkeletonLoader';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import useAuthStore from '@/stores/auth-store';

const Dashboard = lazy(() => import('@/components/dashboard/Dashboard'));
const TrustTimeline = lazy(() => import('@/components/timeline/TrustTimeline'));
const EvidenceVault = lazy(() => import('@/components/vault/EvidenceVault'));
const CertificatesPage = lazy(() => import('@/components/certificates/CertificatesPage'));
const AlertsPage = lazy(() => import('@/components/alerts/AlertsPage'));
const CryptoSecurity = lazy(() => import('@/components/crypto/CryptoSecurity'));
const Settings = lazy(() => import('@/components/settings/Settings'));
const AccountPage = lazy(() => import('@/components/account/AccountPage'));
const ShieldOverlay = lazy(() => import('@/components/shield/ShieldOverlay'));
const LoginScreen = lazy(() => import('@/components/auth/LoginScreen'));

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

/** Full-screen loading state shown during session restoration */
function SessionRestoreLoader() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-950">
      <svg
        className="h-12 w-12 text-sky-500"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.82v5c0 4.52-3.13 8.69-7 9.93C8.13 21.69 5 17.52 5 13V8l7-3.82z" />
        <path d="M12 7a3 3 0 100 6 3 3 0 000-6zm0 2a1 1 0 110 2 1 1 0 010-2z" />
      </svg>
      <LoadingSpinner size="md" className="mt-6" />
    </div>
  );
}

/**
 * Application router with error boundaries around each route
 * and suspense fallbacks for lazy-loaded pages.
 */
export function Router() {
  const location = useLocation();
  const authenticated = useAuthStore((s) => s.authenticated);
  const loading = useAuthStore((s) => s.loading);

  // Shield overlay always renders regardless of auth state (separate window)
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

  // Session restoration in progress
  if (loading && !authenticated) {
    return <SessionRestoreLoader />;
  }

  // Not authenticated — show login screen
  if (!authenticated) {
    return (
      <Suspense fallback={<SessionRestoreLoader />}>
        <LoginScreen />
      </Suspense>
    );
  }

  // Authenticated — render main app
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
