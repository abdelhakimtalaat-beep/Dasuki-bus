/**
 * تجهيز الصور قبل رفعها: تصغير الأبعاد وضغطها JPEG داخل المتصفح،
 * فيكون الرفع سريعًا حتى على باقة موبايل ضعيفة.
 */
import { ApiError } from './errors';

/** أبعاد جديدة تحافظ على النسبة ولا تتجاوز maxSide (لا تكبّر الصور الصغيرة). */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function isImageFile(file: { type: string; name: string }): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
    } catch {
      /* نجرب الطريقة التقليدية */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ApiError('INVALID_PHOTO');
  }
}

/** يرجع data URL بصيغة JPEG لا يتجاوز طوله maxChars. */
export async function compressImage(file: File, opts: { maxSide?: number; maxChars?: number } = {}): Promise<string> {
  const maxChars = opts.maxChars ?? 420_000;
  if (!isImageFile(file)) throw new ApiError('INVALID_PHOTO');
  const img = await decode(file);
  try {
    let side = opts.maxSide ?? 1000;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { width, height } = fitWithin(img.width, img.height, side);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ApiError('INVALID_PHOTO');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img.source, 0, 0, width, height);
      for (const q of [0.82, 0.72, 0.62, 0.5]) {
        const data = canvas.toDataURL('image/jpeg', q);
        if (data.startsWith('data:image/jpeg;base64,') && data.length <= maxChars) return data;
      }
      side = Math.round(side * 0.7);
    }
    throw new ApiError('PHOTO_TOO_LARGE');
  } finally {
    img.done();
  }
}
