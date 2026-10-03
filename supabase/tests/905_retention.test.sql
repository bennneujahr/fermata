-- Härtung · Löschfristen (ops.apply_retention, Job fermata-retention) mit der Testuhr; Stripe-Ereignisse gekürzt;
-- Wartelisten-Eintrag nach angenommener Einladung gelöscht; Audit-Protokoll bleibt unberührt.
begin;
select no_plan();
\ir 500_fixtures.sql

select tests.m5_setup();
create function pg_temp.adv(i interval) returns void language sql as $$ select ops.sim_clock_advance(i); $$;
create temp table x (k text primary key, id uuid, n bigint);
grant select on x to public;

-- Einstellungen und Job
select is((select count(*)::int from ops.app_settings where key like 'retention.%'), 11, 'Elf Löschfristen als Einstellungen retention.*');
select ok((select bool_and(description like 'PLATZHALTER%') from ops.app_settings
           where key in ('retention.reports_months', 'retention.safety_flags_months', 'retention.stripe_events_months',
                         'retention.contract_actions_years', 'retention.notifications_log_months', 'retention.auth_audit_days')),
  'Fristen mit offener Rechtsfrage sind als PLATZHALTER markiert');
select ok(exists (select 1 from cron.job where jobname = 'fermata-retention' and command = 'select ops.apply_retention()'), 'pg_cron-Job fermata-retention');
select ok(not has_function_privilege('authenticated', 'ops.apply_retention()', 'execute'), 'Mitglieder können den Löschjob nicht auslösen');

-- ---------------------------------------------------------------------------
-- Testdaten (alles „jetzt“; danach wird die Uhr vorgestellt)
-- ---------------------------------------------------------------------------
-- Meldungen: erledigt, erledigt mit geltender Sanktion, offen
insert into safety.reports (id, reporter, reported, context, category, status, resolved_at) values
  ('95000000-0000-0000-0000-000000000001', tests.m5_id('anna'), tests.m5_id('ben'), 'sonstiges', 'unangenehm', 'resolved', app.now()),
  ('95000000-0000-0000-0000-000000000002', tests.m5_id('anna'), tests.m5_id('cem'), 'sonstiges', 'belaestigung', 'resolved', app.now()),
  ('95000000-0000-0000-0000-000000000003', tests.m5_id('anna'), tests.m5_id('emil'), 'sonstiges', 'unangenehm', 'open', null),
  ('95000000-0000-0000-0000-000000000004', tests.m5_id('anna'), tests.m5_id('fritz'), 'sonstiges', 'unangenehm', 'dismissed', app.now());
insert into safety.sanctions (user_id, kind, reason, report_id) values (tests.m5_id('cem'), 'sperre', 'Belästigung', '95000000-0000-0000-0000-000000000002');
-- Hinweise: geprüft (mit Hashes), offen
insert into safety.safety_flags (id, user_id, source, kind, severity, details, reviewed_at) values
  ('95000000-0000-0000-0000-0000000000f1', null, 'system', 'konto_geloescht_waehrend_pruefung', 'hoch', '{"hashes": [{"doc_hash": "aa"}]}', app.now()),
  ('95000000-0000-0000-0000-0000000000f2', tests.m5_id('ben'), 'agent', 'krise', 'hoch', '{}', null);
-- Sicherheits-Mails: versendet, offen
insert into safety.mail_queue (recipient_user, template, sent_at) values (tests.m5_id('anna'), 'safety.report_received', app.now());
insert into safety.mail_queue (recipient_user, template) values (tests.m5_id('ben'), 'safety.report_received');
-- Stripe-Ereignis mit personenbezogenen Feldern
select billing.accept_stripe_event('evt_095', 'invoice.paid', '{"id": "evt_095", "data": {"object": {"id": "in_1", "customer_email": "anna@example.test",
  "customer_name": "Anna Abendroth", "hosted_invoice_url": "https://invoice.stripe.com/i/x", "lines": {"data": [{"period": {"start": 1}, "email": "x@y"}]},
  "amount_paid": 14900, "metadata": {"fermata_user_id": "u"}}}}'::jsonb);
