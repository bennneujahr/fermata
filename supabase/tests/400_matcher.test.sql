-- Auswahl-Job (M4): Admin-Freigabe, Sichtbarkeit für Mitglieder, Rechte von fermata_matcher, Stapel-Prüffunktionen.
begin;
select plan(46);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select has_table('app', 'match_run_members', 'Tabelle app.match_run_members existiert');
select ok((select relrowsecurity from pg_class where oid = 'app.match_run_members'::regclass), 'RLS auf app.match_run_members');
select has_function('api', 'admin_match_runs', 'api.admin_match_runs existiert');
select has_function('api', 'admin_run_pairings', array['uuid'], 'api.admin_run_pairings existiert');
select has_function('api', 'admin_approve_pairing', array['uuid', 'text'], 'api.admin_approve_pairing existiert');
select has_function('api', 'admin_reject_pairing', array['uuid', 'text'], 'api.admin_reject_pairing existiert');
select has_function('api', 'admin_finish_run', array['uuid', 'boolean'], 'api.admin_finish_run existiert');
select ok(exists (select 1 from ops.app_settings where key = 'matching.topn_mode'), 'neue Einstellungen sind angelegt');

-- ---------------------------------------------------------------------------
-- Testdaten: vier Personen, Benn (Admin), Zeitraum, Lokal, Lauf mit zwei Vorschlägen
-- ---------------------------------------------------------------------------
select tests.create_user('m-a@example.test', '00000000-0000-0000-0000-0000000004a1');
select tests.create_user('m-b@example.test', '00000000-0000-0000-0000-0000000004b2');
select tests.create_user('m-c@example.test', '00000000-0000-0000-0000-0000000004c3');
select tests.create_user('m-d@example.test', '00000000-0000-0000-0000-0000000004d4');
select tests.create_user('benn@example.test', '00000000-0000-0000-0000-0000000004ee');
insert into app.admin_users (user_id, display_name) values ('00000000-0000-0000-0000-0000000004ee', 'Benn');
insert into app.accounts (user_id, status) select u, 'active' from unnest(array[
  '00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004b2',
  '00000000-0000-0000-0000-0000000004c3', '00000000-0000-0000-0000-0000000004d4']::uuid[]) u;
insert into app.profile_core (user_id, display_name, birth_year) values
  ('00000000-0000-0000-0000-0000000004a1', 'Anna', 1988), ('00000000-0000-0000-0000-0000000004b2', 'Ben', 1985),
  ('00000000-0000-0000-0000-0000000004c3', 'Cem', 1990), ('00000000-0000-0000-0000-0000000004d4', 'Dirk', 1979);
insert into app.consents (user_id, kind, action, document_version)
  select u, k, 'granted', 'v1' from unnest(array[
    '00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004b2',
    '00000000-0000-0000-0000-0000000004c3', '00000000-0000-0000-0000-0000000004d4']::uuid[]) u,
    unnest(array['gespraech', 'art9_profile']) k;
insert into billing.evening_ledger (user_id, kind, amount) select u, 'free_grant', 1 from unnest(array[
  '00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004b2',
  '00000000-0000-0000-0000-0000000004c3', '00000000-0000-0000-0000-0000000004d4']::uuid[]) u;

insert into app.availability_periods (id, starts_on, ends_on, ask_at, answer_until)
values ('40000000-0000-0000-0000-000000000001', current_date + 60, current_date + 73, now() - interval '7 days', now() - interval '1 hour');
-- gemeinsame Fenster an drei Tagen (18–23 Uhr Berliner Zeit)
insert into app.availability_windows (user_id, period_id, starts_at, ends_at)
select u, '40000000-0000-0000-0000-000000000001',
       ((current_date + 60 + d)::timestamp + interval '18 hours') at time zone 'Europe/Berlin',
       ((current_date + 60 + d)::timestamp + interval '23 hours') at time zone 'Europe/Berlin'
