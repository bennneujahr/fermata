# Einwilligungstexte

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026 (Härtung) · Fassung in der Datenbank: `2026-10-03-m8-entwurf`.
> Grundlage: `app.consents.kind` (`supabase/migrations/20261003000200_accounts.sql`), Widerrufsfolgen in
> `api.revoke_consent` (`20261003000230_web_onboarding.sql`, ergänzt in `20261003000906_consents_phase1.sql`) und die
> Texte in `ops.legal_documents` (`20261003000210_web_settings_legal.sql`, M2; neue Fassungen in
> `20261003000900_legal_documents.sql`; Warteliste: `20261003000100_waitlist.sql`).
> **Jeder Text zwischen `<!-- db … -->` und `<!-- /db -->` steht wortgleich (in App-Markdown umgewandelt) in der
> Datenbank.** Ein Deno-Test (`supabase/functions/_shared/legal/legal_docs.test.ts`) prüft die Übereinstimmung.
> Die älteren Fassungen `2026-10-03-entwurf` bleiben als Nachweis gespeichert (Status `abgeloest`).

## Grundsätze

- **Eine Einwilligung je Zweck**, jede einzeln erteilt und einzeln widerrufbar (Art. 7 Abs. 2 und 3 DSGVO).
- **Kurz und konkret:** welche Daten, wozu, wer sie bekommt, wie lange, was der Widerruf bewirkt.
- **Art.-9-Einwilligungen** nennen ausdrücklich die besonderen Daten und die Grundlage (Art. 9 Abs. 2 lit. a DSGVO).
- Jede Erteilung und jeder Widerruf wird mit Fassung und Zeitpunkt gespeichert (`app.consents`, nur anhängen).
- **Neue Fassung = neue Versionsnummer.** `api.give_consent` akzeptiert nur die aktuelle Fassung; `api.my_consents`
  zeigt `needs_renewal`, wenn jemand einer älteren Fassung zugestimmt hat. Bei wesentlichen Änderungen muss die App
  neu fragen. Alte Fassungen werden nie geändert oder gelöscht, nur auf `abgeloest` gesetzt.
- **Datensparsam:** Was Fermata in Phase 1 nicht verarbeitet, wird auch nicht abgefragt (deshalb keine Einwilligung
  „Gesundheit“, Abschnitt 4).

## Überblick

| Art (`kind`) | Wann gefragt | Pflicht für Fermata? | Was der Widerruf im Code bewirkt (`api.revoke_consent`) |
|---|---|---|---|
| Warteliste (`ops.legal_documents` Art `einwilligung_warteliste`, nicht in `app.consents`) | Formular der Landingpage | ja, für die Warteliste (Frage A9) | Abmeldung löscht den Eintrag (`api.waitlist_unsubscribe`) |
| `agb` | vor dem Formular | ja (Vertrag, keine Einwilligung im Sinne der DSGVO) | nicht widerrufbar, nur Kontolöschung |
| `datenschutz_kenntnis` | vor dem Formular | ja (Kenntnisnahme, keine Einwilligung) | nicht widerrufbar, nur Kontolöschung |
| `art9_profile` | vor dem Formular | ja (`account.required_consents`) | `sensitive.profile_identity` sofort gelöscht; Kontostatus fällt auf `onboarding` zurück, keine Vorschläge mehr |
| `art9_religion` | freiwillig | nein | Religionsangaben sofort gelöscht |
| `art9_health` | **in Phase 1 nicht angeboten** (`app.consent_kinds_offered()` ohne diese Art; Text auf `abgeloest`) | – | bleibt widerrufbar, falls jemand sie früher erteilt hat: Gesundheitsangaben sofort gelöscht |
| `biometrie` | vor der Ausweisprüfung | ja für die Prüfung | nichts (Prüfung ist dann schon erfolgt, Didit-Sitzung gelöscht) |
| `gespraech` | vor dem ersten Gespräch | ja für Gespräch und Vorschläge | alle Transkripte sofort gelöscht; neue Gespräche gesperrt; keine Vorschläge mehr (Pool-Bedingung) |
| `push` | wenn Mitteilungen eingeschaltet werden | nein | alle Push-Abos sofort gelöscht |
| `kontakttausch` | vor dem ersten „Ja“ zum Kontakttausch | nein | noch nicht freigegebene Freigaben werden gelöscht; bereits freigegebene Kontaktdaten zeigt die App dem Gegenüber nicht mehr an (`app.contact_share_for`), was es schon notiert hat, lässt sich nicht zurückholen |

