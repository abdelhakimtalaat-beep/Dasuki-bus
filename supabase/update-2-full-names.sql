-- =====================================================================
--  تحديث رقم 2 (17 أكتوبر 2026): إظهار اسم الحاجز كاملًا في قائمة الركاب العامة
--  شغّل هذا الملف مرة واحدة في Supabase → SQL Editor (انسخ كل المحتوى ← Run)
--  أرقام الهواتف والملاحظات تبقى مخفية عن الزوار.
-- =====================================================================

-- قائمة الركاب العامة: الاسم كاملًا + المقاعد + نقطة التجمع + حالة الدفع (بلا هاتف ولا ملاحظات)
create or replace function public.get_public_bookings(p_trip_id uuid)
returns table (
  row_no            int,
  display_name      text,
  seats             int,
  pickup_point_name text,
  created_at        timestamptz,
  is_paid           boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select (row_number() over (order by b.created_at, b.id))::int,
         b.full_name,
         b.seats,
         pp.name,
         b.created_at,
         b.is_paid
    from bookings b
    join pickup_points pp on pp.id = b.pickup_point_id
   where b.trip_id = p_trip_id and b.status = 'confirmed'
   order by b.created_at, b.id;
$$;

-- للتأكد: يجب أن تظهر الأسماء كاملة
select row_no, display_name, seats, pickup_point_name, is_paid
  from public.get_public_bookings((select id from public.trips where trip_date = date '2026-10-28' limit 1));
