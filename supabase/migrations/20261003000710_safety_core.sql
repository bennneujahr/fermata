-- Fermata · M7 Sicherheit, Teil 1: Melden überall, vorläufige Sperre, Widerspruch, Abend teilen,
-- Check-in, Hilfe-Knopf, eigener Mail-Ausgang für Sicherheitsnachrichten.
-- PLAN 1 Nr. 9, M7. Standards in Klartext: docs/bereiche/sicherheit.md.

-- ---------------------------------------------------------------------------
-- Einstellungen
-- ---------------------------------------------------------------------------
insert into ops.app_settings (key, value, description, category, is_public) values
  ('safety.admin_alert_email', '"sicherheit@fermata.example"',
   'PLATZHALTER: Adresse für Sofort-Hinweise an Benn (Hilfe beim Check-in, akute Meldungen).', 'sicherheit', false),
  ('safety.admin_alert_min_severity', '"hoch"', 'Ab dieser Stufe geht ein Hinweis zusätzlich per Mail an Benn (niedrig, mittel, hoch, akut).', 'sicherheit', false),
  ('safety.report_rate_limit_per_day', '5', 'Höchstens so viele Meldungen je Person in 24 Stunden.', 'sicherheit', false),
  ('safety.zero_tolerance_categories', '["uebergriff", "bedrohung", "minderjaehrig"]',
   'Null-Toleranz: Diese Meldungen sperren die gemeldete Person sofort vorläufig (wenn beide sich über Fermata kennen).', 'sicherheit', false),
  ('safety.ambulance_number', '"112"', 'Notruf Rettungsdienst und Feuerwehr.', 'sicherheit', true),
  ('safety.telefonseelsorge_numbers', '["0800 111 0 111", "0800 111 0 222", "116 123"]',
   'TelefonSeelsorge, kostenfrei. Vor dem Start erneut prüfen (M9).', 'sicherheit', true),
  ('safety.telefonseelsorge_hours', '"rund um die Uhr, kostenfrei"', 'Erreichbarkeit der TelefonSeelsorge.', 'sicherheit', true),
  ('safety.hilfetelefon_gewalt_number', '"116 016"', 'Hilfetelefon „Gewalt gegen Frauen“. Vor dem Start erneut prüfen (M9).', 'sicherheit', true),
  ('safety.hilfetelefon_gewalt_hours', '"rund um die Uhr, kostenfrei, auf Wunsch anonym"', 'Erreichbarkeit des Hilfetelefons.', 'sicherheit', true),
  ('safety.trust_view_base_url', '"https://app.fermata.example/functions/v1/trust-view"',
   'PLATZHALTER (Frage A3): Adresse der öffentlichen Seite „Abend teilen“ (Edge Function trust-view).', 'sicherheit', false),
  ('safety.trust_shares_per_evening', '3', 'Höchstens so viele aktive Links „Abend teilen“ je Person und Abend.', 'sicherheit', false),
  ('safety.no_show_flag_threshold', '2', 'PLATZHALTER (Frage B9): Ab so vielen Nichterscheinen bekommt Benn einen Hinweis.', 'sicherheit', false),
  ('safety.mail_max_attempts', '5', 'Sicherheits-Mails: so viele Zustellversuche.', 'sicherheit', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Zustandsautomat: Fermata kann jeden noch offenen Abend absagen (Sicherheit, Widerruf).
-- ---------------------------------------------------------------------------
insert into app.evening_transitions (from_state, event, to_state, actor) values
  ('proposed',       'cancel_admin', 'declined', 'admin'),
  ('time_requested', 'cancel_admin', 'declined', 'admin'),
  ('time_countered', 'cancel_admin', 'declined', 'admin')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Tabellen ergänzen
-- ---------------------------------------------------------------------------
alter table safety.sanctions add column previous_account_status text;
comment on column safety.sanctions.previous_account_status is 'Kontostatus vor der Sperre (wird beim Aufheben wiederhergestellt).';
alter table safety.reports add column related boolean;
comment on column safety.reports.related is 'true: meldende und gemeldete Person kennen sich über Fermata (gemeinsamer Abend oder Vorschlag).';
create index reports_reporter_idx on safety.reports (reporter, created_at desc);
create index sanctions_report_idx on safety.sanctions (report_id);
create unique index appeals_once_per_sanction on safety.appeals (sanction_id);
alter table safety.blocklist
  add column sanction_id uuid references safety.sanctions (id) on delete set null,
  add column note text;
comment on column safety.blocklist.note is 'z. B. „doc_hash aus Ausweisprüfung nachtragen“, wenn bei der Prüfung kein Hash gespeichert wurde.';

-- Bei der Ausweisprüfung gespeicherte Sperrlisten-Hashes (PLAN 2.2: „Sperrlisten-Hash“).
-- Schreibt die Didit-Function (M2) nach erfolgreicher Prüfung; ein späterer Ausschluss sperrt damit auch den Ausweis.
create table safety.verification_hashes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc_hash text,
  name_hash text,
  created_at timestamptz not null default now()
);
comment on table safety.verification_hashes is
  'HMAC(Ausweisnummer + Geburtsdatum) und HMAC(Name + Geburtsdatum) aus der Ausweisprüfung, nur für einen späteren Ausschluss. Wird mit dem Konto gelöscht.';
