import { describe, expect, it } from 'vitest';
import { buildExpenseAnalysis } from './expenseAnalysis';

describe('expenseAnalysis', () => {
  it('categorizes expenses by keyword mapping', () => {
    const res = buildExpenseAnalysis(
      [
        { date: '2026-01-02T10:00:00Z', cost: 100, content: 'Reparación de plomería' },
        { date: '2026-01-03T10:00:00Z', cost: 50, content: 'Mantenimiento de piscina' }
      ],
      'UTC',
      { category_keywords: { plomeria: ['plomería'], piscina: ['piscina'] } }
    );

    expect(res.categories.plomeria).toBe(100);
    expect(res.categories.piscina).toBe(50);
  });

  it('produces daily totals in time zone', () => {
    const res = buildExpenseAnalysis(
      [
        { date: '2026-01-02T01:00:00Z', cost: 10, content: 'a' },
        { date: '2026-01-02T23:00:00Z', cost: 20, content: 'b' }
      ],
      'UTC'
    );

    expect(res.dailyTotals.length).toBe(1);
    expect(res.dailyTotals[0].total).toBe(30);
  });

  it('flags an anomaly when a day is 3+ std dev above mean', () => {
    const baseline = Array.from({ length: 30 }).map((_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
      cost: 10,
      content: 'baseline'
    }));

    const res = buildExpenseAnalysis(
      [
        ...baseline,
        { date: '2026-02-01T12:00:00Z', cost: 10000, content: 'spike' }
      ],
      'UTC'
    );

    expect(res.anomalies.length).toBeGreaterThanOrEqual(1);
    expect(res.anomalies[0].total).toBe(10000);
  });
});