---

## 1. Warteliste (Landingpage)

**Heute** (`warteliste-2026-10-03-entwurf`, wortgleich in `apps/landing/src/content/form.ts`):

> Ich möchte auf die Warteliste von Fermata. Dafür darf Fermata mir E-Mails schicken: die Bestätigung, meinen Platz
> und Nachrichten zum Start in meiner Region. Ich kann mich jederzeit abmelden; dann wird mein Eintrag gelöscht.
> Einzelheiten stehen in der Datenschutzerklärung.

Text bleibt. Seit der Härtung wird der Eintrag außerdem gelöscht, sobald die Person ihre Einladung in die App
angenommen hat (der Gründungsstatus steht dann im Konto); das steht in der Datenschutzerklärung der Landingpage.

**Offen:** Pflicht-Häkchen (A9, Kopplungsverbot Art. 7 Abs. 4 DSGVO). Falls der Anwalt die Warteliste lieber auf
Art. 6 Abs. 1 lit. b stützt, wird aus dem Häkchen ein Hinweis ohne Häkchen.

**Namensschema der Rechtstexte:** Einwilligungen der App heißen in `ops.legal_documents` genauso wie in
`app.consents` (`art9_profile`, `gespraech`, …). Dazu kommen die Dokumente `impressum`, `datenschutz`, `agb`,
`widerruf`, `ki_hinweis` und die Wartelisten-Einwilligung `einwilligung_warteliste` (eigener Name, weil sie nicht in
`app.consents` liegt und die Landingpage auf ihn verweist). Die ungenutzten Arten aus M0 (`einwilligung_art9`,
`einwilligung_biometrie`, `einwilligung_gespraech`, `einwilligung_push`) sind seit
`20261003000900_legal_documents.sql` nicht mehr erlaubt.

## 2. Geschlecht und gesuchtes Geschlecht (`art9_profile`)

<!-- db kind="art9_profile" version="2026-10-03-m8-entwurf" title="Einwilligung: Geschlecht und gesuchtes Geschlecht" -->
Damit wir Ihnen ein passendes Gegenüber vorschlagen können, fragen wir nach Ihrem Geschlecht und danach, wen Sie
kennenlernen möchten. Freiwillig können Sie Ihre Orientierung angeben. Diese Angaben lassen Rückschlüsse auf Ihre
sexuelle Orientierung zu und sind deshalb besonders geschützt (Art. 9 DSGVO).

Ich willige ausdrücklich ein, dass Fermata diese Angaben verarbeitet, um

1. automatisch zu prüfen, ob eine andere Person und ich gegenseitig zu dem passen, was wir suchen (Ergebnis nur
   „passt“ oder „passt nicht“), und
2. in Summen zu zählen, wie viele Menschen je Geschlecht einen Vorschlag erhalten (Gruppen unter 5 Personen werden
   nicht ausgewiesen), um Benachteiligungen zu erkennen.

Die Angaben liegen verschlüsselt in Frankfurt am Main. Das Sprachmodell und Fermata-Mitarbeitende sehen sie nicht.
Ihr Gegenüber erfährt Ihre Angaben nicht. Aus einem Vorschlag kann es aber schließen, dass Sie Menschen wie ihn oder
sie kennenlernen möchten.

Ich kann diese Einwilligung jederzeit unter „Konto → Einwilligungen“ widerrufen. Dann löscht Fermata die Angaben
sofort; ohne sie sind keine Vorschläge möglich. (Art. 9 Abs. 2 lit. a, Art. 6 Abs. 1 lit. a DSGVO)

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*
<!-- /db -->

**Unterschiede zur Fassung `2026-10-03-entwurf` (M2):**
- neu: Zweck **Fairness-Zählung** (der Code tut das: `sensitive.match_run_fairness`, `20261003000410_matcher.sql`);
- neu: ehrlicher Satz zur **Schlussfolgerung des Gegenübers** – „Ihr Gegenüber erfährt daraus nichts“ (M2) war zu
  weit;
