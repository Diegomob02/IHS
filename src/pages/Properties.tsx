import { useState } from 'react';
import { MapPin, Shield, Star, Clock, Home, CheckCircle } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';

interface ManagedProperty {
  id: number;
  title: string;
  location: string;
  region: 'csl' | 'sjd' | 'corridor';
  type: string;
  managedSince: string;
  services: string[];
  image: string;
  highlight: string;
}

export default function Properties() {
  const { t } = useSettings();
  const [filterLocation, setFilterLocation] = useState<'all' | 'csl' | 'sjd' | 'corridor'>('all');

  const portfolio: ManagedProperty[] = [
    {
      id: 1,
      title: "Villa Vista al Mar",
      location: t('portfolio1Location'),
      region: 'csl',
      type: t('portfolio1Type'),
      managedSince: "2019",
      services: [t('portfolio1Services1'), t('portfolio1Services2'), t('portfolio1Services3')],
      image: "https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Luxury%20modern%20villa%20exterior%20infinity%20pool%20sunset%20Cabo&image_size=landscape_16_9",
      highlight: t('portfolio1Highlight')
    },
    {
      id: 2,
      title: "Residencia Palmilla",
      location: t('portfolio2Location'),
      region: 'sjd',
      type: t('portfolio2Type'),
      managedSince: "2021",
      services: [t('portfolio2Services1'), t('portfolio2Services2'), t('portfolio2Services3')],
      image: "https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Luxury%20condo%20interior%20living%20room%20ocean%20balcony&image_size=landscape_16_9",
      highlight: t('portfolio2Highlight')
    },
    {
      id: 3,
      title: "Casa del Sol",
      location: t('portfolio3Location'),
      region: 'corridor',
      type: t('portfolio3Type'),
      managedSince: "2018",
      services: [t('portfolio3Services1'), t('portfolio3Services2'), t('portfolio3Services3')],
      image: "https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Spanish%20colonial%20style%20luxury%20home%20garden%20fountain&image_size=landscape_16_9",
      highlight: t('portfolio3Highlight')
    },
    {
      id: 4,
      title: "Penthouse Diamante",
      location: t('portfolio4Location'),
      region: 'csl',
      type: t('portfolio4Type'),
      managedSince: "2022",
      services: [t('portfolio4Services1'), t('portfolio4Services2'), t('portfolio4Services3')],
      image: "https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Modern%20penthouse%20terrace%20jacuzzi%20night%20view&image_size=landscape_16_9",
      highlight: t('portfolio4Highlight')
    },
    {
      id: 5,
      title: "Retiro en Puerto Los Cabos",
      location: t('portfolio5Location'),
      region: 'sjd',
      type: t('portfolio5Type'),
      managedSince: "2020",
      services: [t('portfolio5Services1'), t('portfolio5Services2'), t('portfolio5Services3')],
      image: "https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Contemporary%20beachfront%20mansion%20glass%20walls%20pool&image_size=landscape_16_9",
      highlight: t('portfolio5Highlight')
    },
    {
      id: 6,
      title: "Apartamento Marina View",
      location: t('portfolio6Location'),
      region: 'csl',
      type: t('portfolio6Type'),
      managedSince: "2023",
      services: [t('portfolio6Services1'), t('portfolio6Services2'), t('portfolio6Services3')],
      image: "https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Modern%20apartment%20balcony%20marina%20yachts%20view&image_size=landscape_16_9",
      highlight: t('portfolio6Highlight')
    }
  ];

  const filteredProperties = portfolio.filter((property) => {
    if (filterLocation === 'all') return true;
    return property.region === filterLocation;
  });

  return (
    <div className="bg-background min-h-screen">
      {/* Hero Section */}
      <div className="bg-primary py-16 px-4 sm:px-6 lg:px-8 shadow-lg relative overflow-hidden">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="max-w-7xl mx-auto relative z-10 text-center">
          <h1 className="text-4xl font-bold text-white mb-6">
            {t('propertiesHeroTitle')}
          </h1>
          <p className="text-xl text-gray-200 max-w-3xl mx-auto">
            {t('propertiesHeroSubtitle')}
          </p>
        </div>
      </div>

      {/* Filter Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        <div className="bg-white p-4 rounded-lg shadow-xl max-w-2xl mx-auto flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative w-full">
            <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
            <select 
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-md focus:ring-primary focus:border-primary appearance-none bg-white text-text-main"
              value={filterLocation}
              onChange={(e) => setFilterLocation(e.target.value as typeof filterLocation)}
            >
              <option value="all">{t('propertiesAllLocations')}</option>
              <option value="csl">{t('propertiesLocationCSL')}</option>
              <option value="sjd">{t('propertiesLocationSJD')}</option>
              <option value="corridor">{t('propertiesLocationCorridor')}</option>
            </select>
          </div>
          <div className="text-sm text-gray-500 whitespace-nowrap px-4">
            {t('propertiesShowingPrefix')} {filteredProperties.length} {t('propertiesShowingSuffix')}
          </div>
        </div>
      </div>

      {/* Portfolio Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {filteredProperties.map((property) => (
            <div key={property.id} className="group bg-white rounded-xl shadow-sm hover:shadow-2xl transition-all duration-300 overflow-hidden border border-gray-100 flex flex-col h-full">
              {/* Image Container */}
              <div className="relative h-64 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10 opacity-60 group-hover:opacity-40 transition-opacity" />
                <img 
                  src={property.image} 
                  alt={property.title} 
                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute top-4 left-4 z-20 bg-white/90 backdrop-blur-sm text-primary px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider shadow-sm">
                  {property.type}
                </div>
                <div className="absolute bottom-4 left-4 z-20 text-white">
                  <div className="flex items-center text-sm font-medium mb-1">
                    <MapPin className="h-4 w-4 mr-1 text-accent" />
                    {property.location}
                  </div>
                </div>
              </div>
              
              {/* Content */}
              <div className="p-6 flex-grow flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-text-main group-hover:text-primary transition-colors">
                    {property.title}
                  </h3>
                  <div className="flex flex-col items-end">
                    <span className="text-xs text-gray-400 uppercase">{t('propertiesManagedSinceLabel')}</span>
                    <span className="text-sm font-bold text-primary">{property.managedSince}</span>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-text-main">
                    <Shield className="h-4 w-4 text-accent" />
                    {t('propertiesKeyServicesLabel')}
                  </div>
                  <ul className="space-y-1">
                    {property.services.map((service, i) => (
                      <li key={i} className="flex items-center text-sm text-text-secondary">
                        <CheckCircle className="h-3 w-3 mr-2 text-green-500/70" />
                        {service}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-auto pt-4 border-t border-gray-100">
                  <div className="bg-background rounded-lg p-3">
                    <div className="flex items-start gap-2">
                      <Star className="h-4 w-4 text-accent mt-1 flex-shrink-0" />
                      <div>
                        <span className="text-xs font-bold text-text-main block mb-0.5">{t('propertiesHighlightLabel')}</span>
                        <p className="text-xs text-text-secondary italic">"{property.highlight}"</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredProperties.length === 0 && (
          <div className="text-center py-20">
            <Home className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl text-gray-500 font-medium">{t('propertiesEmptyTitle')}</h3>
            <button 
              onClick={() => setFilterLocation('all')}
              className="mt-4 text-primary font-bold hover:underline flex items-center justify-center gap-2 mx-auto"
            >
              <Clock className="h-4 w-4" />
              {t('propertiesViewAll')}
            </button>
          </div>
        )}
      </div>

      {/* CTA Section */}
      <div className="bg-secondary py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-text-main mb-6">{t('propertiesCtaTitle')}</h2>
          <p className="text-lg text-text-secondary mb-8">
            {t('propertiesCtaSubtitle')}
          </p>
          <a href="/contacto" className="inline-block bg-primary text-white font-bold py-3 px-8 rounded-md hover:bg-opacity-90 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-1">
            {t('propertiesCtaButton')}
          </a>
        </div>
      </div>
    </div>
  );
}
