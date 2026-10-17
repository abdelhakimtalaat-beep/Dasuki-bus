import { useRef, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorMessage, toApiError } from '../lib/errors';
import { bookingWindow, formatDateTime, type BookingWindow } from '../lib/format';
import type { BookingResult, PickupPoint, Trip } from '../lib/types';
import {
  cleanName,
  newRequestId,
  normalizePhone,
  validateBookingForm,
  type BookingFormErrors,
  type BookingFormValues,
} from '../lib/validation';
import { Button, Field, Input, Select, Textarea, cx } from './ui';
import { InstaPayBox } from './Payment';

const EMPTY: BookingFormValues = { full_name: '', seats: 1, pickup_point_id: '', phone: '', notes: '' };

export function windowMessage(w: BookingWindow, trip: Trip): string | null {
  switch (w) {
    case 'not_yet':
      return `يبدأ الحجز لهذه الرحلة ${formatDateTime(trip.booking_opens_at)}.`;
    case 'ended':
      return 'انتهت فترة الحجز لهذه الرحلة.';
    case 'closed':
      return 'الحجز مغلق لهذه الرحلة.';
    case 'full':
      return 'اكتملت سعة الأتوبيس لهذه الرحلة.';
    case 'cancelled':
      return 'هذه الرحلة ملغاة.';
    default:
      return null;
  }
}

