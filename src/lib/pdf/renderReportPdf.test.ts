import { describe, expect, it } from 'vitest';
import { renderReportPdf } from './renderReportPdf';
import { formatAuthorizedReportText } from '../../utils/authorizedReportFormatter';

describe('renderReportPdf', () => {
  it('renders a minimal PDF', async () => {
    const formatted = formatAuthorizedReportText('# Reporte\n\nTexto de prueba.');
    const bytes = await renderReportPdf({
      propertyTitle: 'Propiedad Demo',
      propertyLocation: 'Cabo',
      month: '2026-02',
      formatted,
      costs: [{ date: '2026-02-01', concept: 'Servicio', amount: 100 }],
      totalCost: 100,
      images: [],
    });
    const header = new TextDecoder().decode(bytes.slice(0, 8));
    expect(header.startsWith('%PDF')).toBe(true);
  });
});

