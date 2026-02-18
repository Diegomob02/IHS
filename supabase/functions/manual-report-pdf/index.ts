import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const openaiApiKey = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
const openaiTextModel = (Deno.env.get("OPENAI_TEXT_MODEL") ?? "gpt-4o-mini").trim();
const ihsLogoUrl = (Deno.env.get("IHS_LOGO_URL") ?? "").trim();

const rgb = (r: number, g: number, b: number) => ({ type: "RGB", red: r, green: g, blue: b } as any);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Payload = {
  propertyId?: unknown;
  month?: unknown;
  incidentText?: unknown;
  costs?: unknown;
  images?: unknown;
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
    if (!ihsLogoUrl) return json({ ok: false, message: "Missing IHS_LOGO_URL" }, 500);

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
    const propertyId = String(body?.propertyId ?? "").trim();
    const month = normalizeMonth(body?.month) ?? new Date().toISOString().slice(0, 7);
    const incidentText = String(body?.incidentText ?? "").trim();
    if (!propertyId) return json({ ok: false, message: "Missing propertyId" }, 400);
    if (!incidentText) return json({ ok: false, message: "Missing incidentText" }, 400);

    const costs = normalizeCosts(body?.costs);
    const images = normalizeImages(body?.images).slice(0, 25);

    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("id, title, location, owner_email")
      .eq("id", propertyId)
      .single();
    const propertyTitle = String((property as any)?.title || "Propiedad");
    const propertyLocation = String((property as any)?.location || "");

    const logoBytes = await fetchImageBytes(ihsLogoUrl, { maxBytes: 5 * 1024 * 1024 });
    const imageBytes = await Promise.all(
      images.map(async (img) => ({ ...img, bytes: await fetchImageBytes(img.url, { maxBytes: 4 * 1024 * 1024 }) })),
    );

    const aiText = await generateAiBody({
      apiKey: openaiApiKey,
      model: openaiTextModel,
      input: {
        property: { id: propertyId, title: propertyTitle, location: propertyLocation },
        month,
        incidentText,
        costs,
        images: images.map((i) => ({ caption: i.caption, order: i.order })),
      },
    });

    const pdfBase64 = await buildPdfBase64({
      title: `Reporte Mensual ${month}`,
      propertyTitle,
      propertyLocation,
      incidentText,
      aiText,
      costs,
      logoBytes,
      imageBytes,
    });

    await supabaseAdmin.from("audit_logs").insert({
      user_id: authUser.id,
      action: "manual_report_pdf_generated",
      entity_type: "properties",
      entity_id: propertyId,
      details: { month, costsCount: costs.length, imagesCount: images.length },
      ip_address: null,
    });

    return json({ ok: true, pdfBase64 }, 200);
  } catch (e: any) {
    return json({ ok: false, message: String(e?.message || e || "Unknown error") }, 500);
  }
});