alter table safety.verification_hashes enable row level security;

-- Mail-Ausgang für Sicherheitsnachrichten (eigener, kleiner Ausgang; Versand: Edge Function safety-dispatch).
-- Keine Adressen und keine Namen in data: die Adresse wird erst beim Versand aufgelöst.
create table safety.mail_queue (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  recipient_user uuid references auth.users (id) on delete cascade,
  to_admin boolean not null default false,
  template text not null,
  data jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  locked_until timestamptz,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  check (to_admin or recipient_user is not null)
);
comment on table safety.mail_queue is 'Sicherheits-Mails (Meldung erhalten, Abend fällt aus, Sperre, Hinweise an Benn). Versand über safety-dispatch.';
create index mail_queue_pending_idx on safety.mail_queue (id) where sent_at is null;
alter table safety.mail_queue enable row level security;

create table safety.checkins (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null references app.evenings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('gut', 'unsicher', 'hilfe')),
  created_at timestamptz not null default now()
);
comment on table safety.checkins is 'Antworten auf den Check-in nach Beginn des Abends.';
create index checkins_evening_idx on safety.checkins (evening_id, created_at);
alter table safety.checkins enable row level security;

grant select, insert, update, delete on safety.verification_hashes, safety.mail_queue, safety.checkins to service_role;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------
create or replace function safety.severity_rank(p text)
returns integer
language sql
immutable
set search_path = ''
as $$ select case p when 'niedrig' then 1 when 'mittel' then 2 when 'hoch' then 3 when 'akut' then 4 else 0 end; $$;

