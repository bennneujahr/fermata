-- Fermata · Lokale, Auswahl-Läufe, Kandidaten, Paare
-- PLAN 2.3 Nr. 5, 3.2 Nr. 14, M4.

-- ---------------------------------------------------------------------------
-- Partner-Lokale und Plätze
-- ---------------------------------------------------------------------------
create table app.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  street text not null,
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  city text not null,
  lat double precision not null,
  lon double precision not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  reservation_mode text not null default 'email' check (reservation_mode in ('email', 'telefon', 'manuell')),
  description text,
  accessibility text,
  public_transport text,
  -- Vereinbarung (Frage B10): z. B. {"getraenk_willkommen": true, "loge_tisch": "Fensterplatz"}
  agreement jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table app.venues is 'Partner-Lokale. Öffentliche Orte; Mitglieder sehen nur das Lokal ihres Abends.';
create trigger venues_touch before update on app.venues for each row execute function app.touch_updated_at();
alter table app.venues enable row level security;

create table app.venue_slots (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references app.venues (id) on delete cascade,
  starts_at timestamptz not null,
  tables integer not null check (tables >= 0),
  reserved integer not null default 0 check (reserved >= 0),
  created_at timestamptz not null default now(),
  unique (venue_id, starts_at),
  check (reserved <= tables)
);
comment on table app.venue_slots is 'Freie Tische je Lokal und Beginnzeit („Lokal mit Platz“ ist eine echte Abfrage).';
create index venue_slots_time_idx on app.venue_slots (starts_at) where reserved < tables;
alter table app.venue_slots enable row level security;

-- ---------------------------------------------------------------------------
-- Auswahl
-- ---------------------------------------------------------------------------
create table app.match_runs (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references app.availability_periods (id) on delete set null,
  scheduled_for timestamptz not null,
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'running', 'review', 'approved', 'partially_approved', 'failed', 'cancelled')),
  pool_size integer,
  candidate_pairs integer,
  proposed_pairs integer,
  settings_snapshot jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  cost_eur numeric(10, 4),
  error text,
  created_at timestamptz not null default now()
);
comment on table app.match_runs is 'Ein Lauf des Auswahl-Jobs. Bericht dauerhaft, Teil-Scores 12 Monate.';
alter table app.match_runs enable row level security;

create table app.pair_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app.match_runs (id) on delete cascade,
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  rule_score numeric(5, 4),
  llm_score numeric(5, 4),
  wait_bonus numeric(5, 4) not null default 0,
  total_score numeric(5, 4),
  subscores jsonb not null default '{}'::jsonb,
  llm_rationale text,
  reasons_draft text,
  reasons_art9_clean boolean,
  input_hash text,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (run_id, user_a, user_b)
);
comment on table app.pair_candidates is 'Bewertete Paare eines Laufs. Teil-Scores werden nach matching.score_retention_months gelöscht.';
comment on column app.pair_candidates.input_hash is 'Hash beider Zusammenfassungen: Bewertung wiederverwenden, solange sich nichts geändert hat (PLAN 5.10).';
create index pair_candidates_run_idx on app.pair_candidates (run_id, total_score desc);
create index pair_candidates_reuse_idx on app.pair_candidates (user_a, user_b, input_hash);
alter table app.pair_candidates enable row level security;

create table app.pairings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references app.match_runs (id) on delete restrict,
  candidate_id uuid references app.pair_candidates (id) on delete set null,
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  total_score numeric(5, 4) not null,
  venue_id uuid references app.venues (id) on delete set null,
  venue_reason text,
  -- „Warum Sie beide“: geprüft (keine Art.-9-Inhalte), das Einzige, was das Gegenüber sieht.
  reasons_text text,
  review_notes jsonb not null default '{}'::jsonb,   -- Prüf-Agent
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'rejected', 'proposed', 'declined', 'expired', 'completed', 'cancelled')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  check (user_a < user_b)
);
comment on table app.pairings is 'Vorgeschlagene Paare. Benn gibt jeden Vorschlag frei (status approved), erst dann entsteht ein Abend.';
create index pairings_run_idx on app.pairings (run_id, status);
create index pairings_users_idx on app.pairings (user_a, user_b);
alter table app.pairings enable row level security;
grant select on app.pairings to authenticated;
-- Mitglieder sehen ihre freigegebenen Vorschläge, nie Scores (Spalten-Rechte unten).
create policy pairings_participant on app.pairings for select to authenticated
  using ((auth.uid() in (user_a, user_b) and status in ('proposed', 'declined', 'expired', 'completed', 'cancelled')) or app.is_admin());
revoke select on app.pairings from authenticated;
grant select (id, user_a, user_b, venue_id, reasons_text, status, created_at) on app.pairings to authenticated;

-- Wer wurde schon einmal zusammen vorgeschlagen? (nie zweimal dasselbe Paar)
create or replace function app.already_paired(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.pairings p
    where p.user_a = least(a, b) and p.user_b = greatest(a, b)
      and p.status not in ('rejected')
  );
$$;
grant execute on function app.already_paired(uuid, uuid) to service_role, fermata_matcher;

-- Rechte des Auswahl-Jobs (PLAN 3.2 Nr. 5): eng, ohne private und ohne Art.-9-Tabellen.
grant select on app.accounts, app.profile_core, app.wants, app.dealbreakers, app.personal_weights, app.profile_embeddings,
  app.geo, app.availability_periods, app.availability_windows, app.venues, app.venue_slots, app.verifications to fermata_matcher;
grant select, insert, update on app.match_runs, app.pair_candidates, app.pairings to fermata_matcher;
grant select on app.consents to fermata_matcher;

-- fermata_matcher umgeht RLS nicht: eigene Richtlinien für genau die freigegebenen Tabellen.
do $$
declare
  t text;
begin
  foreach t in array array['accounts', 'profile_core', 'wants', 'dealbreakers', 'personal_weights', 'profile_embeddings', 'geo',
    'availability_periods', 'availability_windows', 'venues', 'venue_slots', 'verifications', 'consents'] loop
    execute format('create policy %I on app.%I for select to fermata_matcher using (true)', t || '_matcher_read', t);
  end loop;
  foreach t in array array['match_runs', 'pair_candidates', 'pairings'] loop
    execute format('create policy %I on app.%I for all to fermata_matcher using (true) with check (true)', t || '_matcher_write', t);
  end loop;
end
$$;
