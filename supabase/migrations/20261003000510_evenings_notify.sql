-- Fermata · M5: Einstellungen für Abende, Benachrichtigungs-Warteschlange, Web-Push-Abos
-- PLAN 2.2 (Push ohne Namen), 2.3 Nr. 6, 5.2 (Frist → immer auch E-Mail), M5.
--
-- Ablauf einer Nachricht:
--   ops.enqueue_notification() legt eine Zeile in ops.notification_queue an (nur IDs und Parameter,
--   keine unnötigen Personendaten). Die Edge Function notify-dispatch holt fällige Zeilen über
--   ops.notify_claim() ab (for update skip locked), baut Text und Empfänger erst beim Versand aus
--   ops.notification_context() und meldet das Ergebnis mit ops.notify_complete() zurück.
--   Ruhezeiten (notify.quiet_hours) gelten nur für Push und nie für Sicherheitsnachrichten.

-- ---------------------------------------------------------------------------
-- Einstellungen (PLATZHALTER = noch nicht von Benn entschieden, docs/bereiche/abende.md)
-- ---------------------------------------------------------------------------
insert into ops.app_settings (key, value, description, category, is_public) values
  -- Zeitenabfrage
  ('availability.ask_lead_days', '10', 'Die Zeitenabfrage für einen Zeitraum geht so viele Tage vor seinem ersten Tag hinaus.', 'zeiten', false),
  ('availability.ask_local_time', '"10:00"', 'Frühestens zu dieser Uhrzeit (Europe/Berlin) geht eine neue Zeitenabfrage hinaus.', 'zeiten', false),
  ('availability.answer_hours', '72', 'So viele Stunden bleibt eine Zeitenabfrage offen.', 'zeiten', false),
  ('availability.reminder_hours_before_close', '24', 'Erinnerung an die Zeitenabfrage so viele Stunden vor ihrem Ende (nur an Personen ohne Eintrag).', 'zeiten', false),
  ('availability.max_windows', '12', 'Höchstens so viele freie Zeitfenster je Person und Zeitraum.', 'zeiten', false),
  ('availability.min_window_minutes', '120', 'Ein freies Zeitfenster ist mindestens so viele Minuten lang (ein Abend muss hineinpassen).', 'zeiten', false),
  ('availability.max_window_hours', '6', 'Ein freies Zeitfenster ist höchstens so viele Stunden lang.', 'zeiten', false),
  -- Terminabstimmung
  ('evening.max_times_per_answer', '3', 'Höchstens so viele Uhrzeiten je Wunsch oder Alternative (PLAN 2.3 Nr. 6).', 'abend', false),
  ('evening.min_lead_hours', '30', 'PLATZHALTER: Wunschzeiten und Alternativen müssen mindestens so viele Stunden in der Zukunft liegen (24-h-Frist des Gegenübers plus Vorlauf fürs Lokal).', 'abend', false),
  ('evening.confirm_min_lead_hours', '6', 'PLATZHALTER: Eine Uhrzeit lässt sich nur bestätigen, wenn sie mindestens so viele Stunden in der Zukunft liegt (Vorlauf fürs Lokal).', 'abend', false),
  ('evening.max_time_rounds', '4', 'PLATZHALTER: Höchstens so viele Runden aus Wunsch und Alternative; danach nur noch bestätigen oder absagen.', 'abend', false),
  ('evening.deadline_reminder_hours', '4', 'Erinnerung so viele Stunden vor Ablauf einer 24-Stunden-Frist (0 schaltet sie ab).', 'abend', false),
  ('evening.reservation_name', '"Fermata"', 'Name, unter dem im Lokal reserviert wird.', 'abend', false),
  -- Finde-Fenster
  ('evening.find_window_before_minutes', '15', 'Finde-Fenster: öffnet so viele Minuten vor Beginn.', 'abend', false),
  ('evening.find_window_after_minutes', '45', 'Finde-Fenster: schließt so viele Minuten nach Beginn.', 'abend', false),
  ('evening.recognition_hint_max_chars', '80', 'Erkennungszeichen (freier Text, z. B. „dunkelblauer Schal“): höchstens so viele Zeichen.', 'abend', false),
  -- Rückmeldung, Ergebnis, Nachbesprechung
  ('evening.happened_auto_hours', '24', 'Ohne gegenteilige Angabe gilt der Abend so viele Stunden nach der Rückmeldungs-Anfrage als stattgefunden.', 'abend', false),
  ('evening.no_show_contest_hours', '24', 'PLATZHALTER (Frage B9): So viele Stunden hat eine als nicht erschienen gemeldete Person für ihre eigene Rückmeldung.', 'abend', false),
  ('evening.feedback_open_days', '7', 'Die Rückmeldung ist bis so viele Tage nach dem Abend möglich.', 'abend', false),
  ('evening.debrief_offer_days', '7', 'Die Nachbesprechung wird bis so viele Tage nach dem Abend angeboten.', 'abend', false),
  -- Lokale
  ('venue.confirm_alert_hours', '24', 'Hat das Lokal eine Reservierung nach so vielen Stunden nicht bestätigt, bekommt Benn einen Hinweis.', 'lokal', false),
  ('venue.max_slot_weeks', '26', 'Plätze lassen sich für höchstens so viele Wochen auf einmal anlegen.', 'lokal', false),
  -- Versand
  ('notify.max_attempts', '5', 'So oft wird ein fehlgeschlagener Versand versucht.', 'benachrichtigung', false),
  ('notify.retry_minutes', '10', 'Wartezeit vor einem neuen Versuch, wächst mit jedem Versuch (Minuten × Versuch).', 'benachrichtigung', false),
  ('notify.push_ttl_seconds', '86400', 'So lange halten die Push-Dienste eine Nachricht bereit.', 'benachrichtigung', false),
  ('notify.dispatch_url', 'null', 'Adresse der Edge Function notify-dispatch. Gesetzt: pg_cron stößt den Versand jede Minute über pg_net an (Geheimnis in Vault: fermata_notify_dispatch_secret). null: externer Zeitplaner.', 'benachrichtigung', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Fehler mit stabiler Kennung (hint) für Oberflächen; Meldung auf Deutsch.
-- Gleiche Konvention wie in der Web-App-Migration: errcode + hint = Kennung.
-- ---------------------------------------------------------------------------
create or replace function app.m5_fail(p_hint text, p_message text, p_errcode text default 'P0001')
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_message, errcode = p_errcode, hint = p_hint;
end;
$$;
comment on function app.m5_fail(text, text, text) is 'Wirft einen Fehler mit deutscher Meldung, SQLSTATE und stabiler Kennung im hint.';

-- ISO-Zeit in UTC, immer gleich formatiert (für jsonb-Listen von Uhrzeiten).
create or replace function app.iso_utc(p_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
$$;

create or replace function app.times_to_jsonb(p_times timestamptz[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(app.iso_utc(t) order by t), '[]'::jsonb) from unnest(p_times) t;
$$;

create or replace function app.jsonb_to_times(p_times jsonb)
returns timestamptz[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(x::timestamptz order by x::timestamptz), array[]::timestamptz[])
  from jsonb_array_elements_text(case when jsonb_typeof(p_times) = 'array' then p_times else '[]'::jsonb end) x;
$$;

-- Lokale Uhrzeit Europe/Berlin → Zeitpunkt
create or replace function app.berlin_at(p_day date, p_time time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (p_day + p_time) at time zone 'Europe/Berlin';
$$;

-- ---------------------------------------------------------------------------
-- Warteschlange
-- ---------------------------------------------------------------------------
create table ops.notification_queue (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete cascade,     -- Mitglied oder Admin
  venue_id uuid references app.venues (id) on delete cascade,    -- Lokal (nur E-Mail)
  evening_id uuid references app.evenings (id) on delete cascade,
  template text not null check (template ~ '^[a-z]+\.[a-z_]+$'),
  channel text not null check (channel in ('email', 'push', 'both')),
  payload jsonb not null default '{}'::jsonb,
  is_safety boolean not null default false,     -- Sicherheit: Push auch in der Ruhezeit
  has_deadline boolean not null default false,  -- läuft eine Frist: immer auch E-Mail (PLAN 5.2)
  dedupe_key text unique,                       -- jede Nachricht höchstens einmal
  not_before timestamptz not null,
  push_not_before timestamptz,                  -- Push wegen Ruhezeit verschoben
  email_state text check (email_state in ('pending', 'sent', 'skipped', 'failed')),
  push_state text check (push_state in ('pending', 'sent', 'skipped', 'failed')),
  locked_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,     -- fertig, mindestens ein Kanal hat zugestellt
  failed_at timestamptz,   -- fertig, kein Kanal hat zugestellt
  skip_reason text,
  created_at timestamptz not null default now(),
  check (user_id is not null or venue_id is not null),
  check (venue_id is null or channel = 'email'),
  check (email_state is not null or push_state is not null)
);
comment on table ops.notification_queue is
  'Ausgehende Nachrichten (E-Mail, Web-Push). payload enthält nur IDs und Parameter; Texte entstehen erst beim Versand.';
comment on column ops.notification_queue.payload is
  'Nur IDs und Parameter (z. B. evening_id, hours_before, require_state). Keine Namen, keine Adressen.';
create index notification_queue_due_idx on ops.notification_queue (not_before)
  where sent_at is null and failed_at is null;
create index notification_queue_user_idx on ops.notification_queue (user_id, created_at desc);
create index notification_queue_evening_idx on ops.notification_queue (evening_id);
alter table ops.notification_queue enable row level security;

create or replace function ops.enqueue_notification(
  p_user uuid,
  p_template text,
  p_channel text default 'both',
  p_payload jsonb default '{}'::jsonb,
  p_not_before timestamptz default null,
  p_evening uuid default null,
  p_dedupe_key text default null,
  p_is_safety boolean default false,
  p_has_deadline boolean default false,
  p_venue uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_channel text := coalesce(p_channel, 'both');
begin
  if v_channel not in ('email', 'push', 'both') then
    perform app.m5_fail('invalid_channel', 'Unbekannter Kanal', '22023');
  end if;
  -- Läuft eine Frist, geht die Nachricht immer auch per E-Mail (PLAN 5.2).
  if p_has_deadline and v_channel = 'push' then
    v_channel := 'both';
  end if;
  -- Lokale bekommen nur E-Mails.
  if p_venue is not null then
    v_channel := 'email';
  end if;
  insert into ops.notification_queue (
    user_id, venue_id, evening_id, template, channel, payload, is_safety, has_deadline, dedupe_key,
    not_before, email_state, push_state)
  values (
    case when p_venue is null then p_user end, p_venue, p_evening, p_template, v_channel,
    coalesce(p_payload, '{}'::jsonb), coalesce(p_is_safety, false), coalesce(p_has_deadline, false), p_dedupe_key,
    coalesce(p_not_before, app.now()),
    case when v_channel in ('email', 'both') then 'pending' end,
    case when v_channel in ('push', 'both') then 'pending' end)
  on conflict (dedupe_key) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
comment on function ops.enqueue_notification(uuid, text, text, jsonb, timestamptz, uuid, text, boolean, boolean, uuid) is
  'Legt eine Nachricht an. Mit Frist wird aus push automatisch both. dedupe_key verhindert doppelte Nachrichten.';

-- Ruhezeit für Push (Europe/Berlin). Liefert das Ende der Ruhezeit oder null, wenn gerade keine ist.
create or replace function ops.quiet_hours_end(p_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb := ops.setting('notify.quiet_hours');
  v_start time;
  v_end time;
  v_local timestamp := p_at at time zone 'Europe/Berlin';
  v_t time := v_local::time;
  v_day date := v_local::date;
begin
  if v is null or jsonb_typeof(v) <> 'object' then
    return null;
  end if;
  v_start := (v ->> 'start')::time;
  v_end := (v ->> 'end')::time;
  if v_start is null or v_end is null or v_start = v_end then
    return null;
  end if;
  if v_start > v_end then
    -- über Mitternacht, z. B. 22:00–08:00
    if v_t >= v_start then
      return app.berlin_at(v_day + 1, v_end);
    elsif v_t < v_end then
      return app.berlin_at(v_day, v_end);
    end if;
  elsif v_t >= v_start and v_t < v_end then
    return app.berlin_at(v_day, v_end);
  end if;
  return null;
end;
$$;
comment on function ops.quiet_hours_end(timestamptz) is 'Ende der Push-Ruhezeit (notify.quiet_hours, Europe/Berlin) oder null außerhalb.';

-- Fertig? Setzt sent_at oder failed_at, sobald kein Kanal mehr offen ist.
create or replace function ops.notify_finish_if_done(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update ops.notification_queue q
     set sent_at = case when 'sent' in (coalesce(q.email_state, ''), coalesce(q.push_state, '')) then app.now() end,
         failed_at = case when 'sent' in (coalesce(q.email_state, ''), coalesce(q.push_state, '')) then null else app.now() end,
         locked_until = null
   where q.id = p_id and q.sent_at is null and q.failed_at is null
     and coalesce(q.email_state, '') <> 'pending' and coalesce(q.push_state, '') <> 'pending';
$$;

-- Protokoll ohne Inhalt und ohne Adressen (ops.notifications_log aus dem Kern).
create or replace function ops.log_notification(p_user uuid, p_channel text, p_template text, p_purpose text,
  p_provider text, p_provider_id text, p_status text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into ops.notifications_log (user_id, channel, template, purpose, provider, provider_id, status)
  values (p_user, p_channel, p_template, p_purpose, p_provider, p_provider_id, p_status);
$$;

-- ---------------------------------------------------------------------------
-- Abholen fälliger Nachrichten (Edge Function notify-dispatch)
-- ---------------------------------------------------------------------------
create or replace function ops.notify_claim(p_limit integer default 20, p_lock_seconds integer default 120)
returns table (id bigint, template text, do_email boolean, do_push boolean, is_safety boolean, user_id uuid,
               context jsonb, push_targets jsonb)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r ops.notification_queue;
  v_now timestamptz := app.now();
  v_quiet_end timestamptz := ops.quiet_hours_end(app.now());
  v_ctx jsonb;
  v_targets jsonb;
  v_push_ok boolean;
  v_do_email boolean;
  v_do_push boolean;
begin
  for r in
    select q.* from ops.notification_queue q
     where q.sent_at is null and q.failed_at is null
       and q.not_before <= v_now
       and (q.locked_until is null or q.locked_until <= v_now)
       and (q.email_state = 'pending'
            or (q.push_state = 'pending' and coalesce(q.push_not_before, q.not_before) <= v_now))
     order by q.is_safety desc, q.not_before, q.id
     limit greatest(coalesce(p_limit, 20), 1)
     for update of q skip locked
  loop
    v_ctx := ops.notification_context(r.id);
    -- Später erneut prüfen (z. B. Absage ans Lokal, solange die Reservierung noch unterwegs ist).
    if coalesce((v_ctx ->> 'defer')::boolean, false) then
      update ops.notification_queue q set not_before = v_now + interval '2 minutes' where q.id = r.id;
      continue;
    end if;
    -- Veraltet (Zustand hat sich geändert) oder Konto geschlossen: nicht mehr senden.
    if v_ctx ? 'skip' and v_ctx ->> 'skip' is not null then
      update ops.notification_queue q
         set email_state = case when q.email_state = 'pending' then 'skipped' else q.email_state end,
             push_state = case when q.push_state = 'pending' then 'skipped' else q.push_state end,
             skip_reason = v_ctx ->> 'skip', locked_until = null,
             failed_at = case when 'sent' in (coalesce(q.email_state, ''), coalesce(q.push_state, '')) then null else v_now end,
             sent_at = case when 'sent' in (coalesce(q.email_state, ''), coalesce(q.push_state, '')) then v_now end
       where q.id = r.id;
      continue;
    end if;

    v_do_email := coalesce(r.email_state = 'pending', false);
    v_do_push := false;
    v_targets := '[]'::jsonb;

    if r.push_state = 'pending' and coalesce(r.push_not_before, r.not_before) <= v_now then
      v_push_ok := r.user_id is not null
        and ops.setting_bool('notify.push_enabled')
        and app.has_consent(r.user_id, 'push');
      if v_push_ok then
        select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)
                                  order by s.created_at), '[]'::jsonb)
          into v_targets
          from app.push_subscriptions s where s.user_id = r.user_id;
        v_push_ok := jsonb_array_length(v_targets) > 0;
      end if;

      if not v_push_ok then
        -- Kein Push möglich: überspringen; war nur Push vorgesehen, geht die Nachricht per E-Mail.
        update ops.notification_queue q
           set push_state = 'skipped',
               email_state = coalesce(q.email_state, 'pending')
         where q.id = r.id;
        perform ops.log_notification(r.user_id, 'push', r.template, null, 'webpush', null, 'skipped');
        if r.email_state is null then
          v_do_email := true;
        end if;
        v_targets := '[]'::jsonb;
      elsif v_quiet_end is not null and not r.is_safety then
        -- Ruhezeit: Push später, E-Mail sofort.
        update ops.notification_queue q set push_not_before = v_quiet_end where q.id = r.id;
        v_targets := '[]'::jsonb;
      else
        v_do_push := true;
      end if;
    end if;

    if v_do_email or v_do_push then
      update ops.notification_queue q
         set locked_until = v_now + make_interval(secs => greatest(coalesce(p_lock_seconds, 120), 10))
       where q.id = r.id;
      id := r.id;
      template := r.template;
      do_email := v_do_email;
      do_push := v_do_push;
      is_safety := r.is_safety;
      user_id := r.user_id;
      context := v_ctx;
      push_targets := case when v_do_push then v_targets else '[]'::jsonb end;
      return next;
    else
      perform ops.notify_finish_if_done(r.id);
    end if;
  end loop;
end;
$$;
comment on function ops.notify_claim(integer, integer) is
  'Holt fällige Nachrichten (for update skip locked), sperrt sie kurz und wendet Ruhezeit und Push-Regeln an.';

-- Ergebnis zurückmelden. Ergebnisse je Kanal: sent | failed | skipped | gone (alle Push-Abos ungültig) | null (nicht versucht).
create or replace function ops.notify_complete(p_id bigint, p_email_result text default null, p_push_result text default null,
  p_error text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  r ops.notification_queue;
  v_failed boolean := false;
  v_max integer := ops.setting_int('notify.max_attempts');
  v_attempts integer;
  v_email text;
  v_push text;
begin
  select * into r from ops.notification_queue q where q.id = p_id for update;
  if not found then
    return 'unknown';
  end if;
  v_failed := coalesce(p_email_result = 'failed', false) or coalesce(p_push_result = 'failed', false);
  v_attempts := r.attempts + case when v_failed then 1 else 0 end;

  v_email := r.email_state;
  if r.email_state = 'pending' and p_email_result is not null then
    v_email := case p_email_result
      when 'sent' then 'sent'
      when 'skipped' then 'skipped'
      when 'failed' then case when v_attempts >= v_max then 'failed' else 'pending' end
      else r.email_state end;
  end if;

  v_push := r.push_state;
  if r.push_state = 'pending' and p_push_result is not null then
    v_push := case p_push_result
      when 'sent' then 'sent'
      when 'skipped' then 'skipped'
      when 'gone' then 'skipped'
      when 'failed' then case when v_attempts >= v_max then 'failed' else 'pending' end
      else r.push_state end;
    -- Alle Abos ungültig und nur Push vorgesehen: Ersatzweg E-Mail.
    if p_push_result in ('gone', 'skipped') and v_email is null then
      v_email := 'pending';
    end if;
  end if;

  update ops.notification_queue q
     set email_state = v_email,
         push_state = v_push,
         attempts = v_attempts,
         last_error = case when v_failed then left(p_error, 500) else q.last_error end,
         locked_until = null,
         not_before = case when v_failed then app.now() + make_interval(mins => ops.setting_int('notify.retry_minutes') * v_attempts)
                           else q.not_before end
   where q.id = p_id;
  perform ops.notify_finish_if_done(p_id);
  select * into r from ops.notification_queue q where q.id = p_id;
  if r.sent_at is not null then
    -- z. B. Zeitstempel „Reservierung verschickt“ (Migration 0520)
    perform ops.notify_after_sent(p_id);
  end if;
  return case when r.sent_at is not null then 'sent' when r.failed_at is not null then 'failed' else 'pending' end;
end;
$$;
comment on function ops.notify_complete(bigint, text, text, text) is
  'Versandergebnis je Kanal speichern; Fehler → neuer Versuch nach notify.retry_minutes × Versuch, nach notify.max_attempts aufgeben.';

-- Ergebnis je Push-Abo: 404/410 → Abo löschen, Erfolg → Zeitstempel, sonst Fehlerzähler.
create or replace function ops.push_subscription_result(p_endpoint text, p_status integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status in (404, 410) then
    delete from app.push_subscriptions where endpoint = p_endpoint;
    return 'removed';
  elsif p_status between 200 and 299 then
    update app.push_subscriptions set last_success_at = app.now(), failures = 0 where endpoint = p_endpoint;
    return 'ok';
  else
    update app.push_subscriptions set failures = failures + 1 where endpoint = p_endpoint;
    -- Dauerhaft kaputte Abos aufräumen
    delete from app.push_subscriptions where endpoint = p_endpoint and failures >= 20;
    return 'failed';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Push-Abos (Web-App). Signatur identisch mit der Web-App-Migration (M2); diese Fassung
-- ersetzt sie und prüft die Schlüssel zusätzlich auf das richtige Format.
-- ---------------------------------------------------------------------------
create or replace function api.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_platform text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_status text;
  v_id uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  select a.status into v_status from app.accounts a where a.user_id = uid;
  if v_status is null then
    raise exception 'Kein Mitgliedskonto' using errcode = '42501', hint = 'no_account';
  elsif v_status = 'closed' then
    raise exception 'Konto geschlossen' using errcode = '42501', hint = 'account_closed';
  end if;
  if not app.has_consent(uid, 'push') then
    raise exception 'Einwilligung push fehlt' using errcode = '42501', hint = 'consent_missing';
  end if;
  -- endpoint: https-Adresse des Push-Dienstes; p256dh: 65 Byte (87 Zeichen base64url); auth: 16 Byte (22 Zeichen).
  if p_endpoint is null or p_endpoint !~ '^https://[^\s/]+/\S*$' or char_length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{86,88}={0,2}$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{21,24}={0,2}$' then
    raise exception 'Ungültiges Abo' using errcode = '22023', hint = 'invalid_subscription';
  end if;
  if p_platform is not null and p_platform not in ('ios', 'android', 'desktop') then
    raise exception 'Ungültige Plattform' using errcode = '22023', hint = 'invalid_platform';
  end if;
  -- Gerät wechselt die Person: altes Abo entfernen.
  delete from app.push_subscriptions where endpoint = p_endpoint and user_id <> uid;
  insert into app.push_subscriptions (user_id, endpoint, p256dh, auth, platform)
  values (uid, p_endpoint, rtrim(p_p256dh, '='), rtrim(p_auth, '='), p_platform)
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh, auth = excluded.auth, platform = excluded.platform, failures = 0
  returning id into v_id;
  return v_id;
end;
$$;
comment on function api.save_push_subscription(text, text, text, text) is
  'Speichert ein Web-Push-Abo der angemeldeten Person (nur mit Einwilligung push).';
grant execute on function api.save_push_subscription(text, text, text, text) to authenticated;

create or replace function api.delete_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  delete from app.push_subscriptions where endpoint = p_endpoint and user_id = uid;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
comment on function api.delete_push_subscription(text) is 'Entfernt ein eigenes Push-Abo (z. B. beim Abmelden auf diesem Gerät).';
grant execute on function api.delete_push_subscription(text) to authenticated;

create or replace function api.my_push_subscriptions()
returns table (id uuid, platform text, created_at timestamptz, last_success_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.platform, s.created_at, s.last_success_at
  from app.push_subscriptions s where s.user_id = auth.uid() order by s.created_at;
$$;
comment on function api.my_push_subscriptions() is 'Eigene Push-Abos ohne Adressen und Schlüssel (für die Einstellungen).';
grant execute on function api.my_push_subscriptions() to authenticated;

-- ---------------------------------------------------------------------------
-- Anstoß des Versands aus der Datenbank (pg_cron → pg_net → notify-dispatch).
-- Nur wenn notify.dispatch_url gesetzt ist und das Geheimnis in Vault liegt.
-- ---------------------------------------------------------------------------
create or replace function ops.notify_kick()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := ops.setting_text('notify.dispatch_url');
  v_secret text;
begin
  if v_url is null or v_url = '' then
    return false;
  end if;
  if not exists (select 1 from ops.notification_queue q
                  where q.sent_at is null and q.failed_at is null and q.not_before <= app.now()
                    and (q.locked_until is null or q.locked_until <= app.now())) then
    return false;
  end if;
  select ds.decrypted_secret into v_secret from vault.decrypted_secrets ds where ds.name = 'fermata_notify_dispatch_secret';
  if v_secret is null then
    raise notice 'notify_kick: Geheimnis fermata_notify_dispatch_secret fehlt in Vault';
    return false;
  end if;
  -- pg_net ist optional; dynamisch aufrufen, damit die Funktion auch ohne Erweiterung entsteht.
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    using v_url, '{}'::jsonb,
          jsonb_build_object('content-type', 'application/json', 'x-fermata-dispatch-secret', v_secret);
  return true;
exception when undefined_function or invalid_schema_name then
  raise notice 'notify_kick: pg_net ist nicht eingerichtet';
  return false;
end;
$$;
comment on function ops.notify_kick() is 'Stößt notify-dispatch über pg_net an, wenn fällige Nachrichten warten.';
