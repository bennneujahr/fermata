-- Gemeinsame Testdaten für die M5-Tests (5xx_*.test.sql). Wird mit \ir eingebunden und läuft in der
-- Transaktion der jeweiligen Testdatei (am Ende rollback). Keine eigene Testdatei.
--
-- Personen: Anna (Sie, Stufe andante), Ben (du, auftakt), Cem, Emil, Fritz; Dora ist Admin.
-- Zeiten: tests.m5_at(Tag, 'HH:MM') = Uhrzeit Europe/Berlin an „heute + Tag“ (bezogen auf now(), nicht auf die Testuhr).

create or replace function tests.m5_id(p_name text)
returns uuid
language sql
immutable
as $$
  select case p_name
    when 'anna' then '00000000-0000-0000-0000-000000000a01'
    when 'ben' then '00000000-0000-0000-0000-000000000b01'
    when 'cem' then '00000000-0000-0000-0000-000000000c01'
    when 'dora' then '00000000-0000-0000-0000-000000000d01'
    when 'emil' then '00000000-0000-0000-0000-000000000e01'
    when 'fritz' then '00000000-0000-0000-0000-000000000f01'
    when 'venue' then '50000000-0000-0000-0000-000000000001'
    when 'venue2' then '50000000-0000-0000-0000-000000000002'
    when 'period' then '51000000-0000-0000-0000-000000000001'
    when 'run' then '52000000-0000-0000-0000-000000000001'
  end::uuid;
$$;

create or replace function tests.m5_at(p_day integer, p_time text)
returns timestamptz
language sql
stable
as $$
  select app.berlin_at((now() at time zone 'Europe/Berlin')::date + p_day, p_time::time);
$$;

-- Testuhr auf einen festen Zeitpunkt stellen (app.now() = p_at).
create or replace function tests.m5_clock_to(p_at timestamptz)
returns timestamptz
language plpgsql
as $$
begin
  update ops.sim_clock set offset_interval = p_at - now() where id;
  return app.now();
end;
$$;

-- Fehlerkennung (hint) eines Aufrufs; null, wenn kein Fehler.
create or replace function tests.hint_of(p_sql text)
returns text
language plpgsql
as $$
declare
  h text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return coalesce(nullif(h, ''), '(ohne hint) ' || sqlerrm);
end;
$$;

create or replace function tests.m5_setup()
returns void
language plpgsql
as $$
declare
  n text;
  d integer;
  t text;
