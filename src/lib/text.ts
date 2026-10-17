/** توحيد الحروف العربية للبحث: أ/إ/آ → ا ، ة → ه ، ى → ي ، وإزالة التشكيل والمسافات الزائدة */
export function normalizeArabic(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
