# KI-Hinweis (Art. 50 KI-Verordnung)

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026. Grundlage: Code von Viola (M3, im Hauptzweig `claude/dating-app-build-0uszhn`, Commit
> `e84647b`): `services/viola/src/viola/prompts/saetze.md`, `…/prompts/system.md`,
> `supabase/functions/interview-token/handler.ts`, `supabase/migrations/20261003000310_viola.sql`; schriftlicher
> Hinweis der Web-App in `ops.legal_documents` (Art `ki_hinweis`, Branch `build/web`).

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

**Heute (M2, Entwurf):**

> Bei Fermata arbeitet künstliche Intelligenz mit (Art. 50 KI-Verordnung):
> - **Viola** ist eine KI-Stimme. Sie spricht mit Ihnen, ist aber kein Mensch.
> - **Die Auswahl** nutzt ein Sprachmodell, um zu bewerten, wer zusammenpassen könnte. Jeden Vorschlag prüft und gibt
>   ein Mensch frei.
> - **Besonders geschützte Angaben** wie Geschlecht oder Religion gehen nie an ein Sprachmodell.

**Problem:** Der dritte Punkt stimmt für die Formularangaben (verschlüsselt, Auswahl nur Ja/Nein), aber nicht für das
Gespräch: Was jemand Viola von sich aus erzählt, verarbeitet das Sprachmodell live (gespeichert wird es nicht).

**Vorschlag M8 (Fassung `ki-hinweis-2026-10-03-m8-entwurf`):**

> **Künstliche Intelligenz bei Fermata**
>
> Bei Fermata arbeitet künstliche Intelligenz an drei Stellen mit. Wir sagen Ihnen jeweils, wo.
>
> **1. Viola** ist eine künstliche Intelligenz, kein Mensch. Sie sagt das zu Beginn jedes Gesprächs. Was Sie sagen,
> wandelt eine Spracherkennung (Deepgram) in Text um; ein Sprachmodell (Claude von Anthropic, betrieben über Amazon
> Bedrock in der EU) formuliert Violas Antworten; eine künstliche Stimme (Amazon Polly) spricht sie. Ihre Stimme wird
> nicht aufgezeichnet.
>
> **2. Die Auswertung** nach dem Gespräch macht dasselbe Sprachmodell: Es schlägt eine Zusammenfassung vor und prüft
> auf Hinweise zu einer Krise oder Gefahr. Die Zusammenfassung gilt erst, wenn Sie sie bestätigt oder korrigiert
> haben.
>
> **3. Die Auswahl** nutzt das Sprachmodell, um zu bewerten, wer zusammenpassen könnte, und um den kurzen Text „Warum
> Sie beide“ zu entwerfen. Das Sprachmodell erhält dafür Ihre bestätigte Zusammenfassung ohne Namen und ohne Ihre
> Angaben zu Geschlecht, Orientierung, Religion oder Gesundheit. **Jeden Vorschlag prüft und gibt ein Mensch frei.**
>
> Ihre Angaben zu Geschlecht, gesuchtem Geschlecht, Orientierung und Religion aus dem Formular gehen nie an ein
> Sprachmodell. Erzählen Sie Viola von sich aus etwas aus diesen Bereichen, wird es im Gespräch verarbeitet, aber
> nicht gespeichert.
>
> Das Sprachmodell lernt nicht aus Ihren Daten [[im AV-Vertrag mit AWS bestätigen]]. Mehr dazu in der
> Datenschutzerklärung.

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

1. Schriftlichen Hinweis (Abschnitt 4) freigeben und in `ops.legal_documents` als neue Fassung anlegen.
2. Art. 50 Abs. 2 (Kennzeichnung synthetischer Audioausgaben) prüfen und ggf. Technik beauftragen.
3. Rolle Fermatas nach der KI-Verordnung bestätigen.
4. Ob die Begrüßung um einen Satz zur Sicherheitsprüfung ergänzt wird.
5. Ergebnis des Stimmen-Blindtests (B4): Anbieter im Hinweis anpassen, falls nicht Polly.
