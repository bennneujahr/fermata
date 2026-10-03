-- M2 · RLS-Tests: „niemand liest fremde Daten“ (PLAN M2).
-- Geht über JEDE Tabelle in app, private, sensitive, safety, billing, ops (und public.waitlist*, falls vorhanden)
-- und prüft als angemeldetes Mitglied, als Admin ohne Zwei-Faktor und als anon, dass keine fremden Zeilen sichtbar sind.
-- Eine Zeile gilt als eigene, wenn eine Spalte user_id, user_a, user_b, blocker oder reporter die eigene ID enthält.
begin;
select no_plan();

-- ---------------------------------------------------------------------------
-- Testpersonen: Anna (A), Ben (B), Dora (D) sind Mitglieder, Carla (C) ist Admin.
-- ---------------------------------------------------------------------------
select tests.create_user('anna@example.test', 'a0000000-0000-0000-0000-00000000000a');
select tests.create_user('ben@example.test', 'b0000000-0000-0000-0000-00000000000b');
select tests.create_user('dora@example.test', 'd0000000-0000-0000-0000-00000000000d');
select tests.create_user('carla@example.test', 'c0000000-0000-0000-0000-00000000000c');
insert into app.admin_users (user_id, display_name) values ('c0000000-0000-0000-0000-00000000000c', 'Carla');

