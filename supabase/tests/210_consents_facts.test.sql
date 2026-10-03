-- M2 · Einwilligungen (api.give_consent/revoke_consent/my_consents), Formular (api.save_facts), Anrede, Onboarding-Stand.
begin;
select no_plan();

select tests.create_user('anna@example.test', 'a0000000-0000-0000-0000-00000000000a');
select tests.create_user('ohnekonto@example.test', 'f0000000-0000-0000-0000-00000000000f');
select app.on_account_created('a0000000-0000-0000-0000-00000000000a');

-- Texte liegen als Entwurf vor
-- Seit der Härtung (20261003000900) haben mehrere Texte eine neue Fassung; je Art ist genau eine aktuell.
select is((select count(distinct kind)::int from ops.legal_documents where status = 'entwurf'
           and kind in ('agb', 'datenschutz_kenntnis', 'art9_profile', 'art9_religion', 'biometrie', 'gespraech', 'push', 'kontakttausch', 'ki_hinweis')),
  9, 'Neun Einwilligungs- und Hinweistexte als Entwurf');
select is((select version from api.legal_document('agb')), '2026-10-03-entwurf', 'api.legal_document liefert die aktuelle Fassung');

-- Ohne Anmeldung / ohne Konto
select tests.act_as_anon();
select throws_ok($$ select api.give_consent('agb', '2026-10-03-entwurf') $$, '42501', null, 'anon darf api.give_consent nicht ausführen');
select tests.reset_role();
select tests.act_as('f0000000-0000-0000-0000-00000000000f');
select throws_ok($$ select api.give_consent('agb', '2026-10-03-entwurf') $$, '42501', 'Kein Mitgliedskonto', 'Ohne Konto keine Einwilligung');
select tests.reset_role();

select tests.act_as('a0000000-0000-0000-0000-00000000000a');
-- Onboarding beginnt mit den Einwilligungen
select is(api.my_onboarding() ->> 'next_step', 'einwilligungen', 'Neues Konto: nächster Schritt Einwilligungen');
select is(api.my_onboarding() ->> 'status', 'onboarding', 'Neues Konto hat Status onboarding');
select is(jsonb_array_length(api.my_onboarding() -> 'steps'), 4, 'Vier Schritte im Stepper');

select throws_ok($$ select api.give_consent('agb', 'v0-alt') $$, '22023', 'Veraltete Fassung', 'Veraltete Fassung wird abgelehnt');
select throws_ok($$ select api.give_consent('werbung', '2026-10-03-entwurf') $$, '22023', 'Unbekannte Einwilligung', 'Unbekannte Art wird abgelehnt');

-- Formular erst nach den Pflicht-Einwilligungen (art9_profile vor dem Formular)
select throws_ok($$ select api.save_facts('Anna', 'Albers', date '1990-05-17', '19053') $$, '42501', null, 'Formular erst nach den Einwilligungen');

select lives_ok($$ select api.give_consent('agb', '2026-10-03-entwurf') $$, 'AGB erteilt');
select lives_ok($$ select api.give_consent('agb', '2026-10-03-entwurf') $$, 'Doppelte Erteilung ist harmlos');
select is((select count(*)::int from app.consents where kind = 'agb'), 1, 'Doppelte Erteilung erzeugt keine zweite Zeile');
select lives_ok($$ select api.give_consent('datenschutz_kenntnis', (select d.version from api.legal_document('datenschutz_kenntnis') d)) $$, 'Datenschutzhinweise zur Kenntnis');
select throws_ok($$ select api.save_facts('Anna', 'Albers', date '1990-05-17', '19053') $$, '42501', null, 'Ohne art9_profile kein Formular');
select lives_ok($$ select api.give_consent('art9_profile', (select d.version from api.legal_document('art9_profile') d)) $$, 'art9_profile erteilt');
select is(api.my_onboarding() ->> 'next_step', 'angaben', 'Danach: Angaben');
select is((select count(*)::int from api.my_consents() where required and granted), 3, 'my_consents zeigt drei erteilte Pflicht-Einwilligungen');
select is((select count(*)::int from api.my_consents()), 8, 'my_consents listet alle angebotenen Arten (ohne art9_health, Härtung)');

