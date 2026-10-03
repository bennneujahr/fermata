-- M6: Bestellung, Stripe-Ereignisse, Übersicht, Kündigungsknopf, Widerrufsbutton, Anfragen ohne Anmeldung.
begin;
select plan(72);

select tests.create_user('m611@example.test', '00000000-0000-0000-0000-000000000611');
select tests.create_user('m612@example.test', '00000000-0000-0000-0000-000000000612');
select tests.create_user('m613@example.test', '00000000-0000-0000-0000-000000000613');
select tests.create_user('admin619@example.test', '00000000-0000-0000-0000-000000000619');
insert into app.accounts (user_id, status) values
  ('00000000-0000-0000-0000-000000000611', 'active'), ('00000000-0000-0000-0000-000000000612', 'active'),
  ('00000000-0000-0000-0000-000000000613', 'active');
insert into private.account_facts (user_id, first_name, last_name, birth_date, postal_code) values
  ('00000000-0000-0000-0000-000000000611', 'Mara', 'Lindholm', '1990-04-02', '19053'),
  ('00000000-0000-0000-0000-000000000612', 'Jonas', 'Weber', '1988-11-20', '19055');
insert into billing.memberships (user_id, free_phase_ended_at) values
  ('00000000-0000-0000-0000-000000000611', now()), ('00000000-0000-0000-0000-000000000612', now()),
  ('00000000-0000-0000-0000-000000000613', null);
insert into billing.evening_ledger (user_id, kind, amount) values ('00000000-0000-0000-0000-000000000613', 'free_grant', 1);
insert into app.admin_users (user_id, display_name) values ('00000000-0000-0000-0000-000000000619', 'Benn');

-- ---------------------------------------------------------------------------
-- Bestellübersicht und Bestellung
-- ---------------------------------------------------------------------------
select is(billing.order_button_label(), 'Mitgliedschaft zahlungspflichtig abschließen', 'Bestellknopf hat den gesetzlichen Wortlaut');
select is(billing.order_summary('auftakt') ->> 'price_display', '49,00 €', 'Preis aus den Einstellungen');
select is(billing.order_summary('andante') ->> 'vat_note', 'inkl. 19 % USt', 'USt-Hinweis je landing.vat_mode');
select throws_ok($$ select billing.order_summary('loge') $$, 'P0001', 'Diese Stufe ist zurzeit nicht buchbar.', 'Loge ist ohne Testphasen-Schalter nicht buchbar');
update ops.app_settings set value = 'true' where key = 'billing.loge_in_test_phase';
select is((billing.order_summary('loge') ->> 'evenings_per_period')::int, 2, 'Loge in der Testphase: höchstens 2 Abende');
update ops.app_settings set value = 'false' where key = 'billing.loge_in_test_phase';
select throws_ok($$ select billing.order_summary('platin') $$, '22023', null, 'Unbekannte Stufe');

select throws_ok($$ select billing.record_order('00000000-0000-0000-0000-000000000611', 'andante',
    billing.order_summary('auftakt'), 'cus_611', 'sub_611', 'web', true) $$,
  'P0001', 'Die Bestellübersicht hat sich geändert. Bitte laden Sie die Seite neu.', 'Abweichende Übersicht wird abgelehnt');

create temp table r (k text primary key, v jsonb);
grant select on r to public;
insert into r values ('order611', billing.record_order('00000000-0000-0000-0000-000000000611', 'andante',
  billing.order_summary('andante'), 'cus_611', 'sub_611', 'web', true));
select matches((select v ->> 'contract_number' from r where k = 'order611'), '^FM-[A-Z2-9]{4}-[A-Z2-9]{4}$', 'Vertragsnummer im Format FM-XXXX-XXXX');
select is((select status from billing.memberships where user_id = '00000000-0000-0000-0000-000000000611'), 'pending', 'Nach der Bestellung: pending');
select is((select details -> 'summary' ->> 'button_label' from billing.contract_actions
           where user_id = '00000000-0000-0000-0000-000000000611' and kind = 'order'),
  'Mitgliedschaft zahlungspflichtig abschließen', 'Bestellung speichert die gezeigte Übersicht mit Knopftext');
