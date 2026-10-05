-- Fermata · Ausführungsrechte aller Funktionen aufräumen (läuft als letzte Migration).
-- Postgres erlaubt PUBLIC standardmäßig, jede Funktion auszuführen. In den Fermata-Schemas soll nur
-- ausführen dürfen, wem es ausdrücklich erlaubt wurde (grant execute … to authenticated/anon/service_role/…).
-- Spätere Migrationen müssen das ebenfalls einhalten; supabase/tests/990_privileges.test.sql prüft es.

revoke execute on all functions in schema app, private, sensitive, safety, billing, ops, api from public;

-- Eigene Funktionen im Schema public (z. B. Trigger der Warteliste): ebenfalls nicht für alle.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname = 'public' and d.objid is null
      and pg_get_userbyid(p.proowner) = 'postgres'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end
$$;

-- Mitglieder dürfen nicht die Abende anderer Personen abfragen (Hinweis aus der Web-App, M2).
-- Die eigene Übersicht läuft über api.billing_overview(); Auswahl-Job und Abende nutzen eigene Rechte.
revoke execute on function billing.available_evenings(uuid) from authenticated;
