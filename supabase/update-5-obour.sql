-- =====================================================================
--  تحديث رقم 5 (18 أكتوبر 2026):
--   * نقطة تجمع جديدة: العبور
--   * مسار الرحلة: المستقبل ثم العبور بعد الشروق
--   * رابط المسار الجديد على خرائط جوجل + الخريطة المعروضة داخل الصفحة
--  شغّل هذا الملف مرة واحدة في Supabase → SQL Editor (انسخ كل المحتوى ← Run)
--  آمن للتشغيل أكثر من مرة. لا يمس الحجوزات الموجودة.
-- =====================================================================

-- 1) نقطة التجمع الجديدة (تُفعَّل إن كانت موجودة ومعطّلة)
insert into public.pickup_points (name, sort_order)
select 'العبور', 3
where not exists (select 1 from public.pickup_points where lower(btrim(name)) = 'العبور');
update public.pickup_points set is_active = true where btrim(name) = 'العبور';

-- 2) ربطها برحلة 28 أكتوبر
insert into public.trip_pickup_points (trip_id, pickup_point_id)
select t.id, p.id
  from public.trips t
  join public.pickup_points p on btrim(p.name) = 'العبور'
 where t.trip_date = date '2026-10-28'
on conflict do nothing;

-- 3) المسار والخريطة
update public.trips set
  route_stops     = E'الشروق\nالمستقبل\nالعبور\nالطريق الإقليمي\nسيدي أحمد البدوي\nسيدي عبد العزيز المكنى بأبي المجد\nسيدي إبراهيم الدسوقي\nدار الدسوقية المحمدية بالرحمانية',
  route_map_url   = 'https://maps.app.goo.gl/FtST9r2wZgbz5My87',
  route_embed_url = 'https://maps.google.com/maps?saddr=30.1669614,31.6537869&daddr=30.1686687,31.5597833+to:30.1823984,31.5044224+to:30.2758702,31.5281187+to:30.7827791,30.9983505+to:31.1284091,30.6465936+to:31.10664,30.630273&output=embed'
 where trip_date = date '2026-10-28';

-- للتأكد: نقاط التجمع المتاحة في الرحلة
select p.sort_order, p.name
  from public.trip_pickup_points tp
  join public.pickup_points p on p.id = tp.pickup_point_id
  join public.trips t on t.id = tp.trip_id
 where t.trip_date = date '2026-10-28' and p.is_active
 order by p.sort_order;