select is((select details ->> 'summary_hash' from billing.contract_actions where user_id = '00000000-0000-0000-0000-000000000611' and kind = 'order'),
  billing.summary_hash(billing.order_summary('andante')), 'Bestellung speichert den Hash der Übersicht');
select ok(((select v ->> 'withdrawal_until' from r where k = 'order611')::timestamptz - app.now()) between interval '13 days 23 hours' and interval '14 days 1 hour',
  'Widerrufsfrist 14 Tage ab Bestellung');
select lives_ok($$ select billing.mark_confirmation_sent((select id from billing.contract_actions where user_id = '00000000-0000-0000-0000-000000000611' and kind = 'order'), 'outbox-1') $$,
  'Eingangsbestätigung lässt sich vermerken');
select throws_ok($$ update billing.contract_actions set details = '{}' where user_id = '00000000-0000-0000-0000-000000000611' $$,
  '42501', null, 'Die Erklärung selbst ist unveränderlich');

-- ---------------------------------------------------------------------------
-- Stripe-Ereignisse
-- ---------------------------------------------------------------------------
select ok(billing.accept_stripe_event('evt_1', 'invoice.paid', '{"data": {"object": {"id": "in_611a"}}}'), 'Neues Ereignis wird angenommen');
select ok(billing.accept_stripe_event('evt_1', 'invoice.paid', '{}'), 'Noch nicht verarbeitet: erneut annehmbar');
select billing.finish_stripe_event('evt_1');
select ok(not billing.accept_stripe_event('evt_1', 'invoice.paid', '{}'), 'Verarbeitetes Ereignis wird nicht noch einmal verarbeitet');

insert into r values ('paid611', billing.apply_invoice_paid('sub_611', 'cus_611', 'in_611a', app.now(), app.now() + interval '28 days', 14900, 'pi_611a'));
select is((select v ->> 'first_period' from r where k = 'paid611'), 'true', 'Erste Zahlung nach der Bestellung');
select is((select status from billing.memberships where user_id = '00000000-0000-0000-0000-000000000611'), 'active', 'invoice.paid: aktiv');
select is(billing.available_evenings('00000000-0000-0000-0000-000000000611'), 2, 'Zuteilung Andante: 2 Abende');
select is((billing.apply_invoice_paid('sub_611', 'cus_611', 'in_611a', app.now(), app.now() + interval '28 days', 14900)) ->> 'duplicate',
  'true', 'Gleiche Rechnung zweimal: keine zweite Zuteilung');
select is(billing.available_evenings('00000000-0000-0000-0000-000000000611'), 2, 'Weiterhin 2 Abende');
select is((billing.apply_invoice_paid('sub_611', 'cus_611', 'in_611zero', app.now(), app.now() + interval '28 days', 0)) ->> 'reason',
  'zero_amount', 'Rechnung über 0 € legt keinen Zeitraum an');
select is((select count(*)::int from billing.membership_periods where user_id = '00000000-0000-0000-0000-000000000611'), 1, 'Ein Zeitraum');
select is((select tier_view from app.accounts where user_id = '00000000-0000-0000-0000-000000000611'), 'andante', 'Gesprächstiefe folgt der Stufe');

select is((billing.apply_payment_failed('sub_611', 'cus_611', 'in_611b', 'evt_f1')) ->> 'notify', 'true', 'Erster Fehlschlag: Mail');
select is((select status from billing.memberships where user_id = '00000000-0000-0000-0000-000000000611'), 'past_due', 'Zahlung fehlgeschlagen: past_due');
insert into billing.stripe_events (id, type, payload, processed_at)
values ('evt_f1', 'invoice.payment_failed', '{"data": {"object": {"id": "in_611b"}}}', now());
select is((billing.apply_payment_failed('sub_611', 'cus_611', 'in_611b', 'evt_f2')) ->> 'notify', 'false', 'Weiterer Fehlschlag derselben Rechnung: keine zweite Mail');
select is((billing.apply_subscription_state('sub_611', 'cus_611', 'active', false, null, app.now() + interval '28 days')) ->> 'status',
  'active', 'subscription.updated active: wieder aktiv');