from unnest(array['00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004b2',
                  '00000000-0000-0000-0000-0000000004c3', '00000000-0000-0000-0000-0000000004d4']::uuid[]) u,
     unnest(array[0, 1, 3]) d;
insert into app.venues (id, name, street, postal_code, city, lat, lon)
values ('40000000-0000-0000-0000-0000000000f1', 'Café Test', 'Weg 1', '19053', 'Schwerin', 53.63, 11.41);
-- zwei Plätze am selben Tag, je einer an zwei weiteren Tagen, einer ohne freien Tisch
insert into app.venue_slots (venue_id, starts_at, tables, reserved) values
  ('40000000-0000-0000-0000-0000000000f1', ((current_date + 60)::timestamp + interval '19 hours') at time zone 'Europe/Berlin', 2, 0),
  ('40000000-0000-0000-0000-0000000000f1', ((current_date + 60)::timestamp + interval '20 hours') at time zone 'Europe/Berlin', 2, 0),
  ('40000000-0000-0000-0000-0000000000f1', ((current_date + 61)::timestamp + interval '19 hours') at time zone 'Europe/Berlin', 1, 1),
  ('40000000-0000-0000-0000-0000000000f1', ((current_date + 63)::timestamp + interval '19 hours') at time zone 'Europe/Berlin', 2, 0),
  ('40000000-0000-0000-0000-0000000000f1', ((current_date + 63)::timestamp + interval '22 hours') at time zone 'Europe/Berlin', 2, 0);

insert into app.match_runs (id, period_id, scheduled_for, started_at, finished_at, status, pool_size, proposed_pairs, report)
values ('40000000-0000-0000-0000-0000000000a0', '40000000-0000-0000-0000-000000000001', now(), now(), now(), 'review', 4, 2, '{"version": 1}');
insert into app.pair_candidates (id, run_id, user_a, user_b, rule_score, llm_score, total_score, subscores, selected)
values ('40000000-0000-0000-0000-0000000000c1', '40000000-0000-0000-0000-0000000000a0',
        '00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004b2', 0.7, 0.8, 0.75, '{"werte": 0.8}', true);
insert into app.pairings (id, run_id, candidate_id, user_a, user_b, total_score, venue_id, venue_reason, reasons_text, review_notes) values
  ('40000000-0000-0000-0000-0000000000b1', '40000000-0000-0000-0000-0000000000a0', '40000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000004a1', '00000000-0000-0000-0000-0000000004b2', 0.75,
   '40000000-0000-0000-0000-0000000000f1', 'Mitte', 'Sie beide mögen Jazz.', '{"empfehlung": "freigeben"}'),
  ('40000000-0000-0000-0000-0000000000b2', '40000000-0000-0000-0000-0000000000a0', null,
   '00000000-0000-0000-0000-0000000004c3', '00000000-0000-0000-0000-0000000004d4', 0.66,
   '40000000-0000-0000-0000-0000000000f1', 'Mitte', 'Sie beide wandern gern.', '{}');

-- ---------------------------------------------------------------------------
-- Zugriff: nur Admin mit Zwei-Faktor
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-0000000004a1');
select throws_ok($$ select * from api.admin_match_runs() $$, '42501', null, 'Mitglied: admin_match_runs verweigert');
select throws_ok($$ select * from api.admin_run_pairings('40000000-0000-0000-0000-0000000000a0') $$, '42501', null,
  'Mitglied: admin_run_pairings verweigert');
select throws_ok($$ select api.admin_approve_pairing('40000000-0000-0000-0000-0000000000b1', null) $$, '42501', null,
  'Mitglied: Freigabe verweigert');
select tests.reset_role();

select tests.act_as('00000000-0000-0000-0000-0000000004ee', 'aal1');
select throws_ok($$ select * from api.admin_match_runs() $$, '42501', null, 'Admin ohne Zwei-Faktor (aal1): verweigert');
select throws_ok($$ select api.admin_approve_pairing('40000000-0000-0000-0000-0000000000b1', null) $$, '42501', null,
  'Admin ohne Zwei-Faktor: keine Freigabe');
