-- =====================================================================
--  تحديث رقم 1 (16 أكتوبر 2026): التنبيهات + مسار الرحلة + الخريطة + نقاط التجمع
--  شغّل هذا الملف مرة واحدة في Supabase → SQL Editor (انسخ كل المحتوى ← Run)
--  آمن للتشغيل أكثر من مرة.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) أعمدة جديدة في جدول الرحلات
-- ---------------------------------------------------------------------
alter table public.trips
  add column if not exists announcements   text check (announcements is null or char_length(announcements) <= 2000),
  add column if not exists route_stops     text check (route_stops is null or char_length(route_stops) <= 2000),
  add column if not exists route_map_url   text check (route_map_url is null or route_map_url ~ '^https://[^\s"<>]+$'),
  add column if not exists route_embed_url text check (route_embed_url is null
                                    or route_embed_url ~ '^https://(www\.|maps\.)?google\.com/maps[^\s"<>]*$');

-- ---------------------------------------------------------------------
-- 2) دالة حفظ الرحلة من لوحة التحكم (تدعم الحقول الجديدة)
-- ---------------------------------------------------------------------
create or replace function public.admin_save_trip(
  p_id        uuid,
  p_data      jsonb,
  p_point_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_point_ids is null or cardinality(p_point_ids) = 0 then
    raise exception 'PICKUP_REQUIRED';
  end if;

  if p_id is null then
    insert into public.trips (title, trip_date, departure_time, departure_point, destination,
                              capacity, max_seats_per_booking, booking_opens_at, booking_closes_at,
                              status, notes, seat_price, instapay_number,
                              announcements, route_stops, route_map_url, route_embed_url)
    values (coalesce(nullif(p_data->>'title', ''), 'رحلة سيدي إبراهيم الدسوقي'),
            (p_data->>'trip_date')::date,
            (p_data->>'departure_time')::time,
            p_data->>'departure_point',
            coalesce(nullif(p_data->>'destination', ''), 'مسجد سيدي إبراهيم الدسوقي – دسوق، كفر الشيخ'),
            coalesce((p_data->>'capacity')::int, 50),
            coalesce((p_data->>'max_seats_per_booking')::int, 10),
            (p_data->>'booking_opens_at')::timestamptz,
            (p_data->>'booking_closes_at')::timestamptz,
            coalesce(nullif(p_data->>'status', ''), 'open')::public.trip_status,
            p_data->>'notes',
            coalesce((p_data->>'seat_price')::numeric, 300),
            nullif(public.normalize_phone(p_data->>'instapay_number'), ''),
            nullif(btrim(p_data->>'announcements'), ''),
            nullif(btrim(p_data->>'route_stops'), ''),
            nullif(btrim(p_data->>'route_map_url'), ''),
            nullif(btrim(p_data->>'route_embed_url'), ''))
    returning id into v_id;
  else
    update public.trips set
      title                 = coalesce(nullif(p_data->>'title', ''), title),
      trip_date             = (p_data->>'trip_date')::date,
      departure_time        = (p_data->>'departure_time')::time,
      departure_point       = p_data->>'departure_point',
      destination           = coalesce(nullif(p_data->>'destination', ''), destination),
      capacity              = coalesce((p_data->>'capacity')::int, capacity),
      max_seats_per_booking = coalesce((p_data->>'max_seats_per_booking')::int, max_seats_per_booking),
      booking_opens_at      = (p_data->>'booking_opens_at')::timestamptz,
      booking_closes_at     = (p_data->>'booking_closes_at')::timestamptz,
      status                = coalesce(nullif(p_data->>'status', ''), status::text)::public.trip_status,
      notes                 = p_data->>'notes',
      seat_price            = coalesce((p_data->>'seat_price')::numeric, seat_price),
      instapay_number       = case when p_data ? 'instapay_number'
                                   then nullif(public.normalize_phone(p_data->>'instapay_number'), '')
                                   else instapay_number end,
      announcements         = case when p_data ? 'announcements'
                                   then nullif(btrim(p_data->>'announcements'), '') else announcements end,
      route_stops           = case when p_data ? 'route_stops'
                                   then nullif(btrim(p_data->>'route_stops'), '') else route_stops end,
      route_map_url         = case when p_data ? 'route_map_url'
                                   then nullif(btrim(p_data->>'route_map_url'), '') else route_map_url end,
      route_embed_url       = case when p_data ? 'route_embed_url'
                                   then nullif(btrim(p_data->>'route_embed_url'), '') else route_embed_url end
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'TRIP_NOT_FOUND';
    end if;
  end if;

  -- لا يمكن إزالة نقطة تجمع عليها حجوزات مؤكدة في هذه الرحلة
  if exists (select 1 from public.bookings b
              where b.trip_id = v_id and b.status = 'confirmed'
                and not (b.pickup_point_id = any (p_point_ids))) then
    raise exception 'PICKUP_POINT_IN_USE';
  end if;

  delete from public.trip_pickup_points
   where trip_id = v_id and not (pickup_point_id = any (p_point_ids));
  insert into public.trip_pickup_points (trip_id, pickup_point_id)
  select v_id, unnest(p_point_ids)
  on conflict do nothing;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) نقاط التجمع: المستقبل ثم الشروق فقط
