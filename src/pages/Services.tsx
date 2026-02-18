import { 
  Building, 
  Wrench, 
  ConciergeBell, 
  TrendingUp, 
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';

export default function Services() {
  const { t } = useSettings();

  const services = [
    {
      id: 'property-management',
      icon: Building,
      title: t('srvPropTitle'),
      description: t('srvPropDesc'),
      features: [
        t('srvPropF1'),
        t('srvPropF2'),
        t('srvPropF3'),
        t('srvPropF4'),
        t('srvPropF5')
      ],
      image: 'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Luxury%20home%20management%20organized%20clean%20modern%20interior&image_size=landscape_16_9'
    },
    {
      id: 'maintenance',
      icon: Wrench,
      title: t('srvMaintTitle'),
      description: t('srvMaintDesc'),
      features: [
        t('srvMaintF1'),
        t('srvMaintF2'),
        t('srvMaintF3'),
        t('srvMaintF4'),
        t('srvMaintF5')
      ],
      image: 'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Pool%20maintenance%20technician%20cleaning%20luxury%20pool%20sunny%20day&image_size=landscape_16_9'
    },
    {
      id: 'concierge',
      icon: ConciergeBell,
      title: t('srvConciergeTitle'),
      description: t('srvConciergeDesc'),
      features: [
        t('srvConciergeF1'),
        t('srvConciergeF2'),
        t('srvConciergeF3'),
        t('srvConciergeF4'),
        t('srvConciergeF5')
      ],
      image: 'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Private%20chef%20cooking%20in%20luxury%20kitchen%20ocean%20background&image_size=landscape_16_9'
    },
    {
      id: 'financial',
      icon: TrendingUp,
      title: t('srvFinTitle'),
      description: t('srvFinDesc'),
      features: [
        t('srvFinF1'),
        t('srvFinF2'),
        t('srvFinF3'),
        t('srvFinF4'),
        t('srvFinF5')
      ],
      image: 'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Business%20meeting%20financial%20report%20laptop%20coffee%20modern%20office&image_size=landscape_16_9'
    }
  ];

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <div className="bg-primary py-20 text-center text-white">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">{t('servicesPageTitle')}</h1>
        <p className="text-xl max-w-2xl mx-auto px-4 text-gray-200">
          {t('servicesPageSubtitle')}
        </p>
      </div>

      {/* Services List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="space-y-24">
          {services.map((service, index) => (
            <div 
              key={service.id} 
              className={`flex flex-col md:flex-row gap-12 items-center ${
                index % 2 === 1 ? 'md:flex-row-reverse' : ''
              }`}
            >
              {/* Content */}
              <div className="flex-1 space-y-6">
                <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full">
                  <service.icon className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-3xl font-bold text-primary">{service.title}</h2>
                <p className="text-text-secondary text-lg leading-relaxed">
                  {service.description}
                </p>
                <ul className="space-y-3">
                  {service.features.map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-accent mr-3 flex-shrink-0 mt-0.5" />
                      <span className="text-text-main">{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="pt-4">
                  <Link 
                    to="/contacto"
                    className="inline-flex items-center text-primary font-bold hover:text-accent transition-colors"
                  >
                    {t('servicesRequestDetails')} <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </div>
              </div>

              {/* Image */}
              <div className="flex-1 w-full">
                <div className="rounded-2xl overflow-hidden shadow-xl aspect-video relative group">
                  <img 
                    src={service.image} 
                    alt={service.title} 
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="bg-white py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-primary mb-6">
            {t('servicesCtaTitle')}
          </h2>
          <p className="text-text-secondary mb-8 text-lg">
            {t('servicesCtaSubtitle')}
          </p>
          <Link
            to="/contacto"
            className="inline-block bg-primary text-white px-8 py-3 rounded-md font-bold hover:bg-opacity-90 transition-colors shadow-lg"
          >
            {t('servicesCtaButton')}
          </Link>
        </div>
      </div>
    </div>
  );
}
