-- Fermata · Meldungen, Sanktionen, Widersprüche
-- PLAN 1 Nr. 9, M7. Melden ist überall möglich; vorläufige Sperre schützt sofort, Benn entscheidet.

create table safety.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid references auth.users (id) on delete set null,
  reported uuid references auth.users (id) on delete set null,
  evening_id uuid references app.evenings (id) on delete set null,
  context text not null check (context in ('abend', 'termin', 'gespraech', 'rueckmeldung', 'konto', 'sonstiges')),
  category text not null check (category in (
    'uebergriff',        -- körperlich oder sexuell: Null-Toleranz
    'bedrohung',
    'belaestigung',
    'diskriminierung',
    'minderjaehrig',
    'falsche_identitaet',
    'betrug',
    'nicht_erschienen',
    'unangenehm',
    'sonstiges'
  )),
  description text check (description is null or char_length(description) <= 4000),
  wants_contact boolean not null default true,
  severity text not null default 'mittel' check (severity in ('niedrig', 'mittel', 'hoch', 'akut')),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text
);
comment on table safety.reports is 'Meldungen. Die gemeldete Person erfährt nie, wer gemeldet hat.';
create index reports_open_idx on safety.reports (due_at) where status in ('open', 'in_review');
alter table safety.reports enable row level security;

create table safety.sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('hinweis', 'vorlaeufige_sperre', 'sperre', 'ausschluss')),
  reason text not null,
  report_id uuid references safety.reports (id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid,
  lift_reason text
);
comment on table safety.sanctions is 'Sanktionen. Ausschluss trägt die Person zusätzlich in safety.blocklist ein.';
create index sanctions_active_idx on safety.sanctions (user_id) where lifted_at is null;
alter table safety.sanctions enable row level security;

create or replace function safety.is_suspended(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from safety.sanctions s
    where s.user_id = p_user and s.lifted_at is null
      and s.kind in ('vorlaeufige_sperre', 'sperre', 'ausschluss')
      and s.starts_at <= app.now() and (s.ends_at is null or s.ends_at > app.now())
  );
$$;
grant execute on function safety.is_suspended(uuid) to service_role, fermata_matcher;
grant usage on schema safety to fermata_matcher;

create table safety.appeals (
  id uuid primary key default gen_random_uuid(),
  sanction_id uuid not null references safety.sanctions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 10 and 4000),
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid,
  decision_note text
);
comment on table safety.appeals is 'Widerspruch gegen eine Sanktion.';
alter table safety.appeals enable row level security;

-- Eigene Sanktionen sehen (ohne Meldungsbezug) – über eine Funktion, das Schema bleibt verborgen.
create or replace function api.my_sanctions()
returns table (id uuid, kind text, reason text, starts_at timestamptz, ends_at timestamptz, lifted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.kind, s.reason, s.starts_at, s.ends_at, s.lifted_at
  from safety.sanctions s where s.user_id = auth.uid() order by s.created_at desc;
$$;
grant execute on function api.my_sanctions() to authenticated;

grant select, insert, update, delete on all tables in schema safety to service_role;
