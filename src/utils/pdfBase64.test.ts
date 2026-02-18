import { describe, expect, it } from 'vitest';
import { isPdfBase64 } from './pdfBase64';

describe('pdfBase64', () => {
  it('detects a valid PDF base64 header', () => {
    const sample = btoa('%PDF-1.7\n');
    expect(isPdfBase64(sample)).toBe(true);
  });

  it('rejects non-pdf base64', () => {
    const sample = btoa('hello');
    expect(isPdfBase64(sample)).toBe(false);
  });
});

