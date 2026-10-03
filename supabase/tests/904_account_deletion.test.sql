-- Härtung · Vertrag 5: Kontolöschung sagt offene Abende ab (M5-Nachricht an das Gegenüber und das Lokal, die die
-- Kaskade überlebt) und hält die sofortige Kündigung eines Stripe-Abos fest. Fehler werden Benn gemeldet.
begin;
select no_plan();
\ir 500_fixtures.sql

select tests.m5_setup();
create temp table d (k text primary key, id uuid, j jsonb);
grant select on d to public;

-- Anna (wird gelöscht) hat einen bestätigten Abend mit Ben und einen offenen Vorschlag mit Cem.
insert into d (k, id) values ('confirmed', tests.m5_confirmed_evening(tests.m5_id('anna'), tests.m5_id('ben'), tests.m5_at(4, '19:00')));
insert into d (k, id) values ('proposal', tests.m5_new_evening(tests.m5_id('anna'), tests.m5_id('cem'), array[tests.m5_at(5, '19:30')]));
-- Die Reservierungs-Mail ans Lokal ist schon verschickt (sonst gäbe es nichts abzusagen).
update ops.notification_queue set email_state = 'sent', sent_at = now() where template = 'venue.reservation' and evening_id = (select id from d where k = 'confirmed');
update app.evening_reservations set venue_notified_at = now() where evening_id = (select id from d where k = 'confirmed');
-- Laufendes Abo
update billing.memberships set tier = 'andante', status = 'active', contract_number = 'FM-ANNA-0904',
  stripe_customer_id = 'cus_anna', stripe_subscription_id = 'sub_anna_0904' where user_id = tests.m5_id('anna');
select is(billing.available_evenings(tests.m5_id('ben')), 5, 'Ben: ein Abend gebunden (6 − 1)');
-- Bezahlter Zeitraum mit Zuteilung (period_id im Kontingent-Buch; Kaskade „set null“ muss die Löschung überstehen)
insert into billing.membership_periods (id, user_id, tier, starts_at, ends_at, evenings_allowed)
values ('90400000-0000-0000-0000-000000000001', tests.m5_id('anna'), 'andante', now(), now() + interval '28 days', 2);
insert into billing.evening_ledger (user_id, kind, amount, period_id, note)
values (tests.m5_id('anna'), 'period_grant', 2, '90400000-0000-0000-0000-000000000001', 'Zuteilung');
select throws_ok($$ update billing.evening_ledger set amount = 99 where user_id = tests.m5_id('ben') $$, '42501', null,
  'Kontingent-Buch bleibt „nur anhängen“');
select throws_ok($$ update billing.evening_ledger set evening_id = gen_random_uuid() where user_id = tests.m5_id('ben') and evening_id is not null $$,
  '42501', null, 'Auch der Abend-Bezug lässt sich nicht umhängen');

insert into d (k, j) values ('prepare', ops.account_deletion_prepare(tests.m5_id('anna')));

-- Abende abgesagt, über den Zustandsautomaten mit Admin-Ereignis
select is((select state from app.evenings where id = (select id from d where k = 'confirmed')), 'cancelled_early', 'Bestätigter Abend abgesagt');
select is((select state from app.evenings where id = (select id from d where k = 'proposal')), 'declined', 'Offener Vorschlag beendet');
select is((select count(*)::int from app.evening_events where event = 'cancel_admin' and details ->> 'source' = 'konto_geloescht'
             and evening_id in (select id from d where k in ('confirmed', 'proposal'))), 2, 'Zwei Absagen mit Ereignis cancel_admin, Quelle konto_geloescht');
select is((select (j -> 'evenings' ->> 'cancelled')::int from d where k = 'prepare'), 2, 'Antwort nennt zwei abgesagte Abende');
select is(billing.available_evenings(tests.m5_id('ben')), 6, 'Ben hat seinen Abend zurück');
select is((select count(*)::int from safety.mail_queue where template = 'safety.evening_cancelled'), 0,
  'Kein Sicherheits-Mail-Weg: die Nachricht kommt aus M5');

-- Nachrichten: neutral, an Gegenüber und Lokal, vom Abend gelöst (überleben die Kaskade)
select is((select count(*)::int from ops.notification_queue where user_id = tests.m5_id('anna') and sent_at is null), 0,
  'Keine offenen Nachrichten an Anna');
select is((select payload ->> 'by' from ops.notification_queue where user_id = tests.m5_id('ben') and template = 'evening.cancelled'),
  'fermata', 'Ben: „Wir mussten den Abend absagen“ – ohne Grund');
select is((select evening_id from ops.notification_queue where user_id = tests.m5_id('ben') and template = 'evening.cancelled'), null,
  'Nachricht an Ben ist vom Abend gelöst');
select is((select payload -> 'snapshot' -> 'evening' -> 'venue' ->> 'name' from ops.notification_queue
           where user_id = tests.m5_id('ben') and template = 'evening.cancelled'), 'Café am See', 'Inhalt festgehalten (Lokal)');
select ok((select not (payload -> 'snapshot' -> 'evening' ? 'reasons_text') from ops.notification_queue
           where user_id = tests.m5_id('ben') and template = 'evening.cancelled'), 'ohne „Warum Sie beide“');
select is((select count(*)::int from ops.notification_queue where user_id = tests.m5_id('cem') and template = 'evening.declined' and evening_id is null),
  1, 'Cem: „Aus dem Vorschlag wird diesmal kein Abend“, vom Abend gelöst');
