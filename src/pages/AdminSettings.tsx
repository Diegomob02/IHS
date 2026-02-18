import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { AppSetting } from '../types';
import { useRealtime } from '../hooks/useRealtime';
import { useAuditLog } from '../hooks/useAuditLog';
import { Save, RefreshCw } from 'lucide-react';
import { CompanyBrandingSettings } from '../components/superadmin/CompanyBrandingSettings';
import { IntegrationsSettings } from '../components/superadmin/IntegrationsSettings';
import { InfoTooltip } from '../components/common/InfoTooltip';
import { useSettings } from '../context/SettingsContext';
import { LocalPdfReportSettings } from '../components/admin/LocalPdfReportSettings';

export default function AdminSettings() {
  const { t } = useSettings();
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<string, any>>({});
  const { logAction } = useAuditLog();
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .order('category', { ascending: true });

      if (error) throw error;
      setSettings(data || []);
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: auth } = await supabase.auth.getUser();
      const email = auth.user?.email;
      if (!email) return;
      const { data } = await supabase.from('users').select('*').eq('email', email).single();
      setCurrentUserProfile(data || null);
    };
    fetchProfile();
  }, []);

  useRealtime<AppSetting>('app_settings', undefined, (payload) => {
    if (payload.eventType === 'INSERT') {
      setSettings((prev) => [...prev, payload.new as AppSetting]);
    } else if (payload.eventType === 'UPDATE') {
      setSettings((prev) => prev.map((s) => (s.key === payload.new.key ? (payload.new as AppSetting) : s)));
    } else if (payload.eventType === 'DELETE') {
      setSettings((prev) => prev.filter((s) => s.key !== payload.old.key));
    }
  });

  const handleSave = async (key: string) => {
    try {
      const rawValue = editing[key];
      if (rawValue === undefined) return;

      let newValue: any = rawValue;
      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        const looksJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'));
        if (looksJson) {
          try {
            newValue = JSON.parse(trimmed);
          } catch (e: any) {
            alert(`${t('settingSaveError')}: JSON inválido`);
            return;
          }
        }
      }

      const user = (await supabase.auth.getUser()).data.user;

      const { error } = await supabase
        .from('app_settings')
        .update({ 
            value: newValue,
            updated_by: user?.id,
            updated_at: new Date().toISOString()
        })
        .eq('key', key);

      if (error) throw error;

      // Clear edit state for this key
      const newEditing = { ...editing };
      delete newEditing[key];
      setEditing(newEditing);
      
      await logAction('update_setting', 'app_settings', { key, value: newValue });
      alert(t('settingSaved'));
    } catch (error) {
      console.error('Error saving setting:', error);
      alert(t('settingSaveError'));
    }
  };

  const handleChange = (key: string, value: any) => {
    setEditing((prev) => ({ ...prev, [key]: value }));
  };

  const groupedSettings = settings.reduce((acc, setting) => {
    const category = setting.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(setting);
    return acc;
  }, {} as Record<string, AppSetting[]>);

  const hiddenKeys = new Set(['local_ai_api_key', 'local_ai_model', 'local_ai_endpoint']);
  const visibleGroupedSettings = Object.entries(groupedSettings).reduce((acc, [category, categorySettings]) => {
    const filtered = categorySettings.filter((s) => !hiddenKeys.has(s.key));
    if (!filtered.length) return acc;
    acc[category] = filtered;
    return acc;
  }, {} as Record<string, AppSetting[]>);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('systemSettingsTitle')}</h1>
        <button 
          onClick={fetchSettings} 
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <RefreshCw size={18} />
          {t('refresh')}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">{t('loadingSettings')}</div>
      ) : (
        <div className="space-y-8">
          {(currentUserProfile?.role === 'admin' || currentUserProfile?.role === 'super_admin') && (
            <LocalPdfReportSettings />
          )}

          {currentUserProfile?.role === 'super_admin' && (
            <div className="space-y-8">
              <CompanyBrandingSettings profileId={currentUserProfile?.id || null} />
              <IntegrationsSettings profileId={currentUserProfile?.id || null} />
            </div>
          )}

          {Object.entries(visibleGroupedSettings).map(([category, categorySettings]) => (
            <div key={category} className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 capitalize mb-4 border-b pb-2">
                {category}
              </h2>
              <div className="space-y-6">
                {categorySettings.map((setting) => (
                  <div key={setting.key} className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700">
                        <span className="inline-flex items-center gap-1">
                          {setting.key.replace(/_/g, ' ')}
                          <InfoTooltip
                            label={setting.key}
                            help={{
                              title: setting.key,
                              purpose: setting.description || t('settingDefaultPurpose'),
                              accepted:
                                typeof setting.value === 'boolean'
                                  ? t('settingAcceptedBool')
                                  : t('settingAcceptedText'),
                              impact: t('settingImpact'),
                              restrictions: t('settingRestrictions'),
                            }}
                          />
                        </span>
                      </label>
                      <p className="mt-1 text-sm text-gray-500">{setting.description}</p>
                    </div>
                    <div className="flex-1 flex items-center gap-2">
                      {/* Simple input based on value type assumption. 
                          For a real system, we'd need type metadata in the setting or schema 
                      */}
                      {typeof setting.value === 'boolean' ? (
                        <select
                          value={editing[setting.key] !== undefined ? editing[setting.key] : setting.value}
                          onChange={(e) => handleChange(setting.key, e.target.value === 'true')}
                          className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                        >
                          <option value="true">{t('enabled')}</option>
                          <option value="false">{t('disabled')}</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={editing[setting.key] !== undefined ? editing[setting.key] : JSON.stringify(setting.value)}
                          onChange={(e) => handleChange(setting.key, e.target.value)} // Assuming text/json input
                          className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border"
                        />
                      )}
                      
                      {editing[setting.key] !== undefined && (
                        <button
                          onClick={() => handleSave(setting.key)}
                          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <Save size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          
          {settings.length === 0 && (
             <div className="text-center py-8 text-gray-500">
               {t('noSettingsAvailable')}
             </div>
          )}
        </div>
      )}
    </div>
  );
}
