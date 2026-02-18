import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const normalizeBearer = (h: string) => {
  const s = (h ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("bearer ")) return s;
  return `Bearer ${s}`;
};

type Payload = {
  leadId?: unknown;
  status?: unknown;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ ok: false, message: "Method not allowed" }, 405);
    }
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json({ ok: false, message: "Missing Supabase env" }, 500);
    }

    const authHeader = normalizeBearer(req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabaseAuth.auth.getUser();
    const authUser = userData.user;
    if (!authUser?.id) return json({ ok: false, message: "User not authenticated" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();

    const role = String(profile?.role || "");
    if (!role || !["admin", "super_admin"].includes(role)) {
      return json({ ok: false, message: "Forbidden" }, 403);
    }

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const leadId = String(payload?.leadId ?? "").trim();
    const nextStatus = String(payload?.status ?? "").trim();

    if (!leadId) return json({ ok: false, message: "Missing leadId" }, 400);
    if (!nextStatus) return json({ ok: false, message: "Missing status" }, 400);
    if (nextStatus.length > 100) return json({ ok: false, message: "Status too long" }, 400);

    const { data: current } = await supabaseAdmin
      .from("leads")
      .select("id, name, email, phone, source, status, message, created_at")
      .eq("id", leadId)
      .single();

    if (!current?.id) return json({ ok: false, message: "Lead not found" }, 404);

    const previousStatus = String(current.status || "");
    if (previousStatus === nextStatus) {
      return json({ ok: true, leadId, status: nextStatus, changed: false }, 200);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("leads")
      .update({ status: nextStatus })
      .eq("id", leadId)
      .select("id, status")
      .single();

    if (updateError || !updated?.id) {
      return json({ ok: false, message: updateError?.message || "Update failed" }, 400);
    }

    const cfg = await getN8nConfig(supabaseAdmin);
    const n8nSent = await postToN8n(cfg, {
      type: "lead_status_changed",
      timestamp: new Date().toISOString(),
      data: {
        lead_id: current.id,
        previous_status: previousStatus,
        status: nextStatus,
        name: current.name,
        email: current.email,
        phone: current.phone,
        source: current.source,
        message: current.message,
        created_at: current.created_at,
      },
    });

    return json(
      {
        ok: true,
        leadId: updated.id,
        status: updated.status,
        previousStatus,
        changed: true,
        n8nSent,
      },
      200,
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

async function getN8nConfig(supabaseAdmin: any): Promise<{ enabled: boolean; webhookUrl: string; syncEnabled: boolean }> {
  try {
    const { data: cfg } = await supabaseAdmin
      .from("integration_configs")
      .select("status, config_json")
      .eq("type", "n8n")
      .single();

    const enabled = cfg?.status === "enabled";
    const webhookUrl = enabled ? String((cfg as any)?.config_json?.webhookUrl || "") : "";
    const syncEnabled = enabled ? Boolean((cfg as any)?.config_json?.syncEnabled) : false;
    return { enabled, webhookUrl, syncEnabled };
  } catch {
    return { enabled: false, webhookUrl: "", syncEnabled: false };
  }
}

async function postToN8n(
  cfg: { enabled: boolean; webhookUrl: string; syncEnabled: boolean },
  payload: { type: string; timestamp: string; data: any },
) {
  if (!cfg.enabled || !cfg.syncEnabled || !cfg.webhookUrl) return false;
  try {
    const res = await fetch(cfg.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