select is((billing.apply_subscription_state('sub_other', 'cus_611', 'canceled', false, null, null, true)) ->> 'handled',
  'false', 'Ereignis eines alten Abos ändert nichts');

-- Übersicht für die Person
select tests.act_as('00000000-0000-0000-0000-000000000611');
select is((api.billing_overview()) ->> 'status', 'active', 'Übersicht: Status');
select is((api.billing_overview()) ->> 'available_evenings', '2', 'Übersicht: verfügbare Abende');
select is((api.billing_overview()) ->> 'order_button_label', 'Mitgliedschaft zahlungspflichtig abschließen', 'Übersicht liefert den Knopftext');
select is(jsonb_array_length((api.billing_overview()) -> 'tiers'), 3, 'Übersicht: drei Stufen');
select ok(((api.billing_overview()) -> 'withdrawal' ->> 'possible')::boolean, 'Übersicht: Widerruf noch möglich');
select throws_ok($$ select stripe_customer_id from billing.memberships $$, '42501', null, 'Stripe-Kennungen sind für Mitglieder nicht lesbar');
select is((select contract_number from billing.memberships), (select v ->> 'contract_number' from r where k = 'order611'), 'Eigene Vertragsnummer lesbar');
select throws_ok($$ select billing.apply_invoice_paid('sub_611', 'cus_611', 'in_hack', now(), now() + interval '28 days', 100) $$,
  '42501', null, 'Mitglieder können interne Buchungsfunktionen nicht aufrufen');
select throws_ok($$ select billing.record_order('00000000-0000-0000-0000-000000000611', 'auftakt', '{}', null, null) $$,
  '42501', null, 'Mitglieder können Bestellungen nur über die Edge Function auslösen');
select tests.reset_role();
select tests.act_as_anon();
select throws_ok($$ select api.billing_overview() $$, '42501', null, 'Ohne Anmeldung keine Übersicht');
select is(jsonb_array_length(api.billing_tiers()), 3, 'Stufen sind öffentlich');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Kündigungsknopf (§ 312k BGB)
-- ---------------------------------------------------------------------------
select is((billing.cancellation_preview('00000000-0000-0000-0000-000000000611')) ->> 'possible', 'true', 'Kündigung möglich');
select is((billing.cancellation_preview('00000000-0000-0000-0000-000000000611')) ->> 'name', 'Mara Lindholm', 'Vorschau nennt den Namen');
select throws_ok($$ select billing.record_cancellation('00000000-0000-0000-0000-000000000611', '{"kind": "ausserordentlich"}') $$,
  '22023', null, 'Außerordentliche Kündigung braucht einen Grund');
insert into r values ('cancel611', billing.record_cancellation('00000000-0000-0000-0000-000000000611',
  '{"kind": "ordentlich", "name": "Mara Lindholm", "contact_email": "m611@example.test", "channel": "angemeldet"}'));
select is((select status from billing.memberships where user_id = '00000000-0000-0000-0000-000000000611'), 'cancelled', 'Gekündigt zum Ende des Zeitraums');
select is((select cancel_at from billing.memberships where user_id = '00000000-0000-0000-0000-000000000611'),
  (select ends_at from billing.membership_periods where user_id = '00000000-0000-0000-0000-000000000611'), 'Wirksam zum Ende des Zeitraums');
select ok((select details ? 'received_at' and details ->> 'kind' = 'ordentlich' from billing.contract_actions
           where user_id = '00000000-0000-0000-0000-000000000611' and kind = 'cancel'), 'Kündigung mit Eingangszeitpunkt gespeichert');
