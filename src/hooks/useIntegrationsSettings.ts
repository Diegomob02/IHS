import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuditLog } from './useAuditLog';
import { N8nFormState } from '../components/superadmin/N8nIntegrationCard';
import { WhatsAppFormState } from '../components/superadmin/WhatsAppIntegrationCard';

type IntegrationType = 'whatsapp' | 'n8n';

type IntegrationRow = {
  id: string;
  type: IntegrationType;
  status: 'enabled' | 'disabled';
  config_json: any;
  last_test_at: string | null;
  last_test_result: any;
};

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export function useIntegrationsSettings(profileId: string | null) {
  const { logAction } = useAuditLog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<IntegrationType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<IntegrationType, IntegrationRow | null>>({
    whatsapp: null,
    n8n: null,
  });

  const [wa, setWa] = useState<WhatsAppFormState>({
    enabled: false,
    wabaId: '',
    phoneNumberId: '',
    accessToken: '',
    verifyToken: '',
    templatesJson: '{\n  "welcome": "Hola {{name}}"\n}',
    automationAutoReply: false,
  });

  const [n8n, setN8n] = useState<N8nFormState>({
    enabled: false,
    baseUrl: '',
    apiKey: '',
    webhookUrl: '',
    syncEnabled: false,
  });

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('integration_configs')
        .select('*')
        .in('type', ['whatsapp', 'n8n']);
      if (e) throw e;

      const waRow = (data || []).find((r: any) => r.type === 'whatsapp') || null;
      const n8nRow = (data || []).find((r: any) => r.type === 'n8n') || null;
      setRows({ whatsapp: waRow as any, n8n: n8nRow as any });

      if (waRow) {
        const cfg = (waRow as any).config_json || {};
        setWa({
          enabled: (waRow as any).status === 'enabled',
          wabaId: String(cfg.wabaId || ''),
          phoneNumberId: String(cfg.phoneNumberId || ''),
          accessToken: String(cfg.accessToken || ''),
          verifyToken: String(cfg.verifyToken || ''),
          templatesJson: JSON.stringify(cfg.templates || { welcome: 'Hola {{name}}' }, null, 2),
          automationAutoReply: Boolean(cfg.automationAutoReply || false),
        });
      }

      if (n8nRow) {
        const cfg = (n8nRow as any).config_json || {};
        setN8n({
          enabled: (n8nRow as any).status === 'enabled',
          baseUrl: String(cfg.baseUrl || ''),
          apiKey: String(cfg.apiKey || ''),
          webhookUrl: String(cfg.webhookUrl || ''),
          syncEnabled: Boolean(cfg.syncEnabled || false),
        });
      }
    } catch (err: any) {
      setError(err?.message || 'No se pudieron cargar las integraciones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const validateWhatsapp = () => {
    if (!wa.enabled) return null;
    if (!wa.wabaId.trim()) return 'WhatsApp: WABA ID es obligatorio.';
    if (!wa.phoneNumberId.trim()) return 'WhatsApp: Phone Number ID es obligatorio.';
    if (!wa.accessToken.trim()) return 'WhatsApp: Access Token es obligatorio.';
    try {
      JSON.parse(wa.templatesJson || '{}');
    } catch {
      return 'WhatsApp: Plantillas debe ser JSON válido.';
    }
    return null;
  };

  const validateN8n = () => {
    if (!n8n.enabled) return null;
    if (!n8n.baseUrl.trim() || !isValidUrl(n8n.baseUrl.trim())) return 'n8n: Base URL inválida.';
    if (n8n.webhookUrl.trim() && !isValidUrl(n8n.webhookUrl.trim())) return 'n8n: Webhook URL inválida.';
    return null;
  };

  const saveAll = async () => {
    const e = validateWhatsapp() || validateN8n();
    if (e) {
      setError(e);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const templates = JSON.parse(wa.templatesJson || '{}');
      const waPayload = {
        type: 'whatsapp' as const,
        status: wa.enabled ? 'enabled' : 'disabled',
        config_json: {
          wabaId: wa.wabaId.trim(),
          phoneNumberId: wa.phoneNumberId.trim(),
          accessToken: wa.accessToken.trim(),
          verifyToken: wa.verifyToken.trim(),
          templates,
          automationAutoReply: wa.automationAutoReply,
        },
        updated_by: profileId,
        updated_at: new Date().toISOString(),
      };

      const n8nPayload = {
        type: 'n8n' as const,
        status: n8n.enabled ? 'enabled' : 'disabled',
        config_json: {
          baseUrl: n8n.baseUrl.trim(),
          apiKey: n8n.apiKey.trim(),
          webhookUrl: n8n.webhookUrl.trim(),
          syncEnabled: n8n.syncEnabled,
        },
        updated_by: profileId,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from('integration_configs')
        .upsert([waPayload, n8nPayload], { onConflict: 'type' });
      if (upsertError) throw upsertError;

      await logAction('update_integrations', 'integration_configs', {
        whatsapp: { status: waPayload.status, config_json: { ...waPayload.config_json, accessToken: '***' } },
        n8n: { status: n8nPayload.status, config_json: { ...n8nPayload.config_json, apiKey: n8nPayload.config_json.apiKey ? '***' : '' } },
      });

      await refresh();
    } catch (err: any) {
      setError(err?.message || 'No se pudieron guardar las integraciones.');
    } finally {
      setSaving(false);
    }
  };

  const testWhatsapp = async () => {
    const e = validateWhatsapp();
    if (e) {
      setError(e);
      return;
    }

    setTesting('whatsapp');
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('integrations-whatsapp-test', {
        body: { wabaId: wa.wabaId.trim(), phoneNumberId: wa.phoneNumberId.trim(), accessToken: wa.accessToken.trim() },
      });
      if (fnError) throw fnError;

      await supabase
        .from('integration_configs')
        .upsert(
          {
            type: 'whatsapp',
            status: wa.enabled ? 'enabled' : 'disabled',
            config_json: {
              wabaId: wa.wabaId.trim(),
              phoneNumberId: wa.phoneNumberId.trim(),
              accessToken: wa.accessToken.trim(),
              verifyToken: wa.verifyToken.trim(),
              templates: JSON.parse(wa.templatesJson || '{}'),
              automationAutoReply: wa.automationAutoReply,
            },
            last_test_at: new Date().toISOString(),
            last_test_result: data,
            updated_by: profileId,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'type' }
        );

      await refresh();
    } catch (err: any) {
      setError(err?.message || 'No se pudo probar WhatsApp.');
    } finally {
      setTesting(null);
    }
  };

  const testN8n = async () => {
    const e = validateN8n();
    if (e) {
      setError(e);
      return;
    }

    setTesting('n8n');
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('integrations-n8n-test', {
        body: { baseUrl: n8n.baseUrl.trim(), apiKey: n8n.apiKey.trim(), webhookUrl: n8n.webhookUrl.trim() },
      });
      if (fnError) throw fnError;

      await supabase
        .from('integration_configs')
        .upsert(
          {
            type: 'n8n',
            status: n8n.enabled ? 'enabled' : 'disabled',
            config_json: {
              baseUrl: n8n.baseUrl.trim(),
              apiKey: n8n.apiKey.trim(),
              webhookUrl: n8n.webhookUrl.trim(),
              syncEnabled: n8n.syncEnabled,
            },
            last_test_at: new Date().toISOString(),
            last_test_result: data,
            updated_by: profileId,
            updated_at: new Date().toISOString(),
          } as any,
          { onConflict: 'type' }
        );

      await refresh();
    } catch (err: any) {
      setError(err?.message || 'No se pudo probar n8n.');
    } finally {
      setTesting(null);
    }
  };

  const waOk = typeof rows.whatsapp?.last_test_result?.ok === 'boolean' ? rows.whatsapp?.last_test_result.ok : null;
  const n8nOk = typeof rows.n8n?.last_test_result?.ok === 'boolean' ? rows.n8n?.last_test_result.ok : null;

  return {
    loading,
    saving,
    testing,
    error,
    setError,
    rows,
    wa,
    setWa,
    n8n,
    setN8n,
    waOk,
    n8nOk,
    refresh,
    saveAll,
    testWhatsapp,
    testN8n,
  };
}

