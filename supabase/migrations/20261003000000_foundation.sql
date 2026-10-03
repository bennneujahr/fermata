-- Fermata · Grundgerüst der Datenbank
-- Schemas, Rechte, simulierte Uhr app.now(), Einstellungen (ops.app_settings) mit Verlauf,
-- Admin-Prüfung (Zwei-Faktor), Audit-Protokoll.
-- Grundsatz (PLAN 2.1): Regeln entscheidet die Datenbank, nicht die Oberfläche.

-- ---------------------------------------------------------------------------
-- Erweiterungen
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Schemas (PLAN 3.1)
-- ---------------------------------------------------------------------------
create schema if not exists app;        -- Konto, Profil ohne Art.-9-Daten, Gespräche, Auswahl, Abende
create schema if not exists private;    -- Konto-Fakten (Name, Anschrift, Geburtsdatum, Telefon)
create schema if not exists sensitive;  -- Art.-9-Daten, verschlüsselt, eigene Rolle
create schema if not exists safety;     -- Meldungen, Sanktionen, Sperrliste
create schema if not exists billing;    -- Mitgliedschaft, Kontingent-Buch, Stripe
create schema if not exists ops;        -- Einstellungen, Audit, Protokolle, Testuhr
create schema if not exists api;        -- RPC-Funktionen für Web-App, Edge Functions und Jobs

comment on schema app is 'Fermata: Konto, Profil (ohne Art.-9-Daten), Gespräche, Auswahl, Abende, Lokale.';
comment on schema private is 'Fermata: Konto-Fakten. Nie für die Auswahl.';
comment on schema sensitive is 'Fermata: Art.-9-Daten, verschlüsselt. Auswahl nur über Prüffunktionen.';
comment on schema safety is 'Fermata: Meldungen, Sanktionen, Sperrliste. Nur Admin und eng begrenzte Functions.';
comment on schema billing is 'Fermata: Mitgliedschaft, Zeiträume, Kontingent-Buch, Stripe-Ereignisse.';
comment on schema ops is 'Fermata: Einstellungen, Audit, Benachrichtigungen, Kosten, Rechtstexte, Testuhr.';
comment on schema api is 'Fermata: aufrufbare Funktionen (RPC). Jede Funktion prüft selbst, wer aufruft.';

-- Niemand außer den hier genannten Rollen sieht die Schemas.
revoke all on schema app, private, sensitive, safety, billing, ops, api from public;
grant usage on schema app, billing, api to authenticated, service_role;
grant usage on schema private, sensitive, safety, ops to service_role;
grant usage on schema api to anon;

-- Standard: neue Funktionen sind nicht für alle ausführbar.
-- Wichtig: Postgres gibt PUBLIC global EXECUTE auf jede neue Funktion. Eine Angabe „in schema …“
-- kann diese globale Voreinstellung nicht entfernen, deshalb zuerst global für die Rolle postgres.
-- Die Migration 20261003099000_function_privileges.sql räumt zusätzlich alle bestehenden Funktionen auf,
-- und der Test 990_privileges.test.sql prüft es dauerhaft.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges in schema app, private, sensitive, safety, billing, ops, api revoke execute on functions from public;
alter default privileges in schema app, private, sensitive, safety, billing, ops, api revoke execute on functions from anon, authenticated;
alter default privileges in schema app, private, sensitive, safety, billing, ops, api grant execute on functions to service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Eigene Rollen ohne Anmeldung (Rechtebündel). Login-Rollen für Jobs entstehen im Deployment
-- (siehe docs/RUNBOOK.md) und erben diese Bündel.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fermata_sensitive') then
    create role fermata_sensitive nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'fermata_matcher') then
    create role fermata_matcher nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'fermata_agent') then
    create role fermata_agent nologin;
  end if;
end
$$;
-- postgres (Eigentümer der Migrationen) handelt im Namen der Bündel, z. B. als Eigentümer der Art.-9-Tabellen.
grant fermata_sensitive, fermata_matcher, fermata_agent to postgres;
comment on role fermata_sensitive is 'Besitzt die Art.-9-Tabellen und Prüffunktionen.';
comment on role fermata_matcher is 'Rechte des Auswahl-Jobs: liest nur, was die Auswahl braucht; keine Art.-9-Rohdaten.';
comment on role fermata_agent is 'Rechte des Sprach-Agenten (über die Agent-Function).';
grant usage on schema app, ops, api to fermata_matcher, fermata_agent;
grant usage on schema sensitive to fermata_matcher;

