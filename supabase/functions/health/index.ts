import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const healthSecret = (Deno.env.get("HEALTH_SECRET") ?? Deno.env.get("CRON_SECRET") ?? "").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-health-secret",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  if (!healthSecret || (req.headers.get("x-health-secret") ?? "") !== healthSecret) {
    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const startedAt = Date.now();
  try {
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase env");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const dbPing = await supabaseAdmin.from("app_settings").select("key").limit(1);
    const dbOk = !dbPing.error;

    const [emailPending, reportDue] = await Promise.all([
      supabaseAdmin
        .from("email_outbox")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "failed"]),
      supabaseAdmin
        .from("report_schedules")
        .select("id", { count: "exact", head: true })
        .eq("enabled", true)
        .lte("next_run_at", new Date().toISOString()),
    ]);

    const ok = dbOk;
    const latencyMs = Date.now() - startedAt;
    return new Response(
      JSON.stringify({
        ok,
        dbOk,
        latencyMs,
        queues: {
          emailPending: emailPending.count ?? 0,
          reportsDue: reportDue.count ?? 0,
        },
        ts: new Date().toISOString(),
      }),
      { status: ok ? 200 : 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e || "Unknown error") }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
