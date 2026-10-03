-- Fermata · Web-App (M2): Einstellungen und Einwilligungstexte (ENTWURF)
-- PLAN 2.3 Nr. 3, 3.2 Nr. 4 und 8, Fragen B1/B2.
-- Grundsatz „immer auf Nummer sicher“: im Zweifel weniger Daten (Straße aus, Orientierung freiwillig).

-- ---------------------------------------------------------------------------
-- Einstellungen der Web-App
-- ---------------------------------------------------------------------------
insert into ops.app_settings (key, value, description, category, is_public) values
  ('account.collect_street', 'false',
   'Frage B1: Straße im Formular abfragen. Empfehlung: false – für die Auswahl reicht die PLZ, Rechnungsanschriften hat Stripe.', 'konto', false),
  ('account.min_age', '18', 'Mindestalter in Jahren (Prüfung mit app.now(), Datum in Europe/Berlin).', 'konto', false),
  ('account.invitation_valid_days', '7',
   'Eine Einladung gilt so viele Tage. Danach wird ein nie benutztes Konto gelöscht (ops.expire_invitations).', 'konto', false),
  ('account.required_consents', '["agb", "datenschutz_kenntnis", "art9_profile"]',
   'Einwilligungen vor dem Formular, in dieser Reihenfolge (art9_profile vor dem Formular, PLAN 3.2 Nr. 4).', 'konto', false),
  ('verification.max_attempts', '3',
   'Höchstens so viele Ausweisprüfungen je Person. Danach prüft Benn von Hand.', 'konto', false),
  ('verification.alternative_enabled', 'false',
   'PLATZHALTER (Frage B2): Alternative ohne Biometrie (z. B. persönliche Prüfung im Lokal) anbieten.', 'konto', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Arten der Rechtstexte: die Einwilligungsarten aus app.consents kommen dazu.
-- Die Liste wird aus dem bestehenden Check und den vorhandenen Zeilen zusammengesetzt,
-- damit Ergänzungen anderer Migrationen erhalten bleiben. Der Name des Checks bleibt gleich.
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_kinds text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c
  where c.conrelid = 'ops.legal_documents'::regclass and c.conname = 'legal_documents_kind_check';

  select array_agg(distinct k order by k) into v_kinds
  from (
    select m[1] as k from regexp_matches(coalesce(v_def, ''), '''([^'']+)''', 'g') as m
    union select d.kind from ops.legal_documents d
    union select unnest(array[
      'agb', 'datenschutz', 'impressum', 'widerruf', 'ki_hinweis',
      'datenschutz_kenntnis', 'art9_profile', 'art9_religion', 'art9_health',
      'biometrie', 'gespraech', 'push', 'kontakttausch'])
  ) s;

  alter table ops.legal_documents drop constraint if exists legal_documents_kind_check;
  execute format('alter table ops.legal_documents add constraint legal_documents_kind_check check (kind = any (%L::text[]))', v_kinds);
end
$$;

-- ---------------------------------------------------------------------------
-- Einwilligungstexte, Fassung 2026-10-03, Status ENTWURF (Prüfung durch den Anwalt in M8).
-- Jede Einwilligung in app.consents verweist auf (kind, version).
-- ---------------------------------------------------------------------------
insert into ops.legal_documents (kind, version, status, title, body_markdown) values
('agb', '2026-10-03-entwurf', 'entwurf', 'Nutzungsbedingungen',
$md$Fermata verabredet Abende zwischen zwei Menschen in Partner-Lokalen. Es gibt kein Wischen, keinen Feed und keinen freien Chat.

## Wer teilnehmen kann

- Sie sind mindestens 18 Jahre alt und haben eine persönliche Einladung.
- Sie zeigen einmal Ihren Ausweis über unseren Prüfdienst. Erst danach schlagen wir Ihnen Abende vor.
- Sie legen nur ein Konto an und machen wahre Angaben.

## Wie wir miteinander umgehen

- Respekt, Freundlichkeit und Ehrlichkeit gelten am Abend und überall in Fermata.
- Übergriffe, Drohungen, Belästigung und Diskriminierung führen zum Ausschluss.
- Sie können jederzeit etwas melden. Wir prüfen jede Meldung, in der Regel innerhalb von 24 Stunden.

## Kosten

Bis einschließlich zu Ihrem ersten Abend ist Fermata kostenlos, ohne Karte. Danach gibt es eine Mitgliedschaft, die Sie bewusst abschließen. Ohne Abschluss entstehen keine Kosten.

## Ende

Sie können Ihr Konto jederzeit in den Einstellungen löschen.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

('datenschutz_kenntnis', '2026-10-03-entwurf', 'entwurf', 'Datenschutzhinweise',
$md$Hier steht kurz, was mit Ihren Daten geschieht. Die vollständige Datenschutzerklärung finden Sie jederzeit unter „Rechtliches“.

## Was wir speichern

- **Konto:** E-Mail-Adresse, Vor- und Nachname, Geburtsdatum, Postleitzahl und Ort, freiwillig eine Telefonnummer.
- **Ort für die Auswahl:** nur der Mittelpunkt Ihrer Postleitzahl, nie Ihre genaue Anschrift.
- **Ausweisprüfung:** nur, ob Sie volljährig sind, Ihr Geburtsjahr und ob Name und Geburtsdatum übereinstimmen. Keine Bilder, keine Ausweisnummer.
- **Einwilligungen:** jede Erteilung und jeder Widerruf mit Datum und Fassung des Textes.

## Wo die Daten liegen

Auf Servern in Frankfurt am Main (EU). Es gibt keine Werbung, keine Analyse-Werkzeuge und keine Cookies außer dem einen, das Sie angemeldet hält.

## Ihre Rechte

Sie können Ihre Daten jederzeit als Datei herunterladen, Einwilligungen widerrufen und Ihr Konto löschen. Fragen beantwortet unsere Datenschutzstelle.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

('art9_profile', '2026-10-03-entwurf', 'entwurf', 'Einwilligung: Geschlecht und gesuchtes Geschlecht',
$md$Damit wir Ihnen ein passendes Gegenüber vorschlagen können, fragen wir nach Ihrem Geschlecht und danach, wen Sie kennenlernen möchten. Freiwillig können Sie auch Ihre Orientierung angeben.

Diese Angaben können Rückschlüsse auf Ihre sexuelle Orientierung zulassen. Sie gehören deshalb zu den besonders geschützten Daten nach Art. 9 DSGVO. Wir verarbeiten sie nur mit Ihrer ausdrücklichen Einwilligung (Art. 9 Abs. 2 lit. a DSGVO).

## So schützen wir diese Angaben

- Sie liegen verschlüsselt in einem eigenen, abgeschotteten Bereich.
- Die Auswahl sieht sie nie im Klartext. Sie erhält nur die Antwort „passt“ oder „passt nicht“.
- Ihr Gegenüber erfährt daraus nichts.

## Widerruf

Sie können diese Einwilligung jederzeit unter „Konto“ widerrufen. Dann löschen wir die Angaben sofort. Ohne diese Angaben können wir Ihnen keine Abende vorschlagen.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

('art9_religion', '2026-10-03-entwurf', 'entwurf', 'Einwilligung: Religion (freiwillig)',
$md$Wenn Ihnen Religion bei einem Gegenüber wichtig ist, können Sie Ihre Religion und deren Bedeutung für Sie angeben. Das ist ganz freiwillig.

Religion gehört zu den besonders geschützten Daten nach Art. 9 DSGVO. Wir verarbeiten sie nur mit dieser ausdrücklichen Einwilligung, verschlüsselt und getrennt von Ihren anderen Angaben. Die Auswahl erhält nur „passt“ oder „passt nicht“.

Sie können die Einwilligung jederzeit widerrufen. Dann löschen wir die Angaben sofort.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

('art9_health', '2026-10-03-entwurf', 'entwurf', 'Einwilligung: Gesundheit (freiwillig)',
$md$Manche Menschen möchten etwas zu ihrer Gesundheit sagen, zum Beispiel, was für einen Abend wichtig ist. Das ist ganz freiwillig.

Gesundheitsdaten gehören zu den besonders geschützten Daten nach Art. 9 DSGVO. Wir verarbeiten sie nur mit dieser ausdrücklichen Einwilligung, verschlüsselt und getrennt. Ihr Gegenüber erfährt nichts davon.

Sie können die Einwilligung jederzeit widerrufen. Dann löschen wir die Angaben sofort.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

('biometrie', '2026-10-03-entwurf', 'entwurf', 'Einwilligung: Ausweisprüfung mit Gesichtsabgleich',
$md$Damit bei Fermata nur echte, volljährige Menschen teilnehmen, prüfen wir einmal Ihren Ausweis. Das übernimmt unser Prüfdienst Didit.

## Ablauf

1. Sie fotografieren Ihren Ausweis und machen ein kurzes Video Ihres Gesichts.
2. Didit vergleicht das Gesicht mit dem Ausweisfoto. Dabei werden biometrische Daten verarbeitet (Art. 9 DSGVO). Das geschieht nur mit Ihrer ausdrücklichen Einwilligung.
3. Wir erhalten nur: volljährig ja oder nein, Ihr Geburtsjahr, ob Name und Geburtsdatum mit Ihren Angaben übereinstimmen, und eine Prüfnummer.
4. Direkt danach lassen wir die Prüfung bei Didit löschen.

## Gut zu wissen

- Didit verarbeitet die Daten laut eigener Auskunft in der EU, hat seinen Sitz aber in den USA. Ein Zugriff von US-Behörden lässt sich deshalb nicht ganz ausschließen.
- Zum Schutz vor Personen, die ausgeschlossen wurden, speichern wir einen nicht umkehrbaren Prüfwert aus Ausweisnummer und Geburtsdatum.
- Sie können die Einwilligung jederzeit widerrufen. Ohne Ausweisprüfung können wir Ihnen keine Abende vorschlagen.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

('gespraech', '2026-10-03-entwurf', 'entwurf', 'Einwilligung: Gespräch mit Viola',
$md$Viola ist eine Stimme mit künstlicher Intelligenz. Im Gespräch fragt sie nach Ihrer Persönlichkeit, Ihren Werten, Wünschen, Lebensumständen und freien Zeiten.

- Ihre Stimme wird live verarbeitet und nirgends gespeichert.
- Der Text des Gesprächs wird nach 30 Tagen gelöscht.
- Aus dem Gespräch entsteht eine Zusammenfassung, die Sie lesen, korrigieren und bestätigen.

Sie können das Gespräch jederzeit beenden und die Einwilligung widerrufen. Dann löschen wir gespeicherte Gesprächstexte sofort.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

('push', '2026-10-03-entwurf', 'entwurf', 'Einwilligung: Mitteilungen auf diesem Gerät',
$md$Wir können Sie mit kurzen Mitteilungen an Fristen und Abende erinnern. Die Mitteilungen laufen über den Dienst Ihres Geräteherstellers (Apple, Google oder Mozilla) und enthalten deshalb keine Namen.

Wichtige Nachrichten schicken wir immer auch per E-Mail. Sie können die Mitteilungen jederzeit abschalten.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

('kontakttausch', '2026-10-03-entwurf', 'entwurf', 'Einwilligung: Kontakt teilen',
$md$Wenn Sie beide nach einem Abend „Ja“ sagen, können Sie Ihre Kontaktdaten teilen. Sie wählen selbst, was Ihr Gegenüber erhält: E-Mail-Adresse, Telefonnummer oder beides.

Ohne beidseitiges „Ja“ geben wir nichts weiter. Für jeden Abend fragen wir Sie erneut.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$),

('ki_hinweis', '2026-10-03-entwurf', 'entwurf', 'Hinweis: künstliche Intelligenz',
$md$Bei Fermata arbeitet künstliche Intelligenz mit (Art. 50 KI-Verordnung):

- **Viola** ist eine KI-Stimme. Sie spricht mit Ihnen, ist aber kein Mensch.
- **Die Auswahl** nutzt ein Sprachmodell, um zu bewerten, wer zusammenpassen könnte. Jeden Vorschlag prüft und gibt ein Mensch frei.
- **Besonders geschützte Angaben** wie Geschlecht oder Religion gehen nie an ein Sprachmodell.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*$md$)
on conflict (kind, version) do nothing;
