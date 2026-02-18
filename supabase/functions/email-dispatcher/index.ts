import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
import { sendResendEmail, type ResendAttachment } from "../_shared/email.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cronSecret = (Deno.env.get("CRON_SECRET") ?? "").trim();
const resendApiKey = (Deno.env.get("RESEND_API_KEY") ?? "").trim();
const resendFromEmail = (Deno.env.get("RESEND_FROM_EMAIL") ?? "").trim();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EmailOutboxRow = {
  id: string;
  status: string;
  attempts: number;
  max_attempts: number;
  to_email: string;
  to_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  subject: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string> | null;
  attachments: unknown;
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
    const batchSize = clampInt(body?.batchSize, 1, 200) ?? 50;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: jobs, error } = await supabaseAdmin.rpc("dequeue_email_outbox", { p_batch_size: batchSize });
    if (error) throw error;

    const rows = (jobs ?? []) as EmailOutboxRow[];
    const summary = { picked: rows.length, sent: 0, failed: 0, dead: 0 };

    for (const job of rows) {
      const attemptNo = (job.attempts ?? 0) + 1;

      await supabaseAdmin
        .from("email_outbox")
        .update({ attempts: attemptNo })
        .eq("id", job.id);

      const providerConfigured = Boolean(resendApiKey && resendFromEmail);
      if (!providerConfigured) {
        const { status, nextAttemptAt } = nextRetryState(attemptNo, job.max_attempts);
        await recordDeliveryFailure(supabaseAdmin, {
          jobId: job.id,
          attemptNo,
          message: "Email provider not configured (missing RESEND env)",
          nextAttemptAt,
          status,
          providerResponse: null,
        });
        if (status === "dead") summary.dead += 1;
        else summary.failed += 1;
        continue;
      }

      const sendRes = await sendResendEmail({
        apiKey: resendApiKey,
        from: job.from_email ?? resendFromEmail,
        to: job.to_email,
        subject: job.subject,
        html: job.html ?? undefined,
        text: job.text ?? undefined,
        replyTo: job.reply_to ?? undefined,
        headers: job.headers ?? undefined,
        attachments: normalizeResendAttachments(job.attachments),
      });

      if (sendRes.ok === false) {
        const failure = sendRes as unknown as { message: string; providerResponse: unknown };
        const { status, nextAttemptAt } = nextRetryState(attemptNo, job.max_attempts);
        await recordDeliveryFailure(supabaseAdmin, {
          jobId: job.id,
          attemptNo,
          message: failure.message,
          nextAttemptAt,
          status,
          providerResponse: failure.providerResponse,
        });
        if (status === "dead") summary.dead += 1;
        else summary.failed += 1;
        continue;
      }

      {
        await supabaseAdmin.from("email_delivery_logs").insert({
          email_outbox_id: job.id,
          attempt_no: attemptNo,
          status: "sent",
          provider_status: "ok",
          provider_response: sendRes.providerResponse,
        });

        await supabaseAdmin
          .from("email_outbox")
          .update({
            status: "sent",
            provider_message_id: sendRes.id,
            sent_at: new Date().toISOString(),
            last_error: null,
            last_error_at: null,
            next_attempt_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        summary.sent += 1;
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

function clampInt(value: unknown, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function backoffSeconds(attemptNo: number) {
  const base = 30;
  const max = 60 * 60;
  const pow = Math.min(Math.max(attemptNo - 1, 0), 10);
  const exp = base * 2 ** pow;
  const jitter = Math.floor(Math.random() * 30);
  return Math.min(exp + jitter, max);
}

function nextRetryState(attemptNo: number, maxAttempts: number): { status: "failed" | "dead"; nextAttemptAt: string } {
  const dead = attemptNo >= Math.max(1, maxAttempts);
  const delay = backoffSeconds(attemptNo);
  const nextAttemptAt = new Date(Date.now() + delay * 1000).toISOString();
  return { status: dead ? "dead" : "failed", nextAttemptAt };
}

async function recordDeliveryFailure(
  supabaseAdmin: ReturnType<typeof createClient>,
  input: {
    jobId: string;
    attemptNo: number;
    message: string;
    nextAttemptAt: string;
    status: "failed" | "dead";
    providerResponse: unknown;
  },
) {
  await supabaseAdmin.from("email_delivery_logs").insert({
    email_outbox_id: input.jobId,
    attempt_no: input.attemptNo,
    status: "failed",
    provider_status: "error",
    provider_response: input.providerResponse,
    error: input.message,
  });

  await supabaseAdmin
    .from("email_outbox")
    .update({
      status: input.status,
      last_error: input.message,
      last_error_at: new Date().toISOString(),
      next_attempt_at: input.nextAttemptAt,
    })
    .eq("id", input.jobId);
}

function normalizeResendAttachments(value: unknown): ResendAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .map((a) => {
      const obj = a as any;
      const filename = String(obj?.filename ?? "").trim();
      const path = typeof obj?.path === "string" ? obj.path : undefined;
      const content = typeof obj?.content === "string" ? obj.content : undefined;
      const contentType = typeof obj?.content_type === "string" ? obj.content_type : undefined;
      if (!filename) return null;
      if (!path && !content) return null;
      const entry: ResendAttachment = { filename };
      if (path) entry.path = path;
      if (content) entry.content = content;
      if (contentType) entry.content_type = contentType;
      return entry;
    })
    .filter((v): v is ResendAttachment => Boolean(v));
  return out.length ? out : undefined;
}
