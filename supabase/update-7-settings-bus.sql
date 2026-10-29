-- Update 7: editable app name + bus photo and bus number per trip.
-- Safe to run more than once. Does not touch bookings.

create table if not exists public.app_settings (
  id         int primary key default 1 check (id = 1),
  app_name   text not null default 'باص الشروق والعبور'
             check (char_length(btrim(app_name)) between 2 and 80),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to anon, authenticated using (true);
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;

create or replace function public.admin_set_app_name(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v) < 2 or char_length(v) > 80 then
    raise exception 'INVALID_APP_NAME';
  end if;
  update public.app_settings set app_name = v, updated_at = now() where id = 1;
  return v;
end;
$$;

alter table public.trips add column if not exists bus_number text
  check (bus_number is null or char_length(bus_number) <= 40);
alter table public.trips add column if not exists bus_photo_at timestamptz;

create table if not exists public.trip_bus_photos (
  trip_id    uuid primary key references public.trips (id) on delete cascade,
  image      text not null
             check (char_length(image) <= 450000
                    and image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'),
  updated_at timestamptz not null default now()
);

alter table public.trip_bus_photos enable row level security;
drop policy if exists trip_bus_photos_read on public.trip_bus_photos;
create policy trip_bus_photos_read on public.trip_bus_photos
  for select to anon, authenticated
  using (public.is_admin()
         or exists (select 1 from public.trips t where t.id = trip_id and not t.is_hidden));
revoke all on public.trip_bus_photos from anon, authenticated;
grant select on public.trip_bus_photos to anon, authenticated;

create or replace function public.admin_set_trip_bus(
  p_id uuid, p_bus_number text, p_photo text default null, p_remove_photo boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_num text := nullif(btrim(coalesce(p_bus_number, '')), '');
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (select 1 from public.trips where id = p_id) then
    raise exception 'TRIP_NOT_FOUND';
  end if;
  if v_num is not null and char_length(v_num) > 40 then
    raise exception 'INVALID_BUS_NUMBER';
  end if;
  if p_photo is not null then
    if char_length(p_photo) > 450000 then
      raise exception 'PHOTO_TOO_LARGE';
    end if;
    if p_photo !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then
      raise exception 'INVALID_PHOTO';
    end if;
    insert into public.trip_bus_photos (trip_id, image, updated_at) values (p_id, p_photo, now())
    on conflict (trip_id) do update set image = excluded.image, updated_at = excluded.updated_at;
    update public.trips set bus_number = v_num, bus_photo_at = now() where id = p_id;
  elsif p_remove_photo then
    delete from public.trip_bus_photos where trip_id = p_id;
    update public.trips set bus_number = v_num, bus_photo_at = null where id = p_id;
  else
    update public.trips set bus_number = v_num where id = p_id;
  end if;
end;
$$;

revoke execute on function public.admin_set_app_name(text) from public, anon;
grant execute on function public.admin_set_app_name(text) to authenticated;
revoke execute on function public.admin_set_trip_bus(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_set_trip_bus(uuid, text, text, boolean) to authenticated;

select (select app_name from public.app_settings) as app_name,
       (select count(*) from public.trips) as trips;
