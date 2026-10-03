# Einwilligungstexte

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026 · Vorgeschlagene Fassung `2026-10-03-m8-entwurf`.
> Grundlage: `app.consents.kind` (`supabase/migrations/20261003000200_accounts.sql`), Widerrufsfolgen in
> `api.revoke_consent` und die heute gespeicherten Texte in `ops.legal_documents`
> (`20261003000210_web_settings_legal.sql`, M2; Warteliste:
> `20261003000100_waitlist.sql`).

## Grundsätze

- **Eine Einwilligung je Zweck**, jede einzeln erteilt und einzeln widerrufbar (Art. 7 Abs. 2 und 3 DSGVO).
- **Kurz und konkret:** welche Daten, wozu, wer sie bekommt, wie lange, was der Widerruf bewirkt.
- **Art.-9-Einwilligungen** nennen ausdrücklich die besonderen Daten und die Grundlage (Art. 9 Abs. 2 lit. a DSGVO).
- Jede Erteilung und jeder Widerruf wird mit Fassung und Zeitpunkt gespeichert (`app.consents`, nur anhängen).
- **Neue Fassung = neue Versionsnummer.** `api.give_consent` akzeptiert nur die aktuelle Fassung; `api.my_consents`
  zeigt `needs_renewal`, wenn jemand einer älteren Fassung zugestimmt hat. Bei wesentlichen Änderungen muss die App
  neu fragen.

## Überblick

| Art (`kind`) | Wann gefragt | Pflicht für Fermata? | Was der Widerruf im Code bewirkt (`api.revoke_consent`, M2) |
|---|---|---|---|
| Warteliste (`ops.legal_documents` Art `einwilligung_warteliste`, nicht in `app.consents`) | Formular der Landingpage | ja, für die Warteliste (Frage A9) | Abmeldung löscht den Eintrag (`api.waitlist_unsubscribe`) |
| `agb` | vor dem Formular | ja (Vertrag, keine Einwilligung im Sinne der DSGVO) | nicht widerrufbar, nur Kontolöschung |
| `datenschutz_kenntnis` | vor dem Formular | ja (Kenntnisnahme, keine Einwilligung) | nicht widerrufbar, nur Kontolöschung |
| `art9_profile` | vor dem Formular | ja (`account.required_consents`) | `sensitive.profile_identity` sofort gelöscht; Kontostatus fällt auf `onboarding` zurück, keine Vorschläge mehr |
| `art9_religion` | freiwillig | nein | Religionsangaben sofort gelöscht |
| `art9_health` | freiwillig | nein | Gesundheitsangaben sofort gelöscht – **es gibt aber keine Eingabe dafür** |
| `biometrie` | vor der Ausweisprüfung | ja für die Prüfung | nichts (Prüfung ist dann schon erfolgt, Didit-Sitzung gelöscht) |
| `gespraech` | vor dem ersten Gespräch | ja für Gespräch und Vorschläge | alle Transkripte sofort gelöscht; neue Gespräche gesperrt; keine Vorschläge mehr (Pool-Bedingung) |
| `push` | wenn Mitteilungen eingeschaltet werden | nein | alle Push-Abos sofort gelöscht |
| `kontakttausch` | vor dem ersten „Ja“ zum Kontakttausch | nein | nichts; bereits getauschte Kontakte bleiben sichtbar |

---

## 1. Warteliste (Landingpage)

**Heute** (`warteliste-2026-10-03-entwurf`, wortgleich in `apps/landing/src/content/form.ts`):

> Ich möchte auf die Warteliste von Fermata. Dafür darf Fermata mir E-Mails schicken: die Bestätigung, meinen Platz
> und Nachrichten zum Start in meiner Region. Ich kann mich jederzeit abmelden; dann wird mein Eintrag gelöscht.
> Einzelheiten stehen in der Datenschutzerklärung.

**Vorschlag M8:** Text so lassen. Er ist kurz, nennt Zweck, Kanal und Widerruf.

**Offen:** Pflicht-Häkchen (A9, Kopplungsverbot Art. 7 Abs. 4 DSGVO). Falls der Anwalt die Warteliste lieber auf
Art. 6 Abs. 1 lit. b stützt, wird aus dem Häkchen ein Hinweis ohne Häkchen.

## 2. Geschlecht und gesuchtes Geschlecht (`art9_profile`)

**Vorschlag M8:**

