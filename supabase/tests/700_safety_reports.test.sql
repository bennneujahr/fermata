-- M7: Melden überall, Beziehungsprüfung, Drossel, vorläufige Sperre bei Null-Toleranz,
-- Absage der Abende mit neutraler Nachricht, Anonymität der meldenden Person, Widerspruch.
begin;
select plan(50);

create function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-000000000' || n)::uuid; $$;
-- Testhilfe: auch als authenticated aufrufbar (Funktionen sind standardmäßig nicht für PUBLIC ausführbar).
grant execute on function pg_temp.u(int) to public;
select tests.create_user('s' || n || '@example.test', pg_temp.u(n)) from generate_series(701, 706) n;
insert into app.accounts (user_id, status) select pg_temp.u(n), 'active' from generate_series(701, 706) n;
insert into billing.memberships (user_id) select pg_temp.u(n) from generate_series(701, 706) n;
insert into billing.evening_ledger (user_id, kind, amount, note) select pg_temp.u(n), 'adjust', 3, 'Testguthaben' from generate_series(701, 706) n;
insert into private.account_facts (user_id, first_name, last_name, birth_date, postal_code) values
  (pg_temp.u(701), 'Ada', 'Meldend', '1991-01-01', '19053'),
  (pg_temp.u(702), 'Bert', 'Gemeldet', '1985-05-05', '19055');
insert into app.venues (id, name, street, postal_code, city, lat, lon) values
  ('70000000-0000-0000-0000-0000000000f1', 'Café Testlokal', 'Am Markt 1', '19055', 'Schwerin', 53.63, 11.41);
insert into app.match_runs (id, scheduled_for, status) values ('70000000-0000-0000-0000-000000000001', now(), 'approved');

create function pg_temp.evening(a uuid, b uuid, starts interval) returns uuid language plpgsql as $$
declare pid uuid; eid uuid;
begin
  insert into app.pairings (run_id, user_a, user_b, total_score, status)
  values ('70000000-0000-0000-0000-000000000001', least(a, b), greatest(a, b), 0.8, 'proposed') returning id into pid;
  insert into app.evenings (pairing_id, user_a, user_b, starts_at, venue_id)
  values (pid, least(a, b), greatest(a, b), app.now() + starts, '70000000-0000-0000-0000-0000000000f1') returning id into eid;
  return eid;
end $$;
create temp table ev (name text primary key, id uuid);
grant select on ev to public;
-- 701 und 702 hatten einen Abend; 702 hat danach einen bestätigten Abend mit 703 und einen offenen Vorschlag mit 705.
insert into ev values ('ab', pg_temp.evening(pg_temp.u(701), pg_temp.u(702), interval '-1 day'));
select app.evening_transition((select id from ev where name = 'ab'), 'request_time', pg_temp.u(701));
select app.evening_transition((select id from ev where name = 'ab'), 'confirm', pg_temp.u(702));
select app.evening_transition((select id from ev where name = 'ab'), 'happened');
insert into ev values ('bc', pg_temp.evening(pg_temp.u(702), pg_temp.u(703), interval '3 days'));
select app.evening_transition((select id from ev where name = 'bc'), 'request_time', pg_temp.u(702));
select app.evening_transition((select id from ev where name = 'bc'), 'confirm', pg_temp.u(703));
insert into ev values ('be', pg_temp.evening(pg_temp.u(702), pg_temp.u(705), interval '6 days'));

-- ---------------------------------------------------------------------------
-- Wer darf wen melden?
-- ---------------------------------------------------------------------------
select tests.act_as_anon();
select throws_ok($$ select api.report('abend', 'bedrohung', null, null, 'x', true) $$, '42501', null, 'Ohne Anmeldung kein Melden');
select tests.reset_role();

select tests.act_as(pg_temp.u(701));
select throws_ok($$ select api.report('abend', 'belaestigung', '00000000-0000-0000-0000-000000000704', null, 'x', true) $$,
  '42501', 'Sie können nur Personen melden, die Sie über Fermata kennen.', 'Unbekannte Person kann nicht gemeldet werden');
select throws_ok($$ select api.report('abend', 'belaestigung', '00000000-0000-0000-0000-000000000701', null, 'x', true) $$,
  '22023', null, 'Sich selbst melden geht nicht');
select throws_ok($$ select api.report('abend', 'kaputt', null, null, 'x', true) $$, '22023', null, 'Unbekannte Art wird abgelehnt');
select throws_ok(format('select api.report(%L, %L, %L, %L, %L, true)', 'abend', 'belaestigung', pg_temp.u(702), (select id from ev where name = 'bc'), 'x'),
  'P0002', null, 'Fremder Abend: nicht gefunden');

