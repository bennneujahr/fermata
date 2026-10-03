-- M5: Absage früh/kurzfristig (Grenze), Tisch-Kapazität (zwei Bestätigungen für den letzten Tisch),
-- nur Beteiligte, Ablehnung ohne Grund für das Gegenüber.
begin;
\ir 500_fixtures.sql
select * from no_plan();
select tests.m5_setup();

-- ---------------------------------------------------------------------------
-- 1. Absage genau 24 h vorher: noch früh
-- ---------------------------------------------------------------------------
select tests.m5_confirmed_evening(tests.m5_id('anna'), tests.m5_id('ben'), tests.m5_at(4, '19:30')) as e1 \gset
select is((select reserved from app.venue_slots where venue_id = tests.m5_id('venue') and starts_at = tests.m5_at(4, '19:30')), 1, 'Tisch reserviert');
select tests.m5_clock_to(tests.m5_at(4, '19:30') - interval '24 hours');
select tests.act_as(tests.m5_id('ben'));
select is(tests.hint_of(format('select api.evening_cancel(%L, %L)', :'e1', 'zu_spaet')), 'invalid_reason', 'Nur bekannte Gründe');
select is(api.evening_cancel(:'e1', 'termin') ->> 'state', 'cancelled_early', 'Genau 24:00 h vorher: frühe Absage');
select ok((api.evening_detail(:'e1') ->> 'cancelled_by_me')::boolean, 'Ben sieht, dass er abgesagt hat');
select tests.reset_role();
select is((select reserved from app.venue_slots where venue_id = tests.m5_id('venue') and starts_at = tests.m5_at(4, '19:30')), 0, 'Tisch wieder frei');
select is((select status from app.evening_reservations where evening_id = :'e1'), 'cancelled', 'Reservierung storniert');
select is(tests.m5_count('evening.cancelled', tests.m5_id('anna'), :'e1'), 1, 'Anna erfährt von der Absage');
select is(tests.m5_count('evening.cancelled', tests.m5_id('ben'), :'e1'), 0, 'Ben bekommt keine Absage-Nachricht');
select is(tests.m5_count('evening.cancel_receipt', tests.m5_id('ben'), :'e1'), 1, 'Ben bekommt eine Eingangsbestätigung');
select is((select (payload ->> 'late')::boolean from ops.notification_queue where template = 'evening.cancel_receipt' and evening_id = :'e1'), false,
  'Bestätigung nennt: nicht kurzfristig');
select ok((select q.payload::text !~ 'termin' from ops.notification_queue q where q.template = 'evening.cancelled' and q.evening_id = :'e1'),
  'Der Grund erreicht das Gegenüber nicht');
select (select id from ops.notification_queue where template = 'evening.cancelled' and evening_id = :'e1') as q_cancel \gset
select ok(ops.notification_context(:q_cancel)::text !~ 'termin', 'Auch beim Versand kein Grund');
select is((select count(*)::int from ops.notification_queue where template = 'venue.cancellation' and evening_id = :'e1'), 1, 'Absage-Mail ans Lokal');
select is((select count(*)::int from app.evening_deadlines where evening_id = :'e1' and done_at is null and cancelled_at is null), 0,
  'Erinnerungen, Check-in und Rückmeldung entfallen');
select is((select status from app.pairings where id = (select pairing_id from app.evenings where id = :'e1')), 'cancelled', 'Vorschlag cancelled');
select is((select cancel_reason from app.evenings where id = :'e1'), 'termin', 'Grund gespeichert (für Benn und das Kontingent)');

-- Absage ans Lokal: erst wenn die Reservierung verschickt ist, sonst entfällt sie
select (select id from ops.notification_queue where template = 'venue.cancellation' and evening_id = :'e1') as q_vc \gset
select ok((ops.notification_context(:q_vc) ->> 'defer')::boolean, 'Reservierung noch unterwegs: Absage wartet');
select ops.notify_complete((select id from ops.notification_queue where template = 'venue.reservation' and evening_id = :'e1'), 'skipped', null, null);
select is(ops.notification_context(:q_vc) ->> 'skip', 'never_notified', 'Reservierung nie verschickt: keine Absage nötig');
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- 2. Absage 1 Sekunde später: kurzfristig
-- ---------------------------------------------------------------------------
select tests.m5_confirmed_evening(tests.m5_id('cem'), tests.m5_id('emil'), tests.m5_at(4, '19:00')) as e2 \gset
select tests.m5_clock_to(tests.m5_at(4, '19:00') - interval '24 hours' + interval '1 second');
select tests.act_as(tests.m5_id('cem'));
select is(api.evening_cancel(:'e2', 'krank') ->> 'state', 'cancelled_late', '23:59:59 h vorher: kurzfristige Absage');
select tests.reset_role();
select is((select (payload ->> 'late')::boolean from ops.notification_queue where template = 'evening.cancel_receipt' and evening_id = :'e2'), true,
  'Bestätigung nennt: kurzfristig');
