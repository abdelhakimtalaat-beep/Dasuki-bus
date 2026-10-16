import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, bookingWindow, formatMoney, cairoLocalInputToIso, formatTime, isoToCairoLocalInput, seatsWord } from './format';
import type { Trip } from './types';

test('تحويل التوقيت من وإلى توقيت القاهرة (بما فيه التوقيت الصيفي)', () => {
  // يناير: UTC+2
  assert.equal(cairoLocalInputToIso('2026-01-15T22:00'), '2026-01-15T20:00:00.000Z');
  assert.equal(isoToCairoLocalInput('2026-01-15T20:00:00.000Z'), '2026-01-15T22:00');
  // يوليو: UTC+3 (التوقيت الصيفي)
  assert.equal(cairoLocalInputToIso('2026-07-15T22:00'), '2026-07-15T19:00:00.000Z');
  assert.equal(isoToCairoLocalInput('2026-07-15T19:00:00.000Z'), '2026-07-15T22:00');
});

test('حساب الأيام وتنسيق الوقت والمقاعد', () => {
  assert.equal(addDays('2026-10-16', 7), '2026-10-23');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(formatTime('06:00:00'), '6:00 صباحًا');
  assert.equal(formatTime('13:30'), '1:30 مساءً');
  assert.equal(seatsWord(1), 'مقعد واحد');
  assert.equal(seatsWord(2), 'مقعدان');
  assert.equal(seatsWord(5), '5 مقاعد');
  assert.equal(seatsWord(35), '35 مقعدًا');
  assert.equal(formatMoney(300), '300 جنيه');
  assert.equal(formatMoney(15000), '15,000 جنيه');
});

const trip = (o: Partial<Trip>): Trip => ({
  id: 't',
  title: 'x',
  trip_date: '2026-10-16',
  departure_time: '06:00',
  departure_point: 'رمسيس',
  destination: 'دسوق',
  capacity: 50,
  max_seats_per_booking: 10,
  seat_price: 300,
  instapay_number: '01065553930',
  booked_seats: 10,
  booking_opens_at: '2026-10-10T00:00:00Z',
  booking_closes_at: '2026-10-15T20:00:00Z',
  status: 'open',
  notes: null,
  announcements: null,
  route_stops: null,
  route_map_url: null,
  route_embed_url: null,
  created_at: '',
  updated_at: '',
  ...o,
});

test('حالة نافذة الحجز', () => {
  const now = new Date('2026-10-12T10:00:00Z');
  assert.equal(bookingWindow(trip({}), now), 'open');
  assert.equal(bookingWindow(trip({ booked_seats: 50, status: 'full' }), now), 'full');
  assert.equal(bookingWindow(trip({ status: 'closed' }), now), 'closed');
  assert.equal(bookingWindow(trip({ status: 'cancelled' }), now), 'cancelled');
  assert.equal(bookingWindow(trip({}), new Date('2026-10-09T00:00:00Z')), 'not_yet');
  assert.equal(bookingWindow(trip({}), new Date('2026-10-15T21:00:00Z')), 'ended');
});
