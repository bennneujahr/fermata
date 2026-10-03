-- Fermata · Profil (ohne Art.-9-Daten), Wünsche, Deal-Breaker, freie Zeiten, Gespräche mit Viola
-- PLAN 1 Nr. 4–5, 2.2, 3.2 Nr. 9–10.

-- ---------------------------------------------------------------------------
-- Profil
-- ---------------------------------------------------------------------------
create table app.profile_core (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  birth_year integer check (birth_year is null or birth_year between 1900 and 2100),
  -- Bestätigte Zusammenfassung aus dem Gespräch (die Person hat sie gelesen und bestätigt oder korrigiert).
  summary_text text,
  summary_version integer not null default 0,
  summary_confirmed_at timestamptz,
  -- Strukturierte Auswertung (Hintergrund-Agent). Keine Art.-9-Inhalte: das prüft api.save_profile_analysis.
  personality jsonb not null default '{}'::jsonb,
  values_profile jsonb not null default '{}'::jsonb,
  life_circumstances jsonb not null default '{}'::jsonb,
  -- Wünsche an das Gegenüber, die als harte Filter taugen
  age_min integer check (age_min is null or age_min between 18 and 99),
  age_max integer check (age_max is null or age_max between 18 and 99),
  -- Fahrbereitschaft
  travel_modes text[] not null default '{}' check (travel_modes <@ array['auto', 'oepnv', 'rad', 'zu_fuss']::text[]),
  travel_max_minutes integer check (travel_max_minutes is null or travel_max_minutes between 5 and 180),
  travel_max_km integer check (travel_max_km is null or travel_max_km between 1 and 300),
  languages text[] not null default '{de}',
  smoking text check (smoking is null or smoking in ('nein', 'gelegentlich', 'ja')),
  has_children boolean,
  wants_children text check (wants_children is null or wants_children in ('ja', 'nein', 'offen', 'vielleicht')),
  ready_for_matching boolean not null default false,
  updated_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);
comment on table app.profile_core is 'Profil ohne Art.-9-Daten. Das Gegenüber sieht nie etwas daraus außer dem geprüften „warum Sie beide“.';
create trigger profile_core_touch before update on app.profile_core for each row execute function app.touch_updated_at();
alter table app.profile_core enable row level security;
grant select on app.profile_core to authenticated;
create policy profile_core_own on app.profile_core for select to authenticated using (user_id = auth.uid() or app.is_admin());

create table app.wants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('persoenlichkeit', 'werte', 'lebensstil', 'beziehung', 'sonstiges')),
  text text not null check (char_length(text) between 2 and 400),
  importance smallint not null default 2 check (importance between 1 and 3),
  source text not null default 'interview' check (source in ('interview', 'form', 'correction')),
  created_at timestamptz not null default now()
);
comment on table app.wants is 'Wünsche an das Gegenüber, aus dem Gespräch oder von der Person korrigiert.';
create index wants_user_idx on app.wants (user_id);
alter table app.wants enable row level security;
grant select on app.wants to authenticated;
create policy wants_own on app.wants for select to authenticated using (user_id = auth.uid());

create table app.dealbreakers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Harte Ausschlüsse ohne Art.-9-Bezug. Religion liegt in sensitive.profile_sensitive.religion_must_match.
  kind text not null check (kind in ('raucht', 'hat_kinder', 'will_kinder', 'will_keine_kinder', 'entfernung', 'alter', 'sonstiges')),
  value jsonb not null default '{}'::jsonb,
  text text check (text is null or char_length(text) <= 400),
  source text not null default 'interview' check (source in ('interview', 'form', 'correction')),
  created_at timestamptz not null default now()
);
comment on table app.dealbreakers is 'Deal-Breaker als harte Filter der Auswahl. „sonstiges“ wird nur vom LLM berücksichtigt.';
create index dealbreakers_user_idx on app.dealbreakers (user_id);
alter table app.dealbreakers enable row level security;
grant select on app.dealbreakers to authenticated;
create policy dealbreakers_own on app.dealbreakers for select to authenticated using (user_id = auth.uid());

-- Persönliche Gewichte der Teil-Scores (aus dem Gespräch abgeleitet, Summe 1)
create table app.personal_weights (
  user_id uuid primary key references auth.users (id) on delete cascade,
  weights jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app.personal_weights enable row level security;

-- Embedding der Zusammenfassung für die Vorauswahl (Titan Text Embeddings V2, 1024 Dimensionen)
create table app.profile_embeddings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  model text not null default 'amazon.titan-embed-text-v2:0',
  embedding extensions.vector(1024) not null,
  source_hash text not null,
  updated_at timestamptz not null default now()
);
comment on column app.profile_embeddings.source_hash is 'Hash der Zusammenfassung; neu rechnen nur bei Änderung.';
alter table app.profile_embeddings enable row level security;

-- ---------------------------------------------------------------------------
-- Freie Zeiten (PLAN 3.2 Nr. 10): Abfrage je Zeitraum, Fenster als Einzelzeilen.
-- ---------------------------------------------------------------------------
create table app.availability_periods (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  ask_at timestamptz not null,
  answer_until timestamptz not null,
  created_at timestamptz not null default now(),
  check (starts_on <= ends_on),
  check (ask_at <= answer_until),
  unique (starts_on, ends_on)
);
comment on table app.availability_periods is 'Zeiträume, für die freie Abende abgefragt werden (ein Auswahl-Zyklus).';
alter table app.availability_periods enable row level security;
grant select on app.availability_periods to authenticated;
create policy availability_periods_read on app.availability_periods for select to authenticated using (true);

