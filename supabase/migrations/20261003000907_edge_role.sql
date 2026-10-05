-- Fermata · Härtung: Edge Functions mit enger Rolle (DSFA M-1, TOM 1.2).
--
-- Bisher verbinden sich die Edge Functions als postgres (SUPABASE_DB_URL). postgres ist Mitglied von
-- fermata_sensitive und pg_read_all_data und darf Vault lesen – ein gestohlener Function-Zugang hätte also
-- Art.-9-Daten und alle Schlüssel offengelegt.
--
-- Neu: supabase/functions/_shared/db.ts wechselt mit FERMATA_DB_ROLE=<rolle> gleich beim Verbinden in eine engere
-- Rolle. Zwei Möglichkeiten (beide mit der ganzen Deno-Testreihe geprüft):
--   - service_role: liest weder sensitive.* noch auth.users – aber im Supabase-Abbild Vault
--     (vault.decrypted_secrets ist an service_role freigegeben; postgres kann das nicht zurücknehmen).
--   - fermata_edge (diese Migration, empfohlen): dieselben Rechte wie service_role in den Fermata-Schemas außer
--     sensitive, BYPASSRLS wie service_role, aber kein Vault, kein auth-Schema, kein pg_read_all_data.
-- Was die Functions aus auth.users brauchen, liefern security-definer-Funktionen (unten).
-- Einrichtung der Login-Rolle fermata_edge_login: docs/RUNBOOK.md Abschnitt 5.

-- ---------------------------------------------------------------------------
-- Rechtebündel fermata_edge
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fermata_edge') then
    begin
      create role fermata_edge nologin bypassrls;
    exception when insufficient_privilege then
      -- Ohne BYPASSRLS funktionieren die wenigen direkten Tabellenzugriffe der Functions nicht (siehe Runbook).
      create role fermata_edge nologin;
      raise notice 'fermata_edge ohne BYPASSRLS angelegt';
    end;
  end if;
end
$$;
comment on role fermata_edge is
  'Rechte der Edge Functions (FERMATA_DB_ROLE=fermata_edge): wie service_role in app, private, safety, billing, ops, api – ohne sensitive, Vault und auth.';
grant fermata_edge to postgres;
grant usage on schema app, private, safety, billing, ops, api to fermata_edge;
-- Erweiterungen (pgcrypto, citext, vector): einige Funktionen ohne security definer nutzen sie (z. B. billing.summary_hash).
grant usage on schema extensions to fermata_edge;
grant select, insert, update, delete on all tables in schema app, private, safety, billing, ops to fermata_edge;
grant usage, select on all sequences in schema app, private, safety, billing, ops to fermata_edge;
alter default privileges in schema app, private, safety, billing, ops grant select, insert, update, delete on tables to fermata_edge;
alter default privileges in schema app, private, safety, billing, ops grant usage, select on sequences to fermata_edge;
alter default privileges in schema app, private, safety, billing, ops, api grant execute on functions to fermata_edge;
-- Die Interview-Functions wechseln je Anfrage in authenticated bzw. fermata_agent (set local role). Dafür muss die
-- Login-Rolle (Sitzungsrolle) Mitglied dieser Rollen sein, nicht fermata_edge – fermata_edge erbt deren Rechte nicht.

-- admin-invite: gibt es zu dieser E-Mail schon eine Person in Supabase Auth?
create or replace function ops.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where lower(u.email::text) = lower(btrim(coalesce(p_email, ''))) limit 1;
$$;
comment on function ops.auth_user_id_by_email(text) is 'Für admin-invite: ID einer Person in Supabase Auth zu einer E-Mail (oder null).';

-- Kündigung, Widerruf, Mails: E-Mail und Name der Person (nur für Eingangsbestätigungen).
create or replace function billing.member_contact(p_user uuid)
returns table (email text, first_name text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text, f.first_name, nullif(trim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, '')), '')
  from auth.users u left join private.account_facts f on f.user_id = u.id where u.id = p_user;
$$;
comment on function billing.member_contact(uuid) is 'Für billing-* und stripe-webhook: E-Mail und Name einer Person (Eingangsbestätigungen).';

revoke execute on function ops.auth_user_id_by_email(text), billing.member_contact(uuid) from public, anon, authenticated;
grant execute on function ops.auth_user_id_by_email(text), billing.member_contact(uuid) to service_role;

-- fermata_edge führt genau die Fermata-Funktionen aus, die service_role ausführen darf (außer im Schema sensitive).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'private', 'safety', 'billing', 'ops', 'api')
      and has_function_privilege('service_role', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('grant execute on function %s to fermata_edge', f.sig);
  end loop;
  -- Was service_role nicht darf, darf auch fermata_edge nicht (z. B. Admin-Einsicht in Transkripte).
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'private', 'safety', 'billing', 'ops', 'api')
      and not has_function_privilege('service_role', p.oid, 'execute')
      and has_function_privilege('fermata_edge', p.oid, 'execute')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from fermata_edge', f.sig);
  end loop;
end
$$;

-- Auswahl-Job: darf die Umgebung lesen, um in Produktion Attrappen zu verweigern (services/matcher, DSFA M-3).
grant execute on function ops.environment() to fermata_matcher;