--    (النقاط القديمة تُوقف ولا تُحذف، حتى تبقى الحجوزات السابقة سليمة)
-- ---------------------------------------------------------------------
insert into public.pickup_points (name, sort_order) values ('المستقبل', 1)
on conflict do nothing;

update public.pickup_points set name = 'الشروق', description = null, sort_order = 2, is_active = true
 where name = 'مفارق الـ100 بالشروق'
   and not exists (select 1 from public.pickup_points where name = 'الشروق');
insert into public.pickup_points (name, sort_order) values ('الشروق', 2)
on conflict do nothing;

update public.pickup_points set sort_order = 1, is_active = true where name = 'المستقبل';
update public.pickup_points set is_active = false
 where name not in ('المستقبل', 'الشروق');

-- ربط الرحلة بالنقطتين الجديدتين، وفك النقاط الموقوفة إن لم يكن عليها حجوزات مؤكدة
insert into public.trip_pickup_points (trip_id, pickup_point_id)
select t.id, p.id from public.trips t cross join public.pickup_points p
 where t.trip_date = date '2026-10-28' and p.name in ('المستقبل', 'الشروق')
on conflict do nothing;

delete from public.trip_pickup_points tp
 using public.pickup_points p
 where tp.pickup_point_id = p.id and not p.is_active
   and not exists (select 1 from public.bookings b
                    where b.trip_id = tp.trip_id and b.pickup_point_id = p.id and b.status = 'confirmed');

-- ---------------------------------------------------------------------
-- 4) بيانات رحلة 28 أكتوبر: الموعد، التنبيهات، المسار، الخريطة
-- ---------------------------------------------------------------------
update public.trips set
  departure_time  = time '07:30',
  departure_point = 'الشروق',
  announcements   = E'الحجز للرجال فقط.\nالتجمع في تمام الساعة 7:00 صباحًا، والانطلاق من نقطة تجمع الشروق الساعة 7:30 صباحًا.\nمسؤول الباص: محمد عبد الله ربيع.',
  route_stops     = E'الشروق\nالطريق الإقليمي\nسيدي أحمد البدوي\nسيدي عبد العزيز المكنى بأبي المجد\nسيدي إبراهيم الدسوقي\nدار الدسوقية المحمدية بالرحمانية',
  route_map_url   = 'https://maps.app.goo.gl/Z9rYgAv3Hp94hX7t5',
  route_embed_url = 'https://maps.google.com/maps?saddr=30.1302695,31.602518&daddr=30.1669614,31.6537869+to:30.7827791,30.9983505+to:31.1284091,30.6465936+to:31.10664,30.630273&output=embed'
where trip_date = date '2026-10-28';

-- ---------------------------------------------------------------------
-- 5) للتأكد: يجب أن يظهر سطر الرحلة بموعد 07:30 ونقطتا التجمع
-- ---------------------------------------------------------------------
select t.trip_date, t.departure_time, t.departure_point,
       (select string_agg(p.name, ' ، ' order by p.sort_order)
          from public.trip_pickup_points tp join public.pickup_points p on p.id = tp.pickup_point_id
         where tp.trip_id = t.id and p.is_active) as pickup_points,
       t.route_embed_url is not null as has_map
  from public.trips t
 where t.trip_date = date '2026-10-28';
