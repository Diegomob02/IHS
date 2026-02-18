import type { ManualReportContext } from '../components/reports/ManualIncidentReportBuilder';

export type ManualReportCost = { date: string; concept: string; amount: number };
export type ManualReportImage = { url: string; caption: string; order: number; name?: string };

export type ManualReportPayload = {
  propertyId: string;
  month: string;
  incidentText: string;
  costs: ManualReportCost[];
  totals: { totalCost: number };
  images: ManualReportImage[];
};

export function buildManualReportPayload(input: { propertyId: string; month: string; ctx: ManualReportContext }): ManualReportPayload {
  const propertyId = String(input.propertyId || '').trim();
  const month = normalizeMonth(input.month) ?? new Date().toISOString().slice(0, 7);

  const incidentText = String(input.ctx?.incidentText || '').trim();

  const images = (input.ctx?.images || [])
    .map((i) => ({
      url: String(i?.url || '').trim(),
      caption: String(i?.caption || '').trim(),
      order: Number(i?.order || 0),
      name: String(i?.name || '').trim() || undefined,
    }))
    .filter((i) => i.url && (i.url.startsWith('http://') || i.url.startsWith('https://')) && Number.isFinite(i.order))
    .sort((a, b) => a.order - b.order);

  const costs = (input.ctx?.costs || [])
    .map((c) => ({
      date: String(c?.date || '').trim(),
      concept: String(c?.concept || '').trim(),
      amount: Number(c?.amount || 0),
    }))
    .filter((c) => c.date && c.concept && Number.isFinite(c.amount) && c.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalCost = costs.reduce((sum, c) => sum + c.amount, 0);

  return {
    propertyId,
    month,
    incidentText,
    costs,
    totals: { totalCost },
    images,
  };
}

export function validateManualReportPayload(p: ManualReportPayload) {
  const errors: string[] = [];
  if (!p.propertyId) errors.push('Missing propertyId');
  if (!normalizeMonth(p.month)) errors.push('Invalid month');
  if (!p.incidentText) errors.push('Missing incidentText');
  for (const c of p.costs) {
    if (!c.date || !c.concept || !Number.isFinite(c.amount) || c.amount <= 0) errors.push('Invalid cost row');
  }
  for (const img of p.images) {
    if (!img.url) errors.push('Invalid image url');
  }
  return { ok: errors.length === 0, errors };
}

function normalizeMonth(value: string) {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}$/.test(s)) return null;
  return s;
}

