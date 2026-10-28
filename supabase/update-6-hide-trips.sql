-- =====================================================================
--  تحديث رقم 6 (28 أكتوبر 2026): إخفاء أي رحلة عن الحاجزين
--   * عمود is_hidden في جدول الرحلات (الافتراضي: ظاهرة)
--   * الزائر لا يرى الرحلات المخفية ولا يستطيع الحجز فيها (حماية في قاعدة البيانات)
--   * المسؤول يرى كل الرحلات ويُخفي/يُظهر من لوحة التحكم ← الرحلات
--  شغّل هذا الملف مرة واحدة في Supabase → SQL Editor (انسخ كل المحتوى ← Run)
--  آمن للتشغيل أكثر من مرة. لا يمس الحجوزات الموجودة.
-- =====================================================================

alter table public.trips add column if not exists is_hidden boolean not null default false;

-- الزائر يقرأ الرحلات الظاهرة فقط، والمسؤول يقرأ الكل
drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips
  for select to anon, authenticated using (not is_hidden or public.is_admin());

-- منع الحجز في رحلة مخفية (إلا من المسؤول)
create or replace function public.bookings_hidden_trip_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.trips t where t.id = new.trip_id and t.is_hidden)
     and not public.is_admin() then
    raise exception 'TRIP_NOT_FOUND';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_hidden_trip_guard on public.bookings;
create trigger bookings_hidden_trip_guard
  before insert on public.bookings
  for each row execute function public.bookings_hidden_trip_guard();

-- إخفاء/إظهار رحلة من لوحة التحكم
create or replace function public.admin_set_trip_hidden(p_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.trips set is_hidden = coalesce(p_hidden, false) where id = p_id;
  if not found then
    raise exception 'TRIP_NOT_FOUND';
  end if;
end;
$$;

revoke execute on function public.bookings_hidden_trip_guard() from public, anon, authenticated;
revoke execute on function public.admin_set_trip_hidden(uuid, boolean) from public, anon;
grant execute on function public.admin_set_trip_hidden(uuid, boolean) to authenticated;

-- للتأكد: الرحلات وحالة ظهورها
select trip_date, title, case when is_hidden then 'مخفية' else 'ظاهرة' end as visibility
  from public.trips order by trip_date desc;
