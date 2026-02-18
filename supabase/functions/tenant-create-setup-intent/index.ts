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

type Payload = { leaseId: string };

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
    if (!leaseId) {
      return new Response(JSON.stringify({ error: "Missing leaseId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: lease } = await supabaseAdmin
      .from("leases")
      .select("id, tenant_id, property_id, currency")
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

    if (!prop?.client_id) {
      return new Response(JSON.stringify({ error: "Lease has no client configured" }), {
        status: 400,
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

    const { data: profile } = await supabaseAdmin
      .from("tenant_payment_profiles")
      .select("id, stripe_customer_id")
      .eq("tenant_id", user.id)
      .eq("client_id", client.id)
      .maybeSingle();

    let customerId = String(profile?.stripe_customer_id || "").trim();

    if (!customerId) {
      const customer = await stripe.customers.create(
        {
          email: user.email ?? undefined,
          metadata: {
            tenant_id: user.id,
            client_id: String(client.id),
          },
        },
        { stripeAccount: connectedAccountId },
      );
      customerId = customer.id;

      await supabaseAdmin
        .from("tenant_payment_profiles")
        .upsert(
          {
            tenant_id: user.id,
            client_id: client.id,
            stripe_customer_id: customerId,
            status: "pending",
          },
          { onConflict: "tenant_id,client_id" },
        );
    }

    const setupIntent = await stripe.setupIntents.create(
      {
        customer: customerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: {
          lease_id: String(lease.id),
          property_id: String(lease.property_id),
          client_id: String(client.id),
        },
      },
      { stripeAccount: connectedAccountId },
    );

    return new Response(
      JSON.stringify({
        clientSecret: setupIntent.client_secret,
        customerId,
        stripeAccountId: connectedAccountId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || "Unknown error") }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
