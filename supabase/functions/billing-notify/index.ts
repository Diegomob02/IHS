import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Missing Supabase env", { status: 500, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const due = new Date(now);
    due.setDate(due.getDate() + 5);
    const dueStr = isoDate(due);

    const { data: invoices } = await supabaseAdmin
      .from("billing_invoices")
      .select("id, account_id, owner_email, kind, charge_currency, charge_amount_cents, due_date, status")
      .eq("status", "sent")
      .eq("due_date", dueStr)
      .limit(500);

    const list = (invoices || []).filter((i: any) => i?.owner_email);
    if (list.length === 0) {
      return new Response(JSON.stringify({ ok: true, notified: 0, due: dueStr }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const emails = Array.from(new Set(list.map((i: any) => String(i.owner_email).toLowerCase())));
    const { data: users } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .in("email", emails);

    const userByEmail = new Map<string, any>();
    (users || []).forEach((u: any) => {
      if (u?.email) userByEmail.set(String(u.email).toLowerCase(), u);
    });

    const notifications: any[] = [];
    list.forEach((inv: any) => {
      const email = String(inv.owner_email).toLowerCase();
      const u = userByEmail.get(email);
      if (!u?.id) return;
      const currency = String(inv.charge_currency || "USD").toUpperCase();
      const amount = Number(inv.charge_amount_cents || 0) / 100;
      const kindLabel = inv.kind === "deposit" ? "Depósito" : "Pago mensual";
      notifications.push({
        user_id: u.id,
        title: "Pago próximo a vencer",
        message: `${kindLabel} vence en 5 días: ${currency} ${amount.toFixed(2)} (vence ${dueStr}).`,
        type: "warning",
        link: "/billing",
      });
    });

    if (notifications.length > 0) {
      await supabaseAdmin.from("notifications").insert(notifications);
    }

    try {
      const { data: cfg } = await supabaseAdmin
        .from("integration_configs")
        .select("status, config_json")
        .eq("type", "n8n")
        .single();

      const enabled = cfg?.status === "enabled";
      const webhookUrl = enabled ? String((cfg as any)?.config_json?.webhookUrl || "") : "";
      const syncEnabled = enabled ? Boolean((cfg as any)?.config_json?.syncEnabled) : false;
      if (enabled && syncEnabled && webhookUrl) {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "billing_due_soon",
            timestamp: new Date().toISOString(),
            data: { due_date: dueStr, invoices: list },
          }),
        });
      }
    } catch {
      // ignore
    }

    return new Response(JSON.stringify({ ok: true, notified: notifications.length, due: dueStr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch {
    return new Response("billing-notify error", { status: 500, headers: corsHeaders });
  }
});

