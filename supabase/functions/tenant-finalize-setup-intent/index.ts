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

type Payload = { leaseId: string; setupIntentId: string };

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
    const user = userData.user;
    if (!user?.id) {
      return new Response(JSON.stringify({ error: "User not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (await req.json()) as Payload;
    const leaseId = String(payload?.leaseId || "").trim();
    const setupIntentId = String(payload?.setupIntentId || "").trim();
    if (!leaseId || !setupIntentId) {
      return new Response(JSON.stringify({ error: "Missing leaseId/setupIntentId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: lease } = await supabaseAdmin
      .from("leases")
      .select("id, tenant_id, property_id")
      .eq("id", leaseId)
      .single();

    if (!lease?.id) {
      return new Response(JSON.stringify({ error: "Lease not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (String(lease.tenant_id || "") !== user.id) {
      return new Response(JSON.stringify({ error: "Lease not accessible" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("id, client_id")
      .eq("id", lease.property_id)
      .single();

    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, stripe_connected_account_id")
      .eq("id", prop.client_id)
      .single();

    const connectedAccountId = String(client?.stripe_connected_account_id || "").trim();
    if (!connectedAccountId) {
      return new Response(JSON.stringify({ error: "Client Stripe not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const setupIntent = await stripe.setupIntents.retrieve(
      setupIntentId,
      { expand: ["payment_method"] },
      { stripeAccount: connectedAccountId },
    );

    if (String(setupIntent.status) !== "succeeded") {
      return new Response(JSON.stringify({ error: `SetupIntent not succeeded (${setupIntent.status})` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentMethodId = typeof setupIntent.payment_method === "string" ? setupIntent.payment_method : setupIntent.payment_method?.id;
    const customerId = typeof setupIntent.customer === "string" ? setupIntent.customer : setupIntent.customer?.id;

    if (!paymentMethodId || !customerId) {
      return new Response(JSON.stringify({ error: "Missing customer/payment_method" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await stripe.paymentMethods.attach(
      paymentMethodId,
      { customer: customerId },
      { stripeAccount: connectedAccountId },
    );

    await stripe.customers.update(
      customerId,
      { invoice_settings: { default_payment_method: paymentMethodId } },
      { stripeAccount: connectedAccountId },
    );

    const pm = setupIntent.payment_method as any;
    const summary = pm && typeof pm === "object" && pm.card
      ? {
        brand: pm.card.brand,
        last4: pm.card.last4,
        exp_month: pm.card.exp_month,
        exp_year: pm.card.exp_year,
      }
      : {};

    await supabaseAdmin
      .from("tenant_payment_profiles")
      .upsert(
        {
          tenant_id: user.id,
          client_id: client.id,
          stripe_customer_id: customerId,
          default_payment_method_id: paymentMethodId,
          payment_method_summary: summary,
          status: "active",
        },
        { onConflict: "tenant_id,client_id" },
      );

    await supabaseAdmin
      .from("leases")
      .update({ autopay_status: "active" })
      .eq("id", leaseId);

    return new Response(JSON.stringify({ ok: true }), {
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
