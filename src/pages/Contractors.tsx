import { useState } from 'react';
import { AlertCircle, Building2, Check, Mail, Phone } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { supabase } from '../lib/supabase';

type ContractorFormErrors = Partial<Record<'companyName' | 'phone' | 'whatsappPhone' | 'email' | 'workTypes' | 'whatsappVerify', string>>;

export default function Contractors() {
  const { t } = useSettings();
  const [formData, setFormData] = useState({
    phone: '',
    whatsappPhone: '',
    email: '',
    companyName: '',
    workTypes: [] as string[],
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ContractorFormErrors>({});
  const [whatsappVerified, setWhatsappVerified] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'whatsappPhone') setWhatsappVerified(false);
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const toggleWorkType = (id: string) => {
    setFormData((prev) => {
      const next = prev.workTypes.includes(id) ? prev.workTypes.filter((x) => x !== id) : [...prev.workTypes, id];
      return { ...prev, workTypes: next };
    });
  };

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

  const validate = () => {
    const nextErrors: ContractorFormErrors = {};
    if (!isValidCompanyName(formData.companyName)) nextErrors.companyName = t('contractorValidationCompany');
    if (!isValidPhone(formData.phone)) nextErrors.phone = t('contractorValidationPhone');
    if (!isValidPhone(formData.whatsappPhone)) nextErrors.whatsappPhone = t('contractorValidationWhatsapp');
    if (!isValidEmail(formData.email)) nextErrors.email = t('contractorValidationEmail');
    if (!formData.workTypes.length) nextErrors.workTypes = t('contractorValidationWorkTypes');
    if (!whatsappVerified) nextErrors.whatsappVerify = t('contractorValidationWhatsappVerify');
    return nextErrors;
  };

  const handleVerifyWhatsapp = () => {
    const digits = formData.whatsappPhone.replace(/\D/g, '');
    if (!digits) {
      setFieldErrors((prev) => ({ ...prev, whatsappPhone: t('contractorValidationWhatsapp') }));
      return;
    }
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(t('contractorWhatsappVerifyPrefill'))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    setWhatsappVerified(true);
    setFieldErrors((prev) => ({ ...prev, whatsappVerify: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === 'submitting') return;
    setStatus('submitting');
    setErrorMessage('');
    const nextErrors = validate();
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setStatus('idle');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('contractor-apply', {
        body: {
          phone: formData.phone,
          whatsappPhone: formData.whatsappPhone,
          email: formData.email,
          companyName: formData.companyName,
          workTypes: formData.workTypes,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.message || t('contractorUnable'));

      setStatus('success');
      setFormData({
        phone: '',
        whatsappPhone: '',
        email: '',
        companyName: '',
        workTypes: [],
      });
      setWhatsappVerified(false);
      setFieldErrors({});
    } catch (error: any) {
      console.error('Error submitting application:', error);
      setStatus('error');
      setErrorMessage(`${t('contractorErrorPrefix')}${error?.message || t('unknownError')}`);
    }
  };

  return (
    <div className="bg-background min-h-screen">
      <div className="bg-primary py-20 text-center text-white">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">{t('contractorTitle')}</h1>
        <p className="text-xl max-w-2xl mx-auto px-4 text-white/80">{t('contractorSubtitle')}</p>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-white p-8 rounded-2xl shadow-lg border border-border">
          {status === 'success' ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="text-green-600" size={32} />
              </div>
              <h2 className="text-2xl font-bold text-primary mb-4">{t('contractorSuccess')}</h2>
              <button
                onClick={() => setStatus('idle')}
                className="inline-flex items-center px-6 py-3 rounded-md text-primary bg-white border border-border hover:bg-muted transition-colors"
              >
                {t('contractorBackToForm')}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              {status === 'error' && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="ml-3">
                      <p className="text-sm text-red-700">{errorMessage}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                <h3 className="text-lg font-medium text-primary border-b pb-2 flex items-center gap-2">
                  <Building2 size={20} className="text-accent" />
                  {t('contractorMainDataTitle')}
                </h3>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label htmlFor="companyName" className="block text-sm font-medium text-text-main">
                        {t('contractorCompanyNameLabel')} *
                      </label>
                      <div className="mt-1 relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Building2 size={16} className="text-text-secondary" />
                        </div>
                        <input
                          type="text"
                          name="companyName"
                          id="companyName"
                          required
                          className="focus:ring-primary focus:border-primary block w-full pl-10 sm:text-sm border-border rounded-md py-3 bg-white text-text-main placeholder:text-text-secondary/70"
                          placeholder={t('contractorCompanyNamePlaceholder')}
                          value={formData.companyName}
                          onChange={handleInputChange}
                        />
                      </div>
                      {fieldErrors.companyName ? <p className="mt-2 text-sm text-red-600">{fieldErrors.companyName}</p> : null}
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-text-main">
                        {t('contactPhoneInputLabel')} *
                      </label>
                      <div className="mt-1 relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Phone size={16} className="text-text-secondary" />
                        </div>
                        <input
                          type="tel"
                          name="phone"
                          id="phone"
                          required
                          className="focus:ring-primary focus:border-primary block w-full pl-10 sm:text-sm border-border rounded-md py-3 bg-white text-text-main placeholder:text-text-secondary/70"
                          placeholder="+52 (624) ..."
                          value={formData.phone}
                          onChange={handleInputChange}
                        />
                      </div>
                      {fieldErrors.phone ? <p className="mt-2 text-sm text-red-600">{fieldErrors.phone}</p> : null}
                    </div>

                    <div>
                      <label htmlFor="whatsappPhone" className="block text-sm font-medium text-text-main">
                        {t('contractorWhatsappLabel')} *
                      </label>
                      <div className="mt-1 relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Phone size={16} className="text-text-secondary" />
                        </div>
                        <input
                          type="tel"
                          name="whatsappPhone"
                          id="whatsappPhone"
                          required
                          className="focus:ring-primary focus:border-primary block w-full pl-10 sm:text-sm border-border rounded-md py-3 bg-white text-text-main placeholder:text-text-secondary/70"
                          placeholder="+52 (624) ..."
                          value={formData.whatsappPhone}
                          onChange={handleInputChange}
                        />
                      </div>
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
                      {fieldErrors.whatsappPhone ? <p className="mt-2 text-sm text-red-600">{fieldErrors.whatsappPhone}</p> : null}
                      {fieldErrors.whatsappVerify ? <p className="mt-2 text-sm text-red-600">{fieldErrors.whatsappVerify}</p> : null}
                    </div>

                    <div className="md:col-span-2">
                      <label htmlFor="email" className="block text-sm font-medium text-text-main">
                        {t('evaluationEmailLabel')} *
                      </label>
                      <div className="mt-1 relative rounded-md shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <Mail size={16} className="text-text-secondary" />
                        </div>
                        <input
                          type="email"
                          name="email"
                          id="email"
                          required
                          className="focus:ring-primary focus:border-primary block w-full pl-10 sm:text-sm border-border rounded-md py-3 bg-white text-text-main placeholder:text-text-secondary/70"
                          placeholder={t('contactEmailPlaceholder')}
                          value={formData.email}
                          onChange={handleInputChange}
                        />
                      </div>
                      {fieldErrors.email ? <p className="mt-2 text-sm text-red-600">{fieldErrors.email}</p> : null}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="text-sm font-medium text-text-main">{t('contractorWorkTypesLabel')} *</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {workTypeOptions.map((opt) => (
                      <label
                        key={opt.id}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/30 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={formData.workTypes.includes(opt.id)}
                          onChange={() => toggleWorkType(opt.id)}
                          className="h-4 w-4 text-primary border-border focus:ring-primary"
                        />
                        <span className="text-sm text-text-main">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  {fieldErrors.workTypes ? <p className="text-sm text-red-600">{fieldErrors.workTypes}</p> : null}
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="w-full bg-primary text-white font-bold py-3 rounded-md hover:bg-opacity-90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === 'submitting' ? t('contractorSubmitting') : t('contractorSubmit')}
                  </button>
                </div>
              </form>
            )}
        </div>
      </div>
    </div>
  );
}
