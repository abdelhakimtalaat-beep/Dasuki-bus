/**
 * التحقق من المدخلات في الواجهة — لتجربة استخدام سريعة فقط.
 * التحقق الحاسم يتم مرة أخرى داخل قاعدة البيانات (create_booking + القيود).
 */

import { seatsWord } from './format';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function toLatinDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (ch) => {
    const a = ARABIC_DIGITS.indexOf(ch);
    return String(a >= 0 ? a : PERSIAN_DIGITS.indexOf(ch));
  });
}

/** يطابق public.normalize_phone في قاعدة البيانات. يرجع null للقيمة الفارغة. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (input == null || input.trim() === '') return null;
  let d = toLatinDigits(input).replace(/\D/g, '');
  if (d.startsWith('0020')) d = d.slice(4);
  else if (d.startsWith('20') && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith('1')) d = '0' + d;
  return d;
}

export const EGYPT_MOBILE_RE = /^01[0125]\d{8}$/;

export function isValidEgyptianPhone(input: string): boolean {
  const n = normalizePhone(input);
  return n !== null && EGYPT_MOBILE_RE.test(n);
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

export interface BookingFormValues {
  full_name: string;
  seats: number;
  pickup_point_id: string;
  phone: string;
  notes: string;
}

export type BookingFormErrors = Partial<Record<keyof BookingFormValues, string>>;

export function validateBookingForm(
  v: BookingFormValues,
  limits: { remaining: number; maxPerBooking: number },
): BookingFormErrors {
  const errors: BookingFormErrors = {};
  const name = cleanName(v.full_name);
  if (name.length < 3) errors.full_name = 'اكتب الاسم الكامل (3 أحرف على الأقل).';
  else if (name.length > 100) errors.full_name = 'الاسم طويل جدًا.';

  if (!Number.isInteger(v.seats) || v.seats < 1) {
    errors.seats = 'عدد المقاعد يجب أن يكون 1 على الأقل.';
  } else if (v.seats > limits.remaining) {
    errors.seats =
      limits.remaining > 0
        ? `المتاح حاليًا ${seatsWord(limits.remaining)} فقط.`
        : 'اكتملت سعة الأتوبيس.';
  } else if (v.seats > limits.maxPerBooking) {
    errors.seats = `الحد الأقصى للحجز الواحد ${seatsWord(limits.maxPerBooking)}.`;
  }

  if (!v.pickup_point_id) errors.pickup_point_id = 'يرجى اختيار نقطة التجمع.';

  if (v.phone.trim() !== '' && !isValidEgyptianPhone(v.phone)) {
    errors.phone = 'رقم مصري من 11 رقمًا يبدأ بـ 010 أو 011 أو 012 أو 015.';
  }
  if (v.notes.length > 500) errors.notes = 'الملاحظات 500 حرف كحد أقصى.';
  return errors;
}

/** معرف فريد لكل محاولة إرسال — يمنع تكرار الحجز عند الضغط المتكرر أو إعادة المحاولة. */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
