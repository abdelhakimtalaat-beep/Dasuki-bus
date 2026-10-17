-- =====================================================================
--  تحديث رقم 3 (17 أكتوبر 2026):
--   * الراكب يعدّل حجزه أو يلغيه بنفسه (بالاسم + رقم الهاتف)
--   * منع تكرار الحجز بنفس الاسم أو نفس رقم الهاتف في نفس الرحلة
--   * رقم الهاتف إجباري للحجز من صفحة الحجز
--  شغّل هذا الملف مرة واحدة في Supabase → SQL Editor (انسخ كل المحتوى ← Run)
--  آمن للتشغيل أكثر من مرة.
-- =====================================================================

create or replace function public.normalize_name(p text)
returns text
language sql
immutable
as $$
  select lower(btrim(regexp_replace(
           translate(regexp_replace(coalesce(p, ''), '[\u064B-\u0652\u0640]', '', 'g'), 'أإآةى', 'اااهي'),
           '\s+', ' ', 'g')));
$$;

create or replace function public.bookings_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t    public.trips%rowtype;
  used int;
begin
  if tg_op = 'UPDATE' and new.trip_id <> old.trip_id then
    raise exception 'TRIP_CHANGE_NOT_ALLOWED';
  end if;

  -- تنظيف البيانات
  new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  new.phone     := public.normalize_phone(new.phone);
  new.notes     := nullif(btrim(coalesce(new.notes, '')), '');
  new.updated_at := now();

  if tg_op = 'INSERT' then
    new.booking_code := coalesce(new.booking_code, public.generate_booking_code());
    new.created_at   := now();
    new.is_paid      := false;   -- الدفع يُؤكَّد لاحقًا من المسؤول فقط
    new.paid_at      := null;
  else
    new.booking_code      := old.booking_code;       -- رقم الحجز ثابت
    new.created_at        := old.created_at;
    new.client_request_id := old.client_request_id;
  end if;

  if tg_op = 'UPDATE' and new.is_paid is distinct from old.is_paid then
    new.paid_at := case when new.is_paid then now() else null end;
  elsif tg_op = 'UPDATE' then
    new.paid_at := old.paid_at;
  end if;

  if new.status = 'cancelled' then
    if tg_op = 'INSERT' or old.status <> 'cancelled' then
      new.cancelled_at := now();
    end if;
  else
    new.cancelled_at := null;
  end if;

  -- نقطة التجمع يجب أن تكون معتمدة لهذه الرحلة
  if (tg_op = 'INSERT' or new.pickup_point_id <> old.pickup_point_id)
     and not exists (select 1 from public.trip_pickup_points tp
                     where tp.trip_id = new.trip_id and tp.pickup_point_id = new.pickup_point_id) then
    raise exception 'INVALID_PICKUP_POINT';
  end if;

  -- قفل صف الرحلة: يُسلسِل كل الكتابات المتزامنة على نفس الرحلة
  select * into t from public.trips where id = new.trip_id for update;
  if not found then
    raise exception 'TRIP_NOT_FOUND';
  end if;

  if new.status = 'confirmed' then
    if t.status = 'cancelled' then
      raise exception 'TRIP_CANCELLED';
    end if;
    -- منع تكرار الاسم أو رقم الهاتف في نفس الرحلة (الحجوزات المؤكدة فقط)
    if tg_op = 'INSERT' or old.status <> 'confirmed'
       or public.normalize_name(new.full_name) <> public.normalize_name(old.full_name)
       or new.phone is distinct from old.phone then
      if exists (select 1 from public.bookings b
                  where b.trip_id = new.trip_id and b.status = 'confirmed' and b.id <> new.id
                    and public.normalize_name(b.full_name) = public.normalize_name(new.full_name)) then
        raise exception 'DUPLICATE_NAME';
      end if;
      if new.phone is not null and exists (select 1 from public.bookings b
                  where b.trip_id = new.trip_id and b.status = 'confirmed' and b.id <> new.id
                    and b.phone = new.phone) then
        raise exception 'DUPLICATE_PHONE';
      end if;
    end if;
    select coalesce(sum(b.seats), 0) into used
      from public.bookings b
     where b.trip_id = new.trip_id and b.status = 'confirmed' and b.id <> new.id;
    if used + new.seats > t.capacity then
      raise exception 'NOT_ENOUGH_SEATS' using detail = greatest(t.capacity - used, 0)::text;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.create_booking(
  p_trip_id           uuid,
  p_full_name         text,
  p_seats             int,
  p_pickup_point_id   uuid,
  p_phone             text default null,
  p_notes             text default null,
  p_client_request_id uuid default null
)
returns table (
  booking_code      text,
  full_name         text,
  seats             int,
  pickup_point_name text,
  created_at        timestamptz,
  remaining_seats   int,
  already_existed   boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  t        public.trips%rowtype;
  b        public.bookings%rowtype;
  v_admin  boolean := public.is_admin();
  v_phone  text    := public.normalize_phone(p_phone);
  v_name   text    := btrim(regexp_replace(coalesce(p_full_name, ''), '\s+', ' ', 'g'));
  v_existed boolean := false;
begin
  -- التحقق من المدخلات (على الخادم)
  if char_length(v_name) < 3 or char_length(v_name) > 100 then
    raise exception 'INVALID_NAME';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 50 then
    raise exception 'INVALID_SEATS';
  end if;
  if p_pickup_point_id is null then
    raise exception 'PICKUP_REQUIRED';
  end if;
  if v_phone is not null and v_phone !~ '^01[0125][0-9]{8}$' then
    raise exception 'INVALID_PHONE';
  end if;
  if v_phone is null and not v_admin then
    raise exception 'PHONE_REQUIRED';
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception 'INVALID_NOTES';
  end if;

  -- قفل الرحلة طوال المعاملة
  select * into t from public.trips where id = p_trip_id for update;
  if not found then
    raise exception 'TRIP_NOT_FOUND';
  end if;

  -- منع التكرار: نفس الطلب يرجع نفس الحجز بدل إنشاء حجز جديد
  if p_client_request_id is not null then
    select * into b from public.bookings x
     where x.trip_id = p_trip_id and x.client_request_id = p_client_request_id;
    if found then
      v_existed := true;
    end if;
  end if;

  if not v_existed then
    if t.status = 'cancelled' then
      raise exception 'TRIP_CANCELLED';
    end if;

    -- المسؤول يستطيع إضافة حجز خارج فترة الحجز (لكن لا يتجاوز السعة أبدًا)
    if not v_admin then
      if t.status = 'closed' or now() > t.booking_closes_at then
        raise exception 'BOOKING_CLOSED';
      end if;
      if now() < t.booking_opens_at then
        raise exception 'BOOKING_NOT_OPEN_YET';
      end if;
      if t.booked_seats >= t.capacity then
        raise exception 'BUS_FULL';
      end if;
      if p_seats > t.max_seats_per_booking then
        raise exception 'MAX_SEATS_PER_BOOKING' using detail = t.max_seats_per_booking::text;
      end if;
      if not exists (select 1
                       from public.trip_pickup_points tp
                       join public.pickup_points pp on pp.id = tp.pickup_point_id
                      where tp.trip_id = p_trip_id
                        and tp.pickup_point_id = p_pickup_point_id
                        and pp.is_active) then
        raise exception 'INVALID_PICKUP_POINT';
      end if;
    end if;

    if t.booked_seats + p_seats > t.capacity then
      raise exception 'NOT_ENOUGH_SEATS' using detail = (t.capacity - t.booked_seats)::text;
    end if;

    insert into public.bookings (trip_id, full_name, seats, pickup_point_id, phone, notes, client_request_id)
    values (p_trip_id, v_name, p_seats, p_pickup_point_id, v_phone, p_notes, p_client_request_id)
    returning * into b;
  end if;

  return query
    select b.booking_code,
           b.full_name,
           b.seats,
           (select pp.name from public.pickup_points pp where pp.id = b.pickup_point_id),
           b.created_at,
           (select tr.capacity - tr.booked_seats from public.trips tr where tr.id = b.trip_id),
           v_existed;
end;
$$;

create or replace function public.find_my_booking_row(p_trip_id uuid, p_full_name text, p_phone text)
returns public.bookings
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_phone text := public.normalize_phone(p_phone);
  b public.bookings%rowtype;
begin
  if v_phone is null or v_phone !~ '^01[0125][0-9]{8}$' then
    raise exception 'INVALID_PHONE';
  end if;
  select * into b from public.bookings x
   where x.trip_id = p_trip_id and x.status = 'confirmed' and x.phone = v_phone
     and public.normalize_name(x.full_name) = public.normalize_name(p_full_name)
   limit 1;
  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;
  return b;
end;
$$;

create or replace function public.my_booking_editable(t public.trips, b public.bookings)
returns text
language sql
stable
as $$
  select case
    when t.status = 'cancelled' then 'TRIP_CANCELLED'
    when t.status = 'closed' or now() > t.booking_closes_at then 'BOOKING_CLOSED'
    when now() < t.booking_opens_at then 'BOOKING_NOT_OPEN_YET'
    when b.is_paid then 'PAID_LOCKED'
    else null end;
$$;

create or replace function public.find_my_booking(p_trip_id uuid, p_full_name text, p_phone text)
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

create or replace function public.update_my_booking(p_trip_id uuid, p_full_name text, p_phone text, p_seats int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype := public.find_my_booking_row(p_trip_id, p_full_name, p_phone);
  t public.trips%rowtype;
  v_reason text;
begin
  select * into t from public.trips where id = p_trip_id for update;
  v_reason := public.my_booking_editable(t, b);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;
  if p_seats is null or p_seats < 1 then
    raise exception 'INVALID_SEATS';
  end if;
  if p_seats > t.max_seats_per_booking then
    raise exception 'MAX_SEATS_PER_BOOKING' using detail = t.max_seats_per_booking::text;
  end if;
  update public.bookings set seats = p_seats where id = b.id;
  return p_seats;
end;
$$;

create or replace function public.cancel_my_booking(p_trip_id uuid, p_full_name text, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype := public.find_my_booking_row(p_trip_id, p_full_name, p_phone);
  t public.trips%rowtype;
  v_reason text;
begin
  select * into t from public.trips where id = p_trip_id for update;
  v_reason := public.my_booking_editable(t, b);
  if v_reason is not null then
    raise exception '%', v_reason;
  end if;
  update public.bookings set status = 'cancelled' where id = b.id;
end;
$$;

revoke execute on function public.find_my_booking_row(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.my_booking_editable(public.trips, public.bookings) from public, anon, authenticated;
grant execute on function public.find_my_booking(uuid, text, text)            to anon, authenticated;
grant execute on function public.update_my_booking(uuid, text, text, int)     to anon, authenticated;
grant execute on function public.cancel_my_booking(uuid, text, text)          to anon, authenticated;

-- للتأكد: حجوزات مكررة موجودة حاليًا (إن وُجدت تظهر هنا لتعالجها من لوحة التحكم)
select 'اسم مكرر' as issue, string_agg(b.full_name, ' / ') as value, count(*) from public.bookings b
 where b.status = 'confirmed' group by b.trip_id, public.normalize_name(b.full_name)
having count(*) > 1
union all
select 'هاتف مكرر', b.phone, count(*) from public.bookings b
 where b.status = 'confirmed' and b.phone is not null group by b.trip_id, b.phone
having count(*) > 1;
