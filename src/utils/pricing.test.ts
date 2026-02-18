import { describe, expect, it } from 'vitest';
import { formatPriceError, parsePositiveNumber } from './pricing';

describe('pricing utils', () => {
  it('parses valid positive numbers', () => {
    expect(parsePositiveNumber('0')).toBe(0);
    expect(parsePositiveNumber('10')).toBe(10);
    expect(parsePositiveNumber('10.50')).toBe(10.5);
  });

  it('rejects invalid or negative numbers', () => {
    expect(parsePositiveNumber('')).toBeNull();
    expect(parsePositiveNumber('abc')).toBeNull();
    expect(parsePositiveNumber('-1')).toBeNull();
  });

  it('returns helpful error messages', () => {
    expect(formatPriceError('')).toBeNull();
    expect(formatPriceError('abc')).toBe('El precio debe ser un número válido.');
    expect(formatPriceError('-1')).toBe('El precio debe ser un valor positivo.');
    expect(formatPriceError('1')).toBeNull();
  });
});

