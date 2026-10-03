-- M5: Finde-Fenster, Rückmeldung, Ergebnis (happened / no_show, Platzhalter B9), Sicherheits-Halt,
-- Kontakttausch nur bei beidseitigem Ja, Nachbesprechung. Ein gemeinsamer Zeitstrahl mit Testuhr.
begin;
\ir 500_fixtures.sql
select * from no_plan();
select tests.m5_setup();

-- Acht bestätigte Abende auf vier Tage verteilt
select tests.m5_confirmed_evening(tests.m5_id('ben'), tests.m5_id('emil'), tests.m5_at(3, '19:00')) as e7 \gset
select tests.m5_confirmed_evening(tests.m5_id('cem'), tests.m5_id('fritz'), tests.m5_at(3, '19:30')) as e8 \gset
select tests.m5_confirmed_evening(tests.m5_id('anna'), tests.m5_id('ben'), tests.m5_at(4, '19:30')) as e1 \gset
select tests.m5_confirmed_evening(tests.m5_id('cem'), tests.m5_id('emil'), tests.m5_at(4, '19:00')) as e2 \gset
select tests.m5_confirmed_evening(tests.m5_id('anna'), tests.m5_id('fritz'), tests.m5_at(5, '19:30')) as e3 \gset
select tests.m5_confirmed_evening(tests.m5_id('ben'), tests.m5_id('cem'), tests.m5_at(5, '19:00')) as e4 \gset
select tests.m5_confirmed_evening(tests.m5_id('emil'), tests.m5_id('fritz'), tests.m5_at(6, '19:00')) as e5 \gset
select tests.m5_confirmed_evening(tests.m5_id('anna'), tests.m5_id('cem'), tests.m5_at(6, '19:30')) as e6 \gset
select is((select count(*)::int from app.evenings where state = 'confirmed'), 8, 'Acht bestätigte Abende');

-- ---------------------------------------------------------------------------
-- Vor dem Abend: Erkennungszeichen, keine Rückmeldung, kein Finde-Fenster
-- ---------------------------------------------------------------------------
select tests.act_as(tests.m5_id('anna'));
select is(api.set_recognition_hint(:'e1', '  dunkelblauer   Schal '), 'dunkelblauer Schal', 'Erkennungszeichen gespeichert (Leerzeichen bereinigt)');
select is(api.evening_detail(:'e1') ->> 'my_recognition_hint', 'dunkelblauer Schal', 'Eigenes Erkennungszeichen sichtbar');
select ok(api.evening_find_info(:'e1') is null, 'Vor dem Finde-Fenster: nichts');
select is(tests.hint_of(format('select api.submit_feedback(%L, true)', :'e1')), 'feedback_not_open', 'Vor dem Abend keine Rückmeldung');
select tests.reset_role();
select tests.act_as(tests.m5_id('ben'));
select is(tests.hint_of(format('select api.set_recognition_hint(%L, %L)', :'e1', repeat('x', 81))), 'hint_too_long', 'Höchstens 80 Zeichen');
select is(api.set_recognition_hint(:'e1', 'grüne Jacke'), 'grüne Jacke', 'Ben setzt sein Zeichen');
select is(api.set_recognition_hint(:'e1', ''), null, 'Leer löscht das Zeichen');
select is(api.set_recognition_hint(:'e1', 'grüne Jacke'), 'grüne Jacke', 'Ben setzt es wieder');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Tag 3: Sicherheits-Halt (offene Meldung) für e8
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(3, '21:00'));
insert into safety.reports (reporter, reported, evening_id, context, category, description)
values (tests.m5_id('cem'), tests.m5_id('fritz'), :'e8', 'abend', 'unangenehm', 'Test');
select tests.act_as(tests.m5_id('cem'));
select is(api.submit_feedback(:'e8', true, true, false) ->> 'state', 'confirmed', 'Erste Rückmeldung zu e8');
select tests.reset_role();
select tests.act_as(tests.m5_id('fritz'));
select is(api.submit_feedback(:'e8', true, true, false) ->> 'state', 'confirmed', 'Offene Meldung: keine automatische Entscheidung');
select tests.reset_role();

select tests.m5_clock_to(tests.m5_at(4, '10:00'));
select ops.process_evening_deadlines();
select is(tests.m5_count('evening.feedback_request', null, :'e7'), 2, 'e7: Bitte um Rückmeldung an beide');
select is(tests.m5_count('evening.feedback_request', null, :'e8'), 0, 'e8: beide haben schon geantwortet');

