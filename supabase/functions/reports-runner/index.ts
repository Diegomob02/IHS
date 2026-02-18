import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cronSecret = (Deno.env.get("CRON_SECRET") ?? "").trim();
const reportWebhookUrl = (Deno.env.get("REPORT_WEBHOOK_URL") ?? Deno.env.get("VITE_REPORT_WEBHOOK_URL") ?? "").trim();
const resendFromEmail = (Deno.env.get("RESEND_FROM_EMAIL") ?? "").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReportScheduleRow = {
  id: string;
  name: string;
  report_key: string;
  property_id: string | null;
  frequency: "daily" | "weekly" | "monthly";
  time_zone: string;
  run_at: string;
  weekday: number | null;
  day_of_month: number | null;
  recipients: string[];
  enabled: boolean;
  config: any;
  created_by: string | null;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing Supabase env" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!cronSecret || (req.headers.get("x-cron-secret") ?? "") !== cronSecret) {
      return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as { batchSize?: unknown };
    const batchSize = clampInt(body?.batchSize, 1, 50) ?? 10;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: schedules, error } = await supabaseAdmin.rpc("dequeue_due_report_schedules", { p_batch_size: batchSize });
    if (error) throw error;

    const rows = (schedules ?? []) as ReportScheduleRow[];
    const summary = { picked: rows.length, success: 0, failed: 0 };

    for (const schedule of rows) {
      const runCtx = await ensureRunRow(supabaseAdmin, schedule);
      if (runCtx.skip) {
        summary.success += 1;
        continue;
      }
      const runId = runCtx.id;
      try {
        if (schedule.report_key === "property_monthly_maintenance") {
          await runPropertyMonthlyMaintenance(supabaseAdmin, schedule, runId);
        } else if (schedule.report_key === "system_kpis") {
          await runSystemKpis(supabaseAdmin, schedule, runId);
        } else {
          throw new Error(`Unsupported report_key: ${schedule.report_key}`);
        }
        summary.success += 1;
      } catch (e: any) {
        await finalizeScheduleFailure(supabaseAdmin, schedule.id, runId, String(e?.message || e || "Unknown error"));
        summary.failed += 1;
      }
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e || "Unknown error") }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function ensureRunRow(supabaseAdmin: ReturnType<typeof createClient>, schedule: ReportScheduleRow) {
  const month = schedule.report_key === "property_monthly_maintenance"
    ? computeMonthString(String(schedule.time_zone || "UTC"), Number(schedule?.config?.month_offset ?? -1))
    : null;

  if (month) {
    const { data: existing } = await supabaseAdmin
      .from("report_runs")
      .select("id, status, finished_at")
      .eq("schedule_id", schedule.id)
      .eq("report_key", schedule.report_key)
      .eq("month", month)
      .in("status", ["running", "success"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const finishedAt = existing.finished_at ? String(existing.finished_at) : null;
      await supabaseAdmin
        .from("report_schedules")
        .update({
          locked_until: null,
          last_run_finished_at: finishedAt,
          last_run_status: existing.status === "success" ? "success" : null,
          last_error: existing.status === "success" ? null : "Run already in progress",
          next_run_at: await computeNextRunAt(supabaseAdmin, schedule.id),
        })
        .eq("id", schedule.id);

      return { id: String(existing.id), skip: true };
    }
  }

  const { data, error } = await supabaseAdmin
    .from("report_runs")
    .insert({
      schedule_id: schedule.id,
      report_key: schedule.report_key,
      property_id: schedule.property_id,
      month,
      status: "running",
      meta: { scheduleName: schedule.name, idempotency: month ? `${schedule.id}:${schedule.report_key}:${month}` : null },
    })
    .select("id")
    .single();
  if (error || !data?.id) throw error || new Error("Failed to create report_run");
  return { id: String(data.id), skip: false };
}

async function finalizeScheduleSuccess(
  supabaseAdmin: ReturnType<typeof createClient>,
  scheduleId: string,
  runId: string,
  details: {
    month?: string;
    outputBucket?: string;
    outputPath?: string;
    outputMime?: string;
    outputBytes?: number;
    emailOutboxIds?: string[];
  },
) {
  const finishedAt = new Date().toISOString();
  await supabaseAdmin
    .from("report_runs")
    .update({
      status: "success",
      finished_at: finishedAt,
      month: details.month ?? null,
      output_bucket: details.outputBucket ?? null,
      output_path: details.outputPath ?? null,
      output_mime: details.outputMime ?? null,
      output_bytes: typeof details.outputBytes === "number" ? details.outputBytes : null,
      email_outbox_ids: (details.emailOutboxIds ?? []) as any,
    })
    .eq("id", runId);

  const nextRunAt = await computeNextRunAt(supabaseAdmin, scheduleId);
  await supabaseAdmin
    .from("report_schedules")
    .update({
      locked_until: null,
      last_run_finished_at: finishedAt,
      last_run_status: "success",
      last_error: null,
      next_run_at: nextRunAt,
    })
    .eq("id", scheduleId);
}

async function finalizeScheduleFailure(
  supabaseAdmin: ReturnType<typeof createClient>,
  scheduleId: string,
  runId: string,
  errorMessage: string,
) {
  const finishedAt = new Date().toISOString();
  await supabaseAdmin
    .from("report_runs")
    .update({ status: "failed", finished_at: finishedAt, error: errorMessage })
    .eq("id", runId);

  const retryMinutes = 30;
  const nextRunAt = new Date(Date.now() + retryMinutes * 60 * 1000).toISOString();
  await supabaseAdmin
    .from("report_schedules")
    .update({
      locked_until: null,
      last_run_finished_at: finishedAt,
      last_run_status: "failed",
      last_error: errorMessage,
      next_run_at: nextRunAt,
    })
    .eq("id", scheduleId);
}

async function computeNextRunAt(supabaseAdmin: ReturnType<typeof createClient>, scheduleId: string) {
  const { data: schedule } = await supabaseAdmin
    .from("report_schedules")
    .select("frequency, time_zone, run_at, weekday, day_of_month")
    .eq("id", scheduleId)
    .single();
  const { data, error } = await supabaseAdmin.rpc("compute_next_report_run", {
    p_frequency: schedule?.frequency,
    p_time_zone: schedule?.time_zone,
    p_run_at: schedule?.run_at,
    p_weekday: schedule?.weekday,
    p_day_of_month: schedule?.day_of_month,
    p_from: new Date().toISOString(),
  });
  if (error) return null;
  return data as any;
}

async function runPropertyMonthlyMaintenance(
  supabaseAdmin: ReturnType<typeof createClient>,
  schedule: ReportScheduleRow,
  runId: string,
) {
  const propertyId = String(schedule.property_id || "").trim();
  if (!propertyId) throw new Error("property_id required for property_monthly_maintenance");
  const tz = String(schedule.time_zone || "UTC");
  const monthOffset = Number(schedule?.config?.month_offset ?? -1);
  const month = computeMonthString(tz, monthOffset);
  const { monthStartDate, nextMonthStartDate } = monthRangeStrings(month);

  const { data: property } = await supabaseAdmin.from("properties").select("id, title, location").eq("id", propertyId).single();
  const propertyTitle = String((property as any)?.title || "Propiedad");

  const { data: logs } = await supabaseAdmin
    .from("maintenance_logs")
    .select("log_date, created_at, content, cost, images")
    .eq("property_id", propertyId)
    .gte("log_date", monthStartDate)
    .lt("log_date", nextMonthStartDate)
    .order("log_date", { ascending: true });

  const { data: docs } = await supabaseAdmin
    .from("documents")
    .select("id, name, type, created_at, current_version")
    .eq("property_id", propertyId)
    .eq("is_archived", false);

  const normalizedLogs = (logs ?? []).map((l: any) => ({
    date: l.log_date || l.created_at,
    content: String(l.content || ""),
    cost: Number(l.cost) || 0,
    images: normalizeImageUrls(l.images),
  }));

  const missingEvidence = normalizedLogs
    .filter((l) => l.cost > 0)
    .filter((l) => !Array.isArray(l.images) || l.images.length === 0);

  if (missingEvidence.length) {
    const sample = missingEvidence.slice(0, 10).map((l) => ({ date: l.date, cost: l.cost, content: l.content.slice(0, 120) }));
    await supabaseAdmin.from("report_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error: `Missing evidence images for ${missingEvidence.length} expense logs`,
      meta: { sampleMissingEvidence: sample },
    }).eq("id", runId);
    await notifySuperadmins(supabaseAdmin, {
      title: `Reporte bloqueado por evidencias (${month})`,
      message: `Faltan imágenes de comprobante en ${missingEvidence.length} gastos. No se generó/archivó el reporte.`,
      link: "/admin?tab=overview",
      details: { report_run_id: runId, property_id: propertyId, month, sample },
    });
    await insertAuditLog(supabaseAdmin, {
      action: "report_validation_failed",
      entity_type: "report_run",
      entity_id: runId,
      details: { property_id: propertyId, month, missing_count: missingEvidence.length, sample },
    });
    throw new Error(`Validación fallida: faltan imágenes de comprobante en ${missingEvidence.length} gastos`);
  }

  const monthDocs = (docs ?? []).filter((d: any) => {
    const createdAt = d?.created_at ? new Date(d.created_at) : null;
    if (!createdAt) return false;
    const start = new Date(`${monthStartDate}T00:00:00.000Z`);
    const end = new Date(`${nextMonthStartDate}T00:00:00.000Z`);
    return createdAt >= start && createdAt < end;
  });
  const invoiceDocs = monthDocs.filter((d: any) => String(d.type || "") === "invoice");
  const invoiceAttachments = await signInvoiceAttachments(supabaseAdmin, invoiceDocs);

  const totalCost = normalizedLogs.reduce((sum: number, l) => sum + (Number(l?.cost) || 0), 0);
  const analysis = buildExpenseAnalysis(normalizedLogs, tz, schedule?.config);
  const additionalNotes = String(schedule?.config?.additional_notes ?? "");

  const dataset = {
    property: {
      id: propertyId,
      title: propertyTitle,
      location: String((property as any)?.location || ""),
    },
    period: { month, from: monthStartDate, to: nextMonthStartDate, timeZone: tz },
    expenses: normalizedLogs,
    invoices: invoiceAttachments,
    documents: monthDocs.map((d: any) => ({ id: d.id, name: d.name, type: d.type, created_at: d.created_at })),
    additionalNotes,
    totals: { totalCost },
    analysis,
    image_hints: { max_width_px: 1200, jpeg_quality: 0.78 },
  };

  const datasetUpload = await uploadReportDataset(supabaseAdmin, propertyId, month, dataset);
  const payload = {
    propertyId,
    month,
    totalCost,
    analysis,
    additionalNotes,
    datasetUrl: datasetUpload.signedUrl,
  };

  const pdfBytes = await generatePdfBytes(payload);
  const outputBucket = "documents";
  const outputPath = `${propertyId}/reports/${month}.pdf`;
  const uploadRes = await supabaseAdmin.storage.from(outputBucket).upload(outputPath, pdfBytes, {
    upsert: true,
    contentType: "application/pdf",
  });
  if (uploadRes.error) throw uploadRes.error;

  const docId = await upsertReportDocument(supabaseAdmin, {
    propertyId,
    name: `Reporte Mensual ${month}`,
    createdBy: schedule.created_by,
    filePath: outputPath,
    bytes: pdfBytes.byteLength,
  });

  const signed = await supabaseAdmin.storage.from(outputBucket).createSignedUrl(outputPath, 7 * 24 * 60 * 60);
  const signedUrl = signed?.data?.signedUrl ? String(signed.data.signedUrl) : "";

  const subject = String(schedule?.config?.email_subject || `Reporte mensual ${month} - ${propertyTitle}`);
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
      <h2>${escapeHtml(subject)}</h2>
      <p>Propiedad: ${escapeHtml(propertyTitle)} (${escapeHtml(String((property as any)?.location || ""))})</p>
      <p>Total de gastos del periodo: <b>${escapeHtml(String(totalCost))}</b></p>
      ${signedUrl ? `<p><a href="${signedUrl}">Descargar reporte (PDF)</a></p>` : ""}
      <p style="color:#64748b;font-size:12px;">Este correo fue enviado automáticamente.</p>
    </div>
  `;

  const emailOutboxIds: string[] = [];
  const recipients = normalizeRecipients(schedule.recipients);
  for (const toEmail of recipients) {
    const { data: enq, error: enqErr } = await supabaseAdmin
      .from("email_outbox")
      .insert({
        status: "pending",
        priority: 15,
        to_email: toEmail,
        subject,
        html,
        from_email: resendFromEmail || null,
        attachments: signedUrl ? [{ filename: `reporte_${month}.pdf`, path: signedUrl }] : null,
        template_key: "report_ready",
        template_vars: { month, propertyTitle, totalCost: String(totalCost) },
        metadata: { report_run_id: runId, document_id: docId, schedule_id: schedule.id, dataset_path: datasetUpload.path },
      })
      .select("id")
      .single();
    if (!enqErr && enq?.id) emailOutboxIds.push(String(enq.id));
  }

  await supabaseAdmin.from("report_runs").update({
    executive_summary: {
      month,
      propertyTitle,
      totalCost,
      categories: analysis.categories,
      anomalies: analysis.anomalies,
      invoicesCount: invoiceAttachments.length,
      expensesCount: normalizedLogs.length,
    },
    meta: {
      scheduleName: schedule.name,
      dataset_path: datasetUpload.path,
      dataset_bucket: datasetUpload.bucket,
    },
  }).eq("id", runId);

  await insertAuditLog(supabaseAdmin, {
    action: "report_generated",
    entity_type: "report_run",
    entity_id: runId,
    details: { property_id: propertyId, month, totalCost, expensesCount: normalizedLogs.length, invoicesCount: invoiceAttachments.length },
  });

  await finalizeScheduleSuccess(supabaseAdmin, schedule.id, runId, {
    month,
    outputBucket,
    outputPath,
    outputMime: "application/pdf",
    outputBytes: pdfBytes.byteLength,
    emailOutboxIds,
  });

  await insertAuditLog(supabaseAdmin, {
    action: "report_email_enqueued",
    entity_type: "report_run",
    entity_id: runId,
    details: { property_id: propertyId, month, email_outbox_ids: emailOutboxIds },
  });
}

async function runSystemKpis(supabaseAdmin: ReturnType<typeof createClient>, schedule: ReportScheduleRow, runId: string) {
  const sinceDays = clampInt(schedule?.config?.since_days, 1, 365) ?? 7;
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

  const [{ count: leads }, { count: contractors }, { count: requests }] = await Promise.all([
    supabaseAdmin.from("leads").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabaseAdmin.from("contractor_applications").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabaseAdmin.from("maintenance_requests").select("id", { count: "exact", head: true }).gte("created_at", since),
  ]);

  const subject = String(schedule?.config?.email_subject || `Reporte ${sinceDays} días - Resumen del sistema`);
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
      <h2>${escapeHtml(subject)}</h2>
      <ul>
        <li>Leads nuevos: <b>${escapeHtml(String(leads || 0))}</b></li>
        <li>Aplicaciones de contratistas: <b>${escapeHtml(String(contractors || 0))}</b></li>
        <li>Solicitudes de mantenimiento: <b>${escapeHtml(String(requests || 0))}</b></li>
      </ul>
      <p style="color:#64748b;font-size:12px;">Este correo fue enviado automáticamente.</p>
    </div>
  `;

  const emailOutboxIds: string[] = [];
  const recipients = normalizeRecipients(schedule.recipients);
  for (const toEmail of recipients) {
    const { data: enq } = await supabaseAdmin
      .from("email_outbox")
      .insert({
        status: "pending",
        priority: 10,
        to_email: toEmail,
        subject,
        html,
        from_email: resendFromEmail || null,
        template_key: "system_kpis",
        template_vars: { sinceDays: String(sinceDays), leads: String(leads || 0), contractors: String(contractors || 0), requests: String(requests || 0) },
        metadata: { report_run_id: runId, schedule_id: schedule.id },
      })
      .select("id")
      .single();
    if (enq?.id) emailOutboxIds.push(String(enq.id));
  }

  await finalizeScheduleSuccess(supabaseAdmin, schedule.id, runId, { emailOutboxIds });
}

