export function isPdfBase64(value: string) {
  try {
    const b64 = String(value || '').trim();
    if (!b64) return false;
    const bytes = Uint8Array.from(atob(b64.slice(0, 40)), (c) => c.charCodeAt(0));
    const header = new TextDecoder().decode(bytes);
    return header.startsWith('%PDF');
  } catch {
    return false;
  }
}