select app.on_account_created('a0000000-0000-0000-0000-00000000000a');
select ops.create_invited_account('ben@example.test', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000c');
select app.on_account_created('d0000000-0000-0000-0000-00000000000d');

-- Einwilligungen und Angaben über die Funktionen (wie die Web-App)
create function pg_temp.onboard(p_user uuid, p_first text, p_last text, p_plz text) returns void language plpgsql as $$
declare k text;
begin
  perform tests.act_as(p_user);
  foreach k in array array['agb', 'datenschutz_kenntnis', 'art9_profile', 'art9_religion', 'biometrie', 'push', 'gespraech'] loop
    perform api.give_consent(k, (select d.version from api.legal_document(k) d));
  end loop;
  perform api.save_facts(p_first, p_last, date '1990-05-17', p_plz, null, '+49 385 123456');
  perform api.save_identity('frau', array['mann']);
  perform api.save_religion('christlich', 'etwas', false);
  perform tests.reset_role();
end;
$$;
select pg_temp.onboard('a0000000-0000-0000-0000-00000000000a', 'Anna', 'Albers', '19053');
select pg_temp.onboard('b0000000-0000-0000-0000-00000000000b', 'Ben', 'Brandt', '23966');
select pg_temp.onboard('d0000000-0000-0000-0000-00000000000d', 'Dora', 'Dahl', '20095');

-- Ausweisprüfung für Ben (mit Sperrlisten-Hashes)
select ops.verification_begin('b0000000-0000-0000-0000-00000000000b');
select ops.verification_attach_session((select id from app.verifications where user_id = 'b0000000-0000-0000-0000-00000000000b'), 'fake_rls_ben');
select ops.verification_complete('fake_rls_ben', 'approved', 'Ben', 'Brandt', date '1990-05-17', 'L01X00T47');

-- Profil, Wünsche, Zeiten, Gespräche
insert into app.wants (user_id, category, text) values ('b0000000-0000-0000-0000-00000000000b', 'werte', 'Ehrlichkeit und Humor');
insert into app.dealbreakers (user_id, kind) values ('b0000000-0000-0000-0000-00000000000b', 'raucht');
insert into app.personal_weights (user_id, weights) values ('b0000000-0000-0000-0000-00000000000b', '{"werte": 1}');
insert into app.profile_embeddings (user_id, embedding, source_hash)
  values ('b0000000-0000-0000-0000-00000000000b', array_fill(0.01::real, array[1024])::extensions.vector, 'x');
insert into app.availability_periods (id, starts_on, ends_on, ask_at, answer_until)
  values ('e0000000-0000-0000-0000-000000000001', current_date + 7, current_date + 20, now(), now() + interval '3 days');
insert into app.availability_windows (user_id, period_id, starts_at, ends_at)
  values ('b0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000001', now() + interval '8 days', now() + interval '8 days 3 hours');
insert into app.interview_sessions (id, user_id) values ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b');
insert into app.interview_transcripts (session_id, user_id, turns)
  values ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', '[{"role": "person", "text": "Ben erzählt"}]');

-- Lokal, Auswahl, Paare, Abende
insert into app.venues (id, name, street, postal_code, city, lat, lon)
  values ('e0000000-0000-0000-0000-000000000003', 'Café Testlokal', 'Markt 1', '19053', 'Schwerin', 53.63, 11.41);
insert into app.venue_slots (venue_id, starts_at, tables) values ('e0000000-0000-0000-0000-000000000003', now() + interval '9 days', 2);
insert into app.match_runs (id, scheduled_for, status) values ('e0000000-0000-0000-0000-000000000004', now(), 'approved');
insert into app.pair_candidates (run_id, user_a, user_b, total_score)
  values ('e0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d', 0.7);
insert into app.pairings (id, run_id, user_a, user_b, total_score, status, reasons_text) values
  ('e0000000-0000-0000-0000-0000000000ab', 'e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 0.8, 'proposed', 'Beide mögen Jazz'),
  ('e0000000-0000-0000-0000-0000000000bd', 'e0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d', 0.7, 'proposed', 'Beide wandern'),
  ('e0000000-0000-0000-0000-0000000000ad', 'e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000d', 0.65, 'pending_review', 'noch nicht geprüft');
insert into app.evenings (id, pairing_id, user_a, user_b, venue_id) values
  ('e0000000-0000-0000-0000-00000000e0ab', 'e0000000-0000-0000-0000-0000000000ab', 'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-00000000e0bd', 'e0000000-0000-0000-0000-0000000000bd', 'b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d', 'e0000000-0000-0000-0000-000000000003');
select app.evening_transition('e0000000-0000-0000-0000-00000000e0bd', 'request_time', 'b0000000-0000-0000-0000-00000000000b');
select app.evening_transition('e0000000-0000-0000-0000-00000000e0ab', 'request_time', 'b0000000-0000-0000-0000-00000000000b');
insert into app.evening_deadlines (evening_id, kind, due_at) values ('e0000000-0000-0000-0000-00000000e0bd', 'time_answer', now() + interval '1 day');
insert into app.feedback (evening_id, user_id, attended, wants_contact, note) values
  ('e0000000-0000-0000-0000-00000000e0ab', 'b0000000-0000-0000-0000-00000000000b', true, true, 'Bens geheime Rückmeldung');
insert into app.contact_shares (evening_id, user_id, share_email) values ('e0000000-0000-0000-0000-00000000e0ab', 'b0000000-0000-0000-0000-00000000000b', true);
insert into app.blocks (blocker, blocked) values ('b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d');
insert into app.push_subscriptions (user_id, endpoint, p256dh, auth) values ('b0000000-0000-0000-0000-00000000000b', 'https://push.example/ben', 'k', 'a');
insert into app.trust_shares (evening_id, user_id, token_hash, expires_at)
  values ('e0000000-0000-0000-0000-00000000e0bd', 'b0000000-0000-0000-0000-00000000000b', 'hash-ben', now() + interval '1 day');

-- Sicherheit
insert into safety.blocklist (doc_hash, reason_code) values ('deadbeef', 'sonstiges');
insert into safety.safety_flags (user_id, source, kind) values ('b0000000-0000-0000-0000-00000000000b', 'admin', 'test');
insert into safety.reports (id, reporter, reported, context, category, description)
  values ('e0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-00000000000b', 'd0000000-0000-0000-0000-00000000000d', 'abend', 'unangenehm', 'Bens Meldung');
insert into safety.sanctions (id, user_id, kind, reason) values ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-00000000000d', 'hinweis', 'Test');
insert into safety.appeals (sanction_id, user_id, text) values ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-00000000000d', 'Ich widerspreche, Test.');

-- Mitgliedschaft
insert into billing.membership_periods (user_id, tier, starts_at, ends_at, evenings_allowed)
  values ('b0000000-0000-0000-0000-00000000000b', 'andante', now(), now() + interval '28 days', 2);
insert into billing.stripe_events (id, type, payload) values ('evt_test', 'test', '{}');
insert into billing.contract_actions (user_id, kind) values ('b0000000-0000-0000-0000-00000000000b', 'order');

-- Betrieb
insert into ops.notifications_log (user_id, channel, template, provider) values ('b0000000-0000-0000-0000-00000000000b', 'email', 'test', 'test');
insert into ops.mail_outbox (recipient, subject, template, html, text) values ('ben@example.test', 'Test', 'test', '<p>x</p>', 'x');
insert into ops.session_costs (session_id) values ('e0000000-0000-0000-0000-000000000002');
select ops.daily_hash('x');
select ops.audit('test.rls', null, null, '{}');

-- ---------------------------------------------------------------------------
-- Ziele: alle Tabellen der Fermata-Schemas (und public.waitlist*), mit ihren Personen-Spalten.
-- ---------------------------------------------------------------------------
create temp table rls_targets as
select n.nspname::text as sch, c.relname::text as tbl,
       array(select a.attname::text from pg_attribute a
             where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
               and a.attname in ('user_id', 'user_a', 'user_b', 'blocker', 'reporter')) as owner_cols,
       c.oid as oid
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and (n.nspname in ('app', 'private', 'sensitive', 'safety', 'billing', 'ops')
       or (n.nspname = 'public' and (c.relname like 'waitlist%' or c.relname in ('signup_attempts', 'link_hits'))));

-- Reine Nachschlagetabellen ohne Personenbezug: dürfen Mitgliedern ganz sichtbar sein.
create temp table rls_reference (sch text, tbl text);
insert into rls_reference values ('app', 'postal_codes'), ('app', 'availability_periods'), ('app', 'evening_transitions');

create temp table rls_results (who text, sch text, tbl text, outcome text, foreign_rows integer);
grant select on rls_targets, rls_reference to authenticated, anon;
grant insert, select on rls_results to authenticated, anon;

create function pg_temp.probe(p_who text, p_uid uuid) returns void language plpgsql as $$
declare
  t record;
  v_sql text;
  n integer;
begin
  for t in select * from pg_temp.rls_targets order by sch, tbl loop
    if p_uid is null or cardinality(t.owner_cols) = 0 then
      v_sql := format('select count(*) from %I.%I', t.sch, t.tbl);
    else
      v_sql := format('select count(*) from %I.%I where not (%s)', t.sch, t.tbl,
        (select string_agg(format('coalesce(%I = %L::uuid, false)', col, p_uid), ' or ') from unnest(t.owner_cols) col));
    end if;
    begin
      execute v_sql into n;
      insert into pg_temp.rls_results values (p_who, t.sch, t.tbl, 'lesbar', n);
    exception when insufficient_privilege then
      insert into pg_temp.rls_results values (p_who, t.sch, t.tbl, 'gesperrt', 0);
    end;
  end loop;
end;
$$;
-- Testhilfe: auch in fremden Rollen aufrufbar (Funktionen sind standardmäßig nicht für PUBLIC ausführbar).
grant execute on function pg_temp.probe(text, uuid) to public;

-- Mitglied Anna (aal1), Mitglied Dora mit Zwei-Faktor (aal2, aber kein Admin), Admin Carla ohne Zwei-Faktor, anon
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select pg_temp.probe('mitglied', 'a0000000-0000-0000-0000-00000000000a');
select tests.reset_role();
select tests.act_as('d0000000-0000-0000-0000-00000000000d', 'aal2');
select pg_temp.probe('mitglied_aal2', 'd0000000-0000-0000-0000-00000000000d');
select tests.reset_role();
select tests.act_as('c0000000-0000-0000-0000-00000000000c', 'aal1');
select pg_temp.probe('admin_aal1', 'c0000000-0000-0000-0000-00000000000c');
select tests.reset_role();
select tests.act_as_anon();
select pg_temp.probe('anon', null);
select tests.reset_role();

-- Jede Tabelle: keine fremden Zeilen (außer reinen Nachschlagetabellen für Angemeldete)
select is(r.foreign_rows, 0, format('%s: %s.%s zeigt keine fremden Zeilen (%s)', r.who, r.sch, r.tbl, r.outcome))
from rls_results r
where not (r.who <> 'anon' and exists (select 1 from rls_reference x where x.sch = r.sch and x.tbl = r.tbl))
order by r.who, r.sch, r.tbl;

-- anon liest gar nichts (auch keine Nachschlagetabellen)
select is((select count(*)::int from rls_results where who = 'anon' and outcome = 'lesbar'), 0, 'anon hat auf keine Tabelle Lesezugriff');

-- Die Prüfung ist aussagekräftig: Anna sieht ihre eigenen Zeilen, und fremde Zeilen existieren.
select ok((select count(*) from rls_targets) >= 45, 'Mindestens 45 Tabellen werden geprüft');
select is((select count(*)::int from app.accounts), 3, 'Es gibt fremde Konten (Prüfung sinnvoll)');
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from app.accounts), 1, 'Anna sieht genau ihr Konto');
select is((select count(*)::int from app.evenings), 1, 'Anna sieht genau ihren gemeinsamen Abend mit Ben');
select is((select count(*)::int from app.pairings), 1, 'Anna sieht nur freigegebene eigene Vorschläge (nicht pending_review)');
select is((select count(*)::int from app.feedback), 0, 'Anna sieht Bens Rückmeldung zum gemeinsamen Abend nicht');
select is((select count(*)::int from app.contact_shares), 0, 'Anna sieht Bens Kontakt-Freigabe nicht');
select throws_ok($$ select total_score from app.pairings $$, '42501', null, 'Scores der Vorschläge sind für Mitglieder gesperrt');
select throws_ok($$ select stripe_customer_id from billing.memberships $$, '42501', null, 'Stripe-IDs sind für Mitglieder gesperrt');
select tests.reset_role();

