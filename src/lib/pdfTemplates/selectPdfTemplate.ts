export type ReportPdfTemplate = {
  id: string;
  name: string;
  report_key: string;
  enabled: boolean;
  priority: number;
  template_spec: any;
  match_rules: any;
  updated_at?: string;
};

export type ReportContext = {
  reportKey: string;
  propertyId?: string | null;
  totalCost?: number | null;
  eventsCount?: number | null;
  hasImages?: boolean | null;
  location?: string | null;
};

const asNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const asBool = (v: unknown) => {
  if (v === true || v === false) return v;
  if (typeof v === 'string') {
    if (v.toLowerCase() === 'true') return true;
    if (v.toLowerCase() === 'false') return false;
  }
  return null;
};

const asString = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export function selectPdfTemplate(templates: ReportPdfTemplate[], ctx: ReportContext): ReportPdfTemplate | null {
  const candidates = (templates || [])
    .filter((t) => t && t.enabled)
    .filter((t) => String(t.report_key || '') === String(ctx.reportKey || ''));

  const matches = candidates.filter((t) => matchRules(t.match_rules, ctx));

  const sorted = matches.sort((a, b) => {
    const pa = Number(a.priority || 0);
    const pb = Number(b.priority || 0);
    if (pa !== pb) return pa - pb;
    const ua = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const ub = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return ub - ua;
  });

  return sorted[0] || null;
}

function matchRules(rules: any, ctx: ReportContext) {
  const r = rules && typeof rules === 'object' ? rules : {};

  const propertyId = String(ctx.propertyId || '').trim();
  if (r.property_id && propertyId && String(r.property_id) !== propertyId) return false;
  if (r.property_id && !propertyId) return false;

  const minTotal = asNumber(r.min_total_cost);
  const maxTotal = asNumber(r.max_total_cost);
  const total = asNumber(ctx.totalCost);
  if (minTotal !== null && (total === null || total < minTotal)) return false;
  if (maxTotal !== null && (total === null || total > maxTotal)) return false;

  const minEvents = asNumber(r.min_events);
  const maxEvents = asNumber(r.max_events);
  const eventsCount = asNumber(ctx.eventsCount);
  if (minEvents !== null && (eventsCount === null || eventsCount < minEvents)) return false;
  if (maxEvents !== null && (eventsCount === null || eventsCount > maxEvents)) return false;

  const needImages = asBool(r.has_images);
  const hasImages = asBool(ctx.hasImages);
  if (needImages !== null && (hasImages === null || hasImages !== needImages)) return false;

  const contains = asString(r.location_contains).trim().toLowerCase();
  const location = asString(ctx.location).trim().toLowerCase();
  if (contains && (!location || !location.includes(contains))) return false;

  return true;
}

