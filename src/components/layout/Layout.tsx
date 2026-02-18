import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  
  // Define paths where Navbar and Footer should be hidden
  // This typically includes the main portal dashboard and any sub-routes
  const isPortalRoute = location.pathname.startsWith('/propietarios/panel') || location.pathname === '/forgot-password';

  return (
    <div className="flex flex-col min-h-screen">
      {!isPortalRoute && <Navbar />}
      <main className="flex-grow">
        {children}
      </main>
      {!isPortalRoute && <Footer />}
    </div>
  );
}
