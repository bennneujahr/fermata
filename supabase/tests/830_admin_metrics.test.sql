-- Admin-Oberfläche: Kennzahlen und Lese-Hilfen (20261003000830_admin_metrics.sql).
-- Nur Admin mit Zwei-Faktor, k-Anonymität (k ≥ 5), keine Art.-9-Merkmale, Audit, Reihenfolge der Warteliste,
-- Abende zum Klären, Gespräche nur bei offenem Sicherheitsfall.
begin;
select plan(43);

create function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-000000000' || n)::uuid; $$;
grant execute on function pg_temp.u(int) to public;
create temp table x (k text primary key, id uuid);
grant select, insert on x to public;

-- Personen: 831–833 Mitglieder, 839 Benn (Admin)
select tests.create_user('m' || n || '@example.test', pg_temp.u(n)) from generate_series(831, 833) n;
select tests.create_user('benn830@example.test', pg_temp.u(839));
insert into app.admin_users (user_id, display_name) values (pg_temp.u(839), 'Benn');
insert into app.accounts (user_id, status) select pg_temp.u(n), 'active' from generate_series(831, 833) n;
insert into billing.memberships (user_id) select pg_temp.u(n) from generate_series(831, 833) n;
insert into billing.evening_ledger (user_id, kind, amount, note) select pg_temp.u(n), 'adjust', 3, 'Testguthaben' from generate_series(831, 833) n;
insert into app.profile_core (user_id, display_name, birth_year) values
  (pg_temp.u(831), 'Clara', 1990), (pg_temp.u(832), 'Dirk', 1985), (pg_temp.u(833), 'Emma', 1979);
-- Art.-9-Angaben einer Person (dürfen in keiner Kennzahl auftauchen)
insert into sensitive.profile_identity (user_id, gender_enc, seeking_genders_enc)
select pg_temp.u(831), sensitive.enc('frau'), sensitive.enc('mann');

-- ---------------------------------------------------------------------------
-- Hilfen: k-Unterdrückung
-- ---------------------------------------------------------------------------
select is(ops.kpi_n(3, 5), null, 'kpi_n: 3 Personen werden unterdrückt');
select is(ops.kpi_n(0, 5), 0, 'kpi_n: 0 bleibt sichtbar');
select is(ops.kpi_n(5, 5), 5, 'kpi_n: ab k sichtbar');
select is(ops.kpi_n(4, 2), null, 'kpi_n: k ist mindestens 5');
select is(ops.kpi_cells('{"a": 12, "b": 3, "c": 7}'::jsonb, 5), '{"a": 12, "b": null, "c": null}'::jsonb,
  'kpi_cells: eine kleine Zelle zieht die nächstkleinere mit (sekundäre Unterdrückung)');
select is(ops.kpi_cells('{"a": 12, "b": 3, "c": 2, "d": 0}'::jsonb, 5), '{"a": 12, "b": null, "c": null, "d": 0}'::jsonb,
  'kpi_cells: zwei kleine Zellen reichen, 0 bleibt');
select is(ops.kpi_cells('{"a": 12, "b": 9}'::jsonb, 5), '{"a": 12, "b": 9}'::jsonb, 'kpi_cells: große Zellen bleiben');
select ok(not has_function_privilege('authenticated', 'ops.kpi_cells(jsonb, integer)', 'execute'), 'Hilfen sind für Mitglieder nicht ausführbar');

-- ---------------------------------------------------------------------------
-- Zugriff: nur Admin mit aal2
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'api.admin_kpis()', 'execute'), 'anon: admin_kpis nicht ausführbar');
select ok(not has_function_privilege('anon', 'api.admin_today()', 'execute'), 'anon: admin_today nicht ausführbar');
select tests.act_as(pg_temp.u(831), 'aal2');
select throws_ok($$ select api.admin_today() $$, '42501', null, 'Mitglied: admin_today abgelehnt');
select throws_ok($$ select api.admin_kpis() $$, '42501', null, 'Mitglied: admin_kpis abgelehnt');
select throws_ok($$ select * from api.admin_waitlist_entries('westmecklenburg') $$, '42501', null, 'Mitglied: Warteliste abgelehnt');
select throws_ok($$ select * from api.admin_case_sessions('00000000-0000-0000-0000-000000000832') $$, '42501', null, 'Mitglied: Gespräche abgelehnt');
select tests.reset_role();
select tests.act_as(pg_temp.u(839), 'aal1');
select throws_ok($$ select api.admin_today() $$, '42501', 'Nur für Admins mit Zwei-Faktor-Anmeldung', 'Admin ohne Zwei-Faktor: admin_today abgelehnt');
select throws_ok($$ select api.admin_kpis() $$, '42501', null, 'Admin ohne Zwei-Faktor: admin_kpis abgelehnt');
select throws_ok($$ select * from api.admin_evenings_to_resolve() $$, '42501', null, 'Admin ohne Zwei-Faktor: Abende abgelehnt');
select throws_ok($$ select * from api.admin_availability_periods() $$, '42501', null, 'Admin ohne Zwei-Faktor: Zeiträume abgelehnt');
select throws_ok($$ select * from api.admin_pairing_times('00000000-0000-0000-0000-000000000000') $$, '42501', null, 'Admin ohne Zwei-Faktor: Terminvorschläge abgelehnt');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Kennzahlen: k-Anonymität und keine Art.-9-Merkmale
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(839), 'aal2');
create temp table kpi1 as select api.admin_kpis() as j;
select tests.reset_role();
select is((select (j -> 'funnel' -> 0 ->> 'n') from kpi1), null, 'Trichter: 3 Konten werden als „< 5“ unterdrückt');
select is((select (j ->> 'k')::int from kpi1), 5, 'k = 5');
select ok((select j::text !~* '(frau|mann|nichtbinaer|religion|orientierung)' from kpi1), 'Kennzahlen enthalten keine Art.-9-Merkmale');
select ok(exists (select 1 from ops.audit_log a where a.action = 'kpi.viewed' and a.actor = pg_temp.u(839)), 'Abruf der Kennzahlen steht im Audit');

