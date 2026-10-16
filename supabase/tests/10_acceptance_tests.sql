-- =====================================================================
-- اختبارات قبول قاعدة البيانات (تُشغَّل على نسخة اختبار فقط)
-- كل اختبار يرفع استثناء عند الفشل، ويطبع PASS عند النجاح.
-- =====================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema if not exists t;
grant usage on schema t to public;

-- مساعد: تنفيذ جملة وتوقع خطأ يحتوي نصًا معينًا
create or replace function t.expect_error(p_sql text, p_expected text, p_label text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_expected in sqlerrm) > 0 or position(p_expected in sqlstate) > 0 then
      raise notice 'PASS: %', p_label;
      return;
    end if;
    raise exception 'FAIL: % — got error "%" (expected "%")', p_label, sqlerrm, p_expected;
  end;
  raise exception 'FAIL: % — no error raised (expected "%")', p_label, p_expected;
end $$;

create or replace function t.ok(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_cond is distinct from true then
    raise exception 'FAIL: %', p_label;
  end if;
  raise notice 'PASS: %', p_label;
end $$;
grant execute on all functions in schema t to public;

-- جلسات المستخدمين
create or replace function t.as_anon() returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '', false);
  set role anon;
end $$;
create or replace function t.as_user(p_id uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', p_id)::text, false);
  set role authenticated;
end $$;
grant execute on all functions in schema t to public;

-- ---------------------------------------------------------------------
-- تجهيز: مسؤول، مستخدم عادي، نقاط تجمع، رحلتان أسبوعيتان
-- ---------------------------------------------------------------------
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@example.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'random@example.com');
insert into public.admin_users (user_id, display_name)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'المسؤول');

insert into public.pickup_points (id, name, sort_order) values
  ('11111111-0000-0000-0000-000000000001', 'الشروق', 1),
  ('11111111-0000-0000-0000-000000000002', 'مدينة نصر', 2),
  ('11111111-0000-0000-0000-000000000003', 'رمسيس', 3);

-- المسؤول ينشئ رحلتين عبر دالة الإدارة
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
create temp table ids as
select
  public.admin_save_trip(null, jsonb_build_object(
    'trip_date', current_date + 2, 'departure_time', '06:00', 'departure_point', 'رمسيس',
    'booking_opens_at', now() - interval '1 day', 'booking_closes_at', now() + interval '1 day'),
    array['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000003']::uuid[]) as week1,
  public.admin_save_trip(null, jsonb_build_object(
    'trip_date', current_date + 9, 'departure_time', '06:00', 'departure_point', 'رمسيس',
    'booking_opens_at', now() - interval '1 day', 'booking_closes_at', now() + interval '8 day'),
    array['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002']::uuid[]) as week2;
reset role;
grant select on ids to public;

-- =====================================================================
-- 1) مستخدمان مختلفان يحجزان وتظهر الحجوزات للجميع
-- =====================================================================
select t.as_anon();
select * from public.create_booking((select week1 from ids), 'أحمد محمد علي', 2,
  '11111111-0000-0000-0000-000000000001', '01012345678', 'معي طفل');
select * from public.create_booking((select week1 from ids), 'محمود حسن', 1,
  '11111111-0000-0000-0000-000000000002', null, null);
select t.ok((public.get_trip_stats((select week1 from ids))->>'total_bookings')::int = 2, 'حجزان مسجلان يظهران في الإحصائيات');
select t.ok((public.get_trip_stats((select week1 from ids))->>'booked_seats')::int = 3, 'إجمالي المقاعد = 3 (وليس عدد السجلات)');
select t.ok((select count(*) from public.get_public_bookings((select week1 from ids))) = 2, 'القائمة العامة تعرض الحجزين');
select t.ok((public.get_trip_stats((select week1 from ids))->>'pickup_points_used')::int = 2, 'عدد نقاط التجمع المستخدمة = 2');

