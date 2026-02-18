import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { SettingsProvider } from './context/SettingsContext';
import { NotificationProvider } from './context/NotificationContext';
import { BrandProvider } from './context/BrandContext';
import { Loader2 } from 'lucide-react';
import { RequireRouteAccess } from './components/auth/RequireRouteAccess';
import { getPublicSiteUrl } from './utils/env';

// Lazy load pages
const Home = lazy(() => import('./pages/Home'));
const Services = lazy(() => import('./pages/Services'));
const Properties = lazy(() => import('./pages/Properties'));
const Contact = lazy(() => import('./pages/Contact'));
const HowWeWork = lazy(() => import('./pages/HowWeWork'));
const Financial = lazy(() => import('./pages/Financial'));
const Fees = lazy(() => import('./pages/Fees'));
const OwnerPortal = lazy(() => import('./pages/OwnerPortal'));
const AuthPanel = lazy(() => import('./pages/AuthPanel'));
const Evaluation = lazy(() => import('./pages/Evaluation'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const BillingDashboard = lazy(() => import('./pages/BillingDashboard'));
const BillingSettings = lazy(() => import('./pages/BillingSettings'));
const BillingReports = lazy(() => import('./pages/BillingReports'));
const Contractors = lazy(() => import('./pages/Contractors.tsx'));
const ContractorPortal = lazy(() => import('./pages/ContractorPortal'));
const ContractorInvite = lazy(() => import('./pages/ContractorInvite'));

const Loading = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

function App() {
  useEffect(() => {
    if (import.meta.env.DEV) return;
    const siteUrl = getPublicSiteUrl();
    if (!siteUrl) return;
    let canonical: URL;
    try {
      canonical = new URL(siteUrl);
    } catch {
      return;
    }
    const current = new URL(window.location.href);
    if (current.host === canonical.host) return;
    if (!current.hostname.endsWith('vercel.app')) return;

    current.protocol = canonical.protocol;
    current.host = canonical.host;
    window.location.replace(current.toString());
  }, []);

  return (
    <SettingsProvider>
      <NotificationProvider>
        <BrandProvider>
          <Router>
            <Layout>
              <Suspense fallback={<Loading />}>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/servicios" element={<Services />} />
                  <Route path="/como-trabajamos" element={<HowWeWork />} />
                  <Route path="/finanzas" element={<Financial />} />
                  <Route path="/honorarios" element={<Fees />} />
                  <Route path="/propiedades" element={<Properties />} />
                  <Route path="/contacto" element={<Contact />} />
                  <Route path="/contratistas" element={<Contractors />} />
                  <Route path="/colabora-con-nosotros" element={<Contractors />} />
                  <Route
                    path="/portal-contratistas"
                    element={
                      <RequireRouteAccess expected="/portal-contratistas">
                        <ContractorPortal />
                      </RequireRouteAccess>
                    }
                  />
                  <Route path="/portal-contratistas/invitacion" element={<ContractorInvite />} />
                  <Route path="/auth" element={<AuthPanel />} />
                  <Route path="/propietarios" element={<Navigate to="/auth" replace />} />
                  <Route
                    path="/propietarios/panel"
                    element={
                      <RequireRouteAccess expected="/propietarios/panel">
                        <OwnerPortal />
                      </RequireRouteAccess>
                    }
                  />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route path="/evaluacion" element={<Evaluation />} />
                  <Route path="/billing" element={<BillingDashboard />} />
                  <Route path="/billing/settings" element={<BillingSettings />} />
                  <Route path="/billing/reports" element={<BillingReports />} />
                </Routes>
              </Suspense>
            </Layout>
          </Router>
        </BrandProvider>
      </NotificationProvider>
    </SettingsProvider>
  );
}

export default App;
