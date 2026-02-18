import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKeyFromEnv = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");

    const supabaseAnonKey = req.headers.get("apikey") ?? supabaseAnonKeyFromEnv;
    if (!supabaseAnonKey) throw new Error("Missing Supabase anon key");

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: req.headers.get("Authorization") ?? "",
        },
      },
    });

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return json({ ok: false, message: "User not authenticated", testedAt: new Date().toISOString() }, 401);
    }

    const { data: profile } = await supabaseClient
      .from("users")
      .select("role")
      .eq("email", user.email)
      .single();

    if (!profile || profile.role !== "super_admin") {
      return json({ ok: false, message: "Forbidden", testedAt: new Date().toISOString() }, 403);
    }

    const body = await req.json();
    const phoneNumberId = String(body?.phoneNumberId || "").trim();
    const accessToken = String(body?.accessToken || "").trim();

    if (!phoneNumberId || !accessToken) {
      return json(
        { ok: false, message: "Missing phoneNumberId or accessToken", testedAt: new Date().toISOString() },
        400
      );
    }

    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(phoneNumberId)}?fields=verified_name,code_verification_status`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }

    if (!res.ok) {
      return json(
        {
          ok: false,
          message: "WhatsApp API request failed",
          details: { status: res.status, body: payload },
          testedAt: new Date().toISOString(),
        },
        200
      );
    }

    return json(
      {
        ok: true,
        message: "WhatsApp connection OK",
        details: payload,
        testedAt: new Date().toISOString(),
      },
      200
    );
  } catch (e) {
    return json(
      {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
        testedAt: new Date().toISOString(),
      },
      500
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