select throws_ok($$ select api.admin_finish_run('40000000-0000-0000-0000-0000000000a0', true) $$, '42501', null,
  'Admin ohne Zwei-Faktor: kein Abschluss');
select tests.reset_role();

select tests.act_as_anon();
select throws_ok($$ select * from api.admin_match_runs() $$, '42501', null, 'anon: verweigert');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Admin mit Zwei-Faktor: ansehen, freigeben, ablehnen, abschließen
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-0000000004ee', 'aal2');
select ok((select count(*) from api.admin_match_runs() where id = '40000000-0000-0000-0000-0000000000a0' and pending_review = 2) = 1,
  'admin_match_runs zeigt den Lauf mit zwei offenen Vorschlägen');
select is((select a_display_name || '/' || a_age_band || '/' || b_display_name from api.admin_run_pairings('40000000-0000-0000-0000-0000000000a0')
           where pairing_id = '40000000-0000-0000-0000-0000000000b1'),
  'Anna/' || app.age_band(1988) || '/Ben', 'admin_run_pairings: Anzeigename und Altersband');
select ok((select llm_score = 0.8 and subscores ->> 'werte' = '0.8' from api.admin_run_pairings('40000000-0000-0000-0000-0000000000a0')
           where pairing_id = '40000000-0000-0000-0000-0000000000b1'), 'admin_run_pairings: Scores und Teil-Scores');
select is((select count(*)::int from information_schema.routines r
           join information_schema.parameters p on p.specific_name = r.specific_name
           where r.routine_schema = 'api' and r.routine_name = 'admin_run_pairings' and p.parameter_mode = 'OUT'
             and p.parameter_name in ('user_a', 'user_b', 'email', 'birth_year', 'postal_code')), 0,
  'admin_run_pairings gibt keine IDs, E-Mails, Geburtsjahre oder PLZ der Personen aus');

select ok((api.admin_approve_pairing('40000000-0000-0000-0000-0000000000b1', 'passt') ->> 'evening_id') is not null,
  'Freigabe liefert den neuen Abend');
select tests.reset_role();

select is((select status from app.pairings where id = '40000000-0000-0000-0000-0000000000b1'), 'proposed',
  'Freigegebener Vorschlag hat Status proposed');
select is((select state from app.evenings where pairing_id = '40000000-0000-0000-0000-0000000000b1'), 'proposed',
  'Freigabe legt einen Abend im Zustand proposed an');
select is((select venue_id from app.evenings where pairing_id = '40000000-0000-0000-0000-0000000000b1'),
  '40000000-0000-0000-0000-0000000000f1'::uuid, 'Abend hat das gewählte Lokal');
select is((select jsonb_array_length(proposed_times) from app.evenings where pairing_id = '40000000-0000-0000-0000-0000000000b1'), 3,
  'Abend hat drei Terminvorschläge');
select is((select count(distinct ((t ->> 'starts_at')::timestamptz at time zone 'Europe/Berlin')::date)::int
           from app.evenings e, jsonb_array_elements(e.proposed_times) t
           where e.pairing_id = '40000000-0000-0000-0000-0000000000b1'), 2,
  'Terminvorschläge: zuerst verschiedene Tage, belegter Platz und zu späte Beginnzeit ausgelassen');
select ok((select bool_and((t ->> 'slot_id') is not null) from app.evenings e, jsonb_array_elements(e.proposed_times) t
           where e.pairing_id = '40000000-0000-0000-0000-0000000000b1'), 'Terminvorschläge nennen den Platz (slot_id)');
select is((select reviewed_by from app.pairings where id = '40000000-0000-0000-0000-0000000000b1'),
  '00000000-0000-0000-0000-0000000004ee'::uuid, 'Freigabe vermerkt, wer freigegeben hat');
select ok(exists (select 1 from ops.audit_log where action = 'matching.pairing_approved'
                  and target_id = '40000000-0000-0000-0000-0000000000b1' and actor = '00000000-0000-0000-0000-0000000004ee'),
  'Freigabe steht im Audit-Protokoll');

