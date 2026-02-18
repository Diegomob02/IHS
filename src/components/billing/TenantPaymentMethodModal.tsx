import { useEffect, useMemo, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { getPublicSupabaseConfig } from '../../utils/env';

const getStripePk = () => {
  const pk = String((import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY || '').trim();
  return pk;
};

function SetupForm({
  leaseId,
  stripeAccountId,
  onDone,
}: {
  leaseId: string;
  stripeAccountId: string;
  onDone: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!stripe || !elements) return;
    setSaving(true);
    try {
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
        confirmParams: {},
      } as any);
      if (confirmError) throw new Error(confirmError.message);
      const setupIntentId = String((setupIntent as any)?.id || '').trim();
      if (!setupIntentId) throw new Error('No se pudo confirmar el método');

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';
      if (!token) throw new Error('Sesión expirada');
      const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();
      const res = await fetch(`${supabaseUrl}/functions/v1/tenant-finalize-setup-intent`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leaseId, setupIntentId, stripeAccountId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.error || 'No se pudo guardar el método'));

      onDone();
    } catch (err: any) {
      setError(String(err?.message || 'Error al guardar método'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PaymentElement />
      {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div> : null}
      <button
        type="submit"
        disabled={!stripe || saving}
        className="w-full px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60"
      >
        {saving ? 'Guardando...' : 'Guardar método'}
      </button>
      <div className="text-xs text-gray-500">
        Tu tarjeta se procesa de forma segura por Stripe. No almacenamos datos completos de tarjeta.
      </div>
    </form>
  );
}

export function TenantPaymentMethodModal({
  open,
  leaseId,
  onClose,
  onSuccess,
}: {
  open: boolean;
  leaseId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [stripeAccountId, setStripeAccountId] = useState<string>('');

  const pk = getStripePk();
  const stripePromise = useMemo(() => {
    if (!pk || !stripeAccountId) return null;
    return loadStripe(pk, { stripeAccount: stripeAccountId } as any);
  }, [pk, stripeAccountId]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setClientSecret('');
    setStripeAccountId('');
    if (!pk) {
      setError('Falta configurar VITE_STRIPE_PUBLISHABLE_KEY.');
      return;
    }
    const run = async () => {
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token || '';
        if (!token) throw new Error('Sesión expirada');
        const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();
        const res = await fetch(`${supabaseUrl}/functions/v1/tenant-create-setup-intent`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: supabaseAnonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ leaseId }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(String(json?.error || 'No se pudo iniciar el registro'));
        setClientSecret(String(json.clientSecret || ''));
        setStripeAccountId(String(json.stripeAccountId || ''));
      } catch (e: any) {
        setError(String(e?.message || 'Error'));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [open, leaseId, pk]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
          <div className="font-bold text-gray-900">Registrar método de pago</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" type="button" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          {loading ? <div className="h-28 bg-gray-100 rounded-lg animate-pulse" /> : null}
          {error ? <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div> : null}

          {!loading && !error && clientSecret && stripePromise ? (
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <SetupForm
                leaseId={leaseId}
                stripeAccountId={stripeAccountId}
                onDone={() => {
                  onSuccess();
                  onClose();
                }}
              />
            </Elements>
          ) : null}
        </div>
      </div>
    </div>
  );
}

