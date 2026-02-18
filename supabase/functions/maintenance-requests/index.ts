import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const normalizeBearer = (h: string) => {
  const s = (h ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("bearer ")) return s;
  return `Bearer ${s}`;
};

type Query = {
  propertyId?: string | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!["GET", "POST"].includes(req.method)) return json({ ok: false, message: "Method not allowed" }, 405);
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

    const q = await parseQuery(req);

    const pageSize = clampInt(q.pageSize ?? 10, 1, 50);
    const page = clampInt(q.page ?? 1, 1, 10_000);
    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize - 1;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("id, role")
      .eq("id", authUser.id)
      .single();
    const role = String(profile?.role || "");

    let query = supabaseAdmin
      .from("maintenance_requests")
      .select(
        "id, property_id, owner_id, issue_type, description, priority, status, services, preferred_date, budget_estimated, created_at, updated_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (q.propertyId) query = query.eq("property_id", q.propertyId);
    if (q.status) query = query.eq("status", q.status);
    if (q.from) query = query.gte("created_at", q.from);
    if (q.to) query = query.lte("created_at", q.to);

    if (role === "owner" || !role) {
      query = query.eq("owner_id", authUser.id);
    } else if (role === "admin") {
      const { data: props } = await supabaseAdmin
        .from("properties")
        .select("id")
        .eq("assigned_admin_id", authUser.id);
      const ids = (props ?? []).map((p: any) => p.id).filter(Boolean);
      if (ids.length === 0) {
        return json({ ok: true, data: [], page, pageSize, total: 0 }, 200);
      }
      query = query.in("property_id", ids);
    } else if (role === "super_admin") {
      // no extra filter
    } else {
      return json({ ok: false, message: "Forbidden" }, 403);
    }

    const { data, error, count } = await query.range(fromIdx, toIdx);
    if (error) return json({ ok: false, message: error.message }, 400);

    return json({ ok: true, data: data ?? [], page, pageSize, total: count ?? 0 }, 200);
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

async function parseQuery(req: Request): Promise<Query> {
  if (req.method === "GET") {
    const url = new URL(req.url);
    return {
      propertyId: url.searchParams.get("propertyId"),
      status: url.searchParams.get("status"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      page: url.searchParams.get("page") ? Number(url.searchParams.get("page")) : undefined,
      pageSize: url.searchParams.get("pageSize") ? Number(url.searchParams.get("pageSize")) : undefined,
    };
  }

  const payload = (await req.json().catch(() => ({}))) as any;
  return {
    propertyId: payload?.propertyId ? String(payload.propertyId).trim() : null,
    status: payload?.status ? String(payload.status).trim() : null,
    from: payload?.from ? String(payload.from).trim() : null,
    to: payload?.to ? String(payload.to).trim() : null,
    page: payload?.page ? Number(payload.page) : undefined,
    pageSize: payload?.pageSize ? Number(payload.pageSize) : undefined,
  };
}

function clampInt(v: number, min: number, max: number) {
  const n = Number.isFinite(v) ? Math.floor(v) : min;
  return Math.max(min, Math.min(max, n));
}

