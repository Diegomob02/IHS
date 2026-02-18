import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  email?: unknown;
  portal?: unknown;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
    if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, message: "Missing Supabase env" }, 500);

    const body = (await req.json().catch(() => ({}))) as Payload;
    const email = normalizeEmail(body?.email);
    const portal = normalizeText(body?.portal, 40);
    const ip = getClientIp(req);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const windowMinutes = 10;
    const maxFailedPerIp = 15;
    const maxFailedPerEmail = 8;
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    let ipFailedCount = 0;
    if (ip) {
      const { count } = await supabaseAdmin
        .from("auth_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .eq("success", false)
        .gte("created_at", since);
      ipFailedCount = count ?? 0;
    }

    let emailFailedCount = 0;
    if (email) {
      const { count } = await supabaseAdmin
        .from("auth_login_attempts")
        .select("id", { count: "exact", head: true })
        .ilike("email", email)
        .eq("success", false)
        .gte("created_at", since);
      emailFailedCount = count ?? 0;
    }

    const allowed = ipFailedCount < maxFailedPerIp && emailFailedCount < maxFailedPerEmail;
    const retryAfterSeconds = allowed ? 0 : windowMinutes * 60;

    return json(
      {
        ok: true,
        allowed,
        retryAfterSeconds,
        portal,
      },
      allowed ? 200 : 429,
    );
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEmail(value: unknown) {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v.length > 255) return v.slice(0, 255);
  return v;
}

function normalizeText(value: unknown, maxLen: number) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  if (v.length > maxLen) return v.slice(0, maxLen);
  return v;
}

function getClientIp(req: Request) {
  const h =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "";
  const first = h.split(",")[0]?.trim();
  return first || null;
}

