-- Fermata · Abende als Zustandsautomat, Fristen, Rückmeldungen, Kontakttausch, Blockieren,
-- Push-Abos, „Abend teilen“. PLAN 2.3 Nr. 6, 3.2 Nr. 13, M5.

create table app.evenings (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null unique references app.pairings (id) on delete cascade,
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  venue_id uuid references app.venues (id) on delete set null,
  slot_id uuid references app.venue_slots (id) on delete set null,
  state text not null default 'proposed' check (state in (
    'proposed', 'time_requested', 'time_countered', 'confirmed',
    'happened', 'cancelled_early', 'cancelled_late', 'no_show', 'lapsed', 'declined')),
  -- Zeitabstimmung
  proposed_times jsonb not null default '[]'::jsonb,   -- Vorschläge aus gemeinsamen Fenstern
  requested_by uuid references auth.users (id),
  requested_times jsonb not null default '[]'::jsonb,  -- Wunschzeiten der ersten Person
  countered_by uuid references auth.users (id),
  countered_times jsonb not null default '[]'::jsonb,  -- Alternative der zweiten Person
  starts_at timestamptz,
  confirmed_at timestamptz,
  -- Ende
  cancelled_by uuid references auth.users (id),
  cancel_reason text check (cancel_reason is null or cancel_reason in ('krank', 'termin', 'kein_interesse', 'sicherheit', 'lokal', 'sonstiges')),
  no_show_user uuid references auth.users (id),
  reservation_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_a < user_b)
);
comment on table app.evenings is 'Ein verabredeter Abend. Zustandswechsel nur über app.evening_transition().';
create trigger evenings_touch before update on app.evenings for each row execute function app.touch_updated_at();
create index evenings_users_idx on app.evenings (user_a, user_b);
create index evenings_state_idx on app.evenings (state, starts_at);
alter table app.evenings enable row level security;
grant select on app.evenings to authenticated;
create policy evenings_participant on app.evenings for select to authenticated
  using (auth.uid() in (user_a, user_b) or app.is_admin());

-- Erlaubte Zustandswechsel als Daten (testbar, im Admin lesbar).
create table app.evening_transitions (
  from_state text not null,
  event text not null,
  to_state text not null,
  actor text not null check (actor in ('teilnehmer', 'system', 'admin')),
  primary key (from_state, event)
);
comment on table app.evening_transitions is 'Zustandsautomat der Abende. Was hier fehlt, lehnt die Datenbank ab.';
insert into app.evening_transitions (from_state, event, to_state, actor) values
  ('proposed',       'request_time', 'time_requested',  'teilnehmer'),
  ('proposed',       'decline',      'declined',        'teilnehmer'),
  ('proposed',       'lapse',        'lapsed',          'system'),
  ('time_requested', 'counter',      'time_countered',  'teilnehmer'),
  ('time_requested', 'confirm',      'confirmed',       'teilnehmer'),
  ('time_requested', 'decline',      'declined',        'teilnehmer'),
  ('time_requested', 'lapse',        'lapsed',          'system'),
  ('time_countered', 'counter',      'time_requested',  'teilnehmer'),
  ('time_countered', 'confirm',      'confirmed',       'teilnehmer'),
  ('time_countered', 'decline',      'declined',        'teilnehmer'),
  ('time_countered', 'lapse',        'lapsed',          'system'),
  ('confirmed',      'cancel_early', 'cancelled_early', 'teilnehmer'),
  ('confirmed',      'cancel_late',  'cancelled_late',  'teilnehmer'),
  ('confirmed',      'happened',     'happened',        'system'),
  ('confirmed',      'no_show',      'no_show',         'system'),
  ('confirmed',      'cancel_admin', 'cancelled_early', 'admin');
alter table app.evening_transitions enable row level security;
grant select on app.evening_transitions to authenticated;
create policy evening_transitions_read on app.evening_transitions for select to authenticated using (true);

create table app.evening_events (
  id bigint generated always as identity primary key,
  evening_id uuid not null references app.evenings (id) on delete cascade,
  at timestamptz not null default now(),
  actor uuid,
  event text not null,
  from_state text,
  to_state text,
  details jsonb not null default '{}'::jsonb
);
comment on table app.evening_events is 'Verlauf jedes Abends. Nur anhängen.';
create index evening_events_evening_idx on app.evening_events (evening_id, at);
create trigger evening_events_no_update before update on app.evening_events for each row execute function ops.forbid_change();
alter table app.evening_events enable row level security;

