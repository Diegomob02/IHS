import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const openaiApiKey = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
const openaiTtsModel = (Deno.env.get("OPENAI_TTS_MODEL") ?? "tts-1").trim();
const openaiTtsVoice = (Deno.env.get("OPENAI_TTS_VOICE") ?? "alloy").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  text?: unknown;
  language?: unknown;
  voice?: unknown;
  speed?: unknown;
};

const normalizeBearer = (h: string) => {
  const s = (h ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("bearer ")) return s;
  return `Bearer ${s}`;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return json({ ok: false, message: "Missing Supabase env" }, 500);

    const authHeader = normalizeBearer(req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await supabaseAuth.auth.getUser();
    const authUser = userData.user;
    if (!authUser?.id) return json({ ok: false, message: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await supabaseAdmin.from("users").select("id, role").eq("id", authUser.id).single();
    const role = String(profile?.role || "");
    if (!role || !["admin", "super_admin"].includes(role)) return json({ ok: false, message: "Forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as Payload;
    const text = String(body?.text ?? "").trim();
    const language = normalizeLanguage(body?.language);
    const voice = String(body?.voice ?? openaiTtsVoice).trim() || openaiTtsVoice;
    const speed = clampNumber(body?.speed, 0.25, 4.0) ?? 1.0;

    if (!text) return json({ ok: false, message: "Missing text" }, 400);
    if (text.length > 15000) return json({ ok: false, message: "Text too long" }, 400);

    const provider = "openai";
    const cacheKey = await sha256Hex(`${provider}|${openaiTtsModel}|${voice}|${language}|${speed}|${text}`);
    const bucket = "report-audio";
    const path = `${cacheKey}.mp3`;

    const { data: cached } = await supabaseAdmin
      .from("report_audio_cache")
      .select("id, bucket, path")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (cached?.id && cached.bucket && cached.path) {
      await supabaseAdmin.from("report_audio_cache").update({ last_access_at: new Date().toISOString() }).eq("id", cached.id);
      const signed = await supabaseAdmin.storage.from(String(cached.bucket)).createSignedUrl(String(cached.path), 60 * 60);
      return json({ ok: true, cacheKey, signedUrl: signed?.data?.signedUrl || null, cached: true }, 200);
    }

    if (!openaiApiKey) return json({ ok: false, message: "Missing OPENAI_API_KEY" }, 500);

    const audioBytes = await openAiTextToSpeech({
      apiKey: openaiApiKey,
      model: openaiTtsModel,
      voice,
      input: text,
      speed,
    });

    const uploadRes = await supabaseAdmin.storage.from(bucket).upload(path, audioBytes, {
      upsert: true,
      contentType: "audio/mpeg",
    });
    if (uploadRes.error) throw uploadRes.error;

    await supabaseAdmin.from("report_audio_cache").insert({
      cache_key: cacheKey,
      provider,
      voice,
      language,
      speed,
      bucket,
      path,
      bytes: audioBytes.byteLength,
      created_by: authUser.id,
      last_access_at: new Date().toISOString(),
    });

    const signed = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 60 * 60);
    return json(
      { ok: true, cacheKey, signedUrl: signed?.data?.signedUrl || null, cached: false, bytes: audioBytes.byteLength },
      200,
    );
  } catch (e: any) {
    return json({ ok: false, message: String(e?.message || e || "Unknown error") }, 500);
  }
});

async function openAiTextToSpeech(input: { apiKey: string; model: string; voice: string; input: string; speed: number }) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      voice: input.voice,
      input: input.input,
      speed: input.speed,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`TTS provider error (${res.status}): ${safeText(t)}`);
  }
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function clampNumber(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function safeText(input: string) {
  const s = String(input ?? "");
  return s.length > 500 ? `${s.slice(0, 500)}…` : s;
}

function normalizeLanguage(value: unknown) {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return "es";
  if (s.length > 20) return "es";
  return s;
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
