import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { FormattedReport, FormattedReportBlock } from '../../utils/authorizedReportFormatter';

export type ReportPdfImage = { url: string; caption?: string };
export type ReportPdfCostRow = { date: string; concept: string; amount: number };

export type RenderReportPdfInput = {
  propertyTitle: string;
  propertyLocation?: string;
  month: string;
  formatted: FormattedReport;
  costs: ReportPdfCostRow[];
  totalCost: number;
  images: ReportPdfImage[];
  templateSpec?: any;
  formatMoney?: (n: number) => string;
};

export async function renderReportPdf(input: RenderReportPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = normalizePageSize(input.templateSpec?.layout?.pageSize || 'LETTER');
  const margin = Number(input.templateSpec?.layout?.margin || 40) || 40;
  const primary = safeColor(input.templateSpec?.branding?.primaryColor || '#0f172a');

  let page = doc.addPage(pageSize);
  let y = page.getHeight() - margin;
  const x = margin;
  const maxWidth = page.getWidth() - margin * 2;

  const ensureSpace = (needed: number) => {
    if (y - needed >= margin) return;
    page = doc.addPage(pageSize);
    y = page.getHeight() - margin;
  };

  const drawHeading = (text: string, level: 1 | 2 | 3) => {
    const size = level === 1 ? 18 : level === 2 ? 14 : 12;
    ensureSpace(size + 10);
    page.drawText(text, { x, y: y - size, size, font: fontBold, color: primary });
    y -= size + 10;
  };

  const drawParagraph = (text: string) => {
    const size = 11;
    const lines = wrapText(font, text, size, maxWidth);
    ensureSpace(lines.length * (size + 3) + 8);
    for (const line of lines) {
      page.drawText(line, { x, y: y - size, size, font, color: rgb(0.15, 0.15, 0.15) });
      y -= size + 3;
    }
    y -= 6;
  };

  const drawBullets = (items: string[]) => {
    const size = 11;
    for (const item of items) {
      const bulletPrefix = '• ';
      const lines = wrapText(font, bulletPrefix + item, size, maxWidth);
      ensureSpace(lines.length * (size + 3) + 6);
      for (const line of lines) {
        page.drawText(line, { x, y: y - size, size, font, color: rgb(0.15, 0.15, 0.15) });
        y -= size + 3;
      }
      y -= 2;
    }
    y -= 6;
  };

  drawHeading(`Reporte mensual ${input.month}`, 1);
  drawParagraph(`${input.propertyTitle}${input.propertyLocation ? ` · ${input.propertyLocation}` : ''}`);

  if (input.formatted?.blocks?.length) {
    for (const block of input.formatted.blocks) {
      if (block.type === 'heading') drawHeading(block.text, block.level);
      if (block.type === 'paragraph') drawParagraph(block.text);
      if (block.type === 'bullets') drawBullets(block.items);
    }
  }

  drawHeading('Costos', 2);
  drawParagraph(`Total del periodo: ${formatMoney(input.totalCost, input.formatMoney)}`);

  if (input.costs?.length) {
    const headerSize = 10;
    const rowSize = 10;
    const colDate = 70;
    const colAmount = 90;
    const colConcept = maxWidth - colDate - colAmount - 10;

    ensureSpace(24);
    page.drawText('Fecha', { x, y: y - headerSize, size: headerSize, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Concepto', { x: x + colDate + 10, y: y - headerSize, size: headerSize, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    page.drawText('Monto', { x: x + colDate + 10 + colConcept + 10, y: y - headerSize, size: headerSize, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
    y -= headerSize + 8;

    for (const row of input.costs) {
      const date = String(row.date || '');
      const concept = String(row.concept || '');
      const amount = formatMoney(Number(row.amount || 0), input.formatMoney);

      const conceptLines = wrapText(font, concept, rowSize, colConcept);
      ensureSpace(conceptLines.length * (rowSize + 3) + 10);

      page.drawText(date, { x, y: y - rowSize, size: rowSize, font, color: rgb(0.15, 0.15, 0.15) });
      for (let i = 0; i < conceptLines.length; i++) {
        page.drawText(conceptLines[i], {
          x: x + colDate + 10,
          y: y - rowSize - i * (rowSize + 3),
          size: rowSize,
          font,
          color: rgb(0.15, 0.15, 0.15),
        });
      }
      page.drawText(amount, {
        x: x + colDate + 10 + colConcept + 10,
        y: y - rowSize,
        size: rowSize,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= conceptLines.length * (rowSize + 3) + 6;
    }
  } else {
    drawParagraph('Sin costos registrados.');
  }

  if (input.images?.length) {
    drawHeading('Imágenes', 2);
    for (const img of input.images) {
      const url = String(img.url || '').trim();
      if (!url) continue;
      try {
        const bytes = await fetchBytes(url);
        const embedded = await embedImage(doc, bytes);
        const availableW = maxWidth;
        const maxH = 240;
        const { width, height } = fitRect(embedded.width, embedded.height, availableW, maxH);

        ensureSpace(height + 34);
        page.drawImage(embedded.ref, { x, y: y - height, width, height });
        y -= height + 6;
        const caption = String(img.caption || '').trim();
        if (caption) {
          const capLines = wrapText(font, caption, 10, maxWidth);
          for (const line of capLines) {
            ensureSpace(16);
            page.drawText(line, { x, y: y - 10, size: 10, font, color: rgb(0.35, 0.35, 0.35) });
            y -= 13;
          }
          y -= 6;
        } else {
          y -= 10;
        }
      } catch {
        ensureSpace(24);
        page.drawText(`No se pudo cargar imagen: ${url}`, { x, y: y - 10, size: 10, font, color: rgb(0.6, 0.1, 0.1) });
        y -= 18;
      }
    }
  }

  const pdfBytes = await doc.save();
  return new Uint8Array(pdfBytes);
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function wrapText(font: any, text: string, size: number, maxWidth: number) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(next, size);
    if (width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = w;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function normalizePageSize(value: unknown): [number, number] {
  const v = String(value || '').toUpperCase();
  if (v === 'A4') return [595.28, 841.89];
  return [612, 792];
}

function safeColor(hex: unknown) {
  const s = String(hex || '').trim();
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return rgb(0.06, 0.09, 0.16);
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return rgb(r / 255, g / 255, b / 255);
}

function formatMoney(amount: number, f?: (n: number) => string) {
  const n = Number.isFinite(amount) ? amount : 0;
  if (f) return f(n);
  return n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchBytes(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

async function embedImage(doc: PDFDocument, bytes: Uint8Array) {
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (isPng) {
    const png = await doc.embedPng(bytes);
    return { ref: png, width: png.width, height: png.height };
  }
  const jpg = await doc.embedJpg(bytes);
  return { ref: jpg, width: jpg.width, height: jpg.height };
}

function fitRect(srcW: number, srcH: number, maxW: number, maxH: number) {
  if (srcW <= 0 || srcH <= 0) return { width: maxW, height: maxH };
  const ratio = Math.min(maxW / srcW, maxH / srcH, 1);
  return { width: srcW * ratio, height: srcH * ratio };
}

