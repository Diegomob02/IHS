import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PasswordField } from '../components/common/PasswordField';

export default function ContractorInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => String(searchParams.get('token') || '').trim(), [searchParams]);

  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) setSessionReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.user?.id) setSessionReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const consumeInvite = async () => {
    if (!token) throw new Error('Falta el token de invitación.');
    const { data, error } = await supabase.rpc('consume_contractor_invite', { p_token: token });
    if (error) throw error;
    if (!(data as any)?.ok) throw new Error('No se pudo validar la invitación.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!token) throw new Error('Falta el token de invitación.');
      if (!email.trim()) throw new Error('Ingresa tu correo.');
      if (!password.trim()) throw new Error('Ingresa tu contraseña.');

      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              role: 'contractor',
            },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }

      await consumeInvite();
      navigate('/portal-contratistas');
    } catch (e: any) {
      setError(String(e?.message || 'Error'));
    } finally {
      setLoading(false);
    }
  };

  const handleConsumeIfAlreadyLoggedIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await consumeInvite();
      navigate('/portal-contratistas');
    } catch (e: any) {
      setError(String(e?.message || 'Error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-lg mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          <div className="bg-slate-900 px-8 py-10 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">Activación de Portal</h1>
            <p className="text-slate-300 text-sm">Usa tu invitación para crear o vincular tu cuenta.</p>
          </div>

          <div className="p-8">
            {!token && (
              <div className="mb-6 bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm rounded-md p-4">
                Falta el token de invitación en la URL.
              </div>
            )}

            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md p-4">
                {error}
              </div>
            )}

            {sessionReady ? (
              <button
                type="button"
                onClick={handleConsumeIfAlreadyLoggedIn}
                disabled={loading || !token}
                className="w-full bg-primary text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Validando...' : 'Vincular invitación a mi sesión actual'}
              </button>
            ) : (
              <>
                <div className="flex gap-2 mb-6">
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className={`flex-1 py-2 rounded-md text-sm font-semibold border ${
                      mode === 'signup' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    Crear cuenta
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className={`flex-1 py-2 rounded-md text-sm font-semibold border ${
                      mode === 'signin' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-700 border-gray-200'
                    }`}
                  >
                    Ya tengo cuenta
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Correo</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                      autoComplete="email"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
                    <PasswordField
                      name="password"
                      value={password}
                      onChange={setPassword}
                      required
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="w-full pl-4 pr-12 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !token}
                    className="w-full bg-primary text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {loading ? 'Procesando...' : mode === 'signup' ? 'Crear cuenta y activar' : 'Ingresar y activar'}
                  </button>
                </form>
              </>
            )}

            <div className="mt-6 text-sm text-gray-600 flex justify-between">
              <Link to="/portal-contratistas" className="hover:underline">
                Ir al portal
              </Link>
              <Link to="/forgot-password" className="hover:underline">
                Recuperar contraseña
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

