-- Härtung · Rechtstexte (Vertrag 4), Einwilligungstexte (KI-Hinweis, Gespräch, Gegenüber), art9_health nicht
-- angeboten, Kontakttausch-Widerruf, eine Quelle für Krisennummern.
begin;
select no_plan();
\ir 500_fixtures.sql

-- ---------------------------------------------------------------------------
-- Rechtstexte für die Seiten „Rechtliches“
-- ---------------------------------------------------------------------------
select is((select count(*)::int from ops.legal_documents
           where kind in ('impressum', 'datenschutz', 'agb', 'widerruf', 'ki_hinweis')
             and version = '2026-10-03-entwurf' and status = 'entwurf'),
  5, 'Impressum, Datenschutzerklärung, AGB, Widerrufsbelehrung, KI-Hinweis als Entwurf 2026-10-03-entwurf');
select is((select version from api.legal_document(k)), '2026-10-03-entwurf', 'api.legal_document liefert ' || k)
  from unnest(array['impressum', 'datenschutz', 'agb', 'widerruf', 'ki_hinweis']) k;
select is((select count(*)::int from (select kind from ops.legal_documents where status <> 'abgeloest' group by kind having count(*) > 1) x),
  0, 'Je Art genau eine aktuelle Fassung');
select ok((select body_markdown from api.legal_document('widerruf')) like '%## Muster-Widerrufsformular%'
      and (select body_markdown from api.legal_document('widerruf')) like '%Hiermit widerrufe(n) ich/wir%',
  'Widerrufsbelehrung enthält das Muster-Formular');
select ok((select body_markdown from api.legal_document('agb')) like '%§ 17 Schlussbestimmungen%', 'AGB in voller Länge (aus docs/recht/agb.md)');
select ok((select body_markdown from api.legal_document('datenschutz')) like '%## 19. Ihre Rechte%', 'Datenschutzerklärung in voller Länge');
select ok(not exists (select 1 from ops.legal_documents d where d.status <> 'abgeloest'
                      and (d.body_markdown like '%<!--%' or d.body_markdown like '%Offene Punkte für Benn%' or d.body_markdown ~ '\[\^[a-z]')),
  'Keine internen Hinweise, Markierungen oder Fußnoten für Benn in den Texten');
select ok(not exists (select 1 from ops.legal_documents d where d.status <> 'abgeloest' and d.body_markdown ~ '(?<!\[)\[[^\[\]]+\]\([^)]+\)'),
  'Keine Markdown-Links (die Web-App zeigt keine)');

-- Namensschema: alte Arten aus M0 sind nicht mehr erlaubt, die Wartelisten-Einwilligung schon.
select throws_ok($$ insert into ops.legal_documents (kind, version, title, body_markdown) values ('einwilligung_gespraech', 'x', 't', 'b') $$,
  '23514', null, 'Alte Art einwilligung_gespraech ist nicht mehr erlaubt');
select lives_ok($$ insert into ops.legal_documents (kind, version, title, body_markdown) values ('einwilligung_warteliste', 'test-x', 't', 'b') $$,
  'einwilligung_warteliste bleibt erlaubt (Landingpage)');
select is((select status from ops.legal_documents where kind = 'einwilligung_warteliste' and version = 'warteliste-2026-10-03-entwurf'),
  'entwurf', 'Wartelisten-Text bleibt unverändert');

-- ---------------------------------------------------------------------------
-- KI-Hinweis und Gespräch wahrheitsgemäß; alte Fassungen bleiben als Nachweis
-- ---------------------------------------------------------------------------
select ok((select body_markdown from api.legal_document('ki_hinweis')) not like '%gehen nie an ein Sprachmodell.%'
      or (select body_markdown from api.legal_document('ki_hinweis')) like '%aus dem Formular gehen nie an ein Sprachmodell%',
  'KI-Hinweis behauptet nicht mehr pauschal „gehen nie an ein Sprachmodell“');
select ok((select body_markdown from api.legal_document('ki_hinweis')) ~ 'Deepgram' and (select body_markdown from api.legal_document('ki_hinweis')) ~ 'Amazon Bedrock'
      and (select body_markdown from api.legal_document('ki_hinweis')) ~ 'London und Zürich'
      and (select body_markdown from api.legal_document('ki_hinweis')) ~ 'Angemessenheitsbeschluss'
      and (select body_markdown from api.legal_document('ki_hinweis')) ~ '30 Tage'
      and (select body_markdown from api.legal_document('ki_hinweis')) ~ 'automatisch'
      and (select body_markdown from api.legal_document('ki_hinweis')) ~ 'prüft und gibt ein Mensch frei',
  'KI-Hinweis nennt Anbieter, EU-Profil mit London/Zürich, 30 Tage, automatische Prüfung, menschliche Freigabe');
