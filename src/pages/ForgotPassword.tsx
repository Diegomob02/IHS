import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSettings } from '../context/SettingsContext';
import { Lock, ArrowLeft, Mail, Loader2 } from 'lucide-react';
import { buildPublicUrl } from '../utils/env';

export default function ForgotPassword() {
  const { t } = useSettings();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError(t('forgotPasswordMissingEmail'));
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: buildPublicUrl('/auth?reset=true'),
      });
      
      if (error) throw error;
      
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || t('forgotPasswordGenericError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900">{t('forgotPasswordTitle')}</h2>
          <p className="mt-2 text-sm text-gray-600">
            {t('forgotPasswordSubtitle')}
          </p>
        </div>

        {success ? (
          <div className="bg-green-50 text-green-700 p-4 rounded-lg text-center animate-in fade-in">
            <h3 className="font-bold text-lg mb-2">{t('forgotPasswordSentTitle')}</h3>
            <p className="text-sm">
              {t('forgotPasswordSentBodyStart')} <strong>{email}</strong> {t('forgotPasswordSentBodyEnd')}
            </p>
            <div className="mt-6">
              <Link to="/auth" className="text-primary hover:text-primary/80 font-medium flex items-center justify-center gap-2">
                <ArrowLeft size={16} />
                {t('forgotPasswordBackToLogin')}
              </Link>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handlePasswordReset}>
            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm text-center">
                {error}
              </div>
            )}
            
            <div className="rounded-md shadow-sm -space-y-px">
              <div className="relative">
                <Mail className="absolute top-3 left-3 h-5 w-5 text-gray-400" />
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none rounded-md relative block w-full px-10 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary focus:border-primary focus:z-10 sm:text-sm"
                  placeholder={t('emailPlaceholder')}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:bg-opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" />
                    {t('forgotPasswordSending')}
                  </>
                ) : (
                  t('forgotPasswordSendInstructions')
                )}
              </button>
            </div>

            <div className="flex items-center justify-center">
              <Link to="/auth" className="font-medium text-gray-600 hover:text-gray-900 flex items-center gap-2 text-sm">
                <ArrowLeft size={16} />
                {t('forgotPasswordBackToLogin')}
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
