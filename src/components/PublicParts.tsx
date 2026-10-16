import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { errorMessage } from '../lib/errors';
import { formatDateTime, formatMoney, formatTime, formatTripDate, seatsWord, STATUS_LABEL } from '../lib/format';
import type { BookingLookup, BookingResult, PublicBooking, Trip } from '../lib/types';
import { Badge, Button, EmptyState, Input, Modal, Select, cx } from './ui';
import { InstaPayBox } from './Payment';

// ------------------------------------------------------------------ نجاح الحجز
export function SuccessModal({
  result,
  trip,
  onClose,
}: {
  result: BookingResult | null;
  trip: Trip;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (!result) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.booking_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* المتصفح لا يدعم النسخ — الرقم ظاهر للتصوير */
    }
  };
  return (
    <Modal open onClose={onClose} title={result.already_existed ? 'هذا الحجز مسجّل بالفعل' : 'تم تسجيل الحجز بنجاح'}>
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border-2 border-dashed border-brass-500/60 bg-brass-100/60 p-4 text-center">
          <p className="text-sm font-bold text-brass-700">رقم الحجز — احتفظ به للرجوع إليه</p>
          <p dir="ltr" className="mt-1 text-[28px] font-extrabold tracking-wider text-ink tabular-nums">
            {result.booking_code}
          </p>
          <button onClick={copy} className="mt-1 text-sm font-bold text-pine-700 underline underline-offset-4">
            {copied ? 'تم النسخ' : 'نسخ رقم الحجز'}
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
          <dt className="text-muted">الاسم</dt>
          <dd className="font-bold">{result.full_name}</dd>
          <dt className="text-muted">عدد المقاعد</dt>
          <dd className="font-bold">{seatsWord(result.seats)}</dd>
          <dt className="text-muted">نقطة التجمع</dt>
          <dd className="font-bold">{result.pickup_point_name}</dd>
          <dt className="text-muted">الرحلة</dt>
          <dd className="font-bold">
            {formatTripDate(trip.trip_date)} — التحرك {formatTime(trip.departure_time)}
          </dd>
        </dl>
        <InstaPayBox
          number={trip.instapay_number}
          seatPrice={trip.seat_price}
          seats={result.seats}
          bookingCode={result.booking_code}
          compact
        />
        <p className="text-sm text-muted">
          صوّر هذه الشاشة أو انسخ رقم الحجز. لتعديل الحجز أو إلغائه تواصل مع مسؤول الرحلة واذكر رقم الحجز.
        </p>
        <Button onClick={onClose} className="w-full">
          تم
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ القائمة العامة
type SortKey = 'time' | 'name' | 'point';
export function PublicPassengerList({ rows }: { rows: PublicBooking[] }) {
  const [q, setQ] = useState('');
  const [point, setPoint] = useState('');
  const [sort, setSort] = useState<SortKey>('time');
  const points = useMemo(() => [...new Set(rows.map((r) => r.pickup_point_name))], [rows]);
  const view = useMemo(() => {
    const needle = q.trim();
    const out = rows.filter(
      (r) => (!needle || r.display_name.includes(needle)) && (!point || r.pickup_point_name === point),
    );
    out.sort((a, b) =>
      sort === 'name'
        ? a.display_name.localeCompare(b.display_name, 'ar')
        : sort === 'point'
          ? a.pickup_point_name.localeCompare(b.pickup_point_name, 'ar') || a.row_no - b.row_no
          : a.row_no - b.row_no,
    );
    return out;
  }, [rows, q, point, sort]);
  const seats = view.reduce((s, r) => s + r.seats, 0);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          type="search"
          placeholder="ابحث بالاسم"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="ابحث بالاسم"
        />
        <Select value={point} onChange={(e) => setPoint(e.target.value)} aria-label="تصفية حسب نقطة التجمع" className="sm:w-48">
          <option value="">كل نقاط التجمع</option>
          {points.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="الترتيب" className="sm:w-44">
          <option value="time">الأقدم تسجيلًا</option>
          <option value="name">حسب الاسم</option>
          <option value="point">حسب نقطة التجمع</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="لا توجد حجوزات بعد">كن أول من يحجز في هذه الرحلة.</EmptyState>
        </div>
      ) : view.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="لا نتائج مطابقة">جرّب اسمًا آخر أو أزل التصفية.</EmptyState>
        </div>
      ) : (
        <>
          <ol className="mt-4 divide-y divide-line">
            {view.map((r) => (
              <li key={r.row_no} className="flex items-center gap-3 py-3">
                <span className="w-7 shrink-0 text-center text-sm font-bold text-muted tabular-nums">{r.row_no}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{r.display_name}</p>
                  <p className="text-sm text-muted">
                    {r.pickup_point_name} <span className="mx-1 text-line">|</span> {formatDateTime(r.created_at)}
                  </p>
                </div>
                <span
                  className={cx(
                    'shrink-0 rounded-lg px-2.5 py-1 text-center text-sm font-extrabold tabular-nums',
                    r.is_paid ? 'bg-pine-800 text-white' : 'bg-leaf-300/60 text-pine-900',
                  )}
                >
                  {seatsWord(r.seats)}
                  <span className="block text-[11px] font-bold opacity-90">{r.is_paid ? 'مدفوع' : 'بانتظار الدفع'}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-2 border-t border-line pt-3 text-sm font-bold text-muted">
            عدد الحجوزات: {view.length} — إجمالي المقاعد: {seats}
          </p>
        </>
      )}
      <p className="mt-3 text-[13px] text-muted">
        حفاظًا على الخصوصية تُعرض الأسماء مختصرة ولا تظهر أرقام الهواتف أو الملاحظات.
      </p>
    </div>
  );
}

// ------------------------------------------------------------------ الاستعلام برقم الحجز
export function LookupBooking() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<BookingLookup | null | undefined>(undefined);
  const [err, setErr] = useState<string | null>(null);
  async function go(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      setRes(await api.lookupBooking(code));
    } catch (x) {
      setErr(errorMessage(x));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <form onSubmit={go} className="flex gap-2">
        <Input
          dir="ltr"
          className="text-right uppercase"
          placeholder="DSQ-XXXX-XXXX"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setRes(undefined);
          }}
          aria-label="رقم الحجز"
          maxLength={20}
        />
        <Button type="submit" variant="secondary" loading={busy} className="shrink-0">
          استعلام
        </Button>
      </form>
      {err && <p className="mt-3 font-semibold text-red-700">{err}</p>}
      {res === null && <p className="mt-3 font-semibold text-red-700">لا يوجد حجز بهذا الرقم. تأكد من كتابته كما ظهر لك.</p>}
      {res && (
        <div className="mt-3 rounded-xl bg-pine-50 p-4 text-[15px]">
          <div className="flex items-center justify-between gap-2">
            <p className="font-extrabold">{res.full_name}</p>
            <span className="flex gap-1.5">
              {res.status === 'confirmed' ? <Badge tone="green">مؤكد</Badge> : <Badge tone="red">ملغى</Badge>}
              {res.status === 'confirmed' &&
                (res.is_paid ? <Badge tone="green">مدفوع</Badge> : <Badge tone="amber">بانتظار الدفع</Badge>)}
            </span>
          </div>
          <p className="mt-1 text-muted">
            {seatsWord(res.seats)} من {res.pickup_point_name} — {formatTripDate(res.trip_date)}، التحرك{' '}
            {formatTime(res.departure_time)}
          </p>
          <p className="mt-1">
            المبلغ: <b className="tabular-nums">{formatMoney(res.amount)}</b>
            {res.status === 'confirmed' && !res.is_paid && res.instapay_number && (
              <>
                {' '}
                — حوّله على إنستاباي{' '}
                <b dir="ltr" className="select-all">
                  {res.instapay_number}
                </b>
              </>
            )}
          </p>
          {res.trip_status === 'cancelled' && <p className="mt-1 font-bold text-red-700">تنبيه: الرحلة {STATUS_LABEL.cancelled}.</p>}
        </div>
      )}
    </div>
  );
}
