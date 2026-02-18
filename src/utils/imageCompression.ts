export async function compressImageToJpeg(
  file: File,
  opts?: { maxDimensionPx?: number; quality?: number },
): Promise<{ blob: Blob; width: number; height: number }> {
  const maxDimensionPx = opts?.maxDimensionPx ?? 1600;
  const quality = opts?.quality ?? 0.8;

  const bitmap = await createImageBitmap(file);
  const { width: srcW, height: srcH } = bitmap;
  const scale = Math.min(1, maxDimensionPx / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo inicializar canvas');
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (!b) reject(new Error('No se pudo comprimir la imagen'));
        else resolve(b);
      },
      'image/jpeg',
      quality,
    );
  });

  bitmap.close();
  return { blob, width, height };
}

