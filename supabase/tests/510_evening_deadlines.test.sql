-- M5: Feste 24-Stunden-Fristen (lapse in jeder Phase), Erinnerung vor Ablauf, idempotenter Fristen-Job.
begin;
\ir 500_fixtures.sql
select * from no_plan();
select tests.m5_setup();

-- ---------------------------------------------------------------------------
-- 1. Niemand wählt eine Zeit: nach 24 h lapsed
-- ---------------------------------------------------------------------------
select tests.m5_new_evening(tests.m5_id('anna'), tests.m5_id('ben'), array[tests.m5_at(4, '19:00')]) as e1 \gset
select ops.sim_clock_advance(interval '19 hours 59 minutes');
select ops.process_evening_deadlines();
select is(tests.m5_count('evening.deadline_reminder', null, :'e1'), 0, 'Vor der Erinnerungszeit: nichts');
select ops.sim_clock_advance(interval '1 minute');
select ops.process_evening_deadlines();
select is(tests.m5_count('evening.deadline_reminder', null, :'e1'), 2, '4 h vor Ablauf: Erinnerung an beide');
select ok((select bool_and(has_deadline) from ops.notification_queue where template = 'evening.deadline_reminder' and evening_id = :'e1'),
  'Erinnerung mit Frist geht immer auch per E-Mail');
select ops.sim_clock_advance(interval '3 hours 59 minutes');
select ops.process_evening_deadlines();
select is((select state from app.evenings where id = :'e1'), 'proposed', '1 Minute vor Ablauf noch offen');
select ops.sim_clock_advance(interval '1 minute');
select is((ops.process_evening_deadlines() ->> 'done')::int, 1, 'Fristen-Job erledigt genau die fällige Frist');
select is((select state from app.evenings where id = :'e1'), 'lapsed', 'Nach 24 h: lapsed');
select is((select actor from app.evening_events where evening_id = :'e1' and event = 'lapse'), null, 'lapse kommt vom System');
select is(tests.m5_count('evening.lapsed', null, :'e1'), 2, 'Beide erfahren vom Ablauf');
select is((select status from app.pairings where id = (select pairing_id from app.evenings where id = :'e1')), 'expired', 'Vorschlag expired');
select is((ops.process_evening_deadlines() ->> 'done')::int, 0, 'Zweiter Lauf: nichts mehr zu tun');
select is(tests.m5_count('evening.lapsed', null, :'e1'), 2, 'Keine doppelten Nachrichten');
select is((select count(*)::int from app.evening_deadlines where evening_id = :'e1' and done_at is null and cancelled_at is null), 0,
  'Keine offenen Fristen');
select tests.act_as(tests.m5_id('anna'));
select is(tests.hint_of(format('select api.evening_request_time(%L, %L::timestamptz[])', :'e1', array[tests.m5_at(4, '19:00')])),
  'invalid_state', 'Nach Ablauf keine Wunschzeit mehr');
select is((select my_action from api.my_evenings() where evening_id = :'e1'), 'none', 'Nichts mehr zu tun');
select tests.reset_role();
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- 2. Wunschzeit gesendet, Gegenüber antwortet nicht: lapsed nach 24 h
-- ---------------------------------------------------------------------------
select tests.m5_new_evening(tests.m5_id('cem'), tests.m5_id('emil'), array[tests.m5_at(4, '19:00')]) as e2 \gset
select ops.sim_clock_advance(interval '10 hours');
select tests.act_as(tests.m5_id('cem'));
select api.evening_request_time(:'e2', array[tests.m5_at(4, '19:00')]);
select tests.reset_role();
select ops.sim_clock_advance(interval '20 hours');
select ops.process_evening_deadlines();
select is((select state from app.evenings where id = :'e2'), 'time_requested', 'Frist läuft ab der Wunschzeit, nicht ab dem Vorschlag');
select is(tests.m5_count('evening.deadline_reminder', tests.m5_id('emil'), :'e2'), 1, 'Erinnerung nur an Emil, der antworten muss');
select is(tests.m5_count('evening.deadline_reminder', tests.m5_id('cem'), :'e2'), 0, 'Cem wartet und bekommt keine Erinnerung');
select ops.sim_clock_advance(interval '4 hours');
select ops.process_evening_deadlines();
select is((select state from app.evenings where id = :'e2'), 'lapsed', 'Keine Antwort in 24 h: lapsed');
select is((select details ->> 'waiting_for' from app.evening_events where evening_id = :'e2' and event = 'lapse'),
  tests.m5_id('emil')::text, 'Verlauf hält fest, auf wen gewartet wurde');
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- 3. Alternative gesendet, erste Person antwortet nicht: lapsed
-- ---------------------------------------------------------------------------
select tests.m5_new_evening(tests.m5_id('anna'), tests.m5_id('fritz'), array[tests.m5_at(4, '19:00'), tests.m5_at(4, '20:00')]) as e3 \gset
select tests.act_as(tests.m5_id('fritz'));
select api.evening_request_time(:'e3', array[tests.m5_at(4, '19:00')]);
select tests.reset_role();
select ops.sim_clock_advance(interval '23 hours 59 minutes');
select tests.act_as(tests.m5_id('anna'));
select api.evening_counter(:'e3', array[tests.m5_at(4, '20:00')]);
select tests.reset_role();
select ops.sim_clock_advance(interval '2 minutes');
select ops.process_evening_deadlines();
select is((select state from app.evenings where id = :'e3'), 'time_countered', 'Alternative startet eine neue Frist');
select ops.sim_clock_advance(interval '23 hours 58 minutes');
select ops.process_evening_deadlines();
select is((select state from app.evenings where id = :'e3'), 'lapsed', 'Keine Antwort auf die Alternative: lapsed');
select is((select details ->> 'waiting_for' from app.evening_events where evening_id = :'e3' and event = 'lapse'),
  tests.m5_id('fritz')::text, 'Gewartet wurde auf Fritz');
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- 4. Zweite Alternative (time_countered → time_requested) und Rundenbegrenzung
-- ---------------------------------------------------------------------------
select tests.m5_new_evening(tests.m5_id('ben'), tests.m5_id('cem'),
  array[tests.m5_at(4, '19:00'), tests.m5_at(4, '19:30'), tests.m5_at(4, '20:00')]) as e4 \gset
