-- Fermata · Protokolle und Betriebsdaten (Schema ops)

-- Benachrichtigungen ohne Inhalt: wer, wann, welcher Kanal, welche Vorlage.
create table ops.notifications_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  channel text not null check (channel in ('email', 'push')),
  template text not null,
  purpose text,
  provider text not null,
  provider_id text,
  status text not null default 'sent' check (status in ('sent', 'failed', 'skipped'))
);
comment on table ops.notifications_log is 'Versandprotokoll ohne Inhalte und ohne Adressen.';
create index notifications_log_user_idx on ops.notifications_log (user_id, at desc);
alter table ops.notifications_log enable row level security;

-- Nur außerhalb der Produktion: abgefangene Mails zum Prüfen in Tests und lokal.
create table ops.mail_outbox (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  recipient text not null,
  subject text not null,
  template text not null,
  html text not null,
  text text not null
);
comment on table ops.mail_outbox is 'Mail-Ersatz für local/test/ci. In Produktion leer (Trigger verhindert Einträge).';
alter table ops.mail_outbox enable row level security;

create or replace function ops.guard_outbox()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if ops.environment() in ('production', 'staging') then
    raise exception 'ops.mail_outbox ist in % gesperrt.', ops.environment() using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger mail_outbox_guard before insert on ops.mail_outbox
  for each row execute function ops.guard_outbox();

-- Kostenprotokoll je Gespräch (PLAN 3.2 Nr. 16). Keine Inhalte.
create table ops.session_costs (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  recorded_at timestamptz not null default now(),
  minutes numeric(8, 2) not null default 0,
  stt_seconds numeric(10, 2) not null default 0,
  llm_input_tokens integer not null default 0,
  llm_output_tokens integer not null default 0,
  llm_cache_read_tokens integer not null default 0,
  llm_cache_write_tokens integer not null default 0,
  tts_characters integer not null default 0,
  media_minutes numeric(8, 2) not null default 0,
  amount_eur numeric(10, 4) not null default 0,
  latency_ms_p50 integer,
  latency_ms_p90 integer,
  details jsonb not null default '{}'::jsonb
);
comment on table ops.session_costs is 'Kosten und Antwortzeiten je Gespräch (M3).';
create index session_costs_session_idx on ops.session_costs (session_id);
alter table ops.session_costs enable row level security;

-- Rechtstexte mit Version (Einwilligungen verweisen auf die Version, PLAN 3.2 Nr. 8).
create table ops.legal_documents (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('impressum', 'datenschutz', 'agb', 'einwilligung_warteliste', 'einwilligung_art9',
    'einwilligung_biometrie', 'einwilligung_gespraech', 'einwilligung_push', 'widerruf', 'ki_hinweis')),
  version text not null,
  status text not null default 'entwurf' check (status in ('entwurf', 'geprueft', 'gueltig', 'abgeloest')),
  title text not null,
  body_markdown text not null,
  valid_from timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, version)
);
comment on table ops.legal_documents is 'Rechtstexte und Einwilligungstexte. Bis zur Prüfung durch den Anwalt Status entwurf.';
alter table ops.legal_documents enable row level security;

create or replace function api.legal_document(p_kind text)
returns table (kind text, version text, status text, title text, body_markdown text, valid_from timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.kind, d.version, d.status, d.title, d.body_markdown, d.valid_from
  from ops.legal_documents d
  where d.kind = p_kind and d.status <> 'abgeloest'
  order by coalesce(d.valid_from, d.created_at) desc
  limit 1;
$$;
grant execute on function api.legal_document(text) to anon, authenticated, service_role;
