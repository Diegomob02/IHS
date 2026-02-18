import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const reportWebhookUrl = (Deno.env.get("REPORT_WEBHOOK_URL") ?? Deno.env.get("VITE_REPORT_WEBHOOK_URL") ?? "").trim();
const resendFromEmail = (Deno.env.get("RESEND_FROM_EMAIL") ?? "").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload =
  | {
      action?: unknown;
      propertyId?: unknown;
      month?: unknown;
      additionalNotes?: unknown;
      recipients?: unknown;
    }
  | {
      action?: unknown;
      reportRunId?: unknown;
      recipients?: unknown;
    };

const normalizeBearer = (h: string) => {
  const s = (h ?? "").trim();
  if (!s) return "";
  if (s.toLowerCase().startsWith("bearer ")) return s;
  return `Bearer ${s}`;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return json({ ok: false, message: "Missing Supabase env" }, 500);

    const authHeader = normalizeBearer(req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await supabaseAuth.auth.getUser();
    const authUser = userData.user;
    if (!authUser?.id) return json({ ok: false, message: "Unauthorized" }, 401);

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await supabaseAdmin.from("users").select("id, role").eq("id", authUser.id).single();
    const role = String(profile?.role || "");
    if (!role || !["admin", "super_admin"].includes(role)) return json({ ok: false, message: "Forbidden" }, 403);

    const body = (await req.json().catch(() => ({}))) as Payload;
    const action = String((body as any)?.action || "generate");

    if (action === "send") {
      const reportRunId = String((body as any)?.reportRunId || "").trim();
      if (!reportRunId) return json({ ok: false, message: "Missing reportRunId" }, 400);
      const recipients = normalizeRecipients((body as any)?.recipients);
      const res = await enqueueEmailForExistingRun(supabaseAdmin, reportRunId, recipients);
      await insertAuditLog(supabaseAdmin, {
        userId: authUser.id,
        action: "report_manual_send_enqueued",
        entityType: "report_run",
        entityId: reportRunId,
        details: { email_outbox_ids: res.emailOutboxIds },
      });
      return json({ ok: true, ...res }, 200);
    }

    const propertyId = String((body as any)?.propertyId || "").trim();
    const month = normalizeMonth((body as any)?.month) ?? new Date().toISOString().slice(0, 7);
    const additionalNotes = String((body as any)?.additionalNotes || "").trim();
    const recipients = normalizeRecipients((body as any)?.recipients);
    if (!propertyId) return json({ ok: false, message: "Missing propertyId" }, 400);

    const run = await createManualRun(supabaseAdmin, { propertyId, month, userId: authUser.id });
    const dataset = await buildDataset(supabaseAdmin, { propertyId, month, additionalNotes, runId: run.id });
    const datasetUpload = await uploadReportDataset(supabaseAdmin, propertyId, month, dataset);

    const payloadForWebhook = {
      propertyId,
      month,
      totalCost: dataset.totals.totalCost,
      analysis: dataset.analysis,
      additionalNotes,
      datasetUrl: datasetUpload.signedUrl,
    };

    const pdfBytes = await generatePdfBytes(payloadForWebhook);
    const outputBucket = "documents";
    const outputPath = `${propertyId}/reports/${month}.pdf`;
    const uploadRes = await supabaseAdmin.storage.from(outputBucket).upload(outputPath, pdfBytes, { upsert: true, contentType: "application/pdf" });
    if (uploadRes.error) throw uploadRes.error;

    const docId = await upsertReportDocument(supabaseAdmin, {
      propertyId,
      name: `Reporte Mensual ${month}`,
      createdBy: authUser.id,
      filePath: outputPath,
      bytes: pdfBytes.byteLength,
    });

    const signedPdf = await supabaseAdmin.storage.from(outputBucket).createSignedUrl(outputPath, 60 * 60);
    const signedUrl = signedPdf?.data?.signedUrl ? String(signedPdf.data.signedUrl) : "";
    if (!signedUrl) throw new Error("Failed to sign pdf");

    const exec = {
      month,
      propertyTitle: dataset.property.title,
      totalCost: dataset.totals.totalCost,
      categories: dataset.analysis.categories,
      anomalies: dataset.analysis.anomalies,
      invoicesCount: dataset.invoices.length,
      expensesCount: dataset.expenses.length,
    };

    await supabaseAdmin
      .from("report_runs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        output_bucket: outputBucket,
        output_path: outputPath,
        output_mime: "application/pdf",
        output_bytes: pdfBytes.byteLength,
        executive_summary: exec,
        meta: { dataset_bucket: datasetUpload.bucket, dataset_path: datasetUpload.path, mode: "manual" },
      })
      .eq("id", run.id);

    await insertAuditLog(supabaseAdmin, {
      userId: authUser.id,
      action: "report_manual_generated",
      entityType: "report_run",
      entityId: run.id,
      details: { property_id: propertyId, month, document_id: docId, dataset_path: datasetUpload.path },
    });

    return json(
      {
        ok: true,
        reportRunId: run.id,
        month,
        pdfSignedUrl: signedUrl,
        documentId: docId,
        datasetPath: datasetUpload.path,
        recipientsSuggested: recipients.length ? recipients : dataset.property.owner_email ? [dataset.property.owner_email] : [],
      },
      200,
    );
  } catch (e: any) {
    return json({ ok: false, message: String(e?.message || e || "Unknown error") }, 500);
  }
});