-- Meldung ohne Null-Toleranz
create temp table res (k text primary key, v jsonb);
grant select, insert on res to public;
insert into res values ('r1', api.report('abend', 'belaestigung', pg_temp.u(702), (select id from ev where name = 'ab'),
  'Hat mich nach dem Abend mehrfach angesprochen.', true));
select is((select v ->> 'status' from res where k = 'r1'), 'open', 'Meldung angenommen');
select ok(((select v ->> 'due_at' from res where k = 'r1')::timestamptz - app.now()) between interval '23 hours 59 minutes' and interval '24 hours 1 minute',
  'Frist: safety.report_response_hours (24 h)');
select is((select v ->> 'severity' from res where k = 'r1'), 'hoch', 'Belästigung: Stufe hoch');
select is((select count(*)::int from api.my_reports()), 1, 'Meldende Person sieht ihre Meldung');
select tests.reset_role();

select is((select count(*)::int from safety.safety_flags where details ->> 'report_id' = (select v ->> 'report_id' from res where k = 'r1')), 1,
  'Hinweis für Benn angelegt');
select is((select count(*)::int from safety.mail_queue where recipient_user = pg_temp.u(701) and template = 'safety.report_received'), 1,
  'Bestätigungs-Mail an die meldende Person');
select is((select count(*)::int from safety.mail_queue where to_admin and template = 'safety.admin_alert'), 1, 'Hinweis-Mail an Benn (Stufe hoch)');
select ok(not safety.is_suspended(pg_temp.u(702)), 'Keine Null-Toleranz: keine vorläufige Sperre');
select is((select state from app.evenings where id = (select id from ev where name = 'bc')), 'confirmed', 'Abende bleiben bestehen');

-- ---------------------------------------------------------------------------
-- Null-Toleranz: sofort vorläufig sperren
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(701));
insert into res values ('r2', api.report('abend', 'bedrohung', pg_temp.u(702), (select id from ev where name = 'ab'),
  'Er hat mir gedroht.', true));
select tests.reset_role();
select is((select v ->> 'severity' from res where k = 'r2'), 'akut', 'Bedrohung: Stufe akut');
select ok(safety.is_suspended(pg_temp.u(702)), 'Gemeldete Person ist sofort vorläufig gesperrt');
select is((select kind from safety.sanctions where user_id = pg_temp.u(702)), 'vorlaeufige_sperre', 'Sanktion: vorläufige Sperre');
select is((select status from app.accounts where user_id = pg_temp.u(702)), 'suspended', 'Konto steht auf suspended');
select is((select state from app.evenings where id = (select id from ev where name = 'bc')), 'cancelled_early', 'Bestätigter Abend ist abgesagt');
select is((select state from app.evenings where id = (select id from ev where name = 'be')), 'declined', 'Offener Vorschlag ist abgesagt');
select is((select state from app.evenings where id = (select id from ev where name = 'ab')), 'happened', 'Vergangener Abend bleibt unverändert');
select is(billing.available_evenings(pg_temp.u(703)), 3, 'Gegenüber bekommt den gebundenen Abend zurück');
select ok(not billing.can_receive_proposal(pg_temp.u(702)), 'Gesperrte Person bekommt keine Vorschläge');
select is((select count(*)::int from safety.mail_queue where template = 'safety.evening_cancelled' and recipient_user in (pg_temp.u(703), pg_temp.u(705))), 2,
  'Beide Gegenüber werden benachrichtigt');
select ok((select bool_and(not (data::text ~* '(meld|sperr|bedroh|report|sanktion)') and not (data::text like '%' || pg_temp.u(702)::text || '%'))
           from safety.mail_queue where template = 'safety.evening_cancelled'),
  'Nachricht an das Gegenüber ist neutral (kein Grund, keine Person)');
select is((select count(*)::int from safety.mail_queue where recipient_user = pg_temp.u(702) and template = 'safety.account_suspended'), 1,
  'Gemeldete Person wird neutral informiert');
select is((select count(*)::int from safety.safety_flags where kind = 'vorlaeufige_sperre' and severity = 'akut' and user_id = pg_temp.u(702)), 1,
  'Akuter Hinweis für Benn');
select is((select count(*)::int from safety.mail_queue where to_admin and data ->> 'kind' = 'meldung' and (data ->> 'provisional_suspension')::boolean), 1,
  'Eine Sofort-Mail an Benn nennt Meldung und vorläufige Sperre');
select is((select count(*)::int from safety.mail_queue where to_admin and data ->> 'kind' = 'vorlaeufige_sperre'), 0, 'Keine doppelte Mail');
select is((select count(*)::int from app.evening_events where event = 'cancel_admin' and details ->> 'notify_by' = 'safety'), 2,
  'Absagen tragen den Hinweis für M5, dass Sicherheit benachrichtigt');