async function generatePdfBytes(payload: any) {
  if (!reportWebhookUrl) {
    const base64 = "JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmogICUgcGFnZXMKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqICAlIHBhZ2UgMQo8PAogIC9UeXBlIC9QYWdlCiAgL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDEyMyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE1MAolJUVPRgo=";
    return base64ToBytes(base64);
  }

  const res = await fetch(reportWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const contentType = String(res.headers.get("content-type") || "");
  if (contentType.includes("application/pdf")) {
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  }

  const text = await res.text();
  const json = safeJsonParse(text);
  const pdfUrl = String((json as any)?.pdfUrl || (json as any)?.url || "").trim();
  if (!pdfUrl) throw new Error("Webhook response missing pdfUrl");

  if (pdfUrl.startsWith("data:application/pdf;base64,")) {
    const b64 = pdfUrl.split(",")[1] || "";
    return base64ToBytes(b64);
  }

  if (pdfUrl.startsWith("http://") || pdfUrl.startsWith("https://")) {
    const pdfRes = await fetch(pdfUrl);
    const ab = await pdfRes.arrayBuffer();
    return new Uint8Array(ab);
  }

  throw new Error("Unsupported pdfUrl format");
}

async function upsertReportDocument(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: { propertyId: string; name: string; createdBy: string | null; filePath: string; bytes: number },
) {
  const { data: existing } = await supabaseAdmin
    .from("documents")
    .select("id, current_version")
    .eq("property_id", input.propertyId)
    .eq("type", "report")
    .eq("name", input.name)
    .maybeSingle();

  if (existing?.id) {
    const nextVersion = Number(existing.current_version || 1) + 1;
    await supabaseAdmin.from("documents").update({ current_version: nextVersion, updated_at: new Date().toISOString() }).eq("id", existing.id);
    await supabaseAdmin.from("document_versions").insert({
      document_id: existing.id,
      version_number: nextVersion,
      file_path: input.filePath,
      file_size: input.bytes,
      mime_type: "application/pdf",
      uploaded_by: input.createdBy,
      change_log: "Auto-generated report",
    });
    return String(existing.id);
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from("documents")
    .insert({
      property_id: input.propertyId,
      name: input.name,
      type: "report",
      current_version: 1,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (docErr || !doc?.id) throw docErr || new Error("Failed to create document");

  await supabaseAdmin.from("document_versions").insert({
    document_id: doc.id,
    version_number: 1,
    file_path: input.filePath,
    file_size: input.bytes,
    mime_type: "application/pdf",
    uploaded_by: input.createdBy,
    change_log: "Auto-generated report",
  });

  return String(doc.id);
}

function normalizeRecipients(value: unknown) {
  const arr = Array.isArray(value) ? value : [];
  const cleaned = arr
    .map((e) => String(e || "").trim().toLowerCase())
    .filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return Array.from(new Set(cleaned));
}

function normalizeImageUrls(value: unknown) {
  const arr = Array.isArray(value) ? value : [];
  const cleaned = arr
    .map((u) => String(u || "").trim())
    .filter((u) => u && (u.startsWith("http://") || u.startsWith("https://")));
  return cleaned;
}

async function signInvoiceAttachments(supabaseAdmin: ReturnType<typeof createClient>, invoiceDocs: any[]) {
  if (!invoiceDocs.length) return [];
  const docIds = invoiceDocs.map((d) => d.id).filter(Boolean);
  const { data: versions } = await supabaseAdmin
    .from("document_versions")
    .select("document_id, version_number, file_path, mime_type, file_size")
    .in("document_id", docIds)
    .order("version_number", { ascending: false });

  const latestByDoc = new Map<string, any>();
  for (const v of versions ?? []) {
    const id = String((v as any).document_id || "");
    if (!id) continue;
    if (!latestByDoc.has(id)) latestByDoc.set(id, v);
  }

  const out: any[] = [];
  for (const d of invoiceDocs) {
    const id = String(d.id || "");
    const v = latestByDoc.get(id);
    const filePath = v?.file_path ? String(v.file_path) : "";
    if (!filePath) continue;
    const signed = await supabaseAdmin.storage.from("documents").createSignedUrl(filePath, 7 * 24 * 60 * 60);
    const url = signed?.data?.signedUrl ? String(signed.data.signedUrl) : "";
    if (!url) continue;
    out.push({
      document_id: id,
      name: String(d.name || ""),
      url,
      mime_type: String(v?.mime_type || ""),
      file_size: Number(v?.file_size || 0) || null,
    });
  }
  return out;
}

async function uploadReportDataset(supabaseAdmin: ReturnType<typeof createClient>, propertyId: string, month: string, dataset: any) {
  const bucket = "documents";
  const path = `${propertyId}/reports/${month}.dataset.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(dataset));
  const upload = await supabaseAdmin.storage.from(bucket).upload(path, bytes, { upsert: true, contentType: "application/json" });
  if (upload.error) throw upload.error;
  const signed = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 60 * 60);
  const signedUrl = signed?.data?.signedUrl ? String(signed.data.signedUrl) : "";
  if (!signedUrl) throw new Error("Failed to sign dataset url");
  return { bucket, path, signedUrl, bytes: bytes.byteLength };
}

function buildExpenseAnalysis(expenses: Array<{ date: any; cost: number; content: string; images: string[] }>, timeZone: string, config: any) {
  const daily = new Map<string, number>();
  for (const e of expenses) {
    const d = e?.date ? new Date(e.date) : null;
    if (!d || !Number.isFinite(d.getTime())) continue;
    const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    daily.set(key, (daily.get(key) ?? 0) + (Number(e.cost) || 0));
  }

  const dailyTotals = Array.from(daily.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, total]) => ({ date, total }));

  const totals = dailyTotals.map((d) => d.total);
  const mean = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const variance = totals.length ? totals.reduce((a, b) => a + (b - mean) ** 2, 0) / totals.length : 0;
  const std = Math.sqrt(variance);
  const anomalies = dailyTotals
    .filter((d) => std > 0 && (d.total - mean) / std >= 3)
    .map((d) => ({ date: d.date, total: d.total, score: std > 0 ? (d.total - mean) / std : null }));

  const categoryKeywords = (config?.category_keywords ?? {}) as Record<string, unknown>;
  const categories: Record<string, number> = {};
  for (const e of expenses) {
    const text = String(e.content || "").toLowerCase();
    let matched = false;
    for (const [cat, words] of Object.entries(categoryKeywords)) {
      const list = Array.isArray(words) ? words : [];
      if (list.some((w) => text.includes(String(w).toLowerCase()))) {
        categories[cat] = (categories[cat] ?? 0) + (Number(e.cost) || 0);
        matched = true;
        break;
      }
    }
    if (!matched) {
      categories["otros"] = (categories["otros"] ?? 0) + (Number(e.cost) || 0);
    }
  }

  return { dailyTotals, categories, anomalies, stats: { mean, std } };
}

function computeMonthString(timeZone: string, monthOffset: number) {
  const now = new Date();
  const local = utcToZonedParts(now, timeZone);
  const base = new Date(Date.UTC(local.y, local.m - 1, 1, 12, 0, 0));
  base.setUTCMonth(base.getUTCMonth() + monthOffset);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function monthRangeStrings(month: string) {
  const [yStr, mStr] = month.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  next.setUTCMonth(next.getUTCMonth() + 1);
  const y2 = next.getUTCFullYear();
  const m2 = next.getUTCMonth() + 1;
  const nextStart = `${y2}-${String(m2).padStart(2, "0")}-01`;
  return { monthStartDate: start, nextMonthStartDate: nextStart };
}

function utcToZonedParts(d: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.format(d).split("-");
  return { y: Number(parts[0]), m: Number(parts[1]), day: Number(parts[2]) };
}

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function safeJsonParse(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function escapeHtml(input: string) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clampInt(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
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
      type: "warning",
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
