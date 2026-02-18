import { describe, expect, it } from 'vitest';
import { selectPdfTemplate } from './selectPdfTemplate';

describe('selectPdfTemplate', () => {
  it('selects by report_key and priority', () => {
    const tpl = selectPdfTemplate(
      [
        { id: 'a', name: 'A', report_key: 'property_monthly_maintenance', enabled: true, priority: 50, template_spec: {}, match_rules: {} },
        { id: 'b', name: 'B', report_key: 'property_monthly_maintenance', enabled: true, priority: 10, template_spec: {}, match_rules: {} },
      ] as any,
      { reportKey: 'property_monthly_maintenance' }
    );
    expect(tpl?.id).toBe('b');
  });

  it('filters by min_total_cost and has_images', () => {
    const tpl = selectPdfTemplate(
      [
        {
          id: 'a',
          name: 'A',
          report_key: 'property_monthly_maintenance',
          enabled: true,
          priority: 10,
          template_spec: {},
          match_rules: { min_total_cost: 1000, has_images: true },
        },
        {
          id: 'b',
          name: 'B',
          report_key: 'property_monthly_maintenance',
          enabled: true,
          priority: 20,
          template_spec: {},
          match_rules: {},
        },
      ] as any,
      { reportKey: 'property_monthly_maintenance', totalCost: 1500, hasImages: true }
    );
    expect(tpl?.id).toBe('a');
  });
});

