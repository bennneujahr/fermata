-- M2 · Admin-Funktionen (aal2), Datenexport (nur eigene Daten), Kontolöschung (Kaskade, gesetzliche Reste).
begin;
select no_plan();

select tests.create_user('carla@example.test', 'c0000000-0000-0000-0000-00000000000c');
insert into app.admin_users (user_id, display_name) values ('c0000000-0000-0000-0000-00000000000c', 'Carla');
select tests.create_user('anna@example.test', 'a0000000-0000-0000-0000-00000000000a');
select tests.create_user('ben@example.test', 'b0000000-0000-0000-0000-00000000000b');
select ops.create_invited_account('anna@example.test', 'a0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-00000000000c');
select ops.create_invited_account('ben@example.test', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000c');

create function pg_temp.onboard(p_user uuid, p_first text, p_last text, p_gender text, p_seek text) returns void language plpgsql as $$
declare k text;
begin
  perform tests.act_as(p_user);
  foreach k in array array['agb', 'datenschutz_kenntnis', 'art9_profile', 'art9_religion', 'gespraech'] loop
    perform api.give_consent(k, (select d.version from api.legal_document(k) d));
  end loop;
  perform api.save_facts(p_first, p_last, date '1990-01-01', '19053', null, '+49 170 0000000');
  perform api.save_identity(p_gender, array[p_seek], 'geheim-' || p_first);
  perform api.save_religion('religion-' || p_first, 'etwas', false);
  perform tests.reset_role();
end;
$$;
select pg_temp.onboard('a0000000-0000-0000-0000-00000000000a', 'Anna', 'Albers', 'frau', 'mann');
select pg_temp.onboard('b0000000-0000-0000-0000-00000000000b', 'Bernhard', 'Brandtmeier', 'mann', 'frau');

-- ---------------------------------------------------------------------------
-- Admin nur mit Zwei-Faktor
-- ---------------------------------------------------------------------------
select tests.act_as('c0000000-0000-0000-0000-00000000000c', 'aal1');
select throws_ok($$ select api.admin_overview() $$, '42501', null, 'Admin ohne Zwei-Faktor: admin_overview gesperrt');
select throws_ok($$ select * from api.admin_accounts() $$, '42501', null, 'Admin ohne Zwei-Faktor: admin_accounts gesperrt');
select throws_ok($$ select api.admin_update_setting('account.min_age', '19') $$, '42501', null, 'Admin ohne Zwei-Faktor: Einstellungen gesperrt');
select is(api.my_admin_status() ->> 'is_admin_user', 'true', 'my_admin_status erkennt Admin auch mit aal1');
select is(api.my_admin_status() ->> 'is_admin', 'false', '… aber ohne Admin-Rechte');
select tests.reset_role();

select tests.act_as('a0000000-0000-0000-0000-00000000000a', 'aal2');
select throws_ok($$ select api.admin_overview() $$, '42501', null, 'Mitglied mit aal2 ist kein Admin');
select throws_ok($$ select * from api.admin_settings() $$, '42501', null, 'Mitglied liest keine Einstellungen');
select throws_ok($$ select api.admin_account('b0000000-0000-0000-0000-00000000000b') $$, '42501', null, 'Mitglied liest kein fremdes Konto');
select tests.reset_role();

select tests.act_as('c0000000-0000-0000-0000-00000000000c', 'aal2');
select is((api.admin_overview() ->> 'accounts_total')::int, 2, 'Dashboard zählt Konten');
select is((select count(*)::int from api.admin_accounts()), 2, 'Kontenliste');
select is((select count(*)::int from api.admin_accounts('albers')), 1, 'Suche nach Nachname');
select is((select next_step from api.admin_accounts('anna@')), 'ausweis', 'Liste zeigt den Onboarding-Schritt');
select is((select count(*)::int from api.admin_invitations()), 2, 'Einladungen');
select is(api.admin_account('a0000000-0000-0000-0000-00000000000a') -> 'facts' ->> 'last_name', 'Albers', 'Kontodetail mit Fakten');
select ok(api.admin_account('a0000000-0000-0000-0000-00000000000a')::text not like '%geheim-Anna%'
          and api.admin_account('a0000000-0000-0000-0000-00000000000a')::text not like '%religion-Anna%'
          and api.admin_account('a0000000-0000-0000-0000-00000000000a')::text not like '%"frau"%',
  'Admin sieht keine Art.-9-Angaben');
select ok((select count(*) from api.admin_settings() where key = 'account.collect_street') = 1 and (select count(*) from api.admin_settings()) > 40,
  'Alle Einstellungen lesbar');

select throws_ok($$ select api.admin_update_setting('gibt.es.nicht', '1') $$, 'P0002', null, 'Unbekannte Einstellung');
select throws_ok($$ select api.admin_update_setting('account.min_age', '"achtzehn"') $$, '22023', null, 'Falscher JSON-Typ abgelehnt');
select throws_ok($$ select api.admin_update_setting('account.min_age', null) $$, '22023', null, 'Ohne Wert abgelehnt');
select is(api.admin_update_setting('verification.max_attempts', '4') ->> 'value', '4', 'Einstellung geändert');
select tests.reset_role();
select is(ops.setting_int('verification.max_attempts'), 4, 'Neuer Wert gilt');
select is((select updated_by from ops.app_settings where key = 'verification.max_attempts'), 'c0000000-0000-0000-0000-00000000000c'::uuid,
  'Wer geändert hat, steht dabei');
select ok(exists (select 1 from ops.app_settings_history h where h.key = 'verification.max_attempts' and h.new_value = '4'), 'Verlauf der Einstellung');
select ok(exists (select 1 from ops.audit_log a where a.action = 'setting.updated' and a.target_id = 'verification.max_attempts'
                  and a.actor = 'c0000000-0000-0000-0000-00000000000c'), 'Änderung im Audit');
select ok(exists (select 1 from ops.audit_log a where a.action = 'admin.account_viewed'), 'Ansehen eines Kontos im Audit');

-- Sicherheits-Hinweise lesen
insert into safety.safety_flags (user_id, source, kind, severity) values ('b0000000-0000-0000-0000-00000000000b', 'system', 'test', 'hoch');
select tests.act_as('c0000000-0000-0000-0000-00000000000c', 'aal2');
select is((select count(*)::int from api.admin_safety_flags()), 1, 'Offene Hinweise');
select is((select email from api.admin_safety_flags()), 'ben@example.test', 'Hinweis mit E-Mail der Person');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Datenexport: nur eigene Daten
-- ---------------------------------------------------------------------------
insert into app.venues (id, name, street, postal_code, city, lat, lon)
  values ('e0000000-0000-0000-0000-000000000003', 'Café Testlokal', 'Markt 1', '19053', 'Schwerin', 53.63, 11.41);
insert into app.match_runs (id, scheduled_for, status) values ('e0000000-0000-0000-0000-000000000004', now(), 'approved');
insert into app.pairings (id, run_id, user_a, user_b, total_score, status, reasons_text)
  values ('e0000000-0000-0000-0000-0000000000ab', 'e0000000-0000-0000-0000-000000000004',
          'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 0.8, 'proposed', 'Beide mögen Jazz');
insert into app.evenings (id, pairing_id, user_a, user_b, venue_id)
  values ('e0000000-0000-0000-0000-00000000e0ab', 'e0000000-0000-0000-0000-0000000000ab',
          'a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'e0000000-0000-0000-0000-000000000003');
select app.evening_transition('e0000000-0000-0000-0000-00000000e0ab', 'request_time', 'b0000000-0000-0000-0000-00000000000b',
  '{"notiz": "Bernhards Wunsch"}');
insert into app.feedback (evening_id, user_id, attended, note)
  values ('e0000000-0000-0000-0000-00000000e0ab', 'b0000000-0000-0000-0000-00000000000b', true, 'Bernhards geheime Rückmeldung');
insert into app.feedback (evening_id, user_id, attended, note)
  values ('e0000000-0000-0000-0000-00000000e0ab', 'a0000000-0000-0000-0000-00000000000a', true, 'Annas Rückmeldung');
insert into safety.reports (reporter, reported, context, category, description)
  values ('a0000000-0000-0000-0000-00000000000a', 'b0000000-0000-0000-0000-00000000000b', 'abend', 'unangenehm', 'Annas Meldung');
insert into safety.reports (reporter, reported, context, category, description)
  values ('b0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 'abend', 'unangenehm', 'Bernhards Meldung über Anna');
insert into app.interview_sessions (id, user_id) values ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a');
insert into app.interview_transcripts (session_id, user_id, turns)
  values ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a', '[{"role": "person", "text": "Annas Gespräch"}]');
insert into billing.contract_actions (user_id, kind, details) values ('a0000000-0000-0000-0000-00000000000a', 'order', '{"tier": "andante"}');

select tests.act_as_anon();
select throws_ok($$ select api.my_export() $$, '42501', null, 'anon exportiert nichts');
select tests.reset_role();

select tests.act_as('a0000000-0000-0000-0000-00000000000a');
create temp table export_a as select api.my_export() as j;
select tests.reset_role();

select is((select j -> 'angaben' ->> 'first_name' from export_a), 'Anna', 'Export enthält eigene Angaben');
select is((select j -> 'besondere_angaben' -> 'geschlecht_und_suche' ->> 'orientierung' from export_a), 'geheim-Anna',
  'Art.-9-Angaben für die Person selbst entschlüsselt');
select is((select j -> 'besondere_angaben' -> 'religion_und_gesundheit' ->> 'religion' from export_a), 'religion-Anna', 'Religion entschlüsselt');
select ok((select jsonb_array_length(j -> 'einwilligungen') >= 5 from export_a), 'Einwilligungsverlauf');
select is((select j -> 'gespraeche' -> 0 -> 'transkript' -> 0 ->> 'text' from export_a), 'Annas Gespräch', 'Transkript enthalten');
select is((select jsonb_array_length(j -> 'abende') from export_a), 1, 'Eigener Abend enthalten');
select is((select j -> 'abende' -> 0 -> 'lokal' ->> 'name' from export_a), 'Café Testlokal', 'Lokal des Abends');
select is((select jsonb_array_length(j -> 'rueckmeldungen') from export_a), 1, 'Nur die eigene Rückmeldung');
select is((select jsonb_array_length(j -> 'meine_meldungen') from export_a), 1, 'Nur eigene Meldungen');
select is((select jsonb_array_length(j -> 'vertragshandlungen') from export_a), 1, 'Vertragshandlungen');
select is((select (j ->> 'verfuegbare_abende')::int from export_a), 1, 'Kontingent');
select is((select j -> 'anmeldung' ->> 'email' from export_a), 'anna@example.test', 'E-Mail-Adresse');
select ok((select j::text not like '%b0000000-0000-0000-0000-00000000000b%' from export_a), 'Keine ID einer anderen Person');
select ok((select j::text not ilike '%bernhard%' and j::text not ilike '%brandtmeier%' and j::text not like '%ben@example%' from export_a),
  'Kein Name, keine Adresse und keine Rückmeldung/Meldung einer anderen Person');
select ok((select j::text not like '%c0000000-0000-0000-0000-00000000000c%' from export_a), 'Keine ID der einladenden Admin-Person');
select ok(exists (select 1 from ops.audit_log where action = 'account.exported' and actor = 'a0000000-0000-0000-0000-00000000000a'), 'Export im Audit');

-- ---------------------------------------------------------------------------
-- Kontolöschung
-- ---------------------------------------------------------------------------
select throws_ok($$ select ops.account_deletion_prepare('c0000000-0000-0000-0000-00000000000c') $$, '42501', null, 'Admin-Konten nicht selbst löschen');
select is(ops.account_deletion_prepare('a0000000-0000-0000-0000-00000000000a') ->> 'email', 'anna@example.test', 'Vorbereitung liefert die Adresse für die Bestätigung');
select is((select count(*)::int from app.account_invitations where email = 'anna@example.test'), 0, 'Einladung (E-Mail im Klartext) entfernt');
-- Supabase Auth löscht die Person (die Edge Function nutzt die Admin-API; hier direkt):
delete from auth.users where id = 'a0000000-0000-0000-0000-00000000000a';
select ok(ops.account_deletion_done('a0000000-0000-0000-0000-00000000000a'), 'Löschung vollständig');

select is((select count(*)::int from app.accounts where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0, 'Konto gelöscht');
select is((select count(*)::int from private.account_facts where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0, 'Fakten gelöscht');
select is((select count(*)::int from sensitive.profile_identity where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0, 'Art.-9-Angaben gelöscht');
select is((select count(*)::int from sensitive.profile_sensitive where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0, 'Religion gelöscht');
select is((select count(*)::int from app.consents where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0, 'Einwilligungen gelöscht');
select is((select count(*)::int from app.geo where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0, 'Ort gelöscht');
select is((select count(*)::int from app.interview_transcripts where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0, 'Transkripte gelöscht');
select is((select count(*)::int from billing.evening_ledger where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0, 'Kontingent gelöscht');
select is((select count(*)::int from billing.contract_actions where user_id is null and kind = 'order'), 1,
  'Vertragshandlung bleibt ohne Personenbezug (gesetzliche Aufbewahrung)');
select is((select count(*)::int from safety.reports where reporter is null and description = 'Annas Meldung'), 1, 'Meldung bleibt ohne Personenbezug');
select ok(exists (select 1 from ops.audit_log where action = 'account.deleted' and target_id = 'a0000000-0000-0000-0000-00000000000a'), 'Löschung im Audit');
select is((select count(*)::int from app.accounts where user_id = 'b0000000-0000-0000-0000-00000000000b'), 1, 'Andere Konten bleiben');

-- Löschen während einer offenen Meldung: Hashes bleiben für Benn
select ops.verification_begin('b0000000-0000-0000-0000-00000000000b') where false;
insert into app.verifications (id, user_id, status, provider_session_id) values ('e0000000-0000-0000-0000-0000000000f1', 'b0000000-0000-0000-0000-00000000000b', 'approved', 'sess_b');
insert into safety.verification_hashes (user_id, doc_hash, name_hash)
  values ('b0000000-0000-0000-0000-00000000000b', 'dochash-b', 'namehash-b');
insert into safety.reports (reporter, reported, context, category) values (null, 'b0000000-0000-0000-0000-00000000000b', 'abend', 'bedrohung');
select ops.account_deletion_prepare('b0000000-0000-0000-0000-00000000000b');
select ok(exists (select 1 from safety.safety_flags f where f.kind = 'konto_geloescht_waehrend_pruefung' and f.details::text like '%dochash-b%'),
  'Bei offener Meldung bleiben die Sperrlisten-Hashes als Hinweis für Benn');

select * from finish();
rollback;
