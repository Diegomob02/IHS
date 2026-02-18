import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const stripeSecretKey = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
const stripeWebhookSecret = (Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "").trim();
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseServiceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const safeMessage = (raw: unknown) => {
  const s = String(raw ?? "");
  if (!s) return null;
  const trimmed = s.length > 160 ? `${s.slice(0, 157)}...` : s;
  return trimmed;
};

const serializeStripeError = (error: any) => {
  const e = error && typeof error === "object" ? error : null;
  const raw = e?.raw && typeof e.raw === "object" ? e.raw : null;
  return {
    type: e?.type ?? raw?.type,
    code: e?.code ?? raw?.code,
    message: e?.message ?? raw?.message,
    statusCode: e?.statusCode ?? raw?.statusCode,
    requestId: e?.requestId ?? raw?.requestId,
  };
};

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    if (!stripeSecretKey || !stripeWebhookSecret) return new Response("Missing Stripe env", { status: 500 });
    if (!supabaseUrl || !supabaseServiceRoleKey) return new Response("Missing Supabase env", { status: 500 });

    const sig = req.headers.get("stripe-signature");
    if (!sig) return new Response("Missing stripe-signature", { status: 400 });

    const stripeAccountHeader = req.headers.get("stripe-account") ?? req.headers.get("Stripe-Account") ?? null;
    const rawBody = await req.text();

    let event: any;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, sig, stripeWebhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed", {
        message: (err as any)?.message,
        stripe: serializeStripeError(err),
      });
      return new Response("Invalid signature", { status: 400 });
    }

    const connectedAccountId = (stripeAccountHeader ?? (event as any).account ?? null) as string | null;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const nowIso = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from("stripe_webhook_events")
      .select("id, status, attempts")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (existing?.status === "processed") return json({ ok: true, dedup: true }, 200);

    if (!existing?.id) {
      await supabaseAdmin.from("stripe_webhook_events").insert({
        stripe_event_id: event.id,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
        livemode: (event as any).livemode ?? null,
        api_version: (event as any).api_version ?? null,
        received_at: nowIso,
        last_received_at: nowIso,
        status: "received",
        attempts: 1,
        last_error: null,
        processed_at: null,
        stripe_account_id: connectedAccountId,
      });
    } else {
      await supabaseAdmin
        .from("stripe_webhook_events")
        .update({
          attempts: Number(existing.attempts || 0) + 1,
          last_received_at: nowIso,
          payload: event as unknown as Record<string, unknown>,
          stripe_account_id: connectedAccountId,
        })
        .eq("id", existing.id);
    }

    const failEvent = async (err: unknown) => {
      const msg = safeMessage((err as any)?.message) ?? "Error";
      await supabaseAdmin
        .from("stripe_webhook_events")
        .update({ status: "failed", last_error: msg })
        .eq("stripe_event_id", event.id);
      return json({ ok: false, error: msg }, 200);
    };

    const markProcessed = async () => {
      await supabaseAdmin
        .from("stripe_webhook_events")
        .update({ status: "processed", processed_at: nowIso, last_error: null })
        .eq("stripe_event_id", event.id);
      return json({ ok: true }, 200);
    };

    const resolveClient = async () => {
      if (!connectedAccountId) return null;
      const { data } = await supabaseAdmin
        .from("clients")
        .select("id")
        .eq("stripe_connected_account_id", connectedAccountId)
        .maybeSingle();
      return data?.id ?? null;
    };

    try {
      if (event.type === "setup_intent.succeeded") {
        const si = event.data.object as any;
        const customerId = typeof si.customer === "string" ? si.customer : si.customer?.id;
        const paymentMethodId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
        const clientId = await resolveClient();
        if (clientId && customerId && paymentMethodId && connectedAccountId) {
          const pm = await stripe.paymentMethods.retrieve(paymentMethodId, { stripeAccount: connectedAccountId });
          const summary = (pm as any)?.card
            ? {
              brand: (pm as any).card.brand,
              last4: (pm as any).card.last4,
              exp_month: (pm as any).card.exp_month,
              exp_year: (pm as any).card.exp_year,
            }
            : {};

          await supabaseAdmin
            .from("tenant_payment_profiles")
            .update({
              default_payment_method_id: paymentMethodId,
              payment_method_summary: summary,
              status: "active",
            })
            .eq("client_id", clientId)
            .eq("stripe_customer_id", customerId);
        }

        return await markProcessed();
      }

      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object as any;
        const chargeId = (pi.charges && (pi.charges as any).data && (pi.charges as any).data[0]) ? (pi.charges as any).data[0].id : null;
        const { data: updated } = await supabaseAdmin
          .from("payment_attempts")
          .update({
            status: "succeeded",
            stripe_charge_id: chargeId,
            stripe_webhook_event_id: event.id,
          })
          .eq("stripe_payment_intent_id", pi.id)
          .select("lease_id")
          .maybeSingle();

        if (updated?.lease_id) {
          await supabaseAdmin.from("leases").update({ autopay_status: "active" }).eq("id", updated.lease_id);
        }

        return await markProcessed();
      }

      if (event.type === "payment_intent.payment_failed") {
        const pi = event.data.object as any;
        const code = (pi.last_payment_error as any)?.code ?? null;
        const msg = safeMessage((pi.last_payment_error as any)?.message) ?? "Pago fallido";

        const { data: updated } = await supabaseAdmin
          .from("payment_attempts")
          .update({
            status: "failed",
            failure_code: code,
            failure_message_safe: msg,
            stripe_webhook_event_id: event.id,
          })
          .eq("stripe_payment_intent_id", pi.id)
          .select("lease_id")
          .maybeSingle();

        if (updated?.lease_id) {
          await supabaseAdmin.from("leases").update({ autopay_status: "failing" }).eq("id", updated.lease_id);
        }

        return await markProcessed();
      }

      if (event.type === "payment_intent.requires_action") {
        const pi = event.data.object as any;
        const { data: updated } = await supabaseAdmin
          .from("payment_attempts")
          .update({ status: "requires_action", stripe_webhook_event_id: event.id })
          .eq("stripe_payment_intent_id", pi.id)
          .select("lease_id")
          .maybeSingle();

        if (updated?.lease_id) {
          await supabaseAdmin.from("leases").update({ autopay_status: "failing" }).eq("id", updated.lease_id);
        }
        return await markProcessed();
      }

      return await markProcessed();
    } catch (err) {
      console.error("stripe-webhook processing failed", {
        event_id: event.id,
        type: event.type,
        stripe_account_id: connectedAccountId,
        message: (err as any)?.message,
        stripe: serializeStripeError(err),
      });
      return await failEvent(err);
    }
  } catch (err) {
    return json({ error: (err as any)?.message ?? "Unknown error" }, 500);
  }
});
