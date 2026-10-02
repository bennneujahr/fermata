-- Fermata · Web-App (M2): Ausführungsrechte von Funktionen härten (gefunden durch die RLS-Tests in M2).
--
-- Befund: PostgreSQL gibt jede neue Funktion PUBLIC zum Ausführen frei. „alter default privileges in schema …
-- revoke execute … from public“ (Foundation) kann diese eingebaute Freigabe nicht entfernen. Weil die Schemas
-- app, billing und api über PostgREST erreichbar sind, konnte damit jede angemeldete Person z. B.
-- app.evening_transition(…, p_actor) mit fremder ID aufrufen oder app.shared_windows fremder Personen lesen.
--
-- Lösung (im Sinne der Foundation „neue Funktionen sind nicht für alle ausführbar“):
-- 1. Ein Event-Trigger entzieht PUBLIC das Ausführungsrecht für jede künftig angelegte Funktion in den
--    Fermata-Schemas. Ausdrückliche GRANTs (an authenticated, anon, service_role, Bündel-Rollen) bleiben.
-- 2. Für alle bestehenden Funktionen dieser Schemas geschieht dasselbe sofort.
-- 3. Prüffunktionen mit fremder Personen-ID (Einwilligung, Ausweis, Kontingent) sind für Mitglieder gesperrt;
--    die eigene Sicht liefern api.my_*.

create or replace function ops.revoke_public_execute()
returns event_trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select c.objid
    from pg_event_trigger_ddl_commands() c
    join pg_proc p on p.oid = c.objid
    join pg_namespace n on n.oid = p.pronamespace
    where c.classid = 'pg_proc'::regclass
      and n.nspname in ('app', 'private', 'sensitive', 'safety', 'billing', 'ops', 'api')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public', r.objid::regprocedure);
  end loop;
end;
$$;
comment on function ops.revoke_public_execute() is
  'Event-Trigger: neue Funktionen in den Fermata-Schemas sind nicht für PUBLIC ausführbar (nur ausdrückliche GRANTs gelten).';

drop event trigger if exists fermata_revoke_public_execute;
create event trigger fermata_revoke_public_execute on ddl_command_end
  when tag in ('CREATE FUNCTION', 'CREATE PROCEDURE')
  execute function ops.revoke_public_execute();

do $$
declare
  r record;
begin
  for r in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'private', 'sensitive', 'safety', 'billing', 'ops', 'api')
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public', r.oid::regprocedure);
  end loop;
end
$$;

-- Prüffunktionen mit beliebiger Personen-ID: nicht für Mitglieder (Gegenüber kennen die ID aus dem Abend).
revoke execute on function app.has_consent(uuid, text) from authenticated;
revoke execute on function app.is_verified(uuid) from authenticated;
