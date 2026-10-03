# KI-Hinweis (Art. 50 KI-Verordnung)

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026. Grundlage: Code von Viola (M3, im Hauptzweig `claude/dating-app-build-0uszhn`, Commit
> `e84647b`): `services/viola/src/viola/prompts/saetze.md`, `…/prompts/system.md`,
> `supabase/functions/interview-token/handler.ts`, `supabase/migrations/20261003000310_viola.sql`; schriftlicher
> Hinweis der Web-App in `ops.legal_documents` (Art `ki_hinweis`, M2, `20261003000210_web_settings_legal.sql`).

## 1. Worum es geht

Art. 50 Abs. 1 der KI-Verordnung (VO (EU) 2024/1689) verlangt, dass Menschen informiert werden, wenn sie mit einem
KI-System interagieren, sofern das nicht offensichtlich ist. Die Pflicht gilt laut PLAN 5.12 seit 02.08.2026; die
Prüfung des Wortlauts im Amtsblatt (auch nach dem „AI Omnibus“, VO (EU) 2026/1744) steht noch aus
[[Anwalt]]. Fermata erfüllt den Hinweis an drei Stellen:

1. **vor dem Verbinden** in der App,
2. **als erster Satz** von Viola (Stimme und Text), fest und nicht vom Sprachmodell erzeugt,
3. **schriftlich** unter „Rechtliches“ und in der Datenschutzerklärung.

Technisch abgesichert: Die Datenbank nimmt keinen Gesprächsbeitrag an, bevor der Hinweis gesprochen bzw. angezeigt
wurde (`api.agent_append_turns` lehnt mit `ai_notice_missing` ab; Zeitpunkt in `app.interview_sessions.ai_notice_at`,
Fassung in `ai_notice_version`, Einstellung `interview.ai_notice_version` = `2026-10-03`). In der Stimme ist die
Begrüßung nicht unterbrechbar. Auch eine Fortsetzung beginnt mit dem Hinweis.

## 2. Was die App vor dem Verbinden zeigt

Heute (`aiNoticeText` in `interview-token`):

| Modus | Sie | Du |
|---|---|---|
| Stimme | „Sie sprechen gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch. Ihre Stimme wird nicht aufgezeichnet.“ | „Du sprichst gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch. Deine Stimme wird nicht aufgezeichnet.“ |
| Text | „Sie schreiben gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch.“ | „Du schreibst gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch.“ |

**Vorschlag M8:** so lassen; ergänzen um einen Link „Mehr zu KI bei Fermata“ auf den schriftlichen Hinweis (Abschnitt 4).

## 3. Was Viola zu Beginn sagt

Feste Sätze (`saetze.md`), in dieser Reihenfolge: `gruss` → `datenhinweis_<modus>` → `zweck_<gesprächsart>`.
Beispiel Erstgespräch mit Stimme, Sie-Form:

> „Guten Tag. Ich bin Viola, eine künstliche Intelligenz von Fermata, kein Mensch. Ihre Stimme wird nicht
> aufgezeichnet, nur der Text unseres Gesprächs bleibt 30 Tage gespeichert und wird dann gelöscht. Sie können
> jederzeit aufhören oder zum Schreiben wechseln. Ich möchte Sie ein wenig kennenlernen, damit Fermata einen
> passenden Abend für Sie suchen kann. Wollen wir anfangen?“

(Die Dauer setzt der Platzhalter `{aufbewahrung}` aus der Einstellung `interview.transcript_retention_days`.)

Im Gespräch gilt Regel 1 des Systemtexts: Viola sagt auf Nachfrage immer ehrlich, dass sie eine KI ist, gibt sich nie
als Mensch aus und behauptet keine Gefühle oder einen Körper.

**Vorschlag M8:** so lassen. Optional einen halben Satz zur Sicherheit ergänzen, weil das Gespräch automatisch auf
Krisenhinweise geprüft wird: „… und wird dann gelöscht. Wenn ich höre, dass es Ihnen nicht gut geht, nenne ich Ihnen
Hilfsangebote.“ [[Benn: Länge der Begrüßung gegen Klarheit abwägen]]

## 4. Schriftlicher Hinweis (Rechtliches, `ops.legal_documents` Art `ki_hinweis`)

**Frühere Fassung (M2, jetzt `2026-10-03-m2`, Status `abgeloest`):** endete mit „Besonders geschützte Angaben wie
Geschlecht oder Religion gehen nie an ein Sprachmodell.“ Das stimmte nur für die Formularangaben: Was jemand Viola
von sich aus erzählt, verarbeiten Spracherkennung und Sprachmodell live (gespeichert wird es nicht).

**Heute (Fassung `2026-10-03-entwurf`, Migration `20261003000900_legal_documents.sql`):** Der Text zwischen den
Markierungen steht wortgleich (in App-Markdown umgewandelt) in der Datenbank; ein Deno-Test prüft das.

<!-- db kind="ki_hinweis" version="2026-10-03-entwurf" title="Hinweis: künstliche Intelligenz" -->
Bei Fermata arbeitet künstliche Intelligenz an drei Stellen mit (Art. 50 KI-Verordnung). Hier steht, wo, welche
Dienste beteiligt sind und was gespeichert wird.

## 1. Viola, die Stimme im Gespräch

- **Viola ist eine künstliche Intelligenz, kein Mensch.** Sie sagt das zu Beginn jedes Gesprächs, und die App zeigt
  es vor dem Verbinden an.
- Während Sie sprechen, wandelt die Spracherkennung **Deepgram** Ihre Stimme auf Servern in der EU in Text um. Ein
  Sprachmodell, **Claude von Anthropic**, betrieben über **Amazon Bedrock** in der EU, formuliert Violas Antworten.
  Eine künstliche Stimme, **Amazon Polly** in Frankfurt, spricht sie. [[Frage B4: Stimme nach dem Blindtest
  eintragen]]
