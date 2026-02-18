import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ApplyPayload = {
  fullName?: unknown;
  phone?: unknown;
  whatsappPhone?: unknown;
  email?: unknown;
  companyName?: unknown;
  workTypes?: unknown;
  website?: unknown;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ ok: false, message: "Method not allowed" }, 405);
    }

    if (!supabaseUrl) return json({ ok: false, message: "Missing SUPABASE_URL" }, 500);
    if (!serviceRoleKey) return json({ ok: false, message: "Missing SERVICE_ROLE_KEY" }, 500);

    const body = (await req.json().catch(() => ({}))) as ApplyPayload;
    if (String(body?.website ?? "").trim()) {
      return json({ ok: true }, 200);
    }

    const fullName = String(body?.fullName ?? "").trim();
    const phone = String(body?.phone ?? "").trim();
    const whatsappPhone = String(body?.whatsappPhone ?? "").trim();
    const email = String(body?.email ?? "").trim();
    const companyName = String(body?.companyName ?? "").trim();
    const workTypesRaw = body?.workTypes;

    if (!phone) return json({ ok: false, message: "Missing phone" }, 400);
    if (!whatsappPhone) return json({ ok: false, message: "Missing whatsappPhone" }, 400);
    if (!email) return json({ ok: false, message: "Missing email" }, 400);
    if (!companyName) return json({ ok: false, message: "Missing companyName" }, 400);

    const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const normalizePhone = (raw: string) => raw.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
    const isValidPhone = (raw: string) => {
      const v = normalizePhone(raw);
      const digits = v.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) return false;
      return /^\+?[1-9]\d{9,14}$/.test(v.startsWith("+") ? v : `+${digits}`);
    };
    const isValidCompanyName = (raw: string) => !/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s&.'-]/.test(raw);

    if (!isValidPhone(phone)) return json({ ok: false, message: "Invalid phone format" }, 400);
    if (!isValidPhone(whatsappPhone)) return json({ ok: false, message: "Invalid WhatsApp format" }, 400);
    if (!isValidEmail(email)) return json({ ok: false, message: "Invalid email format" }, 400);
    if (!isValidCompanyName(companyName)) return json({ ok: false, message: "Invalid companyName" }, 400);

    const workTypes = Array.isArray(workTypesRaw) ? workTypesRaw.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    if (!workTypes.length) return json({ ok: false, message: "Missing workTypes" }, 400);
    const safeWorkTypes = workTypes.map((x) => x.slice(0, 50)).slice(0, 20);

    const insertFullName = fullName || companyName;
    const phoneNorm = normalizePhone(phone);
    const whatsappNorm = normalizePhone(whatsappPhone);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const recent = await supabaseAdmin
      .from("contractor_applications")
      .select("id, created_at")
      .or(`phone.eq.${phoneNorm},whatsapp_phone.eq.${whatsappNorm}`)
      .order("created_at", { ascending: false })
      .limit(1);

    const lastCreatedAt = recent?.data?.[0]?.created_at ? new Date(recent.data[0].created_at) : null;
    if (lastCreatedAt && Date.now() - lastCreatedAt.getTime() < 2 * 60 * 1000) {
      return json({ ok: false, message: "Too many requests. Try again later." }, 429);
    }

    const { data: appRow, error: insertError } = await supabaseAdmin
      .from("contractor_applications")
      .insert({
        full_name: insertFullName,
        email,
        phone: phoneNorm,
        whatsapp_phone: whatsappNorm,
        company_name: companyName,
        service_category: safeWorkTypes.join(","),
        status: "submitted",
      })
      .select("id")
      .single();

    if (insertError || !appRow) {
      return json({ ok: false, message: insertError?.message || "Insert failed" }, 400);
    }

    await supabaseAdmin
      .from("user_roles")
      .upsert(
        {
          email: email.toLowerCase(),
          role: "contractor",
          status: "pending",
        },
        { onConflict: "email" },
      );

    const { data: superAdmins } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("role", "super_admin");

    const notifications = (superAdmins || []).map((u: any) => ({
      user_id: u.id,
      title: "Nueva solicitud de contratista",
      message: `${insertFullName} (${companyName})\nEmail: ${email}\nTel: ${phoneNorm}\nWhatsApp: ${whatsappNorm}\nTrabajos: ${safeWorkTypes.join(", ")}`,
      type: "info",
      link: "/propietarios/panel?tab=dashboard",
      is_read: false,
    }));

    if (notifications.length > 0) {
      await supabaseAdmin.from("notifications").insert(notifications);
    }

    return json({ ok: true, applicationId: appRow.id }, 200);
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