> **Einwilligung: Geschlecht und gesuchtes Geschlecht**
>
> Damit wir Ihnen ein passendes Gegenüber vorschlagen können, fragen wir nach Ihrem Geschlecht und danach, wen Sie
> kennenlernen möchten. Freiwillig können Sie Ihre Orientierung angeben. Diese Angaben lassen Rückschlüsse auf Ihre
> sexuelle Orientierung zu und sind deshalb besonders geschützt (Art. 9 DSGVO).
>
> Ich willige ausdrücklich ein, dass Fermata diese Angaben verarbeitet, um
> 1. automatisch zu prüfen, ob eine andere Person und ich gegenseitig zu dem passen, was wir suchen
>    (Ergebnis nur „passt“ oder „passt nicht“), und
> 2. in Summen zu zählen, wie viele Menschen je Geschlecht einen Vorschlag erhalten (Gruppen unter 5 Personen werden
>    nicht ausgewiesen), um Benachteiligungen zu erkennen.
>
> Die Angaben liegen verschlüsselt in Frankfurt am Main. Das Sprachmodell und Fermata-Mitarbeitende sehen sie nicht.
> Ihr Gegenüber erfährt Ihre Angaben nicht; aus einem Vorschlag kann es aber schließen, dass Sie Menschen wie ihn
> oder sie kennenlernen möchten.
>
> Ich kann diese Einwilligung jederzeit unter „Konto → Einwilligungen“ widerrufen. Dann löscht Fermata die Angaben
> sofort; ohne sie sind keine Vorschläge möglich. (Art. 9 Abs. 2 lit. a, Art. 6 Abs. 1 lit. a DSGVO)

**Unterschiede zur heutigen Fassung (M2):**
- neu: Zweck **Fairness-Zählung** (der Code tut das: `sensitive.match_run_fairness`, `20261003000410_matcher.sql`);
- neu: ehrlicher Satz zur **Schlussfolgerung des Gegenübers** – „Ihr Gegenüber erfährt daraus nichts“ (heute) ist zu
  weit;
- neu: „Fermata-Mitarbeitende sehen sie nicht“ (stimmt: keine Admin-Funktion zeigt Art.-9-Angaben);
- Widerruf und Folgen wie heute.

## 3. Religion (`art9_religion`)

**Vorschlag M8:**

> **Einwilligung: Religion (freiwillig)**
>
> Wenn Ihnen Religion bei einem Gegenüber wichtig ist, können Sie Ihre Religion, ihre Bedeutung für Sie und den
> Wunsch „nur jemand mit gleicher Religion“ angeben. Religion ist besonders geschützt (Art. 9 DSGVO).
>
> Ich willige ausdrücklich ein, dass Fermata diese Angaben verschlüsselt speichert und automatisch prüft, ob eine
> andere Person und ich in diesem Punkt zusammenpassen. Die Prüfung wirkt nur, wenn eine von uns beiden „gleiche
> Religion“ verlangt; das Ergebnis ist nur „passt“ oder „passt nicht“. Das Sprachmodell und Fermata-Mitarbeitende
> sehen die Angaben nicht.
>
> Ich kann die Einwilligung jederzeit widerrufen. Dann löscht Fermata die Angaben sofort.

**Unterschiede:** inhaltlich gleich; ergänzt, dass die Prüfung nur bei „gleiche Religion“ wirkt
(`sensitive.religion_compatible`) und dass niemand bei Fermata die Angabe sieht.

## 4. Gesundheit (`art9_health`)

**Heute:** Text vorhanden, aber **keine Funktion zum Speichern** (Spalte `health_notes_enc` wird nur gelöscht und
exportiert). Viola fragt nie nach Gesundheit.

**Vorschlag M8:** Diese Einwilligung **aus der App entfernen** (nicht anzeigen, Art aus `app.consent_kinds()` und
`ops.legal_documents` nehmen), bis es einen klaren Zweck gibt (zum Beispiel Barrierefreiheit des Lokals – das lässt
sich auch ohne Gesundheitsdaten als „Ich brauche einen stufenlosen Zugang“ abfragen). Falls Benn sie behalten will:

> **Einwilligung: Gesundheit (freiwillig)**
>
> Sie können uns etwas zu Ihrer Gesundheit mitteilen, das für einen Abend wichtig ist [[konkreter Zweck]].
> Gesundheitsdaten sind besonders geschützt (Art. 9 DSGVO). Ich willige ausdrücklich ein, dass Fermata diese Angabe
> verschlüsselt speichert und nur für [[Zweck]] nutzt. Mein Gegenüber und das Sprachmodell erfahren nichts davon.
> Ich kann die Einwilligung jederzeit widerrufen; dann löscht Fermata die Angabe sofort.

## 5. Ausweisprüfung mit Gesichtsabgleich (`biometrie`)

**Vorschlag M8:**

