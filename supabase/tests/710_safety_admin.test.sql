-- M7: Admin-Funktionen (nur aal2), Entscheidungen, Sanktionen, Sperrliste, Widersprüche, Hinweise,
-- Vorlage für eine Polizeimeldung, Ablauf befristeter Sperren.
begin;
select plan(50);

create function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-000000000' || n)::uuid; $$;
-- Testhilfe: auch als authenticated aufrufbar (Funktionen sind standardmäßig nicht für PUBLIC ausführbar).
grant execute on function pg_temp.u(int) to public;
select tests.create_user('t' || n || '@example.test', pg_temp.u(n)) from generate_series(711, 715) n;
select tests.create_user('benn@example.test', pg_temp.u(719));
insert into app.admin_users (user_id, display_name) values (pg_temp.u(719), 'Benn');
insert into app.accounts (user_id, status) select pg_temp.u(n), 'active' from generate_series(711, 715) n;
insert into billing.memberships (user_id) select pg_temp.u(n) from generate_series(711, 715) n;
insert into billing.evening_ledger (user_id, kind, amount, note) select pg_temp.u(n), 'adjust', 3, 'Testguthaben' from generate_series(711, 715) n;
insert into private.account_facts (user_id, first_name, last_name, birth_date, postal_code, city) values
  (pg_temp.u(711), 'Clara', 'Meldet', '1992-02-02', '19053', 'Schwerin'),
  (pg_temp.u(712), 'Dirk', 'Beschuldigt', '1980-08-08', '23966', 'Wismar'),
  (pg_temp.u(713), 'Emil', 'Ausschluss', '1979-07-07', '19370', 'Parchim');
insert into app.venues (id, name, street, postal_code, city, lat, lon) values
  ('71000000-0000-0000-0000-0000000000f1', 'Weinstube am See', 'Seestraße 5', '19053', 'Schwerin', 53.62, 11.42);
insert into app.match_runs (id, scheduled_for, status) values ('71000000-0000-0000-0000-000000000001', now(), 'approved');
create function pg_temp.evening(a uuid, b uuid, starts interval) returns uuid language plpgsql as $$
declare pid uuid; eid uuid;
begin
  insert into app.pairings (run_id, user_a, user_b, total_score, status)
  values ('71000000-0000-0000-0000-000000000001', least(a, b), greatest(a, b), 0.8, 'proposed') returning id into pid;
  -- Seit M5 braucht eine Bestätigung einen freien Tisch im Lokal: Platz zur Abendzeit anlegen.
  insert into app.venue_slots (venue_id, starts_at, tables) values ('71000000-0000-0000-0000-0000000000f1', app.now() + starts, 1)
  on conflict (venue_id, starts_at) do update set tables = app.venue_slots.tables + 1;
  insert into app.evenings (pairing_id, user_a, user_b, starts_at, venue_id)
  values (pid, least(a, b), greatest(a, b), app.now() + starts, '71000000-0000-0000-0000-0000000000f1') returning id into eid;
  return eid;
end $$;
create temp table x (k text primary key, id uuid);
grant select, insert on x to public;
insert into x values ('e_cd', pg_temp.evening(pg_temp.u(711), pg_temp.u(712), interval '-2 hours'));
select app.evening_transition((select id from x where k = 'e_cd'), 'request_time', pg_temp.u(711));
select app.evening_transition((select id from x where k = 'e_cd'), 'confirm', pg_temp.u(712));
insert into x values ('e_d4', pg_temp.evening(pg_temp.u(712), pg_temp.u(714), interval '4 days'));
select app.evening_transition((select id from x where k = 'e_d4'), 'request_time', pg_temp.u(712));
select app.evening_transition((select id from x where k = 'e_d4'), 'confirm', pg_temp.u(714));
insert into x values ('e_e5', pg_temp.evening(pg_temp.u(713), pg_temp.u(715), interval '-3 days'));

-- Clara meldet Dirk (Übergriff beim Abend) → vorläufige Sperre
select tests.act_as(pg_temp.u(711));
insert into x values ('r1', ((api.report('abend', 'uebergriff', pg_temp.u(712), (select id from x where k = 'e_cd'),
  'Er hat mich beim Abschied gegen meinen Willen festgehalten.', true)) ->> 'report_id')::uuid);
select tests.reset_role();
select ok(safety.is_suspended(pg_temp.u(712)), 'Vorläufige Sperre nach der Meldung');

-- ---------------------------------------------------------------------------
-- Admin nur mit Zwei-Faktor
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(711));
select throws_ok($$ select * from api.admin_reports() $$, '42501', null, 'Mitglieder: keine Admin-Liste');
select tests.reset_role();
select tests.act_as(pg_temp.u(719), 'aal1');
select throws_ok($$ select * from api.admin_reports() $$, '42501', null, 'Admin ohne Zwei-Faktor: abgelehnt');
select throws_ok($$ select api.admin_police_report_template((select id from x where k = 'r1')) $$, '42501', null, 'Polizeivorlage nur mit Zwei-Faktor');
select throws_ok($$ select api.admin_impose_sanction('00000000-0000-0000-0000-000000000712', 'sperre', 'Test') $$, '42501', null, 'Sanktion nur mit Zwei-Faktor');
select tests.reset_role();

