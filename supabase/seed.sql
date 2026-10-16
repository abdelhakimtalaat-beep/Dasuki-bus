-- البيانات الأولية: نقاط التجمع + رحلة الأربعاء 28 أكتوبر 2026
-- شغّلها مرة واحدة بعد ملف الـ migration. كل القيم قابلة للتعديل من لوحة التحكم.

insert into public.pickup_points (name, sort_order) values
  ('المستقبل', 1),
  ('الشروق',   2)
on conflict do nothing;

with t as (
  insert into public.trips (
    title, trip_date, departure_time, departure_point, destination,
    capacity, max_seats_per_booking, seat_price, instapay_number,
    booking_opens_at, booking_closes_at,
    announcements, route_stops, route_map_url, route_embed_url)
  values (
    'رحلة سيدي إبراهيم الدسوقي', date '2026-10-28', time '07:30', 'الشروق',
    'مسجد سيدي إبراهيم الدسوقي – دسوق، كفر الشيخ',
    50, 10, 300, '01065553930',
    now(),
    timestamp '2026-10-25 23:59' at time zone 'Africa/Cairo',
    E'الحجز للرجال فقط.\nالتجمع في تمام الساعة 7:00 صباحًا، والانطلاق من نقطة تجمع الشروق الساعة 7:30 صباحًا.\nمسؤول الباص: محمد عبد الله ربيع.',
    E'الشروق\nالطريق الإقليمي\nسيدي أحمد البدوي\nسيدي عبد العزيز المكنى بأبي المجد\nسيدي إبراهيم الدسوقي\nدار الدسوقية المحمدية بالرحمانية',
    'https://maps.app.goo.gl/Z9rYgAv3Hp94hX7t5',
    'https://maps.google.com/maps?saddr=30.1302695,31.602518&daddr=30.1669614,31.6537869+to:30.7827791,30.9983505+to:31.1284091,30.6465936+to:31.10664,30.630273&output=embed')
  returning id
)
insert into public.trip_pickup_points (trip_id, pickup_point_id)
select t.id, p.id from t cross join public.pickup_points p where p.is_active;
