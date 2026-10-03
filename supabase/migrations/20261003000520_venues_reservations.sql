-- Fermata · M5: Lokale pflegen, Plätze anlegen, Reservierungen (PLAN 3.2 Nr. 14, Frage B10)
-- Reserviert wird unter „Fermata“ mit einem 4-stelligen Tisch-Code, für 2 Personen.
-- Das Lokal erfährt nie Nachnamen oder Kontaktdaten der Mitglieder.

-- ---------------------------------------------------------------------------
-- Reservierung je Abend
-- ---------------------------------------------------------------------------
create table app.evening_reservations (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null unique references app.evenings (id) on delete cascade,
  venue_id uuid not null references app.venues (id) on delete restrict,
  slot_id uuid references app.venue_slots (id) on delete set null,
  starts_at timestamptz not null,
  table_code text not null check (table_code ~ '^[A-Z0-9]{4}$'),
  status text not null default 'reserved' check (status in ('reserved', 'cancelled')),
  created_at timestamptz not null default now(),
  venue_notified_at timestamptz,         -- Reservierungs-Mail verschickt (an das Lokal oder an Benn zum Anrufen)
  venue_confirmed_at timestamptz,        -- Lokal hat über den Link bestätigt
  cancelled_at timestamptz,
  venue_cancel_notified_at timestamptz
);
comment on table app.evening_reservations is
  'Tisch je bestätigtem Abend: Name „Fermata“, Tisch-Code, 2 Personen. Mitglieder sehen sie nur über api-Funktionen.';
create index evening_reservations_venue_idx on app.evening_reservations (venue_id, starts_at);
alter table app.evening_reservations enable row level security;
create policy evening_reservations_admin on app.evening_reservations for select to authenticated using (app.is_admin());
grant select on app.evening_reservations to authenticated;

-- Admins lesen Lokale und Plätze auch direkt (Mitglieder nur über api-Funktionen).
grant select on app.venues, app.venue_slots to authenticated;
create policy venues_admin_read on app.venues for select to authenticated using (app.is_admin());
create policy venue_slots_admin_read on app.venue_slots for select to authenticated using (app.is_admin());

-- Tisch-Code: 4 Zeichen ohne leicht verwechselbare Zeichen (kein 0/O, 1/I/L, 2/Z, 5/S, 8/B, G/6).
create or replace function app.generate_table_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ACDEFHJKMNPRTUVWXY34679';
  b bytea := extensions.gen_random_bytes(4);
  r text := '';
begin
  for i in 0..3 loop
    r := r || substr(alphabet, (get_byte(b, i) % length(alphabet)) + 1, 1);
  end loop;
  return r;
end;
$$;

create or replace function app.m5_require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Nur für Admins mit Zwei-Faktor-Anmeldung' using errcode = '42501', hint = 'admin_required';
  end if;
  return auth.uid();
end;
$$;

