import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuditLog } from '../../hooks/useAuditLog';
import { Save, RefreshCw } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';

const SETTING_KEYS = ['local_ai_api_key', 'local_ai_model', 'local_ai_endpoint'] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

type SettingsState = {
  local_ai_api_key: string;
  local_ai_model: string;
  local_ai_endpoint: string;
};

const getStringValue = (v: unknown) => {
  if (typeof v === 'string') return v;
  if (v === null || v === undefined) return '';
  return String(v);
};

const getErrorMessage = (e: any) => {
  if (!e) return 'Error desconocido';
  if (typeof e === 'string') return e;
  return String(e?.message || e?.error_description || e?.details || e);
};

const isPermissionError = (e: any) => {
  const code = String(e?.code || '').trim();
  const msg = getErrorMessage(e).toLowerCase();
  return (
    code === '42501' ||
    msg.includes('permission denied') ||
    msg.includes('row level security') ||
    msg.includes('row-level security') ||
    msg.includes('rls')
  );
};

export function LocalPdfReportSettings() {
  const { t } = useSettings();
  const { logAction } = useAuditLog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [values, setValues] = useState<SettingsState>({
    local_ai_api_key: '',
    local_ai_model: '',
    local_ai_endpoint: 'http://localhost:11434',
  });

  const missingRequired = useMemo(() => {
    const missing: string[] = [];
    if (!values.local_ai_api_key.trim()) missing.push('API key');
    if (!values.local_ai_model.trim()) missing.push('Modelo');
    if (!values.local_ai_endpoint.trim()) missing.push('Endpoint');
    return missing;
  }, [values.local_ai_api_key, values.local_ai_endpoint, values.local_ai_model]);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('app_settings')
        .select('key,value')
        .in('key', SETTING_KEYS as unknown as string[]);
      if (error) throw error;

      const next: SettingsState = { ...values };
      for (const row of data || []) {
        const key = String((row as any).key || '') as SettingKey;
        if (!SETTING_KEYS.includes(key)) continue;
        (next as any)[key] = getStringValue((row as any).value);
      }
      setValues(next);
    } catch (e) {
      console.error('Error fetching local PDF report settings:', e);
      alert(
        isPermissionError(e)
          ? 'No tienes permisos para ver esta configuración (admin/super_admin).'
          : `No se pudo cargar la configuración de IA local.\n\nDetalle: ${getErrorMessage(e)}`
      );
    } finally {
      setLoading(false);
    }
  };

  const fetchModels = async () => {
    const endpoint = values.local_ai_endpoint.trim().replace(/\/+$/, '');
    if (!endpoint) return;
    try {
      const res = await fetch(`${endpoint}/api/tags`, {
        method: 'GET',
        headers: values.local_ai_api_key ? { Authorization: `Bearer ${values.local_ai_api_key}` } : {},
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as any;
      const list = Array.isArray(json?.models) ? json.models : [];
      const names = list.map((m: any) => String(m?.name || '')).filter(Boolean);
      setModels((Array.from(new Set(names)) as string[]).sort());
    } catch (e) {
      console.error('Error fetching local AI models:', e);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    fetchModels();
  }, [values.local_ai_endpoint]);

  const updateSetting = async (key: SettingKey, rawValue: string) => {
    const user = (await supabase.auth.getUser()).data.user;
    const { error } = await supabase
      .from('app_settings')
      .update({ value: rawValue, updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq('key', key);
    if (error) throw error;
  };

  const onSave = async () => {
    if (missingRequired.length) {
      alert(`Faltan campos obligatorios: ${missingRequired.join(', ')}`);
      return;
    }
    try {
      setSaving(true);
      await Promise.all([
        updateSetting('local_ai_api_key', values.local_ai_api_key.trim()),
        updateSetting('local_ai_model', values.local_ai_model.trim()),
        updateSetting('local_ai_endpoint', values.local_ai_endpoint.trim()),
      ]);
      await logAction('update_local_pdf_report_settings', 'app_settings', {
        keys: SETTING_KEYS,
        local_ai_model: values.local_ai_model.trim(),
        local_ai_endpoint: values.local_ai_endpoint.trim(),
      });
      alert(t('settingSaved'));
    } catch (e) {
      console.error('Error saving local PDF report settings:', e);
      alert(
        isPermissionError(e)
          ? 'No tienes permisos para guardar esta configuración (admin/super_admin).'
          : `${t('settingSaveError')}\n\nDetalle: ${getErrorMessage(e)}`
      );
    } finally {
      setSaving(false);
    }
  };

  const onTestConnection = async () => {
    if (!values.local_ai_endpoint.trim()) {
      alert('Endpoint requerido');
      return;
    }
    try {
      setTesting(true);
      const endpoint = values.local_ai_endpoint.trim().replace(/\/+$/, '');
      const res = await fetch(`${endpoint}/api/tags`, {
        method: 'GET',
        headers: values.local_ai_api_key ? { Authorization: `Bearer ${values.local_ai_api_key}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchModels();
      alert('Conexión OK');
      await logAction('test_local_ai_connection', 'app_settings', { endpoint });
    } catch (e) {
      console.error('Error testing local AI connection:', e);
      const msg = getErrorMessage(e);
      alert(`No se pudo conectar al proveedor de IA.\n\nDetalle: ${msg}`);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="bg-white shadow rounded-lg p-6">{t('loadingSettings')}</div>;
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Reportes PDF (local)</h2>
          <p className="mt-1 text-sm text-gray-500">
            Configuración obligatoria para generar reportes PDF localmente con IA y plantillas.
          </p>
        </div>
        <button
          onClick={fetchSettings}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          disabled={saving || testing}
        >
          <RefreshCw size={18} />
          {t('refresh')}
        </button>
      </div>

      {missingRequired.length > 0 && (
        <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Campos obligatorios pendientes: {missingRequired.join(', ')}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Endpoint</label>
          <input
            type="text"
            value={values.local_ai_endpoint}
            onChange={(e) => setValues((prev) => ({ ...prev, local_ai_endpoint: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="http://localhost:11434"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">API key</label>
          <input
            type="password"
            value={values.local_ai_api_key}
            onChange={(e) => setValues((prev) => ({ ...prev, local_ai_api_key: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="••••••••••••"
            autoComplete="off"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700">Modelo</label>
          <input
            list="local-ai-models"
            type="text"
            value={values.local_ai_model}
            onChange={(e) => setValues((prev) => ({ ...prev, local_ai_model: e.target.value }))}
            className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="llama3.1"
          />
          <datalist id="local-ai-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <div className="mt-1 text-xs text-gray-500">
            {models.length ? `Modelos detectados: ${models.slice(0, 6).join(', ')}${models.length > 6 ? '…' : ''}` : 'Sin lista de modelos detectada.'}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          onClick={onTestConnection}
          disabled={testing || saving}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {testing ? 'Probando…' : 'Probar conexión'}
        </button>
        <button
          onClick={onSave}
          disabled={saving || testing}
          className="inline-flex items-center gap-2 rounded-md border border-transparent bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <Save size={16} />
          {saving ? 'Guardando…' : t('save')}
        </button>
      </div>
    </div>
  );
}
