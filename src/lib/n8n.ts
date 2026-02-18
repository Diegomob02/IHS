import { supabase } from './supabase';

export const N8N_WEBHOOK_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || '';

let cachedPublicConfig: Promise<{ enabled: boolean; webhookUrl: string } | null> | null = null;

async function getPublicN8nConfig() {
  if (!cachedPublicConfig) {
    cachedPublicConfig = (async () => {
      try {
        const { data, error } = await supabase.rpc('get_public_integrations');
        if (error || !data) return null;
        const n8n = (data as any).n8n;
        return {
          enabled: Boolean(n8n?.enabled),
          webhookUrl: String(n8n?.webhookUrl || ''),
        };
      } catch {
        return null;
      }
    })();
  }
  return cachedPublicConfig;
}

export async function submitToN8n(data: any, type: 'contact' | 'evaluation' | 'maintenance') {
  const publicCfg = await getPublicN8nConfig();
  const urlFromDb = publicCfg?.enabled ? publicCfg.webhookUrl : '';
  const webhook = urlFromDb || N8N_WEBHOOK_URL;
  if (!webhook) {
    console.warn('N8N Webhook URL not configured');
    return { success: true, message: 'Simulated success (no webhook configured)' };
  }

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        data,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to submit to n8n');
    }

    return { success: true };
  } catch (error) {
    console.error('Error submitting to n8n:', error);
    return { success: false, error };
  }
}