-- Admin mit Zwei-Faktor sieht alle Konten (Gegenprobe)
select tests.act_as('c0000000-0000-0000-0000-00000000000c', 'aal2');
select is((select count(*)::int from app.accounts), 3, 'Admin mit aal2 sieht alle Konten');
select tests.reset_role();

-- Schreibrechte: Mitglieder schreiben nur über Funktionen. Ausnahmen sind ausdrücklich gewollt.
select is(
  (select coalesce(array_agg(format('%s.%s:%s', t.sch, t.tbl, p.priv) order by t.sch, t.tbl, p.priv), '{}')
   from rls_targets t cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p(priv)
   where has_table_privilege('authenticated', t.oid, p.priv)
     and format('%s.%s:%s', t.sch, t.tbl, p.priv) <> all (array[
       'app.availability_windows:INSERT', 'app.availability_windows:DELETE', 'app.push_subscriptions:DELETE'])),
  '{}'::text[], 'authenticated hat außer den gewollten Ausnahmen keine Schreibrechte');
select is(
  (select coalesce(array_agg(format('%s.%s', t.sch, t.tbl) order by t.sch, t.tbl), '{}')
   from rls_targets t
   where has_table_privilege('anon', t.oid, 'SELECT') or has_table_privilege('anon', t.oid, 'INSERT')
      or has_table_privilege('anon', t.oid, 'UPDATE') or has_table_privilege('anon', t.oid, 'DELETE')),
  '{}'::text[], 'anon hat auf keine Tabelle Rechte');
