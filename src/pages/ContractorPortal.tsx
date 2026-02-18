import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building2, CreditCard, Loader2, LogOut, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import { clearSessionStartedAt, isSessionOlderThan24h } from '../utils/authRouting';

type ContractorProfile = {
  user_id: string;
  application_id: string | null;
  full_name: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  company_name: string | null;
  billing_legal_name: string | null;
  billing_tax_id: string | null;
  billing_email: string | null;
  billing_address: string | null;
  billing_bank_account: string | null;
  billing_notes: string | null;
};

export default function ContractorPortal() {
  const { t } = useSettings();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userSessionEmail, setUserSessionEmail] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthed = useMemo(() => !!authUserId, [authUserId]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (isSessionOlderThan24h()) {
        await supabase.auth.signOut();
        clearSessionStartedAt();
        setAuthUserId(null);
        setUserSessionEmail(null);
        return;
      }
      const u = session?.user ?? null;
      setAuthUserId(u?.id ?? null);
      setUserSessionEmail(u?.email ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setAuthUserId(u?.id ?? null);
      setUserSessionEmail(u?.email ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const run = async () => {
      setError(null);
      setAccessDenied(false);
      if (!authUserId) {
        setRole(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const emailLower = String(userSessionEmail ?? '').trim().toLowerCase();
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('email, role, status')
          .eq('email', emailLower)
          .maybeSingle();

        const { data: userRow } = await supabase
          .from('users')
          .select('id, role')
          .eq('id', authUserId)
          .maybeSingle();

        const roleResolved = String((roleRow as any)?.role || (userRow as any)?.role || '');
        const statusResolved = String((roleRow as any)?.status || '');
        setRole(roleResolved || null);

        const contractorApproved =
          roleResolved === 'contractor' &&
          (!statusResolved || statusResolved === 'approved');

        if (!contractorApproved) {
          try {
            await supabase.functions.invoke('log-access-attempt', {
              body: {
                email: emailLower,
                portal: 'contractor_portal',
                success: false,
                reason: 'forbidden_role',
                userId: authUserId,
                path: '/portal-contratistas',
              },
            });
          } catch {
            // ignore
          }
          setAccessDenied(true);
          setProfile(null);
          setLoading(false);
          return;
        }

        try {
          await supabase.functions.invoke('log-access-attempt', {
            body: {
              email: emailLower,
              portal: 'contractor_portal',
              success: true,
              reason: null,
              userId: authUserId,
              path: '/portal-contratistas',
            },
          });
        } catch {
          // ignore
        }

        const { data: cp, error: cpErr } = await supabase
          .from('contractor_profiles')
          .select('*')
          .eq('user_id', authUserId)
          .maybeSingle();

        if (cpErr) throw cpErr;
        setProfile((cp as any) || null);
      } catch (e: any) {
        setError(String(e?.message || 'Error'));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [authUserId, userSessionEmail]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth', { replace: true });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authUserId) return;
    setSaving(true);
    setError(null);
    try {
      const payload = {
        billing_legal_name: profile?.billing_legal_name ?? null,
        billing_tax_id: profile?.billing_tax_id ?? null,
        billing_email: profile?.billing_email ?? null,
        billing_address: profile?.billing_address ?? null,
        billing_bank_account: profile?.billing_bank_account ?? null,
        billing_notes: profile?.billing_notes ?? null,
        phone: profile?.phone ?? null,
        whatsapp_phone: profile?.whatsapp_phone ?? null,
        company_name: profile?.company_name ?? null,
        full_name: profile?.full_name ?? null,
      };

      const { error } = await supabase
        .from('contractor_profiles')
        .update(payload)
        .eq('user_id', authUserId);
      if (error) throw error;
    } catch (e: any) {
      setError(String(e?.message || t('unknownError')));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthed) {
    return <Navigate to="/auth" replace />;
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl border border-border p-10 w-full max-w-xl text-center">
          <h1 className="text-3xl font-bold text-primary mb-2">403</h1>
          <p className="text-sm text-text-secondary mb-8">No tienes permisos para acceder al portal de contratistas.</p>
          <button
            onClick={handleLogout}
            className="inline-flex items-center justify-center gap-2 bg-primary text-white font-bold py-3 px-6 rounded-md hover:bg-opacity-90 transition-colors"
          >
            <LogOut size={18} />
            {t('logout')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-24 pb-16">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          <div className="bg-slate-900 px-8 py-8 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Portal de Contratistas</h1>
              <p className="text-slate-300 text-sm">{userSessionEmail || ''}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              {t('logout')}
            </button>
          </div>

          <div className="p-8">
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 text-red-800 text-sm rounded-md p-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-10">
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-gray-900">
                  <User className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Datos personales</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('contactFullNameLabel')}</label>
                    <input
                      type="text"
                      value={profile?.full_name || ''}
                      onChange={(e) => setProfile((p) => (p ? { ...p, full_name: e.target.value } : p))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('contractorCompanyNameLabel')}</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        value={profile?.company_name || ''}
                        onChange={(e) => setProfile((p) => (p ? { ...p, company_name: e.target.value } : p))}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('contactPhoneInputLabel')}</label>
                    <input
                      type="tel"
                      value={profile?.phone || ''}
                      onChange={(e) => setProfile((p) => (p ? { ...p, phone: e.target.value } : p))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('contractorWhatsappLabel')}</label>
                    <input
                      type="tel"
                      value={profile?.whatsapp_phone || ''}
                      onChange={(e) => setProfile((p) => (p ? { ...p, whatsapp_phone: e.target.value } : p))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center gap-2 text-gray-900">
                  <CreditCard className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Datos de facturación</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Razón social</label>
                    <input
                      type="text"
                      value={profile?.billing_legal_name || ''}
                      onChange={(e) => setProfile((p) => (p ? { ...p, billing_legal_name: e.target.value } : p))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">RFC / Tax ID</label>
                    <input
                      type="text"
                      value={profile?.billing_tax_id || ''}
                      onChange={(e) => setProfile((p) => (p ? { ...p, billing_tax_id: e.target.value } : p))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email de facturación</label>
                    <input
                      type="email"
                      value={profile?.billing_email || ''}
                      onChange={(e) => setProfile((p) => (p ? { ...p, billing_email: e.target.value } : p))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta / CLABE</label>
                    <input
                      type="text"
                      value={profile?.billing_bank_account || ''}
                      onChange={(e) => setProfile((p) => (p ? { ...p, billing_bank_account: e.target.value } : p))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dirección fiscal</label>
                    <textarea
                      rows={3}
                      value={profile?.billing_address || ''}
                      onChange={(e) => setProfile((p) => (p ? { ...p, billing_address: e.target.value } : p))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                    <textarea
                      rows={3}
                      value={profile?.billing_notes || ''}
                      onChange={(e) => setProfile((p) => (p ? { ...p, billing_notes: e.target.value } : p))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    />
                  </div>
                </div>
              </section>

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <div className="text-sm text-gray-500">Rol: {role || '-'}</div>
                <button
                  type="submit"
                  disabled={saving || !profile}
                  className="inline-flex items-center justify-center px-6 py-3 rounded-md bg-primary text-white font-semibold hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
