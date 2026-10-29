import { useMemo, useState } from 'react';
import { formatDateTime, formatTime, formatTripDate, seatsWord } from '../lib/format';
import type { BookingResult, PublicBooking, Trip } from '../lib/types';
import { Button, EmptyState, Input, Modal, Select, cx } from './ui';
import { InstaPayBox } from './Payment';
import { normalizeArabic } from '../lib/text';

export { normalizeArabic };
import { Announcements } from './TripInfo';

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
  if (!result) return null;
  return (
    <Modal open onClose={onClose} title={result.already_existed ? 'هذا الحجز مسجّل بالفعل' : 'تم تسجيل الحجز بنجاح'}>
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-paper p-4 text-[15px]">
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
          details={{ name: result.full_name, seats: result.seats, pickupPoint: result.pickup_point_name, tripTitle: trip.title }}
          compact
        />
        <Announcements trip={trip} compact />
        <p className="text-sm text-muted">
          يظهر اسمك الآن في قائمة الركاب. لزيادة أو تقليل المقاعد أو إلغاء الحجز استخدم «عدّل حجزك» أسفل الصفحة باسمك ورقم هاتفك.
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
    const needle = normalizeArabic(q);
    const out = rows.filter(
      (r) => (!needle || normalizeArabic(r.display_name).includes(needle)) && (!point || r.pickup_point_name === point),
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
          placeholder="ابحث عن حجزك بالاسم"
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
        للتأكد من حجزك ابحث باسمك. أرقام الهواتف والملاحظات لا تظهر لأحد غير مسؤول الرحلة.
      </p>
    </div>
  );
}
