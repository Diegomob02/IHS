import type { PaymentAttempt } from '../../types';
import { useSettings } from '../../context/SettingsContext';

const centsToMoney = (cents: number, currency: string) => {
  const n = Number(cents || 0) / 100;
  const cur = String(currency || '').toUpperCase();
  return `${cur} ${n.toFixed(2)}`;
};

export function LeaseAttemptsTable({ attempts }: { attempts: PaymentAttempt[] }) {
  const { t, language } = useSettings();
  return (
    <div className="mt-3 overflow-auto border border-gray-200 rounded-lg bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-gray-700">
          <tr>
            <th className="text-left px-3 py-2">{t('attemptsDate')}</th>
            <th className="text-left px-3 py-2">{t('attemptsPeriod')}</th>
            <th className="text-left px-3 py-2">{t('attemptsAmount')}</th>
            <th className="text-left px-3 py-2">{t('attemptsStatus')}</th>
            <th className="text-left px-3 py-2">{t('attemptsRef')}</th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => (
            <tr key={a.id} className="border-t">
              <td className="px-3 py-2 text-gray-600">
                {a.created_at ? new Date(a.created_at).toLocaleDateString(language === 'es' ? 'es-MX' : 'en-US') : '—'}
              </td>
              <td className="px-3 py-2 text-gray-600">{a.period_yyyymm}</td>
              <td className="px-3 py-2 text-gray-600">{centsToMoney(Number(a.amount_cents), a.currency)}</td>
              <td className="px-3 py-2 text-gray-600">{a.status}</td>
              <td className="px-3 py-2 text-gray-600">{a.stripe_payment_intent_id ? String(a.stripe_payment_intent_id).slice(0, 12) : '—'}</td>
            </tr>
          ))}
          {attempts.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-gray-500">{t('noAttemptsYet')}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