begin
  foreach n in array array['anna', 'ben', 'cem', 'dora', 'emil', 'fritz'] loop
    perform tests.create_user(n || '@example.test', tests.m5_id(n));
  end loop;
  insert into app.accounts (user_id, status, address_form, tier_view) values
    (tests.m5_id('anna'), 'active', 'sie', 'andante'),
    (tests.m5_id('ben'), 'active', 'du', 'auftakt'),
    (tests.m5_id('cem'), 'active', 'sie', 'auftakt'),
    (tests.m5_id('emil'), 'active', 'sie', 'loge'),
    (tests.m5_id('fritz'), 'active', 'sie', 'auftakt');
  insert into app.profile_core (user_id, display_name, ready_for_matching) values
    (tests.m5_id('anna'), 'Anna', true), (tests.m5_id('ben'), 'Ben', true), (tests.m5_id('cem'), 'Cem', true),
    (tests.m5_id('emil'), 'Emil', true), (tests.m5_id('fritz'), 'Fritz', true);
  insert into private.account_facts (user_id, first_name, last_name, birth_date, postal_code, phone) values
    (tests.m5_id('anna'), 'Anna', 'Abendroth', '1990-01-01', '19053', '+49 170 1111111'),
    (tests.m5_id('ben'), 'Ben', 'Brückner', '1988-02-02', '19055', null),
    (tests.m5_id('cem'), 'Cem', 'Celik', '1985-03-03', '19057', null),
    (tests.m5_id('emil'), 'Emil', 'Eckert', '1987-04-04', '19059', null),
    (tests.m5_id('fritz'), 'Fritz', 'Faber', '1986-05-05', '19061', null);
  insert into app.admin_users (user_id, display_name) values (tests.m5_id('dora'), 'Dora');

  insert into app.venues (id, name, street, postal_code, city, lat, lon, contact_name, contact_email, reservation_mode,
                          public_transport, accessibility, agreement)
  values (tests.m5_id('venue'), 'Café am See', 'Seestraße 1', '19053', 'Schwerin', 53.62, 11.41, 'Frau Wirt',
          'tisch@cafe.example', 'email', 'Bus 10, Haltestelle Markt', 'Stufenloser Eingang',
          '{"reservation_note": "Bitte ein ruhiger Tisch"}');
  for d in 3..6 loop
    foreach t in array array['19:00', '19:30', '20:00'] loop
      insert into app.venue_slots (venue_id, starts_at, tables) values (tests.m5_id('venue'), tests.m5_at(d, t), 2);
    end loop;
  end loop;
  -- Platz ohne gemeinsames Fenster (Tag 9) für „nicht wählbar“
  insert into app.venue_slots (venue_id, starts_at, tables) values (tests.m5_id('venue'), tests.m5_at(9, '19:00'), 2);

  insert into app.availability_periods (id, starts_on, ends_on, ask_at, answer_until)
  values (tests.m5_id('period'), (now() at time zone 'Europe/Berlin')::date, (now() at time zone 'Europe/Berlin')::date + 13,
          now(), now() + interval '3 days');
  foreach n in array array['anna', 'ben', 'cem', 'emil', 'fritz'] loop
    for d in 3..6 loop
      insert into app.availability_windows (user_id, period_id, starts_at, ends_at)
      values (tests.m5_id(n), tests.m5_id('period'), tests.m5_at(d, '18:00'), tests.m5_at(d, '23:00'));
    end loop;
  end loop;
  insert into app.match_runs (id, period_id, scheduled_for, status)
  values (tests.m5_id('run'), tests.m5_id('period'), now(), 'approved');
end;
$$;

-- Neuer Vorschlag wie vom Auswahl-Job: Paar + Abend im Zustand proposed.
create or replace function tests.m5_new_evening(p_x uuid, p_y uuid, p_times timestamptz[], p_venue uuid default null)
returns uuid
language plpgsql
as $$
declare
  v_pairing uuid;
  v_evening uuid;
begin
  insert into app.pairings (run_id, user_a, user_b, total_score, venue_id, reasons_text, status)
  values (tests.m5_id('run'), least(p_x, p_y), greatest(p_x, p_y), 0.8123, coalesce(p_venue, tests.m5_id('venue')),
          'Sie gehen beide gern am Wasser spazieren.', 'proposed')
  returning id into v_pairing;
  insert into app.evenings (pairing_id, user_a, user_b, venue_id, proposed_times)
  values (v_pairing, least(p_x, p_y), greatest(p_x, p_y), coalesce(p_venue, tests.m5_id('venue')), app.times_to_jsonb(p_times))
  returning id into v_evening;
  return v_evening;
end;
$$;

-- Abend schnell bestätigen: p_x wünscht p_time, p_y bestätigt. Danach wieder Rolle postgres.
create or replace function tests.m5_confirmed_evening(p_x uuid, p_y uuid, p_time timestamptz)
returns uuid
language plpgsql
as $$
declare
  v_evening uuid := tests.m5_new_evening(p_x, p_y, array[p_time]);
begin
  perform tests.act_as(p_x);
  perform api.evening_request_time(v_evening, array[p_time]);
  perform tests.reset_role();
  perform tests.act_as(p_y);
  perform api.evening_confirm(v_evening, p_time);
  perform tests.reset_role();
  return v_evening;
end;
$$;

-- Nachrichten zählen
create or replace function tests.m5_count(p_template text, p_user uuid default null, p_evening uuid default null)
returns integer
language sql
stable
as $$
  select count(*)::integer from ops.notification_queue q
   where q.template = p_template
     and (p_user is null or q.user_id = p_user)
     and (p_evening is null or q.evening_id = p_evening);
$$;

grant execute on all functions in schema tests to anon, authenticated, service_role;