select ok((select body_markdown from api.legal_document('ki_hinweis')) ~ 'Vor dem Speichern filtern wir',
  'KI-Hinweis: ungefragt erzählte Art.-9-Inhalte live verarbeitet, vor dem Speichern gefiltert');
select is((select status from ops.legal_documents where kind = 'ki_hinweis' and version = '2026-10-03-m2'), 'abgeloest',
  'Fehlerhafte M2-Fassung des KI-Hinweises bleibt als abgelöst erhalten');
select is((select version from api.legal_document('gespraech')), '2026-10-03-m8-entwurf', 'Neue Fassung der Einwilligung Gespräch');
select is((select status from ops.legal_documents where kind = 'gespraech' and version = '2026-10-03-entwurf'), 'abgeloest',
  'Alte Fassung Gespräch bleibt als Nachweis (abgelöst)');
select ok((select body_markdown from api.legal_document('gespraech')) ~ 'Deepgram'
      and (select body_markdown from api.legal_document('gespraech')) ~ 'Bedrock'
      and (select body_markdown from api.legal_document('gespraech')) ~ 'Zusammenfassung und ein Profil'
      and (select body_markdown from api.legal_document('gespraech')) ~ 'automatisch'
      and (select body_markdown from api.legal_document('gespraech')) ~ 'Art\. 9 Abs\. 2 lit\. a',
  'Einwilligung Gespräch nennt Anbieter, KI-Auswertung, Sicherheitsprüfung und Art.-9-Klausel');
select ok((select body_markdown from api.legal_document('art9_profile')) not like '%erfährt daraus nichts%'
      and (select body_markdown from api.legal_document('art9_profile')) like '%kann es aber schließen%',
  'art9_profile: ehrlicher Satz zum Rückschluss des Gegenübers');
select ok((select body_markdown from api.legal_document('kontakttausch')) like '%nicht zurückholen%', 'Kontakttausch: Hinweis, dass Geteiltes nicht zurückgeholt werden kann');

-- Neue Fassung → bestehende Zustimmungen brauchen eine Erneuerung
select tests.m5_setup();
insert into app.consents (user_id, kind, action, document_version) values (tests.m5_id('anna'), 'gespraech', 'granted', '2026-10-03-entwurf');
select tests.act_as(tests.m5_id('anna'));
select ok((select needs_renewal from api.my_consents() where kind = 'gespraech'), 'Zustimmung zur alten Fassung: needs_renewal');
select is(tests.hint_of($$ select api.give_consent('gespraech', '2026-10-03-entwurf') $$), 'version_mismatch', 'Alte Fassung nicht mehr erteilbar');
select lives_ok($$ select api.give_consent('gespraech', '2026-10-03-m8-entwurf') $$, 'Neue Fassung erteilbar');
select ok(not (select needs_renewal from api.my_consents() where kind = 'gespraech'), 'Nach Zustimmung zur neuen Fassung: aktuell');

-- ---------------------------------------------------------------------------
-- art9_health: in Phase 1 nicht angeboten, aber widerrufbar
-- ---------------------------------------------------------------------------
select ok(not exists (select 1 from api.my_consents() where kind = 'art9_health'), 'my_consents bietet art9_health nicht an');
select is(tests.hint_of($$ select api.give_consent('art9_health', '2026-10-03-entwurf') $$), 'not_offered', 'art9_health lässt sich nicht erteilen');
select is((select count(*)::int from api.legal_document('art9_health')), 0, 'Kein aktueller Text für art9_health');
select tests.reset_role();
select ok(not ('art9_health' = any (app.consent_kinds_offered())) and 'art9_health' = any (app.consent_kinds()),
  'Art bleibt erlaubt (Schema), wird aber nicht angeboten');
