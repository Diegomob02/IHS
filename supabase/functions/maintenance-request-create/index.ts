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

type Payload = {
  propertyId?: unknown;
  services?: unknown;
  description?: unknown;
  urgency?: unknown;
  preferredDate?: unknown;
  budgetEstimated?: unknown;
};

type Priority = "low" | "medium" | "high" | "urgent";

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

    const payload = (await req.json().catch(() => ({}))) as Payload;
    const propertyId = String(payload?.propertyId ?? "").trim();
    const description = normalizeText(payload?.description);
    const urgency = String(payload?.urgency ?? "").trim();
    const preferredDate = normalizeDate(payload?.preferredDate);
    const budgetEstimated = normalizeBudget(payload?.budgetEstimated);
    const services = normalizeServices(payload?.services);

    if (!propertyId) return json({ ok: false, message: "Missing propertyId" }, 400);
    if (!services.length) return json({ ok: false, message: "Missing services" }, 400);
    if (!description) return json({ ok: false, message: "Missing description" }, 400);
    if (description.length > 2000) return json({ ok: false, message: "Description too long" }, 400);

    const priority = resolvePriority(urgency);
    if (!priority) return json({ ok: false, message: "Invalid urgency" }, 400);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { data: property, error: propertyError } = await supabaseAdmin
      .from("properties")
      .select("id, title, owner_id, owner_email, assigned_admin_id")
      .eq("id", propertyId)
      .single();

    if (propertyError || !property?.id) {
      return json({ ok: false, message: "Property not found" }, 404);
    }

    const userEmail = String(authUser.email ?? "").trim().toLowerCase();
    const ownerEmail = String(property.owner_email ?? "").trim().toLowerCase();
    const isOwner = property.owner_id === authUser.id || (userEmail && ownerEmail && userEmail === ownerEmail);
    if (!isOwner) return json({ ok: false, message: "Forbidden" }, 403);

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("maintenance_requests")
      .insert({
        property_id: propertyId,
        owner_id: authUser.id,
        issue_type: "general",
        description,
        priority,
        status: "pending",
        services,
        preferred_date: preferredDate,
        budget_estimated: budgetEstimated,
      })
      .select(
        "id, property_id, owner_id, issue_type, description, priority, status, services, preferred_date, budget_estimated, created_at, updated_at",
      )
      .single();

    if (insertError || !inserted?.id) {
      return json({ ok: false, message: insertError?.message || "Insert failed" }, 400);
    }

    const recipientIds = new Set<string>();
    if (property.assigned_admin_id) recipientIds.add(String(property.assigned_admin_id));

    const { data: superAdmins } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("role", "super_admin");
    (superAdmins ?? []).forEach((u: any) => u?.id && recipientIds.add(String(u.id)));

    const title = "Nueva solicitud de contratista";
    const message = buildMessage({
      propertyTitle: String(property.title ?? ""),
      services,
      urgency: priority,
    });

    if (recipientIds.size > 0) {
      const rows = Array.from(recipientIds).map((userId) => ({
        user_id: userId,
        type: "maintenance_request_created",
        title,
        message,
        data: {
          request_id: inserted.id,
          property_id: propertyId,
          services,
          priority,
        },
      }));
      await supabaseAdmin.from("notifications").insert(rows);
    }

    return json({ ok: true, request: inserted }, 200);
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

function normalizeText(input: unknown) {
  const s = String(input ?? "").trim();
  return s ? s : null;
}

function normalizeServices(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out = input
    .map((v) => String(v ?? "").trim())
    .filter((v) => v.length > 0)
    .slice(0, 20);
  return Array.from(new Set(out));
}

function normalizeDate(input: unknown): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeBudget(input: unknown): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  return Math.round(n * 100) / 100;
}

function resolvePriority(input: string): Priority | null {
  const s = String(input ?? "").trim().toLowerCase();
  if (["low", "baja"].includes(s)) return "low";
  if (["medium", "media"].includes(s)) return "medium";
  if (["high", "alta"].includes(s)) return "high";
  if (["urgent", "urgente"].includes(s)) return "urgent";
  return null;
}

function buildMessage(opts: { propertyTitle: string; services: string[]; urgency: Priority }) {
  const prop = opts.propertyTitle ? `Propiedad: ${opts.propertyTitle}` : "Propiedad: (sin título)";
  const svc = opts.services.length ? `Servicios: ${opts.services.join(", ")}` : "Servicios: (sin especificar)";
  const urg =
    opts.urgency === "low"
      ? "Urgencia: baja"
      : opts.urgency === "medium"
        ? "Urgencia: media"
        : opts.urgency === "high"
          ? "Urgencia: alta"
          : "Urgencia: urgente";
  return `${prop}\n${svc}\n${urg}`;
}

