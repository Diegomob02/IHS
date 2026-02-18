import { useState } from 'react';
import { TrendingUp, ShieldCheck, DollarSign, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';

export default function Evaluation() {
  const { t } = useSettings();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    propertyType: 'villa',
    bedrooms: '3',
    additionalInfo: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const propertyTypeLabel =
        formData.propertyType === 'villa'
          ? t('evaluationPropertyTypeVilla')
          : formData.propertyType === 'condo'
            ? t('evaluationPropertyTypeCondo')
            : formData.propertyType === 'house'
              ? t('evaluationPropertyTypeHouse')
              : t('evaluationPropertyTypeLand');

      const { data, error } = await supabase.functions.invoke('lead-submit', {
        body: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          message: `${t('evaluationLeadAddress')}${formData.address}\n${t('evaluationLeadType')}${propertyTypeLabel}\n${t('evaluationLeadBedrooms')}${formData.bedrooms}\n${t('evaluationLeadInfo')}${formData.additionalInfo}`,
          source: 'evaluation'
        }
      });
      
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || t('unknownError'));

      alert(t('evaluationSuccess'));
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        propertyType: 'villa',
        bedrooms: '3',
        additionalInfo: ''
      });
    } catch (error: any) {
      console.error(error);
      alert(t('evaluationErrorPrefix') + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="bg-background min-h-screen">
      {/* Hero */}
      <div className="bg-primary text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            {t('evaluationHeroTitle')}
          </h1>
          <p className="text-xl text-gray-200 max-w-3xl mx-auto mb-8">
            {t('evaluationHeroSubtitle')}
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Benefits Side */}
          <div className="space-y-10">
            <div className="prose prose-lg">
              <h2 className="text-3xl font-bold text-primary mb-6">{t('evaluationWhyTitle')}</h2>
              <p className="text-text-secondary">
                {t('evaluationWhyBody')}
              </p>
            </div>

            <div className="grid gap-8">
              <div className="flex gap-4">
                <div className="bg-white p-3 rounded-full shadow-sm h-fit">
                  <ShieldCheck className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary mb-2">{t('evaluationBenefit1Title')}</h3>
                  <p className="text-text-secondary">
                    {t('evaluationBenefit1Desc')}
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="bg-white p-3 rounded-full shadow-sm h-fit">
                  <DollarSign className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary mb-2">{t('evaluationBenefit2Title')}</h3>
                  <p className="text-text-secondary">
                    {t('evaluationBenefit2Desc')}
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="bg-white p-3 rounded-full shadow-sm h-fit">
                  <Check className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-primary mb-2">{t('evaluationBenefit3Title')}</h3>
                  <p className="text-text-secondary">
                    {t('evaluationBenefit3Desc')}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
              <h3 className="font-bold text-lg mb-4">{t('evaluationIncludesTitle')}</h3>
              <ul className="space-y-2">
                {[
                  t('evaluationIncludes1'),
                  t('evaluationIncludes2'),
                  t('evaluationIncludes3'),
                  t('evaluationIncludes4')
                ].map((item, i) => (
                  <li key={i} className="flex items-center text-text-secondary">
                    <Check className="h-5 w-5 text-green-500 mr-2" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Form Side */}
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 h-fit sticky top-24">
            <h2 className="text-2xl font-bold text-primary mb-2">{t('evaluationFormTitle')}</h2>
            <p className="text-text-secondary mb-6 text-sm">{t('evaluationFormSubtitle')}</p>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('evaluationNameLabel')}</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('evaluationEmailLabel')}</label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('evaluationPhoneLabel')}</label>
                  <input
                    type="tel"
                    name="phone"
                    required
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('evaluationAddressLabel')}</label>
                <input
                  type="text"
                  name="address"
                  required
                  value={formData.address}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary"
                  placeholder={t('evaluationAddressPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('evaluationPropertyTypeLabel')}</label>
                  <select
                    name="propertyType"
                    value={formData.propertyType}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary bg-white"
                  >
                    <option value="villa">{t('evaluationPropertyTypeVilla')}</option>
                    <option value="condo">{t('evaluationPropertyTypeCondo')}</option>
                    <option value="house">{t('evaluationPropertyTypeHouse')}</option>
                    <option value="land">{t('evaluationPropertyTypeLand')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('evaluationBedroomsLabel')}</label>
                  <select
                    name="bedrooms"
                    value={formData.bedrooms}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary bg-white"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5+">5+</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('evaluationAdditionalInfoLabel')}</label>
                <textarea
                  name="additionalInfo"
                  rows={3}
                  value={formData.additionalInfo}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary"
                  placeholder={t('evaluationAdditionalInfoPlaceholder')}
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-accent text-primary font-bold py-3 rounded-md hover:bg-opacity-90 transition-colors shadow-md mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? t('evaluationSubmitting') : t('evaluationSubmit')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
