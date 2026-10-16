import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatDateTimeFull, formatMoney, seatsWord, formatTime, formatTripDate, STATUS_LABEL } from '../../lib/format';
import { navigate, useAsync } from '../../lib/hooks';
import { buildTripReport } from '../../lib/report';
import type { Trip } from '../../lib/types';
import { Button, Card, ErrorBox, Spinner, useToast } from '../../components/ui';
import { exportTripXlsx } from './exportTrip';

async function loadReport(trip: Trip) {
  const [stats, bookings] = await Promise.all([api.getStats(trip.id), api.listBookings(trip.id)]);
  return buildTripReport(trip, stats, bookings);
}

export function ReportsTab({ trip }: { trip: Trip }) {
  const toast = useToast();
  const r = useAsync(() => loadReport(trip), [trip.id]);
  const [withCancelled, setWithCancelled] = useState(true);
  const [busy, setBusy] = useState(false);

  if (r.error) return <ErrorBox message={r.error} onRetry={() => void r.reload()} />;
  if (!r.data)
    return (
      <div className="flex justify-center p-10 text-muted">
        <Spinner />
      </div>
    );
  const { stats, confirmed, cancelled } = r.data;

  async function exportIt() {
    setBusy(true);
    try {
      await exportTripXlsx(trip, stats, [...confirmed, ...cancelled], withCancelled);
      toast('تم تنزيل التقرير.', 'success');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  const facts: [string, string | number][] = [
    ['إجمالي الحجوزات', stats.total_bookings],
    ['المقاعد المحجوزة', `${stats.booked_seats} من ${stats.capacity}`],
    ['المقاعد المتبقية', stats.remaining_seats],
    ['نسبة الإشغال', `${stats.occupancy_pct}%`],
    ['الحجوزات الملغاة', stats.cancelled_bookings],
    ['حالة الرحلة', STATUS_LABEL[trip.status]],
    ['سعر المقعد', formatMoney(stats.seat_price)],
    ['المقاعد المدفوعة', `${stats.paid_seats} من ${stats.booked_seats}`],
    ['المبلغ المتوقع', formatMoney(stats.expected_amount)],
    ['المبلغ المحصل', formatMoney(stats.paid_amount)],
    ['المتبقي تحصيله', formatMoney(stats.expected_amount - stats.paid_amount)],
  ];

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold">تقرير الرحلة</h2>
            <p className="text-muted">
              {formatTripDate(trip.trip_date)} — التحرك {formatTime(trip.departure_time)} من {trip.departure_point}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" className="size-4 accent-pine-700" checked={withCancelled} onChange={(e) => setWithCancelled(e.target.checked)} />
              تضمين الحجوزات الملغاة
            </label>
            <Button onClick={() => void exportIt()} loading={busy}>
              تصدير Excel
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/admin/print/${trip.id}`)}>
              طباعة
            </Button>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className="border-s-[3px] border-pine-200 ps-3">
              <dt className="text-[13px] font-semibold text-muted">{k}</dt>
              <dd className="text-xl font-extrabold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="p-5 sm:p-6">
        <h3 className="mb-3 text-lg font-extrabold">الركاب حسب نقطة التجمع</h3>
        <table className="w-full max-w-xl text-[15px]">
          <thead>
            <tr className="border-b-2 border-line text-muted">
              <th className="py-2 text-start">نقطة التجمع</th>
              <th className="py-2 text-start">الحجوزات</th>
              <th className="py-2 text-start">المقاعد</th>
            </tr>
          </thead>
          <tbody>
            {stats.by_pickup_point.map((p) => (
              <tr key={p.pickup_point_id} className="border-b border-line">
                <td className="py-2 font-bold">{p.name}</td>
                <td className="py-2 tabular-nums">{p.bookings}</td>
                <td className="py-2 font-extrabold tabular-nums">{p.seats}</td>
              </tr>
            ))}
            <tr>
              <td className="py-2 font-extrabold">الإجمالي</td>
              <td className="py-2 font-extrabold tabular-nums">{stats.total_bookings}</td>
              <td className="py-2 font-extrabold tabular-nums">{stats.booked_seats}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {cancelled.length > 0 && (
        <Card className="p-5 sm:p-6">
          <h3 className="mb-3 text-lg font-extrabold">الحجوزات الملغاة ({cancelled.length})</h3>
          <ul className="divide-y divide-line text-[15px]">
            {cancelled.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-bold">{b.full_name}</span>
                <span className="text-muted">
                  {seatsWord(b.seats)} — {b.pickup_point_name} — أُلغي {b.cancelled_at ? formatDateTime(b.cancelled_at) : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** صفحة طباعة نظيفة لقائمة الركاب (A4 أفقي). */
export function PrintView({ tripId }: { tripId: string }) {
  const r = useAsync(async () => {
    const trips = await api.listTrips();
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) throw new Error('TRIP_NOT_FOUND');
    return loadReport(trip);
  }, [tripId]);

  useEffect(() => {
    if (r.data) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [r.data]);

  if (r.error) return <div className="p-8"><ErrorBox message={r.error} /></div>;
  if (!r.data)
    return (
      <div className="flex justify-center p-10 text-muted">
        <Spinner />
      </div>
    );
  const { trip, stats, confirmed } = r.data;
  return (
    <div className="mx-auto max-w-5xl bg-white p-6 text-[13px] text-black">
      <div className="no-print mb-4 flex gap-2">
        <Button onClick={() => window.print()}>طباعة</Button>
        <Button variant="secondary" onClick={() => history.back()}>
          رجوع
        </Button>
      </div>
      <h1 className="text-xl font-extrabold">قائمة ركاب {trip.title}</h1>
      <p className="mt-1">
        {formatTripDate(trip.trip_date)} — التحرك {formatTime(trip.departure_time)} من {trip.departure_point} — الوجهة: {trip.destination}
      </p>
      <p className="mt-1 font-bold">
        {stats.booked_seats} من {stats.capacity} مقعدًا محجوزًا — عدد الحجوزات: {stats.total_bookings} —{' '}
        {stats.by_pickup_point.map((p) => `${p.name}: ${p.seats}`).join('، ')}
      </p>
      <p className="mt-1">
        مدفوع {stats.paid_seats} مقعدًا ({formatMoney(stats.paid_amount)}) — المتبقي تحصيله{' '}
        {formatMoney(stats.expected_amount - stats.paid_amount)}
      </p>
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr>
            {['م', 'رقم الحجز', 'الاسم الكامل', 'المقاعد', 'نقطة التجمع', 'الهاتف', 'المبلغ', 'الدفع', 'ملاحظات', 'حضر'].map((h) => (
              <th key={h} className="border border-gray-400 bg-gray-100 px-2 py-1.5 text-start">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {confirmed.map((b, i) => (
            <tr key={b.id} style={{ breakInside: 'avoid' }}>
              <td className="border border-gray-400 px-2 py-1.5">{i + 1}</td>
              <td className="border border-gray-400 px-2 py-1.5" dir="ltr">
                {b.booking_code}
              </td>
              <td className="border border-gray-400 px-2 py-1.5 font-bold">{b.full_name}</td>
              <td className="border border-gray-400 px-2 py-1.5 text-center font-bold">{b.seats}</td>
              <td className="border border-gray-400 px-2 py-1.5">{b.pickup_point_name}</td>
              <td className="border border-gray-400 px-2 py-1.5" dir="ltr">
                {b.phone ?? ''}
              </td>
              <td className="border border-gray-400 px-2 py-1.5 whitespace-nowrap">{formatMoney(b.seats * trip.seat_price)}</td>
              <td className="border border-gray-400 px-2 py-1.5 whitespace-nowrap">{b.is_paid ? 'مدفوع ✓' : 'لم يُدفع'}</td>
              <td className="border border-gray-400 px-2 py-1.5">{b.notes ?? ''}</td>
              <td className="w-12 border border-gray-400 px-2 py-1.5" />
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-[11px] text-gray-600">طُبع في {formatDateTimeFull(new Date().toISOString())}</p>
    </div>
  );
}