select is(billing.available_evenings('00000000-0000-0000-0000-000000000611'), 2, 'Bis zum Ende bleiben die Abende nutzbar');
select ok(billing.can_receive_proposal('00000000-0000-0000-0000-000000000611'), 'Gekündigt, aber laufend: Vorschläge weiter möglich');
select is((billing.cancellation_preview('00000000-0000-0000-0000-000000000611')) ->> 'reason', 'already_cancelled', 'Zweite Kündigung: schon gekündigt');
select is((billing.apply_subscription_state('sub_611', 'cus_611', 'canceled', false, null, null, true)) ->> 'status', 'ended',
  'subscription.deleted: beendet');
select is(billing.available_evenings('00000000-0000-0000-0000-000000000611'), 0, 'Nach dem Ende verfallen die Abende');

-- ---------------------------------------------------------------------------
-- Widerrufsbutton (§ 356a BGB) mit Wertersatz
-- ---------------------------------------------------------------------------
insert into r values ('order612', billing.record_order('00000000-0000-0000-0000-000000000612', 'andante',
  billing.order_summary('andante'), 'cus_612', 'sub_612', 'web', true));
select billing.apply_invoice_paid('sub_612', 'cus_612', 'in_612', app.now(), app.now() + interval '28 days', 14900, 'pi_612');
-- Ein Abend mit 613 findet statt, ein weiterer mit 613 ist bestätigt und steht noch an.
insert into app.match_runs (id, scheduled_for, status) values ('61000000-0000-0000-0000-000000000001', now(), 'approved');
insert into app.pairings (id, run_id, user_a, user_b, total_score, status) values
  ('61000000-0000-0000-0000-0000000000a1', '61000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000613', 0.8, 'proposed');
insert into app.evenings (id, pairing_id, user_a, user_b, starts_at) values
  ('61000000-0000-0000-0000-0000000000e1', '61000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000612', '00000000-0000-0000-0000-000000000613', app.now() + interval '1 hour');
select app.evening_transition('61000000-0000-0000-0000-0000000000e1', 'request_time', '00000000-0000-0000-0000-000000000612');
select app.evening_transition('61000000-0000-0000-0000-0000000000e1', 'confirm', '00000000-0000-0000-0000-000000000613');
select app.evening_transition('61000000-0000-0000-0000-0000000000e1', 'happened');

insert into r values ('quote612', billing.withdrawal_quote('00000000-0000-0000-0000-000000000612'));
select is((select (v ->> 'evenings_used')::int from r where k = 'quote612'), 1, 'Wertersatz: ein genutzter Abend');
select is((select (v ->> 'wertersatz_cents')::int from r where k = 'quote612'), 7450, 'Wertersatz Andante: 74,50 € je Abend');
select is((select (v ->> 'refund_cents')::int from r where k = 'quote612'), 7450, 'Erstattung: Rest des Betrags');
select is((select v ->> 'stripe_payment_intent_id' from r where k = 'quote612'), 'pi_612', 'Zahlung für die Erstattung bekannt');
select throws_ok($$ select billing.record_withdrawal('00000000-0000-0000-0000-000000000612', '{"name": "Jonas Weber", "contract_number": "FM-XXXX-XXXX"}') $$,
  '22023', 'Die Vertragsnummer passt nicht.', 'Widerruf prüft die Vertragsnummer');
insert into r values ('withdraw612', billing.record_withdrawal('00000000-0000-0000-0000-000000000612', jsonb_build_object(
  'name', 'Jonas Weber', 'contract_number', (select v ->> 'contract_number' from r where k = 'order612'),
  'contact_email', 'm612@example.test', 'channel', 'angemeldet')));