-- ---------------------------------------------------------------------------
-- Tag 4: Finde-Fenster (e1, 19:30) und Kontakttausch (e2)
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(4, '19:30') - interval '15 minutes 1 second');
select tests.act_as(tests.m5_id('anna'));
select ok(api.evening_find_info(:'e1') is null, '15:01 Minuten vorher: noch nichts');
select tests.reset_role();
select tests.m5_clock_to(tests.m5_at(4, '19:30') - interval '15 minutes');
select (select table_code from app.evening_reservations where evening_id = :'e1') as code_e1 \gset
select tests.act_as(tests.m5_id('anna'));
select ok(api.evening_find_info(:'e1') is not null, '15 Minuten vorher: Finde-Fenster offen');
select is(api.evening_find_info(:'e1') ->> 'reservation_name', 'Fermata', 'Reservierungsname');
select is(api.evening_find_info(:'e1') ->> 'table_code', :'code_e1', 'Tisch-Code');
select is(api.evening_find_info(:'e1') ->> 'counterpart_first_name', 'Ben', 'Vorname des Gegenübers');
select is(api.evening_find_info(:'e1') ->> 'counterpart_hint', 'grüne Jacke', 'Erkennungszeichen des Gegenübers');
select is(api.evening_find_info(:'e1') ->> 'my_hint', 'dunkelblauer Schal', 'Eigenes Erkennungszeichen');
select ok(api.evening_find_info(:'e1') ->> 'counterpart_photo_url' is null, 'Foto: Platzhalter B7');
select ok(api.evening_find_info(:'e1')::text !~ '(Brückner|ben@example|\+49)', 'Kein Nachname, kein Kontakt');
select is((select my_action from api.my_evenings() where evening_id = :'e1'), 'find', 'Erwartete Handlung: finden');
select tests.reset_role();
select tests.act_as(tests.m5_id('ben'));
select is(api.evening_find_info(:'e1') ->> 'counterpart_hint', 'dunkelblauer Schal', 'Ben sieht Annas Zeichen');
select tests.reset_role();
select tests.m5_clock_to(tests.m5_at(4, '19:30') + interval '45 minutes');
select tests.act_as(tests.m5_id('anna'));
select ok(api.evening_find_info(:'e1') is not null, '45 Minuten nach Beginn: noch offen');
select tests.reset_role();
select tests.m5_clock_to(tests.m5_at(4, '19:30') + interval '45 minutes 1 second');
select tests.act_as(tests.m5_id('anna'));
select ok(api.evening_find_info(:'e1') is null, 'Danach: nichts mehr');
select is(tests.hint_of(format('select api.set_recognition_hint(%L, %L)', :'e1', 'roter Hut')), 'find_window_closed',
  'Nach dem Fenster kein neues Zeichen');
select tests.reset_role();

-- Kontakttausch e2 (Cem und Emil): nur Cem sagt Ja
select tests.m5_clock_to(tests.m5_at(4, '21:30'));
select tests.act_as(tests.m5_id('cem'));
select is(tests.hint_of(format('select api.submit_feedback(%L, true, true, true, %L, true, null, null, null, true, false)', :'e2', 'ja')),
  'consent_missing', 'Kontakttausch nur mit Einwilligung kontakttausch');
select tests.reset_role();
insert into app.consents (user_id, kind, action, document_version) values (tests.m5_id('cem'), 'kontakttausch', 'granted', 'v1');
select tests.act_as(tests.m5_id('cem'));
select is(tests.hint_of(format('select api.submit_feedback(%L, true, true, true, %L, true, null, null, null, false, false)', :'e2', 'ja')),
  'nothing_to_share', 'Ja zum Kontakt braucht E-Mail oder Telefon');
select is(tests.hint_of(format('select api.submit_feedback(%L, true, true, false, %L)', :'e2', 'immer')),
  'invalid_input', 'Ungültige Angabe bei „wiedersehen“');
select is(tests.hint_of(format('select api.submit_feedback(%L, true, true, false, null, null, 6)', :'e2')),
  'invalid_rating', 'Bewertung 1 bis 5');
select is(api.submit_feedback(:'e2', true, true, true, 'ja', true, 4, 4, null, true, false) ->> 'state', 'confirmed', 'Cem sagt Ja');
select tests.reset_role();
select tests.act_as(tests.m5_id('emil'));
select is(api.submit_feedback(:'e2', true, true, false, 'nein', true, 4, 2, 'Nicht mein Typ.') ->> 'state', 'happened',
  'Emil sagt Nein; beide waren da: happened');
