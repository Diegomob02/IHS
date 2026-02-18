import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { applyThemeToDocumentRoot, DEFAULT_THEME_COLORS, normalizeThemeColors, ThemeColors } from '../utils/brandTheme';
import { useRealtime } from '../hooks/useRealtime';

type BrandState = {
  companyName: string;
  logoUrl: string;
  theme: ThemeColors;
  themeVersion: number;
};

type BrandContextValue = {
  brand: BrandState;
  loading: boolean;
  refresh: () => Promise<void>;
};

const BrandContext = createContext<BrandContextValue | undefined>(undefined);

const DEFAULT_BRAND: BrandState = {
  companyName: 'Integrated Home Solutions',
  logoUrl: '/IHS.jpg',
  theme: DEFAULT_THEME_COLORS,
  themeVersion: 1,
};

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandState>(DEFAULT_BRAND);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('company_settings')
        .select('company_name, logo_path, theme_json, theme_version')
        .eq('is_singleton', true)
        .single();

      if (error || !data) {
        applyThemeToDocumentRoot(DEFAULT_THEME_COLORS);
        setBrand(DEFAULT_BRAND);
        return;
      }

      const theme = normalizeThemeColors(data.theme_json);
      const logoUrl = resolveLogoUrl(String(data.logo_path || ''));

      applyThemeToDocumentRoot(theme);
      setBrand({
        companyName: data.company_name || DEFAULT_BRAND.companyName,
        logoUrl,
        theme,
        themeVersion: Number(data.theme_version) || 1,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useRealtime('company_settings', undefined, (payload) => {
    if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
      refresh();
    }
  });

  const value = useMemo(() => ({ brand, loading, refresh }), [brand, loading]);

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  const ctx = useContext(BrandContext);
  if (!ctx) throw new Error('useBrand must be used within BrandProvider');
  return ctx;
}

function resolveLogoUrl(logoPath: string) {
  const p = String(logoPath || '').trim();
  if (!p) return '/IHS.jpg';
  if (p.endsWith('/IHS.jpeg') || p === 'IHS.jpeg' || p === '/IHS.jpeg' || p === 'public/IHS.jpeg') return '/IHS.jpg';
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  if (p.startsWith('public/')) return `/${p.replace(/^public\//, '')}`;

  const { data } = supabase.storage.from('branding').getPublicUrl(p);
  return data?.publicUrl || '/IHS.jpg';
}
