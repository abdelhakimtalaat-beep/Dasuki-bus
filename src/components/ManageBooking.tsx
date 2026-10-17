import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatMoney, seatsWord } from '../lib/format';
import { cleanName, isValidEgyptianPhone } from '../lib/validation';
import { toWhatsAppNumber, whatsAppPaymentLink } from '../lib/whatsapp';
import type { MyBooking, Trip } from '../lib/types';
import { Button, Field, Input, cx, useToast } from './ui';

const LOCK_TEXT: Record<string, string> = {
  BOOKING_CLOSED: 'انتهت فترة الحجز، ولم يعد التعديل متاحًا من الموقع. تواصل مع مسؤول الرحلة.',
  BOOKING_NOT_OPEN_YET: 'لم تبدأ فترة الحجز بعد.',
  TRIP_CANCELLED: 'هذه الرحلة ملغاة.',
};

/**
 * الراكب يعدّل عدد مقاعده أو يلغي حجزه بنفسه — بالاسم + رقم الهاتف (دون حساب أو رقم حجز).
 * كل القيود (السعة، فترة الحجز، الحجز المدفوع) يتحقق منها الخادم أيضًا.
 */
export function ManageBooking({ trip, onChanged }: { trip: Trip; onChanged: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [mine, setMine] = useState<MyBooking | null>(null);
  const [seats, setSeats] = useState(1);
  const [busy, setBusy] = useState<'find' | 'save' | 'cancel' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const reset = () => {
    setMine(null);
    setConfirmCancel(false);
    setErr(null);
  };

  async function find(e?: FormEvent) {
    e?.preventDefault();
    setErr(null);
    if (cleanName(name).length < 3) return setErr('اكتب اسمك كما سجلته في الحجز.');
    if (!isValidEgyptianPhone(phone)) return setErr('اكتب رقم الهاتف الذي سجلته في الحجز.');
    setBusy('find');
    try {
      const b = await api.findMyBooking(trip.id, cleanName(name), phone);
      setMine(b);
      setSeats(b.seats);
      setConfirmCancel(false);
    } catch (x) {
      setMine(null);
      setErr(errorMessage(x));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!mine) return;
    setBusy('save');
    setErr(null);
    try {
      await api.updateMyBooking(trip.id, cleanName(name), phone, seats);
      toast(`تم تعديل حجزك إلى ${seatsWord(seats)}.`, 'success');
      onChanged();
      await find();
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy('cancel');
    setErr(null);
    try {
      await api.cancelMyBooking(trip.id, cleanName(name), phone);
      toast('تم إلغاء حجزك، وأصبحت المقاعد متاحة لغيرك.', 'success');
      onChanged();
      setMine(null);
      setConfirmCancel(false);
      setName('');
      setPhone('');
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(null);
    }
  }

  const locked = mine?.locked_reason ?? null;
  const changed = mine && seats !== mine.seats;
  const max = mine ? Math.max(mine.max_seats, mine.seats) : 1;

  return (
    <div>
      <form onSubmit={find} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="الاسم كما سجلته" htmlFor="mb-name">
          <Input
            id="mb-name"
            autoComplete="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              reset();
            }}
            maxLength={100}
          />
        </Field>
        <Field label="رقم الهاتف" htmlFor="mb-phone">
          <Input
            id="mb-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            className="text-right"
            placeholder="01xxxxxxxxx"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              reset();
            }}
            maxLength={20}
          />
        </Field>
        <Button type="submit" variant="secondary" loading={busy === 'find'} className="min-h-12">
          اعرض حجزي
        </Button>
      </form>

      {err && (
        <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-semibold text-red-800">
          {err}
        </p>
      )}

      {mine && (
        <div className="mt-4 rounded-xl border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-lg font-extrabold">{mine.full_name}</p>
            <span
              className={cx(
                'rounded-full px-2.5 py-0.5 text-[13px] font-bold',
                mine.is_paid ? 'bg-pine-800 text-white' : 'bg-leaf-300/60 text-pine-900',
              )}
            >
              {mine.is_paid ? 'مدفوع' : 'بانتظار الدفع'}
            </span>
          </div>
          <p className="mt-1 text-muted">
            {seatsWord(mine.seats)} — {mine.pickup_point_name} — {formatMoney(mine.seats * trip.seat_price)}
          </p>

          {locked === 'PAID_LOCKED' ? (
            <div className="mt-3 rounded-lg bg-pine-50 p-3 text-[15px]">
              <p>حجزك مؤكد الدفع. لزيادة أو تقليل المقاعد أو الإلغاء تواصل مع مسؤول الرحلة.</p>
              {trip.instapay_number && (
                <a
                  className="mt-2 inline-flex min-h-10 items-center rounded-lg bg-[#1f9e4f] px-4 font-bold text-white hover:bg-[#188341]"
                  href={`https://wa.me/${toWhatsAppNumber(trip.instapay_number)}?text=${encodeURIComponent(
                    `السلام عليكم، أريد تعديل حجزي في رحلة سيدي إبراهيم الدسوقي.\nالاسم: ${mine.full_name}\nعدد المقاعد الحالي: ${mine.seats}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  تواصل على واتساب
                </a>
              )}
            </div>
          ) : locked ? (
            <p className="mt-3 rounded-lg bg-brass-100 p-3 font-semibold text-brass-700">
              {LOCK_TEXT[locked] ?? errorMessage({ message: locked })}
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <span className="font-bold">عدد المقاعد:</span>
                <div className="flex h-12 items-stretch overflow-hidden rounded-lg border border-line bg-white">
                  <button
                    type="button"
                    className="w-12 text-2xl font-bold text-pine-700 hover:bg-pine-50 disabled:text-muted/40"
                    onClick={() => setSeats((n) => Math.min(max, n + 1))}
                    disabled={seats >= max}
                    aria-label="زيادة عدد المقاعد"
                  >
                    +
                  </button>
                  <span className="flex w-14 items-center justify-center border-x border-line text-lg font-extrabold tabular-nums">
                    {seats}
                  </span>
                  <button
                    type="button"
                    className="w-12 text-2xl font-bold text-pine-700 hover:bg-pine-50 disabled:text-muted/40"
                    onClick={() => setSeats((n) => Math.max(1, n - 1))}
                    disabled={seats <= 1}
                    aria-label="تقليل عدد المقاعد"
                  >
                    −
                  </button>
                </div>
                <span className="text-sm text-muted">الحد الأقصى المتاح لك الآن: {max}</span>
              </div>
              {changed && (
                <p className="mt-2 text-[15px]">
                  المبلغ بعد التعديل: <b className="tabular-nums">{formatMoney(seats * trip.seat_price)}</b>
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => void save()} disabled={!changed} loading={busy === 'save'}>
                  حفظ عدد المقاعد
                </Button>
                {!confirmCancel ? (
                  <Button variant="danger" onClick={() => setConfirmCancel(true)}>
                    إلغاء الحجز
                  </Button>
                ) : (
                  <span className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-[15px] font-semibold text-red-800">
                    تأكيد إلغاء الحجز كاملًا؟
                    <Button
                      variant="danger"
                      className="min-h-9 border-red-300 bg-red-700 text-white hover:bg-red-800"
                      loading={busy === 'cancel'}
                      onClick={() => void cancel()}
                    >
                      نعم، ألغِ حجزي
                    </Button>
                    <Button variant="ghost" className="min-h-9" onClick={() => setConfirmCancel(false)}>
                      تراجع
                    </Button>
                  </span>
                )}
              </div>
              {changed && seats > mine.seats && trip.instapay_number && (
                <p className="mt-3 text-sm text-muted">
                  بعد الحفظ حوّل فرق المبلغ وأرسل الإيصال على واتساب:{' '}
                  <a
                    className="font-bold text-pine-700 underline"
                    href={whatsAppPaymentLink(trip.instapay_number, trip.seat_price, {
                      name: mine.full_name,
                      seats,
                      pickupPoint: mine.pickup_point_name,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    واتساب
                  </a>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
