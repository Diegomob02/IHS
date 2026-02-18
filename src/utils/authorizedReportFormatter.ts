export type FormattedReportBlock =
  | { type: 'heading'; text: string; level: 1 | 2 | 3 }
  | { type: 'paragraph'; text: string }
  | { type: 'bullets'; items: string[] };

export type FormattedReport = {
  title: string;
  blocks: FormattedReportBlock[];
};

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, '');
const normalizeSpaces = (s: string) => s.replace(/\s+/g, ' ').trim();

const isBulletLine = (line: string) => /^(-|\*|\u2022)\s+/.test(line);
const bulletText = (line: string) => normalizeSpaces(line.replace(/^(-|\*|\u2022)\s+/, ''));

const isHeadingLine = (line: string) => /^#{1,3}\s+/.test(line);
const headingLevel = (line: string): 1 | 2 | 3 => {
  const m = line.match(/^(#{1,3})\s+/);
  const len = m?.[1]?.length || 2;
  if (len === 1) return 1;
  if (len === 3) return 3;
  return 2;
};
const headingText = (line: string) => normalizeSpaces(line.replace(/^#{1,3}\s+/, ''));

export function formatAuthorizedReportText(raw: string, opts?: { title?: string }): FormattedReport {
  const safe = normalizeSpaces(stripHtml(String(raw || '')));
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((l) => normalizeSpaces(stripHtml(l)))
    .filter((l) => l.length > 0);

  const blocks: FormattedReportBlock[] = [];
  let pendingBullets: string[] = [];

  const flushBullets = () => {
    if (!pendingBullets.length) return;
    blocks.push({ type: 'bullets', items: pendingBullets });
    pendingBullets = [];
  };

  for (const line of lines) {
    if (isHeadingLine(line)) {
      flushBullets();
      const text = headingText(line);
      if (text) blocks.push({ type: 'heading', text, level: headingLevel(line) });
      continue;
    }

    if (isBulletLine(line)) {
      pendingBullets.push(bulletText(line));
      continue;
    }

    flushBullets();
    blocks.push({ type: 'paragraph', text: line });
  }

  flushBullets();

  const title = normalizeSpaces(opts?.title || '') || (blocks.find((b) => b.type === 'heading' && b.level === 1) as any)?.text || 'Reporte';
  const normalizedTitle = normalizeSpaces(title);

  if (!safe) return { title: normalizedTitle, blocks: [{ type: 'paragraph', text: 'Sin contenido.' }] };
  if (!blocks.length) return { title: normalizedTitle, blocks: [{ type: 'paragraph', text: safe }] };

  return { title: normalizedTitle, blocks };
}