-- Kündigungsanfrage ohne Anmeldung (abgelaufen)
insert into billing.contract_requests (kind, user_id, token_hash, requested_at, expires_at)
values ('cancel', tests.m5_id('anna'), repeat('a', 64), app.now() - interval '1 day', app.now() - interval '1 hour');
-- Vertragserklärung eines gelöschten Kontos (user_id null)
insert into billing.contract_actions (user_id, kind, at, details, effective_at)
values (null, 'cancel', app.now(), '{"probe": "905", "name": "Anna", "contact_email": "anna@example.test"}', app.now());
-- Versandprotokoll
insert into ops.notifications_log (user_id, channel, template, provider) values (tests.m5_id('anna'), 'email', 'evening.proposed', 'outbox');
-- Gespräche: bestätigter Entwurf, offener Entwurf einer beendeten Sitzung, laufende Sitzung
insert into app.interview_sessions (id, user_id, status, summary_draft, summary_status, summary_confirmed_at, ended_at) values
  ('95000000-0000-0000-0000-0000000000a1', tests.m5_id('anna'), 'completed', 'Entwurf, bestätigt und übernommen.', 'confirmed', app.now(), app.now()),
  ('95000000-0000-0000-0000-0000000000a2', tests.m5_id('ben'), 'completed', 'Entwurf, nie bestätigt, Sitzung beendet.', 'draft', null, app.now()),
  ('95000000-0000-0000-0000-0000000000a3', tests.m5_id('cem'), 'active', 'Entwurf in einer laufenden Sitzung.', 'draft', null, null);
-- Vorschlag mit Score und Prüfnotizen
insert into app.pairings (id, run_id, user_a, user_b, total_score, review_notes, review_comment, status)
values ('95000000-0000-0000-0000-0000000000b1', tests.m5_id('run'), least(tests.m5_id('emil'), tests.m5_id('fritz')),
        greatest(tests.m5_id('emil'), tests.m5_id('fritz')), 0.77, '{"empfehlung": "freigeben"}', 'passt', 'proposed');
update app.match_runs set finished_at = app.now() where id = tests.m5_id('run');
-- Audit-Zeile, die nie gelöscht werden darf
insert into ops.audit_log (action, details) values ('test.retention_probe', '{}');
insert into x (k, n) values ('audit_before', (select count(*) from ops.audit_log));

-- ---------------------------------------------------------------------------
-- Stripe-Ereignisse sofort gekürzt
-- ---------------------------------------------------------------------------
select ok((select payload::text not like '%anna@example.test%' and payload::text not like '%Abendroth%'
                  and payload::text not like '%invoice.stripe.com%' and payload::text not like '%x@y%'
           from billing.stripe_events where id = 'evt_095'), 'Stripe-Ereignis ohne E-Mail, Name und Rechnungslink gespeichert');
select is((select payload -> 'data' -> 'object' ->> 'amount_paid' from billing.stripe_events where id = 'evt_095'), '14900', 'Betrag bleibt');
select is((select payload -> 'data' -> 'object' -> 'metadata' ->> 'fermata_user_id' from billing.stripe_events where id = 'evt_095'), 'u',
  'Interne Kennung bleibt (für die Zuordnung)');

-- ---------------------------------------------------------------------------
-- Nach 31 Tagen
-- ---------------------------------------------------------------------------
select pg_temp.adv(interval '31 days');
insert into x (k, n) values ('r31', 0);
select ops.apply_retention();
select is((select count(*)::int from safety.mail_queue where template = 'safety.report_received' and sent_at is not null), 0, '31 Tage: versendete Sicherheits-Mail gelöscht');
select is((select count(*)::int from safety.mail_queue where recipient_user = tests.m5_id('ben')), 1, 'offene Sicherheits-Mail bleibt');
select is((select count(*)::int from billing.contract_requests where user_id = tests.m5_id('anna')), 0, '31 Tage: abgelaufene Anfrage ohne Anmeldung gelöscht');
select is((select details ? 'hashes' from safety.safety_flags where id = '95000000-0000-0000-0000-0000000000f1'), false,
  '31 Tage nach Prüfung: Sperrlisten-Hashes aus dem Hinweis entfernt');