select is(
  (select coalesce(array_agg(format('%s.%s', t.sch, t.tbl) order by t.sch, t.tbl), '{}')
   from rls_targets t join pg_class c on c.oid = t.oid where not c.relrowsecurity),
  '{}'::text[], 'Jede geprüfte Tabelle hat RLS');

-- Funktionen im Schema api, die anon ausführen darf: nur die öffentlichen.
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'api' and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in ('public_settings', 'legal_document', 'billing_tiers', 'help_contacts') and p.proname not like 'waitlist%'),
  '{}'::text[], 'anon führt nur öffentliche api-Funktionen aus');

-- Funktionen in den über PostgREST erreichbaren Schemas app und billing: Mitglieder führen nur harmlose aus.
-- Erlaubt sind nur reine Hilfsfunktionen ohne Zugriff auf fremde Daten (Zeit- und Formatumrechnung, Altersband,
-- Erkennung von Art.-9-Begriffen in einem übergebenen Text, Admin-Prüfung der eigenen Sitzung).
select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'billing', 'private', 'sensitive', 'safety', 'ops')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and (n.nspname || '.' || p.proname) <> all (array['app.is_admin', 'app.now', 'app.berlin_today', 'app.is_of_age',
       'app.required_consents', 'app.require_admin', 'app.age_band', 'app.art9_categories', 'app.art9_categories_jsonb',
       'app.berlin_at', 'app.iso_utc', 'app.jsonb_to_times', 'app.times_to_jsonb'])),
  '{}'::text[], 'authenticated führt in app/billing nur harmlose Funktionen aus (z. B. nicht app.evening_transition)');