-- =====================================================================
-- 2) الخصوصية: الزائر لا يرى الهواتف ولا جدول الحجوزات
-- =====================================================================
select t.ok((select display_name from public.get_public_bookings((select week1 from ids)) where row_no = 1) = 'أحمد م.', 'الاسم مقنّع في القائمة العامة');
select t.ok(not exists (select 1 from information_schema.routines r
              join information_schema.parameters p on p.specific_name = r.specific_name
             where r.routine_name = 'get_public_bookings' and p.parameter_name in ('phone','notes')),
            'القائمة العامة لا تحتوي عمود هاتف أو ملاحظات');
select t.expect_error('select * from public.bookings', 'permission denied', 'الزائر لا يستطيع قراءة جدول الحجوزات');
select t.expect_error($q$update public.bookings set seats = 1$q$, 'permission denied', 'الزائر لا يستطيع تعديل الحجوزات');
select t.expect_error($q$delete from public.bookings$q$, 'permission denied', 'الزائر لا يستطيع حذف الحجوزات');
select t.expect_error($q$insert into public.bookings (booking_code, trip_id, full_name, seats, pickup_point_id)
   values ('X', (select week1 from ids), 'اختراق', 1, '11111111-0000-0000-0000-000000000001')$q$,
   'permission denied', 'الزائر لا يستطيع الإدخال المباشر متجاوزًا الدالة');
select t.expect_error('select * from public.audit_log', 'permission denied', 'الزائر لا يقرأ سجل العمليات');

-- =====================================================================
-- 3) صلاحيات الإدارة على الخادم
-- =====================================================================
select t.expect_error($q$select public.admin_save_trip(null, '{}'::jsonb, array[gen_random_uuid()])$q$,
   'permission denied', 'الزائر لا يستطيع استدعاء دوال الإدارة');
select t.expect_error($q$update public.pickup_points set name = 'x'$q$, 'permission denied', 'الزائر لا يعدّل نقاط التجمع');

select t.as_user('bbbbbbbb-0000-0000-0000-000000000002');   -- مسجّل دخول لكنه ليس مسؤولًا
select t.ok((select count(*) from public.bookings) = 0, 'مستخدم مسجّل غير مسؤول لا يرى أي حجز (RLS)');
update public.bookings set seats = 1;
select t.ok((select sum(seats) from public.get_public_bookings((select week1 from ids))) = 3, 'مستخدم غير مسؤول لا يستطيع تعديل الحجوزات (RLS)');
select t.expect_error($q$select public.admin_save_trip(null, '{}'::jsonb, array[gen_random_uuid()])$q$, 'FORBIDDEN', 'مستخدم غير مسؤول يُرفض في دوال الإدارة');
select t.expect_error($q$insert into public.pickup_points (name) values ('نقطة مزيفة')$q$, 'row-level security', 'غير المسؤول لا يضيف نقاط تجمع');
select t.ok(public.is_admin() = false, 'is_admin = false لغير المسؤول');

select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok(public.is_admin(), 'is_admin = true للمسؤول');
select t.ok((select count(*) from public.bookings where phone = '01012345678') = 1, 'المسؤول يرى أرقام الهواتف');

-- =====================================================================
-- 4) السعة: لا تتجاوز 50، ومقعد واحد متبقٍ لا يقبل حجز مقعدين
-- =====================================================================
-- المسؤول يملأ الرحلة حتى 49 مقعدًا (3 موجودة + 46)
do $$
declare i int;
begin
  for i in 1..4 loop
    perform public.create_booking((select week1 from ids), 'راكب جماعي ' || i, 10, '11111111-0000-0000-0000-000000000003');
  end loop;
  perform public.create_booking((select week1 from ids), 'راكب أخير', 6, '11111111-0000-0000-0000-000000000003');
end $$;
select t.ok((public.get_trip_stats((select week1 from ids))->>'remaining_seats')::int = 1, 'تبقى مقعد واحد (49 من 50)');

select t.as_anon();
select t.expect_error($q$select * from public.create_booking((select week1 from ids), 'زائر متأخر', 2, '11111111-0000-0000-0000-000000000001')$q$,
   'NOT_ENOUGH_SEATS', 'مقعد واحد متبقٍ: حجز مقعدين مرفوض');
