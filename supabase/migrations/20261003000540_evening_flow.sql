-- Fermata · M5: Terminabstimmung mit festen 24-Stunden-Fristen (PLAN 2.3 Nr. 6, 3.2 Nr. 13)
--
--   proposed ──request_time──► time_requested ──counter──► time_countered ──counter──► time_requested …
--      │                          │ confirm                    │ confirm
--      │ decline / lapse          ▼                            ▼
--      ▼                       confirmed ──cancel_early | cancel_late──► cancelled_*
--   declined | lapsed             │ happened | no_show (Rückmeldung, Migration 0550)
--
-- Der Auswahl-Job (M4) legt den Abend im Zustand proposed an (venue_id, proposed_times).
-- Der AFTER-INSERT-Trigger unten startet die erste Frist und benachrichtigt beide.
-- app.evening_after_transition() (hier ersetzt) beendet alte Fristen, plant neue und verschickt Nachrichten.
-- Andere Bereiche (Kontingent M6, Sicherheit M7) hängen eigene Trigger an Zustandswechsel.

-- Erkennungszeichen je Person und Abend (Finde-Fenster). Foto: Frage B7, noch nicht gebaut.
create table app.evening_hints (
  evening_id uuid not null references app.evenings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  hint text not null check (char_length(hint) between 1 and 200),
  updated_at timestamptz not null default now(),
  primary key (evening_id, user_id)
);
comment on table app.evening_hints is 'Freiwilliges Erkennungszeichen (z. B. „dunkelblauer Schal“). Das Gegenüber sieht es nur im Finde-Fenster.';
alter table app.evening_hints enable row level security;

-- Fristen-Job: Fehlversuche je Frist (Migration 0550)
alter table app.evening_deadlines
  add column if not exists attempts integer not null default 0,
  add column if not exists last_error text;
create index if not exists evening_deadlines_evening_idx on app.evening_deadlines (evening_id) where done_at is null and cancelled_at is null;

-- ---------------------------------------------------------------------------
-- Hilfen
-- ---------------------------------------------------------------------------
create or replace function app.evening_duration()
returns interval
language sql
stable
security definer
set search_path = ''
as $$
  select make_interval(mins => ops.setting_int('evening.default_duration_minutes'));
$$;

create or replace function app.evening_other(p_evening app.evenings, p_user uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_user = p_evening.user_a then p_evening.user_b
              when p_user = p_evening.user_b then p_evening.user_a end;
$$;

-- Vorname für Anzeige und Anrede: Anzeigename aus dem Profil, sonst Vorname aus den Konto-Fakten. Nie der Nachname.
create or replace function app.member_first_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select nullif(trim(pc.display_name), '') from app.profile_core pc where pc.user_id = p_user),
    (select nullif(trim(f.first_name), '') from private.account_facts f where f.user_id = p_user));
$$;

create or replace function app.evening_period_id(p_evening app.evenings)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select mr.period_id from app.pairings p join app.match_runs mr on mr.id = p.run_id where p.id = p_evening.pairing_id;
$$;

-- Öffentliche Angaben zum Lokal (für Mitglieder)
create or replace function app.venue_public(p_venue_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', v.name, 'street', v.street, 'postal_code', v.postal_code, 'city', v.city,
                            'public_transport', v.public_transport, 'accessibility', v.accessibility,
                            'description', v.description)
  from app.venues v where v.id = p_venue_id;
$$;

-- Abend laden und prüfen, ob die angemeldete Person beteiligt ist (optional mit Zeilensperre).
create or replace function app.evening_for_member(p_evening_id uuid, p_lock boolean default false)
returns app.evenings
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  if p_lock then
    select * into e from app.evenings where id = p_evening_id for update;
  else
    select * into e from app.evenings where id = p_evening_id;
  end if;
  if not found or uid not in (e.user_a, e.user_b) then
    raise exception 'Nur die beiden Beteiligten haben Zugriff' using errcode = '42501', hint = 'not_participant';
  end if;
  return e;
end;
$$;

-- Mögliche Beginnzeiten: Platz mit freiem Tisch im Lokal, genug Vorlauf, und entweder vorgeschlagen
-- oder innerhalb eines gemeinsamen freien Fensters (inklusive geplanter Dauer).
create or replace function app.evening_time_options(p_evening app.evenings)
returns table (starts_at timestamptz, source text)
language sql
stable
security definer
set search_path = ''
as $$
  with proposed as (select unnest(app.jsonb_to_times(p_evening.proposed_times)) as t),
  shared as (
    select w.starts_at, w.ends_at
    from app.shared_windows(p_evening.user_a, p_evening.user_b, app.evening_period_id(p_evening),
                            ops.setting_int('evening.default_duration_minutes')) w
  )
  select s.starts_at,
         case when exists (select 1 from proposed p where p.t = s.starts_at) then 'proposed' else 'shared_window' end
  from app.venue_slots s
  join app.venues v on v.id = s.venue_id and v.active
  where s.venue_id = p_evening.venue_id
    and s.reserved < s.tables
    and s.starts_at >= app.now() + make_interval(hours => ops.setting_int('evening.min_lead_hours'))
    and (exists (select 1 from proposed p where p.t = s.starts_at)
         or exists (select 1 from shared w where w.starts_at <= s.starts_at and s.starts_at + app.evening_duration() <= w.ends_at))
  order by s.starts_at;
