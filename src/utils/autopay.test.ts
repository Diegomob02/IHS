import { describe, expect, it } from 'vitest';
import { formatPeriodYyyymm, makeAutopayIdempotencyKey, sanitizeFailureMessageSafe } from './autopay';

describe('Autopay utils', () => {
  it('formatPeriodYyyymm formats UTC date as YYYYMM', () => {
    expect(formatPeriodYyyymm(new Date(Date.UTC(2026, 0, 15)))).toBe('202601');
    expect(formatPeriodYyyymm(new Date(Date.UTC(2026, 10, 1)))).toBe('202611');
  });

  it('makeAutopayIdempotencyKey creates stable keys', () => {
    expect(
      makeAutopayIdempotencyKey({ leaseId: 'abc', periodYyyymm: '202601', attemptNo: 1, kind: 'scheduled' }),
    ).toBe('lease:abc:202601:scheduled:1');
  });

  it('sanitizeFailureMessageSafe trims and caps length', () => {
    expect(sanitizeFailureMessageSafe('')).toBeNull();
    expect(sanitizeFailureMessageSafe('  hola ')).toBe('hola');
    expect(sanitizeFailureMessageSafe('a'.repeat(200))?.length).toBe(160);
  });
});