select is((select summary_draft from app.interview_sessions where id = '95000000-0000-0000-0000-0000000000a1'), null, 'Bestätigter Entwurf geleert');
select is((select summary_status from app.interview_sessions where id = '95000000-0000-0000-0000-0000000000a1'), 'confirmed', 'Status bleibt confirmed');
select is((select summary_draft from app.interview_sessions where id = '95000000-0000-0000-0000-0000000000a2'), null, 'Nie bestätigter Entwurf einer beendeten Sitzung geleert');
select is((select summary_status from app.interview_sessions where id = '95000000-0000-0000-0000-0000000000a2'), 'none', 'und Status auf none');
select isnt((select summary_draft from app.interview_sessions where id = '95000000-0000-0000-0000-0000000000a3'), null, 'Entwurf einer laufenden Sitzung bleibt');
-- Freie Zeiten: der Zeitraum endet in 13 Tagen → nach 31 Tagen erst 18 Tage vorbei
select ok((select count(*) > 0 from app.availability_windows where period_id = tests.m5_id('period')), 'Zeitfenster bleiben bis 30 Tage nach Ende des Zeitraums');
select pg_temp.adv(interval '13 days');
select ops.apply_retention();
select is((select count(*)::int from app.availability_windows where period_id = tests.m5_id('period')), 0, '30 Tage nach Ende des Zeitraums: Zeitfenster gelöscht');
select is((select count(*)::int from app.availability_periods where id = tests.m5_id('period')), 1, 'Der Zeitraum selbst bleibt (ohne Personenbezug)');

-- ---------------------------------------------------------------------------
-- Nach 12 und 13 Monaten (bisher 44 Tage vorgestellt)
-- ---------------------------------------------------------------------------
select pg_temp.adv(interval '11 months');
select ops.apply_retention();
select is((select count(*)::int from ops.notifications_log where user_id = tests.m5_id('anna') and template = 'evening.proposed'), 0,
  '12 Monate: Versandprotokoll gelöscht');
select is((select total_score from app.pairings where id = '95000000-0000-0000-0000-0000000000b1'), null, '12 Monate: Gesamtscore geleert');
select is((select review_notes from app.pairings where id = '95000000-0000-0000-0000-0000000000b1'), '{}'::jsonb, 'Prüfnotizen geleert');
select is((select review_comment from app.pairings where id = '95000000-0000-0000-0000-0000000000b1'), null, 'Kommentar geleert');
select is((select status from app.pairings where id = '95000000-0000-0000-0000-0000000000b1'), 'proposed', 'Vorschlag selbst bleibt');
select is((select count(*)::int from billing.stripe_events where id = 'evt_095'), 1, 'Stripe-Ereignis nach 12 Monaten noch da');
select pg_temp.adv(interval '1 month');
select ops.apply_retention();
select is((select count(*)::int from billing.stripe_events where id = 'evt_095'), 0, '13 Monate: Stripe-Ereignis gelöscht');

-- ---------------------------------------------------------------------------
-- Nach 24 Monaten
-- ---------------------------------------------------------------------------
select pg_temp.adv(interval '11 months');
select ops.apply_retention();
select is((select count(*)::int from safety.reports where id in ('95000000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000004')),
  0, '24 Monate: abgeschlossene Meldungen gelöscht');
select is((select count(*)::int from safety.reports where id = '95000000-0000-0000-0000-000000000002'), 1,
  'Meldung mit geltender Sperre bleibt');
select is((select count(*)::int from safety.reports where id = '95000000-0000-0000-0000-000000000003'), 1, 'Offene Meldung bleibt');
select is((select count(*)::int from safety.safety_flags where id = '95000000-0000-0000-0000-0000000000f1'), 0, 'Geprüfter Hinweis gelöscht');
select is((select count(*)::int from safety.safety_flags where id = '95000000-0000-0000-0000-0000000000f2'), 1, 'Offener Hinweis bleibt');
select is((select count(*)::int from billing.contract_actions where details ->> 'probe' = '905'), 1,
  'Vertragserklärung (ohne Konto) bleibt nach 2 Jahren (gesetzlicher Nachweis)');