$$;
comment on function app.evening_time_options(app.evenings) is
  'Wählbare Beginnzeiten: freier Tisch, mindestens evening.min_lead_hours voraus, vorgeschlagen oder im gemeinsamen Fenster.';

-- Uhrzeiten für Wunsch oder Alternative prüfen: 1 bis evening.max_times_per_answer, keine doppelt, alle wählbar.
create or replace function app.evening_check_times(p_evening app.evenings, p_times timestamptz[])
returns timestamptz[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v timestamptz[];
  t timestamptz;
  v_opts timestamptz[];
begin
  if p_times is null or cardinality(p_times) = 0 or exists (select 1 from unnest(p_times) x where x is null) then
    raise exception 'Bitte 1 bis % Uhrzeiten wählen', ops.setting_int('evening.max_times_per_answer')
      using errcode = '22023', hint = 'invalid_times';
  end if;
  select array_agg(distinct x order by x) into v from unnest(p_times) x;
  if cardinality(v) <> cardinality(p_times) or cardinality(v) > ops.setting_int('evening.max_times_per_answer') then
    raise exception 'Bitte 1 bis % verschiedene Uhrzeiten wählen', ops.setting_int('evening.max_times_per_answer')
      using errcode = '22023', hint = 'invalid_times';
  end if;
  if p_evening.venue_id is null then
    raise exception 'Für diesen Abend ist kein Lokal festgelegt' using errcode = '55000', hint = 'no_venue';
  end if;
  v_opts := array(select o.starts_at from app.evening_time_options(p_evening) o);
  foreach t in array v loop
    if t < app.now() + make_interval(hours => ops.setting_int('evening.min_lead_hours')) then
      raise exception 'Diese Uhrzeit liegt zu kurzfristig' using errcode = '22023', hint = 'time_too_soon';
    end if;
    if not (t = any (v_opts)) then
      if exists (select 1 from app.venue_slots s where s.venue_id = p_evening.venue_id and s.starts_at = t and s.reserved >= s.tables) then
        raise exception 'Zu dieser Uhrzeit ist im Lokal kein Tisch mehr frei' using errcode = 'P0001', hint = 'no_table_free';
      end if;
      raise exception 'Diese Uhrzeit ist nicht wählbar' using errcode = '22023', hint = 'time_not_allowed';
    end if;
  end loop;
  return v;
end;
$$;

-- Nachricht zu einem Abend an eine beteiligte Person (nie an das Gegenüber über Dritte).
create or replace function app.evening_notify(p_evening app.evenings, p_user uuid, p_template text, p_extra jsonb default '{}'::jsonb,
  p_has_deadline boolean default false, p_is_safety boolean default false, p_not_before timestamptz default null,
  p_dedupe_suffix text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    return null;
  end if;
  return ops.enqueue_notification(
    p_user, p_template, 'both',
    jsonb_build_object('evening_id', p_evening.id) || coalesce(p_extra, '{}'::jsonb),
    p_not_before, p_evening.id,
    format('%s:%s:%s:%s', p_template, p_evening.id, p_user, coalesce(p_dedupe_suffix, p_evening.state)),
    p_is_safety, p_has_deadline);
end;
$$;

-- Erinnerung kurz vor Ablauf einer 24-Stunden-Frist (evening.deadline_reminder_hours, 0 = aus).
create or replace function app.evening_schedule_deadline_reminder(p_evening app.evenings, p_due timestamptz, p_deadline_kind text,
  p_users uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h integer := ops.setting_int('evening.deadline_reminder_hours');
begin
  if v_h > 0 and p_due - make_interval(hours => v_h) > app.now() then
    insert into app.evening_deadlines (evening_id, kind, due_at, payload)
    values (p_evening.id, 'reminder', p_due - make_interval(hours => v_h),
            jsonb_build_object('type', 'deadline', 'deadline_kind', p_deadline_kind, 'state', p_evening.state,
                               'users', to_jsonb(p_users), 'deadline_at', p_due));
  end if;
end;
$$;

-- Frist für die Antwort (time_answer) an genau eine Person.
create or replace function app.evening_schedule_answer(p_evening app.evenings, p_waiting_for uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due timestamptz := app.now() + make_interval(hours => ops.setting_int('evening.time_answer_hours'));
begin
  insert into app.evening_deadlines (evening_id, kind, due_at, payload)
  values (p_evening.id, 'time_answer', v_due, jsonb_build_object('waiting_for', p_waiting_for, 'state', p_evening.state));
  perform app.evening_schedule_deadline_reminder(p_evening, v_due, 'time_answer', array[p_waiting_for]);
  return v_due;
end;
$$;

-- Nach der Bestätigung: Erinnerungen, Check-in, Rückmeldung, Hinweis bei unbestätigter Reservierung.
create or replace function app.evening_schedule_confirmed(p_evening app.evenings)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e app.evenings := p_evening;
  h integer;
  v_at timestamptz;
  v_mode text;
begin
  for h in select x::integer from jsonb_array_elements_text(ops.setting('evening.reminder_hours_before')) x loop
    v_at := e.starts_at - make_interval(hours => h);
    if v_at > app.now() then
      insert into app.evening_deadlines (evening_id, kind, due_at, payload)
      values (e.id, 'reminder', v_at, jsonb_build_object('type', 'evening', 'hours_before', h));
    end if;
  end loop;

  insert into app.evening_deadlines (evening_id, kind, due_at, payload)
  values (e.id, 'checkin', e.starts_at + make_interval(mins => ops.setting_int('safety.checkin_after_minutes')), '{}'::jsonb);

  -- Rückmeldung am nächsten Tag um evening.feedback_local_time (Europe/Berlin)
  insert into app.evening_deadlines (evening_id, kind, due_at, payload)
  values (e.id, 'feedback',
          app.berlin_at((e.starts_at at time zone 'Europe/Berlin')::date + 1, ops.setting_text('evening.feedback_local_time')::time),
          jsonb_build_object('step', 'request'));

  select v.reservation_mode into v_mode from app.venues v where v.id = e.venue_id;
  if v_mode = 'email' then
    v_at := least(app.now() + make_interval(hours => ops.setting_int('venue.confirm_alert_hours')), e.starts_at - interval '3 hours');
    if v_at > app.now() then
      insert into app.evening_deadlines (evening_id, kind, due_at, payload)
      values (e.id, 'reservation', v_at, jsonb_build_object('step', 'venue_unconfirmed'));
    end if;
  end if;
end;
$$;

-- Fristen des verlassenen Zustands beenden. Nur was zum alten Zustand gehört, damit Fristen anderer
-- Bereiche unberührt bleiben. Nach happened/no_show bleibt der Check-in bestehen.
create or replace function app.evening_cancel_deadlines(p_evening_id uuid, p_from text, p_to text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
begin
  if p_from in ('proposed', 'time_requested', 'time_countered') then
    update app.evening_deadlines d set cancelled_at = app.now()
     where d.evening_id = p_evening_id and d.done_at is null and d.cancelled_at is null
       and (d.kind in ('time_request', 'time_answer') or (d.kind = 'reminder' and d.payload ->> 'type' = 'deadline'));
    get diagnostics n = row_count;
  elsif p_from = 'confirmed' then
    update app.evening_deadlines d set cancelled_at = app.now()
     where d.evening_id = p_evening_id and d.done_at is null and d.cancelled_at is null
       and (d.kind in ('reminder', 'feedback', 'reservation')
            or (d.kind = 'checkin' and p_to not in ('happened', 'no_show')));
    get diagnostics n = row_count;
  end if;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Neuer Vorschlag (vom Auswahl-Job eingefügt): erste Frist und Nachricht an beide.
-- ---------------------------------------------------------------------------
create or replace function app.evening_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due timestamptz;
begin
  if new.state <> 'proposed' then
    return null;
  end if;
  -- Kein eigener Eintrag in app.evening_events: der Verlauf enthält nur Zustandswechsel (Anlage = created_at).
  v_due := app.now() + make_interval(hours => ops.setting_int('evening.time_request_hours'));
  insert into app.evening_deadlines (evening_id, kind, due_at, payload)
  values (new.id, 'time_request', v_due, jsonb_build_object('state', 'proposed'));
  perform app.evening_schedule_deadline_reminder(new, v_due, 'time_request', array[new.user_a, new.user_b]);
  perform app.evening_notify(new, new.user_a, 'evening.proposed', jsonb_build_object('require_state', jsonb_build_array('proposed')), true);
  perform app.evening_notify(new, new.user_b, 'evening.proposed', jsonb_build_object('require_state', jsonb_build_array('proposed')), true);
  return null;
end;
$$;
drop trigger if exists evenings_m5_after_insert on app.evenings;
create trigger evenings_m5_after_insert after insert on app.evenings
  for each row execute function app.evening_on_insert();

-- ---------------------------------------------------------------------------
-- Nebenwirkungen jedes Zustandswechsels (ersetzt den Platzhalter aus 0500)
-- ---------------------------------------------------------------------------
create or replace function app.evening_after_transition(p_evening app.evenings, p_event text, p_from text, p_actor uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e app.evenings := p_evening;
  v_ev text;
  v_requester uuid;
  v_wait uuid;
  v_other uuid;
begin
  select 'ev' || max(x.id) into v_ev from app.evening_events x where x.evening_id = e.id;

  -- 1. Fristen des alten Zustands beenden
  perform app.evening_cancel_deadlines(e.id, p_from, e.state);

  -- 2. Status des Vorschlags (app.pairings) nachziehen
  if e.state in ('declined', 'lapsed', 'happened', 'no_show', 'cancelled_early', 'cancelled_late') then
    update app.pairings p
       set status = case e.state when 'declined' then 'declined' when 'lapsed' then 'expired'
                                 when 'happened' then 'completed' when 'no_show' then 'completed' else 'cancelled' end
     where p.id = e.pairing_id;
  end if;

  -- 3. Neue Fristen und Nachrichten je Zielzustand
  if e.state = 'time_requested' then
    v_requester := coalesce(e.requested_by, p_actor);
    v_wait := app.evening_other(e, v_requester);
    if v_wait is not null then
      perform app.evening_schedule_answer(e, v_wait);
      perform app.evening_notify(e, v_wait, 'evening.time_requested',
        jsonb_build_object('require_state', jsonb_build_array('time_requested')), true, false, null, v_ev);
    end if;

  elsif e.state = 'time_countered' then
    v_wait := coalesce(e.requested_by, app.evening_other(e, p_actor));
    if v_wait is not null then
      perform app.evening_schedule_answer(e, v_wait);
      perform app.evening_notify(e, v_wait, 'evening.time_countered',
        jsonb_build_object('require_state', jsonb_build_array('time_countered')), true, false, null, v_ev);
    end if;

  elsif e.state = 'confirmed' then
    if e.starts_at is not null then
      if e.venue_id is not null then
        perform app.evening_reserve_slot(e.id);
      end if;
      perform app.evening_schedule_confirmed(e);
    end if;
    perform app.evening_notify(e, e.user_a, 'evening.confirmed', jsonb_build_object('require_state', jsonb_build_array('confirmed')), false, false, null, v_ev);
    perform app.evening_notify(e, e.user_b, 'evening.confirmed', jsonb_build_object('require_state', jsonb_build_array('confirmed')), false, false, null, v_ev);

  elsif e.state = 'declined' then
    -- Nur das Gegenüber erfährt es, ohne Grund.
    v_other := app.evening_other(e, coalesce(e.cancelled_by, p_actor));
    if v_other is not null then
      perform app.evening_notify(e, v_other, 'evening.declined', '{}'::jsonb, false, false, null, v_ev);
    else
      perform app.evening_notify(e, e.user_a, 'evening.declined', '{}'::jsonb, false, false, null, v_ev);
      perform app.evening_notify(e, e.user_b, 'evening.declined', '{}'::jsonb, false, false, null, v_ev);
    end if;

  elsif e.state = 'lapsed' then
    perform app.evening_notify(e, e.user_a, 'evening.lapsed', '{}'::jsonb, false, false, null, v_ev);
    perform app.evening_notify(e, e.user_b, 'evening.lapsed', '{}'::jsonb, false, false, null, v_ev);

  elsif e.state in ('cancelled_early', 'cancelled_late') then
    perform app.evening_release_slot(e.id);
    if p_event = 'cancel_admin' or e.cancelled_by is null or e.cancelled_by not in (e.user_a, e.user_b) then
      perform app.evening_notify(e, e.user_a, 'evening.cancelled', jsonb_build_object('by', 'fermata'), false, false, null, v_ev);
      perform app.evening_notify(e, e.user_b, 'evening.cancelled', jsonb_build_object('by', 'fermata'), false, false, null, v_ev);
    else
      perform app.evening_notify(e, app.evening_other(e, e.cancelled_by), 'evening.cancelled',
        jsonb_build_object('by', 'other'), false, false, null, v_ev);
      perform app.evening_notify(e, e.cancelled_by, 'evening.cancel_receipt',
        jsonb_build_object('late', e.state = 'cancelled_late'), false, false, null, v_ev);
    end if;
  end if;
end;
$$;
comment on function app.evening_after_transition(app.evenings, text, text, uuid, jsonb) is
  'M5: Fristen beenden/planen, Tisch reservieren/freigeben, Nachrichten an Beteiligte und Lokal.';

-- ---------------------------------------------------------------------------
-- Was wird von mir erwartet? (für my_evenings und evening_detail)
-- ---------------------------------------------------------------------------
create or replace function app.evening_my_deadline(p_evening app.evenings, p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select min(d.due_at) from app.evening_deadlines d
   where d.evening_id = p_evening.id and d.done_at is null and d.cancelled_at is null
     and (d.kind = 'time_request' or (d.kind = 'time_answer' and d.payload ->> 'waiting_for' = p_user::text));
$$;

create or replace function app.evening_feedback_open(p_evening app.evenings)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_evening.starts_at is not null
     and p_evening.state in ('confirmed', 'happened', 'no_show')
     and app.now() >= p_evening.starts_at
     and app.now() <= p_evening.starts_at + make_interval(days => ops.setting_int('evening.feedback_open_days'));
$$;

create or replace function app.evening_my_action(p_evening app.evenings, p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e app.evenings := p_evening;
  v_has_feedback boolean;
begin
  if e.state = 'proposed' then
    return 'choose_time';
  elsif e.state = 'time_requested' then
    return case when p_user = e.requested_by then 'wait' else 'answer_time' end;
  elsif e.state = 'time_countered' then
    return case when p_user = e.requested_by then 'answer_time' else 'wait' end;
  elsif e.state in ('confirmed', 'happened', 'no_show') then
    if e.starts_at is null then
      return 'prepare';
    end if;
    if e.state = 'confirmed' and app.now() < e.starts_at - make_interval(mins => ops.setting_int('evening.find_window_before_minutes')) then
      return 'prepare';
    end if;
    if e.state = 'confirmed' and app.now() <= e.starts_at + make_interval(mins => ops.setting_int('evening.find_window_after_minutes')) then
      return 'find';
    end if;
    v_has_feedback := exists (select 1 from app.feedback f where f.evening_id = e.id and f.user_id = p_user);
    if not v_has_feedback and app.evening_feedback_open(e) then
      return 'feedback';
    end if;
    if exists (select 1 from app.contact_shares c where c.evening_id = e.id and c.user_id = p_user and c.released_at is not null) then
      return 'contact';
    end if;
    if coalesce((app.debrief_offer_for(e.id, p_user) ->> 'eligible')::boolean, false) then
      return 'debrief';
    end if;
    return 'none';
  end if;
  return 'none';
end;
$$;

-- ---------------------------------------------------------------------------
-- RPCs für Mitglieder
-- ---------------------------------------------------------------------------
create or replace function api.evening_time_options(p_evening_id uuid)
returns table (starts_at timestamptz, source text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e app.evenings := app.evening_for_member(p_evening_id);
begin
  return query select o.starts_at, o.source from app.evening_time_options(e) o;
end;
$$;
comment on function api.evening_time_options(uuid) is 'Wählbare Beginnzeiten (vorgeschlagen oder im gemeinsamen freien Fenster, mit freiem Tisch).';
grant execute on function api.evening_time_options(uuid) to authenticated;

-- Erste Person wählt 1–3 Uhrzeiten (vorgeschlagen oder eigene im gemeinsamen Fenster).
create or replace function api.evening_request_time(p_evening_id uuid, p_times timestamptz[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings := app.evening_for_member(p_evening_id, true);
  v_times timestamptz[];
begin
  if e.state <> 'proposed' then
    raise exception 'In diesem Schritt nicht möglich' using errcode = '55000', hint = 'invalid_state';
  end if;
  v_times := app.evening_check_times(e, p_times);
  update app.evenings set requested_by = uid, requested_times = app.times_to_jsonb(v_times) where id = e.id;
  perform app.evening_transition(e.id, 'request_time', uid, jsonb_build_object('times', app.times_to_jsonb(v_times)));
  return api.evening_detail(e.id);
end;
$$;
comment on function api.evening_request_time(uuid, timestamptz[]) is 'Wunschzeiten wählen (1–3). Danach hat das Gegenüber 24 Stunden.';
grant execute on function api.evening_request_time(uuid, timestamptz[]) to authenticated;

-- Alternative vorschlagen. time_requested → time_countered (das Gegenüber der wünschenden Person),
-- time_countered → time_requested (die wünschende Person mit neuen Wunschzeiten).
create or replace function api.evening_counter(p_evening_id uuid, p_times timestamptz[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings := app.evening_for_member(p_evening_id, true);
  v_times timestamptz[];
  v_rounds integer;
begin
  if e.state = 'time_requested' then
    if uid = e.requested_by then
      raise exception 'Jetzt ist Ihr Gegenüber an der Reihe' using errcode = '55000', hint = 'not_your_turn';
    end if;
  elsif e.state = 'time_countered' then
    if uid is distinct from e.requested_by then
      raise exception 'Jetzt ist Ihr Gegenüber an der Reihe' using errcode = '55000', hint = 'not_your_turn';
    end if;
  else
    raise exception 'In diesem Schritt nicht möglich' using errcode = '55000', hint = 'invalid_state';
  end if;
  select count(*) into v_rounds from app.evening_events x where x.evening_id = e.id and x.event in ('request_time', 'counter');
  if v_rounds >= ops.setting_int('evening.max_time_rounds') then
    raise exception 'Bitte jetzt eine der Uhrzeiten bestätigen oder absagen' using errcode = '55000', hint = 'max_rounds';
  end if;
  v_times := app.evening_check_times(e, p_times);
  if e.state = 'time_requested' then
    update app.evenings set countered_by = uid, countered_times = app.times_to_jsonb(v_times) where id = e.id;
  else
    update app.evenings set requested_times = app.times_to_jsonb(v_times) where id = e.id;
  end if;
  perform app.evening_transition(e.id, 'counter', uid, jsonb_build_object('times', app.times_to_jsonb(v_times)));
  return api.evening_detail(e.id);
end;
$$;
comment on function api.evening_counter(uuid, timestamptz[]) is 'Alternative (1–3 Uhrzeiten). Neue 24-Stunden-Frist für die andere Person.';
grant execute on function api.evening_counter(uuid, timestamptz[]) to authenticated;

-- Eine angebotene Uhrzeit bestätigen: Tisch wird atomar reserviert (no_table_free, wenn keiner mehr frei ist).
create or replace function api.evening_confirm(p_evening_id uuid, p_time timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings := app.evening_for_member(p_evening_id, true);
  v_offered timestamptz[];
begin
  if e.state = 'time_requested' then
    if uid = e.requested_by then
      raise exception 'Jetzt ist Ihr Gegenüber an der Reihe' using errcode = '55000', hint = 'not_your_turn';
    end if;
    v_offered := app.jsonb_to_times(e.requested_times);
  elsif e.state = 'time_countered' then
    if uid is distinct from e.requested_by then
      raise exception 'Jetzt ist Ihr Gegenüber an der Reihe' using errcode = '55000', hint = 'not_your_turn';
    end if;
    v_offered := app.jsonb_to_times(e.countered_times);
  else
    raise exception 'In diesem Schritt nicht möglich' using errcode = '55000', hint = 'invalid_state';
  end if;
  if p_time is null or not (p_time = any (v_offered)) then
    raise exception 'Diese Uhrzeit wurde nicht angeboten' using errcode = '22023', hint = 'time_not_offered';
  end if;
  if p_time < app.now() + make_interval(hours => ops.setting_int('evening.confirm_min_lead_hours')) then
    raise exception 'Diese Uhrzeit liegt zu kurzfristig' using errcode = '22023', hint = 'time_too_soon';
  end if;
  update app.evenings set starts_at = p_time, confirmed_at = app.now() where id = e.id;
  perform app.evening_transition(e.id, 'confirm', uid, jsonb_build_object('time', app.iso_utc(p_time)));
  return api.evening_detail(e.id);
end;
$$;
comment on function api.evening_confirm(uuid, timestamptz) is 'Angebotene Uhrzeit bestätigen; reserviert den Tisch, plant Erinnerungen, Check-in und Rückmeldung.';
grant execute on function api.evening_confirm(uuid, timestamptz) to authenticated;

create or replace function app.evening_check_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_reason is not null and p_reason not in ('krank', 'termin', 'kein_interesse', 'sicherheit', 'lokal', 'sonstiges') then
    raise exception 'Unbekannter Grund' using errcode = '22023', hint = 'invalid_reason';
  end if;
  return p_reason;
end;
$$;

-- Vorschlag ablehnen (vor der Bestätigung). Das Gegenüber erfährt keinen Grund.
create or replace function api.evening_decline(p_evening_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings := app.evening_for_member(p_evening_id, true);
  v_reason text := app.evening_check_reason(p_reason);
begin
  if e.state not in ('proposed', 'time_requested', 'time_countered') then
    raise exception 'In diesem Schritt nicht möglich' using errcode = '55000', hint = 'invalid_state';
  end if;
  update app.evenings set cancelled_by = uid, cancel_reason = v_reason where id = e.id;
  perform app.evening_transition(e.id, 'decline', uid, jsonb_build_object('reason', v_reason));
  return api.evening_detail(e.id);
end;
$$;
comment on function api.evening_decline(uuid, text) is 'Vorschlag ablehnen (vor der Bestätigung). Gründe: krank, termin, kein_interesse, sicherheit, lokal, sonstiges.';
grant execute on function api.evening_decline(uuid, text) to authenticated;

-- Bestätigten Abend absagen: kurzfristig, wenn weniger als evening.late_cancel_hours vor Beginn.
-- Genau an der Grenze (z. B. 24:00 h vorher) gilt die Absage noch als früh.
create or replace function api.evening_cancel(p_evening_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings := app.evening_for_member(p_evening_id, true);
  v_reason text := app.evening_check_reason(p_reason);
  v_late boolean;
begin
  if e.state <> 'confirmed' then
    raise exception 'Nur bestätigte Abende lassen sich absagen' using errcode = '55000', hint = 'invalid_state';
  end if;
  if e.starts_at is not null and app.now() >= e.starts_at then
    raise exception 'Der Abend hat schon begonnen' using errcode = '55000', hint = 'evening_started';
  end if;
  v_late := e.starts_at is not null
        and e.starts_at - app.now() < make_interval(hours => ops.setting_int('evening.late_cancel_hours'));
  update app.evenings set cancelled_by = uid, cancel_reason = v_reason where id = e.id;
  perform app.evening_transition(e.id, case when v_late then 'cancel_late' else 'cancel_early' end, uid,
    jsonb_build_object('reason', v_reason, 'late', v_late));
  return api.evening_detail(e.id);
end;
$$;
comment on function api.evening_cancel(uuid, text) is 'Bestätigten Abend absagen (cancel_early oder cancel_late), gibt den Tisch frei, informiert Gegenüber und Lokal.';
grant execute on function api.evening_cancel(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lesen (nur eigene Sicht: Vorname des Gegenübers, öffentliche Lokal-Angaben; nie Nachname,
-- Kontakt, Rückmeldung oder Scores des Gegenübers)
-- ---------------------------------------------------------------------------
create or replace function api.my_evenings()
returns table (evening_id uuid, state text, my_action text, my_deadline_at timestamptz, counterpart_first_name text,
               reasons_text text, venue jsonb, proposed_times jsonb, requested_times jsonb, countered_times jsonb,
               requested_by_me boolean, starts_at timestamptz, ends_at timestamptz, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  return query
  select e.id, e.state, app.evening_my_action(e, uid), app.evening_my_deadline(e, uid),
         app.member_first_name(app.evening_other(e, uid)),
         p.reasons_text, app.venue_public(e.venue_id),
         (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
            select x from jsonb_array_elements(e.proposed_times) x order by x limit ops.setting_int('evening.max_times_per_answer')) y),
         e.requested_times, e.countered_times,
         e.requested_by is not distinct from uid and e.requested_by is not null,
         e.starts_at, e.starts_at + app.evening_duration(), e.created_at
  from app.evenings e
  left join app.pairings p on p.id = e.pairing_id
  where uid in (e.user_a, e.user_b)
  order by (e.state in ('proposed', 'time_requested', 'time_countered', 'confirmed')) desc,
           coalesce(e.starts_at, e.created_at) desc;
end;
$$;
comment on function api.my_evenings() is 'Eigene Abende aus eigener Sicht mit erwarteter Handlung (my_action) und Frist.';
grant execute on function api.my_evenings() to authenticated;

create or replace function api.evening_detail(p_evening_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings := app.evening_for_member(p_evening_id);
  p app.pairings;
  r app.evening_reservations;
  v_action text;
  v_hint text;
  v_feedback app.feedback;
  v_options jsonb := '[]'::jsonb;
begin
  select * into p from app.pairings where id = e.pairing_id;
  select * into r from app.evening_reservations where evening_id = e.id and status = 'reserved';
  select h.hint into v_hint from app.evening_hints h where h.evening_id = e.id and h.user_id = uid;
  select * into v_feedback from app.feedback f where f.evening_id = e.id and f.user_id = uid;
  v_action := app.evening_my_action(e, uid);
  if v_action in ('choose_time', 'answer_time') then
    select coalesce(jsonb_agg(jsonb_build_object('starts_at', app.iso_utc(o.starts_at), 'source', o.source) order by o.starts_at), '[]'::jsonb)
      into v_options from app.evening_time_options(e) o;
  end if;
  return jsonb_build_object(
    'evening_id', e.id,
    'state', e.state,
    'my_action', v_action,
    'my_deadline_at', app.evening_my_deadline(e, uid),
    'counterpart_first_name', app.member_first_name(app.evening_other(e, uid)),
    'reasons_text', p.reasons_text,
    'venue', app.venue_public(e.venue_id),
    'proposed_times', (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
        select x from jsonb_array_elements(e.proposed_times) x order by x limit ops.setting_int('evening.max_times_per_answer')) y),
    'requested_times', e.requested_times,
    'countered_times', e.countered_times,
    'requested_by_me', e.requested_by is not null and e.requested_by = uid,
    'countered_by_me', e.countered_by is not null and e.countered_by = uid,
    'time_options', v_options,
    'max_times_per_answer', ops.setting_int('evening.max_times_per_answer'),
    'rounds_left', greatest(ops.setting_int('evening.max_time_rounds')
        - (select count(*)::integer from app.evening_events x where x.evening_id = e.id and x.event in ('request_time', 'counter')), 0),
    'starts_at', e.starts_at,
    'ends_at', e.starts_at + app.evening_duration(),
    'late_cancel_from', e.starts_at - make_interval(hours => ops.setting_int('evening.late_cancel_hours')),
    'reservation', case when r.id is not null and e.state = 'confirmed' then
        jsonb_build_object('name', ops.setting_text('evening.reservation_name'), 'table_code', r.table_code, 'persons', 2) end,
    'find_window', case when e.starts_at is not null then jsonb_build_object(
        'opens_at', e.starts_at - make_interval(mins => ops.setting_int('evening.find_window_before_minutes')),
        'closes_at', e.starts_at + make_interval(mins => ops.setting_int('evening.find_window_after_minutes'))) end,
    'my_recognition_hint', v_hint,
    'feedback', jsonb_build_object(
        'submitted', v_feedback.id is not null,
        'open', app.evening_feedback_open(e),
        'open_until', e.starts_at + make_interval(days => ops.setting_int('evening.feedback_open_days')),
        'mine', case when v_feedback.id is not null then jsonb_build_object(
            'attended', v_feedback.attended, 'other_attended', v_feedback.other_attended,
            'wants_contact', v_feedback.wants_contact, 'would_meet_again', v_feedback.would_meet_again,
            'felt_safe', v_feedback.felt_safe, 'venue_rating', v_feedback.venue_rating,
            'match_quality', v_feedback.match_quality, 'note', v_feedback.note) end),
    'contact_share', app.contact_share_for(e.id, uid),
    'debrief', app.debrief_offer_for(e.id, uid),
    'cancelled_by_me', e.cancelled_by is not null and e.cancelled_by = uid,
    'created_at', e.created_at);
end;
$$;
comment on function api.evening_detail(uuid) is 'Alles zu einem eigenen Abend für die Oberfläche (eigene Sicht).';
grant execute on function api.evening_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Inhalt für den Versand (Edge Function notify-dispatch). Wird erst beim Versand gebaut,
-- damit die Warteschlange keine Personendaten speichert und Texte aktuell sind.
-- ---------------------------------------------------------------------------
create or replace function ops.notification_context(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q ops.notification_queue;
  e app.evenings;
  v app.venues;
  r app.evening_reservations;
  pr app.pairings;
  per app.availability_periods;
  acc app.accounts;
  v_email text;
  v_kind text;
  v_ctx jsonb;
  v_offered jsonb := '[]'::jsonb;
  v_required jsonb;
begin
  select * into q from ops.notification_queue where id = p_id;
  if not found then
    return jsonb_build_object('skip', 'missing');
  end if;
  v_ctx := jsonb_build_object('id', q.id, 'template', q.template, 'payload', q.payload,
                              'is_safety', q.is_safety, 'has_deadline', q.has_deadline);

  -- Empfänger
  if q.venue_id is not null then
    select * into v from app.venues where id = q.venue_id;
    if not found or coalesce(v.contact_email, '') = '' then
      return v_ctx || jsonb_build_object('skip', 'no_address');
    end if;
    v_kind := 'venue';
    v_ctx := v_ctx || jsonb_build_object('recipient', jsonb_build_object(
      'kind', 'venue', 'email', v.contact_email, 'name', v.contact_name, 'address_form', 'sie'));
  else
    select u.email into v_email from auth.users u where u.id = q.user_id;
    if coalesce(v_email, '') = '' then
      return v_ctx || jsonb_build_object('skip', 'no_address');
    end if;
    if q.template like 'admin.%' or coalesce((q.payload ->> 'manual')::boolean, false) then
      v_kind := 'admin';
      v_ctx := v_ctx || jsonb_build_object('recipient', jsonb_build_object(
        'kind', 'admin', 'email', v_email, 'name', null, 'address_form', 'du'));
    else
      select * into acc from app.accounts where user_id = q.user_id;
      if not found or acc.status = 'closed' then
        return v_ctx || jsonb_build_object('skip', 'account_closed');
      end if;
      v_kind := 'member';
      v_ctx := v_ctx || jsonb_build_object('recipient', jsonb_build_object(
        'kind', 'member', 'email', v_email, 'name', app.member_first_name(q.user_id), 'address_form', acc.address_form));
    end if;
  end if;

  -- Abend
  if q.evening_id is not null then
    select * into e from app.evenings where id = q.evening_id;
    if not found then
      return v_ctx || jsonb_build_object('skip', 'missing');
    end if;
    v_required := q.payload -> 'require_state';
    if v_required is not null and jsonb_typeof(v_required) = 'array'
       and not exists (select 1 from jsonb_array_elements_text(v_required) s where s = e.state) then
      return v_ctx || jsonb_build_object('skip', 'outdated');
    end if;
    select * into r from app.evening_reservations where evening_id = e.id;
    if v_kind = 'member' then
      select * into pr from app.pairings where id = e.pairing_id;
      if e.state = 'proposed' then
        v_offered := (select coalesce(jsonb_agg(x order by x), '[]'::jsonb) from (
          select x from jsonb_array_elements(e.proposed_times) x order by x limit ops.setting_int('evening.max_times_per_answer')) y);
      elsif e.state = 'time_requested' and q.user_id is distinct from e.requested_by then
        v_offered := e.requested_times;
      elsif e.state = 'time_countered' and q.user_id = e.requested_by then
        v_offered := e.countered_times;
      end if;
      v_ctx := v_ctx || jsonb_build_object('evening', jsonb_build_object(
        'id', e.id,
        'state', e.state,
        'starts_at', e.starts_at,
        'ends_at', e.starts_at + app.evening_duration(),
        'venue', app.venue_public(e.venue_id),
        'reasons_text', pr.reasons_text,
        'offered_times', v_offered,
        'deadline_at', app.evening_my_deadline(e, q.user_id),
        'reservation_name', ops.setting_text('evening.reservation_name'),
        'table_code', case when r.status = 'reserved' then r.table_code end,
        'late_cancel_from', e.starts_at - make_interval(hours => ops.setting_int('evening.late_cancel_hours')),
        'feedback_until', e.starts_at + make_interval(days => ops.setting_int('evening.feedback_open_days'))));
    else
      -- Lokal oder Admin: nur Reservierungsdaten, keine Mitgliederdaten.
      if r.id is null then
        return v_ctx || jsonb_build_object('skip', 'missing');
      end if;
      select * into v from app.venues where id = r.venue_id;
      if q.template = 'venue.reservation' and r.status <> 'reserved' then
        return v_ctx || jsonb_build_object('skip', 'outdated');
      end if;
      if q.template = 'venue.cancellation' then
        -- Absage nur, wenn die Reservierung wirklich verschickt wurde; läuft sie noch, später erneut prüfen.
        if exists (select 1 from ops.notification_queue x
                    where x.template = 'venue.reservation' and x.payload ->> 'reservation_id' = r.id::text
                      and x.sent_at is null and x.failed_at is null) then
          return v_ctx || jsonb_build_object('defer', true);
        end if;
        if r.venue_notified_at is null then
          return v_ctx || jsonb_build_object('skip', 'never_notified');
        end if;
      end if;
      v_ctx := v_ctx || jsonb_build_object('reservation', jsonb_build_object(
        'id', r.id,
        'starts_at', r.starts_at,
        'table_code', r.table_code,
        'persons', 2,
        'reservation_name', ops.setting_text('evening.reservation_name'),
        'status', r.status,
        'venue_confirmed_at', r.venue_confirmed_at,
        'notes', nullif(v.agreement ->> 'reservation_note', ''),
        'token_expires_at', r.starts_at + interval '1 day',
        'venue', jsonb_build_object('name', v.name, 'street', v.street, 'postal_code', v.postal_code, 'city', v.city,
                                    'contact_name', v.contact_name,
                                    'contact_phone', case when v_kind = 'admin' then v.contact_phone end,
                                    'reservation_mode', v.reservation_mode)));
    end if;
  end if;

  -- Zeitenabfrage
  if q.payload ? 'period_id' then
    select * into per from app.availability_periods where id = (q.payload ->> 'period_id')::uuid;
    if not found then
      return v_ctx || jsonb_build_object('skip', 'missing');
    end if;
    if app.now() > per.answer_until then
      return v_ctx || jsonb_build_object('skip', 'outdated');
    end if;
    if q.template = 'availability.reminder'
       and exists (select 1 from app.availability_windows w where w.period_id = per.id and w.user_id = q.user_id) then
      return v_ctx || jsonb_build_object('skip', 'already_answered');
    end if;
    v_ctx := v_ctx || jsonb_build_object('period', jsonb_build_object(
      'id', per.id, 'starts_on', per.starts_on, 'ends_on', per.ends_on, 'answer_until', per.answer_until));
  end if;

  return v_ctx;
end;
$$;
comment on function ops.notification_context(bigint) is
  'Empfänger und Inhalt einer Nachricht, erst beim Versand gebaut. skip: nicht senden; defer: später erneut prüfen.';
