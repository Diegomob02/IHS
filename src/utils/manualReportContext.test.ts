import { describe, expect, it } from 'vitest';
import { buildManualReportPayload, validateManualReportPayload } from './manualReportContext';

describe('manualReportContext', () => {
  it('builds and validates a normalized payload', () => {
    const payload = buildManualReportPayload({
      propertyId: 'prop-1',
      month: '2026-01',
      ctx: {
        incidentText: 'Se revisó el sistema de A/C',
        images: [
          { id: '1', name: 'a.jpg', caption: 'Antes', order: 2, url: 'https://example.com/a.jpg' },
          { id: '2', name: 'b.jpg', caption: 'Después', order: 1, url: 'https://example.com/b.jpg' }
        ],
        costs: [
          { date: '2026-01-10', concept: 'Filtro', amount: 50 },
          { date: '2026-01-02', concept: 'Mano de obra', amount: 100 }
        ]
      }
    });

    expect(payload.images[0].caption).toBe('Después');
    expect(payload.costs[0].concept).toBe('Mano de obra');
    expect(payload.totals.totalCost).toBe(150);

    const v = validateManualReportPayload(payload);
    expect(v.ok).toBe(true);
  });
});