select tests.act_as(pg_temp.u(719), 'aal2');
select is((select count(*)::int from api.admin_reports()), 1, 'Admin sieht die offene Meldung');
select is((select reporter_name from api.admin_reports()), 'Clara Meldet', 'Admin sieht, wer gemeldet hat');
select is((select category_label from api.admin_reports()), 'Übergriff', 'Kategorie in Klartext');
select is((select active_sanction from api.admin_reports()), 'vorlaeufige_sperre', 'Aktive Sanktion der gemeldeten Person');
select is((api.admin_report((select id from x where k = 'r1'))) -> 'evening' -> 'venue' ->> 'name', 'Weinstube am See', 'Detail mit Lokal des Abends');
select lives_ok($$ select api.admin_set_report_status((select id from x where k = 'r1'), 'in_review') $$, 'Meldung in Prüfung');

-- Vorlage für die Polizei
create temp table tpl as select api.admin_police_report_template((select id from x where k = 'r1')) as t;
select ok((select t like 'ENTWURF%' from tpl), 'Vorlage ist als ENTWURF gekennzeichnet');
select ok((select t like '%entscheiden Sie (Benn)%' from tpl), 'Erinnerung: Benn entscheidet über die Anzeige');
select ok((select t like '%Weinstube am See, Seestraße 5, 19053 Schwerin%' from tpl), 'Tatort aus dem Abend');
select ok((select t like '%Dirk Beschuldigt%' and t like '%08.08.1980%' from tpl), 'Angaben zur beschuldigten Person');
select ok((select t not like '%Clara%' and t like '%NUR MIT AUSDRÜCKLICHEM EINVERSTÄNDNIS%' from tpl),
  'Meldende Person nur als Platzhalter (Einverständnis)');
select ok((select t like '%gegen meinen Willen festgehalten%' from tpl), 'Schilderung aus der Meldung');
select ok((select t like '%[ZUSTÄNDIGE POLIZEIDIENSTSTELLE%' from tpl), 'Platzhalter für fehlende Angaben');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Entscheidung: nicht bestätigt → vorläufige Sperre wird aufgehoben
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(719), 'aal2');
select throws_ok($$ select api.admin_decide_report((select id from x where k = 'r1'), 'dismissed', '') $$, '22023', null, 'Begründung ist Pflicht');
select is((api.admin_decide_report((select id from x where k = 'r1'), 'dismissed', 'Nach Gesprächen mit beiden nicht bestätigt.')) ->> 'lifted_provisional',
  '1', 'Abgewiesen: vorläufige Sperre aufgehoben');
select tests.reset_role();
select ok(not safety.is_suspended(pg_temp.u(712)), 'Person ist nicht mehr gesperrt');
select is((select status from app.accounts where user_id = pg_temp.u(712)), 'active', 'Konto wieder aktiv');
select is((select count(*)::int from safety.mail_queue where recipient_user = pg_temp.u(711) and template = 'safety.report_closed'), 1,
  'Meldende Person erfährt den Abschluss (ohne Einzelheiten)');
select is((select count(*)::int from safety.safety_flags where details ->> 'report_id' = (select id from x where k = 'r1')::text and reviewed_at is null), 0,
  'Zugehörige Hinweise sind erledigt');
select ok(exists (select 1 from ops.audit_log where action = 'safety.report_decided'), 'Entscheidung im Audit-Protokoll');

-- ---------------------------------------------------------------------------
-- Befristete Sperre
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(719), 'aal2');
insert into x values ('s1', ((api.admin_impose_sanction(pg_temp.u(712), 'sperre', 'Wiederholt unangemessenes Verhalten.', app.now() + interval '7 days')) ->> 'sanction_id')::uuid);
select tests.reset_role();
select ok(safety.is_suspended(pg_temp.u(712)), 'Sperre wirkt sofort');
select is((select state from app.evenings where id = (select id from x where k = 'e_d4')), 'cancelled_early', 'Bevorstehender Abend abgesagt');
select is((select state from app.evenings where id = (select id from x where k = 'e_cd')), 'confirmed', 'Bereits begonnener Abend bleibt unberührt');
select is((select count(*)::int from safety.mail_queue where recipient_user = pg_temp.u(712) and template = 'safety.sanction_notice'), 1,
  'Person wird über die Sperre informiert');
select ops.sim_clock_advance(interval '8 days');
select is(safety.release_expired_sanctions(), 1, 'Nach Ablauf: Sperre endet automatisch');
select is((select status from app.accounts where user_id = pg_temp.u(712)), 'active', 'Konto nach Ablauf wieder aktiv');
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- Ausschluss mit Sperrliste
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(719), 'aal2');
insert into x values ('s2', ((api.admin_impose_sanction(pg_temp.u(713), 'ausschluss', 'Schwerer Verstoß gegen die Regeln.')) ->> 'sanction_id')::uuid);
select tests.reset_role();
select ok(safety.is_suspended(pg_temp.u(713)), 'Ausschluss sperrt dauerhaft');
select is((select name_hash from safety.blocklist where sanction_id = (select id from x where k = 's2')),
  safety.blocklist_name_hash('Emil', 'Ausschluss', '1979-07-07'), 'Ausschluss: Namens-Hash auf der Sperrliste');
