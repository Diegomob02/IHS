import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Plus, RefreshCw, Save } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import type { Lease, PaymentAttempt } from '../../../types';
import { getPublicSupabaseConfig } from '../../../utils/env';
import { LeaseAttemptsTable } from '../../billing/LeaseAttemptsTable';

const centsToMoney = (cents: number, currency: string) => {
  const n = Number(cents || 0) / 100;
  return `${String(currency || '').toUpperCase()} ${n.toFixed(2)}`;
};

const toCents = (v: string) => {
  const n = Number(String(v || '').trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
};

type LeaseDraft = {
  tenantId: string;
  amount: string;
  currency: 'usd' | 'mxn';
  billingDay: string;
  weekendRule: Lease['weekend_rule'];
  autopayEnabled: boolean;
};

export function PropertyBillingTab({ property }: { property: any }) {
  const propertyId = String(property?.id || '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [draft, setDraft] = useState<LeaseDraft>({
    tenantId: '',
    amount: '0.00',
    currency: 'usd',
    billingDay: '1',
    weekendRule: 'shift_to_next_business_day',
    autopayEnabled: true,
  });

  const attemptsByLease = useMemo(() => {
    const m = new Map<string, PaymentAttempt[]>();
    for (const a of attempts) {
      const key = String(a.lease_id);
      const list = m.get(key) ?? [];
      if (list.length < 10) list.push(a);
      m.set(key, list);
    }
    return m;
  }, [attempts]);

  const loadAll = async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: leaseRows, error: lErr } = await supabase
        .from('leases')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });
      if (lErr) throw lErr;
      const nextLeases = (leaseRows || []) as Lease[];
      setLeases(nextLeases);

      const leaseIds = nextLeases.map((l) => l.id);
      const { data: attemptRows, error: aErr } = leaseIds.length
        ? await supabase
          .from('payment_attempts')
          .select('*')
          .in('lease_id', leaseIds)
          .order('created_at', { ascending: false })
          .limit(200)
        : { data: [], error: null };
      if (aErr) throw aErr;
      setAttempts((attemptRows || []) as PaymentAttempt[]);
    } catch (e: any) {
      setError(String(e?.message || 'Error al cargar cobros'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const createLease = async () => {
    if (!propertyId) return;
    setSaving(true);
    try {
      const payload: any = {
        property_id: propertyId,
        tenant_id: draft.tenantId.trim() || null,
        rent_amount_cents: String(toCents(draft.amount)),
        currency: draft.currency,
        billing_day: Math.max(1, Math.min(28, Math.round(Number(draft.billingDay) || 1))),
        weekend_rule: draft.weekendRule,
        autopay_enabled: Boolean(draft.autopayEnabled),
        autopay_status: draft.autopayEnabled ? 'pending_method' : 'paused',
        status: 'active',
      };
      const { error: insErr } = await supabase.from('leases').insert(payload);
      if (insErr) throw insErr;
      await loadAll();
      setDraft({ ...draft, tenantId: '', amount: '0.00' });
    } catch (e: any) {
      alert(String(e?.message || 'Error al crear lease'));
    } finally {
      setSaving(false);
    }
  };

  const updateLease = async (leaseId: string, patch: Partial<Lease>) => {
    setSaving(true);
    try {
      const { error: upErr } = await supabase.from('leases').update(patch as any).eq('id', leaseId);
      if (upErr) throw upErr;
      await loadAll();
    } catch (e: any) {
      alert(String(e?.message || 'Error al guardar lease'));
    } finally {
      setSaving(false);
    }
  };

  const chargeNow = async (leaseId: string) => {
    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';
      if (!token) throw new Error('Sesión expirada');
      const { supabaseUrl, supabaseAnonKey } = getPublicSupabaseConfig();
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-charge-now`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leaseId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(json?.error || 'No se pudo cobrar'));
      await loadAll();
    } catch (e: any) {
      alert(String(e?.message || 'Error al cobrar'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-28 bg-white rounded-xl animate-pulse" />;

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="bg-white rounded-xl shadow p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="font-bold text-gray-900">Reglas de Cobro (Leases)</h4>
            <p className="mt-1 text-xs text-gray-500">Autopay mensual sin planes. Cada cobro ocurre en el Stripe del cliente.</p>
          </div>
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 text-sm hover:bg-gray-50"
            type="button"
          >
            <RefreshCw size={16} />
            Actualizar
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <div className="text-xs font-bold text-gray-700 mb-1">Tenant ID (opcional)</div>
            <input value={draft.tenantId} onChange={(e) => setDraft({ ...draft, tenantId: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-700 mb-1">Monto mensual</div>
            <input value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-700 mb-1">Moneda</div>
            <select value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value as any })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="usd">USD</option>
              <option value="mxn">MXN</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-bold text-gray-700 mb-1">Día</div>
            <input value={draft.billingDay} onChange={(e) => setDraft({ ...draft, billingDay: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-700 mb-1">Regla fin de semana</div>
            <select value={draft.weekendRule} onChange={(e) => setDraft({ ...draft, weekendRule: e.target.value as any })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
              <option value="shift_to_next_business_day">Mover al siguiente día hábil</option>
              <option value="shift_to_previous_business_day">Mover al día hábil anterior</option>
              <option value="no_shift">No mover</option>
            </select>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.autopayEnabled} onChange={(e) => setDraft({ ...draft, autopayEnabled: e.target.checked })} />
            Autopay habilitado
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={createLease}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60"
          >
            <Plus size={16} />
            Crear lease
          </button>
        </div>
      </div>

      {leases.map((l) => (
        <div key={l.id} className="bg-white rounded-xl shadow p-5 border border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <div className="text-xs text-gray-500">Lease</div>
              <div className="font-bold text-gray-900 break-all">{l.id}</div>
              <div className="mt-1 text-sm text-gray-700">
                {centsToMoney(l.rent_amount_cents, l.currency)} · Día {l.billing_day} · Autopay {l.autopay_enabled ? 'ON' : 'OFF'} · {l.autopay_status}
              </div>
              <div className="mt-1 text-xs text-gray-500">Tenant: {l.tenant_id || '—'}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => chargeNow(l.id)}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 text-sm hover:bg-gray-50 disabled:opacity-60"
              >
                <CreditCard size={16} />
                Cobrar ahora
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-6 gap-3">
            <div>
              <div className="text-xs font-bold text-gray-700 mb-1">Monto</div>
              <input
                defaultValue={(Number(l.rent_amount_cents) / 100).toFixed(2)}
                onBlur={(e) => updateLease(l.id, { rent_amount_cents: toCents(e.target.value) } as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-700 mb-1">Moneda</div>
              <select
                value={l.currency}
                onChange={(e) => updateLease(l.id, { currency: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="usd">USD</option>
                <option value="mxn">MXN</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-bold text-gray-700 mb-1">Día</div>
              <input
                value={String(l.billing_day)}
                onChange={(e) => updateLease(l.id, { billing_day: Math.max(1, Math.min(28, Math.round(Number(e.target.value) || 1))) } as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <div className="text-xs font-bold text-gray-700 mb-1">Regla fin de semana</div>
              <select
                value={l.weekend_rule}
                onChange={(e) => updateLease(l.id, { weekend_rule: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="shift_to_next_business_day">Mover al siguiente día hábil</option>
                <option value="shift_to_previous_business_day">Mover al día hábil anterior</option>
                <option value="no_shift">No mover</option>
              </select>
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={l.autopay_enabled}
                  onChange={(e) => updateLease(l.id, { autopay_enabled: e.target.checked, autopay_status: e.target.checked ? 'pending_method' : 'paused' } as any)}
                />
                Autopay
              </label>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Save size={14} />
            Cambios se guardan al editar.
          </div>

          <LeaseAttemptsTable attempts={attemptsByLease.get(l.id) ?? []} />
        </div>
      ))}

      {leases.length === 0 ? (
        <div className="bg-white rounded-xl shadow p-6 text-sm text-gray-700">No hay leases para esta propiedad.</div>
      ) : null}
    </div>
  );
}