> **Einwilligung: Ausweisprüfung mit Gesichtsabgleich**
>
> Damit bei Fermata nur echte, volljährige Menschen teilnehmen, prüfen wir einmal Ihren Ausweis über den Dienst
> Didit [[Firma, Sitz]]. Sie fotografieren Ihren Ausweis und nehmen ein kurzes Video Ihres Gesichts auf; Didit
> vergleicht Ihr Gesicht mit dem Ausweisfoto.
>
> Ich willige ausdrücklich ein, dass Didit dafür meine biometrischen Daten verarbeitet (Art. 9 Abs. 2 lit. a DSGVO).
>
> - Fermata erhält und speichert nur: volljährig ja oder nein, mein Geburtsjahr, ob Name und Geburtsdatum mit meinen
>   Angaben übereinstimmen, die Prüfnummer. Keine Bilder, keine Ausweisnummer.
> - Aus Ausweisnummer und Geburtsdatum sowie aus Name und Geburtsdatum bildet Fermata nicht umkehrbare Prüfwerte, um
>   ausgeschlossene Personen zu erkennen.
> - Direkt nach dem Ergebnis lässt Fermata die Prüfung bei Didit löschen; spätestens nach einem Monat löscht Didit sie
>   von selbst.
> - Didit verarbeitet die Daten laut eigener Auskunft in der EU, hat seinen Sitz aber in den USA. Ein Zugriff von
>   US-Behörden lässt sich nicht ganz ausschließen.
>
> Ich kann die Einwilligung jederzeit widerrufen. Eine bereits abgeschlossene Prüfung bleibt gültig, weil Didit die
> Daten dann schon gelöscht hat. Ohne Ausweisprüfung kann Fermata mir keine Abende vorschlagen.

**Unterschiede:** ergänzt die **1-Monats-Sicherung** bei Didit, die Prüfwerte aus **Name + Geburtsdatum** (heute nur
Ausweisnummer genannt, der Code bildet beide: `app.verification_record_hashes`) und was ein **Widerruf nach der
Prüfung** bedeutet (der Code tut dann nichts). [[Frage B2: Alternative ohne Biometrie nennen, sobald entschieden.]]

## 6. Gespräch mit Viola (`gespraech`)

**Vorschlag M8:**

> **Einwilligung: Gespräch mit Viola**
>
> Viola ist eine künstliche Intelligenz, kein Mensch. Im Gespräch fragt sie nach Ihrer Persönlichkeit, Ihren Werten,
> Wünschen an ein Gegenüber, Lebensumständen, Fahrbereitschaft und freien Zeiten. Sie können sprechen oder schreiben.
>
> Ich willige ein, dass Fermata dafür
> - meine Stimme **live** verarbeitet: Spracherkennung durch Deepgram (Server in der EU), Antworten durch das
>   Sprachmodell Claude von Anthropic über Amazon Bedrock [[EU, einschließlich London und Zürich – oder nur
>   Frankfurt]], Stimme von Viola durch Amazon Polly in Frankfurt. **Die Stimme wird nirgends gespeichert.**
> - den **Text des Gesprächs 30 Tage** speichert und dann löscht,
> - aus dem Gespräch mit demselben Sprachmodell eine **Zusammenfassung und ein Profil** erstellt, die ich bestätige
>   oder korrigiere,
> - das Gespräch automatisch auf Hinweise zu einer Krise, Minderjährigkeit, Gewalt oder Belästigung prüft und Fermata
>   dann ohne Zitat benachrichtigt.
>
> Viola fragt nicht nach Gesundheit, Religion, Herkunft, Sexualität oder anderen besonders geschützten Themen.
> **Erzähle ich davon von selbst, willige ich ausdrücklich ein (Art. 9 Abs. 2 lit. a DSGVO), dass dies während des
> Gesprächs wie alles Gesagte verarbeitet wird.** Gespeichert wird es nicht: Fermata entfernt solche Sätze aus dem
> gespeicherten Text, aus der Zusammenfassung und aus dem Profil. Ausnahme: Sätze, die auf eine Gefahr hinweisen,
> bleiben im Text, damit Fermata helfen kann, und werden ebenfalls nach 30 Tagen gelöscht.
>
> Ich kann das Gespräch jederzeit beenden und die Einwilligung jederzeit widerrufen. Dann löscht Fermata alle
> gespeicherten Gesprächstexte sofort; ohne Gespräch sind keine neuen Vorschläge möglich.

**Unterschiede zur heutigen Fassung (M2):**
- heute fehlen: die **Anbieter** und Orte, die **Auswertung durch ein Sprachmodell**, die **automatische
  Sicherheitsprüfung**, die **Art.-9-Klausel** für ungefragt Erzähltes und die Ausnahme bei Gefahrhinweisen;
- heute steht „Der Text des Gesprächs wird nach 30 Tagen gelöscht“ – richtig (`interview.transcript_retention_days`);
  wenn Benn B5 anders entscheidet (längere Aufbewahrung bei Sicherheitsfällen), muss der Satz angepasst werden;
- offen: ob beim Widerruf auch das **bestätigte Profil** gelöscht werden soll (heute nicht).

## 7. Mitteilungen (`push`)

**Vorschlag M8:**

