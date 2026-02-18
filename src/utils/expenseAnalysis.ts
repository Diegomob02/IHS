export type ExpenseItem = {
  date: string | Date;
  cost: number;
  content: string;
};

export function buildExpenseAnalysis(
  expenses: ExpenseItem[],
  timeZone: string,
  config?: { category_keywords?: Record<string, string[]> },
) {
  const daily = new Map<string, number>();
  for (const e of expenses || []) {
    const d = e?.date instanceof Date ? e.date : new Date(e?.date);
    if (!Number.isFinite(d.getTime())) continue;
    const key = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
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
  for (const e of expenses || []) {
    const text = String(e?.content || '').toLowerCase();
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
      categories.otros = (categories.otros ?? 0) + (Number(e.cost) || 0);
    }
  }

  return { dailyTotals, categories, anomalies, stats: { mean, std } };
}
