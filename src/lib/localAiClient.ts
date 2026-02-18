import { supabase } from './supabase';

export type LocalAiConfig = {
  endpoint: string;
  apiKey: string;
  model: string;
};

export type LocalAiGenerateInput = {
  prompt: string;
};

export type LocalAiGenerateOutput = {
  text: string;
  raw: unknown;
};

let cachedConfig: { value: LocalAiConfig; fetchedAt: number } | null = null;

const normalizeEndpoint = (s: string) => s.trim().replace(/\/+$/, '');

export async function getLocalAiConfig(force = false): Promise<LocalAiConfig> {
  const now = Date.now();
  if (!force && cachedConfig && now - cachedConfig.fetchedAt < 15_000) return cachedConfig.value;

  const { data, error } = await supabase
    .from('app_settings')
    .select('key,value')
    .in('key', ['local_ai_api_key', 'local_ai_model', 'local_ai_endpoint']);
  if (error) throw error;

  const byKey = new Map<string, any>();
  for (const row of data || []) byKey.set(String((row as any).key || ''), (row as any).value);

  const apiKey = String(byKey.get('local_ai_api_key') ?? '').trim();
  const model = String(byKey.get('local_ai_model') ?? '').trim();
  const endpointRaw = String(byKey.get('local_ai_endpoint') ?? '').trim();
  const endpoint = normalizeEndpoint(endpointRaw || 'http://localhost:11434');

  const config = { endpoint, apiKey, model };
  cachedConfig = { value: config, fetchedAt: now };
  return config;
}

export async function localAiGenerate(input: LocalAiGenerateInput): Promise<LocalAiGenerateOutput> {
  const cfg = await getLocalAiConfig();
  if (!cfg.apiKey) throw new Error('Missing local_ai_api_key');
  if (!cfg.model) throw new Error('Missing local_ai_model');
  if (!cfg.endpoint) throw new Error('Missing local_ai_endpoint');

  const authHeaders = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};

  const ollamaUrl = `${cfg.endpoint}/api/generate`;
  const ollamaRes = await fetch(ollamaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ model: cfg.model, prompt: input.prompt, stream: false }),
  }).catch(() => null);

  if (ollamaRes && ollamaRes.ok) {
    const json = (await ollamaRes.json().catch(() => null)) as any;
    const text = String(json?.response ?? '').trim();
    if (!text) throw new Error('Empty response from local AI');
    return { text, raw: json };
  }

  const oaiUrl = `${cfg.endpoint}/v1/chat/completions`;
  const oaiRes = await fetch(oaiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: input.prompt }],
      temperature: 0.2,
    }),
  });
  if (!oaiRes.ok) throw new Error(`Local AI HTTP ${oaiRes.status}`);
  const oaiJson = (await oaiRes.json().catch(() => null)) as any;
  const text = String(oaiJson?.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new Error('Empty response from local AI');
  return { text, raw: oaiJson };
}

export async function localAiListModels(): Promise<string[]> {
  const cfg = await getLocalAiConfig();
  const endpoint = normalizeEndpoint(cfg.endpoint);
  if (!endpoint) return [];
  const authHeaders = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};

  const res = await fetch(`${endpoint}/api/tags`, { method: 'GET', headers: authHeaders }).catch(() => null);
  if (res && res.ok) {
    const json = (await res.json().catch(() => null)) as any;
    const list = Array.isArray(json?.models) ? json.models : [];
    const names = list.map((m: any) => String(m?.name || '')).filter(Boolean);
    return (Array.from(new Set(names)) as string[]).sort();
  }
  return [];
}
