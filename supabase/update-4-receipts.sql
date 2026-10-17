-- =====================================================================
--  تحديث رقم 4 (17 أكتوبر 2026):
--   * الراكب يرفع صورة تحويل إنستاباي من الموقع مباشرة (بالاسم + رقم الهاتف)
--   * المسؤول يرى الصورة في لوحة التحكم ويؤكد الدفع بضغطة
--  الصورة تُحفظ داخل قاعدة البيانات (مضغوطة من المتصفح، حد أقصى ~450 كيلوبايت)
--  ولا يقرؤها إلا المسؤول. لا يحتاج أي إعداد إضافي في Supabase Storage.
--  شغّل هذا الملف مرة واحدة في Supabase → SQL Editor (انسخ كل المحتوى ← Run)
--  آمن للتشغيل أكثر من مرة.
-- =====================================================================

alter table public.bookings add column if not exists receipt_uploaded_at timestamptz;

create table if not exists public.booking_receipts (
  booking_id  uuid primary key references public.bookings (id) on delete cascade,
  image       text not null
              check (char_length(image) <= 620000 and image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'),
  uploaded_at timestamptz not null default now()
);

alter table public.booking_receipts enable row level security;
drop policy if exists receipts_admin_read on public.booking_receipts;
create policy receipts_admin_read on public.booking_receipts
  for select to authenticated using (public.is_admin());

revoke all on public.booking_receipts from anon, authenticated;
grant select on public.booking_receipts to authenticated;

-- سجل العمليات: رفع الإيصال يظهر كعملية مستقلة «رفع إيصال»
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
      elsif (v_old->>'receipt_uploaded_at') is distinct from (v_new->>'receipt_uploaded_at') then
        v_action := 'receipt';
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

-- رفع صورة التحويل: الراكب يثبت ملكيته للحجز بالاسم + رقم الهاتف
create or replace function public.upload_my_receipt(p_trip_id uuid, p_full_name text, p_phone text, p_image text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype := public.find_my_booking_row(p_trip_id, p_full_name, p_phone);
  t public.trips%rowtype;
  v_now timestamptz := now();
begin
  select * into t from public.trips where id = p_trip_id;
  if t.status = 'cancelled' then
    raise exception 'TRIP_CANCELLED';
  end if;
  if b.is_paid then
    raise exception 'ALREADY_PAID';
  end if;
  if p_image is null or char_length(p_image) > 620000 then
    raise exception 'RECEIPT_TOO_LARGE';
  end if;
  if p_image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then
    raise exception 'INVALID_RECEIPT';
  end if;

  insert into public.booking_receipts (booking_id, image, uploaded_at)
  values (b.id, p_image, v_now)
  on conflict (booking_id) do update set image = excluded.image, uploaded_at = excluded.uploaded_at;

  update public.bookings set receipt_uploaded_at = v_now where id = b.id;
  return v_now;
end;
$$;

-- find_my_booking: إضافة وقت رفع الإيصال (يتطلب حذف الدالة لتغيير أعمدتها)
drop function if exists public.find_my_booking(uuid, text, text);
create function public.find_my_booking(p_trip_id uuid, p_full_name text, p_phone text)
returns table (
  full_name           text,
  seats               int,
  pickup_point_name   text,
  notes               text,
  is_paid             boolean,
  created_at          timestamptz,
  max_seats           int,
  locked_reason       text,
  receipt_uploaded_at timestamptz
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
           public.my_booking_editable(t, b),
           b.receipt_uploaded_at;
end;
$$;

-- القائمة العامة: إظهار «الإيصال قيد المراجعة» بجانب الاسم
drop function if exists public.get_public_bookings(uuid);
create function public.get_public_bookings(p_trip_id uuid)
returns table (
  row_no            int,
  display_name      text,
  seats             int,
  pickup_point_name text,
  created_at        timestamptz,
  is_paid           boolean,
  has_receipt       boolean
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
         b.is_paid,
         b.receipt_uploaded_at is not null
    from bookings b
    join pickup_points pp on pp.id = b.pickup_point_id
   where b.trip_id = p_trip_id and b.status = 'confirmed'
   order by b.created_at, b.id;
$$;

revoke execute on function public.upload_my_receipt(uuid, text, text, text) from public;
revoke execute on function public.find_my_booking(uuid, text, text) from public;
revoke execute on function public.get_public_bookings(uuid) from public;
grant execute on function public.upload_my_receipt(uuid, text, text, text) to anon, authenticated;
grant execute on function public.find_my_booking(uuid, text, text)         to anon, authenticated;
grant execute on function public.get_public_bookings(uuid)                 to anon, authenticated;