-- Tabellen, die nur angehängt werden dürfen, bekommen diesen Trigger.
create or replace function ops.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Tabelle %.% ist nur zum Anhängen.', tg_table_schema, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;
-- ---------------------------------------------------------------------------
-- Simulierte Uhr (PLAN 2.4): alle Regeln fragen app.now().
-- Die Umgebung steht in ops.deployment (Standard: production). Nur in test, local und ci
-- wirkt ein Versatz. Von production wegschalten darf nur eine Superuser-Rolle; auf dem
-- gehosteten Supabase gibt es die für uns nicht. Damit ist die Testuhr dort technisch gesperrt.
-- ---------------------------------------------------------------------------
create table ops.deployment (
  id boolean primary key default true check (id),
  environment text not null default 'production'
    check (environment in ('production', 'staging', 'local', 'test', 'ci')),
  updated_at timestamptz not null default now()
);
comment on table ops.deployment is 'Umgebung dieser Datenbank. production lässt sich nur als Superuser verlassen.';
insert into ops.deployment (id) values (true);

create or replace function ops.guard_deployment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.environment = 'production' and new.environment <> 'production'
     and not coalesce((select r.rolsuper from pg_catalog.pg_roles r where r.rolname = current_user), false) then
    raise exception 'Die Umgebung production lässt sich nicht verlassen.' using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger deployment_guard before update on ops.deployment
  for each row execute function ops.guard_deployment();
create trigger deployment_no_delete before delete on ops.deployment
  for each row execute function ops.forbid_change();

create table ops.sim_clock (
  id boolean primary key default true check (id),
  offset_interval interval not null default interval '0',
  updated_at timestamptz not null default now()
);
comment on table ops.sim_clock is 'Testuhr: Versatz gegenüber der echten Zeit. Wirkt nur außerhalb der Produktion.';
insert into ops.sim_clock (id) values (true);

create or replace function ops.environment()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select d.environment from ops.deployment d where d.id), 'production');
$$;
comment on function ops.environment() is 'Umgebung laut ops.deployment (Standard: production).';

create or replace function ops.sim_clock_allowed()
returns boolean
language sql
stable
set search_path = ''
as $$
  select ops.environment() in ('test', 'local', 'ci');
$$;

create or replace function app.now()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when ops.sim_clock_allowed()
      then now() + coalesce((select c.offset_interval from ops.sim_clock c where c.id), interval '0')
    else now()
  end;
$$;
comment on function app.now() is 'Aktuelle Zeit für alle Regeln. In Tests verstellbar über ops.sim_clock_advance().';
grant execute on function app.now() to anon, authenticated, service_role, fermata_matcher, fermata_agent;

create or replace function ops.guard_sim_clock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not ops.sim_clock_allowed() and new.offset_interval <> interval '0' then
    raise exception 'Die Testuhr ist in der Umgebung % gesperrt.', ops.environment()
      using errcode = 'insufficient_privilege';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger sim_clock_guard before insert or update on ops.sim_clock
  for each row execute function ops.guard_sim_clock();

create or replace function ops.sim_clock_advance(by_interval interval)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  update ops.sim_clock set offset_interval = offset_interval + by_interval where id;
  return app.now();
end;
$$;
create or replace function ops.sim_clock_reset()
returns void
language sql
security definer
set search_path = ''
as $$
  update ops.sim_clock set offset_interval = interval '0' where id;
$$;
revoke execute on function ops.sim_clock_advance(interval), ops.sim_clock_reset() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Einstellungen statt fester Zahlen (PLAN 2.4)
-- ---------------------------------------------------------------------------
create table ops.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]*$'),
  value jsonb not null,
  description text not null,
  category text not null default 'allgemein',
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
comment on table ops.app_settings is 'Alle Startwerte aus dem Auftrag als Einstellung. Jede Änderung landet in ops.app_settings_history.';
comment on column ops.app_settings.is_public is 'true: darf ohne Anmeldung gelesen werden (z. B. Heimwegtelefon, Hörprobe an/aus).';

create table ops.app_settings_history (
  id bigint generated always as identity primary key,
  key text not null,
  old_value jsonb,
  new_value jsonb,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  changed_by_role text not null default current_user
);
comment on table ops.app_settings_history is 'Verlauf jeder Einstellungsänderung mit Zeit und Person.';

create or replace function ops.log_setting_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(new.updated_by, auth.uid());
  insert into ops.app_settings_history (key, old_value, new_value, changed_by)
  values (new.key, case when tg_op = 'UPDATE' then old.value end, new.value, new.updated_by);
  return new;
end;
$$;
create trigger app_settings_history before insert or update on ops.app_settings
  for each row execute function ops.log_setting_change();

