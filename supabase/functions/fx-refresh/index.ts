import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const toMicro = (rate: number, decimals = 6) => {
  const factor = 10 ** decimals;
  return BigInt(Math.round(rate * factor));
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Missing Supabase env", { status: 500, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const fxApiUrl = "https://api.frankfurter.app/latest?from=USD&to=MXN";
    const fxRes = await fetch(fxApiUrl);
    if (!fxRes.ok) {
      return new Response("FX fetch failed", { status: 502, headers: corsHeaders });
    }

    const fxJson = await fxRes.json();
    const marketRate = Number(fxJson?.rates?.MXN);
    const asOf = typeof fxJson?.date === "string" ? fxJson.date : null;
    if (!Number.isFinite(marketRate) || marketRate <= 0) {
      return new Response("Invalid FX payload", { status: 502, headers: corsHeaders });
    }

    const decimals = 6;
    const marketRateMicro = toMicro(marketRate, decimals);

    await supabaseAdmin
      .from("market_fx_rates")
      .upsert({
        pair: "USD_MXN",
        rate_micro: String(marketRateMicro),
        decimals,
        as_of: asOf,
        source: "frankfurter",
        fetched_at: new Date().toISOString(),
      });

    const { data: fixedCfg } = await supabaseAdmin
      .from("fx_rate_configs")
      .select("rate_micro, decimals")
      .eq("pair", "USD_MXN")
      .single();

    const fixedRateMicro = fixedCfg?.rate_micro ? BigInt(String(fixedCfg.rate_micro)) : null;
    const fixedDecimals = typeof fixedCfg?.decimals === "number" ? fixedCfg.decimals : decimals;

    const thresholdPercent = 5;

    if (fixedRateMicro !== null && fixedDecimals === decimals) {
      const market = Number(marketRateMicro);
      const fixed = Number(fixedRateMicro);
      const diffPct = Math.abs(market - fixed) / market * 100;

      if (diffPct >= thresholdPercent) {
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: existing } = await supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("title", "FX rate divergence")
          .gte("created_at", since)
          .limit(1);

        if (!existing || existing.length === 0) {
          const { data: admins } = await supabaseAdmin
            .from("users")
            .select("id")
            .in("role", ["admin", "super_admin"]);

          const rateHuman = Number(marketRateMicro) / 1_000_000;
          const fixedHuman = Number(fixedRateMicro) / 1_000_000;

          const inserts = (admins || []).map((a: any) => ({
            user_id: a.id,
            title: "FX rate divergence",
            message: `La tasa fija USD/MXN (${fixedHuman.toFixed(2)}) difiere del mercado (${rateHuman.toFixed(2)}) por ${diffPct.toFixed(1)}%.`,
            type: "warning",
            link: "/admin/settings",
          }));

          if (inserts.length > 0) {
            await supabaseAdmin.from("notifications").insert(inserts);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, pair: "USD_MXN", marketRate, asOf }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch {
    return new Response("FX refresh error", { status: 500, headers: corsHeaders });
  }
});