select tests.act_as('00000000-0000-0000-0000-0000000004ee', 'aal2');
select throws_ok($$ select api.admin_approve_pairing('40000000-0000-0000-0000-0000000000b1', null) $$, '55000', null,
  'Zweite Freigabe desselben Vorschlags wird abgelehnt');
select throws_ok($$ select api.admin_finish_run('40000000-0000-0000-0000-0000000000a0', false) $$, '55000', null,
  'Abschluss mit offenen Vorschlägen nur ausdrücklich');
select is(api.admin_reject_pairing('40000000-0000-0000-0000-0000000000b2', 'Bauchgefühl') ->> 'status', 'rejected',
  'Ablehnung setzt rejected');
select tests.reset_role();
select is((select count(*)::int from app.evenings where pairing_id = '40000000-0000-0000-0000-0000000000b2'), 0,
  'Ablehnung legt keinen Abend an');
select ok(exists (select 1 from ops.audit_log where action = 'matching.pairing_rejected'
                  and target_id = '40000000-0000-0000-0000-0000000000b2'), 'Ablehnung steht im Audit-Protokoll');
select ok(not app.already_paired('00000000-0000-0000-0000-0000000004c3', '00000000-0000-0000-0000-0000000004d4'),
  'Abgelehntes Paar gilt nicht als schon vorgeschlagen (Sperrfrist regelt der Job)');

select tests.act_as('00000000-0000-0000-0000-0000000004ee', 'aal2');
select is(api.admin_finish_run('40000000-0000-0000-0000-0000000000a0', false) ->> 'status', 'partially_approved',
  'Abschluss: teilweise freigegeben');
select throws_ok($$ select api.admin_reject_pairing('40000000-0000-0000-0000-0000000000b2', null) $$, '55000', null,
  'Nach dem Abschluss keine Entscheidungen mehr');
select tests.reset_role();
select is((select report -> 'freigabe' ->> 'freigegeben' from app.match_runs where id = '40000000-0000-0000-0000-0000000000a0'), '1',
  'Abschluss steht im Lauf-Bericht');

-- ---------------------------------------------------------------------------
-- Mitglieder sehen nie Scores
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-0000000004a1');
select is((select reasons_text from app.pairings where id = '40000000-0000-0000-0000-0000000000b1'), 'Sie beide mögen Jazz.',
  'Mitglied sieht „warum Sie beide“ des eigenen Vorschlags');
select throws_ok($$ select total_score from app.pairings $$, '42501', null, 'Mitglied sieht keinen Gesamtscore');
select throws_ok($$ select review_notes, venue_reason from app.pairings $$, '42501', null, 'Mitglied sieht keine Prüfnotizen');
select throws_ok($$ select * from app.pair_candidates $$, '42501', null, 'Mitglied sieht keine Kandidaten und Teil-Scores');
select is((select count(*)::int from app.pairings where id = '40000000-0000-0000-0000-0000000000b2'), 0,
  'Mitglied sieht fremde Vorschläge nicht');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Rolle fermata_matcher: keine privaten oder Art.-9-Tabellen, nur Ja/Nein-Prüffunktionen
-- ---------------------------------------------------------------------------
set local role fermata_matcher;
select throws_ok($$ select * from private.account_facts $$, '42501', null, 'fermata_matcher liest private.account_facts nicht');
select throws_ok($$ select * from sensitive.profile_identity $$, '42501', null, 'fermata_matcher liest Art.-9-Tabellen nicht');
select throws_ok($$ select * from app.evenings $$, '42501', null, 'fermata_matcher liest app.evenings nicht');
select lives_ok($$ select * from sensitive.gender_compatible_pairs(array['00000000-0000-0000-0000-0000000004a1']::uuid[],
                                                                  array['00000000-0000-0000-0000-0000000004b2']::uuid[]) $$,
  'fermata_matcher nutzt die Stapel-Prüffunktion');
reset role;

select * from finish();
rollback;
