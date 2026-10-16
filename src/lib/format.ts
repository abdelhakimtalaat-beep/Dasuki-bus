import type { Trip, TripStatus } from './types';

export const TZ = 'Africa/Cairo';
const LOCALE = 'ar-EG-u-nu-latn';

export function formatTripDate(date: string): string {
  // date = YYYY-MM-DD (تاريخ تقويمي بدون منطقة زمنية)
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatShortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h < 12 ? 'صباحًا' : 'مساءً';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatDateTimeFull(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

/** 300 → «300 جنيه» ، 15000 → «15,000 جنيه» */
export function formatMoney(n: number): string {
  const v = Number(n) || 0;
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} جنيه`;
}

export const STATUS_LABEL: Record<TripStatus, string> = {
  open: 'مفتوحة للحجز',
  full: 'مكتملة',
  closed: 'مغلقة',
  cancelled: 'ملغاة',
};

export type BookingWindow = 'open' | 'not_yet' | 'ended' | 'full' | 'closed' | 'cancelled';

/** الحالة الفعلية للحجز الآن (تجمع بين حالة الرحلة ونافذة الحجز). */
export function bookingWindow(trip: Trip, now = new Date()): BookingWindow {
  if (trip.status === 'cancelled') return 'cancelled';
  if (trip.status === 'closed') return 'closed';
  if (now > new Date(trip.booking_closes_at)) return 'ended';
  if (now < new Date(trip.booking_opens_at)) return 'not_yet';
  if (trip.status === 'full' || trip.booked_seats >= trip.capacity) return 'full';
  return 'open';
}

export function seatsWord(n: number): string {
  if (n === 1) return 'مقعد واحد';
  if (n === 2) return 'مقعدان';
  if (n >= 3 && n <= 10) return `${n} مقاعد`;
  return `${n} مقعدًا`;
}

/** تحويل ISO إلى قيمة لحقل datetime-local بتوقيت القاهرة. */
export function isoToCairoLocalInput(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  const hour = g('hour') === '24' ? '00' : g('hour');
  return `${g('year')}-${g('month')}-${g('day')}T${hour}:${g('minute')}`;
}

/** فرق توقيت القاهرة عن UTC بالدقائق في لحظة معينة (يدعم التوقيت الصيفي). */
function cairoOffsetMinutes(at: Date): number {
  const local = isoToCairoLocalInput(at.toISOString());
  const asUtc = Date.parse(local + ':00Z');
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** تحويل قيمة datetime-local (بتوقيت القاهرة) إلى ISO. */
export function cairoLocalInputToIso(local: string): string {
  const guess = new Date(Date.parse(local + ':00Z'));
  let offset = cairoOffsetMinutes(guess);
  let result = new Date(guess.getTime() - offset * 60000);
  offset = cairoOffsetMinutes(result); // تصحيح عند حدود التوقيت الصيفي
  result = new Date(guess.getTime() - offset * 60000);
  return result.toISOString();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function todayInCairo(): string {
  return isoToCairoLocalInput(new Date().toISOString()).slice(0, 10);
}