-- Nach Ende der Aufbewahrung (6 Jahre ab Ende des Kalenderjahres)
select pg_temp.adv(interval '5 years');
select ops.apply_retention();
select is((select count(*)::int from billing.contract_actions where details ->> 'probe' = '905'), 0, 'Nach Ablauf der Aufbewahrung gelöscht');

-- Audit-Protokoll bleibt (nur anhängen), der Job schreibt nur Zählungen dazu
select ok((select count(*) from ops.audit_log) >= (select n from x where k = 'audit_before'), 'Audit-Protokoll wird nicht gelöscht');
select ok(exists (select 1 from ops.audit_log where action = 'test.retention_probe'), 'auch alte Zeilen bleiben');
select ok(exists (select 1 from ops.audit_log where action = 'retention.applied' and (details ->> 'safety_reports')::int >= 2),
  'Job protokolliert Zählungen');
select ok((select bool_and(details::text not like '%anna@example.test%') from ops.audit_log where action = 'retention.applied'), 'ohne Inhalte');
select throws_ok($$ delete from ops.audit_log where action = 'test.retention_probe' $$, '42501', null, 'Löschen im Audit-Protokoll bleibt gesperrt');
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- Anmeldeprotokolle mit IP (auth.audit_log_entries)
-- ---------------------------------------------------------------------------
insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address)
values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), '{"action": "login"}', now() - interval '31 days', '203.0.113.9'),
       ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), '{"action": "login"}', now() - interval '1 day', '203.0.113.10');
select ok((ops.apply_retention() ->> 'auth_audit_log_entries')::int >= 1, 'Anmeldeprotokolle älter als 30 Tage gelöscht');
select is((select count(*)::int from auth.audit_log_entries where ip_address = '203.0.113.9'), 0, 'alte IP-Adresse weg');
select is((select count(*)::int from auth.audit_log_entries where ip_address = '203.0.113.10'), 1, 'junge bleibt');

-- ---------------------------------------------------------------------------
-- Warteliste: Eintrag wird mit der angenommenen Einladung gelöscht (Gründungsstatus steht dann im Konto)
-- ---------------------------------------------------------------------------
insert into public.waitlist (id, first_name, email, region, postal_code, consent_text_version, consent_at, confirmed_at, base_number, is_founding_member)
values ('95000000-0000-0000-0000-0000000000c1', 'Gerda', 'gerda@example.test', 'schwerin', '19053', 'warteliste-2026-10-03-entwurf', now(), now(), 9501, true);
insert into app.admin_users (user_id, display_name) values (tests.m5_id('dora'), 'Dora') on conflict do nothing;
select tests.create_user('gerda@example.test', '00000000-0000-0000-0000-0000000009c1');
select ops.create_invited_account('gerda@example.test', '00000000-0000-0000-0000-0000000009c1', tests.m5_id('dora'));
select is((select is_founding_member from app.accounts where user_id = '00000000-0000-0000-0000-0000000009c1'), true,
  'Gründungsstatus bei der Einladung ins Konto übernommen');
select is((select count(*)::int from public.waitlist where email = 'gerda@example.test'), 1, 'Eintrag bleibt, solange die Einladung offen ist');
update auth.users set last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000009c1';
select ok((select accepted_at is not null from app.account_invitations where user_id = '00000000-0000-0000-0000-0000000009c1'), 'Erste Anmeldung nimmt die Einladung an');
select is((select count(*)::int from public.waitlist where email = 'gerda@example.test'), 0, 'und löscht den Wartelisten-Eintrag');
select is((select is_founding_member from app.accounts where user_id = '00000000-0000-0000-0000-0000000009c1'), true, 'Gründungsstatus bleibt im Konto');

select * from finish();
rollback;
