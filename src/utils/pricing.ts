export function parsePositiveNumber(input: string): number | null {
  const normalized = String(input ?? '').trim();
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  if (value < 0) return null;
  return value;
}

export function formatPriceError(input: string): string | null {
  const normalized = String(input ?? '').trim();
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return 'El precio debe ser un número válido.';
  if (value < 0) return 'El precio debe ser un valor positivo.';
  return null;
}