select * from public.create_booking((select week1 from ids), 'آخر راكب', 1, '11111111-0000-0000-0000-000000000001');
select t.ok((select status from public.trips where id = (select week1 from ids)) = 'full', 'حالة الرحلة تصبح "مكتملة" تلقائيًا عند 50');
select t.expect_error($q$select * from public.create_booking((select week1 from ids), 'زائر جديد', 1, '11111111-0000-0000-0000-000000000001')$q$,
   'BUS_FULL', 'الأتوبيس مكتمل: لا يُقبل أي حجز');

-- المسؤول نفسه لا يستطيع تجاوز السعة
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.expect_error($q$select * from public.create_booking((select week1 from ids), 'محاولة مسؤول', 1, '11111111-0000-0000-0000-000000000001')$q$,
   'NOT_ENOUGH_SEATS', 'المسؤول أيضًا لا يتجاوز 50 مقعدًا');
select t.expect_error($q$update public.bookings set seats = seats + 1 where full_name = 'آخر راكب'$q$,
   'NOT_ENOUGH_SEATS', 'تعديل عدد المقاعد لا يتجاوز السعة');
select t.expect_error($q$update public.trips set capacity = 40 where id = (select week1 from ids)$q$,
   'permission denied', 'لا يمكن تعديل الرحلة مباشرة إلا عبر دالة الإدارة');
select t.expect_error($q$select public.admin_save_trip((select week1 from ids), jsonb_build_object(
    'trip_date', current_date + 2, 'departure_time', '06:00', 'departure_point', 'رمسيس', 'capacity', 40,
    'booking_opens_at', now() - interval '1 day', 'booking_closes_at', now() + interval '1 day'),
    array['11111111-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000003']::uuid[])$q$,
   'trips_capacity_chk', 'لا يمكن تقليل السعة لأقل من المقاعد المحجوزة');
select t.expect_error($q$select public.admin_save_trip(null, jsonb_build_object(
    'trip_date', current_date + 20, 'departure_time', '06:00', 'departure_point', 'رمسيس', 'capacity', 60,
    'booking_opens_at', now(), 'booking_closes_at', now() + interval '1 day'),
    array['11111111-0000-0000-0000-000000000001']::uuid[])$q$,
   'capacity_check', 'لا يمكن إنشاء رحلة بسعة أكبر من 50');

-- =====================================================================
-- 5) إلغاء حجز 3 مقاعد يعيد إتاحتها
-- =====================================================================
update public.bookings set seats = 3 where full_name = 'راكب أخير';  -- 50 -> 47
select t.ok((public.get_trip_stats((select week1 from ids))->>'remaining_seats')::int = 3, 'تقليل مقاعد حجز يعيد إتاحة المقاعد');
update public.bookings set seats = 6 where full_name = 'راكب أخير';  -- 47 -> 50
update public.bookings set status = 'cancelled' where full_name = 'أحمد محمد علي';  -- يلغي 2
update public.bookings set status = 'cancelled' where full_name = 'محمود حسن';      -- يلغي 1
select t.ok((public.get_trip_stats((select week1 from ids))->>'remaining_seats')::int = 3, 'إلغاء حجوزات بـ 3 مقاعد يتيح 3 مقاعد');
select t.ok((select status from public.trips where id = (select week1 from ids)) = 'open', 'الرحلة تعود "مفتوحة" بعد الإلغاء');
select t.ok((select cancelled_at is not null from public.bookings where full_name = 'محمود حسن'), 'يُسجَّل وقت الإلغاء');
select t.ok((public.get_trip_stats((select week1 from ids))->>'cancelled_bookings')::int = 2, 'الحجوزات الملغاة محفوظة كسجل');

select t.as_anon();
select * from public.create_booking((select week1 from ids), 'سيد عبد الله', 3, '11111111-0000-0000-0000-000000000002');
select t.ok((public.get_trip_stats((select week1 from ids))->>'booked_seats')::int = 50, 'المقاعد المحررة أصبحت متاحة للحجز مجددًا');

select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.expect_error($q$update public.bookings set status = 'confirmed' where full_name = 'محمود حسن'$q$,
   'NOT_ENOUGH_SEATS', 'استعادة حجز ملغى مرفوضة إذا لم تتوفر مقاعد');

