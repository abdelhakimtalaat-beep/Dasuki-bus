-- =====================================================================
--  التراجع عن التحديث رقم 4 (رفع صورة الإيصال من الموقع)
--  يحذف جدول صور الإيصالات وعمود وقت الرفع، ويعيد الدوال كما كانت قبل التحديث.
--  الحجوزات وحالة الدفع لا تتأثر.
--  آمن للتشغيل حتى لو لم يكن التحديث 4 قد شُغّل أصلًا، وآمن للتشغيل أكثر من مرة.
--  شغّله في Supabase → SQL Editor (انسخ كل المحتوى ← Run)
-- =====================================================================

drop function if exists public.upload_my_receipt(uuid, text, text, text);
drop table if exists public.booking_receipts;

-- سجل العمليات: عمليات «رفع إيصال» السابقة تُعرض كتعديل عادي
update public.audit_log set action = 'update' where action = 'receipt';

-- إعادة دالة سجل العمليات كما كانت
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_old    jsonb;
  v_new    jsonb;
  v_id     text;
begin
  -- تحديثات الرحلة الناتجة تلقائيًا عن الحجوزات لا تُسجَّل (تجنب الضوضاء)
  if tg_table_name = 'trips' and pg_trigger_depth() > 1 then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_id := new.id::text; v_action := 'create';
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_id := new.id::text; v_action := 'update';
    if tg_table_name = 'bookings' then
      if v_old->>'status' <> v_new->>'status' then
        v_action := case when v_new->>'status' = 'cancelled' then 'cancel' else 'restore' end;
      elsif v_old->>'is_paid' <> v_new->>'is_paid' then
        v_action := case when (v_new->>'is_paid')::boolean then 'paid' else 'unpaid' end;
      end if;
    end if;
    if v_old = v_new then
      return null;
    end if;
  else
    v_old := to_jsonb(old); v_id := old.id::text; v_action := 'delete';
  end if;

  insert into public.audit_log (actor_id, actor_email, action, entity, entity_id, old_data, new_data)
  values (auth.uid(),
          (select u.email from auth.users u where u.id = auth.uid()),
          v_action, tg_table_name, v_id, v_old, v_new);
  return null;
end;
$$;

-- إعادة find_my_booking بأعمدتها الأصلية
drop function if exists public.find_my_booking(uuid, text, text);
create function public.find_my_booking(p_trip_id uuid, p_full_name text, p_phone text)
returns table (
  full_name         text,
  seats             int,
  pickup_point_name text,
  notes             text,
  is_paid           boolean,
  created_at        timestamptz,
  max_seats         int,
  locked_reason     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  b public.bookings%rowtype := public.find_my_booking_row(p_trip_id, p_full_name, p_phone);
  t public.trips%rowtype;
begin
  select * into t from public.trips where id = p_trip_id;
  return query
    select b.full_name, b.seats,
           (select pp.name from public.pickup_points pp where pp.id = b.pickup_point_id),
           b.notes, b.is_paid, b.created_at,
           least(t.max_seats_per_booking, b.seats + (t.capacity - t.booked_seats)),
           public.my_booking_editable(t, b);
end;
$$;

-- إعادة قائمة الركاب العامة بأعمدتها الأصلية
drop function if exists public.get_public_bookings(uuid);
create function public.get_public_bookings(p_trip_id uuid)
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

revoke execute on function public.find_my_booking(uuid, text, text) from public;
revoke execute on function public.get_public_bookings(uuid) from public;
grant execute on function public.find_my_booking(uuid, text, text) to anon, authenticated;
grant execute on function public.get_public_bookings(uuid)         to anon, authenticated;

-- حذف عمود وقت رفع الإيصال (بعد إعادة الدوال التي كانت تستخدمه)
alter table public.bookings drop column if exists receipt_uploaded_at;
