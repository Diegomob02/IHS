import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKeyFromEnv = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");

    const supabaseAnonKey = req.headers.get("apikey") ?? supabaseAnonKeyFromEnv;
    if (!supabaseAnonKey) throw new Error("Missing Supabase anon key");

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") ?? "",
        },
      },
    });

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return json({ ok: false, message: "User not authenticated", testedAt: new Date().toISOString() }, 401);
    }

    const { data: profile } = await supabaseClient
      .from("users")
      .select("role")
      .eq("email", user.email)
      .single();

    if (!profile || profile.role !== "super_admin") {
      return json({ ok: false, message: "Forbidden", testedAt: new Date().toISOString() }, 403);
    }

    const body = await req.json();
    const baseUrl = String(body?.baseUrl || "").trim();
    const apiKey = String(body?.apiKey || "").trim();
    const webhookUrl = String(body?.webhookUrl || "").trim();

    if (!baseUrl) {
      return json({ ok: false, message: "Missing baseUrl", testedAt: new Date().toISOString() }, 400);
    }

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["X-N8N-API-KEY"] = apiKey;
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const targets = [
      normalizeUrl(baseUrl, "/healthz"),
      normalizeUrl(baseUrl, "/api/v1/healthz"),
      normalizeUrl(baseUrl, "/health"),
    ];

    let lastError: unknown = null;
    for (const url of targets) {
      try {
        const res = await fetch(url, { method: "GET", headers });
        const text = await res.text();
        if (res.ok) {
          return json(
            {
              ok: true,
              message: "n8n connection OK",
              details: { url, status: res.status, body: safeJson(text) },
              testedAt: new Date().toISOString(),
            },
            200
          );
        }
        lastError = { url, status: res.status, body: safeJson(text) };
      } catch (e) {
        lastError = { url, error: e instanceof Error ? e.message : String(e) };
      }
    }

    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ping", timestamp: new Date().toISOString() }),
        });
        const text = await res.text();
        if (res.ok) {
          return json(
            {
              ok: true,
              message: "n8n webhook OK",
              details: { url: webhookUrl, status: res.status, body: safeJson(text) },
              testedAt: new Date().toISOString(),
            },
            200
          );
        }
        lastError = { url: webhookUrl, status: res.status, body: safeJson(text) };
      } catch (e) {
        lastError = { url: webhookUrl, error: e instanceof Error ? e.message : String(e) };
      }
    }

    return json(
      {
        ok: false,
        message: "No se pudo verificar n8n",
        details: lastError,
        testedAt: new Date().toISOString(),
      },
      200
    );
  } catch (e) {
    return json(
      {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        testedAt: new Date().toISOString(),
      },
      500
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function normalizeUrl(baseUrl: string, path: string) {
  const b = baseUrl.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