async function createManualRun(supabaseAdmin: ReturnType<typeof createClient>, input: { propertyId: string; month: string; userId: string }) {
  const { data, error } = await supabaseAdmin
    .from("report_runs")
    .insert({
      schedule_id: null,
      report_key: "property_monthly_maintenance",
      property_id: input.propertyId,
      month: input.month,
      status: "running",
      meta: { mode: "manual", requested_by: input.userId },
    })
    .select("id")
    .single();
  if (error || !data?.id) throw error || new Error("Failed to create report_run");
  return { id: String(data.id) };
}

async function buildDataset(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: { propertyId: string; month: string; additionalNotes: string; runId: string },
) {
  const range = monthToDateRange(input.month);

  const { data: property } = await supabaseAdmin
    .from("properties")
    .select("id, title, location, owner_email")
    .eq("id", input.propertyId)
    .single();

  const { data: logs } = await supabaseAdmin
    .from("maintenance_logs")
    .select("log_date, created_at, content, cost, images")
    .eq("property_id", input.propertyId)
    .gte("log_date", range.from)
    .lt("log_date", range.to)
    .order("log_date", { ascending: true });

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
      meta: { sampleMissingEvidence: sample, mode: "manual" },
    }).eq("id", input.runId);
    throw new Error(`Validación fallida: faltan imágenes de comprobante en ${missingEvidence.length} gastos`);
  }

  const { data: docs } = await supabaseAdmin
    .from("documents")
    .select("id, name, type, created_at, current_version")
    .eq("property_id", input.propertyId)
    .eq("is_archived", false);

  const monthDocs = (docs ?? []).filter((d: any) => {
    const createdAt = d?.created_at ? new Date(d.created_at) : null;
    if (!createdAt) return false;
    const start = new Date(`${range.from}T00:00:00.000Z`);
    const end = new Date(`${range.to}T00:00:00.000Z`);
    return createdAt >= start && createdAt < end;
  });
  const invoiceDocs = monthDocs.filter((d: any) => String(d.type || "") === "invoice");
  const invoiceAttachments = await signInvoiceAttachments(supabaseAdmin, invoiceDocs);

  const totalCost = normalizedLogs.reduce((sum: number, l) => sum + (Number(l?.cost) || 0), 0);
  const analysis = buildExpenseAnalysis(normalizedLogs, "UTC", {});

  return {
    property: {
      id: input.propertyId,
      title: String((property as any)?.title || "Propiedad"),
      location: String((property as any)?.location || ""),
      owner_email: String((property as any)?.owner_email || "").trim().toLowerCase() || null,
    },
    period: { month: input.month, from: range.from, to: range.to, timeZone: "UTC" },
    expenses: normalizedLogs,
    invoices: invoiceAttachments,
    documents: monthDocs.map((d: any) => ({ id: d.id, name: d.name, type: d.type, created_at: d.created_at })),
    additionalNotes: input.additionalNotes,
    totals: { totalCost },
    analysis,
    image_hints: { max_width_px: 1200, jpeg_quality: 0.78 },
  };
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

