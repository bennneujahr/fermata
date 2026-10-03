-- M5: Ganzer Ablauf mit Testuhr: proposed → request → counter → confirm → Erinnerungen → Check-in →
-- Rückmeldung → happened, Kontakttausch und Nachbesprechung.
begin;
\ir 500_fixtures.sql
select * from no_plan();
select tests.m5_setup();

-- ---------------------------------------------------------------------------
-- Vorschlag (wie vom Auswahl-Job eingefügt)
-- ---------------------------------------------------------------------------
select tests.m5_new_evening(tests.m5_id('anna'), tests.m5_id('ben'),
  array[tests.m5_at(4, '19:00'), tests.m5_at(4, '19:30'), tests.m5_at(5, '19:00'), tests.m5_at(6, '19:00')]) as e1 \gset

select is((select count(*)::int from app.evening_deadlines where evening_id = :'e1' and kind = 'time_request'
            and due_at = app.now() + interval '24 hours' and done_at is null), 1,
  'Vorschlag startet die 24-Stunden-Frist time_request');
select is((select count(*)::int from app.evening_deadlines where evening_id = :'e1' and kind = 'reminder'
            and payload ->> 'type' = 'deadline' and due_at = app.now() + interval '20 hours'), 1,
  'Erinnerung 4 Stunden vor Ablauf der Frist ist geplant');
select is(tests.m5_count('evening.proposed', null, :'e1'), 2, 'Beide bekommen „Vorschlag für einen Abend“');
select ok((select bool_and(q.has_deadline and q.channel = 'both') from ops.notification_queue q
            where q.evening_id = :'e1' and q.template = 'evening.proposed'), 'Nachricht mit Frist: E-Mail und Push');
select ok((select bool_and((select array_agg(k order by k) from jsonb_object_keys(q.payload) k) <@ array['evening_id', 'require_state'])
             from ops.notification_queue q where q.evening_id = :'e1'),
  'Warteschlange enthält nur IDs und Parameter, keine Personendaten');

-- Inhalt beim Versand: Lokal, „warum Sie beide“, höchstens 3 Uhrzeiten, kein Name des Gegenübers
select (select id from ops.notification_queue where evening_id = :'e1' and template = 'evening.proposed'
          and user_id = tests.m5_id('anna')) as q_anna \gset