-- =====================================================================
-- 6) فصل الأسابيع
-- =====================================================================
select t.as_anon();
select * from public.create_booking((select week2 from ids), 'حجز الأسبوع الثاني', 4, '11111111-0000-0000-0000-000000000001');
select t.ok((public.get_trip_stats((select week2 from ids))->>'booked_seats')::int = 4, 'حجوزات الأسبوع الثاني مستقلة');
select t.ok((public.get_trip_stats((select week1 from ids))->>'booked_seats')::int = 50, 'حجوزات الأسبوع الأول لم تتأثر');
select t.expect_error($q$select * from public.create_booking((select week2 from ids), 'نقطة غير معتمدة', 1, '11111111-0000-0000-0000-000000000003')$q$,
   'INVALID_PICKUP_POINT', 'لا يمكن اختيار نقطة غير معتمدة لهذه الرحلة');

-- =====================================================================
-- 7) منع التكرار (الضغط المتكرر)
-- =====================================================================
select * from public.create_booking((select week2 from ids), 'ضغط مزدوج', 2, '11111111-0000-0000-0000-000000000001', null, null, 'cccccccc-0000-0000-0000-000000000009');
select t.ok((select already_existed from public.create_booking((select week2 from ids), 'ضغط مزدوج', 2, '11111111-0000-0000-0000-000000000001', null, null, 'cccccccc-0000-0000-0000-000000000009')),
   'نفس الطلب مرتين يُرجع الحجز الأول');
select t.ok((public.get_trip_stats((select week2 from ids))->>'booked_seats')::int = 6, 'الضغط المتكرر لا ينشئ حجزًا مكررًا');

-- =====================================================================
-- 8) التحقق من البيانات على الخادم
-- =====================================================================
select t.expect_error($q$select * from public.create_booking((select week2 from ids), 'اسم', 1, '11111111-0000-0000-0000-000000000001', '0123')$q$, 'INVALID_PHONE', 'رقم هاتف غير صالح مرفوض');
select t.expect_error($q$select * from public.create_booking((select week2 from ids), 'اسم', 1, '11111111-0000-0000-0000-000000000001', '01312345678')$q$, 'INVALID_PHONE', 'بادئة غير مصرية (013) مرفوضة');
select t.expect_error($q$select * from public.create_booking((select week2 from ids), ' ', 1, '11111111-0000-0000-0000-000000000001')$q$, 'INVALID_NAME', 'الاسم الفارغ مرفوض');
select t.expect_error($q$select * from public.create_booking((select week2 from ids), 'اسم كامل', 0, '11111111-0000-0000-0000-000000000001')$q$, 'INVALID_SEATS', 'صفر مقاعد مرفوض');
select t.expect_error($q$select * from public.create_booking((select week2 from ids), 'اسم كامل', 1, null)$q$, 'PICKUP_REQUIRED', 'نقطة التجمع إلزامية');
select t.expect_error($q$select * from public.create_booking((select week2 from ids), 'اسم كامل', 11, '11111111-0000-0000-0000-000000000001')$q$, 'MAX_SEATS_PER_BOOKING', 'الحد الأقصى للمقاعد في الحجز الواحد');
select * from public.create_booking((select week2 from ids), 'هاتف بأرقام عربية', 1, '11111111-0000-0000-0000-000000000001', '+20 ١٠٠ ١٢٣ ٤٥٦٧');
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.ok((select phone from public.bookings where full_name = 'هاتف بأرقام عربية') = '01001234567', 'توحيد الرقم المصري (+20 وأرقام عربية)');
select t.ok((select booking_code ~ '^DSQ-[A-Z2-9]{4}-[A-Z2-9]{4}$' from public.bookings limit 1), 'صيغة رقم الحجز صحيحة');
select t.expect_error($q$update public.bookings set booking_code = 'HACK' where full_name = 'ضغط مزدوج'$q$, 'permission denied', 'رقم الحجز غير قابل للتعديل');