create table app.evening_deadlines (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null references app.evenings (id) on delete cascade,
  kind text not null check (kind in ('time_request', 'time_answer', 'reminder', 'checkin', 'feedback', 'reservation')),
  due_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  done_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table app.evening_deadlines is 'Fristen und geplante Nachrichten. Ein Cron-Job prüft alle evening.deadline_check_minutes Minuten.';
create index evening_deadlines_due_idx on app.evening_deadlines (due_at) where done_at is null and cancelled_at is null;
alter table app.evening_deadlines enable row level security;

-- Zentrale Übergangsfunktion: prüft Wechsel gegen app.evening_transitions und protokolliert.
-- Nebenwirkungen (Fristen, Kontingent, Mails) ergänzt die M5-Migration über app.evening_after_transition().
create or replace function app.evening_after_transition(p_evening app.evenings, p_event text, p_from text, p_actor uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Platzhalter; wird in M5 ersetzt (Fristen, Kontingent-Buch, Benachrichtigungen).
  return;
end;
$$;


-- Direkte Zustandsänderungen sperren (nur über die Übergangsfunktion).
create or replace function app.guard_evening_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- app.evening_transition() setzt die Transaktionsvariable nur für ihren eigenen UPDATE.
  if new.state is distinct from old.state
     and coalesce(current_setting('fermata.evening_transition', true), '') <> 'on' then
    raise exception 'Zustand nur über app.evening_transition() ändern' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger evenings_state_guard before update of state on app.evenings
  for each row execute function app.guard_evening_state();

-- Die Übergangsfunktion setzt die Transaktionsvariable für genau ihren eigenen UPDATE.
create or replace function app.evening_transition(p_evening_id uuid, p_event text, p_actor uuid default null, p_details jsonb default '{}'::jsonb)
returns app.evenings
language plpgsql
security definer
set search_path = ''
as $$
declare
  e app.evenings;
  t app.evening_transitions;
  from_state text;
begin
  select * into e from app.evenings where id = p_evening_id for update;
  if not found then
    raise exception 'Abend nicht gefunden' using errcode = 'no_data_found';
  end if;
  select * into t from app.evening_transitions tr where tr.from_state = e.state and tr.event = p_event;
  if not found then
    raise exception 'Unerlaubter Wechsel: % → %', e.state, p_event using errcode = 'check_violation';
  end if;
  if t.actor = 'teilnehmer' and (p_actor is null or p_actor not in (e.user_a, e.user_b)) then
    raise exception 'Nur Beteiligte dürfen das' using errcode = 'insufficient_privilege';
  end if;
  from_state := e.state;
  perform set_config('fermata.evening_transition', 'on', true);
  update app.evenings set state = t.to_state where id = e.id returning * into e;
  perform set_config('fermata.evening_transition', 'off', true);
  insert into app.evening_events (evening_id, actor, event, from_state, to_state, details)
  values (e.id, p_actor, p_event, from_state, t.to_state, coalesce(p_details, '{}'::jsonb));
  perform app.evening_after_transition(e, p_event, from_state, p_actor, coalesce(p_details, '{}'::jsonb));
  return e;
end;
$$;
comment on function app.evening_transition(uuid, text, uuid, jsonb) is 'Einziger Weg, den Zustand eines Abends zu ändern.';

-- ---------------------------------------------------------------------------
-- Rückmeldung am nächsten Tag: das Gegenüber sieht sie nie.
-- ---------------------------------------------------------------------------
create table app.feedback (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null references app.evenings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  attended boolean not null,
  other_attended boolean,
  wants_contact boolean not null default false,  -- „Ja“ zum freiwilligen Kontakttausch
  would_meet_again text check (would_meet_again is null or would_meet_again in ('ja', 'nein', 'vielleicht')),
  felt_safe boolean,
  venue_rating smallint check (venue_rating is null or venue_rating between 1 and 5),
  match_quality smallint check (match_quality is null or match_quality between 1 and 5),
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  unique (evening_id, user_id)
);
comment on table app.feedback is 'Rückmeldung je Person und Abend. Nie für das Gegenüber sichtbar; Benn sieht sie.';
alter table app.feedback enable row level security;
grant select on app.feedback to authenticated;
create policy feedback_own on app.feedback for select to authenticated using (user_id = auth.uid() or app.is_admin());

-- Kontakttausch nur bei beidseitigem Ja; jede Seite wählt, was sie teilt.
create table app.contact_shares (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null references app.evenings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  share_email boolean not null default false,
  share_phone boolean not null default false,
  consented_at timestamptz not null default now(),
  released_at timestamptz,   -- gesetzt, sobald beide Ja gesagt haben
  unique (evening_id, user_id)
);
comment on table app.contact_shares is 'Freiwilliger Kontakttausch nach beidseitigem Ja (Einwilligung kontakttausch).';
alter table app.contact_shares enable row level security;
grant select on app.contact_shares to authenticated;
create policy contact_shares_own on app.contact_shares for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Blockieren, Push-Abos, Abend teilen
-- ---------------------------------------------------------------------------
create table app.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
comment on table app.blocks is 'Diese beiden werden nie wieder zusammen vorgeschlagen.';
alter table app.blocks enable row level security;
grant select on app.blocks to authenticated;
create policy blocks_own on app.blocks for select to authenticated using (blocker = auth.uid());
grant select on app.blocks to fermata_matcher;
create policy blocks_matcher_read on app.blocks for select to fermata_matcher using (true);

create or replace function app.is_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app.blocks x where (x.blocker = a and x.blocked = b) or (x.blocker = b and x.blocked = a));
$$;
grant execute on function app.is_blocked(uuid, uuid) to service_role, fermata_matcher;

create table app.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text check (platform is null or platform in ('ios', 'android', 'desktop')),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failures integer not null default 0
);
comment on table app.push_subscriptions is 'Web-Push-Abos. Nachrichten kurz und ohne Namen (laufen über Apple/Google/Mozilla).';
alter table app.push_subscriptions enable row level security;
grant select, delete on app.push_subscriptions to authenticated;
create policy push_subscriptions_own on app.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_own_delete on app.push_subscriptions for delete to authenticated using (user_id = auth.uid());

create table app.trust_shares (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null references app.evenings (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
comment on table app.trust_shares is 'Link für eine Vertrauensperson: Ort und Zeit des Abends, läuft safety.trust_share_hours nach Beginn ab.';
alter table app.trust_shares enable row level security;
grant select on app.trust_shares to authenticated;
create policy trust_shares_own on app.trust_shares for select to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on all tables in schema app to service_role;