select ok((select doc_hash is null and note like '%nachtragen%' from safety.blocklist where sanction_id = (select id from x where k = 's2')),
  'Ohne gespeicherten Prüf-Hash: doc_hash leer, Hinweis zum Nachtragen');
select ok((select bool_and(name_hash !~* '(emil|ausschluss)') from safety.blocklist), 'Sperrliste enthält nur Hashes');

-- Mit Hash aus der Ausweisprüfung (M2 legt ihn in safety.verification_hashes ab)
insert into safety.verification_hashes (user_id, doc_hash) values (pg_temp.u(715), safety.blocklist_doc_hash('L01X00T47', '1990-01-01'));
select tests.act_as(pg_temp.u(719), 'aal2');
insert into x values ('s3', ((api.admin_impose_sanction(pg_temp.u(715), 'ausschluss', 'Betrug.', null, null, 'betrug')) ->> 'sanction_id')::uuid);
select throws_ok($$ select api.admin_impose_sanction('00000000-0000-0000-0000-000000000714', 'ausschluss', 'Ohne Daten.') $$,
  'P0001', null, 'Ausschluss ohne Daten für die Sperrliste wird abgelehnt');
select throws_ok($$ select api.admin_impose_sanction('00000000-0000-0000-0000-000000000714', 'sperre', 'Test', now() - interval '1 day') $$,
  '22023', null, 'Ende in der Vergangenheit wird abgelehnt');
select tests.reset_role();
select is((select doc_hash from safety.blocklist where sanction_id = (select id from x where k = 's3')),
  safety.blocklist_doc_hash('L01 X00 T47', '1990-01-01'), 'Ausweis-Hash aus der Prüfung landet auf der Sperrliste (Schreibweise egal)');
select is((select reason_code from safety.blocklist where sanction_id = (select id from x where k = 's3')), 'betrug', 'Grund der Sperrliste');

-- Ausschluss aufheben: Sperrliste und Konto zurück
select tests.act_as(pg_temp.u(719), 'aal2');
select ok(api.admin_lift_sanction((select id from x where k = 's2'), 'Fehlentscheidung korrigiert.'), 'Ausschluss aufgehoben');
select tests.reset_role();
select is((select count(*)::int from safety.blocklist where sanction_id = (select id from x where k = 's2')), 0, 'Eintrag auf der Sperrliste entfernt');
select is((select status from app.accounts where user_id = pg_temp.u(713)), 'active', 'Konto wieder aktiv');

-- ---------------------------------------------------------------------------
-- Widerspruch entscheiden
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(719), 'aal2');
insert into x values ('s4', ((api.admin_impose_sanction(pg_temp.u(714), 'hinweis', 'Bitte pünktlich absagen.')) ->> 'sanction_id')::uuid);
select tests.reset_role();
select ok(not safety.is_suspended(pg_temp.u(714)), 'Hinweis sperrt nicht');
select tests.act_as(pg_temp.u(714));
insert into x values ('a1', ((api.appeal((select id from x where k = 's4'), 'Ich hatte rechtzeitig abgesagt, bitte prüfen.')) ->> 'appeal_id')::uuid);
select tests.reset_role();
select tests.act_as(pg_temp.u(719), 'aal2');
select is((select count(*)::int from api.admin_appeals('open')), 1, 'Offener Widerspruch in der Liste');
select is((api.admin_decide_appeal((select id from x where k = 'a1'), 'accepted', 'Sie haben recht, der Hinweis ist aufgehoben.')) ->> 'sanction_lifted',
  'true', 'Widerspruch angenommen: Sanktion aufgehoben');
select throws_ok($$ select api.admin_decide_appeal((select id from x where k = 'a1'), 'rejected', 'nochmal') $$, 'P0002', null, 'Schon entschieden');
select tests.reset_role();
select is((select data ->> 'decision' from safety.mail_queue where recipient_user = pg_temp.u(714) and template = 'safety.appeal_decided'),
  'accepted', 'Entscheidung per Mail');

-- ---------------------------------------------------------------------------
-- Hinweise prüfen (z. B. vom Sicherheits-Agenten im Gespräch, M3)
-- ---------------------------------------------------------------------------
insert into safety.safety_flags (user_id, source, kind, severity, details) values (pg_temp.u(715), 'agent', 'krise', 'hoch', '{}');
select tests.act_as(pg_temp.u(719), 'aal2');
select ok((select count(*) from api.admin_safety_flags(true)) >= 1, 'Offene Hinweise sichtbar');
select ok(api.admin_review_flag((select f.id from api.admin_safety_flags(true) f limit 1), 'geprüft, nichts zu tun'),
  'Hinweis als geprüft markiert');
select ok((select count(*) from api.admin_sanctions(pg_temp.u(712), false)) >= 2, 'Sanktionsverlauf einer Person');
select tests.reset_role();

select * from finish();
rollback;