select tests.act_as(tests.m5_id('ben'));
select api.evening_request_time(:'e4', array[tests.m5_at(4, '19:00')]);
select tests.reset_role();
select tests.act_as(tests.m5_id('cem'));
select api.evening_counter(:'e4', array[tests.m5_at(4, '19:30')]);
select tests.reset_role();
select tests.act_as(tests.m5_id('ben'));
select is(api.evening_counter(:'e4', array[tests.m5_at(4, '20:00')]) ->> 'state', 'time_requested',
  'Gegenvorschlag auf die Alternative: wieder time_requested');
select ok((api.evening_detail(:'e4') ->> 'requested_by_me')::boolean, 'Ben bleibt die wünschende Person');
select tests.reset_role();
select tests.act_as(tests.m5_id('cem'));
select is(api.evening_counter(:'e4', array[tests.m5_at(4, '19:00')]) ->> 'state', 'time_countered', 'Vierte Runde');
select tests.reset_role();
select tests.act_as(tests.m5_id('ben'));
select is((api.evening_detail(:'e4') ->> 'rounds_left')::int, 0, 'Keine Runde mehr übrig');
select is(tests.hint_of(format('select api.evening_counter(%L, %L::timestamptz[])', :'e4', array[tests.m5_at(4, '20:00')])),
  'max_rounds', 'Nach evening.max_time_rounds nur noch bestätigen oder absagen');
select is(api.evening_confirm(:'e4', tests.m5_at(4, '19:00')) ->> 'state', 'confirmed', 'Bestätigen geht weiter');
select tests.reset_role();
select is((select count(*)::int from app.evening_deadlines where evening_id = :'e4' and kind = 'time_answer' and done_at is null and cancelled_at is null), 0,
  'Nach der Bestätigung keine Antwort-Frist mehr');

-- ---------------------------------------------------------------------------
-- 5. Fehler in einer Frist blockiert die anderen nicht
-- ---------------------------------------------------------------------------
select tests.m5_new_evening(tests.m5_id('emil'), tests.m5_id('fritz'), array[tests.m5_at(5, '19:00')]) as e5 \gset
-- Kaputte Frist (unbekannte Nutzer-ID in der Erinnerung) neben einer gültigen
insert into app.evening_deadlines (evening_id, kind, due_at, payload)
values (:'e5', 'reminder', app.now() - interval '1 minute',
        jsonb_build_object('type', 'deadline', 'state', 'proposed', 'users', jsonb_build_array('kein-uuid')));
select ops.sim_clock_advance(interval '24 hours 1 minute');
select is((ops.process_evening_deadlines() ->> 'failed')::int, 1, 'Fehlerhafte Frist wird gezählt');
select is((select state from app.evenings where id = :'e5'), 'lapsed', 'Gültige Frist wurde trotzdem erledigt');
select is((select attempts from app.evening_deadlines where evening_id = :'e5' and kind = 'reminder' and payload -> 'users' ? 'kein-uuid'), 1,
  'Fehlversuch protokolliert');
select ok((select last_error is not null from app.evening_deadlines where evening_id = :'e5' and kind = 'reminder' and payload -> 'users' ? 'kein-uuid'),
  'Fehlermeldung gespeichert');

select * from finish();
rollback;