- neu: „Fermata-Mitarbeitende sehen sie nicht“ (stimmt: keine Admin-Funktion zeigt Art.-9-Angaben);
- Widerruf und Folgen wie bisher.

## 3. Religion (`art9_religion`)

<!-- db kind="art9_religion" version="2026-10-03-m8-entwurf" title="Einwilligung: Religion (freiwillig)" -->
Wenn Ihnen Religion bei einem Gegenüber wichtig ist, können Sie Ihre Religion, ihre Bedeutung für Sie und den Wunsch
„nur jemand mit gleicher Religion“ angeben. Das ist ganz freiwillig. Religion ist besonders geschützt (Art. 9 DSGVO).

Ich willige ausdrücklich ein, dass Fermata diese Angaben verschlüsselt speichert und automatisch prüft, ob eine
andere Person und ich in diesem Punkt zusammenpassen. Die Prüfung wirkt nur, wenn eine von uns beiden „gleiche
Religion“ verlangt; das Ergebnis ist nur „passt“ oder „passt nicht“. Das Sprachmodell und Fermata-Mitarbeitende sehen
die Angaben nicht.

Ich kann die Einwilligung jederzeit widerrufen. Dann löscht Fermata die Angaben sofort. (Art. 9 Abs. 2 lit. a DSGVO)

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*
<!-- /db -->

**Unterschiede:** inhaltlich gleich; ergänzt, dass die Prüfung nur bei „gleiche Religion“ wirkt
(`sensitive.religion_compatible`) und dass niemand bei Fermata die Angabe sieht.

## 4. Gesundheit (`art9_health`) – in Phase 1 nicht angeboten

**Entscheidung (Härtung, datensparsam, PLATZHALTER C10):** Fermata speichert keine Gesundheitsangaben (es gibt
keine Eingabe; `health_notes_enc` wird nur gelöscht und exportiert), und Viola fragt nie danach. Deshalb wird diese
Einwilligung in Phase 1 **nicht angeboten**:

- `app.consent_kinds_offered()` enthält `art9_health` nicht; `api.give_consent('art9_health', …)` lehnt mit
  `not_offered` ab; `api.my_consents()` zeigt die Art nur, wenn jemand sie früher erteilt hat (damit sie widerrufbar
  bleibt).
- Der Text `art9_health` / `2026-10-03-entwurf` steht auf `abgeloest` (bleibt als Nachweis).
- Die Art bleibt in `app.consents.kind` erlaubt, damit sie später ohne Schemaänderung zurückkommen kann.

Falls Benn sie später braucht (zum Beispiel für Barrierefreiheit – das lässt sich aber auch ohne Gesundheitsdaten
als „Ich brauche einen stufenlosen Zugang“ abfragen), wäre ein Entwurf:

> **Einwilligung: Gesundheit (freiwillig)**
>
> Sie können uns etwas zu Ihrer Gesundheit mitteilen, das für einen Abend wichtig ist [[konkreter Zweck]].
> Gesundheitsdaten sind besonders geschützt (Art. 9 DSGVO). Ich willige ausdrücklich ein, dass Fermata diese Angabe
> verschlüsselt speichert und nur für [[Zweck]] nutzt. Mein Gegenüber und das Sprachmodell erfahren nichts davon.
> Ich kann die Einwilligung jederzeit widerrufen; dann löscht Fermata die Angabe sofort.

## 5. Ausweisprüfung mit Gesichtsabgleich (`biometrie`)

<!-- db kind="biometrie" version="2026-10-03-m8-entwurf" title="Einwilligung: Ausweisprüfung mit Gesichtsabgleich" -->
Damit bei Fermata nur echte, volljährige Menschen teilnehmen, prüfen wir einmal Ihren Ausweis über den Dienst
Didit [[Firma, Sitz]]. Sie fotografieren Ihren Ausweis und nehmen ein kurzes Video Ihres Gesichts auf; Didit
vergleicht Ihr Gesicht mit dem Ausweisfoto.

Ich willige ausdrücklich ein, dass Didit dafür meine biometrischen Daten verarbeitet (Art. 9 Abs. 2 lit. a DSGVO).

- Fermata erhält und speichert nur: volljährig ja oder nein, mein Geburtsjahr, ob Name und Geburtsdatum mit meinen
  Angaben übereinstimmen, die Prüfnummer. Keine Bilder, keine Ausweisnummer.