select ok(not ('art9_health' = any (app.required_consents())), 'art9_health ist keine Pflicht-Einwilligung');
insert into app.consents (user_id, kind, action, document_version) values (tests.m5_id('ben'), 'art9_health', 'granted', '2026-10-03-entwurf');
select tests.act_as(tests.m5_id('ben'));
select ok(exists (select 1 from api.my_consents() where kind = 'art9_health' and granted), 'Früher erteilte art9_health bleibt sichtbar');
select is(api.revoke_consent('art9_health') ->> 'changed', 'true', 'und lässt sich widerrufen');
select ok(not exists (select 1 from api.my_consents() where kind = 'art9_health'), 'Danach nicht mehr angezeigt');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Kontakttausch: Widerruf zieht offene Freigaben zurück, Geteiltes wird nicht mehr angezeigt
-- ---------------------------------------------------------------------------
insert into app.consents (user_id, kind, action, document_version)
select tests.m5_id(n), 'kontakttausch', 'granted', '2026-10-03-m8-entwurf' from unnest(array['anna', 'ben', 'cem', 'emil']) n;
create temp table kt (k text primary key, id uuid);
grant select on kt to public;
insert into kt values ('released', tests.m5_new_evening(tests.m5_id('anna'), tests.m5_id('ben'), array[tests.m5_at(4, '19:00')]));
insert into kt values ('pending', tests.m5_new_evening(tests.m5_id('cem'), tests.m5_id('emil'), array[tests.m5_at(4, '19:30')]));
insert into app.contact_shares (evening_id, user_id, share_email, share_phone, released_at) values
  ((select id from kt where k = 'released'), tests.m5_id('anna'), true, true, now()),
  ((select id from kt where k = 'released'), tests.m5_id('ben'), true, false, now()),
  ((select id from kt where k = 'pending'), tests.m5_id('cem'), true, true, null);
select is(app.contact_share_for((select id from kt where k = 'released'), tests.m5_id('ben')) -> 'counterpart' ->> 'phone',
  '+49 170 1111111', 'Vor dem Widerruf: Ben sieht Annas Telefon');
select tests.act_as(tests.m5_id('cem'));
select is((api.revoke_consent('kontakttausch') ->> 'pending_shares_withdrawn')::int, 1, 'Widerruf zieht die offene Freigabe zurück');
select tests.reset_role();
select is((select count(*)::int from app.contact_shares where user_id = tests.m5_id('cem')), 0, 'Offene Freigabe gelöscht');
select tests.act_as(tests.m5_id('anna'));
select lives_ok($$ select api.revoke_consent('kontakttausch') $$, 'Anna widerruft nach dem Tausch');
select tests.reset_role();
select is((select count(*)::int from app.contact_shares where user_id = tests.m5_id('anna') and released_at is not null), 1,
  'Freigegebene Zeile bleibt (Nachweis, dass getauscht wurde)');
select ok((app.contact_share_for((select id from kt where k = 'released'), tests.m5_id('ben')) -> 'counterpart' ->> 'phone') is null
      and (app.contact_share_for((select id from kt where k = 'released'), tests.m5_id('ben')) -> 'counterpart' ->> 'email') is null,
  'Nach dem Widerruf zeigt die App Annas Kontaktdaten nicht mehr an');
select is(app.contact_share_for((select id from kt where k = 'released'), tests.m5_id('ben')) -> 'counterpart' ->> 'withdrawn', 'true',
  'counterpart.withdrawn = true');
select is(app.contact_share_for((select id from kt where k = 'released'), tests.m5_id('anna')) -> 'counterpart' ->> 'email', 'ben@example.test',
  'Anna sieht Bens Daten weiter (Ben hat nicht widerrufen)');

-- ---------------------------------------------------------------------------
-- Krisennummern: eine Quelle für Viola und den Hilfe-Knopf
-- ---------------------------------------------------------------------------
select ok(not exists (select 1 from ops.app_settings where key = 'safety.crisis_lines'), 'Doppelte Einstellung safety.crisis_lines entfällt');
select is(safety.crisis_lines() -> 'telefonseelsorge', api.help_contacts() -> 'telefonseelsorge' -> 'numbers',
  'Viola und Hilfe-Knopf nennen dieselben Nummern der TelefonSeelsorge');
select is(safety.crisis_lines() ->> 'notruf', api.help_contacts() -> 'emergency' ->> 'number', 'und denselben Notruf');
update ops.app_settings set value = '["0800 999 0 999"]' where key = 'safety.telefonseelsorge_numbers';
select is(safety.crisis_lines() -> 'telefonseelsorge', '["0800 999 0 999"]'::jsonb, 'Änderung wirkt für Viola sofort mit');

select * from finish();
rollback;