select is(api.my_contact_share(:'e2') ->> 'status', 'none', 'Emil: kein Kontakttausch');
select is((select count(*)::int from app.feedback where evening_id = :'e2'), 1, 'Emil sieht nur seine eigene Rückmeldung');
select is((select count(*)::int from app.contact_shares where evening_id = :'e2'), 0, 'Emil sieht Cems Ja nicht');
select is((api.debrief_offer(:'e2') ->> 'minutes')::int, 20, 'Loge: 20 Minuten Nachbesprechung (Platzhalter B6)');
select ok((api.debrief_offer(:'e2') ->> 'eligible')::boolean, 'Emil kann eine Nachbesprechung führen');
select tests.reset_role();
select tests.act_as(tests.m5_id('cem'));
select is(api.my_contact_share(:'e2') ->> 'status', 'pending', 'Cem sieht nur „offen“, nie ein Nein');
select ok(api.my_contact_share(:'e2') -> 'counterpart' = 'null'::jsonb, 'Keine Daten des Gegenübers');
select ok(api.evening_detail(:'e2')::text !~ '(Nicht mein Typ|nein)', 'Emils Rückmeldung bleibt verborgen');
select tests.reset_role();
select is(tests.m5_count('evening.contact_released', null, :'e2'), 0, 'Keine Freigabe, keine Nachricht');
select is((select count(*)::int from app.contact_shares where evening_id = :'e2' and released_at is not null), 0, 'Nichts freigegeben');
select is(tests.m5_count('evening.debrief_offer', tests.m5_id('emil'), :'e2'), 1, 'Emil bekommt das Angebot zur Nachbesprechung');

-- ---------------------------------------------------------------------------
-- Tag 5: späte Meldung „nicht erschienen“ verlängert die Entscheidung (e7)
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(5, '09:00'));
select tests.act_as(tests.m5_id('ben'));
select is(api.submit_feedback(:'e7', true, false) ->> 'state', 'confirmed', 'Ben meldet: Emil war nicht da');
select tests.reset_role();
select is(tests.m5_count('evening.feedback_needed', tests.m5_id('emil'), :'e7'), 1, 'Emil wird neutral um Rückmeldung gebeten');
select (select id from ops.notification_queue where template = 'evening.feedback_needed' and evening_id = :'e7') as q_need \gset
select is((ops.notification_context(:q_need) #>> '{payload,respond_until}')::timestamptz, tests.m5_at(5, '09:00') + interval '24 hours',
  'Mit Frist evening.no_show_contest_hours');
select ok(ops.notification_context(:q_need)::text !~ '(Ben|other_attended|nicht erschienen)', 'Verrät nicht, was gemeldet wurde');

select tests.m5_clock_to(tests.m5_at(5, '10:00'));
select ops.process_evening_deadlines();
select is((select state from app.evenings where id = :'e7'), 'confirmed', 'e7: Widerspruchsfrist läuft noch');
select is((select max(due_at) from app.evening_deadlines where evening_id = :'e7' and kind = 'feedback' and payload ->> 'step' = 'resolve'),
  tests.m5_at(5, '09:00') + interval '24 hours', 'Neue Entscheidung nach Ablauf der Widerspruchsfrist geplant');
select is((select state from app.evenings where id = :'e8'), 'confirmed', 'e8: Sicherheits-Halt');
select is((select count(*)::int from app.evening_deadlines where evening_id = :'e8' and kind = 'feedback' and payload ->> 'hold' = 'true'
            and done_at is null), 1, 'e8: tägliche Prüfung geplant');
select is(tests.m5_count('evening.feedback_request', null, :'e1'), 2, 'e1: Bitte um Rückmeldung an beide');

-- ---------------------------------------------------------------------------
-- Tag 5 abends: Meldung ohne Widerspruch (e3), Widerspruch (e4)
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(5, '22:30'));
select tests.act_as(tests.m5_id('anna'));
select api.submit_feedback(:'e3', true, false);
select tests.reset_role();
select tests.act_as(tests.m5_id('ben'));
select api.submit_feedback(:'e4', true, false);
select tests.reset_role();
select tests.act_as(tests.m5_id('cem'));
select is(api.submit_feedback(:'e4', true, true) ->> 'state', 'confirmed', 'Cem widerspricht: keine automatische Entscheidung');
select tests.reset_role();
select is((select count(*)::int from safety.safety_flags where kind = 'no_show_bestritten' and details ->> 'evening_id' = :'e4'), 1,
  'Hinweis an Benn: Nichterscheinen bestritten');

-- ---------------------------------------------------------------------------
-- Tag 6
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(6, '09:00'));
select ops.process_evening_deadlines();
select is((select state from app.evenings where id = :'e7'), 'no_show', 'e7: kein Widerspruch in 24 h → no_show');
select is((select no_show_user from app.evenings where id = :'e7'), tests.m5_id('emil'), 'e7: Emil gilt als nicht erschienen');
update safety.reports set status = 'resolved' where evening_id = :'e8';

