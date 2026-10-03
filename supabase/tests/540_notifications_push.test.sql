-- M5: Push-Abos (Einwilligung push), Warteschlange, Ruhezeiten, Sicherheitsnachrichten, Ersatzweg E-Mail,
-- Wiederholung nach Fehlern, Aufräumen bei 404/410, Doppelte vermeiden.
begin;
\ir 500_fixtures.sql
select * from no_plan();
select tests.m5_setup();

select replace(rtrim(translate(encode(extensions.gen_random_bytes(65), 'base64'), '+/', '-_'), '='), E'\n', '') as p256dh,
       replace(rtrim(translate(encode(extensions.gen_random_bytes(16), 'base64'), '+/', '-_'), '='), E'\n', '') as authkey \gset
select is(length(:'p256dh'), 87, 'Testschlüssel hat 87 Zeichen');

-- ---------------------------------------------------------------------------
-- Push-Abos
-- ---------------------------------------------------------------------------
select tests.act_as(tests.m5_id('anna'));
select is(tests.hint_of(format('select api.save_push_subscription(%L, %L, %L, %L)', 'https://push.example.test/abc', :'p256dh', :'authkey', 'ios')),
  'consent_missing', 'Ohne Einwilligung push kein Abo');
select tests.reset_role();
insert into app.consents (user_id, kind, action, document_version) values
  (tests.m5_id('anna'), 'push', 'granted', 'v1'), (tests.m5_id('ben'), 'push', 'granted', 'v1');
select tests.act_as(tests.m5_id('anna'));
select is(tests.hint_of(format('select api.save_push_subscription(%L, %L, %L)', 'http://push.example.test/abc', :'p256dh', :'authkey')),
  'invalid_subscription', 'Nur https');
select is(tests.hint_of(format('select api.save_push_subscription(%L, %L, %L)', 'https://push.example.test/abc', 'kurz', :'authkey')),
  'invalid_subscription', 'Schlüssel im richtigen Format');
select is(tests.hint_of(format('select api.save_push_subscription(%L, %L, %L, %L)', 'https://push.example.test/abc', :'p256dh', :'authkey', 'tv')),
  'invalid_platform', 'Nur bekannte Plattformen');
select ok(api.save_push_subscription('https://push.example.test/abc', :'p256dh', :'authkey', 'ios') is not null, 'Abo gespeichert');
select ok(api.save_push_subscription('https://push.example.test/abc', :'p256dh', :'authkey', 'ios') is not null, 'Erneut speichern ist erlaubt');
select is((select count(*)::int from api.my_push_subscriptions()), 1, 'Ein Abo, keine Doppelten');
select is((select platform from api.my_push_subscriptions()), 'ios', 'Plattform sichtbar, Adresse und Schlüssel nicht');
select tests.reset_role();

select tests.act_as(tests.m5_id('ben'));
select ok(api.save_push_subscription('https://push.example.test/abc', :'p256dh', :'authkey', 'android') is not null,
  'Gerät wechselt die Person');
select tests.reset_role();
select is((select user_id from app.push_subscriptions where endpoint = 'https://push.example.test/abc'), tests.m5_id('ben'),
  'Abo gehört jetzt Ben');
select tests.act_as(tests.m5_id('ben'));
select ok(api.delete_push_subscription('https://push.example.test/abc'), 'Ben entfernt sein Abo');
select ok(not api.delete_push_subscription('https://push.example.test/abc'), 'Zweites Entfernen: nichts mehr da');
select tests.reset_role();
select tests.act_as_anon();
select throws_ok(format('select api.save_push_subscription(%L, %L, %L)', 'https://push.example.test/x', :'p256dh', :'authkey'),
  '42501', null, 'Ohne Anmeldung kein Abo');
select tests.reset_role();

-- Abo für Anna wieder anlegen (für die Versandtests)
insert into app.push_subscriptions (user_id, endpoint, p256dh, auth, platform)
values (tests.m5_id('anna'), 'https://push.example.test/anna', :'p256dh', :'authkey', 'ios');

-- ---------------------------------------------------------------------------
-- Ruhezeit-Funktion (22:00–08:00 Europe/Berlin)
-- ---------------------------------------------------------------------------
select ok(ops.quiet_hours_end(tests.m5_at(1, '21:59')) is null, '21:59: keine Ruhezeit');
select is(ops.quiet_hours_end(tests.m5_at(1, '22:00')), tests.m5_at(2, '08:00'), '22:00: Ruhezeit bis 08:00 am nächsten Tag');
select is(ops.quiet_hours_end(tests.m5_at(2, '07:59')), tests.m5_at(2, '08:00'), '07:59: Ruhezeit bis 08:00');
select ok(ops.quiet_hours_end(tests.m5_at(2, '08:00')) is null, '08:00: keine Ruhezeit');

