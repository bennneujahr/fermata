-- M5: Zeitenabfrage (Zeitraum je Zyklus, Benachrichtigung, Erinnerung, Eintragen mit Prüfregeln),
-- Lokale im Admin (nur aal2, Audit), Plätze in einem Rutsch (Europe/Berlin über die Zeitumstellung),
-- Bestätigung durch das Lokal, Ausführungsrechte.
begin;
\ir 500_fixtures.sql
select * from no_plan();
select tests.m5_setup();
-- Die Fixtures legen einen Zeitraum an; für die Zeitenabfrage starten wir ohne.
delete from app.availability_periods;

-- ---------------------------------------------------------------------------
-- Wer bekommt die Abfrage?
-- ---------------------------------------------------------------------------
update app.profile_core set ready_for_matching = false where user_id = tests.m5_id('cem');
update app.accounts set paused_until = now() + interval '30 days' where user_id = tests.m5_id('emil');
insert into safety.sanctions (user_id, kind, reason, starts_at) values (tests.m5_id('fritz'), 'vorlaeufige_sperre', 'Test', now() - interval '1 hour');
select ok(app.availability_eligible(tests.m5_id('anna')), 'Anna: aktiv, Profil fertig');
select ok(not app.availability_eligible(tests.m5_id('cem')), 'Cem: Profil nicht fertig');
select ok(not app.availability_eligible(tests.m5_id('emil')), 'Emil: pausiert');
select ok(not app.availability_eligible(tests.m5_id('fritz')), 'Fritz: vorläufig gesperrt');

-- ---------------------------------------------------------------------------
-- Zeitraum per Job (stündlich), frühestens um availability.ask_local_time
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(1, '09:30'));
select is(ops.availability_tick() ->> 'created_period', null, 'Vor 10:00 Uhr keine Abfrage');
select tests.m5_clock_to(tests.m5_at(1, '10:05'));
select ok(ops.availability_tick() ->> 'created_period' is not null, 'Um 10:05 Uhr entsteht der Zeitraum');
select (select id from app.availability_periods) as p1 \gset
select is((select starts_on from app.availability_periods where id = :'p1'), (now() at time zone 'Europe/Berlin')::date + 11,
  'Beginn: availability.ask_lead_days nach heute');
