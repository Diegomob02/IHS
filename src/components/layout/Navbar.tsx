import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, User } from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { User as SupabaseUser } from '@supabase/supabase-js';
import { useBrand } from '../../context/BrandContext';
import { useSettings } from '../../context/SettingsContext';
import { resolvePostLoginRedirect } from '../../utils/authRouting';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [panelHref, setPanelHref] = useState<string | null>(null);
  const location = useLocation();
  const { brand } = useBrand();
  const { t, language, setLanguage } = useSettings();

  useEffect(() => {
    const hydratePanelHref = async (authUser: SupabaseUser | null) => {
      if (!authUser?.id) {
        setPanelHref(null);
        return;
      }
      try {
        const emailLower = String(authUser.email ?? '').trim().toLowerCase();
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('email, role, status')
          .eq('email', emailLower)
          .maybeSingle();

        const { data: userRow } = await supabase
          .from('users')
          .select('role')
          .eq('id', authUser.id)
          .maybeSingle();

        const decision = resolvePostLoginRedirect({ email: emailLower, roleRow: (roleRow as any) || null, userProfileRow: (userRow as any) || null });
        setPanelHref(decision.ok ? decision.redirectTo : null);
      } catch {
        setPanelHref(null);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      hydratePanelHref(u);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      hydratePanelHref(u);
    });

    return () => subscription.unsubscribe();
  }, []);

  const navigation = [
    { name: t('navHome'), href: '/' },
    { name: t('navServices'), href: '/servicios' },
    { name: t('navHowWeWork'), href: '/como-trabajamos' },
    { name: t('navFinancial'), href: '/finanzas' },
    { name: t('navFees'), href: '/honorarios' },
    { name: t('navProperties'), href: '/propiedades' },
    { name: t('navOwners'), href: '/auth' },
    { name: t('navContact'), href: '/contacto' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-background shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 sm:h-20">
          <div className="flex items-center gap-4 min-w-0">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <img src={brand.logoUrl} alt={brand.companyName} className="h-10 sm:h-16 w-auto object-contain mix-blend-multiply" />
            </Link>
          </div>
          
          {/* Desktop menu */}
          <div className="hidden md:flex items-center space-x-8">
            {navigation.map((item) => (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "text-sm font-medium transition-colors hover:text-primary",
                  isActive(item.href)
                    ? "text-primary border-b-2 border-primary"
                    : "text-text-secondary"
                )}
              >
                {item.name}
              </Link>
            ))}
            <Link
              to="/evaluacion"
              className="bg-primary text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-opacity-90 transition-colors shadow-sm"
            >
              {t('navFreeEvaluation')}
            </Link>
            <button
              type="button"
              onClick={() => setLanguage(language === 'es' ? 'en' : 'es')}
              className="text-xs font-bold px-3 py-2 rounded-md border border-gray-200 text-text-secondary hover:text-primary hover:border-primary transition-colors"
              aria-label={t('switchLanguage')}
            >
              {language === 'es' ? 'EN' : 'ES'}
            </button>
            {user && (
              <Link 
                to={panelHref || '/propietarios/panel'} 
                className="flex items-center gap-2 bg-primary/20 px-3 py-1.5 rounded-full border border-primary/50 text-primary hover:bg-primary/30 transition-all"
              >
                <User className="h-4 w-4" />
                <span className="text-xs font-bold">{t('navMyPanel')}</span>
              </Link>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-2 md:hidden">
            {user ? (
              <Link
                to={panelHref || '/propietarios/panel'}
                className="inline-flex flex-shrink-0 items-center gap-2 px-2.5 py-2 rounded-md text-[11px] font-bold whitespace-nowrap text-primary bg-primary/10 border border-primary/20"
                onClick={() => setIsOpen(false)}
              >
                <User className="h-4 w-4" />
                {t('navMyPanel')}
              </Link>
            ) : (
              <Link
                to="/auth"
                className="inline-flex flex-shrink-0 items-center gap-2 px-2.5 py-2 rounded-md text-[11px] font-bold whitespace-nowrap bg-primary text-white shadow-sm"
                onClick={() => setIsOpen(false)}
              >
                <User className="h-4 w-4" />
                {t('navOwners')}
              </Link>
            )}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-text-secondary hover:text-primary focus:outline-none"
            >
              <span className="sr-only">{t('navOpenMenu')}</span>
              {isOpen ? (
                <X className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={cn("md:hidden", isOpen ? "block" : "hidden")}>
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-background border-b border-gray-200">
          {user && (
            <Link
              to={panelHref || '/propietarios/panel'}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-base font-medium text-primary bg-primary/10 mb-2"
              onClick={() => setIsOpen(false)}
            >
              <User className="h-5 w-5" />
              {t('navGoToMyPanel')}
            </Link>
          )}

          {navigation.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "block px-3 py-2 rounded-md text-base font-medium",
                isActive(item.href)
                  ? "text-primary bg-primary/5"
                  : "text-text-secondary hover:text-primary hover:bg-gray-50"
              )}
              onClick={() => setIsOpen(false)}
            >
              {item.name}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              setLanguage(language === 'es' ? 'en' : 'es');
              setIsOpen(false);
            }}
            className="block w-full text-center mt-2 border border-gray-200 text-text-secondary px-4 py-3 rounded-md text-base font-medium hover:text-primary hover:border-primary"
          >
            {t('switchLanguage')}
          </button>
          <Link
            to="/evaluacion"
            className="block w-full text-center mt-4 bg-primary text-white px-4 py-3 rounded-md text-base font-medium hover:bg-opacity-90"
            onClick={() => setIsOpen(false)}
          >
            {t('navFreeEvaluation')}
          </Link>
        </div>
      </div>
    </nav>
  );
}
