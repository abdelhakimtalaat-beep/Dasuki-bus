import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import JSZip from 'jszip';
import { buildXlsx, colName, escapeXml, safeSheetName } from './xlsx';
import { buildTripReport, reportSheets } from './report';
import type { Booking, Trip, TripStats } from './types';

test('أدوات مساعدة', () => {
  assert.equal(colName(0), 'A');
  assert.equal(colName(25), 'Z');
  assert.equal(colName(26), 'AA');
  assert.equal(escapeXml('<a & "b">'), '&lt;a &amp; &quot;b&quot;&gt;');
  const used = new Set<string>();
  assert.equal(safeSheetName('قائمة/الركاب', used), 'قائمة الركاب');
  assert.equal(safeSheetName('قائمة/الركاب', used), 'قائمة الركاب 2');
});

const trip: Trip = {
  id: 't1',
  title: 'رحلة سيدي إبراهيم الدسوقي',
  trip_date: '2026-10-16',
  departure_time: '06:00:00',
  departure_point: 'ميدان رمسيس',
  destination: 'مسجد سيدي إبراهيم الدسوقي – دسوق',
  capacity: 50,
  max_seats_per_booking: 10,
  seat_price: 300,
  instapay_number: '01065553930',
  booked_seats: 5,
  booking_opens_at: '2026-10-10T00:00:00Z',
  booking_closes_at: '2026-10-15T20:00:00Z',
  status: 'open',
  notes: null,
  announcements: null,
  route_stops: null,
  route_map_url: null,
  route_embed_url: null,
  created_at: '2026-10-10T00:00:00Z',
  updated_at: '2026-10-10T00:00:00Z',
};
const mk = (i: number, o: Partial<Booking>): Booking => ({
  id: 'b' + i,
  booking_code: `DSQ-AAAA-000${i}`,
  trip_id: 't1',
  full_name: 'راكب ' + i,
  seats: 1,
  pickup_point_id: 'p1',
  pickup_point_name: 'رمسيس',
  phone: null,
  notes: null,
  status: 'confirmed',
  is_paid: false,
  paid_at: null,
  created_at: `2026-10-1${i}T08:00:00Z`,
  updated_at: `2026-10-1${i}T08:00:00Z`,
  cancelled_at: null,
  ...o,
});
const bookings = [
  mk(1, { full_name: 'محمد عبد الرحمن', seats: 3, is_paid: true, phone: '01012345678', notes: 'معي <طفل> & والدتي' }),
  mk(2, { full_name: 'فاطمة إبراهيم', seats: 2, pickup_point_name: 'الشروق', pickup_point_id: 'p2' }),
  mk(3, { full_name: 'حجز ملغى', seats: 3, status: 'cancelled', cancelled_at: '2026-10-14T08:00:00Z' }),
];
const stats: TripStats = {
  trip_id: 't1',
  capacity: 50,
  total_bookings: 2,
  booked_seats: 5,
  remaining_seats: 45,
  occupancy_pct: 10,
  paid_seats: 3,
  paid_bookings: 1,
  seat_price: 300,
  expected_amount: 1500,
  paid_amount: 900,
  pickup_points_used: 2,
  cancelled_bookings: 1,
  by_pickup_point: [
    { pickup_point_id: 'p1', name: 'رمسيس', bookings: 1, seats: 3 },
    { pickup_point_id: 'p2', name: 'الشروق', bookings: 1, seats: 2 },
  ],
};

test('ملف Excel صالح، من اليمين لليسار، ويحفظ النص العربي', async () => {
  const report = buildTripReport(trip, stats, bookings);
  assert.equal(report.confirmed.length, 2);
  assert.equal(report.cancelled.length, 1);
  const bytes = await buildXlsx(reportSheets(report, { includeCancelled: true }));
  const zip = await JSZip.loadAsync(bytes);
  const wb = await zip.file('xl/workbook.xml')!.async('string');
  assert.match(wb, /قائمة الركاب/);
  assert.match(wb, /الحجوزات الملغاة/);
  const s1 = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
  assert.match(s1, /rightToLeft="1"/);
  assert.match(s1, /محمد عبد الرحمن/);
  assert.match(s1, /01012345678/);
  assert.match(s1, /<v>900<\/v>/, 'مبلغ الحجز = 3 × 300');
  assert.match(s1, />مدفوع</);
  assert.match(s1, />لم يُدفع</);
  assert.match(s1, /معي &lt;طفل&gt; &amp; والدتي/);
  assert.doesNotMatch(s1, /حجز ملغى/, 'الملغى لا يظهر في قائمة الركاب');
  const s4 = await zip.file('xl/worksheets/sheet4.xml')!.async('string');
  assert.match(s4, /حجز ملغى/);

  const out = process.env.XLSX_OUT;
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}/sample-report.xlsx`, bytes);
  }
});

test('بدون الحجوزات الملغاة: 3 أوراق فقط', async () => {
  const sheets = reportSheets(buildTripReport(trip, stats, bookings), { includeCancelled: false });
  assert.equal(sheets.length, 3);
});