-- Formular: Prüfungen
select throws_ok($$ select api.save_facts('Anna', 'Albers', null, '19053') $$, '22023', 'Ungültiges Geburtsdatum', 'Geburtsdatum Pflicht');
select throws_ok($$ select api.save_facts('Anna3', 'Albers', date '1990-05-17', '19053') $$, '22023', 'Ungültiger Name', 'Ziffern im Namen abgelehnt');
select throws_ok($$ select api.save_facts('', 'Albers', date '1990-05-17', '19053') $$, '22023', 'Ungültiger Name', 'Leerer Vorname abgelehnt');
select throws_ok($$ select api.save_facts('Anna', 'Albers', date '1990-05-17', '1905') $$, '22023', 'Ungültige Postleitzahl', 'PLZ mit 4 Ziffern abgelehnt');
select throws_ok($$ select api.save_facts('Anna', 'Albers', date '1990-05-17', '00000') $$, '22023', 'Unbekannte Postleitzahl', 'Unbekannte PLZ abgelehnt');
select throws_ok($$ select api.save_facts('Anna', 'Albers', date '1990-05-17', '19053', null, 'abc') $$, '22023', 'Ungültige Telefonnummer', 'Telefon wird geprüft');
select throws_ok($$ select api.save_facts('Anna', 'Albers', date '1990-05-17', '19053', null, null, 'Markt 1') $$,
  '22023', 'Die Straße wird nicht abgefragt', 'Straße nur mit account.collect_street (B1)');

-- 18+ mit app.now(): genau 18 Jahre minus einen Tag → zu jung; nach zwei Tagen (Testuhr) volljährig.
select tests.reset_role();
create temp table bday as select ((app.now() at time zone 'Europe/Berlin')::date - interval '18 years' + interval '1 day')::date as d;
grant select on bday to authenticated;
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select api.save_facts('Anna', 'Albers', (select d from bday), '19053') $$, '22023', null, '17-Jährige werden abgelehnt (too_young)');
select tests.reset_role();
select ops.sim_clock_advance(interval '2 days');
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select api.save_facts('Anna', 'Albers', (select d from bday), '19053') $$, 'Mit dem 18. Geburtstag (Testuhr) geht es');
select tests.reset_role();
select ops.sim_clock_reset();

select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select is(api.save_facts('  Anna  Maria ', 'Albers', date '1990-05-17', '19053', '', '+49 385 123456') ->> 'city', 'Schwerin',
  'Ort wird aus der PLZ ergänzt, Leerzeichen bereinigt');
select is((select first_name from api.my_facts()), 'Anna Maria', 'Name ohne doppelte Leerzeichen gespeichert');
select is((select postal_code from app.geo), '19053', 'app.geo bekommt die PLZ');
select ok((select abs(lat - 53.6313) < 0.001 and abs(lon - 11.4092) < 0.001 from app.geo), 'app.geo ist der PLZ-Mittelpunkt');
select is(api.my_onboarding() ->> 'next_step', 'identitaet', 'Danach: Identität');
select tests.reset_role();
select is((select birth_year from app.profile_core where user_id = 'a0000000-0000-0000-0000-00000000000a'), 1990, 'Geburtsjahr für den Altersfilter');

-- Straße nur, wenn die Einstellung an ist
update ops.app_settings set value = 'true' where key = 'account.collect_street';
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select api.save_facts('Anna Maria', 'Albers', date '1990-05-17', '19053', null, null, 'Markt 1') $$, 'Mit Einstellung wird die Straße gespeichert');
select is((select street from api.my_facts()), 'Markt 1', 'Straße gespeichert');
select tests.reset_role();
update ops.app_settings set value = 'false' where key = 'account.collect_street';

