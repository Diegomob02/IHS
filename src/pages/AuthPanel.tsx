import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, Lock, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import { PasswordField } from '../components/common/PasswordField';
import { clearSessionStartedAt, isSessionOlderThan24h, markSessionStartedNow, resolvePostLoginRedirect } from '../utils/authRouting';
import { buildPublicUrl } from '../utils/env';

export default function AuthPanel() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stateError = (location.state as any)?.error;
    if (stateError) setError(String(stateError));
  }, [location.state]);

  useEffect(() => {
    const run = async () => {
      try {
        if (isSessionOlderThan24h()) {
          await supabase.auth.signOut();
          clearSessionStartedAt();
        }
        const { data } = await supabase.auth.getSession();
        const u = data?.session?.user;
        if (!u?.id) {
          setChecking(false);
          return;
        }

        const emailLower = String(u.email ?? '').trim().toLowerCase();
        markSessionStartedNow();
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('email, role, status')
          .eq('email', emailLower)
          .maybeSingle();

        const { data: userRow } = await supabase
          .from('users')
          .select('role')
          .eq('id', u.id)
          .maybeSingle();

        const decision = resolvePostLoginRedirect({ email: emailLower, roleRow: (roleRow as any) || null, userProfileRow: (userRow as any) || null });
        if (!decision.ok) {
          const msg = 'message' in decision ? String((decision as any).message) : 'No autorizado.';
          try {
            await supabase.functions.invoke('log-access-attempt', {
              body: {
                email: emailLower,
                portal: 'auth',
                success: false,
                reason: msg,
                userId: u.id,
                path: location.pathname,
              },
            });
          } catch {
            // ignore
          }
          await supabase.auth.signOut();
          clearSessionStartedAt();
          setError(msg);
          setChecking(false);
          return;
        }
        try {
          await supabase.functions.invoke('log-access-attempt', {
            body: {
              email: emailLower,
              portal: 'auth',
              success: true,
              reason: 'session_redirect',
              userId: u.id,
              path: location.pathname,
            },
          });
        } catch {
          // ignore
        }
        navigate(decision.redirectTo, { replace: true });
      } catch (e: any) {
        setError(String(e?.message || t('unknownError')));
      } finally {
        setChecking(false);
      }
    };
    run();
  }, [navigate, t, location.pathname]);

  const isValidEmail = (raw: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());

  const logAttempt = async (payload: { success: boolean; reason?: string; userId?: string | null; emailOverride?: string | null }) => {
    try {
      await supabase.functions.invoke('log-access-attempt', {
        body: {
          email: payload.emailOverride ?? email,
          portal: 'auth',
          success: payload.success,
          reason: payload.reason || null,
          userId: payload.userId || null,
          path: location.pathname,
        },
      });
    } catch {
      // ignore
    }
  };

  const handleGoogleLogin = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await logAttempt({ success: false, reason: 'oauth_google_start', emailOverride: null });
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: buildPublicUrl('/auth'),
        },
      });
      if (error) throw error;
    } catch (e: any) {
      setError(String(e?.message || `${t('socialLoginErrorPrefix')}google`));
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError(null);

    const emailTrim = email.trim().toLowerCase();
    if (!isValidEmail(emailTrim)) {
      setError('Email inválido.');
      await logAttempt({ success: false, reason: 'invalid_email' });
      return;
    }

    setLoading(true);
    try {
      const rate = await supabase.functions.invoke('auth-rate-limit', {
        body: { email: emailTrim, portal: 'auth' },
      });
      if (rate.error) throw rate.error;
      if (rate.data?.allowed === false) {
        await logAttempt({ success: false, reason: 'rate_limited' });
        setError('Demasiados intentos. Intenta más tarde.');
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailTrim,
        password,
      });
      if (error) {
        await logAttempt({ success: false, reason: error.message });
        throw error;
      }

      markSessionStartedNow();

      const u = data?.user;
      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('email, role, status')
        .eq('email', emailTrim)
        .maybeSingle();

      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', u?.id || '')
        .maybeSingle();

      const decision = resolvePostLoginRedirect({ email: emailTrim, roleRow: (roleRow as any) || null, userProfileRow: (userRow as any) || null });
      if (!decision.ok) {
        const msg = 'message' in decision ? String((decision as any).message) : 'No autorizado.';
        await logAttempt({ success: false, reason: msg, userId: u?.id || null });
        await supabase.auth.signOut();
        clearSessionStartedAt();
        setError(msg);
        setLoading(false);
        return;
      }

      await logAttempt({ success: true, userId: u?.id || null });
      navigate(decision.redirectTo, { replace: true });
    } catch (e: any) {
      setError(String(e?.message || t('unknownError')));
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-border">
            <div className="bg-primary px-8 py-10 text-center">
              <h1 className="text-3xl font-bold text-white mb-2">{t('loginTitle')}</h1>
              <p className="text-white/80 text-sm">{t('loginSubtitle')}</p>
            </div>

            <div className="p-8">
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md p-4">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center px-4 py-2 border border-border shadow-sm text-sm font-bold rounded-md text-text-main bg-white hover:bg-muted focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.26z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                {t('continueGoogle')}
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-text-secondary">{t('orEmail')}</span>
                </div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-main mb-1">{t('emailPlaceholder')}</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 border border-border rounded-md focus:ring-primary focus:border-primary outline-none transition-colors bg-white text-text-main placeholder:text-text-secondary/70"
                    placeholder={t('emailPlaceholder')}
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-main mb-1">{t('passwordPlaceholder')}</label>
                  <PasswordField
                    name="password"
                    value={password}
                    onChange={setPassword}
                    required
                    autoComplete="current-password"
                    placeholder={t('passwordPlaceholder')}
                    className="w-full pl-4 pr-12 py-2 border border-border rounded-md focus:ring-primary focus:border-primary outline-none transition-colors bg-white text-text-main placeholder:text-text-secondary/70"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                  {loading ? t('loginLoading') : t('loginButton')}
                </button>
              </form>

              <div className="mt-6 flex flex-col gap-2 text-sm">
                <Link to="/forgot-password" className="text-text-secondary hover:underline flex items-center gap-2">
                  <Lock size={16} />
                  {t('forgotPassword')}
                </Link>
                <Link to="/portal-contratistas/invitacion" className="text-primary hover:underline">
                  Tengo un enlace de invitación
                </Link>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-border p-8">
            <h2 className="text-2xl font-bold text-primary">Colabora con nosotros</h2>
            <p className="mt-3 text-sm text-text-secondary">
              Si quieres registrarte como contratista, llena el formato y nuestro equipo lo revisará. Al ser aprobado, recibirás un correo con las instrucciones de acceso.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                to="/colabora-con-nosotros"
                className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-accent text-accent-foreground font-bold hover:opacity-90 transition-opacity"
              >
                Ir al registro de contratistas
              </Link>
              <Link
                to="/contacto"
                className="inline-flex items-center justify-center px-6 py-3 rounded-md border border-border text-text-main font-bold hover:bg-muted transition-colors"
              >
                Contactar a IHS
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