export function BookingForm({
  trip,
  points,
  remaining,
  onBooked,
  adminMode = false,
}: {
  trip: Trip;
  points: PickupPoint[];
  remaining: number;
  onBooked: (r: BookingResult) => void;
  /** المسؤول يمكنه الحجز خارج فترة الحجز (السعة تبقى محمية على الخادم) */
  adminMode?: boolean;
}) {
  const [v, setV] = useState<BookingFormValues>(EMPTY);
  const [errors, setErrors] = useState<BookingFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // نفس المعرف لكل محاولات إرسال نفس الحجز ← لا تكرار حتى لو أُعيد الإرسال بعد انقطاع الشبكة
  const requestId = useRef(newRequestId());
  const inFlight = useRef(false);

  const w = bookingWindow(trip);
  const blocked = !adminMode && w !== 'open';
  const msg = adminMode ? (w === 'cancelled' ? windowMessage(w, trip) : null) : windowMessage(w, trip);
  const usable = adminMode ? points : points.filter((p) => p.is_active);
  const maxPer = adminMode ? remaining : Math.min(remaining, trip.max_seats_per_booking);

  const set = <K extends keyof BookingFormValues>(k: K, val: BookingFormValues[K]) => {
    setV((x) => ({ ...x, [k]: val }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
    setServerError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (inFlight.current || blocked) return; // منع الضغط المتكرر
    const errs = validateBookingForm(
      v,
      { remaining, maxPerBooking: adminMode ? 50 : trip.max_seats_per_booking },
      { phoneRequired: !adminMode },
    );
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      document.getElementById(`bf-${first}`)?.focus();
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setServerError(null);
    try {
      const r = await api.createBooking({
        trip_id: trip.id,
        full_name: cleanName(v.full_name),
        seats: v.seats,
        pickup_point_id: v.pickup_point_id,
        phone: normalizePhone(v.phone),
        notes: v.notes.trim() || null,
        client_request_id: requestId.current,
      });
      requestId.current = newRequestId();
      setV(EMPTY);
      onBooked(r);
    } catch (err) {
      const code = toApiError(err).code;
      setServerError(errorMessage(err));
      if (code === 'PICKUP_REQUIRED' || code === 'INVALID_PICKUP_POINT') setErrors({ pickup_point_id: errorMessage(err) });
      if (code === 'DUPLICATE_NAME') setErrors({ full_name: errorMessage(err) });
      if (code === 'DUPLICATE_PHONE' || code === 'PHONE_REQUIRED' || code === 'INVALID_PHONE') setErrors({ phone: errorMessage(err) });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {msg && (
        <div role="status" className="rounded-xl border border-brass-500/40 bg-brass-100 px-4 py-3 font-bold text-brass-700">
          {msg}
        </div>
      )}
      <fieldset disabled={blocked || submitting} className="flex flex-col gap-5 disabled:opacity-70">
        <Field label="الاسم الكامل" htmlFor="bf-full_name" error={errors.full_name}>
          <Input
            id="bf-full_name"
            autoComplete="name"
            value={v.full_name}
            onChange={(e) => set('full_name', e.target.value)}
            invalid={!!errors.full_name}
            placeholder="مثال: محمد أحمد السيد"
            maxLength={100}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="عدد المقاعد"
            htmlFor="bf-seats"
            error={errors.seats}
            hint={remaining > 0 ? `متاح حتى ${Math.max(maxPer, 0)} في هذا الحجز` : undefined}
          >
            <div className="flex h-12 items-stretch overflow-hidden rounded-lg border border-line bg-white focus-within:border-pine-600 focus-within:ring-2 focus-within:ring-pine-600/25">
              <button
                type="button"
                className="w-12 text-2xl font-bold text-pine-700 hover:bg-pine-50 disabled:text-muted/40"
                onClick={() => set('seats', Math.min(Math.max(maxPer, 1), v.seats + 1))}
                disabled={v.seats >= maxPer}
                aria-label="زيادة عدد المقاعد"
              >
                +
              </button>
              <input
                id="bf-seats"
                inputMode="numeric"
                className="w-full border-x border-line text-center text-lg font-extrabold tabular-nums focus:outline-none"
                value={v.seats}
                onChange={(e) => {
                  const n = parseInt(e.target.value.replace(/[^\d٠-٩]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))) || '0', 10);
                  set('seats', Number.isNaN(n) ? 0 : n);
                }}
                aria-invalid={!!errors.seats || undefined}
              />
              <button
                type="button"
                className="w-12 text-2xl font-bold text-pine-700 hover:bg-pine-50 disabled:text-muted/40"
                onClick={() => set('seats', Math.max(1, v.seats - 1))}
                disabled={v.seats <= 1}
                aria-label="تقليل عدد المقاعد"
              >
                −
              </button>
            </div>
          </Field>

          <Field label="نقطة التجمع" htmlFor="bf-pickup_point_id" error={errors.pickup_point_id}>
            <Select
              id="bf-pickup_point_id"
              value={v.pickup_point_id}
              onChange={(e) => set('pickup_point_id', e.target.value)}
              invalid={!!errors.pickup_point_id}
            >
              <option value="">اختر نقطة التجمع</option>
              {usable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.description ? ` — ${p.description}` : ''}
                  {!p.is_active ? ' (موقوفة)' : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="رقم الهاتف"
          optional={adminMode}
          htmlFor="bf-phone"
          error={errors.phone}
          hint="يظهر للمسؤول فقط. ستحتاجه مع اسمك لتعديل حجزك أو إلغائه."
        >
          <Input
            id="bf-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            className="text-right"
            value={v.phone}
            onChange={(e) => set('phone', e.target.value)}
            invalid={!!errors.phone}
            placeholder="01xxxxxxxxx"
            maxLength={20}
          />
        </Field>

        <Field label="ملاحظات" optional htmlFor="bf-notes" error={errors.notes}>
          <Textarea
            id="bf-notes"
            value={v.notes}
            onChange={(e) => set('notes', e.target.value)}
            invalid={!!errors.notes}
            maxLength={500}
            rows={2}
            placeholder="سأركب معكم من على الطريق عند ....."
          />
        </Field>
      </fieldset>

      {!adminMode && !blocked && (
        <InstaPayBox number={trip.instapay_number} seatPrice={trip.seat_price} seats={v.seats >= 1 ? v.seats : 1} />
      )}

      {serverError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-800">
          {serverError}
        </p>
      )}

      <Button
        type="submit"
        loading={submitting}
        disabled={blocked}
        className={cx('min-h-14 w-full text-lg', blocked && 'bg-gray-400')}
      >
        {submitting ? 'جارٍ تسجيل الحجز…' : 'تأكيد وتسجيل الحجز'}
      </Button>
    </form>
  );
}
