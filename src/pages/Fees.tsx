import { CheckCircle, XCircle, HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';

export default function Fees() {
  const { t } = useSettings();

  return (
    <div className="bg-background min-h-screen">
      {/* Hero */}
      <div className="bg-primary text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            {t('feesHeroTitle')}
          </h1>
          <p className="text-xl text-gray-200 max-w-3xl mx-auto">
            {t('feesHeroSubtitle')}
          </p>
        </div>
      </div>

      {/* The Model */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <h2 className="text-3xl font-bold text-primary mb-6">{t('feesApproachTitle')}</h2>
            <p className="text-text-secondary text-lg mb-6">
              {t('feesApproachP1Start')}
              <strong>{t('feesApproachP1Strong')}</strong>
              {t('feesApproachP1End')}
            </p>
            <p className="text-text-secondary text-lg mb-6">
              {t('feesApproachP2Start')}
              <strong>{t('feesApproachP2Strong')}</strong>
              {t('feesApproachP2End')}
            </p>
            
            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm mt-8">
              <h3 className="font-bold text-lg mb-4 text-primary">{t('feesDeterminantsTitle')}</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-accent mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-text-main">{t('feesDet1')}</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-accent mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-text-main">{t('feesDet2')}</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-accent mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-text-main">{t('feesDet3')}</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-accent mr-3 flex-shrink-0 mt-0.5" />
                  <span className="text-text-main">{t('feesDet4')}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-gray-50 p-8 rounded-2xl border border-gray-200">
            <h3 className="text-2xl font-bold text-primary mb-6 text-center">{t('feesComparisonTitle')}</h3>
            
            <div className="space-y-8">
              <div>
                <h4 className="font-bold text-lg mb-4 text-center text-accent">{t('feesComparisonIhsTitle')}</h4>
                <ul className="space-y-3">
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                    <span>{t('feesComparisonIhs1')}</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                    <span>{t('feesComparisonIhs2')}</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                    <span>{t('feesComparisonIhs3')}</span>
                  </li>
                  <li className="flex items-center text-sm">
                    <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                    <span>{t('feesComparisonIhs4')}</span>
                  </li>
                </ul>
              </div>

              <div className="border-t border-gray-200 pt-8">
                <h4 className="font-bold text-lg mb-4 text-center text-gray-500">{t('feesComparisonVacationTitle')}</h4>
                <ul className="space-y-3">
                  <li className="flex items-center text-sm text-gray-500">
                    <XCircle className="h-5 w-5 text-red-400 mr-2" />
                    <span>{t('feesComparisonVacation1')}</span>
                  </li>
                  <li className="flex items-center text-sm text-gray-500">
                    <XCircle className="h-5 w-5 text-red-400 mr-2" />
                    <span>{t('feesComparisonVacation2')}</span>
                  </li>
                  <li className="flex items-center text-sm text-gray-500">
                    <XCircle className="h-5 w-5 text-red-400 mr-2" />
                    <span>{t('feesComparisonVacation3')}</span>
                  </li>
                  <li className="flex items-center text-sm text-gray-500">
                    <XCircle className="h-5 w-5 text-red-400 mr-2" />
                    <span>{t('feesComparisonVacation4')}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-white py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-primary mb-12 text-center">{t('feesFaqTitle')}</h2>
          
          <div className="space-y-8">
            {[
              {
                q: t('feesFaq1Q'),
                a: t('feesFaq1A')
              },
              {
                q: t('feesFaq2Q'),
                a: t('feesFaq2A')
              },
              {
                q: t('feesFaq3Q'),
                a: t('feesFaq3A')
              }
            ].map((faq, i) => (
              <div key={i} className="bg-background p-6 rounded-lg">
                <h3 className="font-bold text-primary text-lg mb-2 flex items-start">
                  <HelpCircle className="h-5 w-5 text-accent mr-2 mt-1 flex-shrink-0" />
                  {faq.q}
                </h3>
                <p className="text-text-secondary ml-7">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-primary py-16 text-center text-white">
        <h2 className="text-3xl font-bold mb-6">{t('feesCtaTitle')}</h2>
        <p className="text-xl max-w-2xl mx-auto mb-8 text-gray-200">
          {t('feesCtaSubtitle')}
        </p>
        <Link
          to="/contacto"
          className="inline-block bg-accent text-primary px-8 py-3 rounded-md font-bold hover:bg-white transition-colors"
        >
          {t('feesCtaButton')}
        </Link>
      </div>
    </div>
  );
}
