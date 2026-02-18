import { describe, expect, it } from 'vitest';
import { hexToRgbTuple, normalizeThemeColors, rgbTupleToCssVarValue } from './brandTheme';

describe('brandTheme', () => {
  it('hexToRgbTuple parses 6-digit hex', () => {
    expect(hexToRgbTuple('#000000')).toEqual([0, 0, 0]);
    expect(hexToRgbTuple('#FFFFFF')).toEqual([255, 255, 255]);
    expect(hexToRgbTuple('#712F34')).toEqual([113, 47, 52]);
  });

  it('hexToRgbTuple parses 3-digit hex', () => {
    expect(hexToRgbTuple('#abc')).toEqual([170, 187, 204]);
  });

  it('rgbTupleToCssVarValue formats correctly', () => {
    expect(rgbTupleToCssVarValue([1, 2, 3])).toBe('1 2 3');
  });

  it('normalizeThemeColors merges partial theme_json', () => {
    const theme = normalizeThemeColors({ colors: { primary: '#000000' } });
    expect(theme.primary).toBe('#000000');
    expect(theme.background).toMatch(/^#/);
  });
});