select tests.m5_clock_to(tests.m5_at(6, '10:00'));
select ops.process_evening_deadlines();
select is((select state from app.evenings where id = :'e8'), 'happened', 'e8: Meldung erledigt, tägliche Prüfung → happened');
select is((select state from app.evenings where id = :'e1'), 'happened', 'e1: keine Rückmeldung, keine Einwände → nach 24 h happened');
select is(tests.m5_count('evening.feedback_request', tests.m5_id('fritz'), :'e3'), 1, 'e3: nur Fritz wird gefragt');
select is(tests.m5_count('evening.feedback_request', tests.m5_id('anna'), :'e3'), 0, 'e3: Anna hat schon geantwortet');

-- e6: Anna gibt selbst an, nicht da gewesen zu sein
select tests.m5_clock_to(tests.m5_at(6, '22:00'));
select tests.act_as(tests.m5_id('anna'));
select is(api.submit_feedback(:'e6', false, null, true) ->> 'state', 'confirmed', 'Anna: war nicht da (Kontaktwunsch wird ignoriert)');
select is(api.debrief_offer(:'e6') ->> 'reason', 'not_attended', 'Ohne Teilnahme keine Nachbesprechung');
select tests.reset_role();
select is((select wants_contact from app.feedback where evening_id = :'e6' and user_id = tests.m5_id('anna')), false,
  'Kein Kontaktwunsch ohne Treffen');
select tests.act_as(tests.m5_id('cem'));
select is(api.submit_feedback(:'e6', true, false, false, null, false) ->> 'state', 'no_show', 'Beide Angaben passen: no_show sofort');
select tests.reset_role();
select is((select no_show_user from app.evenings where id = :'e6'), tests.m5_id('anna'), 'e6: Anna gilt als nicht erschienen');
select is((select count(*)::int from safety.safety_flags where kind = 'rueckmeldung_unsicher' and details ->> 'evening_id' = :'e6'), 1,
  '„Nicht sicher gefühlt“ erzeugt einen Hinweis an Benn');

-- ---------------------------------------------------------------------------
-- Tag 7: Entscheidungen
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(7, '10:00'));
select ops.process_evening_deadlines();
select is((select state from app.evenings where id = :'e3'), 'no_show', 'e3: Fritz hat nicht widersprochen → no_show');
select is((select no_show_user from app.evenings where id = :'e3'), tests.m5_id('fritz'), 'e3: Fritz');
select is((select state from app.evenings where id = :'e4'), 'confirmed', 'e4: bestritten, bleibt bei Benn');
select is(tests.m5_count('evening.feedback_request', null, :'e5'), 2, 'e5: Bitte um Rückmeldung');

-- Benn entscheidet e4
select tests.act_as(tests.m5_id('ben'));
select is(tests.hint_of(format('select api.admin_resolve_evening(%L, %L)', :'e4', 'happened')), 'admin_required', 'Nur Admins');
select tests.reset_role();
select tests.act_as(tests.m5_id('dora'));
select is(tests.hint_of(format('select api.admin_resolve_evening(%L, %L)', :'e4', 'happened')), 'admin_required', 'Admin nur mit Zwei-Faktor');
select tests.reset_role();
select tests.act_as(tests.m5_id('dora'), 'aal2');
select is(tests.hint_of(format('select api.admin_resolve_evening(%L, %L, %L)', :'e4', 'no_show', tests.m5_id('anna'))), 'invalid_user',
  'Nur Beteiligte können nicht erschienen sein');
select is(api.admin_resolve_evening(:'e4', 'happened', null, 'Beide waren laut Lokal da') ->> 'state', 'happened', 'Benn: happened');
select tests.reset_role();
select is((select count(*)::int from ops.audit_log where action = 'evening.resolve' and target_id = :'e4'), 1, 'Entscheidung im Audit-Protokoll');

-- Tag 8: e5 ohne jede Rückmeldung
select tests.m5_clock_to(tests.m5_at(8, '10:00'));
select ops.process_evening_deadlines();
select is((select state from app.evenings where id = :'e5'), 'happened', 'e5: keine Rückmeldung → happened');

-- Rückmeldung bleibt evening.feedback_open_days möglich; danach ist der Kontakttausch „geschlossen“
select tests.m5_clock_to(tests.m5_at(4, '19:00') + interval '7 days 1 minute');
select tests.act_as(tests.m5_id('cem'));
select is(api.my_contact_share(:'e2') ->> 'status', 'closed', 'Nach der Frist: geschlossen (ohne Grund)');
select tests.reset_role();
select tests.act_as(tests.m5_id('emil'));
select is(api.debrief_offer(:'e2') ->> 'reason', 'expired', 'Nachbesprechung nur evening.debrief_offer_days lang');
select tests.reset_role();
select tests.act_as(tests.m5_id('anna'));
select is(tests.hint_of(format('select api.submit_feedback(%L, true)', :'e1')), null, 'Späte Rückmeldung innerhalb der 7 Tage geht noch');
select tests.reset_role();

select * from finish();
rollback;