-- Mit 6 weiteren Konten wird die Zahl sichtbar
select tests.create_user('n' || n || '@example.test', pg_temp.u(n)) from generate_series(841, 846) n;
insert into app.accounts (user_id, status) select pg_temp.u(n), 'active' from generate_series(841, 846) n;
select tests.act_as(pg_temp.u(839), 'aal2');
select is((select ((api.admin_kpis()) -> 'funnel' -> 0 ->> 'n')::int), (select count(*)::int from app.accounts),
  'Trichter: ab 5 Konten sichtbar');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Warteliste: Reihenfolge nach Platz, Eingeladene ausgeblendet
-- ---------------------------------------------------------------------------
insert into public.waitlist (id, first_name, email, region, postal_code, consent_text_version, consent_at, confirmed_at, base_number, bonus_steps, invited_to_app_at)
values
  ('83000000-0000-0000-0000-000000000001', 'Anna', 'anna830@example.test', 'schwerin', '19053', 'v1', now(), now() - interval '3 days', 9001, 0, null),
  ('83000000-0000-0000-0000-000000000002', 'Bert', 'bert830@example.test', 'schwerin', '19053', 'v1', now(), now() - interval '2 days', 9002, 0, null),
  ('83000000-0000-0000-0000-000000000003', 'Cleo', 'cleo830@example.test', 'schwerin', '19053', 'v1', now(), now() - interval '1 days', 9003, 1, null),
  ('83000000-0000-0000-0000-000000000004', 'Dora', 'dora830@example.test', 'schwerin', '19053', 'v1', now(), now() - interval '4 days', 9000, 0, now()),
  ('83000000-0000-0000-0000-000000000005', 'Eik', 'eik830@example.test', 'hamburg', '20095', 'v1', now(), now(), 9000, 0, null);
select tests.act_as(pg_temp.u(839), 'aal2');
select is((select array_agg(first_name order by place) from api.admin_waitlist_entries('westmecklenburg') where email like '%830@example.test'),
  array['Cleo', 'Anna', 'Bert'], 'Warteliste: Reihenfolge nach Platz (Vorrückung zählt), Eingeladene fehlen');
select is((select count(*)::int from api.admin_waitlist_entries('westmecklenburg', true) where email like '%830@example.test'), 4,
  'Warteliste: mit Eingeladenen');
select is((select count(*)::int from api.admin_waitlist_entries('hamburg') where email like '%830@example.test'), 1, 'Warteliste: nur die gewählte Gruppe');
select throws_ok($$ select * from api.admin_waitlist_entries('mars') $$, '22023', null, 'Warteliste: unbekannte Gruppe abgelehnt');
select tests.reset_role();
select ok(exists (select 1 from ops.audit_log a where a.action = 'waitlist.entries_viewed'), 'Ansicht der Warteliste steht im Audit');

-- ---------------------------------------------------------------------------
-- Abende zum Klären, Heute
-- ---------------------------------------------------------------------------
insert into app.venues (id, name, street, postal_code, city, lat, lon) values
  ('83000000-0000-0000-0000-0000000000f1', 'Weinstube 830', 'Seestraße 5', '19053', 'Schwerin', 53.62, 11.42);
insert into app.match_runs (id, scheduled_for, status) values ('83000000-0000-0000-0000-0000000000a1', now(), 'approved');
create function pg_temp.evening(a uuid, b uuid, starts interval) returns uuid language plpgsql as $$
declare pid uuid; eid uuid;
begin
  insert into app.pairings (run_id, user_a, user_b, total_score, status)
  values ('83000000-0000-0000-0000-0000000000a1', least(a, b), greatest(a, b), 0.8, 'proposed') returning id into pid;
  insert into app.venue_slots (venue_id, starts_at, tables) values ('83000000-0000-0000-0000-0000000000f1', app.now() + starts, 1)
  on conflict (venue_id, starts_at) do update set tables = app.venue_slots.tables + 1;
  insert into app.evenings (pairing_id, user_a, user_b, starts_at, venue_id)
  values (pid, least(a, b), greatest(a, b), app.now() + starts, '83000000-0000-0000-0000-0000000000f1') returning id into eid;
  perform app.evening_transition(eid, 'request_time', a);
  perform app.evening_transition(eid, 'confirm', b);
  return eid;