create or replace function safety.category_severity(p_category text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when ops.setting('safety.zero_tolerance_categories') ? p_category then 'akut'
    when p_category in ('belaestigung', 'diskriminierung', 'falsche_identitaet', 'betrug') then 'hoch'
    when p_category in ('nicht_erschienen', 'unangenehm') then 'mittel'
    else 'mittel'
  end;
$$;

create or replace function safety.category_label(p_category text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_category
    when 'uebergriff' then 'Übergriff'
    when 'bedrohung' then 'Bedrohung'
    when 'belaestigung' then 'Belästigung'
    when 'diskriminierung' then 'Diskriminierung'
    when 'minderjaehrig' then 'Verdacht auf Minderjährigkeit'
    when 'falsche_identitaet' then 'Falsche Identität'
    when 'betrug' then 'Betrug'
    when 'nicht_erschienen' then 'Nicht erschienen'
    when 'unangenehm' then 'Unangenehmes Verhalten'
    else 'Sonstiges'
  end;
$$;

create or replace function safety.enqueue_mail(p_user uuid, p_to_admin boolean, p_template text, p_data jsonb default '{}'::jsonb)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into safety.mail_queue (recipient_user, to_admin, template, data)
  values (p_user, coalesce(p_to_admin, false), p_template, coalesce(p_data, '{}'::jsonb))
  returning id;
$$;

-- Nach dem Abschluss der Transaktion sofort versenden lassen (pg_net, wenn eingerichtet; sonst Cron).
create or replace function safety.kick_dispatch()
returns boolean
language sql
security definer
set search_path = ''
as $$ select billing.invoke_internal('safety-dispatch'); $$;

-- Hinweis für Benn; ab safety.admin_alert_min_severity auch per Mail.
create or replace function safety.raise_flag(p_user uuid, p_source text, p_kind text, p_severity text, p_details jsonb default '{}'::jsonb,
  p_notify boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  fid uuid;
begin
  insert into safety.safety_flags (user_id, source, kind, severity, details, created_at)
  values (p_user, p_source, p_kind, p_severity, coalesce(p_details, '{}'::jsonb), app.now())
  returning id into fid;
  if p_notify and safety.severity_rank(p_severity) >= safety.severity_rank(ops.setting_text('safety.admin_alert_min_severity')) then
    perform safety.enqueue_mail(null, true, 'safety.admin_alert',
      jsonb_build_object('flag_id', fid, 'kind', p_kind, 'severity', p_severity) || coalesce(p_details, '{}'::jsonb));
  end if;
  return fid;
end;
$$;

-- Kennen sich zwei Personen über Fermata? (gemeinsamer Abend oder ein ihnen gezeigter Vorschlag)
create or replace function safety.are_related(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select a is not null and b is not null and a <> b and (
    exists (select 1 from app.evenings e where e.user_a = least(a, b) and e.user_b = greatest(a, b))
    or exists (select 1 from app.pairings p where p.user_a = least(a, b) and p.user_b = greatest(a, b)
               and p.status in ('proposed', 'declined', 'expired', 'completed', 'cancelled')));
$$;

-- Alle noch nicht begonnenen Abende einer Person absagen und das Gegenüber neutral benachrichtigen.
create or replace function safety.cancel_open_evenings(p_user uuid, p_source text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  other uuid;
  n integer := 0;
begin
  for e in
    select ev.id, ev.user_a, ev.user_b, ev.state, ev.starts_at, v.name as venue_name
    from app.evenings ev left join app.venues v on v.id = ev.venue_id
    where p_user in (ev.user_a, ev.user_b)
      and (ev.state in ('proposed', 'time_requested', 'time_countered')
           or (ev.state = 'confirmed' and (ev.starts_at is null or ev.starts_at > app.now())))
    order by ev.created_at
  loop
    perform app.evening_transition(e.id, 'cancel_admin', null,
      jsonb_build_object('source', p_source, 'notify_by', 'safety'));
    other := case when e.user_a = p_user then e.user_b else e.user_a end;
    perform safety.enqueue_mail(other, false, 'safety.evening_cancelled', jsonb_build_object(
      'evening_id', e.id, 'starts_at', e.starts_at, 'venue_name', e.venue_name, 'was_confirmed', e.state = 'confirmed'));
    n := n + 1;
  end loop;
  return n;
end;
$$;
comment on function safety.cancel_open_evenings(uuid, text) is
  'Sagt offene und bevorstehende Abende über cancel_admin ab. Das Gegenüber erfährt keinen Grund. Details source/notify_by für M5.';

create or replace function safety.suspend_account(p_user uuid, p_source text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app.accounts set status = 'suspended' where user_id = p_user and status <> 'suspended';
  return safety.cancel_open_evenings(p_user, p_source);
end;
$$;

-- Konto wieder freigeben, wenn keine sperrende Sanktion mehr gilt.
create or replace function safety.restore_account(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev text;
begin
  if safety.is_suspended(p_user) then
    return false;
  end if;
  select s.previous_account_status into prev from safety.sanctions s
  where s.user_id = p_user and s.previous_account_status is not null and s.previous_account_status <> 'suspended'
  order by s.created_at desc limit 1;
  update app.accounts set status = coalesce(prev, 'active') where user_id = p_user and status = 'suspended';
  return found;
end;
$$;

-- Vorläufige Sperre (Null-Toleranz): sofort, ohne Prüfung; Benn prüft danach.
create or replace function safety.provisional_suspend(p_user uuid, p_report_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  prev text;
  cancelled integer;
begin
  select s.id into sid from safety.sanctions s
  where s.user_id = p_user and s.kind = 'vorlaeufige_sperre' and s.lifted_at is null limit 1;
  if sid is not null then
    return sid; -- schon vorläufig gesperrt
  end if;
  select a.status into prev from app.accounts a where a.user_id = p_user;
  insert into safety.sanctions (user_id, kind, reason, report_id, starts_at, created_at, previous_account_status)
  values (p_user, 'vorlaeufige_sperre', 'Vorläufige Sperre, bis wir einen Hinweis geprüft haben.', p_report_id,
          app.now(), app.now(), prev)
  returning id into sid;
  cancelled := safety.suspend_account(p_user, 'sicherheit');
  -- Hinweis ohne eigene Mail: die Mail zur Meldung nennt die vorläufige Sperre bereits.
  perform safety.raise_flag(p_user, 'report', 'vorlaeufige_sperre', 'akut',
    jsonb_build_object('report_id', p_report_id, 'sanction_id', sid, 'cancelled_evenings', cancelled), false);
  perform safety.enqueue_mail(p_user, false, 'safety.account_suspended', jsonb_build_object('provisional', true));
  perform ops.audit('safety.provisional_suspension', 'safety.sanctions', sid::text,
    jsonb_build_object('report_id', p_report_id, 'cancelled_evenings', cancelled));
  return sid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Melden überall
-- ---------------------------------------------------------------------------
create or replace function api.report(
  p_context text, p_category text, p_reported_user uuid default null, p_evening_id uuid default null,
  p_description text default null, p_wants_contact boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings;
  is_related boolean := false;
  sev text;
  rid uuid;
  due timestamptz;
  recent integer;
  suspended boolean := false;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  if p_context is null or p_context not in ('abend', 'termin', 'gespraech', 'rueckmeldung', 'konto', 'sonstiges') then
    raise exception 'Unbekannter Bereich' using errcode = '22023', hint = 'invalid_context';
  end if;
  if p_category is null or p_category not in ('uebergriff', 'bedrohung', 'belaestigung', 'diskriminierung', 'minderjaehrig',
      'falsche_identitaet', 'betrug', 'nicht_erschienen', 'unangenehm', 'sonstiges') then
    raise exception 'Unbekannte Art der Meldung' using errcode = '22023', hint = 'invalid_category';
  end if;
  if p_description is not null and char_length(p_description) > 4000 then
    raise exception 'Die Beschreibung ist zu lang (höchstens 4000 Zeichen).' using errcode = '22023', hint = 'description_too_long';
  end if;
  if p_reported_user is not null and p_reported_user = uid then
    raise exception 'Sie können sich nicht selbst melden.' using errcode = '22023', hint = 'self_report';
  end if;
  if p_evening_id is not null then
    select * into e from app.evenings where id = p_evening_id;
    if not found or uid not in (e.user_a, e.user_b) then
      raise exception 'Abend nicht gefunden' using errcode = 'P0002', hint = 'evening_not_found';
    end if;
    if p_reported_user is not null and p_reported_user not in (e.user_a, e.user_b) then
      raise exception 'Diese Person gehört nicht zu diesem Abend.' using errcode = '42501', hint = 'not_related';
    end if;
  end if;
  if p_reported_user is not null then
    is_related := safety.are_related(uid, p_reported_user);
    if not is_related and p_context <> 'sonstiges' then
      raise exception 'Sie können nur Personen melden, die Sie über Fermata kennen.' using errcode = '42501', hint = 'not_related';
    end if;
  end if;
  select count(*)::integer into recent from safety.reports r
  where r.reporter = uid and r.created_at > app.now() - interval '24 hours';
  if recent >= ops.setting_int('safety.report_rate_limit_per_day') then
    raise exception 'Sie haben heute schon mehrere Meldungen geschickt. Bei akuter Gefahr wählen Sie bitte 110.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;

  sev := safety.category_severity(p_category);
  due := app.now() + make_interval(hours => ops.setting_int('safety.report_response_hours'));
  insert into safety.reports (reporter, reported, evening_id, context, category, description, wants_contact, severity,
                              status, due_at, created_at, related)
  values (uid, p_reported_user, p_evening_id, p_context, p_category, nullif(trim(coalesce(p_description, '')), ''),
          coalesce(p_wants_contact, true), sev, 'open', due, app.now(), is_related)
  returning id into rid;

  -- Null-Toleranz: sofort vorläufig sperren (nur wenn sich beide über Fermata kennen; Schutz vor Missbrauch).
  if p_reported_user is not null and is_related and ops.setting('safety.zero_tolerance_categories') ? p_category then
    perform safety.provisional_suspend(p_reported_user, rid);
    suspended := true;
  end if;

  perform safety.raise_flag(p_reported_user, 'report', 'meldung', sev, jsonb_build_object(
    'report_id', rid, 'category', p_category, 'category_label', safety.category_label(p_category), 'context', p_context,
    'provisional_suspension', suspended, 'due_at', due));
  perform safety.enqueue_mail(uid, false, 'safety.report_received', jsonb_build_object(
    'report_id', rid, 'due_hours', ops.setting_int('safety.report_response_hours'),
    'wants_contact', coalesce(p_wants_contact, true), 'category_label', safety.category_label(p_category)));
  perform ops.audit('safety.report', 'safety.reports', rid::text, jsonb_build_object('severity', sev, 'category', p_category));
  perform safety.kick_dispatch();
  return jsonb_build_object('report_id', rid, 'status', 'open', 'due_at', due, 'severity', sev);
end;
$$;
grant execute on function api.report(text, text, uuid, uuid, text, boolean) to authenticated;

create or replace function api.my_reports()
returns table (id uuid, context text, category text, evening_id uuid, status text, created_at timestamptz, due_at timestamptz,
               resolved_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.context, r.category, r.evening_id, r.status, r.created_at, r.due_at, r.resolved_at
  from safety.reports r where r.reporter = auth.uid() order by r.created_at desc;
$$;
grant execute on function api.my_reports() to authenticated;

-- ---------------------------------------------------------------------------
-- Widerspruch gegen eine Sanktion (einmal je Sanktion)
-- ---------------------------------------------------------------------------
create or replace function api.appeal(p_sanction_id uuid, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s safety.sanctions;
  aid uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  select * into s from safety.sanctions where id = p_sanction_id and user_id = uid;
  if not found then
    raise exception 'Sanktion nicht gefunden' using errcode = 'P0002', hint = 'sanction_not_found';
  end if;
  if s.lifted_at is not null then
    raise exception 'Diese Sanktion ist bereits aufgehoben.' using errcode = 'P0001', hint = 'sanction_lifted';
  end if;
  if p_text is null or char_length(trim(p_text)) < 10 or char_length(p_text) > 4000 then
    raise exception 'Bitte schreiben Sie zwischen 10 und 4000 Zeichen.' using errcode = '22023', hint = 'invalid_text';
  end if;
  begin
    insert into safety.appeals (sanction_id, user_id, text, created_at) values (s.id, uid, trim(p_text), app.now())
    returning id into aid;
  exception when unique_violation then
    raise exception 'Gegen diese Sanktion haben Sie bereits Widerspruch eingelegt.' using errcode = 'P0001', hint = 'already_appealed';
  end;
  perform safety.raise_flag(uid, 'system', 'widerspruch',
    case when s.kind in ('vorlaeufige_sperre', 'sperre', 'ausschluss') then 'hoch' else 'mittel' end,
    jsonb_build_object('appeal_id', aid, 'sanction_id', s.id, 'sanction_kind', s.kind));
  perform safety.enqueue_mail(uid, false, 'safety.appeal_received', jsonb_build_object('appeal_id', aid));
  perform ops.audit('safety.appeal', 'safety.appeals', aid::text, jsonb_build_object('sanction_id', s.id));
  perform safety.kick_dispatch();
  return jsonb_build_object('appeal_id', aid, 'status', 'open');
end;
$$;
grant execute on function api.appeal(uuid, text) to authenticated;

create or replace function api.my_appeals()
returns table (id uuid, sanction_id uuid, status text, created_at timestamptz, decided_at timestamptz, decision_note text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.sanction_id, a.status, a.created_at, a.decided_at, a.decision_note
  from safety.appeals a where a.user_id = auth.uid() order by a.created_at desc;
$$;
grant execute on function api.my_appeals() to authenticated;

-- ---------------------------------------------------------------------------
-- Hilfe-Knopf: Nummern aus den Einstellungen (öffentlich, auch ohne Anmeldung)
-- ---------------------------------------------------------------------------
create or replace function safety.tel(p_number text)
returns text
language sql
immutable
set search_path = ''
as $$ select regexp_replace(coalesce(p_number, ''), '[^0-9+]', '', 'g'); $$;

create or replace function api.help_contacts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'heimwegtelefon', jsonb_build_object('name', 'Heimwegtelefon',
      'number', ops.setting_text('safety.heimwegtelefon_number'), 'tel', safety.tel(ops.setting_text('safety.heimwegtelefon_number')),
      'hours', ops.setting_text('safety.heimwegtelefon_hours'),
      'description', 'Begleitet Sie am Telefon auf dem Heimweg, bis Sie sicher angekommen sind.'),
    'police', jsonb_build_object('name', 'Polizei', 'number', ops.setting_text('safety.emergency_number'),
      'tel', safety.tel(ops.setting_text('safety.emergency_number')), 'hours', 'rund um die Uhr'),
    'emergency', jsonb_build_object('name', 'Notruf (Rettungsdienst, Feuerwehr)', 'number', ops.setting_text('safety.ambulance_number'),
      'tel', safety.tel(ops.setting_text('safety.ambulance_number')), 'hours', 'rund um die Uhr'),
    'telefonseelsorge', jsonb_build_object('name', 'TelefonSeelsorge',
      'numbers', ops.setting('safety.telefonseelsorge_numbers'),
      'tels', (select jsonb_agg(safety.tel(n)) from jsonb_array_elements_text(ops.setting('safety.telefonseelsorge_numbers')) n),
      'hours', ops.setting_text('safety.telefonseelsorge_hours')),
    'hilfetelefon_gewalt', jsonb_build_object('name', 'Hilfetelefon Gewalt gegen Frauen',
      'number', ops.setting_text('safety.hilfetelefon_gewalt_number'), 'tel', safety.tel(ops.setting_text('safety.hilfetelefon_gewalt_number')),
      'hours', ops.setting_text('safety.hilfetelefon_gewalt_hours')),
    'note', 'Bei akuter Gefahr wählen Sie sofort 110.');
$$;
grant execute on function api.help_contacts() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Check-in nach Beginn des Abends (die Nachricht selbst verschickt M5)
-- ---------------------------------------------------------------------------
create or replace function api.checkin_respond(p_evening_id uuid, p_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e record;
  cid uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  if p_status is null or p_status not in ('gut', 'unsicher', 'hilfe') then
    raise exception 'Antwort: gut, unsicher oder hilfe' using errcode = '22023', hint = 'invalid_status';
  end if;
  select ev.id, ev.user_a, ev.user_b, ev.state, ev.starts_at, v.name as venue_name, v.city as venue_city
  into e from app.evenings ev left join app.venues v on v.id = ev.venue_id where ev.id = p_evening_id;
  if e.id is null or uid not in (e.user_a, e.user_b) then
    raise exception 'Abend nicht gefunden' using errcode = 'P0002', hint = 'evening_not_found';
  end if;
  if e.state not in ('confirmed', 'happened') then
    raise exception 'Für diesen Abend ist kein Check-in möglich.' using errcode = 'P0001', hint = 'checkin_not_possible';
  end if;
  insert into safety.checkins (evening_id, user_id, status, created_at) values (e.id, uid, p_status, app.now()) returning id into cid;
  if p_status = 'hilfe' then
    perform safety.raise_flag(uid, 'system', 'checkin_hilfe', 'akut', jsonb_build_object(
      'checkin_id', cid, 'evening_id', e.id, 'starts_at', e.starts_at, 'venue_name', e.venue_name, 'venue_city', e.venue_city));
    perform safety.kick_dispatch();
  elsif p_status = 'unsicher' then
    perform safety.raise_flag(uid, 'system', 'checkin_unsicher', 'hoch', jsonb_build_object(
      'checkin_id', cid, 'evening_id', e.id, 'starts_at', e.starts_at, 'venue_name', e.venue_name, 'venue_city', e.venue_city));
    perform safety.kick_dispatch();
  end if;
  return jsonb_build_object('checkin_id', cid, 'status', p_status,
    'help', case when p_status in ('hilfe', 'unsicher') then api.help_contacts() end);
end;
$$;
grant execute on function api.checkin_respond(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Abend teilen (Link für eine Vertrauensperson)
-- ---------------------------------------------------------------------------
create or replace function api.create_trust_share(p_evening_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings;
  token text;
  exp timestamptz;
  active integer;
  sid uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  select * into e from app.evenings where id = p_evening_id;
  if not found or uid not in (e.user_a, e.user_b) then
    raise exception 'Abend nicht gefunden' using errcode = 'P0002', hint = 'evening_not_found';
  end if;
  if e.state <> 'confirmed' or e.starts_at is null then
    raise exception 'Teilen geht, sobald Ort und Zeit feststehen.' using errcode = 'P0001', hint = 'evening_not_confirmed';
  end if;
  exp := e.starts_at + make_interval(hours => ops.setting_int('safety.trust_share_hours'));
  if exp <= app.now() then
    raise exception 'Dieser Abend liegt zu lange zurück.' using errcode = 'P0001', hint = 'evening_over';
  end if;
  select count(*)::integer into active from app.trust_shares ts
  where ts.evening_id = e.id and ts.user_id = uid and ts.revoked_at is null and ts.expires_at > app.now();
  if active >= ops.setting_int('safety.trust_shares_per_evening') then
    raise exception 'Sie haben diesen Abend schon mehrfach geteilt. Ziehen Sie einen Link zurück, um einen neuen zu erstellen.'
      using errcode = 'P0001', hint = 'too_many_shares';
  end if;
  token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into app.trust_shares (evening_id, user_id, token_hash, created_at, expires_at)
  values (e.id, uid, encode(extensions.digest(token, 'sha256'), 'hex'), app.now(), exp)
  returning id into sid;
  return jsonb_build_object('share_id', sid, 'token', token, 'expires_at', exp,
    'url', ops.setting_text('safety.trust_view_base_url') || '?t=' || token);
end;
$$;
grant execute on function api.create_trust_share(uuid) to authenticated;

create or replace function api.revoke_trust_share(p_share_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  update app.trust_shares set revoked_at = app.now()
  where id = p_share_id and user_id = auth.uid() and revoked_at is null;
  return found;
end;
$$;
grant execute on function api.revoke_trust_share(uuid) to authenticated;

create or replace function api.my_trust_shares(p_evening_id uuid default null)
returns table (id uuid, evening_id uuid, created_at timestamptz, expires_at timestamptz, revoked_at timestamptz, active boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select ts.id, ts.evening_id, ts.created_at, ts.expires_at, ts.revoked_at,
         ts.revoked_at is null and ts.expires_at > app.now()
  from app.trust_shares ts
  where ts.user_id = auth.uid() and (p_evening_id is null or ts.evening_id = p_evening_id)
  order by ts.created_at desc;
$$;
grant execute on function api.my_trust_shares(uuid) to authenticated;

-- Öffentliche Ansicht (nur über die Edge Function trust-view): Lokal, Zeit, eigener Vorname, Heimwegtelefon.
-- Nie Daten des Gegenübers.
create or replace function safety.trust_share_view(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'first_name', f.first_name,
    'starts_at', e.starts_at,
    'expires_at', ts.expires_at,
    'venue', case when v.id is not null then jsonb_build_object('name', v.name, 'street', v.street, 'postal_code', v.postal_code,
      'city', v.city, 'public_transport', v.public_transport) end,
    'heimwegtelefon', jsonb_build_object('number', ops.setting_text('safety.heimwegtelefon_number'),
      'tel', safety.tel(ops.setting_text('safety.heimwegtelefon_number')), 'hours', ops.setting_text('safety.heimwegtelefon_hours')),
    'emergency_number', ops.setting_text('safety.emergency_number'))
  from app.trust_shares ts
  join app.evenings e on e.id = ts.evening_id
  left join app.venues v on v.id = e.venue_id
  left join private.account_facts f on f.user_id = ts.user_id
  where ts.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and ts.revoked_at is null and ts.expires_at > app.now()
    and e.state in ('confirmed', 'happened');
$$;
revoke execute on function safety.trust_share_view(text) from public, anon, authenticated;
grant execute on function safety.trust_share_view(text) to service_role;

-- ---------------------------------------------------------------------------
-- Versand für safety-dispatch
-- ---------------------------------------------------------------------------
create or replace function safety.dispatch_claim(p_limit integer default 50)
returns table (id bigint, template text, data jsonb, recipient text, recipient_user uuid, to_admin boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select q.id from safety.mail_queue q
    where q.sent_at is null and q.attempts < ops.setting_int('safety.mail_max_attempts')
      and (q.locked_until is null or q.locked_until < now())
    order by q.id
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update skip locked
  ), claimed as (
    update safety.mail_queue q set attempts = q.attempts + 1, locked_until = now() + interval '5 minutes'
    from picked where q.id = picked.id
    returning q.id, q.template, q.data, q.recipient_user, q.to_admin
  )
  select c.id, c.template, c.data,
         case when c.to_admin then ops.setting_text('safety.admin_alert_email') else u.email::text end,
         c.recipient_user, c.to_admin
  from claimed c left join auth.users u on u.id = c.recipient_user
  order by c.id;
end;
$$;

create or replace function safety.dispatch_done(p_id bigint, p_provider_id text, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update safety.mail_queue set
    sent_at = case when p_error is null then now() else sent_at end,
    provider_id = coalesce(p_provider_id, provider_id),
    last_error = p_error,
    locked_until = null
  where id = p_id;
$$;

-- Abgelaufene befristete Sperren aufheben und das Konto wieder freigeben (stündlich).
-- Berührt nur Konten mit einer abgelaufenen Sanktion (andere Sperrgründe, z. B. aus M2, bleiben unangetastet).
create or replace function safety.release_expired_sanctions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  n integer := 0;
begin
  for s in
    update safety.sanctions sa set lifted_at = app.now(), lift_reason = 'Frist abgelaufen'
    where sa.lifted_at is null and sa.ends_at is not null and sa.ends_at <= app.now()
      and sa.kind in ('vorlaeufige_sperre', 'sperre', 'ausschluss')
    returning sa.user_id, sa.id
  loop
    if safety.restore_account(s.user_id) then
      perform safety.enqueue_mail(s.user_id, false, 'safety.sanction_lifted', jsonb_build_object('reason', 'abgelaufen'));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fermata-safety-release', '23 * * * *', 'select safety.release_expired_sanctions()');
    perform cron.schedule('fermata-safety-dispatch', '* * * * *',
      'select safety.kick_dispatch() where exists (select 1 from safety.mail_queue where sent_at is null)');
  end if;
exception when others then
  raise notice 'pg_cron für die Sicherheit nicht eingerichtet: %', sqlerrm;
end
$$;
