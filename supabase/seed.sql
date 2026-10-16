-- البيانات الأولية: نقاط التجمع + رحلة واحدة يوم الأربعاء 28 أكتوبر 2026
-- شغّلها مرة واحدة بعد ملف الـ migration. كل القيم قابلة للتعديل من لوحة التحكم.

insert into public.pickup_points (name, sort_order) values
  ('مفارق الـ100 بالشروق',  1),
  ('صينية النهضة بالشروق',  2),
  ('المستقبل',              3),
  ('كارفور العبور',         4)
on conflict do nothing;

with t as (
  insert into public.trips (
    title, trip_date, departure_time, departure_point, destination,
    capacity, max_seats_per_booking, seat_price, instapay_number,
    booking_opens_at, booking_closes_at)
  values (
    'رحلة سيدي إبراهيم الدسوقي', date '2026-10-28', time '06:00', 'مفارق الـ100 بالشروق',
    'مسجد سيدي إبراهيم الدسوقي – دسوق، كفر الشيخ',
    50, 10, 300, '01065553930',
    now(),
    timestamp '2026-10-25 23:59' at time zone 'Africa/Cairo')
  returning id
)
insert into public.trip_pickup_points (trip_id, pickup_point_id)
select t.id, p.id from t cross join public.pickup_points p where p.is_active;