select is((select status from billing.memberships where user_id = '00000000-0000-0000-0000-000000000612'), 'withdrawn', 'Widerruf beendet sofort');
select is(billing.available_evenings('00000000-0000-0000-0000-000000000612'), 0, 'Übrige Abende verfallen beim Widerruf');
select ok((select details ? 'received_at' and (details -> 'quote' ->> 'refund_cents')::int = 7450 from billing.contract_actions
           where user_id = '00000000-0000-0000-0000-000000000612' and kind = 'withdraw'), 'Widerruf mit Eingangszeitpunkt und Berechnung gespeichert');
select is((billing.withdrawal_quote('00000000-0000-0000-0000-000000000612')) ->> 'reason', 'already_withdrawn', 'Kein zweiter Widerruf');

-- Widerrufsfrist abgelaufen
select ops.sim_clock_advance(interval '15 days');
update billing.memberships set status = 'active' where user_id = '00000000-0000-0000-0000-000000000612';
select is((billing.withdrawal_quote('00000000-0000-0000-0000-000000000612')) ->> 'reason', 'period_over', 'Nach 14 Tagen kein Widerruf mehr');
update billing.memberships set status = 'withdrawn' where user_id = '00000000-0000-0000-0000-000000000612';
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- Ohne Anmeldung: Formular → Link → Ausführung
-- ---------------------------------------------------------------------------
insert into r values ('order613', billing.record_order('00000000-0000-0000-0000-000000000613', 'auftakt',
  billing.order_summary('auftakt'), 'cus_613', 'sub_613', 'web', true));
select is(billing.create_contract_request('cancel', 'falsch@example.test', (select v ->> 'contract_number' from r where k = 'order613'), '{}'),
  null, 'Falsche E-Mail: kein Link (Antwort nach außen bleibt gleich)');
insert into r values ('req613', billing.create_contract_request('cancel', 'M613@example.test ',
  lower((select v ->> 'contract_number' from r where k = 'order613')), '{"kind": "ordentlich", "name": "Test"}'));
select isnt((select v ->> 'token' from r where k = 'req613'), null, 'Passende Angaben: Link wird erzeugt (Groß-/Kleinschreibung egal)');
select is((billing.peek_contract_request((select v ->> 'token' from r where k = 'req613'))) ->> 'valid', 'true', 'Link ist gültig');
select is((billing.consume_contract_request((select v ->> 'token' from r where k = 'req613'))) ->> 'kind', 'cancel', 'Link wird eingelöst');
select throws_ok($$ select billing.consume_contract_request((select v ->> 'token' from r where k = 'req613')) $$,
  'P0001', 'Der Link ist nicht mehr gültig.', 'Link gilt nur einmal');
select billing.create_contract_request('cancel', 'm613@example.test', (select v ->> 'contract_number' from r where k = 'order613'), '{}');
insert into r values ('req613c', billing.create_contract_request('withdraw', 'm613@example.test', (select v ->> 'contract_number' from r where k = 'order613'), '{}'));
select is(billing.create_contract_request('cancel', 'm613@example.test', (select v ->> 'contract_number' from r where k = 'order613'), '{}'),
  null, 'Drossel: höchstens 3 Anfragen je Stunde');
select ops.sim_clock_advance(interval '25 hours');
select throws_ok(format('select billing.consume_contract_request(%L)', (select v ->> 'token' from r where k = 'req613c')),
  'P0001', 'Der Link ist nicht mehr gültig.', 'Abgelaufener Link wird abgelehnt');
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-000000000619', 'aal1');
select throws_ok($$ select * from api.admin_contract_actions() $$, '42501', null, 'Admin ohne Zwei-Faktor: abgelehnt');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-000000000619', 'aal2');
select ok((select count(*) from api.admin_contract_actions()) >= 4, 'Admin mit Zwei-Faktor sieht Bestellungen, Kündigungen, Widerrufe');
select throws_ok($$ select api.admin_ledger_adjust('00000000-0000-0000-0000-000000000611', -1, 'Korrektur') $$,
  'P0001', 'Das Kontingent darf nicht negativ werden.', 'Admin-Korrektur kann das Buch nicht negativ machen');
select tests.reset_role();

select * from finish();
rollback;