select is((select ends_on - starts_on + 1 from app.availability_periods where id = :'p1'), 14, 'Länge: matching.rhythm_days');
select is((select answer_until from app.availability_periods where id = :'p1'), app.now() + interval '72 hours', 'Offen für 72 Stunden');
select is(tests.m5_count('availability.request'), 2, 'Abfrage an alle passenden Mitglieder (Anna, Ben)');
select is(tests.m5_count('availability.request', tests.m5_id('cem')), 0, 'Nicht an Cem');
select ok((select bool_and(has_deadline) from ops.notification_queue where template = 'availability.request'), 'Mit Frist: immer auch E-Mail');
select is(ops.availability_tick() ->> 'created_period', null, 'Zweiter Lauf: kein neuer Zeitraum');
select is(tests.m5_count('availability.request'), 2, 'Keine doppelten Abfragen');
select (select id from ops.notification_queue where template = 'availability.request' and user_id = tests.m5_id('ben')) as q_ben \gset
select is((ops.notification_context(:q_ben) #>> '{period,id}')::uuid, :'p1'::uuid, 'Kontext: Zeitraum');
select is(ops.notification_context(:q_ben) #>> '{recipient,address_form}', 'du', 'Ben möchte geduzt werden');

-- ---------------------------------------------------------------------------
-- Eintragen
-- ---------------------------------------------------------------------------
select tests.act_as(tests.m5_id('anna'));
select is(tests.hint_of(format('select api.set_availability(%L, %L::jsonb)', :'p1',
  json_build_array(json_build_object('starts_at', tests.m5_at(12, '18:00'), 'ends_at', tests.m5_at(12, '19:00'))))),
  'window_too_short', 'Mindestens 120 Minuten');
select is(tests.hint_of(format('select api.set_availability(%L, %L::jsonb)', :'p1',
  json_build_array(json_build_object('starts_at', tests.m5_at(12, '15:00'), 'ends_at', tests.m5_at(12, '22:00'))))),
  'window_too_long', 'Höchstens 6 Stunden');
select is(tests.hint_of(format('select api.set_availability(%L, %L::jsonb)', :'p1',
  json_build_array(json_build_object('starts_at', tests.m5_at(30, '18:00'), 'ends_at', tests.m5_at(30, '22:00'))))),
  'window_outside_period', 'Nur innerhalb des Zeitraums');
select is(tests.hint_of(format('select api.set_availability(%L, %L::jsonb)', :'p1',
  json_build_array(json_build_object('starts_at', tests.m5_at(12, '18:00'), 'ends_at', tests.m5_at(12, '22:00')),
                   json_build_object('starts_at', tests.m5_at(12, '21:00'), 'ends_at', tests.m5_at(12, '23:30'))))),
  'windows_overlap', 'Keine Überschneidungen');
select is(tests.hint_of(format('select api.set_availability(%L, %L::jsonb)', :'p1',
  (select json_agg(json_build_object('starts_at', tests.m5_at(11 + (g % 14), '18:00') + make_interval(mins => g), 'ends_at',
          tests.m5_at(11 + (g % 14), '18:00') + make_interval(mins => g + 120))) from generate_series(1, 13) g))),
  'too_many_windows', 'Höchstens 12 Fenster');
select is(tests.hint_of(format('select api.set_availability(%L, %L::jsonb)', :'p1', '[{"starts_at": "morgen"}]')),
  'invalid_input', 'Ungültige Zeitangabe');
select is(tests.hint_of(format('select api.set_availability(%L, %L::jsonb)', gen_random_uuid(), '[]')), 'period_not_found', 'Unbekannter Zeitraum');
select is((select count(*)::int from api.set_availability(:'p1', json_build_array(
    json_build_object('starts_at', tests.m5_at(12, '18:00'), 'ends_at', tests.m5_at(12, '22:00')),
    json_build_object('starts_at', tests.m5_at(13, '19:00'), 'ends_at', tests.m5_at(13, '23:00')))::jsonb)), 2, 'Zwei Fenster gespeichert');
select is((select count(*)::int from api.set_availability(:'p1', json_build_array(
    json_build_object('starts_at', tests.m5_at(14, '18:30'), 'ends_at', tests.m5_at(14, '22:30')))::jsonb)), 1, 'Neu eintragen ersetzt');
select is((select starts_at from api.my_availability(:'p1')), tests.m5_at(14, '18:30'), 'my_availability zeigt das neue Fenster');
select is((select window_count from api.my_availability_periods() where period_id = :'p1'), 1, 'Zahl der eigenen Fenster');
select ok((select is_open from api.my_availability_periods() where period_id = :'p1'), 'Abfrage offen');
select throws_ok(format('insert into app.availability_windows (user_id, period_id, starts_at, ends_at) values (%L, %L, %L, %L)',
  tests.m5_id('anna'), :'p1', tests.m5_at(15, '18:00'), tests.m5_at(15, '20:00')), '42501', null,
  'Direktes Schreiben ist gesperrt (nur über api.set_availability)');
select tests.reset_role();
update app.accounts set status = 'paused' where user_id = tests.m5_id('cem');
select tests.act_as(tests.m5_id('cem'));
select is(tests.hint_of(format('select api.set_availability(%L, %L::jsonb)', :'p1', '[]')), 'account_inactive', 'Nur aktive Konten');
select tests.reset_role();

-- Vergangenheit: Testuhr in den Zeitraum stellen (Abfrage dann schon zu)
select tests.m5_clock_to(tests.m5_at(1, '10:05') + interval '71 hours');
select tests.act_as(tests.m5_id('ben'));
select is(tests.hint_of(format('select api.set_availability(%L, %L::jsonb)', :'p1',
  json_build_array(json_build_object('starts_at', app.now() - interval '1 hour', 'ends_at', app.now() + interval '2 hours')))),
  'window_in_past', 'Fenster in der Vergangenheit');
select tests.reset_role();

-- Erinnerung 24 h vor Schluss nur an Personen ohne Eintrag (Ben)
select tests.m5_clock_to(tests.m5_at(1, '10:05') + interval '48 hours');
select is((ops.availability_tick() ->> 'reminders')::int, 1, 'Eine Erinnerung');
select is(tests.m5_count('availability.reminder', tests.m5_id('ben')), 1, 'Erinnerung an Ben (noch kein Eintrag)');
select is(tests.m5_count('availability.reminder', tests.m5_id('anna')), 0, 'Anna hat schon eingetragen');
select is((ops.availability_tick() ->> 'reminders')::int, 0, 'Erinnerung nur einmal');
-- Trägt Ben noch vor dem Versand ein, entfällt die Erinnerung
select tests.act_as(tests.m5_id('ben'));
select api.set_availability(:'p1', json_build_array(json_build_object('starts_at', tests.m5_at(12, '18:00'), 'ends_at', tests.m5_at(12, '22:00')))::jsonb);
select tests.reset_role();
select (select id from ops.notification_queue where template = 'availability.reminder' and user_id = tests.m5_id('ben')) as q_rem \gset
select is(ops.notification_context(:q_rem) ->> 'skip', 'already_answered', 'Erinnerung entfällt nach dem Eintrag');

-- Abfrage zu
select tests.m5_clock_to(tests.m5_at(1, '10:05') + interval '72 hours 1 minute');
select tests.act_as(tests.m5_id('anna'));
select is(tests.hint_of(format('select api.set_availability(%L, %L::jsonb)', :'p1', '[]')), 'period_closed', 'Nach answer_until gesperrt');
select ok(not (select is_open from api.my_availability_periods() where period_id = :'p1'), 'Abfrage geschlossen');
select tests.reset_role();
select is(ops.notification_context(:q_ben) ->> 'skip', 'outdated', 'Abfrage-Mail nach Schluss nicht mehr verschicken');

-- Nächster Zeitraum schließt lückenlos an, wenn es Zeit ist
select tests.m5_clock_to(app.berlin_at((select ends_on from app.availability_periods where id = :'p1') + 1 - 10, '10:30'));
select ok(ops.availability_tick() ->> 'created_period' is not null, 'Nächster Zeitraum zur rechten Zeit');
select is((select count(*)::int from app.availability_periods), 2, 'Zwei Zeiträume');
select is((select min(starts_on) filter (where id <> :'p1') from app.availability_periods),
  (select ends_on + 1 from app.availability_periods where id = :'p1'), 'Lückenlos');
select ops.sim_clock_reset();
update safety.sanctions set lifted_at = now() where user_id = tests.m5_id('fritz');

-- ---------------------------------------------------------------------------
-- Lokale im Admin
-- ---------------------------------------------------------------------------
select tests.act_as(tests.m5_id('anna'));
select is(tests.hint_of($$ select api.admin_create_venue('{"name": "X"}'::jsonb) $$), 'admin_required', 'Mitglieder dürfen keine Lokale anlegen');
select tests.reset_role();
select tests.act_as(tests.m5_id('dora'));
select is(tests.hint_of($$ select api.admin_create_venue('{"name": "X"}'::jsonb) $$), 'admin_required', 'Admin ohne Zwei-Faktor: nein');
select tests.reset_role();
select tests.act_as(tests.m5_id('dora'), 'aal2');
select is(tests.hint_of($$ select api.admin_create_venue('{"name": "Weinstube", "street": "Markt 2", "postal_code": "19055", "city": "Schwerin"}'::jsonb) $$),
  'invalid_coordinates', 'Ohne Koordinaten und ohne PLZ-Tabelle: Fehler');
select is(tests.hint_of($$ select api.admin_create_venue('{"name": "Weinstube", "street": "Markt 2", "postal_code": "19055", "city": "Schwerin",
  "lat": 53.63, "lon": 11.41, "reservation_mode": "email"}'::jsonb) $$), 'email_required', 'Reservierung per E-Mail braucht eine Adresse');
select is(tests.hint_of($$ select api.admin_create_venue('{"name": "Weinstube", "street": "Markt 2", "postal_code": "19055", "city": "Schwerin",
  "lat": 53.63, "lon": 11.41, "contact_email": "kein-at"}'::jsonb) $$), 'invalid_email', 'Ungültige E-Mail');
select is(tests.hint_of($$ select api.admin_create_venue('{"name": "Weinstube", "geheim": 1}'::jsonb) $$), 'unknown_field', 'Unbekannte Felder abgelehnt');
select api.admin_create_venue('{"name": "Weinstube", "street": "Markt 2", "postal_code": "19055", "city": "Schwerin",
  "lat": 53.63, "lon": 11.41, "reservation_mode": "telefon", "contact_phone": "0385 123456",
  "public_transport": "Tram 1, Marienplatz", "agreement": {"getraenk_willkommen": true}}'::jsonb) ->> 'id' as v2 \gset
select is((api.admin_update_venue(:'v2', '{"accessibility": "Eingang mit einer Stufe"}'::jsonb)) ->> 'accessibility',
  'Eingang mit einer Stufe', 'Lokal ändern');
select is((select count(*)::int from api.admin_venues() where id = :'v2' and active), 1, 'Liste der Lokale');
select tests.reset_role();
select is((select count(*)::int from ops.audit_log where action in ('venue.create', 'venue.update') and target_id = :'v2'), 2,
  'Anlegen und Ändern stehen im Audit-Protokoll');

-- Plätze: Do–Sa, 19:00/19:30/20:00, 2 Wochen über die Zeitumstellung (27.10.2030)
select tests.act_as(tests.m5_id('dora'), 'aal2');
select is(api.admin_create_slots(:'v2', '2030-10-21', 2, array[4, 5, 6], array['19:00', '19:30', '20:00'], 3) ->> 'created', '18',
  '2 Wochen × 3 Tage × 3 Uhrzeiten = 18 Plätze');
select is(api.admin_create_slots(:'v2', '2030-10-21', 2, array[4, 5, 6], array['19:00', '19:30', '20:00'], 3) ->> 'skipped', '18',
  'Doppelt anlegen: übersprungen');
select is(api.admin_create_slots(:'v2', '2030-10-21', 1, array[4], array['19:00'], 4, true) ->> 'updated', '1',
  'Mit p_update_existing: Tische geändert');
select is(tests.hint_of(format('select api.admin_create_slots(%L, %L, 1, array[8], array[%L], 3)', :'v2', '2030-10-21', '19:00')),
  'invalid_weekdays', 'Wochentage 1 bis 7');
select is(tests.hint_of(format('select api.admin_create_slots(%L, %L, 1, array[4], array[%L], 3)', :'v2', '2030-10-21', '7 Uhr')),
  'invalid_times', 'Uhrzeiten HH:MM');
select is(tests.hint_of(format('select api.admin_create_slots(%L, %L, 30, array[4], array[%L], 3)', :'v2', '2030-10-21', '19:00')),
  'invalid_range', 'Höchstens venue.max_slot_weeks Wochen');
select tests.reset_role();
select is((select count(*)::int from app.venue_slots where venue_id = :'v2'
            and to_char(starts_at at time zone 'Europe/Berlin', 'HH24:MI') not in ('19:00', '19:30', '20:00')), 0,
  'Alle Plätze zur Ortszeit 19:00, 19:30 oder 20:00');
select is((select array_agg(distinct extract(hour from starts_at at time zone 'UTC')::int order by extract(hour from starts_at at time zone 'UTC')::int)
            from app.venue_slots where venue_id = :'v2' and to_char(starts_at at time zone 'Europe/Berlin', 'HH24:MI') = '19:00'),
  array[17, 18], 'Zeitumstellung: 19:00 Ortszeit ist mal 17, mal 18 Uhr UTC');
select is((select array_agg(d order by d) from (select distinct extract(isodow from starts_at at time zone 'Europe/Berlin')::int as d
            from app.venue_slots where venue_id = :'v2') x), array[4, 5, 6], 'Nur Do, Fr, Sa');

-- Plätze mit Reservierung (Fixture-Lokal)
select tests.m5_confirmed_evening(tests.m5_id('anna'), tests.m5_id('ben'), tests.m5_at(4, '19:30')) as e1 \gset
select (select id from app.venue_slots where venue_id = tests.m5_id('venue') and starts_at = tests.m5_at(4, '19:30')) as s1 \gset
select tests.act_as(tests.m5_id('dora'), 'aal2');
select is((select reserved from api.admin_venue_slots(tests.m5_id('venue')) where slot_id = :'s1'), 1, 'Admin sieht die Reservierung');
select ok((select reservations::text from api.admin_venue_slots(tests.m5_id('venue')) where slot_id = :'s1') !~ '(Anna|Ben|Abendroth|Brückner)',
  'Ohne Namen der Mitglieder');
select is(tests.hint_of(format('select api.admin_update_slot(%L, 0)', :'s1')), 'below_reserved', 'Nicht weniger Tische als reserviert');
select is(tests.hint_of(format('select api.admin_delete_slot(%L)', :'s1')), 'slot_reserved', 'Platz mit Reservierung bleibt');
select is((api.admin_update_slot(:'s1', 5) ->> 'tables')::int, 5, 'Mehr Tische geht');
select is((select count(*)::int from app.evening_reservations), 1, 'Admin liest Reservierungen auch direkt');
select is((api.admin_set_venue_active(tests.m5_id('venue'), false) ->> 'upcoming_reservations')::int, 1,
  'Deaktivieren nennt bestehende Reservierungen');
select tests.reset_role();
select is((select state from app.evenings where id = :'e1'), 'confirmed', 'Bestehender Abend bleibt bestehen');

-- Neue Abende im inaktiven Lokal: keine wählbaren Zeiten
select tests.m5_new_evening(tests.m5_id('cem'), tests.m5_id('fritz'), array[tests.m5_at(5, '19:00')]) as e2 \gset
update app.accounts set status = 'active' where user_id = tests.m5_id('cem');
select tests.act_as(tests.m5_id('cem'));
select is((select count(*)::int from api.evening_time_options(:'e2')), 0, 'Inaktives Lokal: keine Zeiten');
select is(tests.hint_of(format('select api.evening_request_time(%L, %L::timestamptz[])', :'e2', array[tests.m5_at(5, '19:00')])),
  'time_not_allowed', 'Keine Wunschzeit im inaktiven Lokal');
select tests.reset_role();
update app.venues set active = true where id = tests.m5_id('venue');

-- Bestätigung durch das Lokal (Edge Function venue-confirm)
select (select id from app.evening_reservations where evening_id = :'e1') as r1 \gset
select is(ops.venue_reservation_summary(:'r1') ->> 'venue_name', 'Café am See', 'Zusammenfassung für das Lokal');
select ok(ops.venue_reservation_summary(:'r1')::text !~ '(Anna|Ben|@example)', 'Ohne Mitgliederdaten');
select ok((ops.venue_confirm_reservation(:'r1') ->> 'venue_confirmed_at') is not null, 'Lokal bestätigt');
select is((select count(*)::int from ops.audit_log where action = 'venue.reservation_confirmed' and target_id = :'r1'), 1, 'Im Audit-Protokoll');
select tests.m5_clock_to(app.now() + interval '25 hours');
select ops.process_evening_deadlines();
select is(tests.m5_count('admin.venue_unconfirmed', null, :'e1'), 0, 'Bestätigte Reservierung: kein Hinweis an Benn');
select ops.sim_clock_reset();

-- Lokal ohne E-Mail-Reservierung: Benn bekommt die Reservierung zum Anrufen
select tests.m5_confirmed_evening(tests.m5_id('emil'), tests.m5_id('fritz'), tests.m5_at(5, '20:00')) as e3 \gset
select is((select count(*)::int from ops.notification_queue where template = 'venue.reservation' and evening_id = :'e3' and venue_id is not null), 1,
  'E-Mail-Lokal: Mail ans Lokal');
update app.venues set reservation_mode = 'telefon' where id = tests.m5_id('venue');
select tests.m5_confirmed_evening(tests.m5_id('anna'), tests.m5_id('cem'), tests.m5_at(5, '19:30')) as e4 \gset
select is((select count(*)::int from ops.notification_queue where template = 'venue.reservation' and evening_id = :'e4' and user_id = tests.m5_id('dora')), 1,
  'Telefon-Lokal: Reservierung geht an Benn');
select (select id from ops.notification_queue where template = 'venue.reservation' and evening_id = :'e4') as q_manual \gset
select is(ops.notification_context(:q_manual) #>> '{recipient,kind}', 'admin', 'Empfänger: Admin');
select is(ops.notification_context(:q_manual) #>> '{reservation,venue,contact_phone}', null, 'Fixture-Lokal hat kein Telefon hinterlegt');

-- ---------------------------------------------------------------------------
-- Ausführungsrechte
-- ---------------------------------------------------------------------------
select tests.act_as(tests.m5_id('anna'));
select throws_ok(format('select app.evening_transition(%L, %L)', :'e1', 'happened'), '42501', null,
  'Mitglieder können app.evening_transition nicht direkt aufrufen');
select throws_ok(format('select app.contact_share_for(%L, %L)', :'e1', tests.m5_id('ben')), '42501', null,
  'Mitglieder können app.contact_share_for nicht direkt aufrufen');
select throws_ok(format('select app.member_first_name(%L)', tests.m5_id('cem')), '42501', null,
  'Mitglieder lesen keine fremden Vornamen');
select throws_ok(format('select * from app.shared_windows(%L, %L, %L)', tests.m5_id('ben'), tests.m5_id('cem'), :'p1'), '42501', null,
  'Gemeinsame Fenster fremder Personen bleiben verborgen');
select tests.reset_role();
select ok(not has_function_privilege('authenticated', 'app.evening_after_transition(app.evenings, text, text, uuid, jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'ops.enqueue_notification(uuid, text, text, jsonb, timestamptz, uuid, text, boolean, boolean, uuid)', 'execute')
  and not has_function_privilege('authenticated', 'ops.process_evening_deadlines(integer)', 'execute')
  and not has_function_privilege('authenticated', 'app.evening_reserve_slot(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'app.evening_resolve_outcome(uuid, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'app.evening_transition(uuid, text, uuid, jsonb)', 'execute'),
  'Interne Funktionen (Fristen-Job, Nebenwirkungen, Warteschlange) sind für Mitglieder gesperrt');
select ok(has_function_privilege('authenticated', 'api.evening_confirm(uuid, timestamptz)', 'execute')
  and has_function_privilege('service_role', 'ops.process_evening_deadlines(integer)', 'execute')
  and has_function_privilege('service_role', 'ops.notify_claim(integer, integer)', 'execute'),
  'Mitglieder-RPCs für authenticated, Jobs für service_role');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) a
            where n.nspname in ('app', 'api', 'ops') and a.grantee = 0 and a.privilege_type = 'EXECUTE'
              -- api.my_sanctions entsteht erst in 0700 (nach dieser Migration); das deckt die Integrations-Migration ab.
              and p.oid <> 'api.my_sanctions()'::regprocedure), 0,
  'Keine Funktion in app, api, ops (bis M5) ist für PUBLIC ausführbar');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('app', 'ops', 'api')
              and (p.proname like 'evening%' or p.proname like 'notify%' or p.proname like 'venue%' or p.proname like 'admin_%venue%')
              and has_function_privilege('anon', p.oid, 'execute')), 0, 'anon darf keine Abend-Funktion ausführen');

select * from finish();
rollback;