-- =====================================================================
-- 9) نوافذ الحجز وحالات الرحلة
-- =====================================================================
create temp table w as select
  public.admin_save_trip(null, jsonb_build_object('trip_date', current_date + 16, 'departure_time', '06:00', 'departure_point', 'رمسيس',
    'booking_opens_at', now() + interval '2 day', 'booking_closes_at', now() + interval '5 day'),
    array['11111111-0000-0000-0000-000000000001']::uuid[]) as future,
  public.admin_save_trip(null, jsonb_build_object('trip_date', current_date - 5, 'departure_time', '06:00', 'departure_point', 'رمسيس',
    'booking_opens_at', now() - interval '9 day', 'booking_closes_at', now() - interval '6 day'),
    array['11111111-0000-0000-0000-000000000001']::uuid[]) as past;
grant select on w to public;
select public.admin_set_trip_status((select week2 from ids), 'closed');

select t.as_anon();
select t.expect_error($q$select * from public.create_booking((select future from w), 'مبكر', 1, '11111111-0000-0000-0000-000000000001')$q$, 'BOOKING_NOT_OPEN_YET', 'الحجز قبل موعد الفتح مرفوض');
select t.expect_error($q$select * from public.create_booking((select past from w), 'متأخر', 1, '11111111-0000-0000-0000-000000000001')$q$, 'BOOKING_CLOSED', 'الحجز بعد موعد الإغلاق مرفوض');
select t.expect_error($q$select * from public.create_booking((select week2 from ids), 'بعد الإغلاق', 1, '11111111-0000-0000-0000-000000000001')$q$, 'BOOKING_CLOSED', 'الرحلة المغلقة يدويًا لا تقبل حجوزات');

select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select * from public.create_booking((select past from w), 'إضافة من المسؤول', 1, '11111111-0000-0000-0000-000000000001');
select t.ok(true, 'المسؤول يستطيع إضافة حجز خارج فترة الحجز');
select public.admin_set_trip_status((select future from w), 'cancelled');
select t.expect_error($q$select * from public.create_booking((select future from w), 'رحلة ملغاة', 1, '11111111-0000-0000-0000-000000000001')$q$, 'TRIP_CANCELLED', 'الرحلة الملغاة لا تقبل حجوزات حتى من المسؤول');

-- =====================================================================
-- 10) نقاط التجمع: الإيقاف لا يمحو السجل التاريخي
-- =====================================================================
update public.pickup_points set is_active = false where name = 'مدينة نصر';
select t.ok((select count(*) from public.bookings b join public.pickup_points p on p.id = b.pickup_point_id where p.name = 'مدينة نصر') > 0, 'الحجوزات القديمة تحتفظ بنقطة التجمع الموقوفة');
select t.expect_error($q$delete from public.pickup_points where name = 'مدينة نصر'$q$, 'permission denied', 'نقاط التجمع لا تُحذف (تُوقف فقط)');
select public.admin_set_trip_status((select week2 from ids), 'open');
select t.as_anon();
select t.expect_error($q$select * from public.create_booking((select week2 from ids), 'نقطة موقوفة', 1, '11111111-0000-0000-0000-000000000002')$q$, 'INVALID_PICKUP_POINT', 'الزائر لا يحجز على نقطة موقوفة');
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
select t.expect_error($q$select public.admin_save_trip((select week1 from ids), jsonb_build_object(
    'trip_date', current_date + 2, 'departure_time', '06:00', 'departure_point', 'رمسيس',
    'booking_opens_at', now() - interval '1 day', 'booking_closes_at', now() + interval '1 day'),
    array['11111111-0000-0000-0000-000000000001']::uuid[])$q$,
   'PICKUP_POINT_IN_USE', 'لا يمكن إزالة نقطة تجمع عليها حجوزات من رحلة');

-- =====================================================================
-- 11) سجل العمليات
-- =====================================================================
select t.ok((select count(*) from public.audit_log where action = 'cancel' and entity = 'bookings'
              and actor_email = 'admin@example.com') = 2, 'سجل العمليات يوثق الإلغاء مع اسم المسؤول');
select t.ok((select count(*) from public.audit_log where entity = 'trips' and action = 'create') >= 4, 'سجل العمليات يوثق إنشاء الرحلات');
select t.ok((select count(*) from public.audit_log where entity = 'bookings' and action = 'create' and actor_id is null) > 0, 'حجوزات الزوار مسجلة بدون هوية');