async function enqueueEmailForExistingRun(
  supabaseAdmin: ReturnType<typeof createClient>,
  reportRunId: string,
  recipientsOverride: string[],
) {
  const { data: run, error: runErr } = await supabaseAdmin
    .from("report_runs")
    .select("id, property_id, month, output_bucket, output_path, executive_summary")
    .eq("id", reportRunId)
    .single();
  if (runErr || !run?.id) throw runErr || new Error("Report run not found");

  const propertyId = String((run as any)?.property_id || "").trim();
  const month = String((run as any)?.month || "").trim();
  const outputBucket = String((run as any)?.output_bucket || "documents");
  const outputPath = String((run as any)?.output_path || "").trim();
  if (!propertyId || !month || !outputPath) throw new Error("Report output not ready");

  const { data: property } = await supabaseAdmin.from("properties").select("title, location, owner_email").eq("id", propertyId).single();
  const propertyTitle = String((property as any)?.title || "Propiedad");
  const ownerEmail = String((property as any)?.owner_email || "").trim().toLowerCase();

  const recipients = recipientsOverride.length ? recipientsOverride : ownerEmail ? [ownerEmail] : [];
  if (!recipients.length) throw new Error("No recipients available");
  if (!resendFromEmail) throw new Error("Missing RESEND_FROM_EMAIL");

  const signed = await supabaseAdmin.storage.from(outputBucket).createSignedUrl(outputPath, 7 * 24 * 60 * 60);
  const signedUrl = signed?.data?.signedUrl ? String(signed.data.signedUrl) : "";
  if (!signedUrl) throw new Error("Failed to sign pdf");

  const totalCost = Number((run as any)?.executive_summary?.totalCost || 0) || 0;
  const subject = `Reporte mensual ${month} - ${propertyTitle}`;
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;">
      <h2>${escapeHtml(subject)}</h2>
      <p>Propiedad: ${escapeHtml(propertyTitle)} (${escapeHtml(String((property as any)?.location || ""))})</p>
      <p>Total de gastos del periodo: <b>${escapeHtml(String(totalCost))}</b></p>
      <p><a href="${signedUrl}">Descargar reporte (PDF)</a></p>
      <p style="color:#64748b;font-size:12px;">Este correo fue enviado automáticamente.</p>
    </div>
  `;

  const emailOutboxIds: string[] = [];
  for (const toEmail of normalizeRecipients(recipients)) {
    const { data: enq, error: enqErr } = await supabaseAdmin
      .from("email_outbox")
      .insert({
        idempotency_key: `report:${reportRunId}:${toEmail}`,
        status: "pending",
        priority: 15,
        to_email: toEmail,
        subject,
        html,
        from_email: resendFromEmail || null,
        attachments: [{ filename: `reporte_${month}.pdf`, path: signedUrl }],
        template_key: "report_ready",
        template_vars: { month, propertyTitle, totalCost: String(totalCost) },
        metadata: { report_run_id: reportRunId, property_id: propertyId, month },
      })
      .select("id")
      .single();
    if (!enqErr && enq?.id) emailOutboxIds.push(String(enq.id));
  }

  await supabaseAdmin.from("report_runs").update({ email_outbox_ids: (emailOutboxIds as any) }).eq("id", reportRunId);
  return { emailOutboxIds, pdfSignedUrl: signedUrl };
}

async function generatePdfBytes(payload: any) {
  if (!reportWebhookUrl) {
    const base64 =
      "JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmogICUgcGFnZXMKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqICAlIHBhZ2UgMQo8PAogIC9UeXBlIC9QYWdlCiAgL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNjAgMDAwMDAgbiAKMDAwMDAwMDEyMyAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE1MAolJUVPRgo=";
    return base64ToBytes(base64);
  }

  const res = await fetchWithRetry(
    reportWebhookUrl,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
    { maxAttempts: 3 },
  );
  const contentType = String(res.headers.get("content-type") || "");
  if (contentType.includes("application/pdf")) return new Uint8Array(await res.arrayBuffer());

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
    return new Uint8Array(await pdfRes.arrayBuffer());
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
    const nextVersion = Number((existing as any).current_version || 1) + 1;
    await supabaseAdmin.from("documents").update({ current_version: nextVersion, updated_at: new Date().toISOString() }).eq("id", existing.id);
    await supabaseAdmin.from("document_versions").insert({
      document_id: existing.id,
      version_number: nextVersion,
      file_path: input.filePath,
      file_size: input.bytes,
      mime_type: "application/pdf",
      uploaded_by: input.createdBy,
      change_log: "Manual report generation",
    });
    return String(existing.id);
  }

  const { data: doc, error: docErr } = await supabaseAdmin
    .from("documents")
    .insert({ property_id: input.propertyId, name: input.name, type: "report", current_version: 1, created_by: input.createdBy })
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
    change_log: "Manual report generation",
  });
  return String(doc.id);
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
    out.push({ document_id: id, name: String(d.name || ""), url, mime_type: String(v?.mime_type || ""), file_size: Number(v?.file_size || 0) || null });
  }
  return out;
}

function buildExpenseAnalysis(expenses: Array<{ date: any; cost: number; content: string }>, timeZone: string, config: any) {
  const daily = new Map<string, number>();
  for (const e of expenses) {
    const d = e?.date ? new Date(e.date) : null;
    if (!d || !Number.isFinite(d.getTime())) continue;
    const key = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    daily.set(key, (daily.get(key) ?? 0) + (Number(e.cost) || 0));
  }

  const dailyTotals = Array.from(daily.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, total]) => ({ date, total }));
  const totals = dailyTotals.map((d) => d.total);
  const mean = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const variance = totals.length ? totals.reduce((a, b) => a + (b - mean) ** 2, 0) / totals.length : 0;
  const std = Math.sqrt(variance);
  const anomalies = dailyTotals.filter((d) => std > 0 && (d.total - mean) / std >= 3).map((d) => ({ date: d.date, total: d.total }));

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
    if (!matched) categories.otros = (categories.otros ?? 0) + (Number(e.cost) || 0);
  }
  return { dailyTotals, categories, anomalies, stats: { mean, std } };
}

function normalizeRecipients(value: unknown) {
  const arr = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const cleaned = arr.map((e) => String(e || "").trim().toLowerCase()).filter((e) => e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return Array.from(new Set(cleaned));
}

function normalizeMonth(value: unknown) {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  return s;
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

function normalizeImageUrls(value: unknown) {
  const arr = Array.isArray(value) ? value : [];
  return arr.map((u) => String(u || "").trim()).filter((u) => u && (u.startsWith("http://") || u.startsWith("https://")));
}

function escapeHtml(input: string) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

async function fetchWithRetry(url: string, init: RequestInit, opts: { maxAttempts: number }): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= Math.max(1, opts.maxAttempts); attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        lastErr = new Error(`retryable_status_${res.status}`);
        if (attempt < opts.maxAttempts) {
          await delayMs(300 * 2 ** (attempt - 1));
          continue;
        }
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < opts.maxAttempts) {
        await delayMs(300 * 2 ** (attempt - 1));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to fetch");
}

function delayMs(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function insertAuditLog(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: { userId: string; action: string; entityType: string; entityId: string; details: any },
) {
  await supabaseAdmin.from("audit_logs").insert({
    user_id: input.userId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    details: input.details,
    ip_address: null,
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