-- Nachricht an das Lokal (E-Mail) oder, wenn das Lokal nicht per E-Mail reserviert, an Benn zum Anrufen.
create or replace function app.venue_notify(p_reservation app.evening_reservations, p_template text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v app.venues;
  n integer := 0;
  a record;
begin
  select * into v from app.venues where id = p_reservation.venue_id;
  if v.reservation_mode = 'email' and coalesce(v.contact_email, '') <> '' then
    if ops.enqueue_notification(null, p_template, 'email', jsonb_build_object('reservation_id', p_reservation.id),
         null, p_reservation.evening_id, format('%s:%s', p_template, p_reservation.id), false, false, v.id) is not null then
      n := 1;
    end if;
  else
    for a in select au.user_id from app.admin_users au loop
      if ops.enqueue_notification(a.user_id, p_template, 'email',
           jsonb_build_object('reservation_id', p_reservation.id, 'manual', true),
           null, p_reservation.evening_id, format('%s:%s:%s', p_template, p_reservation.id, a.user_id)) is not null then
        n := n + 1;
      end if;
    end loop;
  end if;
  return n;
end;
$$;

-- Tisch reservieren: Zeile des Platzes sperren, Kapazität prüfen (reserved < tables), hochzählen.
-- Zwei gleichzeitige Bestätigungen für den letzten Tisch: die zweite wartet auf die Sperre und
-- bekommt dann no_table_free (zusätzlich schützt die Prüfregel reserved <= tables).
create or replace function app.evening_reserve_slot(p_evening_id uuid)
returns app.evening_reservations
language plpgsql
security definer
set search_path = ''
as $$
declare
  e app.evenings;
  v app.venues;
  s app.venue_slots;
  r app.evening_reservations;
  v_code text;
  v_day date;
begin
  select * into e from app.evenings where id = p_evening_id;
  if e.venue_id is null then
    raise exception 'Für diesen Abend ist kein Lokal festgelegt' using errcode = '55000', hint = 'no_venue';
  end if;
  if e.starts_at is null then
    raise exception 'Keine Uhrzeit festgelegt' using errcode = '22023', hint = 'invalid_time';
  end if;
  select * into v from app.venues where id = e.venue_id;
  if not coalesce(v.active, false) then
    raise exception 'Das Lokal nimmt gerade keine Reservierungen an' using errcode = 'P0001', hint = 'venue_inactive';
  end if;
  select * into s from app.venue_slots where venue_id = e.venue_id and starts_at = e.starts_at for update;
  if not found or s.reserved >= s.tables then
    raise exception 'Zu dieser Uhrzeit ist im Lokal kein Tisch mehr frei' using errcode = 'P0001', hint = 'no_table_free';
  end if;
  update app.venue_slots set reserved = reserved + 1 where id = s.id;

  v_day := (e.starts_at at time zone 'Europe/Berlin')::date;
  for i in 1..50 loop
    v_code := app.generate_table_code();
    exit when not exists (
      select 1 from app.evening_reservations x
       where x.venue_id = e.venue_id and x.status = 'reserved' and x.table_code = v_code
         and (x.starts_at at time zone 'Europe/Berlin')::date = v_day);
  end loop;

  insert into app.evening_reservations (evening_id, venue_id, slot_id, starts_at, table_code, created_at)
  values (e.id, e.venue_id, s.id, e.starts_at, v_code, app.now())
  returning * into r;
  update app.evenings set slot_id = s.id where id = e.id;
  perform app.venue_notify(r, 'venue.reservation');
  return r;
end;
$$;
comment on function app.evening_reserve_slot(uuid) is 'Reserviert atomar einen Tisch (Zeilensperre auf venue_slots) und benachrichtigt das Lokal.';

-- Tisch freigeben (Absage): Zähler zurück, Reservierung storniert, Lokal informieren.
create or replace function app.evening_release_slot(p_evening_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r app.evening_reservations;
begin
  select * into r from app.evening_reservations where evening_id = p_evening_id and status = 'reserved' for update;
  if not found then
    return false;
  end if;
  if r.slot_id is not null then
    update app.venue_slots set reserved = greatest(reserved - 1, 0) where id = r.slot_id;
  end if;
  update app.evening_reservations set status = 'cancelled', cancelled_at = app.now() where id = r.id returning * into r;
  perform app.venue_notify(r, 'venue.cancellation');
  return true;
end;
$$;

-- Nach erfolgreichem Versand: Zeitstempel an der Reservierung (aufgerufen von ops.notify_complete).
create or replace function ops.notify_after_sent(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q ops.notification_queue;
  v_res uuid;
begin
  select * into q from ops.notification_queue where id = p_id;
  if q.sent_at is null or not (q.payload ? 'reservation_id') then
    return;
  end if;
  v_res := (q.payload ->> 'reservation_id')::uuid;
  if q.template = 'venue.reservation' then
    update app.evening_reservations set venue_notified_at = coalesce(venue_notified_at, app.now()) where id = v_res;
    update app.evenings set reservation_sent_at = coalesce(reservation_sent_at, app.now())
     where id = q.evening_id and reservation_sent_at is null;
  elsif q.template = 'venue.cancellation' then
    update app.evening_reservations set venue_cancel_notified_at = coalesce(venue_cancel_notified_at, app.now()) where id = v_res;
  end if;
end;
$$;

-- Bestätigungslink für das Lokal (Edge Function venue-confirm, signiertes Token).
create or replace function ops.venue_reservation_summary(p_reservation_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reservation_id', r.id,
    'venue_name', v.name,
    'starts_at', r.starts_at,
    'table_code', r.table_code,
    'reservation_name', ops.setting_text('evening.reservation_name'),
    'persons', 2,
    'status', r.status,
    'venue_confirmed_at', r.venue_confirmed_at)
  from app.evening_reservations r join app.venues v on v.id = r.venue_id
  where r.id = p_reservation_id;
$$;

create or replace function ops.venue_confirm_reservation(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r app.evening_reservations;
begin
  select * into r from app.evening_reservations where id = p_reservation_id for update;
  if not found then
    return null;
  end if;
  if r.status = 'reserved' and r.venue_confirmed_at is null then
    update app.evening_reservations set venue_confirmed_at = app.now() where id = r.id;
    insert into ops.audit_log (actor, action, target_table, target_id, details)
    values (null, 'venue.reservation_confirmed', 'app.evening_reservations', r.id::text, jsonb_build_object('venue_id', r.venue_id));
  end if;
  return ops.venue_reservation_summary(r.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: Lokale anlegen, ändern, deaktivieren (alles im Audit-Protokoll)
-- ---------------------------------------------------------------------------
create or replace function app.venue_apply(p_venue app.venues, p_data jsonb)
returns app.venues
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v app.venues := p_venue;
  k text;
  pc app.postal_codes;
begin
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'Angaben fehlen' using errcode = '22023', hint = 'invalid_input';
  end if;
  for k in select jsonb_object_keys(p_data) loop
    if k not in ('name', 'street', 'postal_code', 'city', 'lat', 'lon', 'contact_name', 'contact_email', 'contact_phone',
                 'reservation_mode', 'description', 'accessibility', 'public_transport', 'agreement') then
      raise exception 'Unbekanntes Feld: %', k using errcode = '22023', hint = 'unknown_field';
    end if;
  end loop;
  if p_data ? 'name' then v.name := nullif(trim(p_data ->> 'name'), ''); end if;
  if p_data ? 'street' then v.street := nullif(trim(p_data ->> 'street'), ''); end if;
  if p_data ? 'postal_code' then v.postal_code := nullif(trim(p_data ->> 'postal_code'), ''); end if;
  if p_data ? 'city' then v.city := nullif(trim(p_data ->> 'city'), ''); end if;
  if p_data ? 'lat' then v.lat := (p_data ->> 'lat')::double precision; end if;
  if p_data ? 'lon' then v.lon := (p_data ->> 'lon')::double precision; end if;
  if p_data ? 'contact_name' then v.contact_name := nullif(trim(p_data ->> 'contact_name'), ''); end if;
  if p_data ? 'contact_email' then v.contact_email := nullif(lower(trim(p_data ->> 'contact_email')), ''); end if;
  if p_data ? 'contact_phone' then v.contact_phone := nullif(trim(p_data ->> 'contact_phone'), ''); end if;
  if p_data ? 'reservation_mode' then v.reservation_mode := p_data ->> 'reservation_mode'; end if;
  if p_data ? 'description' then v.description := nullif(trim(p_data ->> 'description'), ''); end if;
  if p_data ? 'accessibility' then v.accessibility := nullif(trim(p_data ->> 'accessibility'), ''); end if;
  if p_data ? 'public_transport' then v.public_transport := nullif(trim(p_data ->> 'public_transport'), ''); end if;
  if p_data ? 'agreement' then v.agreement := coalesce(p_data -> 'agreement', '{}'::jsonb); end if;

  -- Ohne Koordinaten: PLZ-Mittelpunkt (falls die PLZ-Tabelle gefüllt ist).
  if (v.lat is null or v.lon is null) and v.postal_code is not null then
    select * into pc from app.postal_codes where postal_code = v.postal_code;
    if found then
      v.lat := coalesce(v.lat, pc.lat);
      v.lon := coalesce(v.lon, pc.lon);
    end if;
  end if;

  if v.name is null or char_length(v.name) > 120 then
    raise exception 'Name fehlt oder ist zu lang' using errcode = '22023', hint = 'invalid_name';
  end if;
  if v.street is null or char_length(v.street) > 120 then
    raise exception 'Straße fehlt oder ist zu lang' using errcode = '22023', hint = 'invalid_street';
  end if;
  if v.postal_code is null or v.postal_code !~ '^[0-9]{5}$' then
    raise exception 'Ungültige Postleitzahl' using errcode = '22023', hint = 'invalid_postal_code';
  end if;
  if v.city is null or char_length(v.city) > 80 then
    raise exception 'Ort fehlt oder ist zu lang' using errcode = '22023', hint = 'invalid_city';
  end if;
  if v.lat is null or v.lon is null or v.lat not between 47 and 56 or v.lon not between 5 and 16 then
    raise exception 'Koordinaten fehlen oder liegen nicht in Deutschland' using errcode = '22023', hint = 'invalid_coordinates';
  end if;
  if v.contact_email is not null and v.contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Ungültige E-Mail-Adresse' using errcode = '22023', hint = 'invalid_email';
  end if;
  if v.reservation_mode is null or v.reservation_mode not in ('email', 'telefon', 'manuell') then
    raise exception 'Ungültige Reservierungsart' using errcode = '22023', hint = 'invalid_reservation_mode';
  end if;
  if v.reservation_mode = 'email' and v.contact_email is null then
    raise exception 'Für Reservierungen per E-Mail fehlt die Adresse' using errcode = '22023', hint = 'email_required';
  end if;
  if jsonb_typeof(v.agreement) <> 'object' then
    raise exception 'Vereinbarung muss ein Objekt sein' using errcode = '22023', hint = 'invalid_agreement';
  end if;
  if char_length(coalesce(v.description, '')) > 2000 or char_length(coalesce(v.accessibility, '')) > 1000
     or char_length(coalesce(v.public_transport, '')) > 1000 or char_length(coalesce(v.contact_name, '')) > 120
     or char_length(coalesce(v.contact_phone, '')) > 40 then
    raise exception 'Text zu lang' using errcode = '22023', hint = 'text_too_long';
  end if;
  return v;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Ungültige Zahl' using errcode = '22023', hint = 'invalid_input';
end;
$$;

create or replace function api.admin_create_venue(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v app.venues;
begin
  perform app.m5_require_admin();
  v.agreement := '{}'::jsonb;
  v.reservation_mode := 'email';
  v := app.venue_apply(v, p_data);
  insert into app.venues (name, street, postal_code, city, lat, lon, contact_name, contact_email, contact_phone,
                          reservation_mode, description, accessibility, public_transport, agreement, active)
  values (v.name, v.street, v.postal_code, v.city, v.lat, v.lon, v.contact_name, v.contact_email, v.contact_phone,
          v.reservation_mode, v.description, v.accessibility, v.public_transport, v.agreement, true)
  returning * into v;
  perform ops.audit('venue.create', 'app.venues', v.id::text, jsonb_build_object('name', v.name, 'city', v.city));
  return to_jsonb(v);
end;
$$;
comment on function api.admin_create_venue(jsonb) is 'Admin: Lokal anlegen. Felder siehe docs/bereiche/abende.md.';
grant execute on function api.admin_create_venue(jsonb) to authenticated;

create or replace function api.admin_update_venue(p_venue_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v app.venues;
begin
  perform app.m5_require_admin();
  select * into v from app.venues where id = p_venue_id for update;
  if not found then
    raise exception 'Lokal nicht gefunden' using errcode = 'P0002', hint = 'venue_not_found';
  end if;
  v := app.venue_apply(v, p_data);
  update app.venues set
    name = v.name, street = v.street, postal_code = v.postal_code, city = v.city, lat = v.lat, lon = v.lon,
    contact_name = v.contact_name, contact_email = v.contact_email, contact_phone = v.contact_phone,
    reservation_mode = v.reservation_mode, description = v.description, accessibility = v.accessibility,
    public_transport = v.public_transport, agreement = v.agreement
  where id = p_venue_id
  returning * into v;
  perform ops.audit('venue.update', 'app.venues', v.id::text,
    jsonb_build_object('fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k)));
  return to_jsonb(v);
end;
$$;
grant execute on function api.admin_update_venue(uuid, jsonb) to authenticated;

create or replace function api.admin_set_venue_active(p_venue_id uuid, p_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v app.venues;
  v_upcoming integer;
begin
  perform app.m5_require_admin();
  update app.venues set active = coalesce(p_active, false) where id = p_venue_id returning * into v;
  if not found then
    raise exception 'Lokal nicht gefunden' using errcode = 'P0002', hint = 'venue_not_found';
  end if;
  select count(*) into v_upcoming from app.evening_reservations r
   where r.venue_id = p_venue_id and r.status = 'reserved' and r.starts_at > app.now();
  perform ops.audit(case when v.active then 'venue.activate' else 'venue.deactivate' end, 'app.venues', v.id::text,
    jsonb_build_object('upcoming_reservations', v_upcoming));
  -- Bestehende Reservierungen bleiben bestehen; Benn sieht die Zahl und entscheidet (Absage über cancel_admin).
  return jsonb_build_object('id', v.id, 'active', v.active, 'upcoming_reservations', v_upcoming);
end;
$$;
comment on function api.admin_set_venue_active(uuid, boolean) is
  'Admin: Lokal (de)aktivieren. Inaktive Lokale nehmen keine neuen Reservierungen an; bestehende bleiben.';
grant execute on function api.admin_set_venue_active(uuid, boolean) to authenticated;

create or replace function api.admin_venues(p_include_inactive boolean default true)
returns table (id uuid, name text, street text, postal_code text, city text, active boolean, reservation_mode text,
               contact_name text, contact_email text, contact_phone text, upcoming_slots integer,
               upcoming_free_tables integer, upcoming_reservations integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.m5_require_admin();
  return query
  select v.id, v.name, v.street, v.postal_code, v.city, v.active, v.reservation_mode,
         v.contact_name, v.contact_email, v.contact_phone,
         (select count(*)::integer from app.venue_slots s where s.venue_id = v.id and s.starts_at > app.now()),
         (select coalesce(sum(s.tables - s.reserved), 0)::integer from app.venue_slots s
           where s.venue_id = v.id and s.starts_at > app.now()),
         (select count(*)::integer from app.evening_reservations r
           where r.venue_id = v.id and r.status = 'reserved' and r.starts_at > app.now())
  from app.venues v
  where coalesce(p_include_inactive, true) or v.active
  order by v.active desc, v.city, v.name;
end;
$$;
grant execute on function api.admin_venues(boolean) to authenticated;

-- Plätze in einem Rutsch: z. B. Do–Sa (4, 5, 6) um 19:00, 19:30, 20:00 für N Wochen mit je X Tischen.
-- Uhrzeiten gelten in Europe/Berlin (auch über die Zeitumstellung hinweg).
create or replace function api.admin_create_slots(p_venue_id uuid, p_first_day date, p_weeks integer, p_weekdays integer[],
  p_times text[], p_tables integer, p_update_existing boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v app.venues;
  d date;
  t text;
  v_at timestamptz;
  v_created integer := 0;
  v_updated integer := 0;
  v_skipped integer := 0;
  s app.venue_slots;
begin
  perform app.m5_require_admin();
  select * into v from app.venues where id = p_venue_id;
  if not found then
    raise exception 'Lokal nicht gefunden' using errcode = 'P0002', hint = 'venue_not_found';
  end if;
  if p_first_day is null or p_weeks is null or p_weeks < 1 or p_weeks > ops.setting_int('venue.max_slot_weeks') then
    raise exception 'Ungültiger Zeitraum' using errcode = '22023', hint = 'invalid_range';
  end if;
  if p_weekdays is null or cardinality(p_weekdays) = 0 or exists (select 1 from unnest(p_weekdays) w where w not between 1 and 7) then
    raise exception 'Wochentage als 1 (Montag) bis 7 (Sonntag)' using errcode = '22023', hint = 'invalid_weekdays';
  end if;
  if p_times is null or cardinality(p_times) = 0 or cardinality(p_times) > 12
     or exists (select 1 from unnest(p_times) x where x !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
    raise exception 'Uhrzeiten im Format HH:MM' using errcode = '22023', hint = 'invalid_times';
  end if;
  if p_tables is null or p_tables < 0 or p_tables > 50 then
    raise exception 'Tische zwischen 0 und 50' using errcode = '22023', hint = 'invalid_tables';
  end if;

  for d in select g::date from generate_series(p_first_day, p_first_day + (p_weeks * 7 - 1), interval '1 day') g loop
    continue when not (extract(isodow from d)::integer = any (p_weekdays));
    foreach t in array p_times loop
      v_at := app.berlin_at(d, t::time);
      continue when v_at <= app.now();
      select * into s from app.venue_slots where venue_id = p_venue_id and starts_at = v_at for update;
      if not found then
        insert into app.venue_slots (venue_id, starts_at, tables) values (p_venue_id, v_at, p_tables);
        v_created := v_created + 1;
      elsif coalesce(p_update_existing, false) then
        update app.venue_slots set tables = greatest(p_tables, s.reserved) where id = s.id;
        v_updated := v_updated + 1;
      else
        v_skipped := v_skipped + 1;
      end if;
    end loop;
  end loop;
  perform ops.audit('venue.slots_create', 'app.venues', p_venue_id::text, jsonb_build_object(
    'first_day', p_first_day, 'weeks', p_weeks, 'weekdays', to_jsonb(p_weekdays), 'times', to_jsonb(p_times),
    'tables', p_tables, 'created', v_created, 'updated', v_updated, 'skipped', v_skipped));
  return jsonb_build_object('created', v_created, 'updated', v_updated, 'skipped', v_skipped);
end;
$$;
comment on function api.admin_create_slots(uuid, date, integer, integer[], text[], integer, boolean) is
  'Admin: Plätze anlegen. Wochentage 1=Mo … 7=So, Uhrzeiten HH:MM (Europe/Berlin). Vergangene Zeiten werden übersprungen.';
grant execute on function api.admin_create_slots(uuid, date, integer, integer[], text[], integer, boolean) to authenticated;

create or replace function api.admin_update_slot(p_slot_id uuid, p_tables integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.venue_slots;
begin
  perform app.m5_require_admin();
  select * into s from app.venue_slots where id = p_slot_id for update;
  if not found then
    raise exception 'Platz nicht gefunden' using errcode = 'P0002', hint = 'slot_not_found';
  end if;
  if p_tables is null or p_tables < s.reserved or p_tables > 50 then
    raise exception 'Weniger Tische als schon reserviert' using errcode = '22023', hint = 'below_reserved';
  end if;
  update app.venue_slots set tables = p_tables where id = s.id returning * into s;
  perform ops.audit('venue.slot_update', 'app.venue_slots', s.id::text, jsonb_build_object('tables', p_tables));
  return to_jsonb(s);
end;
$$;
grant execute on function api.admin_update_slot(uuid, integer) to authenticated;

create or replace function api.admin_delete_slot(p_slot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.venue_slots;
begin
  perform app.m5_require_admin();
  select * into s from app.venue_slots where id = p_slot_id for update;
  if not found then
    return false;
  end if;
  if s.reserved > 0 then
    raise exception 'Platz hat Reservierungen' using errcode = '55000', hint = 'slot_reserved';
  end if;
  delete from app.venue_slots where id = s.id;
  perform ops.audit('venue.slot_delete', 'app.venue_slots', s.id::text, jsonb_build_object('starts_at', s.starts_at));
  return true;
end;
$$;
grant execute on function api.admin_delete_slot(uuid) to authenticated;

create or replace function api.admin_venue_slots(p_venue_id uuid, p_from timestamptz default null, p_to timestamptz default null)
returns table (slot_id uuid, starts_at timestamptz, tables integer, reserved integer, free integer, reservations jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.m5_require_admin();
  return query
  select s.id, s.starts_at, s.tables, s.reserved, s.tables - s.reserved,
         coalesce((select jsonb_agg(jsonb_build_object(
                    'reservation_id', r.id, 'evening_id', r.evening_id, 'table_code', r.table_code, 'status', r.status,
                    'venue_notified_at', r.venue_notified_at, 'venue_confirmed_at', r.venue_confirmed_at,
                    'cancelled_at', r.cancelled_at) order by r.created_at)
                   from app.evening_reservations r where r.slot_id = s.id), '[]'::jsonb)
  from app.venue_slots s
  where s.venue_id = p_venue_id
    and s.starts_at >= coalesce(p_from, app.now() - interval '1 day')
    and s.starts_at < coalesce(p_to, app.now() + interval '120 days')
  order by s.starts_at;
end;
$$;
comment on function api.admin_venue_slots(uuid, timestamptz, timestamptz) is 'Admin: Plätze eines Lokals mit Reservierungen (ohne Namen der Mitglieder).';
grant execute on function api.admin_venue_slots(uuid, timestamptz, timestamptz) to authenticated;