select is((select count(*)::int from ops.notification_queue where template = 'venue.cancellation' and evening_id is null
             and payload -> 'snapshot' -> 'reservation' ->> 'table_code' is not null), 1, 'Lokal: Absage der Reservierung, festgehalten');

-- Stripe: Kündigung „konto_geloescht“ festgehalten, ohne Name und E-Mail
select is((select j -> 'stripe' ->> 'subscription_id' from d where k = 'prepare'), 'sub_anna_0904', 'Antwort nennt das zu beendende Abo');
select is((select details ->> 'reason' from billing.contract_actions where kind = 'cancel' and user_id = tests.m5_id('anna')), 'konto_geloescht',
  'Vertragshandlung cancel mit Grund konto_geloescht');
select is((select details ->> 'contract_number' from billing.contract_actions where kind = 'cancel' and user_id = tests.m5_id('anna')), 'FM-ANNA-0904',
  'mit Vertragsnummer');
select ok((select not (details ? 'name') and not (details ? 'contact_email') from billing.contract_actions where kind = 'cancel' and user_id = tests.m5_id('anna')),
  'ohne Name und E-Mail');
select is((select status from billing.memberships where user_id = tests.m5_id('anna')), 'ended', 'Mitgliedschaft beendet');

-- Stripe-Fehler: Hinweis für Benn, Ergebnis vermerkt
select ops.account_deletion_stripe_result((select (j -> 'stripe' ->> 'contract_action_id')::uuid from d where k = 'prepare'), false,
  '{"error": "500 api_error"}');
select is((select result ->> 'stripe' from billing.contract_actions where kind = 'cancel' and user_id = tests.m5_id('anna')), 'failed', 'Fehler vermerkt');
select is((select severity from safety.safety_flags where kind = 'stripe_kuendigung_bei_kontoloeschung_fehlgeschlagen'), 'hoch', 'Hinweis für Benn');
select is((select details ->> 'stripe_subscription_id' from safety.safety_flags where kind = 'stripe_kuendigung_bei_kontoloeschung_fehlgeschlagen'),
  'sub_anna_0904', 'mit Abo-Kennung (zum Beenden im Stripe-Dashboard)');
select is((select count(*)::int from safety.mail_queue where to_admin and template = 'safety.admin_alert'
             and data ->> 'kind' = 'stripe_kuendigung_bei_kontoloeschung_fehlgeschlagen'), 1, 'Sofort-Mail an Benn (Stufe hoch)');

-- Jetzt löscht Supabase Auth die Person (Kaskade)
select lives_ok($$ delete from auth.users where id = tests.m5_id('anna') $$, 'Löschung in Supabase Auth gelingt trotz Abenden und Zeiträumen');
select is((select count(*)::int from billing.evening_ledger where user_id = tests.m5_id('ben') and note like 'Absage%' and evening_id is null), 1,
  'Bens Buchung zum Abend bleibt, ohne Bezug auf den gelöschten Abend');
select is((select count(*)::int from app.evenings where id in (select id from d where k in ('confirmed', 'proposal'))), 0, 'Abende mit dem Konto gelöscht');
select is((select count(*)::int from ops.notification_queue where user_id = tests.m5_id('ben') and template = 'evening.cancelled' and sent_at is null),
  1, 'Nachricht an Ben überlebt die Löschung');
select is(ops.notification_context((select id from ops.notification_queue where user_id = tests.m5_id('ben') and template = 'evening.cancelled')) -> 'recipient' ->> 'email',
  'ben@example.test', 'Empfänger wird erst beim Versand aufgelöst');
select is(ops.notification_context((select id from ops.notification_queue where user_id = tests.m5_id('ben') and template = 'evening.cancelled')) -> 'evening' ->> 'starts_at',
  to_jsonb(tests.m5_at(4, '19:00')) #>> '{}', 'Kontext mit festgehaltenem Abend');
select is(ops.notification_context((select id from ops.notification_queue where template = 'venue.cancellation' and evening_id is null)) -> 'recipient' ->> 'email',
  'tisch@cafe.example', 'Lokal bekommt die Absage');
select is((select user_id from billing.contract_actions where details ->> 'contract_number' = 'FM-ANNA-0904' and kind = 'cancel'), null,
  'Nachweis bleibt ohne Personenbezug');
select ok(exists (select 1 from ops.notify_claim(50) c where c.user_id = tests.m5_id('ben') and c.template = 'evening.cancelled'
                  and c.context -> 'evening' -> 'venue' ->> 'name' = 'Café am See'), 'Versand holt die Nachricht mit Inhalt ab');

-- Nochmal löschen (zweiter Versuch nach Fehler) ist harmlos: nichts mehr abzusagen
select tests.create_user('zweiter@example.test', '00000000-0000-0000-0000-000000000949');
select app.on_account_created('00000000-0000-0000-0000-000000000949');
select is((ops.account_deletion_prepare('00000000-0000-0000-0000-000000000949') -> 'evenings' ->> 'cancelled')::int, 0, 'Ohne Abende: nichts abzusagen');
select is((ops.account_deletion_prepare('00000000-0000-0000-0000-000000000949') -> 'stripe'), 'null'::jsonb, 'Ohne Abo: keine Kündigung');

select * from finish();
rollback;