-- ---------------------------------------------------------------------------
-- Anlegen
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(1, '12:00'));
select ops.enqueue_notification(tests.m5_id('anna'), 'test.frist', 'push', '{}'::jsonb, null, null, 'frist-1', false, true) as q_frist \gset
select is((select channel from ops.notification_queue where id = :q_frist), 'both', 'Mit Frist wird aus Push immer auch E-Mail');
select ok(ops.enqueue_notification(tests.m5_id('anna'), 'test.frist', 'push', '{}'::jsonb, null, null, 'frist-1', false, true) is null,
  'Gleicher dedupe_key: keine zweite Nachricht');
select ops.enqueue_notification(null, 'test.lokal', 'both', '{}'::jsonb, null, null, null, false, false, tests.m5_id('venue')) as q_venue \gset
select is((select channel from ops.notification_queue where id = :q_venue), 'email', 'Lokale bekommen nur E-Mails');
select is(tests.hint_of($$ select ops.enqueue_notification(null, 'test.x', 'fax') $$), 'invalid_channel', 'Unbekannter Kanal');
delete from ops.notification_queue;

-- ---------------------------------------------------------------------------
-- Tagsüber: E-Mail und Push gleichzeitig, Sperre gegen doppeltes Abholen
-- ---------------------------------------------------------------------------
select ops.enqueue_notification(tests.m5_id('anna'), 'test.ping', 'both') as q1 \gset
select is((select count(*)::int from ops.notify_claim(10) c where c.id = :q1 and c.do_email and c.do_push), 1, 'Tagsüber: E-Mail und Push');
select is((select count(*)::int from ops.notify_claim(10) c where c.id = :q1), 0, 'Gesperrt: kein zweites Abholen');
select is(ops.notify_complete(:q1, 'sent', 'sent'), 'sent', 'Versand gemeldet');
select ok((select sent_at is not null and email_state = 'sent' and push_state = 'sent' from ops.notification_queue where id = :q1), 'Fertig');
delete from ops.notification_queue;

-- Abholen liefert Ziele und Kontext
select ops.enqueue_notification(tests.m5_id('anna'), 'test.ping', 'both') as q2 \gset
select is((select jsonb_array_length(c.push_targets) from ops.notify_claim(10) c where c.id = :q2), 1, 'Ein Push-Ziel');
select ops.notify_complete(:q2, 'sent', 'sent');
delete from ops.notification_queue;

-- ---------------------------------------------------------------------------
-- Ruhezeit: E-Mail sofort, Push morgens um 08:00; Sicherheit sofort
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(1, '23:00'));
select ops.enqueue_notification(tests.m5_id('anna'), 'test.ping', 'both') as q3 \gset
select ops.enqueue_notification(tests.m5_id('anna'), 'test.sicher', 'both', '{}'::jsonb, null, null, null, true) as q4 \gset
create temp table claim_quiet as select * from ops.notify_claim(10);
select is((select count(*)::int from claim_quiet c where c.id = :q3 and c.do_email and not c.do_push), 1, 'Ruhezeit: nur E-Mail');
select is((select push_not_before from ops.notification_queue where id = :q3), tests.m5_at(2, '08:00'), 'Push wartet bis 08:00');
select is((select count(*)::int from claim_quiet c where c.id = :q4 and c.do_email and c.do_push and c.is_safety), 1,
  'Sicherheitsnachricht: Push auch in der Ruhezeit');
select is(ops.notify_complete(:q3, 'sent', null), 'pending', 'Nach der E-Mail bleibt der Push offen');
select is(ops.notify_complete(:q4, 'sent', 'sent'), 'sent', 'Sicherheitsnachricht komplett');
select tests.m5_clock_to(tests.m5_at(1, '23:30'));
select is((select count(*)::int from ops.notify_claim(10) c where c.id = :q3), 0, 'Während der Ruhezeit kein Push');
select tests.m5_clock_to(tests.m5_at(2, '08:00'));
select is((select count(*)::int from ops.notify_claim(10) c where c.id = :q3 and c.do_push and not c.do_email), 1, '08:00: Push wird nachgeholt');
select is(ops.notify_complete(:q3, null, 'sent'), 'sent', 'Jetzt fertig');
delete from ops.notification_queue;

-- ---------------------------------------------------------------------------
-- Kein Push möglich (keine Einwilligung oder kein Abo): Ersatzweg E-Mail
-- ---------------------------------------------------------------------------
select tests.m5_clock_to(tests.m5_at(2, '12:00'));
select ops.enqueue_notification(tests.m5_id('cem'), 'test.nurpush', 'push') as q5 \gset
select is((select count(*)::int from ops.notify_claim(10) c where c.id = :q5 and c.do_email and not c.do_push), 1,
  'Ohne Einwilligung push: E-Mail statt Push');
select is((select push_state from ops.notification_queue where id = :q5), 'skipped', 'Push übersprungen');
select ok(exists (select 1 from ops.notifications_log where user_id = tests.m5_id('cem') and channel = 'push' and status = 'skipped'),
  'Übersprungener Push steht im Protokoll (ohne Inhalt)');