select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'billing', 'private', 'sensitive', 'safety', 'ops', 'api')
     and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege('public', p.oid, 'EXECUTE')),
  '{}'::text[], 'Keine Fermata-Funktion ist für PUBLIC ausführbar');
select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('app', 'billing', 'private', 'sensitive', 'safety', 'ops', 'api')
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and (n.nspname || '.' || p.proname) <> all (array['app.now', 'api.public_settings', 'api.legal_document', 'api.billing_tiers',
       'api.help_contacts'])
     and p.proname not like 'waitlist%'),
  '{}'::text[], 'anon führt keine internen Funktionen aus (nur app.now, öffentliche Einstellungen, Rechtstexte, Stufen, Hilfe-Kontakte)');
select is(
  (select coalesce(array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname), '{}')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('ops', 'private', 'sensitive', 'safety')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  '{}'::text[], 'authenticated führt keine Funktionen in ops, private, sensitive, safety aus');
select tests.act_as_anon();
select throws_ok($$ select api.my_export() $$, '42501', null, 'anon ruft keine Mitgliederfunktion auf');
select throws_ok($$ select api.admin_overview() $$, '42501', null, 'anon ruft keine Admin-Funktion auf');
select tests.reset_role();
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select app.on_account_created('a0000000-0000-0000-0000-00000000000a') $$, '42501', null,
  'Mitglieder legen keine Konten (Gratis-Abend) an');
select throws_ok($$ select app.evening_transition('e0000000-0000-0000-0000-00000000e0bd', 'decline', 'b0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'Mitglieder können keinen Abendwechsel im Namen anderer auslösen');
select throws_ok($$ select app.has_consent('b0000000-0000-0000-0000-00000000000b', 'art9_religion') $$,
  '42501', null, 'Mitglieder fragen keine fremden Einwilligungen ab');
select tests.reset_role();

-- Hinweis, falls neue Tabellen ohne Testdaten dazukommen (kein Fehler, nur Diagnose)
select diag(format('Ohne Testdaten (nur Sichtbarkeit geprüft): %s.%s', t.sch, t.tbl))
from rls_targets t
where not exists (select 1 from rls_reference x where x.sch = t.sch and x.tbl = t.tbl)
  and (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', t.sch, t.tbl), false, true, '')))[1]::text::int = 0;

select * from finish();
rollback;