select is(ops.notification_context(:q_anna) #>> '{evening,venue,name}', 'Café am See', 'Kontext: Lokal');
select is(ops.notification_context(:q_anna) #>> '{evening,reasons_text}', 'Sie gehen beide gern am Wasser spazieren.', 'Kontext: warum Sie beide');
select is(jsonb_array_length(ops.notification_context(:q_anna) -> 'evening' -> 'offered_times'), 3, 'Kontext: höchstens 3 Uhrzeiten');
select is(ops.notification_context(:q_anna) #>> '{recipient,email}', 'anna@example.test', 'Kontext: Empfängerin');
select ok(ops.notification_context(:q_anna)::text not like '%Ben%' and ops.notification_context(:q_anna)::text not like '%Brückner%',
  'Mail an Anna nennt das Gegenüber nicht');

-- ---------------------------------------------------------------------------
-- Eigene Sicht
-- ---------------------------------------------------------------------------
select tests.act_as(tests.m5_id('anna'));
select is((select count(*)::int from api.my_evenings()), 1, 'Anna sieht ihren Abend');
select is((select my_action from api.my_evenings()), 'choose_time', 'Anna soll eine Zeit wählen');
select is((select counterpart_first_name from api.my_evenings()), 'Ben', 'Vorname des Gegenübers');
select is((select venue ->> 'public_transport' from api.my_evenings()), 'Bus 10, Haltestelle Markt', 'Öffentliche Angaben zum Lokal');
select is((select jsonb_array_length(proposed_times) from api.my_evenings()), 3, 'Höchstens 3 vorgeschlagene Zeiten');
select ok((select my_deadline_at from api.my_evenings()) is not null, 'Frist sichtbar');
select ok((select row(m.*)::text from api.my_evenings() m) !~ '(Brückner|ben@example|0\.81)',
  'my_evenings zeigt weder Nachnamen noch Kontakt noch Score des Gegenübers');
select ok(api.evening_detail(:'e1')::text !~ '(Brückner|ben@example|0\.81|Abendroth)',
  'evening_detail zeigt weder Nachnamen noch Kontakt noch Score');
select ok(exists (select 1 from api.evening_time_options(:'e1') o where o.starts_at = tests.m5_at(5, '20:00') and o.source = 'shared_window'),
  'Eigene Zeit im gemeinsamen Fenster ist wählbar');
select ok(exists (select 1 from api.evening_time_options(:'e1') o where o.starts_at = tests.m5_at(4, '19:30') and o.source = 'proposed'),
  'Vorgeschlagene Zeit ist wählbar');
select ok(not exists (select 1 from api.evening_time_options(:'e1') o where o.starts_at = tests.m5_at(9, '19:00')),
  'Platz ohne gemeinsames Fenster ist nicht wählbar');

-- Ungültige Wünsche
select is(tests.hint_of(format('select api.evening_request_time(%L, %L::timestamptz[])', :'e1',
  array[tests.m5_at(4, '19:00'), tests.m5_at(4, '19:30'), tests.m5_at(5, '19:00'), tests.m5_at(5, '19:30')])),
  'invalid_times', 'Höchstens 3 Uhrzeiten');
select is(tests.hint_of(format('select api.evening_request_time(%L, %L::timestamptz[])', :'e1',
  array[tests.m5_at(4, '19:00'), tests.m5_at(4, '19:00')])), 'invalid_times', 'Keine doppelten Uhrzeiten');
select is(tests.hint_of(format('select api.evening_request_time(%L, %L::timestamptz[])', :'e1',
  array[tests.m5_at(5, '22:00')])), 'time_not_allowed', 'Uhrzeit ohne Platz im Lokal ist nicht wählbar');
select is(tests.hint_of(format('select api.evening_request_time(%L, %L::timestamptz[])', :'e1',
  array[tests.m5_at(9, '19:00')])), 'time_not_allowed', 'Uhrzeit außerhalb der gemeinsamen Fenster ist nicht wählbar');
select is(tests.hint_of(format('select api.evening_confirm(%L, %L)', :'e1', tests.m5_at(4, '19:00'))),
  'invalid_state', 'Im Zustand proposed kann niemand bestätigen');

-- ---------------------------------------------------------------------------
-- Wunschzeit (Anna)
-- ---------------------------------------------------------------------------
select is(api.evening_request_time(:'e1', array[tests.m5_at(4, '19:00'), tests.m5_at(5, '19:00')]) ->> 'state',
  'time_requested', 'Anna wünscht zwei Zeiten');
select is((select my_action from api.my_evenings()), 'wait', 'Anna wartet jetzt');
select is(tests.hint_of(format('select api.evening_counter(%L, %L::timestamptz[])', :'e1', array[tests.m5_at(4, '19:30')])),
  'not_your_turn', 'Anna kann sich nicht selbst eine Alternative schicken');
select is(tests.hint_of(format('select api.evening_confirm(%L, %L)', :'e1', tests.m5_at(4, '19:00'))),
  'not_your_turn', 'Anna kann ihren eigenen Wunsch nicht bestätigen');
select tests.reset_role();

select is((select count(*)::int from app.evening_deadlines where evening_id = :'e1' and kind = 'time_request' and cancelled_at is not null), 1,
  'Frist time_request ist beendet');
select is((select payload ->> 'waiting_for' from app.evening_deadlines where evening_id = :'e1' and kind = 'time_answer' and cancelled_at is null),
  tests.m5_id('ben')::text, 'Neue 24-Stunden-Frist für Ben');
select is(tests.m5_count('evening.time_requested', tests.m5_id('ben'), :'e1'), 1, 'Ben bekommt die Wunschzeiten');
select is(tests.m5_count('evening.time_requested', tests.m5_id('anna'), :'e1'), 0, 'Anna bekommt keine Nachricht über ihren eigenen Wunsch');

-- ---------------------------------------------------------------------------
-- Alternative (Ben, eine Stunde später) mit einer eigenen Zeit im gemeinsamen Fenster
-- ---------------------------------------------------------------------------
select ops.sim_clock_advance(interval '1 hour');
select tests.act_as(tests.m5_id('ben'));
select is((select my_action from api.my_evenings()), 'answer_time', 'Ben soll antworten');
select is(tests.hint_of(format('select api.evening_confirm(%L, %L)', :'e1', tests.m5_at(6, '19:00'))),
  'time_not_offered', 'Nur angebotene Zeiten lassen sich bestätigen');
select is(api.evening_counter(:'e1', array[tests.m5_at(4, '19:30'), tests.m5_at(5, '20:00')]) ->> 'state',
  'time_countered', 'Ben schlägt eine Alternative vor');
select tests.reset_role();
select is((select due_at from app.evening_deadlines where evening_id = :'e1' and kind = 'time_answer' and cancelled_at is null and done_at is null),
  app.now() + interval '24 hours', 'Neue 24-Stunden-Frist ab der Alternative');
select is((select payload ->> 'waiting_for' from app.evening_deadlines where evening_id = :'e1' and kind = 'time_answer' and cancelled_at is null),
  tests.m5_id('anna')::text, 'Jetzt wartet Fermata auf Anna');
select is(tests.m5_count('evening.time_countered', tests.m5_id('anna'), :'e1'), 1, 'Anna bekommt die Alternative');

-- ---------------------------------------------------------------------------
-- Bestätigung (Anna)
-- ---------------------------------------------------------------------------
select ops.sim_clock_advance(interval '1 hour');
select tests.act_as(tests.m5_id('anna'));
select is((select my_action from api.my_evenings()), 'answer_time', 'Anna soll auf die Alternative antworten');
select is(api.evening_confirm(:'e1', tests.m5_at(4, '19:30')) ->> 'state', 'confirmed', 'Anna bestätigt 19:30 Uhr');
select is((api.evening_detail(:'e1') ->> 'starts_at')::timestamptz, tests.m5_at(4, '19:30'), 'Beginn steht fest');
select ok((api.evening_detail(:'e1') #>> '{reservation,table_code}') ~ '^[A-Z0-9]{4}$', 'Tisch-Code mit 4 Zeichen');
select is(api.evening_detail(:'e1') #>> '{reservation,name}', 'Fermata', 'Reserviert unter „Fermata“');
select is((select my_action from api.my_evenings()), 'prepare', 'Vor dem Abend: vorbereiten');
select tests.reset_role();

select is((select reserved from app.venue_slots where venue_id = tests.m5_id('venue') and starts_at = tests.m5_at(4, '19:30')), 1,
  'Ein Tisch ist reserviert');
select is((select count(*)::int from app.evening_reservations where evening_id = :'e1' and status = 'reserved'), 1, 'Reservierung angelegt');
select is((select slot_id from app.evenings where id = :'e1'),
  (select id from app.venue_slots where venue_id = tests.m5_id('venue') and starts_at = tests.m5_at(4, '19:30')), 'Abend kennt seinen Platz');
select is((select array_agg((payload ->> 'hours_before')::int order by due_at) from app.evening_deadlines
            where evening_id = :'e1' and kind = 'reminder' and payload ->> 'type' = 'evening'), array[24, 2], 'Erinnerungen 24 h und 2 h vorher');
select is((select due_at from app.evening_deadlines where evening_id = :'e1' and kind = 'checkin'),
  tests.m5_at(4, '19:30') + interval '30 minutes', 'Check-in 30 Minuten nach Beginn');
select is((select due_at from app.evening_deadlines where evening_id = :'e1' and kind = 'feedback'),
  tests.m5_at(5, '10:00'), 'Rückmeldung am nächsten Tag um 10:00 Uhr (Europe/Berlin)');
select is((select count(*)::int from app.evening_deadlines where evening_id = :'e1' and kind = 'reservation'), 1,
  'Hinweis bei unbestätigter Reservierung ist geplant');
select is((select count(*)::int from app.evening_deadlines where evening_id = :'e1' and kind = 'time_answer' and cancelled_at is null and done_at is null), 0,
  'Keine offene Antwort-Frist mehr');
select is(tests.m5_count('evening.confirmed', null, :'e1'), 2, 'Beide bekommen die Bestätigung');
select is((select count(*)::int from ops.notification_queue where template = 'venue.reservation' and evening_id = :'e1'
            and venue_id = tests.m5_id('venue') and user_id is null and channel = 'email'), 1, 'Reservierungs-Mail an das Lokal');
select (select id from ops.notification_queue where template = 'venue.reservation' and evening_id = :'e1') as q_venue \gset
select is(ops.notification_context(:q_venue) #>> '{recipient,email}', 'tisch@cafe.example', 'Mail geht an das Lokal');
select is((ops.notification_context(:q_venue) #>> '{reservation,persons}')::int, 2, 'Reservierung für 2 Personen');
select is(ops.notification_context(:q_venue) #>> '{reservation,notes}', 'Bitte ein ruhiger Tisch', 'Hinweis aus der Vereinbarung');
select ok(ops.notification_context(:q_venue)::text !~ '(Anna|Ben|Abendroth|Brückner|@example\.test|\+49)',
  'Lokal erfährt keine Namen und keine Kontaktdaten der Mitglieder');
select is((select status from app.pairings where id = (select pairing_id from app.evenings where id = :'e1')), 'proposed',
  'Vorschlag bleibt proposed bis zum Ergebnis');

-- Erfolgreicher Versand der Reservierung setzt den Zeitstempel
select ops.notify_complete(:q_venue, 'sent', null, null);
select ok((select venue_notified_at is not null from app.evening_reservations where evening_id = :'e1'), 'Reservierung als verschickt markiert');
select ok((select reservation_sent_at is not null from app.evenings where id = :'e1'), 'Abend kennt den Versand der Reservierung');

-- ---------------------------------------------------------------------------
-- Erinnerungen, Check-in (Fristen-Job mit Testuhr)
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(4, '19:30') - interval '24 hours');
select ops.process_evening_deadlines();
select is(tests.m5_count('evening.reminder', null, :'e1'), 2, 'Erinnerung 24 h vorher an beide');
select ops.process_evening_deadlines();
select is(tests.m5_count('evening.reminder', null, :'e1'), 2, 'Zweiter Lauf verschickt nichts doppelt');
select tests.m5_clock_to(tests.m5_at(4, '19:30') - interval '2 hours');
select ops.process_evening_deadlines();
select is(tests.m5_count('evening.reminder', null, :'e1'), 4, 'Erinnerung 2 h vorher an beide');
select is((select array_agg(distinct (payload ->> 'hours_before')::int order by (payload ->> 'hours_before')::int) from ops.notification_queue
            where template = 'evening.reminder' and evening_id = :'e1'), array[2, 24], 'Erinnerungen tragen die Stundenzahl');
select tests.m5_clock_to(tests.m5_at(4, '19:30') + interval '30 minutes');
select ops.process_evening_deadlines();
select is(tests.m5_count('evening.checkin', null, :'e1'), 2, 'Check-in an beide');
select ok((select bool_and(is_safety) from ops.notification_queue where template = 'evening.checkin' and evening_id = :'e1'),
  'Check-in ist eine Sicherheitsnachricht');

-- Unbestätigte Reservierung: Hinweis an Benn (Admin)
select is(tests.m5_count('admin.venue_unconfirmed', tests.m5_id('dora'), :'e1'), 1, 'Admin bekommt Hinweis: Lokal hat nicht bestätigt');

-- ---------------------------------------------------------------------------
-- Rückmeldung am nächsten Tag um 10:00
-- ---------------------------------------------------------------------------
select tests.act_as(tests.m5_id('anna'));
select is((select my_action from api.my_evenings()), 'find', '30 Minuten nach Beginn: Finde-Fenster');
select tests.reset_role();
select tests.m5_clock_to(tests.m5_at(4, '19:30') + interval '46 minutes');
select tests.act_as(tests.m5_id('anna'));
select is((select my_action from api.my_evenings()), 'feedback', 'Nach dem Finde-Fenster: Rückmeldung möglich');
select tests.reset_role();
select tests.m5_clock_to(tests.m5_at(5, '10:00'));
select ops.process_evening_deadlines();
select is(tests.m5_count('evening.feedback_request', null, :'e1'), 2, 'Bitte um Rückmeldung an beide');
select is((select due_at from app.evening_deadlines where evening_id = :'e1' and kind = 'feedback' and payload ->> 'step' = 'resolve'),
  tests.m5_at(5, '10:00') + interval '24 hours', 'Automatische Entscheidung 24 h nach der Anfrage ist geplant');

insert into app.consents (user_id, kind, action, document_version) values
  (tests.m5_id('anna'), 'kontakttausch', 'granted', 'v1'), (tests.m5_id('ben'), 'kontakttausch', 'granted', 'v1');

select tests.act_as(tests.m5_id('anna'));
select is(api.submit_feedback(:'e1', true, true, true, 'ja', true, 5, 4, 'Schöner Abend, sehr ruhig.', true, false) ->> 'state',
  'confirmed', 'Annas Rückmeldung: Abend wartet auf Ben');
select is(api.my_contact_share(:'e1') ->> 'status', 'pending', 'Anna wartet auf den Kontakttausch');
select is(tests.hint_of(format('select api.submit_feedback(%L, true)', :'e1')), 'already_submitted', 'Rückmeldung nur einmal');
select tests.reset_role();

select tests.act_as(tests.m5_id('ben'));
select is((select count(*)::int from app.feedback where evening_id = :'e1'), 0, 'Ben sieht Annas Rückmeldung nicht (RLS)');
select ok(api.evening_detail(:'e1')::text !~ 'Schöner Abend', 'evening_detail zeigt Ben nichts aus Annas Rückmeldung');
select is(api.evening_detail(:'e1') #>> '{contact_share,status}', 'none', 'Ben sieht nicht, dass Anna Ja gesagt hat');
select is(tests.hint_of(format('select api.submit_feedback(%L, true, true, true, %L, true, 4, 4, null, true, true)', :'e1', 'ja')),
  'no_phone', 'Telefon teilen geht nur mit hinterlegter Nummer');
select is(api.submit_feedback(:'e1', true, true, true, 'ja', true, 4, 4, null, true, false) ->> 'state',
  'happened', 'Beide waren da: Abend hat stattgefunden');
select is(api.my_contact_share(:'e1') ->> 'status', 'released', 'Kontakttausch freigegeben');
select is(api.my_contact_share(:'e1') #>> '{counterpart,email}', 'anna@example.test', 'Ben bekommt Annas E-Mail');
select ok(api.my_contact_share(:'e1') #>> '{counterpart,phone}' is null, 'Anna hat ihr Telefon nicht freigegeben');
select is(api.my_contact_share(:'e1') #>> '{counterpart,first_name}', 'Anna', 'Vorname, nie der Nachname');
select is(api.debrief_offer(:'e1') ->> 'reason', 'tier', 'Stufe Auftakt: keine Nachbesprechung');
select tests.reset_role();

select tests.act_as(tests.m5_id('anna'));
select is(api.my_contact_share(:'e1') #>> '{counterpart,email}', 'ben@example.test', 'Anna bekommt Bens E-Mail');
select ok(api.my_contact_share(:'e1') #>> '{counterpart,phone}' is null, 'Ben hat kein Telefon freigegeben');
select is((api.debrief_offer(:'e1') ->> 'eligible')::boolean, true, 'Stufe Andante: Nachbesprechung möglich');
select is((api.debrief_offer(:'e1') ->> 'minutes')::int, 10, 'Andante: 10 Minuten (Platzhalter B6)');
select is(api.evening_detail(:'e1') #>> '{feedback,mine,note}', 'Schöner Abend, sehr ruhig.', 'Anna sieht ihre eigene Rückmeldung');
select is((select my_action from api.my_evenings()), 'contact', 'Danach: Kontakt ansehen');
select tests.reset_role();

select is((select state from app.evenings where id = :'e1'), 'happened', 'Zustand happened');
select is((select status from app.pairings where id = (select pairing_id from app.evenings where id = :'e1')), 'completed', 'Vorschlag completed');
select is(tests.m5_count('evening.contact_released', null, :'e1'), 2, 'Beide erfahren vom Kontakttausch');
select is(tests.m5_count('evening.debrief_offer', tests.m5_id('anna'), :'e1'), 1, 'Anna bekommt das Angebot zur Nachbesprechung');
select is(tests.m5_count('evening.debrief_offer', tests.m5_id('ben'), :'e1'), 0, 'Ben (Auftakt) nicht');
select is((select count(*)::int from app.evening_deadlines where evening_id = :'e1' and kind = 'feedback' and payload ->> 'step' = 'resolve'
            and cancelled_at is not null), 1, 'Automatische Entscheidung entfällt');
select is((select array_agg(event order by id) from app.evening_events where evening_id = :'e1'),
  array['request_time', 'counter', 'confirm', 'happened'], 'Verlauf vollständig');

select * from finish();
rollback;