select ops.notify_complete(:q5, 'sent', null);
-- Abo ungültig (410): nur Push vorgesehen → E-Mail
select ops.enqueue_notification(tests.m5_id('anna'), 'test.nurpush', 'push') as q6 \gset
select is((select count(*)::int from ops.notify_claim(10) c where c.id = :q6 and c.do_push and not c.do_email), 1, 'Anna hat ein Abo');
select is(ops.push_subscription_result('https://push.example.test/anna', 410), 'removed', '410: Abo gelöscht');
select is((select count(*)::int from app.push_subscriptions where user_id = tests.m5_id('anna')), 0, 'Abo ist weg');
select is(ops.notify_complete(:q6, null, 'gone'), 'pending', 'Alle Abos ungültig: Nachricht bleibt offen');
select is((select email_state from ops.notification_queue where id = :q6), 'pending', 'Ersatzweg E-Mail');
select is((select count(*)::int from ops.notify_claim(10) c where c.id = :q6 and c.do_email), 1, 'E-Mail wird verschickt');
select ops.notify_complete(:q6, 'sent', null);
delete from ops.notification_queue;

-- Abo-Ergebnisse
insert into app.push_subscriptions (user_id, endpoint, p256dh, auth) values (tests.m5_id('anna'), 'https://push.example.test/a2', :'p256dh', :'authkey');
select is(ops.push_subscription_result('https://push.example.test/a2', 500), 'failed', '500: Fehler gezählt');
select is((select failures from app.push_subscriptions where endpoint = 'https://push.example.test/a2'), 1, 'Fehlerzähler');
select is(ops.push_subscription_result('https://push.example.test/a2', 201), 'ok', '201: Erfolg');
select ok((select failures = 0 and last_success_at is not null from app.push_subscriptions where endpoint = 'https://push.example.test/a2'),
  'Erfolg setzt Zähler zurück');
select is(ops.push_subscription_result('https://push.example.test/a2', 404), 'removed', '404: Abo gelöscht');

-- ---------------------------------------------------------------------------
-- Fehler: neuer Versuch mit wachsender Wartezeit, nach notify.max_attempts aufgeben
-- ---------------------------------------------------------------------------
select ops.enqueue_notification(tests.m5_id('cem'), 'test.ping', 'email') as q7 \gset
select ops.notify_claim(10);
select is(ops.notify_complete(:q7, 'failed', null, 'Brevo antwortet 500'), 'pending', 'Fehler: später erneut');
select is((select not_before from ops.notification_queue where id = :q7), app.now() + interval '10 minutes', 'Erster neuer Versuch nach 10 Minuten');
select is((select last_error from ops.notification_queue where id = :q7), 'Brevo antwortet 500', 'Fehler gespeichert');
select is((select count(*)::int from ops.notify_claim(10) c where c.id = :q7), 0, 'Vorher kein neuer Versuch');
select tests.m5_clock_to(tests.m5_at(2, '12:10'));
select is((select count(*)::int from ops.notify_claim(10) c where c.id = :q7), 1, 'Nach 10 Minuten neuer Versuch');
update ops.notification_queue set attempts = 4 where id = :q7;
select is(ops.notify_complete(:q7, 'failed', null, 'immer noch'), 'failed', 'Nach dem 5. Versuch aufgeben');
select ok((select failed_at is not null and email_state = 'failed' from ops.notification_queue where id = :q7), 'Als fehlgeschlagen markiert');
delete from ops.notification_queue;

-- ---------------------------------------------------------------------------
-- Veraltete Nachrichten und geschlossene Konten werden nicht verschickt
-- ---------------------------------------------------------------------------
select ops.enqueue_notification(tests.m5_id('fritz'), 'test.ping', 'email') as q8 \gset
update app.accounts set status = 'closed' where user_id = tests.m5_id('fritz');
select is((select count(*)::int from ops.notify_claim(10) c where c.id = :q8), 0, 'Geschlossenes Konto: nicht abgeholt');
select is((select skip_reason from ops.notification_queue where id = :q8), 'account_closed', 'Grund gespeichert');
select ok((select failed_at is not null and email_state = 'skipped' from ops.notification_queue where id = :q8), 'Erledigt ohne Versand');

-- ---------------------------------------------------------------------------
-- Admin-Empfänger und Anstoß über pg_net
-- ---------------------------------------------------------------------------
select ops.enqueue_notification(tests.m5_id('dora'), 'admin.test', 'email') as q9 \gset
select is(ops.notification_context(:q9) #>> '{recipient,kind}', 'admin', 'Admin-Vorlagen gehen an Admins');
select is(ops.notify_kick(), false, 'Ohne notify.dispatch_url kein Anstoß');
update ops.app_settings set value = '"http://localhost:54371/functions/v1/notify-dispatch"' where key = 'notify.dispatch_url';
select is(ops.notify_kick(), false, 'Ohne Geheimnis in Vault kein Anstoß');

select * from finish();
rollback;
