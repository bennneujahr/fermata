begin;
select plan(3);

-- Keine Funktion in den Fermata-Schemas darf für PUBLIC ausführbar sein
-- (proacl null heißt Voreinstellung = PUBLIC darf ausführen).
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'private', 'sensitive', 'safety', 'billing', 'ops', 'api')
     and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  '', 'Keine Fermata-Funktion ist für PUBLIC ausführbar');

-- anon darf nur ausdrücklich öffentliche Funktionen aufrufen.
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'private', 'sensitive', 'safety', 'billing', 'ops', 'api')
     and has_function_privilege('anon', p.oid, 'execute')
     and p.oid::regprocedure::text not in (
       'app.now()',
       'api.public_settings()',
       'api.legal_document(text)',
       'api.help_contacts()',
       'api.billing_tiers()'
     )),
  '', 'anon erreicht nur die öffentliche Liste');

-- Interne Funktionen sind für Mitglieder gesperrt (Stichproben aus allen Bereichen).
select ok(
  not has_function_privilege('authenticated', 'app.evening_transition(uuid, text, uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'ops.sim_clock_advance(interval)', 'execute')
  and not has_function_privilege('authenticated', 'ops.audit(text, text, text, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'sensitive.gender_compatible(uuid, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'sensitive.dec(bytea)', 'execute'),
  'Interne Funktionen sind für Mitglieder nicht ausführbar');

select * from finish();
rollback;
