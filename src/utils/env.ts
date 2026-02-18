export const sanitizeEnvValue = (value: unknown): string => {
  const raw = String(value ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return '';

  const unwrapped = trimmed
    .replace(/^`(.+)`$/s, '$1')
    .replace(/^"(.+)"$/s, '$1')
    .replace(/^'(.+)'$/s, '$1')
    .trim();

  return unwrapped;
};

export const getPublicSupabaseConfig = () => {
  const supabaseUrl = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
  const supabaseAnonKey = sanitizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);
  return { supabaseUrl, supabaseAnonKey };
};

export const getPublicSiteUrl = () => {
  const siteUrl = sanitizeEnvValue(import.meta.env.VITE_PUBLIC_SITE_URL);
  if (!siteUrl) return '';
  try {
    return new URL(siteUrl).toString().replace(/\/$/, '');
  } catch {
    return '';
  }
};

export const buildPublicUrl = (path: string) => {
  const siteUrl = getPublicSiteUrl();
  const p = String(path || '').trim();
  const normalizedPath = p.startsWith('/') ? p : `/${p}`;

  const base = siteUrl || window.location.origin;
  return new URL(normalizedPath, base).toString();
};
