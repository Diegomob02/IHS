import { describe, expect, it } from 'vitest';
import { formatAuthorizedReportText } from './authorizedReportFormatter';

describe('authorizedReportFormatter', () => {
  it('parses headings, paragraphs and bullets', () => {
    const out = formatAuthorizedReportText(`# Título\n\nTexto uno.\n- item a\n- item b\n\n## Sección\nTexto dos.`);
    expect(out.title).toBe('Título');
    expect(out.blocks.some((b) => b.type === 'heading')).toBe(true);
    expect(out.blocks.some((b) => b.type === 'bullets')).toBe(true);
  });

  it('strips html tags', () => {
    const out = formatAuthorizedReportText('<b>hola</b>');
    const text = out.blocks.map((b: any) => b.text || '').join(' ');
    expect(text.includes('<b>')).toBe(false);
  });
});