- Aus Ausweisnummer und Geburtsdatum sowie aus Name und Geburtsdatum bildet Fermata nicht umkehrbare Prüfwerte, um
  ausgeschlossene Personen zu erkennen.
- Direkt nach dem Ergebnis lässt Fermata die Prüfung bei Didit löschen; spätestens nach einem Monat löscht Didit sie
  von selbst.
- Didit verarbeitet die Daten laut eigener Auskunft in der EU, hat seinen Sitz aber in den USA. Ein Zugriff von
  US-Behörden lässt sich nicht ganz ausschließen.

Ich kann die Einwilligung jederzeit widerrufen. Eine bereits abgeschlossene Prüfung bleibt gültig, weil Didit die
Daten dann schon gelöscht hat. Ohne Ausweisprüfung kann Fermata mir keine Abende vorschlagen.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*
<!-- /db -->

**Unterschiede:** ergänzt die **1-Monats-Sicherung** bei Didit, die Prüfwerte aus **Name + Geburtsdatum** (M2 nannte
nur die Ausweisnummer, der Code bildet beide: `app.verification_record_hashes`) und was ein **Widerruf nach der
Prüfung** bedeutet (der Code tut dann nichts). [[Frage B2: Alternative ohne Biometrie nennen, sobald entschieden.]]

## 6. Gespräch mit Viola (`gespraech`)

<!-- db kind="gespraech" version="2026-10-03-m8-entwurf" title="Einwilligung: Gespräch mit Viola" -->
Viola ist eine künstliche Intelligenz, kein Mensch. Im Gespräch fragt sie nach Ihrer Persönlichkeit, Ihren Werten,
Wünschen an ein Gegenüber, Lebensumständen, Fahrbereitschaft und freien Zeiten. Sie können sprechen oder schreiben.

Ich willige ein, dass Fermata dafür

- meine Stimme **live** verarbeiten lässt: Spracherkennung durch Deepgram (Server in der EU), Antworten durch das
  Sprachmodell Claude von Anthropic über Amazon Bedrock in der EU (das EU-Profil kann auch Rechenzentren in London und
  Zürich nutzen; für beide Länder gibt es einen Angemessenheitsbeschluss der EU-Kommission), Stimme von Viola durch
  Amazon Polly in Frankfurt. **Fermata zeichnet meine Stimme nicht auf.**
- den **Text des Gesprächs 30 Tage** speichert und dann löscht,
- aus dem Gespräch mit demselben Sprachmodell eine **Zusammenfassung und ein Profil** erstellt, die ich bestätige oder
  korrigiere,
- das Gespräch **automatisch** auf Hinweise zu einer Krise, Minderjährigkeit, Gewalt oder Belästigung prüft und
  Fermata dann ohne Zitat benachrichtigt. Den Gesprächstext liest ein Mensch bei Fermata nur in einem solchen
  Sicherheitsfall; jede Einsicht wird mit Grund protokolliert.

Viola fragt nicht nach Gesundheit, Religion, Herkunft, Sexualität oder anderen besonders geschützten Themen.
**Erzähle ich davon von selbst, willige ich ausdrücklich ein (Art. 9 Abs. 2 lit. a DSGVO), dass dies während des
Gesprächs wie alles Gesagte verarbeitet wird.** Gespeichert wird es nicht: Fermata filtert solche Sätze vor dem
Speichern aus dem Gesprächstext, aus der Zusammenfassung und aus dem Profil. Ausnahme: Sätze, die auf eine Gefahr
hinweisen, bleiben im Text, damit Fermata helfen kann; auch sie werden nach 30 Tagen gelöscht.

Mein Gegenüber sieht aus dem Gespräch nur den kurzen Text „Warum Sie beide“, den ein Mensch vor dem Vorschlag prüft.
Den Gesprächstext und meine Zusammenfassung sieht es nie.

Ich kann das Gespräch jederzeit beenden und die Einwilligung jederzeit widerrufen. Dann löscht Fermata alle
gespeicherten Gesprächstexte sofort; ohne Gespräch sind keine neuen Vorschläge möglich. (Art. 6 Abs. 1 lit. a,
Art. 9 Abs. 2 lit. a DSGVO)

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*
<!-- /db -->

