import { DEFAULT_THEME_COLORS, ThemeColors } from './brandTheme';

type Rgb = [number, number, number];

function rgbToHex([r, g, b]: Rgb) {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function toRgbTuple(data: Uint8ClampedArray, i: number): Rgb {
  return [data[i], data[i + 1], data[i + 2]];
}

function luminance([r, g, b]: Rgb) {
  const srgb = [r, g, b].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function saturation([r, g, b]: Rgb) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

function distance(a: Rgb, b: Rgb) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function kmeans(pixels: Rgb[], k: number, iters: number) {
  const centers: Rgb[] = [];
  for (let i = 0; i < k; i++) {
    centers.push(pixels[Math.floor((pixels.length - 1) * (i / Math.max(1, k - 1)))]);
  }

  const assignments = new Array<number>(pixels.length).fill(0);

  for (let t = 0; t < iters; t++) {
    for (let i = 0; i < pixels.length; i++) {
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centers.length; c++) {
        const d = distance(pixels[i], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignments[i] = best;
    }

    const sum = new Array(k).fill(0).map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (let i = 0; i < pixels.length; i++) {
      const a = assignments[i];
      sum[a].r += pixels[i][0];
      sum[a].g += pixels[i][1];
      sum[a].b += pixels[i][2];
      sum[a].n += 1;
    }

    for (let c = 0; c < k; c++) {
      if (sum[c].n === 0) continue;
      centers[c] = [
        Math.round(sum[c].r / sum[c].n),
        Math.round(sum[c].g / sum[c].n),
        Math.round(sum[c].b / sum[c].n),
      ];
    }
  }

  const counts = new Array(k).fill(0);
  for (const a of assignments) counts[a] += 1;

  return centers
    .map((c, idx) => ({ c, n: counts[idx] }))
    .sort((a, b) => b.n - a.n)
    .map((x) => x.c);
}

export async function extractThemeFromLogoFile(file: File): Promise<ThemeColors> {
  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('El logo excede 2MB.');
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isSvg = file.type === 'image/svg+xml' || ext === 'svg';
  if (isSvg) {
    const text = await file.text();
    const hexMatches = Array.from(text.matchAll(/#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g)).map((m) => `#${m[1]}`);
    const uniq = Array.from(new Set(hexMatches)).slice(0, 8);
    if (uniq.length === 0) return DEFAULT_THEME_COLORS;
    return mapPaletteToTheme(uniq);
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const size = 72;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return DEFAULT_THEME_COLORS;
    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size);
    const pixels: Rgb[] = [];
    for (let i = 0; i < imageData.data.length; i += 4) {
      const a = imageData.data[i + 3];
      if (a < 220) continue;
      const rgb = toRgbTuple(imageData.data, i);
      const lum = luminance(rgb);
      if (lum < 0.02 || lum > 0.98) continue;
      pixels.push(rgb);
    }
    if (pixels.length < 50) return DEFAULT_THEME_COLORS;
    const centers = kmeans(pixels, 6, 8);
    const palette = centers.map(rgbToHex);
    return mapPaletteToTheme(palette);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function mapPaletteToTheme(paletteHex: string[]): ThemeColors {
  const paletteRgb: Array<{ hex: string; rgb: Rgb; lum: number; sat: number }> = paletteHex
    .map((hex) => hex.trim().toUpperCase())
    .map((hex) => {
      const rgb = hexToRgb(hex);
      return { hex, rgb, lum: luminance(rgb), sat: saturation(rgb) };
    })
    .filter((x) => x.hex.startsWith('#'));

  if (paletteRgb.length === 0) return DEFAULT_THEME_COLORS;

  const byLumAsc = [...paletteRgb].sort((a, b) => a.lum - b.lum);
  const byLumDesc = [...paletteRgb].sort((a, b) => b.lum - a.lum);
  const bySatDesc = [...paletteRgb].sort((a, b) => b.sat - a.sat);

  const background = byLumDesc[0].hex;
  const textMain = byLumAsc[0].hex;

  const primaryCandidate = bySatDesc.find((c) => c.lum > 0.2 && c.lum < 0.75) || bySatDesc[0];
  const accentCandidate =
    bySatDesc.find((c) => c.hex !== primaryCandidate.hex && c.lum > 0.25 && c.lum < 0.85) ||
    bySatDesc[1] ||
    primaryCandidate;

  const muted = adjustToward(background, textMain, 0.08);
  const border = adjustToward(background, textMain, 0.14);

  return {
    primary: primaryCandidate.hex,
    primaryForeground: pickForeground(primaryCandidate.rgb),
    background,
    accent: accentCandidate.hex,
    accentForeground: pickForeground(accentCandidate.rgb),
    textMain,
    textSecondary: adjustToward(textMain, background, 0.55),
    muted,
    mutedForeground: adjustToward(textMain, background, 0.55),
    border,
  };
}

function hexToRgb(hex: string): Rgb {
  const v = hex.replace('#', '').trim();
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function pickForeground(rgb: Rgb) {
  return luminance(rgb) > 0.55 ? '#2C2C2C' : '#FFFFFF';
}

function adjustToward(fromHex: string, toHex: string, amount: number) {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const a = clamp(amount, 0, 1);
  const rgb: Rgb = [
    Math.round(from[0] + (to[0] - from[0]) * a),
    Math.round(from[1] + (to[1] - from[1]) * a),
    Math.round(from[2] + (to[2] - from[2]) * a),
  ];
  return rgbToHex(rgb);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer el logo.'));
    img.src = url;
  });
}