async function buildPdfBase64(input: {
  title: string;
  propertyTitle: string;
  propertyLocation: string;
  incidentText: string;
  aiText: string;
  costs: Array<{ date: string; concept: string; amount: number }>;
  logoBytes: Uint8Array;
  imageBytes: Array<{ url: string; caption: string; order: number; bytes: Uint8Array }>;
}) {
  const { PDFDocument } = await import("https://esm.sh/pdf-lib@1.17.1");
  const StandardFonts = { Helvetica: "Helvetica", HelveticaBold: "Helvetica-Bold" } as const;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logo = await tryEmbedImage(doc, input.logoBytes);
  const pageW = 595.28;
  const pageH = 841.89;
  const margin = 48;
  const headerH = 56;
  const contentW = pageW - margin * 2;

  const addPageWithHeader = () => {
    const page = doc.addPage([pageW, pageH]);
    const yTop = pageH - margin;
    if (logo) {
      const maxH = 28;
      const scale = maxH / logo.height;
      page.drawImage(logo.img, { x: margin, y: yTop - maxH, width: logo.width * scale, height: maxH });
    }
    page.drawText("IHS", { x: pageW - margin - 30, y: yTop - 18, size: 14, font: fontBold, color: rgb(0.15, 0.15, 0.15) });
    page.drawLine({ start: { x: margin, y: yTop - headerH }, end: { x: pageW - margin, y: yTop - headerH }, thickness: 1, color: rgb(0.85, 0.85, 0.85) });
    return { page, y: yTop - headerH - 16 };
  };

  let { page, y } = addPageWithHeader();

  page.drawText(input.title, { x: margin, y, size: 18, font: fontBold, color: rgb(0.12, 0.12, 0.12) });
  y -= 22;
  page.drawText(`Propiedad: ${input.propertyTitle}`, { x: margin, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
  y -= 14;
  if (input.propertyLocation) {
    page.drawText(`Ubicación: ${input.propertyLocation}`, { x: margin, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 18;
  } else {
    y -= 4;
  }

  const section = (title: string) => {
    if (y < margin + 80) {
      ({ page, y } = addPageWithHeader());
    }
    page.drawText(title, { x: margin, y, size: 13, font: fontBold, color: rgb(0.12, 0.12, 0.12) });
    y -= 16;
  };

  section("Incidentes / Contexto Manual");
  y = drawWrappedText(page, input.incidentText, { x: margin, y, maxWidth: contentW, font, fontSize: 11, lineHeight: 14 });
  y -= 8;

  section("Contenido Generado por IA");
  y = drawWrappedText(page, input.aiText, { x: margin, y, maxWidth: contentW, font, fontSize: 11, lineHeight: 14 });
  y -= 8;

  section("Costos");
  if (!input.costs.length) {
    y = drawWrappedText(page, "Sin costos reportados.", { x: margin, y, maxWidth: contentW, font, fontSize: 11, lineHeight: 14 });
    y -= 8;
  } else {
    const colDate = 90;
    const colAmt = 90;
    const colConcept = contentW - colDate - colAmt - 8;
    const rowH = 16;
    const headerY = y;
    page.drawText("Fecha", { x: margin, y: headerY, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("Concepto", { x: margin + colDate + 4, y: headerY, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText("Monto", { x: margin + colDate + 4 + colConcept + 4, y: headerY, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    y -= 12;
    page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 1, color: rgb(0.9, 0.9, 0.9) });
    y -= 10;
    for (const c of input.costs) {
      if (y < margin + 60) {
        ({ page, y } = addPageWithHeader());
      }
      page.drawText(String(c.date), { x: margin, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(truncateToWidth(font, String(c.concept), 10, colConcept), { x: margin + colDate + 4, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
      page.drawText(formatMoney(c.amount), { x: margin + colDate + 4 + colConcept + 4, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
      y -= rowH;
    }
    y -= 4;
  }

  section("Evidencias (Imágenes)");
  if (!input.imageBytes.length) {
    y = drawWrappedText(page, "Sin imágenes adjuntas.", { x: margin, y, maxWidth: contentW, font, fontSize: 11, lineHeight: 14 });
  } else {
    for (const img of input.imageBytes.sort((a, b) => a.order - b.order)) {
      const embedded = await tryEmbedImage(doc, img.bytes);
      if (!embedded) continue;

      const caption = img.caption ? String(img.caption) : "Evidencia";
      const capHeight = 14;
      const maxImgH = 420;
      const maxImgW = contentW;
      const scale = Math.min(maxImgW / embedded.width, maxImgH / embedded.height, 1);
      const drawW = embedded.width * scale;
      const drawH = embedded.height * scale;

      if (y < margin + drawH + capHeight + 30) {
        ({ page, y } = addPageWithHeader());
      }
      page.drawText(caption, { x: margin, y, size: 11, font: fontBold, color: rgb(0.12, 0.12, 0.12) });
      y -= capHeight;
      page.drawImage(embedded.img, { x: margin, y: y - drawH, width: drawW, height: drawH });
      y -= drawH + 16;
    }
  }

  const bytes = await doc.save();
  const base64 = bytesToBase64(bytes);
  const ok = verifyPdfBase64(base64);
  if (!ok) throw new Error("Generated PDF base64 validation failed");
  return base64;
}

async function tryEmbedImage(doc: any, bytes: Uint8Array) {
  const header = detectImageHeader(bytes);
  if (header === "jpg") {
    const img = await doc.embedJpg(bytes);
    return { img, width: img.width, height: img.height };
  }
  if (header === "png") {
    const img = await doc.embedPng(bytes);
    return { img, width: img.width, height: img.height };
  }
  return null;
}

function drawWrappedText(
  page: any,
  text: string,
  input: { x: number; y: number; maxWidth: number; font: any; fontSize: number; lineHeight: number },
) {
  const words = String(text || "").replace(/\r/g, "").split(/\s+/).filter(Boolean);
  let line = "";
  let y = input.y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    const width = input.font.widthOfTextAtSize(test, input.fontSize);
    if (width <= input.maxWidth) {
      line = test;
      continue;
    }
    if (line) {
      page.drawText(line, { x: input.x, y, size: input.fontSize, font: input.font, color: rgb(0.2, 0.2, 0.2) });
      y -= input.lineHeight;
      line = w;
    } else {
      page.drawText(truncateToWidth(input.font, test, input.fontSize, input.maxWidth), { x: input.x, y, size: input.fontSize, font: input.font, color: rgb(0.2, 0.2, 0.2) });
      y -= input.lineHeight;
      line = "";
    }
  }
  if (line) {
    page.drawText(line, { x: input.x, y, size: input.fontSize, font: input.font, color: rgb(0.2, 0.2, 0.2) });
    y -= input.lineHeight;
  }
  return y;
}

function truncateToWidth(font: any, text: string, fontSize: number, maxWidth: number) {
  const s = String(text || "");
  if (font.widthOfTextAtSize(s, fontSize) <= maxWidth) return s;
  let out = s;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}…`, fontSize) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

function formatMoney(n: number) {
  const v = Number(n) || 0;
  return `$${v.toFixed(2)}`;
}

function normalizeMonth(value: unknown) {
  const s = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  return s;
}

function normalizeCosts(value: unknown) {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((c: any) => ({
      date: String(c?.date || "").trim(),
      concept: String(c?.concept || "").trim(),
      amount: Number(c?.amount || 0),
    }))
    .filter((c) => c.date && c.concept && Number.isFinite(c.amount) && c.amount > 0);
}

function normalizeImages(value: unknown) {
  const arr = Array.isArray(value) ? value : [];
  return arr
    .map((i: any) => ({
      url: String(i?.url || "").trim(),
      caption: String(i?.caption || "").trim(),
      order: Number(i?.order || 0),
    }))
    .filter((i) => i.url && (i.url.startsWith("http://") || i.url.startsWith("https://")) && Number.isFinite(i.order))
    .sort((a, b) => a.order - b.order);
}

function detectImageHeader(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return null;
}

async function generateAiBody(input: { apiKey: string; model: string; input: any }) {
  if (!input.apiKey) {
    return [
      "Resumen ejecutivo:",
      "- Reporte generado sin proveedor IA (OPENAI_API_KEY no configurada).",
      "",
      "Detalle:",
      input.input?.incidentText ? String(input.input.incidentText) : "",
    ].join("\n");
  }

  const sys = "Eres un asistente que redacta reportes profesionales de mantenimiento. Responde en español. Usa secciones claras.";
  const prompt = `Contexto (JSON):\n${JSON.stringify(input.input)}\n\nRedacta:\n1) Resumen ejecutivo (3-6 bullets)\n2) Incidentes y acciones (texto)\n3) Costos (resumen, categorías, alertas si hay picos)\n4) Recomendaciones\n`;

  const res = await fetchWithRetry(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    },
    { maxAttempts: 3 },
  );
  const raw = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`AI error (${res.status}): ${safeText(raw)}`);
  const json = safeJsonParse(raw);
  const content = String((json as any)?.choices?.[0]?.message?.content || "").trim();
  if (!content) throw new Error("AI response missing content");
  return content;
}

async function fetchImageBytes(url: string, opts: { maxBytes: number }) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const ct = String(res.headers.get("content-type") || "");
  if (!ct.includes("image/")) throw new Error("Invalid image content-type");
  const ab = await res.arrayBuffer();
  if (ab.byteLength > opts.maxBytes) throw new Error("Image too large");
  return new Uint8Array(ab);
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

function bytesToBase64(bytes: Uint8Array) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function verifyPdfBase64(b64: string) {
  try {
    const bin = atob(b64.slice(0, 40));
    return bin.startsWith("%PDF");
  } catch {
    return false;
  }
}

function safeJsonParse(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function safeText(input: string) {
  const s = String(input ?? "");
  return s.length > 500 ? `${s.slice(0, 500)}…` : s;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
