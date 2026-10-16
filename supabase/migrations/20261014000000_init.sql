-- =====================================================================
--  منصة حجز أتوبيس رحلة سيدي إبراهيم الدسوقي — مخطط قاعدة البيانات
--  (سعر المقعد + الدفع عبر إنستاباي يؤكده المسؤول)
--  Supabase / PostgreSQL 15+
--
--  مبادئ التصميم:
--  * السعة تُحسب وتُفرض داخل قاعدة البيانات فقط (وليس في الواجهة):
--      - كل عملية كتابة على الحجوزات تقفل صف الرحلة (SELECT ... FOR UPDATE)
--        فتُنفَّذ الحجوزات المتزامنة لنفس الرحلة واحدة تلو الأخرى.
--      - قيد CHECK (booked_seats BETWEEN 0 AND capacity) على جدول الرحلات
--        كخط دفاع أخير لا يمكن تجاوزه.
--  * الزائر لا يقرأ جدول الحجوزات مطلقًا؛ يحصل فقط على:
--      - إحصائيات مجمّعة (get_trip_stats)
--      - قائمة مختصرة بأسماء مقنّعة بلا هواتف ولا ملاحظات (get_public_bookings)
--  * الحجز يتم فقط عبر الدالة create_booking (لا يوجد INSERT مباشر للزوار).
--  * لا يوجد حذف للحجوزات — الإلغاء "ناعم" (status = cancelled) للحفاظ على السجل.
-- =====================================================================

-- ---------------------------------------------------------------------
-- الأنواع
-- ---------------------------------------------------------------------
create type public.trip_status as enum ('open', 'full', 'closed', 'cancelled');
create type public.booking_status as enum ('confirmed', 'cancelled');

-- ---------------------------------------------------------------------
-- المستخدمون الإداريون
-- (يُنشأ المستخدم من Supabase Auth ثم يُضاف هنا يدويًا بـ SQL)
-- ---------------------------------------------------------------------
create table public.admin_users (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- نقاط التجمع
-- ---------------------------------------------------------------------
create table public.pickup_points (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 200),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index pickup_points_name_uq on public.pickup_points (lower(btrim(name)));

-- ---------------------------------------------------------------------
-- الرحلات الأسبوعية
-- ---------------------------------------------------------------------
create table public.trips (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null default 'رحلة سيدي إبراهيم الدسوقي'
                          check (char_length(btrim(title)) between 2 and 120),
  trip_date             date not null,
  departure_time        time not null,
  departure_point       text not null check (char_length(btrim(departure_point)) between 2 and 120),
  destination           text not null default 'مسجد سيدي إبراهيم الدسوقي – دسوق، كفر الشيخ'
                          check (char_length(btrim(destination)) between 2 and 160),
  capacity              int not null default 50 check (capacity between 1 and 50),
  max_seats_per_booking int not null default 10 check (max_seats_per_booking between 1 and 50),
  seat_price            numeric(10,2) not null default 300 check (seat_price >= 0),
  instapay_number       text check (instapay_number is null or instapay_number ~ '^01[0125][0-9]{8}$'),
  booked_seats          int not null default 0,
  booking_opens_at      timestamptz not null,
  booking_closes_at     timestamptz not null,
  status                public.trip_status not null default 'open',
  notes                 text check (notes is null or char_length(notes) <= 500),
  -- تنبيهات ومسار الرحلة (سطر لكل بند) وروابط الخريطة
  announcements         text check (announcements is null or char_length(announcements) <= 2000),
  route_stops           text check (route_stops is null or char_length(route_stops) <= 2000),
  route_map_url         text check (route_map_url is null or route_map_url ~ '^https://[^\s"<>]+$'),
  route_embed_url       text check (route_embed_url is null
                                    or route_embed_url ~ '^https://(www\.|maps\.)?google\.com/maps[^\s"<>]*$'),
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint trips_window_chk   check (booking_closes_at > booking_opens_at),
  -- خط الدفاع الأخير: يستحيل أن تتجاوز المقاعد المحجوزة سعة الرحلة
  constraint trips_capacity_chk check (booked_seats between 0 and capacity)
);
create index trips_date_idx on public.trips (trip_date desc);

-- نقاط التجمع المعتمدة لكل رحلة
create table public.trip_pickup_points (
  trip_id         uuid not null references public.trips (id) on delete cascade,
  pickup_point_id uuid not null references public.pickup_points (id) on delete restrict,
  primary key (trip_id, pickup_point_id)
);

-- ---------------------------------------------------------------------
-- الحجوزات
-- ---------------------------------------------------------------------
create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  booking_code      text not null unique,
  trip_id           uuid not null references public.trips (id) on delete restrict,
  full_name         text not null check (char_length(btrim(full_name)) between 3 and 100),
  seats             int  not null check (seats between 1 and 50),
  pickup_point_id   uuid not null references public.pickup_points (id) on delete restrict,
  phone             text check (phone is null or phone ~ '^01[0125][0-9]{8}$'),
  notes             text check (notes is null or char_length(notes) <= 500),
  status            public.booking_status not null default 'confirmed',
  is_paid           boolean not null default false,   -- يؤكده المسؤول فقط بعد استلام التحويل
  paid_at           timestamptz,
  client_request_id uuid,               -- لمنع التكرار عند الضغط المتكرر
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  cancelled_at      timestamptz,
  constraint bookings_request_uq unique (trip_id, client_request_id)
);
create index bookings_trip_idx on public.bookings (trip_id, status);