**Unterschiede zur Fassung `2026-10-03-entwurf` (M2):**
- neu: die **Anbieter** und Orte (Deepgram EU, Bedrock-EU-Profil mit London/Zürich und Angemessenheitsbeschluss,
  Polly Frankfurt), die **Auswertung durch ein Sprachmodell**, die **automatische Sicherheitsprüfung** samt
  menschlicher Einsicht nur im Sicherheitsfall (`api.admin_safety_transcript`, mit Grund im Audit), die
  **Art.-9-Klausel** für ungefragt Erzähltes und die Ausnahme bei Gefahrhinweisen;
- neu: was das **Gegenüber** aus dem Gespräch erfährt (nur „Warum Sie beide“, geprüft);
- „Der Text des Gesprächs wird nach 30 Tagen gelöscht“ bleibt richtig (`interview.transcript_retention_days`); wenn
  Benn B5 anders entscheidet (längere Aufbewahrung bei Sicherheitsfällen), muss der Satz angepasst werden;
- offen: ob beim Widerruf auch das **bestätigte Profil** gelöscht werden soll (heute nicht).

## 7. Mitteilungen (`push`)

<!-- db kind="push" version="2026-10-03-m8-entwurf" title="Einwilligung: Mitteilungen auf diesem Gerät" -->
Wir erinnern Sie mit kurzen Mitteilungen an Fristen und Abende. Dafür speichern wir die Adresse, die Ihr Browser für
Mitteilungen erzeugt. Die Mitteilungen laufen verschlüsselt über den Dienst Ihres Geräte- oder Browserherstellers
(Apple, Google oder Mozilla, Sitz USA) und enthalten keine Namen. Zwischen 22 und 8 Uhr schicken wir keine
Mitteilungen außer zur Sicherheit. Wichtige Nachrichten kommen immer auch per E-Mail.

Sie können die Mitteilungen jederzeit abschalten oder die Einwilligung widerrufen; dann löschen wir alle gespeicherten
Adressen für Mitteilungen sofort. (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG)

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*
<!-- /db -->

**Unterschiede:** ergänzt die gespeicherte Abo-Adresse, Sitz USA der Push-Dienste, Ruhezeiten
(`notify.quiet_hours`), § 25 TDDDG und die Folge des Widerrufs (Code löscht alle Abos).

## 8. Kontakt teilen (`kontakttausch`)

<!-- db kind="kontakttausch" version="2026-10-03-m8-entwurf" title="Einwilligung: Kontakt teilen" -->
Wenn Sie und Ihr Gegenüber nach einem Abend beide „Ja“ sagen, können Sie Kontaktdaten teilen. Für jeden Abend
entscheiden Sie neu und wählen, was Ihr Gegenüber erhält: E-Mail-Adresse, Telefonnummer oder beides. Die Daten
erscheinen nur in der App, nie in einer E-Mail. Ohne beidseitiges „Ja“ geben wir nichts weiter, und ein „Nein“ sieht
niemand.

Sie können die Einwilligung jederzeit widerrufen. Dann ziehen wir alle Freigaben zurück, die noch auf das „Ja“ Ihres
Gegenübers warten, und die App zeigt Ihre Kontaktdaten niemandem mehr an. **Was Ihr Gegenüber bereits erhalten hat,
können wir nicht zurückholen** – es kann sich die Daten schon notiert haben. (Art. 6 Abs. 1 lit. a DSGVO)

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*
<!-- /db -->

**Code (Härtung, `20261003000906_consents_phase1.sql`):** Der Widerruf löscht die eigenen, noch nicht freigegebenen
Zeilen in `app.contact_shares`. Bei bereits freigegebenen zeigt `app.contact_share_for` dem Gegenüber keine E-Mail und
keine Telefonnummer mehr (`counterpart.withdrawn = true`). Hinweis: Die App zeigt bei einer Freigabe immer die
**aktuelle** E-Mail bzw. Telefonnummer (live aus `auth.users` und `private.account_facts`), keinen festen Stand.

## 9. Nutzungsbedingungen und Datenschutzhinweise (`agb`, `datenschutz_kenntnis`)

Keine Einwilligungen im Sinne der DSGVO; sie werden aber versioniert gespeichert.

