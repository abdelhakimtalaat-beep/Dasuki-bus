import type { Booking, Trip, TripStats } from './types';
import type { SheetSpec } from './xlsx';
import { formatTime, formatTripDate, isoToCairoLocalInput, STATUS_LABEL } from './format';

/** تاريخ ووقت بصيغة ثابتة مناسبة لـ Excel (توقيت القاهرة): 2026-10-16 06:00 */
const xlDate = (iso: string) => isoToCairoLocalInput(iso).replace('T', ' ');

export interface TripReport {
  trip: Trip;
  stats: TripStats;
  confirmed: Booking[];
  cancelled: Booking[];
}

export function buildTripReport(trip: Trip, stats: TripStats, bookings: Booking[]): TripReport {
  const byTime = [...bookings].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    trip,
    stats,
    confirmed: byTime.filter((b) => b.status === 'confirmed'),
    cancelled: byTime.filter((b) => b.status === 'cancelled'),
  };
}

export function reportFileName(trip: Trip): string {
  return `ركاب-رحلة-الدسوقي-${trip.trip_date}.xlsx`;
}

/** أوراق ملف Excel لتقرير رحلة واحدة. */
export function reportSheets(r: TripReport, opts: { includeCancelled: boolean }): SheetSpec[] {
  const { trip, stats } = r;
  const tripLine = `${trip.title} — ${formatTripDate(trip.trip_date)} — التحرك ${formatTime(trip.departure_time)} من ${trip.departure_point}`;

  const passengers: SheetSpec = {
    name: 'قائمة الركاب',
    title: 'قائمة ركاب ' + trip.title,
    subtitle: [tripLine, `${stats.booked_seats} من ${stats.capacity} مقعدًا محجوزًا — عدد الحجوزات: ${stats.total_bookings}`],
    columns: [
      { header: 'م', width: 6 },
      { header: 'رقم الحجز', width: 16 },
      { header: 'الاسم الكامل', width: 30 },
      { header: 'عدد المقاعد', width: 11 },
      { header: 'نقطة التجمع', width: 18 },
      { header: 'رقم الهاتف', width: 15 },
      { header: 'المبلغ (جنيه)', width: 13 },
      { header: 'الدفع', width: 12 },
      { header: 'ملاحظات', width: 30 },
      { header: 'وقت التسجيل', width: 19 },
      { header: 'الحالة', width: 10 },
    ],
    rows: r.confirmed.map((b, i) => [
      i + 1,
      b.booking_code,
      b.full_name,
      b.seats,
      b.pickup_point_name,
      b.phone ?? '',
      b.seats * trip.seat_price,
      b.is_paid ? 'مدفوع' : 'لم يُدفع',
      b.notes ?? '',
      xlDate(b.created_at),
      'مؤكد',
    ]),
  };
  passengers.rows.push([null, null, 'الإجمالي', stats.booked_seats, null, null, stats.expected_amount, `مدفوع ${stats.paid_amount}`, null, null, null]);

  const summary: SheetSpec = {
    name: 'ملخص الرحلة',
    title: 'تقرير ' + trip.title,
    subtitle: [tripLine],
    columns: [
      { header: 'البند', width: 32 },
      { header: 'القيمة', width: 40 },
    ],
    rows: [
      ['تاريخ الرحلة', formatTripDate(trip.trip_date)],
      ['موعد التحرك', formatTime(trip.departure_time)],
      ['نقطة الانطلاق', trip.departure_point],
      ['الوجهة', trip.destination],
      ['حالة الرحلة', STATUS_LABEL[trip.status]],
      ['السعة القصوى', stats.capacity],
      ['إجمالي الحجوزات المؤكدة', stats.total_bookings],
      ['إجمالي المقاعد المحجوزة', stats.booked_seats],
      ['المقاعد المتبقية', stats.remaining_seats],
      ['نسبة الإشغال', `${stats.occupancy_pct}%`],
      ['سعر المقعد (جنيه)', stats.seat_price],
      ['رقم إنستاباي', trip.instapay_number ?? ''],
      ['المقاعد المدفوعة', stats.paid_seats],
      ['المبلغ المتوقع (جنيه)', stats.expected_amount],
      ['المبلغ المحصل (جنيه)', stats.paid_amount],
      ['المتبقي تحصيله (جنيه)', stats.expected_amount - stats.paid_amount],
      ['الحجوزات الملغاة', stats.cancelled_bookings],
      ['تاريخ استخراج التقرير', xlDate(new Date().toISOString())],
    ],
  };

  const byPoint: SheetSpec = {
    name: 'حسب نقطة التجمع',
    title: 'عدد الركاب حسب نقطة التجمع',
    columns: [
      { header: 'نقطة التجمع', width: 24 },
      { header: 'عدد الحجوزات', width: 14 },
      { header: 'عدد المقاعد', width: 14 },
    ],
    rows: [
      ...stats.by_pickup_point.map((p) => [p.name, p.bookings, p.seats]),
      ['الإجمالي', stats.total_bookings, stats.booked_seats],
    ],
  };

  const sheets = [passengers, summary, byPoint];
  if (opts.includeCancelled) {
    sheets.push({
      name: 'الحجوزات الملغاة',
      title: 'الحجوزات الملغاة',
      columns: [
        { header: 'رقم الحجز', width: 16 },
        { header: 'الاسم الكامل', width: 30 },
        { header: 'عدد المقاعد', width: 11 },
        { header: 'نقطة التجمع', width: 18 },
        { header: 'رقم الهاتف', width: 15 },
        { header: 'كان مدفوعًا', width: 12 },
        { header: 'وقت التسجيل', width: 19 },
        { header: 'وقت الإلغاء', width: 19 },
      ],
      rows: r.cancelled.map((b) => [
        b.booking_code,
        b.full_name,
        b.seats,
        b.pickup_point_name,
        b.phone ?? '',
        b.is_paid ? 'نعم — راجع الاسترداد' : 'لا',
        xlDate(b.created_at),
        b.cancelled_at ? xlDate(b.cancelled_at) : '',
      ]),
    });
  }
  return sheets;
}
