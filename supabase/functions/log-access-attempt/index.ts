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
  success?: unknown;
  reason?: unknown;
  userId?: unknown;
  path?: unknown;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
    if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, message: "Missing Supabase env" }, 500);

    const body = (await req.json().catch(() => ({}))) as Payload;
    const email = normalizeEmail(body?.email);
    const portal = normalizeText(body?.portal, 40);
    const success = Boolean(body?.success ?? false);
    const reason = normalizeText(body?.reason, 200);
    const userId = normalizeText(body?.userId, 60);
    const path = normalizeText(body?.path, 200);

    const ip = getClientIp(req);
    const userAgent = normalizeText(req.headers.get("user-agent") ?? "", 300);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    await supabaseAdmin.from("auth_login_attempts").insert({
      email,
      ip,
      portal,
      success,
      reason,
    });

    await supabaseAdmin.from("audit_logs").insert({
      user_id: userId || null,
      action: "auth_access_attempt",
      entity_type: "auth",
      details: {
        email,
        portal,
        success,
        reason,
        path,
        user_agent: userAgent,
      },
      ip_address: ip,
    });

    return json({ ok: true }, 200);
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

