  import { ArrowRight, Star, Clock, Home as HomeIcon, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';

export default function Home() {
  const { t } = useSettings();

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative h-[600px] flex items-center justify-center">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Luxury%20villa%20in%20Cabo%20San%20Lucas%20ocean%20view%20sunset%20modern%20architecture%20high%20quality&image_size=landscape_16_9" 
            alt="Cabo San Lucas Villa" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
            {t('heroTitle').split(',').map((part, i) => i === 0 ? <span key={i}>{part},<br /></span> : part)}
          </h1>
          <p className="text-xl text-gray-200 mb-8 max-w-2xl mx-auto">
            {t('heroSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/evaluacion"
              className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary hover:bg-opacity-90 transition-colors"
            >
              {t('requestEvalBtn')}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              to="/propiedades"
              className="inline-flex items-center px-8 py-3 border border-white text-base font-medium rounded-md text-white hover:bg-white hover:text-primary transition-colors"
            >
              {t('viewPropertiesBtn')}
            </Link>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            <div className="p-6">
              <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-4xl font-bold text-primary mb-2">{t('stat247')}</h3>
              <p className="text-text-secondary">{t('stat247Desc')}</p>
            </div>
            <div className="p-6">
              <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
                <HomeIcon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-4xl font-bold text-primary mb-2">{t('stat50')}</h3>
              <p className="text-text-secondary">{t('stat50Desc')}</p>
            </div>
            <div className="p-6">
              <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-4">
                <Shield className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-4xl font-bold text-primary mb-2">{t('stat10')}</h3>
              <p className="text-text-secondary">{t('stat10Desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Services Preview */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-primary mb-4">{t('servicesTitle')}</h2>
            <p className="text-text-secondary max-w-2xl mx-auto">
              {t('servicesSubtitle')}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: t('serviceVacationTitle'),
                desc: t('serviceVacationDesc'),
                image: 'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Hotel%20concierge%20welcoming%20guests%20luxury%20resort&image_size=landscape_4_3'
              },
              {
                title: t('serviceMaintenanceTitle'),
                desc: t('serviceMaintenanceDesc'),
                image: 'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Property%20maintenance%20pool%20cleaning%20professional%20service&image_size=landscape_4_3'
              },
              {
                title: t('serviceFinancialTitle'),
                desc: t('serviceFinancialDesc'),
                image: 'https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Financial%20charts%20tablet%20business%20growth%20investment&image_size=landscape_4_3'
              }
            ].map((service, index) => (
              <div key={index} className="bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <img src={service.image} alt={service.title} className="w-full h-48 object-cover" />
                <div className="p-6">
                  <h3 className="text-xl font-bold text-primary mb-2">{service.title}</h3>
                  <p className="text-text-secondary mb-4">{service.desc}</p>
                  <Link to="/servicios" className="text-accent hover:text-primary font-medium inline-flex items-center">
                    {t('viewMore')} <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-primary mb-12">{t('testimonialsTitle')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                name: t('testimonial1Name'),
                role: t('testimonial1Role'),
                text: t('testimonial1Text')
              },
              {
                name: t('testimonial2Name'),
                role: t('testimonial2Role'),
                text: t('testimonial2Text')
              },
              {
                name: t('testimonial3Name'),
                role: t('testimonial3Role'),
                text: t('testimonial3Text')
              }
            ].map((testimonial, index) => (
              <div key={index} className="bg-background p-8 rounded-lg relative">
                <div className="flex text-accent mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-current" />
                  ))}
                </div>
                <p className="text-text-main mb-6 italic">"{testimonial.text}"</p>
                <div>
                  <p className="font-bold text-primary">{testimonial.name}</p>
                  <p className="text-sm text-text-secondary">{testimonial.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">{t('ctaTitle')}</h2>
          <p className="text-gray-300 mb-8 max-w-2xl mx-auto">
            {t('ctaSubtitle')}
          </p>
          <Link
            to="/evaluacion"
            className="inline-block bg-accent text-primary px-8 py-3 rounded-md font-bold hover:bg-white transition-colors"
          >
            {t('ctaButton')}
          </Link>
        </div>
      </section>
    </div>
  );
}
