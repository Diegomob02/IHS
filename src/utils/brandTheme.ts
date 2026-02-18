export type ThemeColors = {
  primary: string;
  primaryForeground: string;
  background: string;
  accent: string;
  accentForeground: string;
  textMain: string;
  textSecondary: string;
  muted: string;
  mutedForeground: string;
  border: string;
};

export const DEFAULT_THEME_COLORS: ThemeColors = {
  primary: '#712F34',
  primaryForeground: '#FFFFFF',
  background: '#F5F1EC',
  accent: '#E5A663',
  accentForeground: '#2C2C2C',
  textMain: '#2C2C2C',
  textSecondary: '#6B6B6B',
  muted: '#F5F5F5',
  mutedForeground: '#6B6B6B',
  border: '#E6DDD4',
};

type RgbTuple = [number, number, number];

export function clamp255(n: number) {
  if (Number.isNaN(n) || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function hexToRgbTuple(hex: string): RgbTuple | null {
  const value = String(hex || '').trim().replace(/^#/, '');
  if (![3, 6].includes(value.length)) return null;

  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return null;

  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return [r, g, b];
}

export function rgbTupleToCssVarValue(rgb: RgbTuple) {
  const [r, g, b] = rgb;
  return `${clamp255(r)} ${clamp255(g)} ${clamp255(b)}`;
}

export function applyThemeToDocumentRoot(colors: ThemeColors) {
  const root = document.documentElement;

  const map: Array<[keyof ThemeColors, string]> = [
    ['primary', '--color-primary'],
    ['primaryForeground', '--color-primary-foreground'],
    ['background', '--color-background'],
    ['accent', '--color-accent'],
    ['accentForeground', '--color-accent-foreground'],
    ['textMain', '--color-text-main'],
    ['textSecondary', '--color-text-secondary'],
    ['muted', '--color-muted'],
    ['mutedForeground', '--color-muted-foreground'],
    ['border', '--color-border'],
  ];

  for (const [key, varName] of map) {
    const rgb = hexToRgbTuple(colors[key]);
    if (!rgb) continue;
    root.style.setProperty(varName, rgbTupleToCssVarValue(rgb));
  }
}

export function normalizeThemeColors(input: any): ThemeColors {
  const c = input?.colors ?? input ?? {};
  const merged: ThemeColors = {
    ...DEFAULT_THEME_COLORS,
    ...Object.fromEntries(
      Object.keys(DEFAULT_THEME_COLORS).map((k) => {
        const key = k as keyof ThemeColors;
        const v = c?.[key] ?? c?.[String(key)] ?? c?.[camelToSnake(String(key))];
        return [key, typeof v === 'string' ? v : DEFAULT_THEME_COLORS[key]];
      })
    ),
  };

  return merged;
}

function camelToSnake(input: string) {
  return input.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

