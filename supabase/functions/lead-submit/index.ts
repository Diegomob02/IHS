import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const resendFromEmail = (Deno.env.get("RESEND_FROM_EMAIL") ?? "").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LeadSource = "contact_form" | "evaluation";

type LeadSubmitPayload = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  source?: unknown;
  website?: unknown;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") {
      return json({ ok: false, message: "Method not allowed" }, 405);
    }
    if (!supabaseUrl) return json({ ok: false, message: "Missing SUPABASE_URL" }, 500);
    if (!serviceRoleKey) return json({ ok: false, message: "Missing SERVICE_ROLE_KEY" }, 500);

    const body = (await req.json().catch(() => ({}))) as LeadSubmitPayload;
    if (String(body?.website ?? "").trim()) {
      return json({ ok: true }, 200);
    }

    const name = String(body?.name ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const phone = normalizeOptionalString(body?.phone);
    const message = String(body?.message ?? "").trim();
    const source = String(body?.source ?? "").trim() as LeadSource;

    if (!name) return json({ ok: false, message: "Missing name" }, 400);
    if (!email) return json({ ok: false, message: "Missing email" }, 400);
    if (!looksLikeEmail(email)) return json({ ok: false, message: "Invalid email" }, 400);
    if (!message) return json({ ok: false, message: "Missing message" }, 400);
    if (source !== "contact_form" && source !== "evaluation") {
      return json({ ok: false, message: "Invalid source" }, 400);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const recent = await supabaseAdmin
      .from("leads")
      .select("id, created_at")
      .eq("email", email)
      .eq("source", source)
      .order("created_at", { ascending: false })
      .limit(1);

    const lastCreatedAt = recent?.data?.[0]?.created_at ? new Date(recent.data[0].created_at) : null;
    if (lastCreatedAt && Date.now() - lastCreatedAt.getTime() < 60 * 1000) {
      return json({ ok: false, message: "Too many requests. Try again later." }, 429);
    }

    const { data: lead, error: insertError } = await supabaseAdmin
      .from("leads")
      .insert({
        name,
        email,
        phone,
        message,
        source,
        status: "new",
      })
      .select("id, created_at")
      .single();

    if (insertError || !lead?.id) {
      return json({ ok: false, message: insertError?.message || "Insert failed" }, 400);
    }

    const cfg = await getN8nConfig(supabaseAdmin);
    const n8nSent = await postToN8n(cfg, {
      type: "lead_submitted",
      timestamp: new Date().toISOString(),
      data: {
        lead_id: lead.id,
        source,
        name,
        email,
        phone,
        message,
        created_at: lead.created_at,
      },
    });

    const notificationRules = (await getAppSetting(supabaseAdmin, "notification_rules")) as any;
    const emailTemplates = (await getAppSetting(supabaseAdmin, "email_templates")) as any;

    const emailEventKey = source === "evaluation" ? "lead_evaluation_received" : "lead_contact_received";
    const emailEnabled = resolveBoolean(notificationRules?.email?.[emailEventKey], source === "evaluation");

    let emailEnqueued = false;
    if (emailEnabled) {
      const company = (await getCompanySettings(supabaseAdmin)) as any;
      const companyName = String(company?.company_name || "Integrated Home Solutions");
      const tmpl = (emailTemplates?.[emailEventKey] ?? {}) as any;
      const subject =
        normalizeOptionalString(tmpl?.subject) ||
        (source === "evaluation"
          ? `Tu propiedad está en revisión - ${companyName}`
          : `Recibimos tu mensaje - ${companyName}`);

      const htmlTemplate =
        normalizeOptionalString(tmpl?.html) ||
        defaultLeadEmailHtml({
          companyName,
          source,
        });

      const html = renderTemplate(htmlTemplate, {
        name,
        email,
        phone: phone ?? "",
        message,
        companyName,
      });

      const { error: enqueueError } = await supabaseAdmin.from("email_outbox").insert({
        idempotency_key: `lead:${lead.id}:${emailEventKey}`,
        status: "pending",
        priority: 10,
        to_email: email,
        subject,
        html,
        from_email: resendFromEmail || null,
        template_key: emailEventKey,
        template_vars: { name, email, phone: phone ?? "", message, companyName },
        metadata: { lead_id: lead.id, source },
      });
      emailEnqueued = !enqueueError;
    }

    return json({ ok: true, leadId: lead.id, n8nSent, emailEnqueued }, 200);
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

function normalizeOptionalString(value: unknown) {
  const str = String(value ?? "").trim();
  return str ? str : null;
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function resolveBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderTemplate(input: string, vars: Record<string, string>) {
  let out = String(input ?? "");
  Object.entries(vars).forEach(([k, v]) => {
    out = out.replaceAll(`{{${k}}}`, escapeHtml(String(v ?? "")));
  });
  return out;
}

function defaultLeadEmailHtml(opts: { companyName: string; source: LeadSource }) {
  if (opts.source === "evaluation") {
    return `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
        <h2>Gracias por tu solicitud, {{name}}.</h2>
        <p>Recibimos tu información correctamente.</p>
        <p>Tu propiedad está en revisión. Un especialista de ${escapeHtml(opts.companyName)} se pondrá en contacto contigo en menos de 24 horas.</p>
        <p style="color:#64748b;font-size:12px;">Este correo fue enviado automáticamente.</p>
      </div>
    `;
  }

  return `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
      <h2>Gracias por tu mensaje, {{name}}.</h2>
      <p>Lo recibimos correctamente y nos pondremos en contacto contigo pronto.</p>
      <p style="color:#64748b;font-size:12px;">Este correo fue enviado automáticamente.</p>
    </div>
  `;
}

async function getCompanySettings(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from("company_settings")
    .select("company_name, email")
    .eq("is_singleton", true)
    .maybeSingle();
  return data || null;
}

async function getAppSetting(supabaseAdmin: any, key: string) {
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
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
