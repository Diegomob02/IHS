import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Lease, PaymentAttempt, TenantPaymentProfile } from '../types';
import { TenantPaymentMethodModal } from '../components/billing/TenantPaymentMethodModal';
import { LeaseAttemptsTable } from '../components/billing/LeaseAttemptsTable';
import { getPublicSupabaseConfig } from '../utils/env';
import { useSettings } from '../context/SettingsContext';

type ViewState = {
  loading: boolean;
  error: string | null;
};

type LeaseVm = {
  lease: Lease;
  propertyTitle: string;
  clientId: string;
  paymentProfile: TenantPaymentProfile | null;
  attempts: PaymentAttempt[];
};

const centsToMoney = (cents: number, currency: string) => {
  const n = Number(cents || 0) / 100;
  const cur = String(currency || '').toUpperCase();
  return `${cur} ${n.toFixed(2)}`;
};

export default function BillingDashboard() {
  const { t } = useSettings();
  const [userEmail, setUserEmail] = useState<string>('');
  const [role, setRole] = useState<string>('');
  const [leases, setLeases] = useState<LeaseVm[]>([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [setupLeaseId, setSetupLeaseId] = useState<string>('');
  const [state, setState] = useState<ViewState>({ loading: true, error: null });

  const isTenant = role === 'tenant';
  const isStaff = role === 'admin' || role === 'super_admin';

  const loadAll = async () => {
    setState({ loading: true, error: null });
    try {
      const { data: auth } = await supabase.auth.getUser();
      const email = String(auth.user?.email || '');
      const uid = String(auth.user?.id || '');
      if (!email) {
        setUserEmail('');
        setRole('');
        setLeases([]);
        setState({ loading: false, error: null });
        return;
      }
      setUserEmail(email);

      const { data: profile } = await supabase.from('users').select('id, role').eq('id', uid).maybeSingle();
      const nextRole = String((profile as any)?.role || '');
      setRole(nextRole);

      let leaseRows: Lease[] = [];
      if (nextRole === 'tenant') {
        const { data, error } = await supabase.from('leases').select('*').eq('tenant_id', uid).order('created_at', { ascending: false });
        if (error) throw error;
        leaseRows = (data || []) as Lease[];
      } else if (nextRole === 'super_admin') {
        const { data, error } = await supabase.from('leases').select('*').order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        leaseRows = (data || []) as Lease[];
      } else if (nextRole === 'admin') {
        const { data: props, error: pErr } = await supabase.from('properties').select('id').eq('assigned_admin_id', uid);
        if (pErr) throw pErr;
        const ids = (props || []).map((p: any) => p.id);
        if (ids.length === 0) leaseRows = [];
        else {
          const { data, error } = await supabase.from('leases').select('*').in('property_id', ids).order('created_at', { ascending: false });
          if (error) throw error;
          leaseRows = (data || []) as Lease[];
        }
      } else {
        leaseRows = [];
      }

      const propertyIds = Array.from(new Set(leaseRows.map((l) => l.property_id)));
      const { data: propRows, error: propErr } = propertyIds.length
        ? await supabase.from('properties').select('id, title, client_id').in('id', propertyIds)
        : { data: [], error: null };
      if (propErr) throw propErr;
      const propsById = new Map((propRows || []).map((p: any) => [p.id, p]));

      const clientIds = Array.from(new Set((propRows || []).map((p: any) => p.client_id).filter(Boolean)));
      const { data: tppRows, error: tppErr } = uid && clientIds.length
        ? await supabase.from('tenant_payment_profiles').select('*').eq('tenant_id', uid).in('client_id', clientIds)
        : { data: [], error: null };
      if (tppErr) throw tppErr;
      const tppByClientId = new Map((tppRows || []).map((t: any) => [t.client_id, t]));

      const leaseIds = leaseRows.map((l) => l.id);
      const { data: attemptRows, error: aErr } = leaseIds.length
        ? await supabase.from('payment_attempts').select('*').in('lease_id', leaseIds).order('created_at', { ascending: false }).limit(200)
        : { data: [], error: null };
      if (aErr) throw aErr;

      const attemptsByLease = new Map<string, PaymentAttempt[]>();
      for (const a of (attemptRows || []) as any[]) {
        const key = String(a.lease_id);
        const list = attemptsByLease.get(key) ?? [];
        if (list.length < 10) list.push(a as PaymentAttempt);
        attemptsByLease.set(key, list);
      }

      const vms: LeaseVm[] = leaseRows.map((l) => {
        const p = propsById.get(l.property_id);
        const clientId = String(p?.client_id || '');
        return {
          lease: l,
          propertyTitle: String(p?.title || l.property_id),
          clientId,
          paymentProfile: isTenant && clientId ? (tppByClientId.get(clientId) as any) ?? null : null,
          attempts: (attemptsByLease.get(l.id) ?? []) as PaymentAttempt[],
        };
      });
      setLeases(vms);

      setState({ loading: false, error: null });
    } catch (e: any) {
      setState({ loading: false, error: String(e?.message || t('loadBillingError')) });
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chargeNow = async (leaseId: string) => {
    setLoadingAction(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || '';
      if (!token) throw new Error(t('sessionExpiredShort'));
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
      if (!res.ok) throw new Error(String(json?.error || t('couldNotCharge')));
      await loadAll();
    } catch (e: any) {
      alert(String(e?.message || t('chargeError')));
    } finally {
      setLoadingAction(false);
    }
  };

  if (state.loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="h-28 bg-white/70 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!userEmail) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-xl font-semibold text-gray-900">{t('billingTitle')}</h1>
          <p className="mt-2 text-sm text-gray-600">{t('billingSignInPrompt')}</p>
          <Link
            to="/propietarios"
            className="inline-flex mt-4 items-center justify-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            {t('goToSignIn')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('billingTitle')}</h1>
          <p className="mt-1 text-sm text-gray-600">{t('billingSubtitle')}</p>
        </div>
        <button
          onClick={loadAll}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 bg-white text-sm text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw size={16} />
          {t('refresh')}
        </button>
      </div>

      {state.error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</div>
      )}

      <div className="mt-6 space-y-4">
        {!isTenant && !isStaff ? (
          <div className="bg-white rounded-xl shadow p-6 text-sm text-gray-700">{t('roleNoAccess')}</div>
        ) : null}

        {leases.map((vm) => (
          <div key={vm.lease.id} className="bg-white rounded-xl shadow border border-gray-200 p-5">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <div className="text-sm text-gray-500">{t('documentsPropertyLabel')}</div>
                <div className="text-lg font-bold text-gray-900">{vm.propertyTitle}</div>
                <div className="mt-1 text-sm text-gray-600">
                  {t('amountLabel')}: {centsToMoney(vm.lease.rent_amount_cents, vm.lease.currency)} · {t('dayLabel')}: {vm.lease.billing_day} · {t('autopayLabel')}: {vm.lease.autopay_enabled ? 'ON' : 'OFF'} · {t('statusLabel')}: {vm.lease.autopay_status}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isTenant ? (
                  <button
                    type="button"
                    onClick={() => setSetupLeaseId(vm.lease.id)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-sm hover:bg-gray-50"
                  >
                    <CreditCard size={16} />
                    {vm.paymentProfile?.status === 'active' ? t('updatePaymentMethod') : t('registerPaymentMethod')}
                  </button>
                ) : null}

                {isStaff ? (
                  <button
                    type="button"
                    disabled={loadingAction}
                    onClick={() => chargeNow(vm.lease.id)}
                    className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60"
                  >
                    {loadingAction ? t('chargingNow') : t('chargeNow')}
                  </button>
                ) : null}
              </div>
            </div>

            {isTenant ? (
              <div className="mt-3 text-sm text-gray-700">
                {t('savedMethodLabel')}: {vm.paymentProfile?.status === 'active' ? t('yes') : t('no')}
                {vm.paymentProfile?.payment_method_summary?.last4 ? ` · **** ${vm.paymentProfile.payment_method_summary.last4}` : ''}
              </div>
            ) : null}

            <LeaseAttemptsTable attempts={vm.attempts} />
          </div>
        ))}

        {leases.length === 0 ? (
          <div className="bg-white rounded-xl shadow p-6 text-sm text-gray-700">{t('noLeasesAvailable')}</div>
        ) : null}
      </div>

      <TenantPaymentMethodModal
        open={!!setupLeaseId}
        leaseId={setupLeaseId}
        onClose={() => setSetupLeaseId('')}
        onSuccess={loadAll}
      />
    </div>
  );
}
