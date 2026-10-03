-- Härtung · Vertrag 1: Bestellübersicht mit Erklärung zum Leistungsbeginn und Verweis auf die Widerrufsbelehrung;
-- Bestellung nur mit ausdrücklichem Verlangen, gespeichert mit Fassung.
begin;
select no_plan();

select tests.create_user('bestellt@example.test', '00000000-0000-0000-0000-000000000901');
insert into app.accounts (user_id, status) values ('00000000-0000-0000-0000-000000000901', 'active');
insert into billing.memberships (user_id, free_phase_ended_at) values ('00000000-0000-0000-0000-000000000901', now());

create temp table s (k text primary key, v jsonb);
grant select on s to public;
insert into s values ('summary', billing.order_summary('andante'));

select is((select v ->> 'start_request_text' from s),
  'Ich verlange ausdrücklich, dass Fermata vor Ende der Widerrufsfrist mit der Leistung beginnt. Mir ist bekannt, dass ich bei einem Widerruf Wertersatz für bereits genutzte Abende leisten muss.',
  'Übersicht: start_request_text (Entwurf, Wortlaut aus dem Vertrag)');
select is((select v ->> 'withdrawal_policy_url' from s), '/rechtliches/widerruf', 'Übersicht: withdrawal_policy_url');
select is((select v ->> 'start_request_version' from s), '2026-10-03-entwurf', 'Übersicht: Fassung der Erklärung');

-- api.billing_order_summary (Web-App) liefert dieselben Felder samt Hash
select tests.act_as('00000000-0000-0000-0000-000000000901');
select is(api.billing_order_summary('andante') ->> 'start_request_text', (select v ->> 'start_request_text' from s), 'api.billing_order_summary: start_request_text');
select is(api.billing_order_summary('andante') ->> 'withdrawal_policy_url', '/rechtliches/widerruf', 'api.billing_order_summary: withdrawal_policy_url');
select ok((api.billing_order_summary('andante') ->> 'summary_hash') ~ '^[0-9a-f]{64}$', 'mit Hash der Übersicht');
select tests.reset_role();
select ok(billing.summary_hash((select v from s)) = (select api_hash from (select billing.summary_hash(billing.order_summary('andante')) as api_hash) x),
  'Hash deckt die Erklärung mit ab (gleiche Übersicht, gleicher Hash)');

-- Ohne Verlangen keine Bestellung
select throws_ok($$ select billing.record_order('00000000-0000-0000-0000-000000000901', 'andante', (select v from s), 'cus_901', 'sub_901') $$,
  '22023', null, 'Ohne start_request: abgelehnt');
select throws_ok($$ select billing.record_order('00000000-0000-0000-0000-000000000901', 'andante', (select v from s), 'cus_901', 'sub_901', 'web', false) $$,
  '22023', null, 'start_request = false: abgelehnt');
select throws_ok($$ select billing.record_order('00000000-0000-0000-0000-000000000901', 'andante', (select v from s), 'cus_901', 'sub_901', 'web', null) $$,
  '22023', null, 'start_request = null: abgelehnt');
select is((select count(*)::int from billing.contract_actions where user_id = '00000000-0000-0000-0000-000000000901'), 0, 'Nichts gespeichert');
select is((select status from billing.memberships where user_id = '00000000-0000-0000-0000-000000000901'), 'free', 'Mitgliedschaft unverändert');

-- Mit Verlangen: gespeichert mit Wortlaut und Fassung
insert into s values ('order', billing.record_order('00000000-0000-0000-0000-000000000901', 'andante', (select v from s where k = 'summary'),
  'cus_901', 'sub_901', 'web', true));
select is((select v -> 'start_request' ->> 'version' from s where k = 'order'), '2026-10-03-entwurf', 'Antwort nennt die Fassung');
select is((select details -> 'start_request' ->> 'requested' from billing.contract_actions where user_id = '00000000-0000-0000-0000-000000000901' and kind = 'order'),
  'true', 'Vertragshandlung „order“ speichert das Verlangen');
select is((select details -> 'start_request' ->> 'text' from billing.contract_actions where user_id = '00000000-0000-0000-0000-000000000901' and kind = 'order'),
  (select v ->> 'start_request_text' from s where k = 'summary'), 'mit Wortlaut');
select is((select details -> 'start_request' ->> 'version' from billing.contract_actions where user_id = '00000000-0000-0000-0000-000000000901' and kind = 'order'),
  '2026-10-03-entwurf', 'und Fassung');
select is((select details -> 'summary' ->> 'withdrawal_policy_url' from billing.contract_actions where user_id = '00000000-0000-0000-0000-000000000901' and kind = 'order'),
  '/rechtliches/widerruf', 'Gezeigte Übersicht samt Verweis auf die Belehrung gespeichert');
select is((select status from billing.memberships where user_id = '00000000-0000-0000-0000-000000000901'), 'pending', 'Bestellung angelegt');

-- Geänderter Satz → neue Fassung, alte Übersicht gilt nicht mehr
update ops.app_settings set value = '"Neuer Satz."' where key = 'billing.start_request_text';
select isnt(billing.summary_hash(billing.order_summary('andante')), billing.summary_hash((select v from s where k = 'summary')),
  'Geänderter Satz ändert den Hash der Übersicht');

-- Die Belehrung, auf die die Übersicht verweist, gibt es
select is((select kind from api.legal_document('widerruf')), 'widerruf', 'Widerrufsbelehrung abrufbar (auch ohne Anmeldung)');
select ok(has_function_privilege('anon', 'api.legal_document(text)', 'execute'), 'anon darf Rechtstexte lesen');
select ok(not has_function_privilege('authenticated', 'billing.record_order(uuid, text, jsonb, text, text, text, boolean)', 'execute'),
  'Mitglieder bestellen nur über die Edge Function');

select * from finish();
rollback;