> **Einwilligung: Mitteilungen auf diesem Gerät**
>
> Wir erinnern Sie mit kurzen Mitteilungen an Fristen und Abende. Dafür speichern wir die Adresse, die Ihr Browser
> für Mitteilungen erzeugt. Die Mitteilungen laufen verschlüsselt über den Dienst Ihres Geräte- oder
> Browserherstellers (Apple, Google oder Mozilla, Sitz USA) und enthalten keine Namen. Zwischen 22 und 8 Uhr schicken
> wir keine Mitteilungen außer zur Sicherheit. Wichtige Nachrichten kommen immer auch per E-Mail.
>
> Sie können die Mitteilungen jederzeit abschalten oder die Einwilligung widerrufen; dann löschen wir alle
> gespeicherten Adressen für Mitteilungen sofort. (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG)

**Unterschiede:** ergänzt die gespeicherte Abo-Adresse, Sitz USA der Push-Dienste, Ruhezeiten
(`notify.quiet_hours`), § 25 TDDDG und die Folge des Widerrufs (Code löscht alle Abos).

## 8. Kontakt teilen (`kontakttausch`)

**Vorschlag M8:**

> **Einwilligung: Kontakt teilen**
>
> Wenn Sie und Ihr Gegenüber nach einem Abend beide „Ja“ sagen, können Sie Kontaktdaten teilen. Für jeden Abend
> entscheiden Sie neu und wählen, was Ihr Gegenüber erhält: E-Mail-Adresse, Telefonnummer oder beides. Die Daten
> erscheinen nur in der App, nie in einer E-Mail. Ohne beidseitiges „Ja“ geben wir nichts weiter, und ein „Nein“
> sieht niemand.
>
> Sie können die Einwilligung jederzeit widerrufen. Bereits geteilte Kontaktdaten [[bleiben für Ihr Gegenüber
> sichtbar / werden ausgeblendet – Entscheidung Benn]]. (Art. 6 Abs. 1 lit. a DSGVO)

**Unterschiede:** ergänzt „nur in der App“ (`api.my_contact_share`, Mails enthalten keine Kontaktdaten) und die
Folge des Widerrufs. **Code-Lücke:** Der Widerruf ändert heute nichts an bereits freigegebenen Kontakten; gezeigt wird
außerdem immer die **aktuelle** E-Mail bzw. Telefonnummer des Gegenübers (live aus `auth.users` und
`private.account_facts`), nicht ein Stand zum Zeitpunkt des Tauschs.

## 9. Nutzungsbedingungen und Datenschutzhinweise (`agb`, `datenschutz_kenntnis`)

Keine Einwilligungen im Sinne der DSGVO; sie werden aber versioniert gespeichert.

**Unterschiede der heutigen Kurztexte (M2) zum Code:**
- `datenschutz_kenntnis`: „keine Cookies außer dem einen, das Sie angemeldet hält“ – zusätzlich speichert die Web-App
  das Farbschema im Local Storage und registriert einen Service Worker; „Server in Frankfurt“ – das Sprachmodell
  (EU-Geo-Profil) und Anbieter mit US-Sitz fehlen; Viola, Auswahl mit Sprachmodell und Ausweisprüfung bei Didit
  werden nicht erwähnt. Vorschlag: Kurztext um je einen Satz zu Viola/KI, Auswahl und Didit ergänzen und auf die volle
  [Datenschutzerklärung](datenschutzerklaerung-app.md) verweisen.
- `agb`: Kurzfassung; wird durch [agb.md](agb.md) ersetzt.
- `ki_hinweis`: siehe [ki-hinweis.md](ki-hinweis.md) – der heutige Satz „Besonders geschützte Angaben wie Geschlecht
  oder Religion gehen nie an ein Sprachmodell“ stimmt für die Formularangaben, aber nicht für ungefragt im Gespräch
  Erzähltes.

## Offene Punkte für Benn/Anwalt

1. Pflicht-Häkchen der Warteliste (A9).
2. `art9_health` entfernen oder Zweck und Eingabe festlegen.
3. `gespraech`: Art.-9-Klausel, Anbieter, Sicherheitsprüfung aufnehmen; Bedrock-Weg festlegen.
4. `kontakttausch`: Folge des Widerrufs entscheiden (Code anpassen) und ob ein fester Stand der Kontaktdaten gezeigt
   werden soll.
5. `art9_profile`: Fairness-Zählung als Zweck aufnehmen.
6. Nach Freigabe: neue Fassungen in `ops.legal_documents` mit neuer Version anlegen (die alte auf `abgeloest`), damit
   `api.my_consents` die Erneuerung anzeigt.
7. Ob die Nachweise (`app.consents`) nach der Kontolöschung für die Dauer möglicher Ansprüche aufbewahrt werden sollen
   (heute gelöscht).