create or replace function ops.setting(setting_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  select s.value into v from ops.app_settings s where s.key = setting_key;
  if not found then
    raise exception 'Unbekannte Einstellung: %', setting_key using errcode = 'no_data_found';
  end if;
  return v;
end;
$$;
create or replace function ops.setting_int(setting_key text) returns integer
language sql stable security definer set search_path = '' as $$ select (ops.setting(setting_key))::text::integer; $$;
create or replace function ops.setting_num(setting_key text) returns numeric
language sql stable security definer set search_path = '' as $$ select (ops.setting(setting_key))::text::numeric; $$;
create or replace function ops.setting_bool(setting_key text) returns boolean
language sql stable security definer set search_path = '' as $$ select (ops.setting(setting_key))::text::boolean; $$;
create or replace function ops.setting_text(setting_key text) returns text
language sql stable security definer set search_path = '' as $$ select ops.setting(setting_key) #>> '{}'; $$;
create or replace function ops.setting_interval(setting_key text) returns interval
language sql stable security definer set search_path = '' as $$ select (ops.setting(setting_key) #>> '{}')::interval; $$;
grant execute on function ops.setting(text), ops.setting_int(text), ops.setting_num(text), ops.setting_bool(text),
  ops.setting_text(text), ops.setting_interval(text) to service_role, fermata_matcher, fermata_agent;

-- Öffentliche Einstellungen (ohne Anmeldung lesbar), z. B. für Landingpage und Hilfe-Knopf.
create or replace function api.public_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) from ops.app_settings s where s.is_public;
$$;
grant execute on function api.public_settings() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin (PLAN 3.2 Nr. 15): Admin-Rechte nur mit Zwei-Faktor-Sitzung (aal2).
-- ---------------------------------------------------------------------------
create table app.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);
comment on table app.admin_users is 'Personen mit Admin-Rechten (zu Beginn nur Benn).';
alter table app.admin_users enable row level security;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app.admin_users a where a.user_id = auth.uid())
     and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;
comment on function app.is_admin() is 'true nur für Admins mit Zwei-Faktor-Sitzung (aal2).';
grant execute on function app.is_admin() to authenticated, service_role;

create policy admin_users_self_or_admin on app.admin_users
  for select to authenticated
  using (user_id = auth.uid() or app.is_admin());

-- ---------------------------------------------------------------------------
-- Audit-Protokoll: nur anhängen.
-- ---------------------------------------------------------------------------
create table ops.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  actor_role text not null default current_user,
  action text not null,
  target_table text,
  target_id text,
  details jsonb not null default '{}'::jsonb
);
comment on table ops.audit_log is 'Admin-Handlungen und sicherheitsrelevante Ereignisse. Nur anhängen.';
create index audit_log_at_idx on ops.audit_log (at desc);

create trigger audit_log_append_only before update or delete on ops.audit_log
  for each row execute function ops.forbid_change();

create or replace function ops.audit(p_action text, p_target_table text default null, p_target_id text default null, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into ops.audit_log (actor, action, target_table, target_id, details)
  values (auth.uid(), p_action, p_target_table, p_target_id, coalesce(p_details, '{}'::jsonb));
$$;
grant execute on function ops.audit(text, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Tagessalz für Hashes (z. B. IP-Drossel): wechselt täglich, liegt nur in der Datenbank.
create table ops.daily_salts (
  day date primary key,
  salt bytea not null default extensions.gen_random_bytes(32)
);
comment on table ops.daily_salts is 'Tagessalz für Hashes ohne Personenbezug; alte Salze werden nach 2 Tagen gelöscht.';
alter table ops.daily_salts enable row level security;

create or replace function ops.daily_hash(input text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d date := (app.now() at time zone 'Europe/Berlin')::date;
  s bytea;
begin
  insert into ops.daily_salts (day) values (d) on conflict (day) do nothing;
  select salt into s from ops.daily_salts where day = d;
  return encode(extensions.hmac(convert_to(coalesce(input, ''), 'UTF8'), s, 'sha256'), 'hex');
end;
$$;
comment on function ops.daily_hash(text) is 'HMAC-SHA256 mit Tagessalz. Nach Löschung des Salzes nicht mehr zuordenbar.';
grant execute on function ops.daily_hash(text) to service_role;

-- RLS für alle ops-Tabellen (Zugriff nur service_role, die RLS umgeht, und Admins lesend).
alter table ops.deployment enable row level security;
alter table ops.sim_clock enable row level security;
alter table ops.app_settings enable row level security;
alter table ops.app_settings_history enable row level security;
alter table ops.audit_log enable row level security;

-- service_role (Edge Functions, Jobs) darf in allen Fermata-Schemas lesen und schreiben;
-- RLS umgeht sie ohnehin. Für alle späteren Tabellen gilt dasselbe (default privileges).
grant select, insert, update, delete on all tables in schema app, private, sensitive, safety, billing, ops to service_role;
grant usage, select on all sequences in schema app, private, sensitive, safety, billing, ops to service_role;
alter default privileges in schema app, private, sensitive, safety, billing, ops
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema app, private, sensitive, safety, billing, ops
  grant usage, select on sequences to service_role;
-- Für anon und authenticated gibt es keine Standardrechte: jede Tabelle bekommt ihre Rechte ausdrücklich.
alter default privileges in schema public revoke select, insert, update, delete on tables from anon, authenticated;