-- ---------------------------------------------------------------------------
-- Anonymität: die gemeldete Person erfährt nie, wer gemeldet hat
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(702));
select throws_ok($$ select * from safety.reports $$, '42501', null, 'Gemeldete Person kann Meldungen nicht lesen');
select throws_ok($$ select * from safety.safety_flags $$, '42501', null, 'Gemeldete Person kann Hinweise nicht lesen');
select throws_ok($$ select * from app.evening_events $$, '42501', null, 'Verlauf der Abende ist nicht lesbar');
select is((select count(*)::int from api.my_reports()), 0, 'Keine Meldungen über sich selbst sichtbar');
select is((select count(*)::int from api.my_sanctions()), 1, 'Eigene Sanktion ist sichtbar');
select ok((select bool_and(reason not like '%Ada%' and reason not like '%' || '00000000-0000-0000-0000-000000000701' || '%') from api.my_sanctions()),
  'Begründung nennt die meldende Person nicht');
select ok((select bool_and(cancelled_by is null and cancel_reason is null) from app.evenings where state in ('cancelled_early', 'declined')),
  'Abgesagte Abende zeigen weder Absender noch Grund');
select tests.reset_role();
select ok((select bool_and(not (data::text like '%' || pg_temp.u(701)::text || '%') and not (data ? 'report_id'))
           from safety.mail_queue where recipient_user = pg_temp.u(702)), 'Mail an die gemeldete Person enthält keinen Hinweis auf die Meldung');

-- ---------------------------------------------------------------------------
-- Null-Toleranz ohne Beziehung (Bereich „sonstiges“): angenommen, aber keine automatische Sperre
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(704));
insert into res values ('r3', api.report('sonstiges', 'uebergriff', pg_temp.u(703), null, 'Kenne die Person von anderswo.', true));
select tests.reset_role();
select is((select related from safety.reports where id = (select (v ->> 'report_id')::uuid from res where k = 'r3')), false,
  'Meldung ohne Beziehung ist als solche gekennzeichnet');
select ok(not safety.is_suspended(pg_temp.u(703)), 'Ohne Beziehung keine automatische Sperre (Schutz vor Missbrauch)');

-- ---------------------------------------------------------------------------
-- Drossel
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(701));
select api.report('sonstiges', 'sonstiges', null, null, 'Hinweis ' || n, false) from generate_series(1, 3) n;
select throws_ok($$ select api.report('sonstiges', 'sonstiges', null, null, 'zu viel', false) $$, 'P0001', null, 'Drossel: höchstens 5 Meldungen in 24 Stunden');
select tests.reset_role();
select ops.sim_clock_advance(interval '25 hours');
select tests.act_as(pg_temp.u(701));
select lives_ok($$ select api.report('sonstiges', 'sonstiges', null, null, 'nächster Tag', false) $$, 'Am nächsten Tag geht es wieder');
select tests.reset_role();
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- Widerspruch
-- ---------------------------------------------------------------------------
create temp table sid as select id from safety.sanctions where user_id = pg_temp.u(702);
grant select on sid to public;
select tests.act_as(pg_temp.u(702));
select throws_ok($$ select api.appeal((select id from sid), 'kurz') $$, '22023', null, 'Widerspruch braucht mindestens 10 Zeichen');
select lives_ok($$ select api.appeal((select id from sid), 'Das stimmt so nicht, ich bitte um Prüfung.') $$, 'Widerspruch eingelegt');
select throws_ok($$ select api.appeal((select id from sid), 'Noch ein zweiter Widerspruch dazu.') $$,
  'P0001', 'Gegen diese Sanktion haben Sie bereits Widerspruch eingelegt.', 'Nur ein Widerspruch je Sanktion');
select is((select count(*)::int from api.my_appeals()), 1, 'Eigener Widerspruch sichtbar');
select tests.reset_role();
select tests.act_as(pg_temp.u(701));
select throws_ok($$ select api.appeal((select id from sid), 'Fremde Sanktion anfechten geht nicht.') $$, 'P0002', null, 'Fremde Sanktion: nicht gefunden');
select tests.reset_role();
select is((select count(*)::int from safety.safety_flags where kind = 'widerspruch' and severity = 'hoch'), 1, 'Widerspruch gegen Sperre: Hinweis hoch für Benn');
select is((select count(*)::int from safety.mail_queue where template = 'safety.appeal_received' and recipient_user = pg_temp.u(702)), 1,
  'Eingangsbestätigung für den Widerspruch');

-- Interne Funktionen sind für Mitglieder gesperrt
select tests.act_as(pg_temp.u(701));
select throws_ok($$ select safety.provisional_suspend('00000000-0000-0000-0000-000000000703', null) $$, '42501', null,
  'Mitglieder können niemanden direkt sperren');
select tests.reset_role();

select * from finish();
rollback;