-- Identität und Anrede
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select api.save_identity('frau', array['mann', 'frau'], 'bi') $$, 'Identität gespeichert');
select is(api.my_onboarding() ->> 'next_step', 'ausweis', 'Danach: Ausweis');
select is(api.save_address_form('du'), 'du', 'Anrede Du gespeichert');
select is(api.my_onboarding() ->> 'address_form', 'du', 'Anrede im Onboarding-Stand');
select throws_ok($$ select api.save_address_form('ihr') $$, '22023', null, 'Nur sie oder du');

-- Widerruf: neue Zeile, Daten sofort gelöscht
select throws_ok($$ select api.revoke_consent('agb') $$, '42501', null, 'AGB nur über Kontolöschung beenden');
select lives_ok($$ select api.give_consent('art9_religion', (select d.version from api.legal_document('art9_religion') d)) $$, 'Religion-Einwilligung erteilt');
select lives_ok($$ select api.save_religion('christlich', 'wichtig', true) $$, 'Religion gespeichert');
select lives_ok($$ select api.revoke_consent('art9_religion') $$, 'Religion-Einwilligung widerrufen');
select tests.reset_role();
select is((select count(*)::int from sensitive.profile_sensitive where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0,
  'Widerruf art9_religion löscht die Religionsangaben');
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select api.revoke_consent('art9_profile') $$, 'art9_profile widerrufen');
select tests.reset_role();
select is((select count(*)::int from sensitive.profile_identity where user_id = 'a0000000-0000-0000-0000-00000000000a'), 0,
  'Widerruf art9_profile löscht Geschlecht und Suche sofort');
select is((select count(*)::int from app.consents where user_id = 'a0000000-0000-0000-0000-00000000000a' and action = 'revoked'), 2,
  'Widerrufe sind neue Zeilen (Nachweis)');
select ok((select count(*) > 0 from ops.audit_log where action = 'consent.revoked'), 'Widerruf steht im Audit');
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select is(api.my_onboarding() ->> 'next_step', 'einwilligungen', 'Nach Widerruf: Einwilligungen wieder offen');
select tests.reset_role();

-- Push-Abo nur mit Einwilligung
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select api.save_push_subscription('https://push.example/x', 'k', 'a', 'android') $$, '42501', null, 'Push-Abo nur mit Einwilligung push');
select lives_ok($$ select api.give_consent('push', (select d.version from api.legal_document('push') d)) $$, 'Push-Einwilligung');
-- Echte Form eines Abos (seit M5 geprüft: Schlüssel 87 Zeichen, auth 22 Zeichen, base64url).
select lives_ok($$ select api.save_push_subscription('https://fcm.googleapis.com/fcm/send/test-abo', 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'ZZZZZZZZZZZZZZZZZZZZZZ', 'android') $$, 'Push-Abo gespeichert');
select is((select count(*)::int from app.push_subscriptions), 1, 'Eigenes Abo sichtbar');
select lives_ok($$ select api.revoke_consent('push') $$, 'Push widerrufen');
select is((select count(*)::int from app.push_subscriptions), 0, 'Widerruf löscht die Push-Abos');
select tests.reset_role();

-- Nachgeschärfte Fassung: needs_renewal
insert into ops.legal_documents (kind, version, status, title, body_markdown) values ('agb', '2026-11-01-entwurf', 'entwurf', 'AGB neu', 'Neu');
select tests.act_as('a0000000-0000-0000-0000-00000000000a');
select ok((select needs_renewal from api.my_consents() where kind = 'agb'), 'Neue Fassung: needs_renewal');
select throws_ok($$ select api.give_consent('agb', '2026-10-03-entwurf') $$, '22023', null, 'Alte Fassung nicht mehr erteilbar');
select tests.reset_role();

select * from finish();
rollback;