- `agb`: Die volle Fassung aus [agb.md](agb.md) steht seit der Härtung als `2026-10-03-entwurf` in der Datenbank;
  die frühere Kurzfassung (M2) heißt jetzt `2026-10-03-m2` und ist `abgeloest`.
- `datenschutz_kenntnis`: Der M2-Kurztext („keine Cookies außer dem einen“, „Server in Frankfurt“) war ungenau. Neue
  Fassung:

<!-- db kind="datenschutz_kenntnis" version="2026-10-03-m8-entwurf" title="Datenschutzhinweise" -->
Hier steht kurz, was mit Ihren Daten geschieht. Die vollständige Datenschutzerklärung finden Sie jederzeit unter
„Rechtliches“.

## Was wir speichern

- **Konto:** E-Mail-Adresse, Vor- und Nachname, Geburtsdatum, Postleitzahl und Ort, freiwillig eine Telefonnummer.
- **Ort für die Auswahl:** nur der Mittelpunkt Ihrer Postleitzahl, nie Ihre genaue Anschrift.
- **Ausweisprüfung:** über den Dienst Didit. Wir speichern nur, ob Sie volljährig sind, Ihr Geburtsjahr und ob Name
  und Geburtsdatum übereinstimmen. Keine Bilder, keine Ausweisnummer.
- **Gespräch mit Viola:** Viola ist eine künstliche Intelligenz. Ihre Stimme wird nicht aufgezeichnet; der Text des
  Gesprächs wird nach 30 Tagen gelöscht. Einzelheiten stehen in der Einwilligung „Gespräch mit Viola“ und im Hinweis
  zur künstlichen Intelligenz.
- **Auswahl:** Ein Programm mit einem Sprachmodell bewertet, wer zusammenpassen könnte. Jeden Vorschlag prüft ein
  Mensch.
- **Einwilligungen:** jede Erteilung und jeder Widerruf mit Datum und Fassung des Textes.

## Wo die Daten liegen

Die Datenbank liegt in Frankfurt am Main (EU). Einige Dienste haben ihren Sitz in den USA. Das Sprachmodell kann
über ein EU-Profil auch in London oder Zürich rechnen; für beide Länder gibt es einen Angemessenheitsbeschluss der
EU-Kommission. Es gibt keine Werbung und keine Analyse-Werkzeuge. In Ihrem Browser speichern wir nur, was die App
braucht: das Anmelde-Cookie, Ihr Farbschema und, wenn Sie es wünschen, ein Abo für Mitteilungen.

## Ihre Rechte

Sie können Ihre Daten jederzeit als Datei herunterladen, Einwilligungen widerrufen und Ihr Konto löschen. Fragen
beantwortet unsere Datenschutzstelle [[Kontakt]].

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*
<!-- /db -->

- `ki_hinweis`: siehe [ki-hinweis.md](ki-hinweis.md) – die M2-Fassung („Besonders geschützte Angaben wie Geschlecht
  oder Religion gehen nie an ein Sprachmodell“) stimmte für die Formularangaben, aber nicht für ungefragt im Gespräch
  Erzähltes; sie ist durch eine richtige Fassung ersetzt.

## Offene Punkte für Benn/Anwalt

1. Pflicht-Häkchen der Warteliste (A9).
2. `art9_health`: in Phase 1 nicht angeboten (C10). Später nur mit klarem Zweck und Eingabe.
3. `gespraech`: Art.-9-Klausel, Anbieter, Sicherheitsprüfung sind drin; Bedrock-Weg (EU-Profil oder nur Frankfurt)
   festlegen und den Satz zu London/Zürich dann anpassen.
4. `kontakttausch`: Folge des Widerrufs ist gebaut (Freigaben zurückziehen, Anzeige beenden). Bestätigen, ob die App
   statt der aktuellen Daten einen festen Stand zum Zeitpunkt des Tauschs zeigen soll.
5. `art9_profile`: Fairness-Zählung als Zweck aufgenommen – bestätigen.
6. Nach Freigabe: neue Fassungen in `ops.legal_documents` mit neuer Version anlegen (die alte auf `abgeloest`), damit
   `api.my_consents` die Erneuerung anzeigt; diese Datei mitziehen (der Deno-Test erzwingt das).
7. Ob die Nachweise (`app.consents`) nach der Kontolöschung für die Dauer möglicher Ansprüche aufbewahrt werden sollen
   (heute gelöscht).
