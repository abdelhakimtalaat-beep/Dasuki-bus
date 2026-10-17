import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidEgyptianPhone, normalizePhone, toLatinDigits, validateBookingForm } from './validation';
import { errorMessage, toApiError, ApiError } from './errors';

test('توحيد أرقام الهاتف المصرية', () => {
  assert.equal(normalizePhone('01012345678'), '01012345678');
  assert.equal(normalizePhone('+20 101 234 5678'), '01012345678');
  assert.equal(normalizePhone('00201012345678'), '01012345678');
  assert.equal(normalizePhone('٠١٠١٢٣٤٥٦٧٨'), '01012345678');
  assert.equal(normalizePhone('1012345678'), '01012345678');
  assert.equal(normalizePhone('  '), null);
  assert.equal(normalizePhone(null), null);
  assert.equal(toLatinDigits('۰۱۲'), '012');
});

test('التحقق من صحة الرقم المصري', () => {
  for (const ok of ['01012345678', '01112345678', '01212345678', '01512345678', '+201012345678'])
    assert.ok(isValidEgyptianPhone(ok), ok);
  for (const bad of ['01312345678', '0101234567', '010123456789', '02123456789', 'abc'])
    assert.ok(!isValidEgyptianPhone(bad), bad);
});

const base = { full_name: 'محمد أحمد', seats: 1, pickup_point_id: 'p1', phone: '01012345678', notes: '' };
const limits = { remaining: 10, maxPerBooking: 10 };

test('نموذج صالح بدون أخطاء', () => {
  assert.deepEqual(validateBookingForm(base, limits), {});
});

test('الحقول الإلزامية', () => {
  const e = validateBookingForm({ ...base, full_name: ' ', pickup_point_id: '' }, limits);
  assert.ok(e.full_name);
  assert.equal(e.pickup_point_id, 'يرجى اختيار نقطة التجمع.');
});

test('مقعد واحد متبقٍ لا يقبل حجز مقعدين', () => {
  const e = validateBookingForm({ ...base, seats: 2 }, { remaining: 1, maxPerBooking: 10 });
  assert.equal(e.seats, 'المتاح حاليًا مقعد واحد فقط.');
});

test('الأتوبيس المكتمل', () => {
  const e = validateBookingForm(base, { remaining: 0, maxPerBooking: 10 });
  assert.equal(e.seats, 'اكتملت سعة الأتوبيس.');
});

test('رقم الهاتف إجباري للزائر واختياري للمسؤول', () => {
  assert.ok(validateBookingForm({ ...base, phone: '' }, limits).phone);
  assert.equal(validateBookingForm({ ...base, phone: '' }, limits, { phoneRequired: false }).phone, undefined);
});

test('صفر مقاعد مرفوض والهاتف الخاطئ مرفوض', () => {
  const e = validateBookingForm({ ...base, seats: 0, phone: '0123' }, limits);
  assert.ok(e.seats);
  assert.ok(e.phone);
});

test('ترجمة أخطاء الخادم إلى رسائل عربية', () => {
  const err = toApiError({ message: 'NOT_ENOUGH_SEATS', details: '3', code: 'P0001' });
  assert.equal(err.code, 'NOT_ENOUGH_SEATS');
  assert.equal(err.detail, '3');
  assert.match(errorMessage(err), /المتاح حاليًا 3 مقاعد/);
  assert.equal(errorMessage(new ApiError('BUS_FULL')), 'اكتملت سعة الأتوبيس لهذه الرحلة.');
  assert.equal(errorMessage(new TypeError('Failed to fetch')), 'تعذر الاتصال بالخادم؛ يرجى المحاولة مرة أخرى.');
  assert.equal(
    toApiError({ message: 'new row for relation "trips" violates check constraint "trips_capacity_chk"' }).code,
    'trips_capacity_chk',
  );
  assert.equal(toApiError({ message: 'permission denied for table bookings', code: '42501' }).code, 'FORBIDDEN');
});