select is((select reserved from app.venue_slots where venue_id = tests.m5_id('venue') and starts_at = tests.m5_at(4, '19:00')), 0, 'Tisch wieder frei');

-- Absage nach Beginn nicht mehr möglich; unbestätigte Abende werden abgelehnt, nicht abgesagt
select ops.sim_clock_reset();
select tests.m5_confirmed_evening(tests.m5_id('anna'), tests.m5_id('fritz'), tests.m5_at(5, '19:30')) as e3 \gset
select tests.m5_clock_to(tests.m5_at(5, '19:30') + interval '1 minute');
select tests.act_as(tests.m5_id('fritz'));
select is(tests.hint_of(format('select api.evening_cancel(%L)', :'e3')), 'evening_started', 'Nach Beginn keine Absage');
select tests.reset_role();
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- 3. Zwei Bestätigungen für den letzten Tisch
-- ---------------------------------------------------------------------------
insert into app.venue_slots (venue_id, starts_at, tables) values (tests.m5_id('venue'), tests.m5_at(6, '21:00'), 1);
select tests.m5_new_evening(tests.m5_id('ben'), tests.m5_id('cem'), array[tests.m5_at(6, '21:00')]) as e4 \gset
select tests.m5_new_evening(tests.m5_id('emil'), tests.m5_id('fritz'), array[tests.m5_at(6, '21:00')]) as e5 \gset
select tests.act_as(tests.m5_id('ben'));
select api.evening_request_time(:'e4', array[tests.m5_at(6, '21:00')]);
select tests.reset_role();
select tests.act_as(tests.m5_id('emil'));
select api.evening_request_time(:'e5', array[tests.m5_at(6, '21:00')]);
select tests.reset_role();
select tests.act_as(tests.m5_id('cem'));
select is(api.evening_confirm(:'e4', tests.m5_at(6, '21:00')) ->> 'state', 'confirmed', 'Erste Bestätigung bekommt den letzten Tisch');
select tests.reset_role();
select tests.act_as(tests.m5_id('fritz'));
select is(tests.hint_of(format('select api.evening_confirm(%L, %L)', :'e5', tests.m5_at(6, '21:00'))), 'no_table_free',
  'Zweite Bestätigung: kein Tisch mehr frei');
select is((select state from app.evenings where id = :'e5'), 'time_requested', 'Zweiter Abend bleibt offen (alles zurückgerollt)');
select ok(not exists (select 1 from api.evening_time_options(:'e5') o where o.starts_at = tests.m5_at(6, '21:00')),
  'Die volle Uhrzeit wird nicht mehr angeboten');
select tests.reset_role();
select is((select reserved from app.venue_slots where venue_id = tests.m5_id('venue') and starts_at = tests.m5_at(6, '21:00')), 1,
  'Nie mehr reserviert als Tische da sind');
select throws_ok(format('update app.venue_slots set reserved = 2 where venue_id = %L and starts_at = %L', tests.m5_id('venue'), tests.m5_at(6, '21:00')),
  '23514', null, 'Prüfregel reserved <= tables greift zusätzlich');
-- Erster Abend sagt ab → Tisch frei → zweiter kann bestätigen
select tests.act_as(tests.m5_id('ben'));
select api.evening_cancel(:'e4', 'sonstiges');
select tests.reset_role();
select tests.act_as(tests.m5_id('fritz'));
select is(api.evening_confirm(:'e5', tests.m5_at(6, '21:00')) ->> 'state', 'confirmed', 'Nach der Absage ist der Tisch wieder frei');
select tests.reset_role();
select is((select count(*)::int from app.evening_reservations r join app.venue_slots s on s.id = r.slot_id
            where s.starts_at = tests.m5_at(6, '21:00') and r.status = 'reserved'), 1, 'Genau eine gültige Reservierung');

-- Kurzfristige Bestätigung
select tests.m5_new_evening(tests.m5_id('anna'), tests.m5_id('emil'), array[tests.m5_at(3, '19:00')]) as e6 \gset
select tests.act_as(tests.m5_id('emil'));
select api.evening_request_time(:'e6', array[tests.m5_at(3, '19:00')]);
select tests.reset_role();
select tests.m5_clock_to(tests.m5_at(3, '19:00') - interval '5 hours');
select tests.act_as(tests.m5_id('anna'));
select is(tests.hint_of(format('select api.evening_confirm(%L, %L)', :'e6', tests.m5_at(3, '19:00'))), 'time_too_soon',
  'Weniger als evening.confirm_min_lead_hours vorher: nicht mehr bestätigen');
select tests.reset_role();
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- 4. Nur Beteiligte
-- ---------------------------------------------------------------------------
select tests.m5_new_evening(tests.m5_id('anna'), tests.m5_id('ben'), array[tests.m5_at(5, '19:00'), tests.m5_at(5, '20:00')]) as e7 \gset
select tests.act_as(tests.m5_id('cem'));
select is(tests.hint_of(format('select api.evening_request_time(%L, %L::timestamptz[])', :'e7', array[tests.m5_at(5, '19:00')])),
  'not_participant', 'Unbeteiligte: keine Wunschzeit');
