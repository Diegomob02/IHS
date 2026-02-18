import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';

export default function BillingSettings() {
  const { t } = useSettings();
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="bg-white rounded-xl shadow p-6">
        <h1 className="text-xl font-semibold text-gray-900">{t('billingSettingsTitle')}</h1>
        <p className="mt-2 text-sm text-gray-700">{t('billingSettingsSubtitle')}</p>
        <Link
          to="/billing"
          className="inline-flex mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
        >
          {t('goToBillingPortal')}
        </Link>
      </div>
    </div>
  );
}