-- ---------------------------------------------------------------------
-- سجل العمليات
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_email text,
  action      text not null,
  entity      text not null,
  entity_id   text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);

-- =====================================================================
-- دوال مساعدة
-- =====================================================================

-- توحيد رقم الهاتف المصري: أرقام عربية/فارسية، مسافات، +20 / 0020
create or replace function public.normalize_phone(p text)
returns text
language plpgsql
immutable
as $$
declare d text;
begin
  if p is null or btrim(p) = '' then
    return null;
  end if;
  d := translate(p, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  d := regexp_replace(d, '[^0-9]', '', 'g');
  if d like '0020%' then
    d := substr(d, 5);
  elsif d like '20%' and length(d) = 12 then
    d := substr(d, 3);
  end if;
  if length(d) = 10 and d like '1%' then
    d := '0' || d;
  end if;
  return d;
end;
$$;

-- رقم حجز عشوائي غير قابل للتخمين: DSQ-XXXX-XXXX (بدون أحرف ملتبسة)
create or replace function public.generate_booking_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  raw   bytea;
  code  text;
  i     int;
begin
  loop
    raw  := uuid_send(gen_random_uuid());   -- مصدر عشوائي آمن
    code := 'DSQ-';
    for i in 0..7 loop
      if i = 4 then code := code || '-'; end if;
      code := code || substr(chars, 1 + (get_byte(raw, i) % length(chars)), 1);
    end loop;
    exit when not exists (select 1 from public.bookings b where b.booking_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =====================================================================
-- قوادح (Triggers) الحجوزات — جوهر حساب المقاعد
-- =====================================================================
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

-- بعد الكتابة: إعادة حساب المقاعد المحجوزة وحالة "مكتملة" تلقائيًا
create or replace function public.bookings_after_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip uuid := coalesce(new.trip_id, old.trip_id);
  used   int;
begin
  select coalesce(sum(seats), 0) into used
    from public.bookings where trip_id = v_trip and status = 'confirmed';
  update public.trips
     set booked_seats = used,
         status = case
                    when status in ('open', 'full')
                      then (case when used >= capacity then 'full' else 'open' end)::public.trip_status
                    else status
                  end
   where id = v_trip;
  return null;
end;
$$;

create trigger bookings_before_write
  before insert or update on public.bookings
  for each row execute function public.bookings_before_write();

create trigger bookings_after_write
  after insert or update or delete on public.bookings
  for each row execute function public.bookings_after_write();

-- قوادح الرحلات: حالة "مكتملة" تُدار تلقائيًا من السعة
create or replace function public.trips_before_write()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.title           := btrim(new.title);
  new.departure_point := btrim(new.departure_point);
  new.destination     := btrim(new.destination);
  new.notes           := nullif(btrim(coalesce(new.notes, '')), '');
  if tg_op = 'INSERT' then
    new.booked_seats := 0;
  end if;
  if new.status in ('open', 'full') then
    new.status := case when new.booked_seats >= new.capacity then 'full' else 'open' end;
  end if;
  return new;
end;
$$;

create trigger trips_before_write
  before insert or update on public.trips
  for each row execute function public.trips_before_write();

create trigger pickup_points_touch
  before update on public.pickup_points
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- سجل العمليات (Audit) — يسجل كل تغيير مهم مع هوية المنفّذ
-- =====================================================================
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

create trigger audit_bookings      after insert or update or delete on public.bookings
  for each row execute function public.audit_trigger();
create trigger audit_trips         after insert or update or delete on public.trips
  for each row execute function public.audit_trigger();
create trigger audit_pickup_points after insert or update or delete on public.pickup_points
  for each row execute function public.audit_trigger();

-- =====================================================================
-- دوال الواجهة العامة (RPC)
-- =====================================================================

-- إنشاء حجز — الطريقة الوحيدة للزائر لإضافة حجز
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

-- إحصائيات الرحلة (مجمّعة، بلا بيانات شخصية)
create or replace function public.get_trip_stats(p_trip_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'trip_id',            t.id,
    'capacity',           t.capacity,
    'total_bookings',     (select count(*) from bookings b where b.trip_id = t.id and b.status = 'confirmed'),
    'booked_seats',       t.booked_seats,
    'remaining_seats',    t.capacity - t.booked_seats,
    'occupancy_pct',      round(100.0 * t.booked_seats / t.capacity, 1),
    'paid_seats',         (select coalesce(sum(b.seats), 0) from bookings b
                            where b.trip_id = t.id and b.status = 'confirmed' and b.is_paid),
    'paid_bookings',      (select count(*) from bookings b
                            where b.trip_id = t.id and b.status = 'confirmed' and b.is_paid),
    'seat_price',         t.seat_price,
    'expected_amount',    t.booked_seats * t.seat_price,
    'paid_amount',        (select coalesce(sum(b.seats), 0) from bookings b
                            where b.trip_id = t.id and b.status = 'confirmed' and b.is_paid) * t.seat_price,
    'pickup_points_used', (select count(distinct b.pickup_point_id) from bookings b
                            where b.trip_id = t.id and b.status = 'confirmed'),
    'cancelled_bookings', (select count(*) from bookings b where b.trip_id = t.id and b.status = 'cancelled'),
    'by_pickup_point',    coalesce((
        select jsonb_agg(jsonb_build_object(
                 'pickup_point_id', pp.id,
                 'name',            pp.name,
                 'bookings',        coalesce(s.cnt, 0),
                 'seats',           coalesce(s.seats, 0))
               order by pp.sort_order, pp.name)
          from trip_pickup_points tp
          join pickup_points pp on pp.id = tp.pickup_point_id
          left join (select b.pickup_point_id, count(*) cnt, sum(b.seats) seats
                       from bookings b
                      where b.trip_id = t.id and b.status = 'confirmed'
                      group by b.pickup_point_id) s on s.pickup_point_id = pp.id
         where tp.trip_id = t.id), '[]'::jsonb)
  )
  from trips t
  where t.id = p_trip_id;
$$;

-- قائمة الركاب العامة: اسم مقنّع (الاسم الأول + أول حرف من الثاني)، بلا هاتف ولا ملاحظات
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
         split_part(b.full_name, ' ', 1)
           || case when split_part(b.full_name, ' ', 2) <> ''
                   then ' ' || left(split_part(b.full_name, ' ', 2), 1) || '.'
                   else '' end,
         b.seats,
         pp.name,
         b.created_at,
         b.is_paid
    from bookings b
    join pickup_points pp on pp.id = b.pickup_point_id
   where b.trip_id = p_trip_id and b.status = 'confirmed'
   order by b.created_at, b.id;
$$;

-- استعلام صاحب الحجز عن حجزه برقم الحجز
create or replace function public.lookup_booking(p_code text)
returns table (
  booking_code      text,
  full_name         text,
  seats             int,
  pickup_point_name text,
  status            public.booking_status,
  created_at        timestamptz,
  trip_title        text,
  trip_date         date,
  departure_time    time,
  trip_status       public.trip_status,
  is_paid           boolean,
  amount            numeric,
  instapay_number   text
)
language sql
stable
security definer
set search_path = public
as $$
  select b.booking_code, b.full_name, b.seats, pp.name, b.status, b.created_at,
         t.title, t.trip_date, t.departure_time, t.status,
         b.is_paid, b.seats * t.seat_price, t.instapay_number
    from bookings b
    join trips t on t.id = b.trip_id
    join pickup_points pp on pp.id = b.pickup_point_id
   where b.booking_code = upper(btrim(p_code));
$$;

-- =====================================================================
-- دوال الإدارة (تتحقق من الصلاحية داخل الخادم)
-- =====================================================================
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

create or replace function public.admin_set_trip_status(p_id uuid, p_status public.trip_status)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.trips set status = p_status where id = p_id;
  if not found then
    raise exception 'TRIP_NOT_FOUND';
  end if;
end;
$$;

-- =====================================================================
-- أمان الصفوف (Row Level Security)
-- =====================================================================
alter table public.admin_users        enable row level security;
alter table public.pickup_points      enable row level security;
alter table public.trips              enable row level security;
alter table public.trip_pickup_points enable row level security;
alter table public.bookings           enable row level security;
alter table public.audit_log          enable row level security;

-- المسؤول يرى سجله فقط (للتحقق من كونه مسؤولًا)
create policy admin_users_self on public.admin_users
  for select to authenticated using (user_id = auth.uid());

-- الرحلات ونقاط التجمع: قراءة عامة، والكتابة عبر دوال الإدارة أو للمسؤول فقط
create policy trips_read on public.trips
  for select to anon, authenticated using (true);

create policy pickup_points_read on public.pickup_points
  for select to anon, authenticated using (true);
create policy pickup_points_admin_insert on public.pickup_points
  for insert to authenticated with check (public.is_admin());
create policy pickup_points_admin_update on public.pickup_points
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy trip_points_read on public.trip_pickup_points
  for select to anon, authenticated using (true);

-- الحجوزات: المسؤول فقط يقرأ ويعدّل. الزائر لا يملك أي صلاحية مباشرة.
create policy bookings_admin_read on public.bookings
  for select to authenticated using (public.is_admin());
create policy bookings_admin_update on public.bookings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy audit_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

-- =====================================================================
-- الصلاحيات (Grants) — أقل صلاحيات ممكنة
-- =====================================================================
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on public.trips, public.pickup_points, public.trip_pickup_points to anon, authenticated;
grant insert, update on public.pickup_points to authenticated;
grant select, update (full_name, seats, pickup_point_id, phone, notes, status, is_paid)
  on public.bookings to authenticated;
grant select on public.audit_log   to authenticated;
grant select on public.admin_users to authenticated;

grant execute on function public.is_admin()                                  to anon, authenticated;
grant execute on function public.create_booking(uuid, text, int, uuid, text, text, uuid) to anon, authenticated;
grant execute on function public.get_trip_stats(uuid)                        to anon, authenticated;
grant execute on function public.get_public_bookings(uuid)                   to anon, authenticated;
grant execute on function public.lookup_booking(text)                        to anon, authenticated;
grant execute on function public.admin_save_trip(uuid, jsonb, uuid[])        to authenticated;
grant execute on function public.admin_set_trip_status(uuid, public.trip_status) to authenticated;

-- =====================================================================
-- التحديث المباشر (Realtime)
-- الزائر يشترك في تغييرات جدول الرحلات (booked_seats يتغير مع كل حجز)
-- المسؤول يشترك في جدول الحجوزات (محمي بـ RLS)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.trips, public.bookings, public.pickup_points;
  end if;
end $$;