select is(tests.hint_of(format('select api.evening_counter(%L, %L::timestamptz[])', :'e7', array[tests.m5_at(5, '19:00')])),
  'not_participant', 'Unbeteiligte: keine Alternative');
select is(tests.hint_of(format('select api.evening_confirm(%L, %L)', :'e7', tests.m5_at(5, '19:00'))), 'not_participant', 'Unbeteiligte: keine Bestätigung');
select is(tests.hint_of(format('select api.evening_decline(%L)', :'e7')), 'not_participant', 'Unbeteiligte: keine Ablehnung');
select is(tests.hint_of(format('select api.evening_cancel(%L)', :'e7')), 'not_participant', 'Unbeteiligte: keine Absage');
select is(tests.hint_of(format('select api.evening_detail(%L)', :'e7')), 'not_participant', 'Unbeteiligte: keine Details');
select is(tests.hint_of(format('select api.evening_time_options(%L)', :'e7')), 'not_participant', 'Unbeteiligte: keine Zeiten');
select is(tests.hint_of(format('select api.evening_find_info(%L)', :'e7')), 'not_participant', 'Unbeteiligte: kein Finde-Fenster');
select is(tests.hint_of(format('select api.set_recognition_hint(%L, %L)', :'e7', 'roter Schal')), 'not_participant', 'Unbeteiligte: kein Erkennungszeichen');
select is(tests.hint_of(format('select api.submit_feedback(%L, true)', :'e7')), 'not_participant', 'Unbeteiligte: keine Rückmeldung');
select is(tests.hint_of(format('select api.my_contact_share(%L)', :'e7')), 'not_participant', 'Unbeteiligte: kein Kontakttausch');
select is(tests.hint_of(format('select api.debrief_offer(%L)', :'e7')), 'not_participant', 'Unbeteiligte: keine Nachbesprechung');
select is((select count(*)::int from api.my_evenings() where evening_id = :'e7'), 0, 'Unbeteiligte sehen den Abend nicht');
select is((select count(*)::int from app.evening_reservations), 0, 'Reservierungen sind für Mitglieder nicht direkt lesbar');
select throws_ok('select * from ops.notification_queue', '42501', null, 'Warteschlange ist für Mitglieder gesperrt');
select throws_ok('select * from app.evening_hints', '42501', null, 'Erkennungszeichen sind nicht direkt lesbar');
select tests.reset_role();
select tests.act_as_anon();
select throws_ok(format('select api.evening_detail(%L)', :'e7'), '42501', null, 'Ohne Anmeldung kein Zugriff');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- 5. Ablehnung: das Gegenüber erfährt keinen Grund
-- ---------------------------------------------------------------------------
select tests.act_as(tests.m5_id('ben'));
select is(api.evening_decline(:'e7', 'kein_interesse') ->> 'state', 'declined', 'Ben lehnt ab');
select tests.reset_role();
select is(tests.m5_count('evening.declined', tests.m5_id('anna'), :'e7'), 1, 'Anna wird informiert');
select is(tests.m5_count('evening.declined', tests.m5_id('ben'), :'e7'), 0, 'Ben nicht');
select (select id from ops.notification_queue where template = 'evening.declined' and evening_id = :'e7') as q_decl \gset
select ok(ops.notification_context(:q_decl)::text !~ 'kein_interesse', 'Kein Grund in der Nachricht');
select is((select status from app.pairings where id = (select pairing_id from app.evenings where id = :'e7')), 'declined', 'Vorschlag declined');
select is(tests.m5_count('evening.proposed', tests.m5_id('anna'), :'e7'), 1, 'Vorschlagsnachricht lag noch in der Warteschlange');
select (select id from ops.notification_queue where template = 'evening.proposed' and evening_id = :'e7' and user_id = tests.m5_id('anna')) as q_prop \gset
select is(ops.notification_context(:q_prop) ->> 'skip', 'outdated', 'Veraltete Vorschlagsnachricht wird nicht mehr verschickt');

-- ---------------------------------------------------------------------------
-- 6. Admin-Absage (cancel_admin, z. B. aus dem Sicherheitsbereich)
-- ---------------------------------------------------------------------------
select tests.m5_confirmed_evening(tests.m5_id('cem'), tests.m5_id('fritz'), tests.m5_at(6, '20:00')) as e8 \gset
select app.evening_transition(:'e8', 'cancel_admin', tests.m5_id('dora'), '{"grund": "sicherheit"}'::jsonb);
select is((select state from app.evenings where id = :'e8'), 'cancelled_early', 'Admin-Absage');
select is(tests.m5_count('evening.cancelled', null, :'e8'), 2, 'Beide erfahren von der Absage durch Fermata');
select is((select reserved from app.venue_slots where venue_id = tests.m5_id('venue') and starts_at = tests.m5_at(6, '20:00')), 0,
  'Admin-Absage gibt den Tisch frei');

select * from finish();
rollback;
