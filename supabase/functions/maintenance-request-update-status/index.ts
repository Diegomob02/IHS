import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

type Status = "pending" | "in_review" | "assigned" | "in_progress" | "completed" | "cancelled";

type Payload = {
  requestId?: unknown;
  status?: unknown;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return json({ ok: false, message: "Missing Supabase env" }, 500);
    }

    const authHeader = normalizeBearer(req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await supabaseAuth.auth.getUser();
    const authUser = userData.user;
    if (!authUser?.id) return json({ ok: false, message: "User not authenticated" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();

    const role = String(profile?.role || "");
    if (!role || !["admin", "super_admin"].includes(role)) {
      return json({ ok: false, message: "Forbidden" }, 403);
    }

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const requestId = String(payload?.requestId ?? "").trim();
    const nextStatus = String(payload?.status ?? "").trim() as Status;
    if (!requestId) return json({ ok: false, message: "Missing requestId" }, 400);
    if (!isValidStatus(nextStatus)) return json({ ok: false, message: "Invalid status" }, 400);

    const { data: existing } = await supabaseAdmin
      .from("maintenance_requests")
      .select("id, property_id, owner_id, status")
      .eq("id", requestId)
      .single();

    if (!existing?.id) return json({ ok: false, message: "Request not found" }, 404);
    const previousStatus = String(existing.status || "");
    if (previousStatus === nextStatus) {
      return json({ ok: true, requestId, status: nextStatus, changed: false }, 200);
    }

    if (role === "admin") {
      const { data: prop } = await supabaseAdmin
        .from("properties")
        .select("id")
        .eq("id", existing.property_id)
        .eq("assigned_admin_id", authUser.id)
        .single();
      if (!prop?.id) return json({ ok: false, message: "Forbidden" }, 403);
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("maintenance_requests")
      .update({ status: nextStatus })
      .eq("id", requestId)
      .select(
        "id, property_id, owner_id, issue_type, description, priority, status, services, preferred_date, budget_estimated, created_at, updated_at",
      )
      .single();

    if (updateError || !updated?.id) {
      return json({ ok: false, message: updateError?.message || "Update failed" }, 400);
    }

    const ownerId = String(updated.owner_id || "");
    if (ownerId) {
      await supabaseAdmin.from("notifications").insert({
        user_id: ownerId,
        type: "maintenance_request_status_changed",
        title: "Actualización de solicitud",
        message: `Tu solicitud cambió a: ${humanStatus(nextStatus)}`,
        data: { request_id: updated.id, property_id: updated.property_id, status: nextStatus },
      });
    }

    return json({ ok: true, request: updated, previousStatus, changed: true }, 200);
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

function isValidStatus(value: string): value is Status {
  return ["pending", "in_review", "assigned", "in_progress", "completed", "cancelled"].includes(value);
}

function humanStatus(value: Status) {
  if (value === "pending") return "pendiente";
  if (value === "in_review") return "en revisión";
  if (value === "assigned") return "asignado";
  if (value === "in_progress") return "en progreso";
  if (value === "completed") return "completado";
  return "cancelado";
}

