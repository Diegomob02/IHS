import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { supabase } from './lib/supabase';
import { getPublicSupabaseConfig, sanitizeEnvValue } from './utils/env';

try {
  const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();
  const host = (supabaseUrl || '').replace(/^https?:\/\//, '');
  const projectRef = host.split('.')[0] || null;

  let anonKeyRef: string | null = null;
  try {
    const payloadPart = sanitizeEnvValue(supabaseAnonKey).split('.')[1];
    if (payloadPart) {
      const payloadJson = atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson);
      anonKeyRef = typeof payload?.ref === 'string' ? payload.ref : null;
    }
  } catch {
    anonKeyRef = null;
  }

  (window as any).IHS_PUBLIC_CONFIG = {
    supabaseUrl: supabaseUrl || null,
    supabaseProjectRef: projectRef,
    anonKeyRef,
  };
} catch {
  (window as any).IHS_PUBLIC_CONFIG = {
    supabaseUrl: null,
    supabaseProjectRef: null,
    anonKeyRef: null,
  };
}

const bootstrap = async () => {
  try {
    const initialUrl = new URL(window.location.href);
    const initialHash = window.location.hash;
    const initialSearch = window.location.search;

    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const errorDescription = url.searchParams.get('error_description');
    const errorParam = url.searchParams.get('error');
    const hash = window.location.hash;
    const hashHasAccessToken = hash.includes('access_token=');
    const hashHasError = hash.includes('error=');

    if (errorDescription || errorParam) {
      window.sessionStorage.setItem('ihs-auth-error', decodeURIComponent(errorDescription || errorParam || ''));
    }

    const bootstrapInfo: Record<string, unknown> = {
      initialPath: initialUrl.pathname,
      initialSearchLen: initialSearch.length,
      initialHashLen: initialHash.length,
      sawCode: !!code,
      sawAccessToken: hashHasAccessToken,
      sawError: !!errorDescription || !!errorParam || hashHasError,
    };

    if (code) {
      try {
        await supabase.auth.exchangeCodeForSession(code);
        bootstrapInfo.pkceExchange = 'ok';
      } catch (e) {
        bootstrapInfo.pkceExchange = 'error';
        bootstrapInfo.pkceError = e instanceof Error ? e.message : String(e);
      }
    }

    if (hashHasAccessToken) {
      const params = new URLSearchParams(hash.replace('#', ''));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      bootstrapInfo.hashAccessTokenLen = access_token?.length ?? 0;
      bootstrapInfo.hashRefreshTokenLen = refresh_token?.length ?? 0;
      bootstrapInfo.hashHasRefreshToken = !!refresh_token;

      if (access_token && refresh_token) {
        try {
          const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) {
            bootstrapInfo.hashSetSession = 'error';
            bootstrapInfo.hashSetSessionError = error.message;
          } else {
            bootstrapInfo.hashSetSession = 'ok';
            bootstrapInfo.hashSetSessionHasSession = !!data.session;
            bootstrapInfo.hashSetSessionUser = data.session?.user?.email;
          }
        } catch (e) {
          bootstrapInfo.hashSetSession = 'error';
          bootstrapInfo.hashSetSessionError = e instanceof Error ? e.message : String(e);
        }
      } else {
        bootstrapInfo.hashSetSession = 'skipped_missing_tokens';
      }
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      bootstrapInfo.sessionAfter = !!session;
      bootstrapInfo.userAfter = session?.user?.email;
    } catch (e) {
      bootstrapInfo.sessionAfter = false;
      bootstrapInfo.getSessionError = e instanceof Error ? e.message : String(e);
    }

    window.sessionStorage.setItem('ihs-auth-bootstrap', JSON.stringify(bootstrapInfo));

    if (code || errorDescription || errorParam || hashHasAccessToken || hashHasError) {
      url.hash = '';
      url.searchParams.delete('code');
      url.searchParams.delete('error');
      url.searchParams.delete('error_code');
      url.searchParams.delete('error_description');
      window.history.replaceState(null, '', url.pathname + url.search);
    }
  } catch {
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
};

bootstrap();
