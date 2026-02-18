export type ResendAttachment = {
  filename: string;
  content?: string;
  path?: string;
  content_type?: string;
};

export type ResendSendInput = {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: ResendAttachment[];
};

export type ResendSendResult =
  | { ok: true; id: string; providerResponse: unknown }
  | { ok: false; message: string; providerResponse: unknown };

export function escapeHtml(input: string) {
  return String(input ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderTemplate(input: string, vars: Record<string, string>) {
  let out = String(input ?? "");
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, escapeHtml(String(v ?? "")));
  }
  return out;
}

export async function sendResendEmail(input: ResendSendInput): Promise<ResendSendResult> {
  if (!input.apiKey) return { ok: false, message: "Missing RESEND_API_KEY", providerResponse: null };
  if (!input.from) return { ok: false, message: "Missing RESEND_FROM_EMAIL", providerResponse: null };
  if (!input.to || (Array.isArray(input.to) && input.to.length === 0)) {
    return { ok: false, message: "Missing email recipient", providerResponse: null };
  }
  if (!input.subject) return { ok: false, message: "Missing email subject", providerResponse: null };
  if (!input.html && !input.text) return { ok: false, message: "Missing email body", providerResponse: null };

  const payload: Record<string, unknown> = {
    from: input.from,
    to: input.to,
    subject: input.subject,
  };
  if (input.html) payload.html = input.html;
  if (input.text) payload.text = input.text;
  if (input.replyTo) payload.reply_to = input.replyTo;
  if (input.headers) payload.headers = input.headers;
  if (input.attachments?.length) payload.attachments = input.attachments;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text().catch(() => "");
  const maybeJson = safeJsonParse(text);
  if (!res.ok) {
    return {
      ok: false,
      message: `Resend error (${res.status})`,
      providerResponse: maybeJson ?? text,
    };
  }
  const id = String((maybeJson as any)?.id ?? "").trim();
  if (!id) {
    return { ok: false, message: "Resend did not return an id", providerResponse: maybeJson ?? text };
  }
  return { ok: true, id, providerResponse: maybeJson ?? text };
}

function safeJsonParse(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}