- Amazon Bedrock verteilt die Anfragen über ein EU-Profil auf mehrere Rechenzentren. Dazu können auch Rechenzentren
  in London und Zürich gehören; für das Vereinigte Königreich und die Schweiz gibt es einen Angemessenheitsbeschluss
  der EU-Kommission. [[Bedrock-Weg festlegen: EU-Profil oder nur Frankfurt]]
- **Fermata zeichnet Ihre Stimme nicht auf.** Die Dienste verarbeiten sie nur, während Sie sprechen
  [[Aufbewahrung bei Deepgram und AWS in den Auftragsverarbeitungsverträgen bestätigen]]. Gespeichert wird nur der
  Text des Gesprächs, und zwar **30 Tage** lang; danach löschen wir ihn automatisch.

## 2. Die Auswertung nach dem Gespräch

- Dasselbe Sprachmodell liest den Gesprächstext und schlägt eine Zusammenfassung vor. Sie gilt erst, wenn Sie sie
  bestätigt oder korrigiert haben.
- Das Gespräch wird außerdem **automatisch** auf Hinweise zu einer Krise, auf Minderjährigkeit, Gewalt oder
  Belästigung geprüft. Bei einem Treffer erhält Fermata einen Hinweis ohne Zitat. Den Gesprächstext liest ein Mensch
  bei Fermata nur in einem solchen Sicherheitsfall; jede Einsicht wird mit Grund protokolliert.

## 3. Die Auswahl

- Ein Programm nutzt das Sprachmodell, um zu bewerten, wer zusammenpassen könnte, und um den kurzen Text „Warum Sie
  beide“ zu entwerfen. Es erhält dafür Ihre bestätigte Zusammenfassung ohne Namen und ohne Ihre Angaben zu
  Geschlecht, Orientierung und Religion.
- **Jeden Vorschlag prüft und gibt ein Mensch frei.** Ohne diese Freigabe erhält niemand einen Vorschlag.

## Besonders geschützte Angaben

- Ihre Angaben zu Geschlecht, gesuchtem Geschlecht, Orientierung und Religion aus dem Formular gehen nie an ein
  Sprachmodell. Die Auswahl erhält dazu nur „passt“ oder „passt nicht“.
- Viola fragt nicht nach Gesundheit, Religion, Herkunft, Sexualität oder anderen besonders geschützten Themen.
  Erzählen Sie davon von sich aus, verarbeiten Spracherkennung und Sprachmodell es **während des Gesprächs** wie alles
  andere Gesagte. **Vor dem Speichern filtern wir solche Sätze heraus:** Sie kommen nicht in den gespeicherten Text,
  nicht in die Zusammenfassung und nicht in Ihr Profil. Ausnahme: Sätze, die auf eine Gefahr hinweisen, bleiben im
  Text, damit wir helfen können; auch sie werden nach 30 Tagen gelöscht.

Die Anbieter dürfen Ihre Daten laut Vertrag nicht nutzen, um ihre Modelle zu trainieren [[in den
Auftragsverarbeitungsverträgen mit AWS und Deepgram bestätigen]]. Mehr dazu in der Datenschutzerklärung.

*Entwurf vom 03.10.2026. Der verbindliche Text folgt nach rechtlicher Prüfung.*
<!-- /db -->

## 5. Weitere Pflichten, die geprüft werden müssen

| Pflicht | Stand im Code | Prüfung |
|---|---|---|
| Art. 50 Abs. 1: Hinweis bei Interaktion | erfüllt (Abschnitte 1–3) | Wortlaut im Amtsblatt prüfen |
| Art. 50 Abs. 2: maschinenlesbare Kennzeichnung **synthetischer Audioausgaben** (Viola spricht mit künstlicher Stimme) | nicht gebaut | [[Anwalt: gilt das für Fermata als Anbieter des Systems „Viola“, und ab wann (PLAN-Quelle nennt eine Frist im Dezember 2026)? Technisch: Wasserzeichen des TTS-Anbieters oder Metadaten im Audiostrom prüfen]] |
| Art. 50 Abs. 4 (Deepfakes, Texte zu Angelegenheiten von öffentlichem Interesse) | nicht einschlägig | – |
| Rolle Fermatas | Fermata stellt Viola unter eigenem Namen bereit → vermutlich **Anbieter** des KI-Systems Viola und **Betreiber** der Auswahl | [[Anwalt]] |
| Hochrisiko (Anhang III)? | Auswahl von Dating-Partnern ist nach unserem Verständnis kein Anhang-III-Fall | [[Anwalt bestätigen]] |
| Art. 4: KI-Kompetenz | Benn als einziger Admin | kurze Schulungsnotiz für Benn (Was kann das Modell, wo irrt es, wann ablehnen) |
| DSGVO Art. 13 Abs. 2 lit. f / Art. 22 | in der Datenschutzerklärung Abschnitt 10 | – |

## Offene Punkte für Benn/Anwalt

1. Schriftlichen Hinweis (Abschnitt 4, seit der Härtung in `ops.legal_documents`) prüfen und freigeben.
2. Art. 50 Abs. 2 (Kennzeichnung synthetischer Audioausgaben) prüfen und ggf. Technik beauftragen.
3. Rolle Fermatas nach der KI-Verordnung bestätigen.
4. Ob die Begrüßung um einen Satz zur Sicherheitsprüfung ergänzt wird.
5. Ergebnis des Stimmen-Blindtests (B4): Anbieter im Hinweis anpassen, falls nicht Polly.
