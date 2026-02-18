import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripeSecretKey = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cronSecret = (Deno.env.get("CRON_SECRET") ?? "").trim();

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const getTzParts = (d: Date, timeZone: string) => {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.format(d).split("-");
  return { y: Number(parts[0]), m: Number(parts[1]), day: Number(parts[2]) };
};

const periodFor = (y: number, m: number) => `${y}${String(m).padStart(2, "0")}`;

const isWeekend = (y: number, m: number, d: number, timeZone: string) => {
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const wd = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(dt);
  return wd === "Sat" || wd === "Sun";
};

const scheduledDayFor = (y: number, m: number, billingDay: number, weekendRule: string, timeZone: string) => {
  let day = Math.min(Math.max(1, billingDay), 28);
  if (weekendRule === "no_shift") return day;
  if (!isWeekend(y, m, day, timeZone)) return day;
  if (weekendRule === "shift_to_previous_business_day") {
    while (day > 1 && isWeekend(y, m, day, timeZone)) day -= 1;
    return day;
  }
  while (day < 28 && isWeekend(y, m, day, timeZone)) day += 1;
  return day;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_")) {
      return new Response("Missing/invalid STRIPE_SECRET_KEY", { status: 500, headers: corsHeaders });
    }
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Missing Supabase env", { status: 500, headers: corsHeaders });
    }
    if (!cronSecret || (req.headers.get("x-cron-secret") ?? "") !== cronSecret) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: leases } = await supabaseAdmin
      .from("leases")
      .select("id, property_id, tenant_id, rent_amount_cents, currency, billing_day, weekend_rule, autopay_enabled, status")
      .eq("autopay_enabled", true)
      .eq("status", "active");

    const now = new Date();

    let processed = 0;
    const failures: Array<{ leaseId: string; error: string }> = [];

    for (const l of (leases || []) as any[]) {
      try {
        if (!l.tenant_id) continue;

        const { data: prop } = await supabaseAdmin
          .from("properties")
          .select("id, client_id, timezone")
          .eq("id", l.property_id)
          .single();

        if (!prop?.client_id) continue;
        const tz = String(prop.timezone || "UTC");
        const { y, m, day } = getTzParts(now, tz);
        const period = periodFor(y, m);
        const scheduledDay = scheduledDayFor(y, m, Number(l.billing_day || 1), String(l.weekend_rule || "shift_to_next_business_day"), tz);
        if (day !== scheduledDay) continue;

        const { data: client } = await supabaseAdmin
          .from("clients")
          .select("id, stripe_connected_account_id, status")
          .eq("id", prop.client_id)
          .single();

        if (!client?.stripe_connected_account_id || client.status !== "active") continue;
        const connectedAccountId = String(client.stripe_connected_account_id);

        const { data: tpp } = await supabaseAdmin
          .from("tenant_payment_profiles")
          .select("stripe_customer_id, default_payment_method_id, status")
          .eq("tenant_id", l.tenant_id)
          .eq("client_id", client.id)
          .maybeSingle();

        if (!tpp?.stripe_customer_id || !tpp?.default_payment_method_id || tpp.status !== "active") {
          await supabaseAdmin.from("leases").update({ autopay_status: "pending_method" }).eq("id", l.id);
          continue;
        }

        const { data: existing } = await supabaseAdmin
          .from("payment_attempts")
          .select("id, status")
          .eq("lease_id", l.id)
          .eq("period_yyyymm", period)
          .in("status", ["processing", "succeeded"])
          .limit(1);

        if ((existing || []).length > 0) continue;

        const { data: priorAttempts } = await supabaseAdmin
          .from("payment_attempts")
          .select("attempt_no, status, created_at")
          .eq("lease_id", l.id)
          .eq("period_yyyymm", period)
          .order("attempt_no", { ascending: false })
          .limit(1);

        const lastAttemptNo = priorAttempts && priorAttempts[0] ? Number((priorAttempts[0] as any).attempt_no || 0) : 0;
        const nextAttemptNo = lastAttemptNo + 1;
        if (nextAttemptNo > 3) continue;

        const amountCents = Number(l.rent_amount_cents || 0);
        const currency = String(l.currency || "usd");
        if (!Number.isFinite(amountCents) || amountCents <= 0) continue;

        const { data: inserted } = await supabaseAdmin
          .from("payment_attempts")
          .insert({
            lease_id: l.id,
            property_id: l.property_id,
            client_id: client.id,
            period_yyyymm: period,
            attempt_no: nextAttemptNo,
            amount_cents: String(amountCents),
            currency,
            stripe_connected_account_id: connectedAccountId,
            status: "processing",
            initiated_by: "system",
          })
          .select("id")
          .single();

        const idempotencyKey = `lease:${l.id}:${period}:${nextAttemptNo}`;

        const pi = await stripe.paymentIntents.create(
          {
            amount: amountCents,
            currency,
            customer: String(tpp.stripe_customer_id),
            payment_method: String(tpp.default_payment_method_id),
            off_session: true,
            confirm: true,
            metadata: {
              lease_id: String(l.id),
              property_id: String(l.property_id),
              client_id: String(client.id),
              period_yyyymm: period,
              attempt_id: String(inserted?.id || ""),
              initiated_by: "system",
            },
          },
          { stripeAccount: connectedAccountId, idempotencyKey },
        );

        const chargeId = (pi.charges && (pi.charges as any).data && (pi.charges as any).data[0]) ? (pi.charges as any).data[0].id : null;
        const nextStatus = pi.status === "succeeded" ? "succeeded" : pi.status === "requires_action" ? "requires_action" : "processing";

        await supabaseAdmin
          .from("payment_attempts")
          .update({
            stripe_payment_intent_id: pi.id,
            stripe_charge_id: chargeId,
            status: nextStatus,
          })
          .eq("id", inserted.id);

        await supabaseAdmin
          .from("leases")
          .update({ autopay_status: nextStatus === "succeeded" ? "active" : nextStatus === "requires_action" ? "failing" : "active" })
          .eq("id", l.id);

        processed += 1;
      } catch (e: any) {
        failures.push({ leaseId: String(l?.id || ""), error: String(e?.message || "Error") });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, failures: failures.slice(0, 20) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || "Unknown error") }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