create table app.availability_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_id uuid not null references app.availability_periods (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check (ends_at - starts_at <= interval '8 hours')
);
comment on table app.availability_windows is 'Freie Zeitfenster einer Person je Zeitraum.';
create index availability_windows_lookup on app.availability_windows (period_id, user_id, starts_at);
alter table app.availability_windows enable row level security;
grant select, insert, delete on app.availability_windows to authenticated;
create policy availability_windows_own_select on app.availability_windows for select to authenticated using (user_id = auth.uid());
create policy availability_windows_own_insert on app.availability_windows for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from app.availability_periods p where p.id = period_id and app.now() <= p.answer_until));
create policy availability_windows_own_delete on app.availability_windows for delete to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from app.availability_periods p where p.id = period_id and app.now() <= p.answer_until));

-- Gemeinsame Fenster zweier Personen in einem Zeitraum (für Auswahl und Terminvorschlag)
create or replace function app.shared_windows(a uuid, b uuid, p_period uuid, p_min_minutes integer default 120)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(wa.starts_at, wb.starts_at), least(wa.ends_at, wb.ends_at)
  from app.availability_windows wa
  join app.availability_windows wb
    on wb.period_id = wa.period_id and wb.user_id = b
   and wa.starts_at < wb.ends_at and wb.starts_at < wa.ends_at
  where wa.user_id = a and wa.period_id = p_period
    and least(wa.ends_at, wb.ends_at) - greatest(wa.starts_at, wb.starts_at) >= make_interval(mins => p_min_minutes)
  order by 1;
$$;
grant execute on function app.shared_windows(uuid, uuid, uuid, integer) to service_role, fermata_matcher;

-- ---------------------------------------------------------------------------
-- Gespräche mit Viola (M3)
-- ---------------------------------------------------------------------------
create table app.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'erstgespraech' check (kind in ('erstgespraech', 'vertiefung', 'nachbesprechung', 'korrektur')),
  mode text not null default 'voice' check (mode in ('voice', 'text')),
  status text not null default 'requested' check (status in ('requested', 'active', 'completed', 'aborted', 'failed')),
  address_form text not null default 'sie' check (address_form in ('sie', 'du')),
  tier_depth text not null default 'auftakt' check (tier_depth in ('auftakt', 'andante', 'loge')),
  evening_id uuid,                     -- bei Nachbesprechung
  room_name text unique,
  ai_notice_at timestamptz,            -- KI-Hinweis (Art. 50 AI Act) wurde gesprochen bzw. angezeigt
  started_at timestamptz,
  ended_at timestamptz,
  summary_draft text,
  summary_status text not null default 'none' check (summary_status in ('none', 'draft', 'confirmed', 'corrected', 'rejected')),
  summary_confirmed_at timestamptz,
  safety_flagged boolean not null default false,
  end_reason text check (end_reason is null or end_reason in ('fertig', 'person_beendet', 'zeitlimit', 'technik', 'krise', 'minderjaehrig', 'missbrauch')),
  created_at timestamptz not null default now()
);
comment on table app.interview_sessions is 'Ein Gespräch (Stimme oder Text). Kein Rohaudio, nirgends.';
create index interview_sessions_user_idx on app.interview_sessions (user_id, created_at desc);
alter table app.interview_sessions enable row level security;
grant select on app.interview_sessions to authenticated;
create policy interview_sessions_own on app.interview_sessions for select to authenticated using (user_id = auth.uid());

create table app.interview_transcripts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references app.interview_sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  turns jsonb not null default '[]'::jsonb,   -- [{role: 'viola'|'person', text, at}]
  created_at timestamptz not null default now(),
  delete_at timestamptz not null
);
comment on table app.interview_transcripts is 'Transkript als Text, Löschung nach interview.transcript_retention_days (Cron).';
create index interview_transcripts_delete_idx on app.interview_transcripts (delete_at);
alter table app.interview_transcripts enable row level security;
grant select on app.interview_transcripts to authenticated;
create policy interview_transcripts_own on app.interview_transcripts for select to authenticated using (user_id = auth.uid());

create or replace function app.set_transcript_delete_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.delete_at := coalesce(new.delete_at, app.now() + make_interval(days => ops.setting_int('interview.transcript_retention_days')));
  return new;
end;
$$;
create trigger interview_transcripts_delete_at before insert on app.interview_transcripts
  for each row execute function app.set_transcript_delete_at();

create or replace function ops.purge_transcripts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from app.interview_transcripts where delete_at <= app.now();
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function ops.purge_transcripts() is 'Löscht fällige Transkripte. Läuft stündlich per pg_cron.';

-- pg_cron: stündlich (nur wenn die Erweiterung verfügbar ist)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('fermata-purge-transcripts', '17 * * * *', 'select ops.purge_transcripts()');
  end if;
exception when others then
  raise notice 'pg_cron nicht eingerichtet: %', sqlerrm;
end
$$;