-- =====================================================================
-- 12) استعلام صاحب الحجز برقم الحجز
-- =====================================================================
create temp table code as select booking_code from public.bookings where full_name = 'سيد عبد الله';
grant select on code to public;
select t.as_anon();
select t.ok((select seats from public.lookup_booking(lower((select booking_code from code)))) = 3, 'الاستعلام برقم الحجز يعمل (غير حساس لحالة الأحرف)');
select t.ok((select count(*) from public.lookup_booking('DSQ-AAAA-AAAA')) = 0, 'رقم حجز غير موجود لا يُرجع شيئًا');

-- =====================================================================
-- 13) الدفع: المسؤول فقط يؤكده، ويظهر في الإحصائيات
-- =====================================================================
select t.as_anon();
select t.expect_error($q$update public.bookings set is_paid = true$q$, 'permission denied', 'الزائر لا يستطيع تعليم حجز كمدفوع');
select t.ok(not (select is_paid from public.lookup_booking((select booking_code from code))), 'الحجز الجديد غير مدفوع افتراضيًا');
select t.ok((select amount from public.lookup_booking((select booking_code from code))) = 900, 'المبلغ = 3 مقاعد × 300 جنيه');

select t.as_user('bbbbbbbb-0000-0000-0000-000000000002');
update public.bookings set is_paid = true;
select t.ok((public.get_trip_stats((select week1 from ids))->>'paid_seats')::int = 0, 'مستخدم غير مسؤول لا يستطيع تأكيد الدفع (RLS)');

select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
update public.bookings set is_paid = true where booking_code = (select booking_code from code);
select t.ok((public.get_trip_stats((select week1 from ids))->>'paid_seats')::int = 3, 'تأكيد الدفع يظهر في المقاعد المدفوعة');
select t.ok((public.get_trip_stats((select week1 from ids))->>'paid_amount')::numeric = 900, 'المبلغ المحصل = 900');
select t.ok((public.get_trip_stats((select week1 from ids))->>'expected_amount')::numeric = 15000, 'المبلغ المتوقع = 50 × 300');
select t.ok((select paid_at is not null from public.bookings where booking_code = (select booking_code from code)), 'يُسجَّل وقت تأكيد الدفع');
select t.ok((select count(*) from public.audit_log where action = 'paid') = 1, 'سجل العمليات يوثق تأكيد الدفع');
select t.ok((select is_paid from public.get_public_bookings((select week1 from ids)) where display_name = 'سيد ع.'), 'القائمة العامة تعرض حالة الدفع');
update public.bookings set is_paid = false where booking_code = (select booking_code from code);
select t.ok((select paid_at is null from public.bookings where booking_code = (select booking_code from code)), 'إلغاء تأكيد الدفع يمسح وقت الدفع');
update public.bookings set is_paid = true where booking_code = (select booking_code from code);
select t.ok((select trip_id from public.bookings where booking_code = (select booking_code from code)) is not null, 'إعادة تأكيد الدفع');

-- حجز جديد من المسؤول يبدأ غير مدفوع دائمًا
select public.admin_set_trip_status((select week2 from ids), 'open');
select * from public.create_booking((select week2 from ids), 'حجز مسؤول جديد', 1, '11111111-0000-0000-0000-000000000001');
select t.ok(not (select is_paid from public.bookings where full_name = 'حجز مسؤول جديد'), 'أي حجز جديد يبدأ غير مدفوع');

-- السعر ورقم إنستاباي يُحفظان مع الرحلة
create temp table pr as select public.admin_save_trip(null, jsonb_build_object(
    'trip_date', '2026-10-28', 'departure_time', '06:00', 'departure_point', 'مفارق الـ100 بالشروق',
    'seat_price', 300, 'instapay_number', '+20 106 555 3930',
    'booking_opens_at', now() - interval '1 hour', 'booking_closes_at', '2026-10-25 23:59+03'),
    array['11111111-0000-0000-0000-000000000001']::uuid[]) as id;
