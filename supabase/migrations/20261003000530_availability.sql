-- Fermata · M5: Zeitenabfrage (PLAN 3.2 Nr. 10, 2.3 Nr. 6)
-- Je Auswahl-Zyklus (matching.rhythm_days) entsteht ein Zeitraum in app.availability_periods.
-- Mitglieder tragen ihre freien Abende als Fenster ein; die Auswahl (M4) rechnet gemeinsame Fenster.

alter table app.availability_periods
  add column if not exists request_sent_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;
comment on column app.availability_periods.request_sent_at is 'Zeitenabfrage an alle passenden Mitglieder verschickt (M5).';
comment on column app.availability_periods.reminder_sent_at is 'Erinnerung an Mitglieder ohne Eintrag verschickt (M5).';

-- Mitglieder schreiben Fenster nur noch über api.set_availability (Prüfregeln an einer Stelle).
-- Jobs (service_role, Auswahl, Agent) sind davon nicht betroffen.
revoke insert, delete on app.availability_windows from authenticated;

-- Wer bekommt die Zeitenabfrage? Aktive, nicht pausierte, nicht gesperrte Mitglieder mit fertigem Profil.
create or replace function app.availability_eligible(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a app.accounts;
begin
  select * into a from app.accounts where user_id = p_user;
  if not found or a.status <> 'active' or (a.paused_until is not null and a.paused_until > app.now()) then
    return false;
  end if;
  if safety.is_suspended(p_user) then
    return false;
  end if;
  return coalesce((select pc.ready_for_matching from app.profile_core pc where pc.user_id = p_user), false);
end;
$$;
comment on function app.availability_eligible(uuid) is
  'true für aktive, nicht pausierte, nicht gesperrte Mitglieder mit profile_core.ready_for_matching.';

-- Darf die Person Zeiten eintragen? (aktiv und nicht gesperrt; das Profil muss noch nicht fertig sein)
create or replace function app.availability_can_answer(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (select 1 from app.accounts a where a.user_id = p_user and a.status = 'active')
     and not safety.is_suspended(p_user);
end;
$$;

create or replace function ops.availability_send_requests(p_period_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer := 0;
  u record;
begin
  for u in select a.user_id from app.accounts a where app.availability_eligible(a.user_id) loop
    if ops.enqueue_notification(u.user_id, 'availability.request', 'both', jsonb_build_object('period_id', p_period_id),
         null, null, format('availability.request:%s:%s', p_period_id, u.user_id), false, true) is not null then
      n := n + 1;
    end if;
  end loop;
  update app.availability_periods set request_sent_at = coalesce(request_sent_at, app.now()) where id = p_period_id;
  return n;
end;
$$;

-- Zeitraum anlegen. Ohne Startdatum: direkt nach dem letzten Zeitraum, sonst heute + availability.ask_lead_days.
create or replace function ops.create_availability_period(p_starts_on date default null, p_notify boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (app.now() at time zone 'Europe/Berlin')::date;
  v_start date := p_starts_on;
  v_days integer := ops.setting_int('matching.rhythm_days');
  v_ask timestamptz := app.now();
  v_until timestamptz;
  v_id uuid;
begin
  if v_start is null then
    select max(p.ends_on) + 1 into v_start from app.availability_periods p;
    if v_start is null or v_start <= v_today then
      v_start := v_today + ops.setting_int('availability.ask_lead_days');
    end if;
  end if;
  -- Die Abfrage endet spätestens am Vortag des Zeitraums.
  v_until := least(v_ask + make_interval(hours => ops.setting_int('availability.answer_hours')),
                   app.berlin_at(v_start - 1, time '23:59'));
  v_until := greatest(v_until, v_ask);
  insert into app.availability_periods (starts_on, ends_on, ask_at, answer_until)
  values (v_start, v_start + v_days - 1, v_ask, v_until)
  on conflict (starts_on, ends_on) do nothing
  returning id into v_id;
  if v_id is not null and coalesce(p_notify, true) then
    perform ops.availability_send_requests(v_id);
  end if;
  return v_id;
end;
$$;
comment on function ops.create_availability_period(date, boolean) is
  'Legt den nächsten Zeitraum an (Länge matching.rhythm_days) und verschickt die Zeitenabfrage.';

-- Stündlich per pg_cron: neuen Zeitraum anlegen, wenn es Zeit ist; Erinnerungen vor Ablauf.
create or replace function ops.availability_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := app.now();
  v_local timestamp := app.now() at time zone 'Europe/Berlin';
  v_today date := (app.now() at time zone 'Europe/Berlin')::date;
  v_next date;
  v_created uuid;
  v_reminded integer := 0;
  p app.availability_periods;
  u record;
begin
  select max(ap.ends_on) + 1 into v_next from app.availability_periods ap;
  if v_next is null or v_next <= v_today then
    v_next := v_today + ops.setting_int('availability.ask_lead_days');
  end if;
  if v_today >= v_next - ops.setting_int('availability.ask_lead_days')
     and v_local::time >= ops.setting_text('availability.ask_local_time')::time then
    v_created := ops.create_availability_period(v_next, true);
  end if;

  for p in
    select * from app.availability_periods ap
     where ap.request_sent_at is not null and ap.reminder_sent_at is null
       and v_now < ap.answer_until
       and v_now >= ap.answer_until - make_interval(hours => ops.setting_int('availability.reminder_hours_before_close'))
     for update skip locked
  loop
    for u in
      select a.user_id from app.accounts a
       where app.availability_eligible(a.user_id)
         and not exists (select 1 from app.availability_windows w where w.user_id = a.user_id and w.period_id = p.id)
    loop
      if ops.enqueue_notification(u.user_id, 'availability.reminder', 'both', jsonb_build_object('period_id', p.id),
           null, null, format('availability.reminder:%s:%s', p.id, u.user_id), false, true) is not null then
        v_reminded := v_reminded + 1;
      end if;
    end loop;
    update app.availability_periods set reminder_sent_at = v_now where id = p.id;
  end loop;

  return jsonb_build_object('created_period', v_created, 'reminders', v_reminded);
end;
$$;
comment on function ops.availability_tick() is 'Zeitenabfrage: neuen Zeitraum anlegen (wenn fällig) und Erinnerungen verschicken. Idempotent.';

-- ---------------------------------------------------------------------------
-- Mitglieder: freie Fenster eintragen und lesen
-- ---------------------------------------------------------------------------
create or replace function api.set_availability(p_period_id uuid, p_windows jsonb)
returns table (window_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  p app.availability_periods;
  w jsonb;
  v_s timestamptz;
  v_e timestamptz;
  v_prev_end timestamptz;
  v_min interval := make_interval(mins => ops.setting_int('availability.min_window_minutes'));
  v_max interval := make_interval(hours => ops.setting_int('availability.max_window_hours'));
  v_starts timestamptz[] := array[]::timestamptz[];
  v_ends timestamptz[] := array[]::timestamptz[];
  i integer;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  if not app.availability_can_answer(uid) then
    raise exception 'Konto ist nicht aktiv' using errcode = '42501', hint = 'account_inactive';
  end if;
  select * into p from app.availability_periods ap where ap.id = p_period_id;
  if not found then
    raise exception 'Zeitraum nicht gefunden' using errcode = 'P0002', hint = 'period_not_found';
  end if;
  if app.now() > p.answer_until then
    raise exception 'Die Zeitenabfrage ist abgeschlossen' using errcode = '55000', hint = 'period_closed';
  end if;
  if p_windows is null or jsonb_typeof(p_windows) <> 'array' then
    raise exception 'Fenster als Liste angeben' using errcode = '22023', hint = 'invalid_input';
  end if;
  if jsonb_array_length(p_windows) > ops.setting_int('availability.max_windows') then
    raise exception 'Zu viele Zeitfenster' using errcode = '22023', hint = 'too_many_windows';
  end if;

  for w in select x from jsonb_array_elements(p_windows) x loop
    begin
      v_s := (w ->> 'starts_at')::timestamptz;
      v_e := (w ->> 'ends_at')::timestamptz;
    exception when others then
      raise exception 'Ungültige Zeitangabe' using errcode = '22023', hint = 'invalid_input';
    end;
    if v_s is null or v_e is null or v_s >= v_e then
      raise exception 'Ungültige Zeitangabe' using errcode = '22023', hint = 'invalid_input';
    end if;
    if v_e - v_s < v_min then
      raise exception 'Zeitfenster ist zu kurz' using errcode = '22023', hint = 'window_too_short';
    end if;
    if v_e - v_s > v_max then
      raise exception 'Zeitfenster ist zu lang' using errcode = '22023', hint = 'window_too_long';
    end if;
    if v_s <= app.now() then
      raise exception 'Zeitfenster liegt in der Vergangenheit' using errcode = '22023', hint = 'window_in_past';
    end if;
    if (v_s at time zone 'Europe/Berlin')::date not between p.starts_on and p.ends_on then
      raise exception 'Zeitfenster liegt außerhalb des Zeitraums' using errcode = '22023', hint = 'window_outside_period';
    end if;
    v_starts := v_starts || v_s;
    v_ends := v_ends || v_e;
  end loop;

  -- Überschneidungen ablehnen (sortiert nach Beginn prüfen)
  v_prev_end := null;
  for i in select o from unnest(v_starts) with ordinality u(s, o) order by s loop
    if v_prev_end is not null and v_starts[i] < v_prev_end then
      raise exception 'Zeitfenster überschneiden sich' using errcode = '22023', hint = 'windows_overlap';
    end if;
    v_prev_end := greatest(coalesce(v_prev_end, v_ends[i]), v_ends[i]);
  end loop;

  delete from app.availability_windows aw where aw.user_id = uid and aw.period_id = p.id;
  if cardinality(v_starts) > 0 then
    insert into app.availability_windows (user_id, period_id, starts_at, ends_at)
    select uid, p.id, s, e from unnest(v_starts, v_ends) u(s, e);
  end if;

  return query
  select aw.id, aw.starts_at, aw.ends_at from app.availability_windows aw
   where aw.user_id = uid and aw.period_id = p.id order by aw.starts_at;
end;
$$;
comment on function api.set_availability(uuid, jsonb) is
  'Ersetzt die eigenen freien Fenster eines Zeitraums. p_windows: [{"starts_at": ISO, "ends_at": ISO}, …]; leere Liste löscht alle.';
grant execute on function api.set_availability(uuid, jsonb) to authenticated;

create or replace function api.my_availability(p_period_id uuid)
returns table (window_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select aw.id, aw.starts_at, aw.ends_at from app.availability_windows aw
   where aw.user_id = auth.uid() and aw.period_id = p_period_id
   order by aw.starts_at;
$$;
comment on function api.my_availability(uuid) is 'Eigene freie Fenster eines Zeitraums.';
grant execute on function api.my_availability(uuid) to authenticated;

create or replace function api.my_availability_periods()
returns table (period_id uuid, starts_on date, ends_on date, answer_until timestamptz, is_open boolean, window_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.starts_on, p.ends_on, p.answer_until, app.now() <= p.answer_until,
         (select count(*)::integer from app.availability_windows w where w.period_id = p.id and w.user_id = auth.uid())
  from app.availability_periods p
  where p.ends_on >= (app.now() at time zone 'Europe/Berlin')::date
  order by p.starts_on;
$$;
comment on function api.my_availability_periods() is 'Laufende und kommende Zeiträume mit Zahl der eigenen Fenster.';
grant execute on function api.my_availability_periods() to authenticated;

create or replace function api.admin_create_availability_period(p_starts_on date default null, p_notify boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.m5_require_admin();
  v_id := ops.create_availability_period(p_starts_on, p_notify);
  if v_id is null then
    raise exception 'Diesen Zeitraum gibt es schon' using errcode = '23505', hint = 'period_exists';
  end if;
  perform ops.audit('availability.period_create', 'app.availability_periods', v_id::text,
    jsonb_build_object('starts_on', p_starts_on, 'notify', p_notify));
  return v_id;
end;
$$;
comment on function api.admin_create_availability_period(date, boolean) is 'Admin: Zeitraum von Hand anlegen (sonst pg_cron).';
grant execute on function api.admin_create_availability_period(date, boolean) to authenticated;
