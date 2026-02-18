import { ClipboardCheck, Shield, FileText, Users, Clock, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';

export default function HowWeWork() {
  const { t } = useSettings();

  const processes = [
    {
      icon: ClipboardCheck,
      title: t('checklistTitle'),
      description: t('checklistDesc')
    },
    {
      icon: Shield,
      title: t('securityTitle'),
      description: t('securityDesc')
    },
    {
      icon: FileText,
      title: t('transparencyTitle'),
      description: t('transparencyDesc')
    },
    {
      icon: Users,
      title: t('staffTitle'),
      description: t('staffDesc')
    }
  ];

  return (
    <div className="bg-background min-h-screen">
      {/* Hero Section */}
      <div className="bg-primary text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            {t('hwwHeroTitle')}
          </h1>
          <p className="text-xl text-gray-200 max-w-3xl mx-auto">
            {t('hwwHeroSubtitle')}
          </p>
        </div>
      </div>

      {/* Main Process Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {processes.map((item, index) => (
            <div key={index} className="flex gap-6">
              <div className="flex-shrink-0">
                <div className="bg-accent/10 p-4 rounded-full">
                  <item.icon className="h-8 w-8 text-primary" />
                </div>
              </div>
              <div>
                <h3 className="text-2xl font-bold text-primary mb-3">{item.title}</h3>
                <p className="text-text-secondary text-lg leading-relaxed">
                  {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Workflow Section */}
      <div className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-primary mb-4">{t('workflowTitle')}</h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              {t('workflowSubtitle')}
            </p>
          </div>

          <div className="relative">
            {/* Connecting Line (Desktop) */}
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-1 bg-gray-100 -translate-y-1/2 z-0" />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
              <div className="bg-background p-8 rounded-xl border border-gray-100 text-center">
                <div className="bg-primary text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-6">1</div>
                <h3 className="text-xl font-bold text-primary mb-3">{t('step1Title')}</h3>
                <p className="text-text-secondary text-sm">
                  {t('step1Desc')}
                </p>
              </div>
              
              <div className="bg-background p-8 rounded-xl border border-gray-100 text-center">
                <div className="bg-primary text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-6">2</div>
                <h3 className="text-xl font-bold text-primary mb-3">{t('step2Title')}</h3>
                <p className="text-text-secondary text-sm">
                  {t('step2Desc')}
                </p>
              </div>

              <div className="bg-background p-8 rounded-xl border border-gray-100 text-center">
                <div className="bg-primary text-white w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-6">3</div>
                <h3 className="text-xl font-bold text-primary mb-3">{t('step3Title')}</h3>
                <p className="text-text-secondary text-sm">
                  {t('step3Desc')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Response */}
      <div className="bg-primary/5 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-primary mb-6">{t('emergencyTitle')}</h2>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <Clock className="h-6 w-6 text-accent flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-primary">{t('emergencyAvail')}</h4>
                    <p className="text-text-secondary text-sm">{t('emergencyAvailDesc')}</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Zap className="h-6 w-6 text-accent flex-shrink-0" />
                  <div>
                    <h4 className="font-bold text-primary">{t('hurricaneProto')}</h4>
                    <p className="text-text-secondary text-sm">{t('hurricaneProtoDesc')}</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 h-80 rounded-2xl overflow-hidden shadow-xl">
              <img 
                src="https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Modern%20home%20security%20system%20smart%20lock%20luxury%20entrance&image_size=landscape_4_3" 
                alt="Seguridad Residencial" 
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-white py-20 text-center">
        <h2 className="text-3xl font-bold text-primary mb-6">{t('hwwCtaTitle')}</h2>
        <Link
          to="/contacto"
          className="inline-block bg-primary text-white px-8 py-3 rounded-md font-bold hover:bg-opacity-90 transition-colors shadow-lg"
        >
          {t('hwwCtaButton')}
        </Link>
      </div>
    </div>
  );
}
