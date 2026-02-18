import { describe, expect, it } from 'vitest';
import { mapPaletteToTheme } from './palette';

describe('palette', () => {
  it('mapPaletteToTheme returns a complete theme with valid hex colors', () => {
    const theme = mapPaletteToTheme(['#712F34', '#E5A663', '#F5F1EC', '#2C2C2C', '#6B6B6B']);
    expect(theme.primary).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.background).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.textMain).toMatch(/^#[0-9A-F]{6}$/);
    expect(theme.border).toMatch(/^#[0-9A-F]{6}$/);
  });
});

