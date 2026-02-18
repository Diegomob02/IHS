import { PieChart, FileText, Lock, Landmark, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';

export default function Financial() {
  const { t } = useSettings();

  return (
    <div className="bg-background min-h-screen">
      {/* Hero */}
      <div className="bg-primary text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            {t('financialHeroTitle')}
          </h1>
          <p className="text-xl text-gray-200 max-w-3xl mx-auto">
            {t('financialHeroSubtitle')}
          </p>
        </div>
      </div>

      {/* Core Principles */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <Landmark className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-primary mb-2">{t('financialPrinciple1Title')}</h3>
                <p className="text-text-secondary text-lg">
                  {t('financialPrinciple1Desc')}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <FileText className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-primary mb-2">{t('financialPrinciple2Title')}</h3>
                <p className="text-text-secondary text-lg">
                  {t('financialPrinciple2Desc')}
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <Lock className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-primary mb-2">{t('financialPrinciple3Title')}</h3>
                <p className="text-text-secondary text-lg">
                  {t('financialPrinciple3Desc')}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
            <h3 className="text-xl font-bold text-primary mb-6 flex items-center">
              <PieChart className="mr-2 h-6 w-6 text-accent" />
              {t('financialSampleTitle')}
            </h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                <span className="font-medium text-gray-600">{t('financialSampleLine1Label')}</span>
                <span className="font-bold text-gray-900">$4,500 MXN</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                <span className="font-medium text-gray-600">{t('financialSampleLine2Label')}</span>
                <span className="font-bold text-gray-900">$3,200 MXN</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                <span className="font-medium text-gray-600">{t('financialSampleLine3Label')}</span>
                <span className="font-bold text-gray-900">$2,800 MXN</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                <span className="font-medium text-gray-600">{t('financialSampleLine4Label')}</span>
                <span className="font-bold text-gray-900">$850 MXN</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="font-bold text-primary text-lg">{t('financialSampleTotalLabel')}</span>
                <span className="font-bold text-primary text-lg">$11,350 MXN</span>
              </div>
              <div className="mt-6 bg-gray-50 p-4 rounded-lg text-xs text-gray-500">
                {t('financialSampleNote')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Process Section */}
      <div className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-primary mb-4">{t('financialProcessTitle')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="p-6">
              <div className="text-5xl font-bold text-accent/20 mb-4">01</div>
              <h3 className="text-xl font-bold text-primary mb-2">{t('financialProcessStep1Title')}</h3>
              <p className="text-text-secondary">
                {t('financialProcessStep1Desc')}
              </p>
            </div>
            <div className="p-6">
              <div className="text-5xl font-bold text-accent/20 mb-4">02</div>
              <h3 className="text-xl font-bold text-primary mb-2">{t('financialProcessStep2Title')}</h3>
              <p className="text-text-secondary">
                {t('financialProcessStep2Desc')}
              </p>
            </div>
            <div className="p-6">
              <div className="text-5xl font-bold text-accent/20 mb-4">03</div>
              <h3 className="text-xl font-bold text-primary mb-2">{t('financialProcessStep3Title')}</h3>
              <p className="text-text-secondary">
                {t('financialProcessStep3Desc')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-primary/5 py-20 text-center">
        <h2 className="text-3xl font-bold text-primary mb-6">{t('financialCtaTitle')}</h2>
        <p className="text-text-secondary max-w-2xl mx-auto mb-8">
          {t('financialCtaSubtitle')}
        </p>
        <Link
          to="/contacto"
          className="inline-block bg-primary text-white px-8 py-3 rounded-md font-bold hover:bg-opacity-90 transition-colors shadow-lg"
        >
          {t('financialCtaButton')}
        </Link>
      </div>
    </div>
  );
}
