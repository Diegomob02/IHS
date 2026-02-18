import { useState } from 'react';
import { Phone, Mail, MapPin, MessageCircle, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';

type ContractorFormErrors = Partial<Record<'companyName' | 'phone' | 'whatsappPhone' | 'email' | 'workTypes' | 'whatsappVerify', string>>;

export default function Contact() {
  const { t } = useSettings();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: '',
    type: 'general'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contractorData, setContractorData] = useState({
    phone: '',
    whatsappPhone: '',
    email: '',
    companyName: '',
    workTypes: [] as string[]
  });
  const [isSubmittingContractor, setIsSubmittingContractor] = useState(false);
  const [contractorErrors, setContractorErrors] = useState<ContractorFormErrors>({});
  const [whatsappVerified, setWhatsappVerified] = useState(false);

  const workTypeOptions = [
    { id: 'general', label: t('contractorServiceGeneral') },
    { id: 'electric', label: t('contractorServiceElectric') },
    { id: 'plumbing', label: t('contractorServicePlumbing') },
    { id: 'pools', label: t('contractorServicePools') },
    { id: 'gardening', label: t('contractorServiceGardening') },
    { id: 'cleaning', label: t('contractorServiceCleaning') },
    { id: 'hvac', label: t('contractorServiceHvac') },
    { id: 'carpentry', label: t('contractorServiceCarpentry') },
    { id: 'painting', label: t('contractorServicePainting') },
    { id: 'other', label: t('contractorServiceOther') },
  ];

  const normalizePhone = (raw: string) => raw.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const isValidPhone = (raw: string) => {
    const v = normalizePhone(raw);
    const digits = v.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return false;
    return /^\+?[1-9]\d{9,14}$/.test(v.startsWith('+') ? v : `+${digits}`);
  };

  const isValidEmail = (raw: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
  const isValidCompanyName = (raw: string) => {
    const v = raw.trim();
    if (!v) return false;
    return !/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s&.'-]/.test(v);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const typeLabel =
        formData.type === 'owner'
          ? t('contactTypeOwner')
          : formData.type === 'investor'
            ? t('contactTypeInvestor')
            : formData.type === 'developer'
              ? t('contactTypeDeveloper')
              : t('contactTypeOther');

      const { data, error } = await supabase.functions.invoke('lead-submit', {
        body: {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          message: `${t('leadTypePrefix')}${typeLabel}\n${t('leadMessagePrefix')}${formData.message}`,
          source: 'contact_form'
        }
      });
      
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || t('unknownError'));

      alert(t('contactSuccess'));
      setFormData({
        name: '',
        email: '',
        phone: '',
        message: '',
        type: 'general'
      });
    } catch (error: any) {
      console.error(error);
      alert(t('contactErrorPrefix') + error.message);
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

  const handleContractorChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (e.target.name === 'whatsappPhone') setWhatsappVerified(false);
    setContractorData({
      ...contractorData,
      [e.target.name]: e.target.value
    });
  };

  const toggleWorkType = (id: string) => {
    setContractorData((prev) => {
      const next = prev.workTypes.includes(id) ? prev.workTypes.filter((x) => x !== id) : [...prev.workTypes, id];
      return { ...prev, workTypes: next };
    });
  };

  const validateContractor = () => {
    const nextErrors: ContractorFormErrors = {};
    if (!isValidCompanyName(contractorData.companyName)) nextErrors.companyName = t('contractorValidationCompany');
    if (!isValidPhone(contractorData.phone)) nextErrors.phone = t('contractorValidationPhone');
    if (!isValidPhone(contractorData.whatsappPhone)) nextErrors.whatsappPhone = t('contractorValidationWhatsapp');
    if (!isValidEmail(contractorData.email)) nextErrors.email = t('contractorValidationEmail');
    if (!contractorData.workTypes.length) nextErrors.workTypes = t('contractorValidationWorkTypes');
    if (!whatsappVerified) nextErrors.whatsappVerify = t('contractorValidationWhatsappVerify');
    return nextErrors;
  };

  const handleVerifyWhatsapp = () => {
    const digits = contractorData.whatsappPhone.replace(/\D/g, '');
    if (!digits) {
      setContractorErrors((prev) => ({ ...prev, whatsappPhone: t('contractorValidationWhatsapp') }));
      return;
    }
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(t('contractorWhatsappVerifyPrefill'))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setWhatsappVerified(true);
    setContractorErrors((prev) => ({ ...prev, whatsappVerify: undefined }));
  };

  const handleContractorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingContractor) return;
    const nextErrors = validateContractor();
    setContractorErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setIsSubmittingContractor(true);

    try {
      const { data, error } = await supabase.functions.invoke('contractor-apply', {
        body: {
          phone: contractorData.phone,
          whatsappPhone: contractorData.whatsappPhone,
          email: contractorData.email,
          companyName: contractorData.companyName,
          workTypes: contractorData.workTypes,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || t('contractorUnable'));

      alert(t('contractorSuccess'));
      setContractorData({
        phone: '',
        whatsappPhone: '',
        email: '',
        companyName: '',
        workTypes: []
      });
      setWhatsappVerified(false);
      setContractorErrors({});
    } catch (error: any) {
      console.error(error);
      alert(t('contractorErrorPrefix') + (error?.message || t('unknownError')));
    } finally {
      setIsSubmittingContractor(false);
    }
  };

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <div className="bg-primary py-20 text-center text-white">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">{t('contactTitle')}</h1>
        <p className="text-xl max-w-2xl mx-auto px-4 text-gray-200">
          {t('contactSubtitle')}
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div className="space-y-12">
            <div>
              <h2 className="text-2xl font-bold text-primary mb-6">{t('contactInfoTitle')}</h2>
              <div className="space-y-6">
                <div className="flex items-start">
                  <div className="bg-white p-3 rounded-full shadow-sm mr-4">
                    <Phone className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold text-text-main">{t('contactPhoneLabel')}</p>
                    <p className="text-text-secondary">+52 624 179 3231</p>
                    <p className="text-sm text-gray-400">{t('contactPhoneHours')}</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-white p-3 rounded-full shadow-sm mr-4">
                    <MessageCircle className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-text-main">{t('contactWhatsappLabel')}</p>
                    <a 
                      href="https://wa.me/526241793231" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-text-secondary hover:text-green-600 underline"
                    >
                      {t('contactWhatsappCta')}
                    </a>
                    <p className="text-sm text-gray-400">{t('contactWhatsappNote')}</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-white p-3 rounded-full shadow-sm mr-4">
                    <Mail className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold text-text-main">{t('contactEmailLabel')}</p>
                    <p className="text-text-secondary">info@ihscabo.com</p>
                  </div>
                </div>

                <div className="flex items-start">
                  <div className="bg-white p-3 rounded-full shadow-sm mr-4">
                    <MapPin className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold text-text-main">{t('contactOfficeLabel')}</p>
                    <p className="text-text-secondary">
                      Plaza del Mar, Local 4<br />
                      Carr. Transpeninsular Km 4.5<br />
                      Cabo San Lucas, BCS 23454
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Map Placeholder */}
            <div className="bg-gray-200 rounded-xl h-64 w-full flex items-center justify-center overflow-hidden relative">
              <img 
                src="https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=Map%20location%20pin%20Cabo%20San%20Lucas%20minimalist%20style&image_size=landscape_16_9" 
                alt={t('contactMapAlt')} 
                className="absolute inset-0 w-full h-full object-cover opacity-60"
              />
              <span className="relative z-10 bg-white px-4 py-2 rounded shadow text-sm font-medium">
                {t('contactMapSoon')}
              </span>
            </div>
          </div>

          {/* Contact Form */}
          <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
            <h2 className="text-2xl font-bold text-primary mb-6">{t('contactFormTitle')}</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">{t('contactFullNameLabel')}</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    placeholder={t('contactFullNamePlaceholder')}
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">{t('evaluationEmailLabel')}</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    placeholder={t('contactEmailPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">{t('contactPhoneInputLabel')}</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                    placeholder="+52 ..."
                  />
                </div>
                <div>
                  <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">{t('contactTypeLabel')}</label>
                  <select
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors bg-white"
                  >
                    <option value="owner">{t('contactTypeOwner')}</option>
                    <option value="investor">{t('contactTypeInvestor')}</option>
                    <option value="developer">{t('contactTypeDeveloper')}</option>
                    <option value="other">{t('contactTypeOther')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">{t('contactMessageLabel')}</label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  required
                  value={formData.message}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-primary focus:border-primary outline-none transition-colors"
                  placeholder={t('contactMessagePlaceholder')}
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-primary text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-5 w-5" />
                {isSubmitting ? t('contactSending') : t('contactSendButton')}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-16">
          <div className="bg-white p-8 rounded-2xl shadow-lg border border-border">
            <h2 className="text-2xl font-bold text-primary">{t('contractorTitle')}</h2>
            <p className="mt-2 text-sm text-text-secondary">
              {t('contractorSubtitle')}
            </p>

            <form onSubmit={handleContractorSubmit} className="mt-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="companyName" className="block text-sm font-medium text-text-main mb-1">{t('contractorCompanyNameLabel')}</label>
                  <input
                    type="text"
                    id="companyName"
                    name="companyName"
                    required
                    value={contractorData.companyName}
                    onChange={handleContractorChange}
                    className="w-full px-4 py-2 border border-border rounded-md focus:ring-primary focus:border-primary outline-none transition-colors bg-white text-text-main placeholder:text-text-secondary/70"
                    placeholder={t('contractorCompanyNamePlaceholder')}
                  />
                  {contractorErrors.companyName ? <p className="mt-2 text-sm text-red-600">{contractorErrors.companyName}</p> : null}
                </div>
                <div>
                  <label htmlFor="contractorEmail" className="block text-sm font-medium text-text-main mb-1">{t('evaluationEmailLabel')}</label>
                  <input
                    type="email"
                    id="contractorEmail"
                    name="email"
                    required
                    value={contractorData.email}
                    onChange={handleContractorChange}
                    className="w-full px-4 py-2 border border-border rounded-md focus:ring-primary focus:border-primary outline-none transition-colors bg-white text-text-main placeholder:text-text-secondary/70"
                    placeholder={t('contactEmailPlaceholder')}
                  />
                  {contractorErrors.email ? <p className="mt-2 text-sm text-red-600">{contractorErrors.email}</p> : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="contractorPhone" className="block text-sm font-medium text-text-main mb-1">{t('contactPhoneInputLabel')}</label>
                  <input
                    type="tel"
                    id="contractorPhone"
                    name="phone"
                    required
                    value={contractorData.phone}
                    onChange={handleContractorChange}
                    className="w-full px-4 py-2 border border-border rounded-md focus:ring-primary focus:border-primary outline-none transition-colors bg-white text-text-main placeholder:text-text-secondary/70"
                    placeholder="+52 ..."
                  />
                  {contractorErrors.phone ? <p className="mt-2 text-sm text-red-600">{contractorErrors.phone}</p> : null}
                </div>
                <div>
                  <label htmlFor="whatsappPhone" className="block text-sm font-medium text-text-main mb-1">{t('contractorWhatsappLabel')}</label>
                  <input
                    type="tel"
                    id="whatsappPhone"
                    name="whatsappPhone"
                    required
                    value={contractorData.whatsappPhone}
                    onChange={handleContractorChange}
                    className="w-full px-4 py-2 border border-border rounded-md focus:ring-primary focus:border-primary outline-none transition-colors bg-white text-text-main placeholder:text-text-secondary/70"
                    placeholder="+52 ..."
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={handleVerifyWhatsapp}
                      className="px-3 py-2 rounded-md border border-border text-sm text-text-main hover:bg-muted transition-colors"
                    >
                      {t('contractorWhatsappVerifyButton')}
                    </button>
                    <span className={`text-sm ${whatsappVerified ? 'text-green-700' : 'text-text-secondary'}`}>
                      {whatsappVerified ? t('contractorWhatsappVerified') : t('contractorWhatsappNotVerified')}
                    </span>
                  </div>
                  {contractorErrors.whatsappPhone ? <p className="mt-2 text-sm text-red-600">{contractorErrors.whatsappPhone}</p> : null}
                  {contractorErrors.whatsappVerify ? <p className="mt-2 text-sm text-red-600">{contractorErrors.whatsappVerify}</p> : null}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium text-text-main">{t('contractorWorkTypesLabel')}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {workTypeOptions.map((opt) => (
                    <label
                      key={opt.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={contractorData.workTypes.includes(opt.id)}
                        onChange={() => toggleWorkType(opt.id)}
                        className="h-4 w-4 text-primary border-border focus:ring-primary"
                      />
                      <span className="text-sm text-text-main">{opt.label}</span>
                    </label>
                  ))}
                </div>
                {contractorErrors.workTypes ? <p className="text-sm text-red-600">{contractorErrors.workTypes}</p> : null}
              </div>

              <button
                type="submit"
                disabled={isSubmittingContractor}
                className="w-full bg-primary text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-5 w-5" />
                {isSubmittingContractor ? t('contractorSubmitting') : t('contractorSubmit')}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
