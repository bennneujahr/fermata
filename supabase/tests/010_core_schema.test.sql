begin;
select plan(27);

-- Jede Tabelle in den Fermata-Schemas hat RLS.
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where c.relkind = 'r' and n.nspname in ('app', 'private', 'sensitive', 'safety', 'billing', 'ops') and not c.relrowsecurity),
  0, 'RLS ist auf jeder Tabelle eingeschaltet');

-- Testpersonen
select tests.create_user('anna@example.test', '00000000-0000-0000-0000-00000000000a');
select tests.create_user('ben@example.test', '00000000-0000-0000-0000-00000000000b');
select tests.create_user('cem@example.test', '00000000-0000-0000-0000-00000000000c');
insert into app.accounts (user_id) values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');

-- anon sieht nichts
select tests.act_as_anon();
select throws_ok($$ select * from app.accounts $$, '42501', null, 'anon darf app.accounts nicht lesen');
select throws_ok($$ select * from private.account_facts $$, '42501', null, 'anon erreicht private nicht');
select tests.reset_role();

-- Personen sehen nur sich selbst
select tests.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from app.accounts), 1, 'Anna sieht nur ihr eigenes Konto');
select throws_ok($$ select * from sensitive.profile_identity $$, '42501', null, 'Mitglieder lesen sensitive nicht direkt');
select throws_ok($$ insert into app.consents (user_id, kind, action, document_version) values (auth.uid(), 'art9_profile', 'granted', 'v1') $$,
  '42501', null, 'Einwilligungen nur über Funktionen schreiben');

-- Art.-9: ohne Einwilligung kein Speichern
select throws_ok($$ select api.save_identity('frau', array['mann']) $$, '42501', null, 'Ohne Einwilligung art9_profile kein Speichern');
select tests.reset_role();

insert into app.consents (user_id, kind, action, document_version) values
  ('00000000-0000-0000-0000-00000000000a', 'art9_profile', 'granted', 'v1'),
  ('00000000-0000-0000-0000-00000000000b', 'art9_profile', 'granted', 'v1'),
  ('00000000-0000-0000-0000-00000000000c', 'art9_profile', 'granted', 'v1');

select tests.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select api.save_identity('frau', array['mann']) $$, 'Mit Einwilligung: Anna speichert ihre Angaben');
select is((select gender from api.my_identity()), 'frau', 'Anna liest ihre eigenen Angaben');
select throws_ok($$ select api.save_identity('xyz', array['mann']) $$, '22023', null, 'Ungültige Werte werden abgelehnt');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-00000000000b');
select api.save_identity('mann', array['frau']);
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-00000000000c');
select api.save_identity('mann', array['mann']);
select tests.reset_role();

-- Verschlüsselt gespeichert
select ok((select gender_enc from sensitive.profile_identity where user_id = '00000000-0000-0000-0000-00000000000a') <> convert_to('frau', 'UTF8'),
  'Geschlecht liegt verschlüsselt vor');

-- Prüffunktionen liefern nur true/false
select ok(sensitive.gender_compatible('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'), 'Anna und Ben passen zusammen');
select ok(not sensitive.gender_compatible('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000c'), 'Anna und Cem nicht');
select ok(sensitive.religion_compatible('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'), 'Ohne Religionsvorgabe kompatibel');

-- Einwilligung widerrufen: neue Zeile, aktueller Stand false
insert into app.consents (user_id, kind, action, document_version) values ('00000000-0000-0000-0000-00000000000a', 'art9_profile', 'revoked', 'v1');
select ok(not app.has_consent('00000000-0000-0000-0000-00000000000a', 'art9_profile'), 'Widerruf gilt sofort');
select throws_ok($$ update app.consents set action = 'granted' $$, '42501', null, 'Einwilligungen lassen sich nicht ändern');

-- service_role liest die Art.-9-Tabellen nicht direkt
select tests.act_as_service();
select throws_ok($$ select * from sensitive.profile_identity $$, '42501', null, 'service_role liest Art.-9-Tabellen nicht');
select ok(sensitive.gender_compatible('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'), 'service_role nutzt nur die Prüffunktion');
select tests.reset_role();

-- Abend als Zustandsautomat
insert into app.match_runs (id, scheduled_for, status) values ('10000000-0000-0000-0000-000000000001', now(), 'approved');
insert into app.pairings (id, run_id, user_a, user_b, total_score, status)
  values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', 0.8, 'proposed');
insert into app.evenings (id, pairing_id, user_a, user_b)
  values ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b');

select throws_ok($$ update app.evenings set state = 'confirmed' $$, '42501', null, 'Zustand nicht direkt änderbar');
select throws_ok($$ select app.evening_transition('30000000-0000-0000-0000-000000000001', 'confirm', '00000000-0000-0000-0000-00000000000a') $$,
  '23514', null, 'proposed → confirm ist nicht erlaubt');
select throws_ok($$ select app.evening_transition('30000000-0000-0000-0000-000000000001', 'request_time', '00000000-0000-0000-0000-00000000000c') $$,
  '42501', null, 'Unbeteiligte dürfen keinen Wechsel auslösen');
select is((app.evening_transition('30000000-0000-0000-0000-000000000001', 'request_time', '00000000-0000-0000-0000-00000000000a')).state,
  'time_requested', 'Wunschzeit setzt time_requested');
select is((app.evening_transition('30000000-0000-0000-0000-000000000001', 'confirm', '00000000-0000-0000-0000-00000000000b')).state,
  'confirmed', 'Bestätigung setzt confirmed');
select is((select count(*)::int from app.evening_events where evening_id = '30000000-0000-0000-0000-000000000001'), 2, 'Jeder Wechsel steht im Verlauf');

-- Cem sieht den Abend von Anna und Ben nicht
select tests.act_as('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from app.evenings), 0, 'Unbeteiligte sehen fremde Abende nicht');
select tests.reset_role();

-- Kontingent-Buch
insert into billing.evening_ledger (user_id, kind, amount) values ('00000000-0000-0000-0000-00000000000a', 'free_grant', 1);
insert into billing.evening_ledger (user_id, kind, amount, expires_at) values ('00000000-0000-0000-0000-00000000000a', 'period_grant', 2, now() + interval '28 days');
insert into billing.evening_ledger (user_id, kind, amount) values ('00000000-0000-0000-0000-00000000000a', 'reserve', -1);
select is(billing.available_evenings('00000000-0000-0000-0000-00000000000a'), 2, 'Verfügbare Abende = Summe des Buchs');
select ops.sim_clock_advance(interval '29 days');
select is(billing.available_evenings('00000000-0000-0000-0000-00000000000a'), 0, 'Abgelaufene Zuteilungen zählen nicht mehr');
select ops.sim_clock_reset();

select * from finish();
rollback;
