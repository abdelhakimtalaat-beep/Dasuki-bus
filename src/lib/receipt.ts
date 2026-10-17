/**
 * تجهيز صورة إيصال التحويل قبل رفعها:
 * تصغير الأبعاد وضغطها JPEG داخل المتصفح حتى تصبح صغيرة (عادة 100–300 كيلوبايت)
 * فيكون الرفع سريعًا حتى على باقة موبايل ضعيفة، ولا تمتلئ قاعدة البيانات.
 */
import { ApiError } from './errors';

/** الحد الأقصى لطول الصورة بعد الترميز (يطابق قيد قاعدة البيانات 620000 مع هامش) */
export const MAX_RECEIPT_CHARS = 600_000;
const MAX_SIDE = 1400;

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
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new ApiError('INVALID_RECEIPT');
  }
}

export async function compressReceipt(file: File): Promise<string> {
  if (!isImageFile(file)) throw new ApiError('INVALID_RECEIPT');
  const img = await decode(file);
  try {
    let side = MAX_SIDE;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { width, height } = fitWithin(img.width, img.height, side);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new ApiError('INVALID_RECEIPT');
      ctx.fillStyle = '#fff'; // خلفية بيضاء للصور الشفافة (PNG)
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img.source, 0, 0, width, height);
      for (const q of [0.8, 0.7, 0.6, 0.5]) {
        const data = canvas.toDataURL('image/jpeg', q);
        if (data.startsWith('data:image/jpeg;base64,') && data.length <= MAX_RECEIPT_CHARS) return data;
      }
      side = Math.round(side * 0.7);
    }
    throw new ApiError('RECEIPT_TOO_LARGE');
  } finally {
    img.done();
  }
}
