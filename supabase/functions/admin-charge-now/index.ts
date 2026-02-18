import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripeSecretKey = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();
const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

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

const getPeriod = (d: Date) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
};

type Payload = { leaseId: string; amountCents?: number; currency?: "usd" | "mxn" };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!stripeSecretKey || !stripeSecretKey.startsWith("sk_")) {
      return new Response("Missing/invalid STRIPE_SECRET_KEY", { status: 500, headers: corsHeaders });
    }
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return new Response("Missing Supabase env", { status: 500, headers: corsHeaders });
    }

    const authHeader = normalizeBearer(req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabaseAuth.auth.getUser();
    const authUser = userData.user;
    if (!authUser?.id) {
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;
    const leaseId = String(payload?.leaseId || "").trim();
    if (!leaseId) {
      return new Response(JSON.stringify({ error: "Missing leaseId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();

    const role = String(profile?.role || "");
    if (!role || !["admin", "super_admin"].includes(role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: lease } = await supabaseAdmin
      .from("leases")
      .select("id, property_id, tenant_id, rent_amount_cents, currency, status")
      .eq("id", leaseId)
      .single();

    if (!lease?.id || lease.status !== "active") {
      return new Response(JSON.stringify({ error: "Lease not active" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("id, assigned_admin_id, client_id")
      .eq("id", lease.property_id)
      .single();

    if (role !== "super_admin" && String(prop?.assigned_admin_id || "") !== authUser.id) {
      return new Response(JSON.stringify({ error: "Lease not in scope" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, stripe_connected_account_id, status")
      .eq("id", prop.client_id)
      .single();

    if (!client?.stripe_connected_account_id || client.status !== "active") {
      return new Response(JSON.stringify({ error: "Client Stripe not active" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const connectedAccountId = String(client.stripe_connected_account_id);
    const amountCents = Number.isFinite(Number(payload.amountCents)) ? Math.round(Number(payload.amountCents)) : Number(lease.rent_amount_cents || 0);
    const currency = (payload.currency ?? lease.currency) as any;
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!currency || !["usd", "mxn"].includes(String(currency))) {
      return new Response(JSON.stringify({ error: "Invalid currency" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tpp } = await supabaseAdmin
      .from("tenant_payment_profiles")
      .select("stripe_customer_id, default_payment_method_id, status")
      .eq("tenant_id", lease.tenant_id)
      .eq("client_id", client.id)
      .maybeSingle();

    if (!tpp?.stripe_customer_id || !tpp?.default_payment_method_id || tpp.status !== "active") {
      return new Response(JSON.stringify({ error: "Tenant has no active payment method" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const period = getPeriod(new Date());
    const attemptNo = 1;

    const { data: attempt } = await supabaseAdmin
      .from("payment_attempts")
      .insert({
        lease_id: lease.id,
        property_id: lease.property_id,
        client_id: client.id,
        period_yyyymm: period,
        attempt_no: attemptNo,
        amount_cents: String(amountCents),
        currency,
        stripe_connected_account_id: connectedAccountId,
        status: "processing",
        initiated_by: "admin",
      })
      .select("id")
      .single();

    const idempotencyKey = `lease:${lease.id}:${period}:manual:${attemptNo}`;

    const pi = await stripe.paymentIntents.create(
      {
        amount: amountCents,
        currency,
        customer: String(tpp.stripe_customer_id),
        payment_method: String(tpp.default_payment_method_id),
        off_session: true,
        confirm: true,
        metadata: {
          lease_id: String(lease.id),
          property_id: String(lease.property_id),
          client_id: String(client.id),
          period_yyyymm: period,
          attempt_id: String(attempt?.id || ""),
          initiated_by: "admin",
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
      .eq("id", attempt.id);

    return new Response(JSON.stringify({ ok: true, paymentIntentId: pi.id, status: nextStatus }), {
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