select t.ok((select seat_price = 300 and instapay_number = '01065553930' from public.trips where id = (select id from pr)), 'سعر المقعد ورقم إنستاباي محفوظان (مع توحيد الرقم)');
select t.expect_error($q$select public.admin_save_trip(null, jsonb_build_object(
    'trip_date', '2026-10-28', 'departure_time', '06:00', 'departure_point', 'x1', 'instapay_number', '0123',
    'booking_opens_at', now(), 'booking_closes_at', now() + interval '1 day'),
    array['11111111-0000-0000-0000-000000000001']::uuid[])$q$, 'instapay_number_check', 'رقم إنستاباي غير صالح مرفوض');

-- =====================================================================
-- 13ب) التنبيهات ومسار الرحلة والخريطة
-- =====================================================================
select t.as_user('aaaaaaaa-0000-0000-0000-000000000001');
create temp table rt as select public.admin_save_trip(null, jsonb_build_object(
    'trip_date', '2026-10-28', 'departure_time', '07:30', 'departure_point', 'الشروق',
    'announcements', E'الحجز للرجال فقط.\nمسؤول الباص: محمد عبد الله ربيع.',
    'route_stops', E'الشروق\nالطريق الإقليمي\nسيدي إبراهيم الدسوقي',
    'route_map_url', 'https://maps.app.goo.gl/Z9rYgAv3Hp94hX7t5',
    'route_embed_url', 'https://maps.google.com/maps?saddr=30.13,31.60&daddr=31.12,30.64&output=embed',
    'booking_opens_at', now() - interval '1 hour', 'booking_closes_at', '2026-10-25 23:59+03'),
    array['11111111-0000-0000-0000-000000000001']::uuid[]) as id;
grant select on rt to public;
select t.ok((select route_stops like 'الشروق%' and announcements like 'الحجز للرجال فقط.%'
               and route_map_url like 'https://maps.app.goo.gl/%' and route_embed_url like '%output=embed'
             from public.trips where id = (select id from rt)), 'التنبيهات والمسار والخريطة تُحفظ مع الرحلة');
select public.admin_save_trip((select id from rt), jsonb_build_object(
    'trip_date', '2026-10-28', 'departure_time', '07:30', 'departure_point', 'الشروق',
    'booking_opens_at', now() - interval '1 hour', 'booking_closes_at', '2026-10-25 23:59+03'),
    array['11111111-0000-0000-0000-000000000001']::uuid[]);
select t.ok((select route_stops is not null from public.trips where id = (select id from rt)), 'تعديل الرحلة بدون الحقول لا يمسح المسار');
select t.expect_error($q$select public.admin_save_trip((select id from rt), jsonb_build_object(
    'trip_date', '2026-10-28', 'departure_time', '07:30', 'departure_point', 'الشروق',
    'route_embed_url', 'https://evil.example.com/maps',
    'booking_opens_at', now() - interval '1 hour', 'booking_closes_at', '2026-10-25 23:59+03'),
    array['11111111-0000-0000-0000-000000000001']::uuid[])$q$, 'route_embed_url_check', 'رابط خريطة مضمّنة من غير جوجل مرفوض');
select t.expect_error($q$select public.admin_save_trip((select id from rt), jsonb_build_object(
    'trip_date', '2026-10-28', 'departure_time', '07:30', 'departure_point', 'الشروق',
    'route_map_url', 'javascript:alert(1)',
    'booking_opens_at', now() - interval '1 hour', 'booking_closes_at', '2026-10-25 23:59+03'),
    array['11111111-0000-0000-0000-000000000001']::uuid[])$q$, 'route_map_url_check', 'رابط خريطة غير آمن مرفوض');
select t.as_anon();
select t.ok((select route_stops is not null from public.trips where id = (select id from rt)), 'الزائر يرى المسار والتنبيهات');

-- =====================================================================
-- 14) الثبات النهائي: المقاعد المخزنة = مجموع الحجوزات المؤكدة لكل رحلة
-- =====================================================================
reset role;
select t.ok(not exists (
  select 1 from public.trips tr
   where tr.booked_seats <> (select coalesce(sum(seats),0) from public.bookings b where b.trip_id = tr.id and b.status = 'confirmed')
      or tr.booked_seats > tr.capacity), 'booked_seats متطابق مع مجموع الحجوزات ولا يتجاوز السعة');

\echo '===== ALL ACCEPTANCE TESTS PASSED ====='
