import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cronSecret = (Deno.env.get("CRON_SECRET") ?? "").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PostprocessRow = {
  id: string;
  report_key: string;
  property_id: string | null;
  month: string | null;
  email_outbox_ids: string[];
  executive_summary: any;
  archive_attempts: number;
  archived_at: string | null;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  try {
    if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, error: "Missing Supabase env" }, 500);
    if (!cronSecret || (req.headers.get("x-cron-secret") ?? "") !== cronSecret) return json({ ok: false, error: "Forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as { batchSize?: unknown };
    const batchSize = clampInt(body?.batchSize, 1, 50) ?? 10;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: runs, error } = await supabaseAdmin.rpc("dequeue_report_runs_for_archival", { p_batch_size: batchSize });
    if (error) throw error;

    const rows = (runs ?? []) as PostprocessRow[];
    const summary = { picked: rows.length, archived: 0, skipped: 0, failed: 0 };

    for (const run of rows) {
      try {
        const ready = await emailsAllSent(supabaseAdmin, run.email_outbox_ids);
        if (!ready) {
          await releaseLock(supabaseAdmin, run.id);
          summary.skipped += 1;
          continue;
        }

        if (run.report_key !== "property_monthly_maintenance") {
          await markArchived(supabaseAdmin, run.id, { ok: true, note: "No archival needed for this report_key" }, run.executive_summary);
          summary.archived += 1;
          continue;
        }

        const propertyId = String(run.property_id || "").trim();
        const month = String(run.month || "").trim();
        if (!propertyId || !month) throw new Error("Missing property_id/month for archival");

        const range = monthToDateRange(month);
        const { data: archiveRes, error: archiveErr } = await supabaseAdmin.rpc("archive_maintenance_logs_for_report", {
          p_property_id: propertyId,
          p_from_date: range.from,
          p_to_date: range.to,
          p_report_run_id: run.id,
        });
        if (archiveErr) throw archiveErr;

        const exec = mergeExecutive(run.executive_summary, { archived: archiveRes });
        await markArchived(supabaseAdmin, run.id, archiveRes, exec);
        await notifySuperadmins(supabaseAdmin, {
          title: `Reporte archivado (${month})`,
          message: `Se archivaron gastos del reporte mensual (${month}) para la propiedad ${propertyId}.`,
          link: "/admin?tab=overview",
          details: { report_run_id: run.id, archive: archiveRes },
        });
        await insertAuditLog(supabaseAdmin, {
          action: "report_archived",
          entity_type: "report_run",
          entity_id: run.id,
          details: { archive: archiveRes, report_key: run.report_key, property_id: propertyId, month },
        });

        summary.archived += 1;
      } catch (e: any) {
        await supabaseAdmin
          .from("report_runs")
          .update({ archive_result: { ok: false, error: String(e?.message || e || "Unknown error") }, archive_locked_until: null })
          .eq("id", run.id);
        await notifySuperadmins(supabaseAdmin, {
          title: "Fallo archivando reporte",
          message: `No se pudo archivar un reporte (run ${run.id}).`,
          link: "/admin?tab=overview",
          details: { report_run_id: run.id, error: String(e?.message || e || "Unknown error") },
        });
        summary.failed += 1;
      }
    }

    return json({ ok: true, summary }, 200);
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e || "Unknown error") }, 500);
  }
});

async function emailsAllSent(supabaseAdmin: ReturnType<typeof createClient>, emailOutboxIds: unknown) {
  const ids = Array.isArray(emailOutboxIds) ? emailOutboxIds.map((i) => String(i)).filter(Boolean) : [];
  if (!ids.length) return true;

  const { data, error } = await supabaseAdmin.from("email_outbox").select("id, status").in("id", ids);
  if (error) throw error;
  const byId = new Map<string, string>();
  for (const r of data ?? []) byId.set(String((r as any).id), String((r as any).status));
  return ids.every((id) => byId.get(id) === "sent");
}

function monthToDateRange(month: string) {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) throw new Error("Invalid month");
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  next.setUTCMonth(next.getUTCMonth() + 1);
  const y2 = next.getUTCFullYear();
  const m2 = next.getUTCMonth() + 1;
  const to = `${y2}-${String(m2).padStart(2, "0")}-01`;
  return { from, to };
}

function mergeExecutive(existing: any, add: any) {
  const base = existing && typeof existing === "object" ? existing : {};
  return { ...base, ...add };
}

async function markArchived(supabaseAdmin: ReturnType<typeof createClient>, runId: string, archiveResult: any, executiveSummary: any) {
  await supabaseAdmin
    .from("report_runs")
    .update({
      archived_at: new Date().toISOString(),
      archive_result: archiveResult,
      executive_summary: executiveSummary,
      archive_locked_until: null,
    })
    .eq("id", runId)
    .is("archived_at", null);
}

async function releaseLock(supabaseAdmin: ReturnType<typeof createClient>, runId: string) {
  await supabaseAdmin.from("report_runs").update({ archive_locked_until: null }).eq("id", runId).is("archived_at", null);
}

async function notifySuperadmins(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: { title: string; message: string; link: string; details: any },
) {
  const { data: supers } = await supabaseAdmin.from("users").select("id").eq("role", "super_admin");
  const ids = (supers ?? []).map((u: any) => u.id).filter(Boolean);
  if (!ids.length) return;
  await supabaseAdmin.from("notifications").insert(
    ids.map((id: string) => ({
      user_id: id,
      title: input.title,
      message: input.message,
      type: "info",
      link: input.link,
      details: input.details,
    })),
  );
}

async function insertAuditLog(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: { action: string; entity_type: string; entity_id: string; details: any },
) {
  await supabaseAdmin.from("audit_logs").insert({
    user_id: null,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    details: input.details,
    ip_address: null,
  });
}

function clampInt(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
