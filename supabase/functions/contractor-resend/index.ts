import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY") ?? "";
const resendFromEmail = (Deno.env.get("RESEND_FROM_EMAIL") ?? "").trim();
const templateBucket = "contract-templates";
const ndaSignedUrlExpiresSeconds = 7 * 24 * 60 * 60; // 7 days

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: { headers: { Authorization: req.headers.get("Authorization")! } },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { applicationId } = await req.json();
    if (!applicationId) {
      return new Response(JSON.stringify({ error: "Missing applicationId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("id", user.id)
      .single();

    const role = String(profile?.role || "");
    if (!role || !["admin", "super_admin"].includes(role)) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: app, error: appError } = await supabaseAdmin
      .from("contractor_applications")
      .select("*")
      .eq("id", applicationId)
      .single();

    if (appError || !app) {
      return new Response(JSON.stringify({ error: "Application not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate Signed URL
    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(templateBucket)
      .createSignedUrl(app.nda_template_path, ndaSignedUrlExpiresSeconds);

    if (signedError || !signed?.signedUrl) {
      return new Response(
        JSON.stringify({ error: "Could not sign URL for NDA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = `
      <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
        <h2>Hola ${String(app.full_name || "").replaceAll("<", "&lt;").replaceAll(">", "&gt;")},</h2>
        <p>Nos has solicitado (o un administrador ha solicitado) el reenvío de tu NDA.</p>
        <p>Adjunto encontrarás el documento. También puedes descargarlo aquí:</p>
        <p><a href="${signed.signedUrl}">Descargar NDA</a></p>
      </div>
    `;

    const { data: enq, error: enqErr } = await supabaseAdmin
      .from("email_outbox")
      .insert({
        status: "pending",
        priority: 30,
        to_email: String(app.email || "").trim().toLowerCase(),
        subject: "Reenvío: Carta de Confidencialidad (NDA) - Integrated Home Solutions",
        html,
        from_email: resendFromEmail || null,
        attachments: [{ filename: "CARTA_DE_CONFIDENCIALIDAD.doc", path: signed.signedUrl }],
        template_key: "contractor_nda_resend",
        template_vars: { fullName: String(app.full_name || "") },
        metadata: { application_id: applicationId, requested_by: user.id },
      })
      .select("id")
      .single();

    if (enqErr || !enq?.id) {
      return new Response(JSON.stringify({ error: "Failed to enqueue email", details: String(enqErr?.message || "") }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update sent time (enqueued)
    await supabaseAdmin
      .from("contractor_applications")
      .update({ nda_sent_at: new Date().toISOString() })
      .eq("id", applicationId);

    return new Response(JSON.stringify({ ok: true, emailOutboxId: enq.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message ? String(error.message) : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