end $$;
insert into x values ('e1', pg_temp.evening(pg_temp.u(831), pg_temp.u(832), interval '-5 hours'));
insert into x values ('e2', pg_temp.evening(pg_temp.u(833), pg_temp.u(841), interval '-3 hours'));
select app.evening_flag((select id from x where k = 'e1'), null, 'no_show_bestritten', 'niedrig', '{}'::jsonb);

select tests.act_as(pg_temp.u(839), 'aal2');
select is((select array_agg(evening_id) from api.admin_evenings_to_resolve()), array[(select id from x where k = 'e1')],
  'Abende zum Klären: nur der bestrittene, nicht der noch laufende');
select is((select reasons from api.admin_evenings_to_resolve() limit 1), array['bestritten'], 'Grund: bestritten');
select is((select a_name from api.admin_evenings_to_resolve() limit 1), 'Clara', 'Nur Anzeigename, kein Nachname');
select is(((api.admin_today()) ->> 'evenings_to_resolve')::int, 1, 'Heute: ein Abend zum Klären');
select is(((api.admin_today()) -> 'reports' ->> 'open')::int, 0, 'Heute: keine offenen Meldungen');
select ok(jsonb_typeof((api.admin_today()) -> 'reservations_unconfirmed') = 'array', 'Heute: Reservierungen ohne Bestätigung als Liste');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Gespräche nur bei offenem Sicherheitsfall
-- ---------------------------------------------------------------------------
insert into app.interview_sessions (id, user_id, kind, status, started_at, ended_at)
values ('83000000-0000-0000-0000-0000000000c1', pg_temp.u(833), 'erstgespraech', 'completed', now() - interval '2 hours', now() - interval '1 hour');
select tests.act_as(pg_temp.u(839), 'aal2');
select throws_ok($$ select * from api.admin_case_sessions('00000000-0000-0000-0000-000000000833') $$, '42501',
  'Kein offener Sicherheitsfall zu dieser Person', 'Ohne offenen Fall: keine Gespräche');
select tests.reset_role();
insert into safety.safety_flags (user_id, source, kind, severity, details)
values (pg_temp.u(833), 'agent', 'krise', 'hoch', jsonb_build_object('session_id', '83000000-0000-0000-0000-0000000000c1'));
create temp table hoch as select count(*)::int as n from safety.safety_flags where reviewed_at is null and severity = 'hoch';
grant select on hoch to public;
select tests.act_as(pg_temp.u(839), 'aal2');
select is((select array_agg(session_id) from api.admin_case_sessions(pg_temp.u(833))), array['83000000-0000-0000-0000-0000000000c1'::uuid],
  'Mit offenem Hinweis: Gespräche der Person (nur Metadaten)');
select is(((api.admin_today()) -> 'flags_by_severity' ->> 'hoch')::int,
  (select n from hoch), 'Heute: Hinweise nach Dringlichkeit');
select tests.reset_role();
select ok(exists (select 1 from ops.audit_log a where a.action = 'safety.case_sessions_viewed' and a.target_id = pg_temp.u(833)::text),
  'Ansicht der Gespräche steht im Audit');

-- ---------------------------------------------------------------------------
-- Zeiträume und Terminvorschläge
-- ---------------------------------------------------------------------------
insert into app.availability_periods (id, starts_on, ends_on, ask_at, answer_until)
values ('83000000-0000-0000-0000-0000000000d1', '2030-01-07', '2030-01-20', now(), now() + interval '3 days');
select tests.act_as(pg_temp.u(839), 'aal2');
select is((select people_with_windows from api.admin_availability_periods() where id = '83000000-0000-0000-0000-0000000000d1'), 0,
  'Zeiträume: Zahl der Personen mit Zeiten');
select is((select count(*)::int from api.admin_pairing_times('83000000-0000-0000-0000-0000000000a1')), 2,
  'Terminvorschläge: je Vorschlag eine Zeile');
select is((select bool_or(preview) from api.admin_pairing_times('83000000-0000-0000-0000-0000000000a1')), false,
  'Terminvorschläge: freigegebene zeigen die Zeiten des Abends, keine Vorschau');
select tests.reset_role();

-- Keine Admin-Funktion, die ins Audit schreibt, darf STABLE sein (PostgREST: schreibgeschützte Transaktion).
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api' and p.provolatile in ('s', 'i')
     and (p.prosrc ilike '%ops.audit%' or p.prosrc ilike '%insert into%')),
  '', 'Schreibende API-Funktionen sind VOLATILE');

select * from finish();
rollback;
