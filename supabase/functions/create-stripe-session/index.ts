import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import Stripe from "https://esm.sh/stripe@12.0.0?target=deno";

const stripeSecretKey = (Deno.env.get("STRIPE_SECRET_KEY") ?? "").trim();

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKeyFromEnv = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const billingCurrency = (Deno.env.get("BILLING_CHARGE_CURRENCY") ?? "mxn").trim().toLowerCase();
const billingMode = (Deno.env.get("BILLING_MODE") ?? "fixed").trim().toLowerCase();

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2022-11-15",
  httpClient: Stripe.createFetchHttpClient(),
});

const serializeStripeError = (error: any) => {
  const stripe = error && typeof error === "object" ? error : null;
  const raw = stripe?.raw && typeof stripe.raw === "object" ? stripe.raw : null;

  return {
    type: stripe?.type ?? raw?.type,
    code: stripe?.code ?? raw?.code,
    decline_code: stripe?.decline_code ?? raw?.decline_code,
    message: stripe?.message ?? raw?.message,
    statusCode: stripe?.statusCode ?? raw?.statusCode,
    requestId: stripe?.requestId ?? raw?.requestId,
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const pow10BigInt = (exp: number) => {
  if (exp <= 0) return 1n;
  let result = 1n;
  for (let i = 0; i < exp; i += 1) result *= 10n;
  return result;
};

const roundDivBigInt = (numerator: bigint, denominator: bigint) => {
  if (denominator === 0n) throw new Error("division by zero");
  const half = denominator / 2n;
  return (numerator + half) / denominator;
};

const fetchMarketUsdMxnRateMicro = async (decimals: number) => {
  const fxApiUrl = "https://api.frankfurter.app/latest?from=USD&to=MXN";
  const fxRes = await fetch(fxApiUrl);
  if (!fxRes.ok) return null;
  const fxJson = await fxRes.json();
  const marketRate = Number(fxJson?.rates?.MXN);
  if (!Number.isFinite(marketRate) || marketRate <= 0) return null;
  const factor = 10 ** decimals;
  return BigInt(Math.round(marketRate * factor));
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!stripeSecretKey) throw new Error("Missing STRIPE_SECRET_KEY");
    if (!stripeSecretKey.startsWith("sk_")) {
      throw new Error("Invalid STRIPE_SECRET_KEY: must be a secret key (sk_test_... or sk_live_...), not publishable (pk_...) or other value");
    }
    if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");

    const supabaseAnonKey = req.headers.get("apikey") ?? supabaseAnonKeyFromEnv;
    if (!supabaseAnonKey) throw new Error("Missing Supabase anon key (apikey header or SUPABASE_ANON_KEY env)");

    const origin =
      (Deno.env.get("SITE_URL") ?? Deno.env.get("APP_BASE_URL") ?? Deno.env.get("PUBLIC_SITE_URL") ?? req.headers.get("origin") ?? "http://localhost:5173").trim();

    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
    let accessToken = authHeader.trim();
    if (accessToken.toLowerCase().startsWith("bearer ")) {
      accessToken = accessToken.slice(7).trim();
    }

    // 1. Get the user from Supabase Auth
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = accessToken
      ? await supabaseClient.auth.getUser(accessToken)
      : await supabaseClient.auth.getUser();

    if (!user) {
      console.error("create-stripe-session auth failed", {
        hasAuthorizationHeader: !!authHeader,
        authorizationLen: authHeader.length,
        accessTokenLooksJwt: accessToken.split(".").length === 3,
        accessTokenLen: accessToken.length,
        hasApiKeyHeader: !!req.headers.get("apikey"),
        apiKeyLen: (req.headers.get("apikey") ?? "").length,
        userError: userError?.message,
      });
      throw new Error(userError?.message || "User not authenticated");
    }

    // 2. Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("users")
      .select("id, email, stripe_customer_id")
      .eq("email", user.email)
      .single();

    if (profileError || !profile) {
      throw new Error("User profile not found");
    }

    // 3. Get User Properties to calculate dynamic subscription amount
    // We only charge for properties where contract_status is 'signed' or 'active'
    const { data: properties, error: propsError } = await supabaseClient
      .from("properties")
      .select("id, title, monthly_fee, contract_status")
      .eq("owner_email", user.email); // Link by email

    if (propsError) {
      throw new Error("Error fetching properties");
    }

    const activeProperties =
      properties?.filter((p) =>
        (p.contract_status === "signed" || p.contract_status === "active") &&
        Number(p.monthly_fee) > 0
      ) || [];

    if (activeProperties.length === 0) {
      // If no active properties, we can't create a subscription checkout.
      // Maybe they just want to manage their payment method? 
      // If they have a customer ID, send them to portal. If not, error.
      if (profile.stripe_customer_id) {
         const session = await stripe.billingPortal.sessions.create({
          customer: profile.stripe_customer_id,
          return_url: `${origin}/propietarios`,
        });
        return new Response(JSON.stringify({ url: session.url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } else {
        throw new Error("No hay propiedades con contrato firmado para generar cobro.");
      }
    }

    // Calculate total amount
    const totalAmount = activeProperties.reduce(
      (acc, curr) => acc + Number(curr.monthly_fee),
      0,
    );

    const usdAmountCents = BigInt(Math.round(totalAmount * 100));

    let chargeCurrency = billingCurrency;
    if (chargeCurrency !== 'mxn' && chargeCurrency !== 'usd') {
      chargeCurrency = 'mxn';
    }

    let fxPair: string | null = null;
    let fxRateMicro: bigint | null = null;
    let fxDecimals: number | null = null;
    let chargeAmountCents = usdAmountCents;

    const { data: fxConfig, error: fxError } = await supabaseClient
      .from('fx_rate_configs')
      .select('pair, rate_micro, decimals')
      .eq('pair', 'USD_MXN')
      .single();

    if (fxError || !fxConfig) {
      throw new Error('Missing fixed FX rate config (USD_MXN)');
    }

    const fixedRateMicro = BigInt(String(fxConfig.rate_micro));
    const fixedDecimals = Number(fxConfig.decimals);

    let marketRateMicro: bigint | null = null;
    if (billingMode === 'intelligent') {
      const { data: marketCfg } = await supabaseClient
        .from('market_fx_rates')
        .select('rate_micro, decimals')
        .eq('pair', 'USD_MXN')
        .single();

      if (marketCfg?.rate_micro && Number(marketCfg?.decimals) === fixedDecimals) {
        marketRateMicro = BigInt(String(marketCfg.rate_micro));
      }

      if (marketRateMicro === null) {
        marketRateMicro = await fetchMarketUsdMxnRateMicro(fixedDecimals);
      }

      if (marketRateMicro !== null) {
        const chooseUsd = marketRateMicro >= fixedRateMicro;
        chargeCurrency = chooseUsd ? 'usd' : 'mxn';
      }
    }

    if (chargeCurrency === 'mxn') {
      fxPair = fxConfig.pair;
      fxRateMicro = fixedRateMicro;
      fxDecimals = fixedDecimals;

      const denom = pow10BigInt(fxDecimals);
      chargeAmountCents = roundDivBigInt(usdAmountCents * fxRateMicro, denom);
    } else {
      fxPair = 'USD_MXN';
      fxRateMicro = marketRateMicro;
      fxDecimals = fixedDecimals;
      chargeAmountCents = usdAmountCents;
    }

    let customerId = profile.stripe_customer_id;

    // 4. If no Stripe Customer exists, create one
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabaseUUID: user.id,
          supabaseEmail: user.email ?? "",
        },
      });
      customerId = customer.id;

      // Save it to DB
      await supabaseClient
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", profile.id);
    }

    // 5. Check active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1,
    });

    const hasActiveSubscription = subscriptions.data.length > 0;
    
    if (hasActiveSubscription) {
      const subscription = subscriptions.data[0];
      const existingUnitAmount = subscription.items.data[0]?.price?.unit_amount ?? null;
      const existingCurrency = (subscription.items.data[0]?.price?.currency ?? '').toLowerCase();
      const targetUnitAmount = Number(chargeAmountCents);

      if (existingCurrency && existingCurrency !== chargeCurrency) {
        const session = await stripe.billingPortal.sessions.create({
          customer: customerId,
          return_url: `${origin}/propietarios`,
        });
        return new Response(JSON.stringify({ url: session.url }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      if (existingUnitAmount !== null && Number(existingUnitAmount) !== Number(targetUnitAmount)) {
        const newPrice = await stripe.prices.create({
          currency: chargeCurrency,
          unit_amount: targetUnitAmount,
          recurring: { interval: 'month' },
          product_data: {
            name: 'IHS Property Management Fee',
            description: `Monthly management for: ${activeProperties.map((p) => p.title).join(', ')}`,
          },
          metadata: {
            kind: 'dynamic_monthly_fee',
            base_usd_cents: String(usdAmountCents),
            fx_pair: fxPair ?? '',
            fx_rate_micro: fxRateMicro ? String(fxRateMicro) : '',
            fx_decimals: fxDecimals !== null ? String(fxDecimals) : '',
            billing_mode: billingMode,
          },
        });

        const itemId = subscription.items.data[0]?.id;
        if (itemId) {
          await stripe.subscriptions.update(subscription.id, {
            items: [{ id: itemId, price: newPrice.id }],
            proration_behavior: 'create_prorations',
          });
        }
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/propietarios`,
      });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 6. Create Checkout Session with Dynamic Price Data
    // We create a recurring price on the fly for the total amount
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: chargeCurrency,
            product_data: {
              name: 'IHS Property Management Fee',
              description: `Monthly management for: ${activeProperties.map(p => p.title).join(', ')}`,
            },
            unit_amount: Number(chargeAmountCents), // Amount in cents
            recurring: {
              interval: 'month',
            },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/propietarios?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/propietarios`,
      metadata: {
        base_usd_cents: String(usdAmountCents),
        fx_pair: fxPair ?? '',
        fx_rate_micro: fxRateMicro ? String(fxRateMicro) : '',
        fx_decimals: fxDecimals !== null ? String(fxDecimals) : '',
        billing_mode: billingMode,
      },
    });

    try {
      await supabaseClient
        .from('billing_transactions')
        .insert({
          email: user.email,
          stripe_customer_id: customerId,
          stripe_session_id: session.id,
          status: 'created',
          base_currency: 'USD',
          base_amount_cents: String(usdAmountCents),
          charge_currency: chargeCurrency.toUpperCase(),
          charge_amount_cents: String(chargeAmountCents),
          fx_pair: fxPair,
          fx_rate_micro: fxRateMicro ? String(fxRateMicro) : null,
          fx_decimals: fxDecimals,
          metadata: {
            active_property_ids: activeProperties.map((p) => p.id),
            billing_mode: billingMode,
          },
        });
    } catch (e) {
      console.error('Failed to insert billing_transactions', e);
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    const stripeError = serializeStripeError(error);

    console.error("create-stripe-session error", {
      message: error?.message,
      name: error?.name,
      stripe: stripeError,
      stack: error?.stack,
    });

    const isStripeAuth =
      String(stripeError?.code || "") === "api_key_expired" ||
      String(stripeError?.message || "").toLowerCase().includes("invalid api key") ||
      String(stripeError?.message || "").toLowerCase().includes("no such api key") ||
      String(stripeError?.type || "") === "StripeAuthenticationError";

    const hint = isStripeAuth
      ? "Stripe authentication failed. Verify STRIPE_SECRET_KEY is correct for the intended mode (test/live) and configured in Supabase Edge Function secrets."
      : undefined;

    return new Response(
      JSON.stringify({
        error: error?.message ?? "Unknown error",
        stripe: stripeError?.type || stripeError?.code ? stripeError : undefined,
        hint,
      }),
      {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
      },
    );
  }
});
