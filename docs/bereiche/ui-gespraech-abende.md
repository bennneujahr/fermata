# Oberfläche: Gespräch, freie Abende, Abende, Mitteilungen (UI-A)

Stand: 03.10.2026 · Bereich `apps/web` (Next.js 16) · Grundlage: PLAN.md 1, 2.3, 4 (M3/M5), 5.2; API-Verträge in
[`viola.md`](viola.md) Abschnitt 8 und [`abende.md`](abende.md) Abschnitt 5. Keine neue Migration.

> **Kurz für Benn:** Das Gespräch mit Viola (Stimme und Text), die Zusammenfassung zum Bestätigen, die freien Abende als
> Raster, alle Schritte eines Abends vom Vorschlag bis zum Kontakttausch und die Mitteilungen auf dem Gerät sind gebaut und
> mit dem lokalen Stapel Ende zu Ende getestet – das Textgespräch echt gegen den Viola-Textdienst mit Attrappe. Was ein
> echtes Gerät oder echte Dienste braucht (LiveKit, Mikrofon auf dem iPhone, echte Push-Zustellung), steht unten in
> [„Braucht echte Geräte oder Dienste“](#braucht-echte-geräte-oder-dienste). Offene Punkte: [ganz unten](#offene-punkte).

## Inhalt

1. [Was es gibt](#was-es-gibt)
2. [So funktioniert es](#so-funktioniert-es)
3. [Lokal ausprobieren](#lokal-ausprobieren)
4. [Tests und Bildschirmfotos](#tests-und-bildschirmfotos)
5. [Umgebungsvariablen](#umgebungsvariablen)
6. [Braucht echte Geräte oder Dienste](#braucht-echte-geräte-oder-dienste)
7. [Entscheidungen](#entscheidungen)
8. [Offene Punkte](#offene-punkte)
9. [Hinweise für die Integration](#hinweise-für-die-integration)

## Was es gibt

| Weg | Inhalt | Daten |
|---|---|---|
| `/gespraech` | Wer Viola ist, was mit dem Gespräch passiert, Sie/Du-Hinweis, Einwilligung `gespraech` direkt auf der Seite, Wahl **Sprechen** / **Lieber schreiben**, offenes Gespräch fortsetzen, bestätigte Zusammenfassung, Verlauf (Datum, Art, Status, Zusammenfassung, Gesprächstext lesbar bis …) | `interview-token`, Viola-Textdienst, `app.interview_sessions`, `app.interview_transcripts`, `app.profile_core` (RLS: nur eigene) |
| `/gespraech?art=vertiefung\|korrektur` | weitere Gesprächsarten nach bestätigter Zusammenfassung (je Stufe wie `interview.kinds_by_tier`) | |
| `/gespraech?art=nachbesprechung&abend=<id>` | Nachbesprechung zum Abend (Minuten aus `debrief_offer`) | `evening_detail` |
| `/gespraech/<id>` | Zusammenfassung: Entwurf lesen, **Stimmt so**, **Korrigieren** (mit ruhiger Erklärung bei `art9_content`), **Verwerfen**; wartet selbst, bis der Entwurf da ist; Gesprächstext (aufklappbar) | `interview-summary` GET/POST |
| `/zeiten` | leitet zum offenen (sonst nächsten) Zeitraum | `my_availability_periods` |
| `/zeiten/<period_id>` | Raster der freien Abende (17–23 Uhr, halbe Stunden, ganze Wochen Mo–So), Frist „bis Dienstag, 10 Uhr“, Prüfregeln, Speichern, geschlossener Zeitraum nur lesbar | `my_availability`, `set_availability` |
| `/abende` | freie Abende (Karte), kommende Abende (erst, was zu tun ist), vergangene | `my_evenings`, `my_availability_periods` |
| `/abende/<id>` | Vorschlag mit „Warum Sie beide“, Lokal (Adresse, Bus und Bahn, Barrierefreiheit), nächster Schritt je `my_action`: Uhrzeiten wählen (1–3), bestätigen oder Alternative, warten, „Der Abend steht“ (Reservierung, Tisch-Code), Erkennungszeichen, Finde-Fenster, Rückmeldung, Kontakt, Nachbesprechung, Ablehnen und Absagen (rechtzeitig/kurzfristig erklärt), „Sicher unterwegs“ (Abend teilen, Check-in, Melden, Hilfe) | `evening_detail`, `evening_request_time`, `evening_counter`, `evening_confirm`, `evening_decline`, `evening_cancel`, `set_recognition_hint`, `evening_find_info` |
| `/abende/<id>/finden` | Finde-Fenster als eigene Seite (Link aus der Erinnerung) | `evening_find_info` |
| `/abende/<id>/rueckmeldung` | Rückmeldung (war da, Gegenüber da, wiedersehen, sicher gefühlt, Lokal, Vorschlag, Notiz) mit Kontakttausch: E-Mail und/oder Telefon, Einwilligung `kontakttausch` direkt im Formular | `submit_feedback`, `give_consent` |
| `/abende/<id>/kontakt` | nur, was das Gegenüber freigegeben hat; nie ein „Nein“; zurückgezogene Freigabe als ruhiger Satz | `my_contact_share` |
| `/abende/<id>/nachbesprechung` | Weiterleitung zum Gespräch (Link aus der Mail) | |
| `/abende/<id>/check-in` | Weiterleitung auf `/abende/<id>/checkin` (Mails verlinken `check-in`; die Seite baut der Bereich Sicherheit) | |
| `/konto/mitteilungen` | Mitteilungen einschalten (Einwilligung `push` auf der Seite, VAPID-Schlüssel aus `push-key`, Abo über `/sw.js`), Geräte-Liste (dieses Gerät erkannt), anderes Gerät entfernen, auf diesem Gerät aus, überall aus (Widerruf), Hinweis iPhone mit Link auf `/installieren`, Beispiel-Mitteilung | `save_push_subscription`, `delete_push_subscription`, `app.push_subscriptions` (RLS) |
| `/start` | nach dem Onboarding der **eine** nächste Schritt (dringender Abend → Zusammenfassung lesen → Gespräch → freie Abende → übriger Abend → „Alles erledigt“) und eine Karte „Abende“ | wie oben |
| `/konto` | Karte „Mitteilungen“ mit Link auf `/konto/mitteilungen` | |

Bausteine: `src/components/gespraech/` (Conversation, VoiceCall, TextChat, SummaryReview, Atem, Notices, InlineConsent,
ConsentRenewal), `src/components/abende/` (EveningCard, TimePicker, TimeAnswer, EndEvening, HintForm, FindCard,
SafetyCard, ContactResult, FeedbackForm, VenueCard, AvailabilityGrid, StartNextStep). Texte: `src/copy/gespraech.ts`,
`abende.ts`, `zeiten.ts`, `push.ts` (Sie/Du über `af()`). Stile: `src/styles/gespraech-abende.css` (nur Tokens).
Hilfen: `src/lib/berlin.ts` (Zeiten in Europe/Berlin, „bis Freitag, 12 Uhr“), `availability.ts` (Raster ↔ Fenster),
`evening-types.ts`, `evenings.ts`, `evening-links.ts`, `gespraech.ts`, `push.ts`, `viola/` (Typen, Textdienst mit SSE,
LiveKit-Verbindung, Attrappe). Server Actions: `src/app/actions/gespraech.ts`, `abende.ts`, `zeiten.ts`, `push.ts`.

## So funktioniert es

### Gespräch

1. **Start:** Ohne geprüften Ausweis Hinweis auf den nächsten Onboarding-Schritt. Ohne Einwilligung `gespraech` steht der
   Text (aufklappbar) mit einem Häkchen auf der Seite; danach geht es auf derselben Seite weiter. Gibt es eine neue Fassung
   einer erteilten Einwilligung (`needs_renewal`), gilt die alte weiter; die Seite bietet ruhig an, neu zu bestätigen.
2. **Sprechen:** Erst prüft die Seite das Mikrofon (`getUserMedia`, sofort wieder freigegeben) und erklärt jeden Fehler
   (verweigert, kein Gerät, belegt, kein https, Browser zu alt) mit „Lieber schreiben“ als Ausweg. Dann `interview-token`
   (Server Action, Zugangstoken bleibt auf dem Server), **schriftlicher KI-Hinweis** oben (Text aus der Antwort, Art. 50
   AI Act), Verbindung mit `livekit-client` (erst beim Verbinden geladen), Mikrofon an. `<fermata-atem>` folgt
   `lk.agent.state` (listening → hört, thinking → denkt, speaking → spricht, Pause → pause) und bekommt Violas Ton über
   `connectAudio()` (nur Analyse im Browser). Untertitel aus den Transkriptions-Streams (`lk.transcription`), ein-/ausblendbar,
   nicht gespeichert. Knöpfe: **Pause** (Mikrofon stumm), **Text statt Stimme** (Datenpaket `{"type":"switch_to_text"}` auf
   Topic `viola`, Raum verlassen, `interview-token` mit `session_id`, Textmodus mit bisherigem Verlauf), **Beenden** (mit
   Rückfrage). Datenpakete: `ai_notice`, `summary_proposed` (zum Mitlesen), `crisis_resources` (Hilfe dauerhaft oben, mit
   Telefon-Links), `switch_to_text`, `ended` (→ Abschluss mit Weg zur Zusammenfassung). Bricht die Verbindung ab: „Als Text
   weitermachen“ oder „Neu verbinden“ (`continues_session_id`). Blockiert der Browser den Ton: Knopf „Ton einschalten“.
3. **Lieber schreiben:** schriftlicher KI-Hinweis zuerst, dann Violas Begrüßung (`/start`). Antworten kommen Satz für Satz
   (`/messages` mit `Accept: text/event-stream`), Enter schickt ab. Restzeit oben, „Beenden“ mit Rückfrage (`/end`).
   `409 not_started` (Textdienst neu gestartet) → `/start` und noch einmal senden. Nach dem Ende bleibt der Verlauf stehen,
   darunter der Abschluss. Während des Gesprächs treten Erklärungen und Verlauf der Seite zurück (nur das Gespräch).
4. **Zusammenfassung:** `/gespraech/<id>` fragt `interview-summary` alle 2,5 Sekunden ab (höchstens 2 Minuten), bis
   `summary_status = draft`; ohne Entwurf (früh beendet, Auswertung `failed`/`skipped`) ein freundlicher Satz mit Weg zurück.
   Korrektur mit geschützten Angaben → 422 `art9_content` → Erklärung mit den Kategorien in Worten („Religion oder
   Weltanschauung“ …) und dem Hinweis auf den geschützten Bereich „Über Sie“.

### Freie Abende

Spalten = Tage einer Woche (immer Mo–So, Tage außerhalb des Zeitraums leer), Zeilen = halbe Stunden 17:00–22:30.
Maus: klicken oder ziehen; Touch: tippen; Tastatur: ein Tabstopp je Woche, Pfeiltasten, Pos1/Ende, Leertaste/Enter;
Spaltenkopf = „ganzer Abend“ an/aus. Zusammenhängende Felder werden Fenster (UTC über `berlinToDate`, auch über die
Zeitumstellung). Vorab-Prüfung wie in der Datenbank (mindestens 2 Stunden, höchstens 12 Fenster; zu kurze Fenster sind
gestrichelt markiert und in der Liste benannt), vergangene Felder gesperrt. Fehler aus `set_availability` (`period_closed`,
`window_in_past` …) erscheinen als ruhige Sätze. Fenster außerhalb des Rasters (z. B. von Hand angelegt) werden gemeldet.

### Abende

Die Detailseite zeigt je `my_action` genau einen nächsten Schritt; Fristen immer „bis Freitag, 12 Uhr“ (Europe/Berlin,
relativ zur **Datenbankzeit** `app.now()`, damit Testuhr und Anzeige übereinstimmen). Ablehnen und Absagen fragen einen
freiwilligen Grund ab (nur für Fermata; „Ich fühle mich unsicher“ zeigt den Weg zum Melden). Die Absage erklärt aus
`late_cancel_from`: bis wann sie rechtzeitig ist (beide bekommen den Abend zurück) und dass sie danach als kurzfristig
gilt (zählt für die absagende Person als genutzt, Regel aus [`mitgliedschaft.md`](mitgliedschaft.md)). Rückmeldung:
Kontakttausch nur mit Einwilligung `kontakttausch`, die direkt im Formular erteilt wird (Server Action erteilt sie mit
der gelesenen Fassung, dann `submit_feedback`); Telefon nur, wenn eine Nummer hinterlegt ist. Kontakt: nur das
Freigegebene, als `mailto:`/`tel:`-Link; offen / geschlossen / zurückgezogen ohne je ein „Nein“ zu zeigen.

### Mitteilungen

Einwilligung `push` → Erlaubnis des Browsers → VAPID-Schlüssel (`push-key`, über eine Server Action) →
`pushManager.subscribe({userVisibleOnly: true, applicationServerKey})` am vorhandenen Service Worker →
`save_push_subscription` (Plattform `ios`/`android`/`desktop`). Die Geräte-Liste erkennt „dieses Gerät“ über einen
SHA-256 der Adresse (fremde Adressen kommen nicht in den Browser). iPhone/iPad im Browser-Tab: Hinweis auf den
Home-Bildschirm statt Knopf (PLAN 5.2). Klick auf eine Mitteilung öffnet die Adresse aus dem Inhalt (`url`, nur eigene
Seiten); `sw.js` öffnet ein neues Fenster, wenn ein offenes Fenster nicht navigiert werden kann.

## Lokal ausprobieren

```bash
pgrep -x dockerd >/dev/null || (nohup dockerd >/tmp/dockerd.log 2>&1 &); sleep 5
STACK_SLOT=1 bash apps/web/scripts/stack.sh up      # Stapel auf Slot 1 (App 3141, Gateway 54445, Textdienst 54440)
STACK_SLOT=1 bash apps/web/scripts/serve-e2e.sh     # Build und next start auf http://localhost:3141
```

`stack.sh up` startet jetzt zusätzlich den **Viola-Textdienst** (`services/viola`, `.venv/bin/viola text-server`,
Attrappe als Sprachmodell, `VIOLA_BACKEND=http` gegen `interview-agent`; beim ersten Mal `uv sync`), erzeugt ein lokales
**VAPID-Schlüsselpaar** (`.stack/vapid`, nie im Repository) und schreibt die Umgebung für Gespräch und Push nach
`.stack/env` (siehe [Umgebungsvariablen](#umgebungsvariablen)). Ohne `uv`: `STACK_VIOLA=0`, dann geht nur die Oberfläche
ohne Textgespräch. „Sprechen“ läuft lokal mit der **Attrappe des LiveKit-Raums** (`VIOLA_VOICE_MODE=fake`): Viola
„spricht“ den KI-Hinweis und hört dann zu; in der Browser-Konsole lässt sie sich steuern:

```js
__violaFake.state("thinking")                                  // listening | thinking | speaking | initializing
__violaFake.caption("viola", "Was ist Ihnen wichtig?")
__violaFake.packet({ type: "crisis_resources", lines: { telefonseelsorge: ["0800 1110111"], notruf: "112" } })
__violaFake.packet({ type: "ended", reason: "fertig", summary_pending: true })
__violaFake.drop()                                             // Verbindung bricht ab
```

Ein Abend zum Durchklicken (zwei Mitglieder, Lokal mit Plätzen an Tag 3–5, gemeinsame freie Fenster, Vorschlag wie nach
der Freigabe): die Helfer in `apps/web/tests/e2e/helpers/abende.ts` (`proposedEvening`, `confirmedEvening`, `clockTo`).
Zeitpunkte (Finde-Fenster, Rückmeldung) über die Testuhr, danach zurücksetzen:

```bash
set -a; . apps/web/.stack/env; set +a
psql "$SUPABASE_DB_URL" -c "select ops.sim_clock_advance(interval '3 days')"   # … und zurück:
psql "$SUPABASE_DB_URL" -c "select ops.sim_clock_reset()"
```

Aufräumen: `STACK_SLOT=1 bash apps/web/scripts/stack.sh down` (beendet auch den Textdienst).

## Tests und Bildschirmfotos

| Was | Befehl | Stand 03.10.2026 |
|---|---|---|
| Unit (Vitest) | `pnpm --filter @fermata/web test` | 51 grün (davon 27 neu: Zeiten in Berlin und Fristen, Raster ↔ Fenster, SSE und Textdienst, Ereignisse und Atem, Push-Hilfen, Abend-Hilfen, CSP-Ziele, Wege) |
| E2E (Playwright, axe WCAG 2.1 AA auf jeder Seite, CSP-Prüfung) | Stapel + `serve-e2e.sh`, dann `pnpm --filter @fermata/web exec playwright test --project=e2e` | 32 grün (17 neu + 15 bestehende) |
| Bildschirmfotos | `pnpm --filter @fermata/web exec playwright test --project=screenshots tests/e2e/abende-ui-a.screenshots.spec.ts` | 60 Bilder in [`docs/screenshots/web/ui-a/`](../screenshots/web/ui-a/) (15 Ansichten × mobil 390 px / Desktop 1440 px × hell / dunkel) |
| Typen, Lint, Build, Tonalität | `pnpm --filter @fermata/web typecheck`, `… lint`, `… build`, `pnpm checks` | grün |

Neue E2E-Dateien:

- `gespraech-text.spec.ts` – **echt gegen den Textdienst**: Einwilligung auf der Seite, KI-Hinweis zuerst, ganzes
  Gespräch bis zur vorgeschlagenen Zusammenfassung, Ende, Entwurf, Korrektur mit Religion → Art.-9-Erklärung, Korrektur
  gespeichert (`profile_core`), Transkript (KI-Hinweis zuerst, Löschung nach 30 Tagen), Verlauf und Gesprächstext; früh
  beenden in Du-Form (keine Zusammenfassung); Krise → Hilfe mit Telefon-Links; Bestätigen und Verwerfen.
- `gespraech-stimme.spec.ts` – Oberfläche mit der Raum-Attrappe, echtes `interview-token` (Sitzung, LiveKit-Token):
  Mikrofon, KI-Hinweis, Atem-Zustände, Pause, Untertitel, Zusammenfassung zum Mitlesen, Krise, **Text statt Stimme** gegen
  den echten Textdienst (gleiche Sitzung), Ende durch Viola, Verbindungsabbruch, Mikrofon verweigert.
- `zeiten.spec.ts` – Klick, Tastatur, Ziehen, zu kurzes Fenster, Speichern (UTC-Werte geprüft), Neuladen, ganzer Abend,
  Abfrage schließt während der Eingabe (`period_closed`), danach nur lesbar.
- `abende-ablauf.spec.ts` – zwei Browser (Mira, Jonas): Liste, Vorschlag (warum, Lokal), Wunschzeiten, Alternative,
  Bestätigung (Tisch-Code), Erkennungszeichen, Finde-Fenster (Testuhr), Rückmeldung mit Kontakt-Einwilligung im
  Formular, beidseitiges Ja → nur das Freigegebene sichtbar, `happened`, Nachbesprechung; Ablehnen (Grund nur für Fermata).
- `abende-absage.spec.ts` – rechtzeitige und kurzfristige Absage mit erklärten Folgen, kein Tisch frei (`no_table_free`).
- `push.spec.ts` – Einwilligung, VAPID-Schlüssel an `subscribe`, Abo in `app.push_subscriptions`, Geräte, entfernen,
  ausschalten, überall aus; iPhone im Browser-Tab; neue Fassung einer Einwilligung (Mitteilungen und Gespräch).
- `abende-dunkel.spec.ts` – axe im dunklen Modus auf allen neuen Seiten.

Der CSP-Test in `public.spec.ts` erwartet jetzt zusätzlich die eingerichteten Ziele (LiveKit, Textdienst).

## Umgebungsvariablen

| Variable | Wo | Bedeutung |
|---|---|---|
| `NEXT_PUBLIC_LIVEKIT_URL` | Web-App | LiveKit-Server (`wss://…`). Kommt mit `wss://` und `https://` in `connect-src`. Ohne Wert ist „Sprechen“ aus. |
| `NEXT_PUBLIC_VIOLA_TEXT_URL` | Web-App | öffentliche Adresse des Viola-Textdienstes (wie `VIOLA_TEXT_URL` der Edge Functions), kommt in `connect-src` |
| `VIOLA_VOICE_MODE=fake` | Web-App, nur lokal/Tests | Attrappe des LiveKit-Raums; in `FERMATA_ENV=production` wirkungslos |
| `SUPABASE_JWT_SECRET`, `INTERVIEW_AGENT_SECRET`, `VIOLA_TEXT_TOKEN_SECRET`, `VIOLA_TEXT_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Edge Functions | wie in [`viola.md`](viola.md) Abschnitt 7; lokal setzt `stack.sh` Platzhalter (LiveKit zeigt auf `wss://livekit.fake.invalid`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Edge Functions | wie in [`abende.md`](abende.md) Abschnitt 10; die Web-App holt den öffentlichen Schlüssel aus `push-key` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` wird nicht gebraucht) |

Die CSP baut `src/proxy.ts` je Anfrage über `buildCsp()`; die beiden Adressen ergänzt `violaConnectSources()` in
`src/lib/csp.ts` (nur wenn gesetzt). Keine Inline-Skripte oder -Stile; `<fermata-atem>` setzt seine Lautstärke über CSSOM.

## Braucht echte Geräte oder Dienste

| Was | Warum nicht lokal | Wie prüfen |
|---|---|---|
| Sprachgespräch über LiveKit (Verbindung, Agent-Dispatch, `lk.agent.state`, Datenpakete, Untertitel-Streams) | lokal kein LiveKit-Server und kein Sprach-Worker; die Oberfläche ist mit der Attrappe getestet, `createLiveKitConnection` nur typgeprüft | mit LiveKit (Weg A/B/C) und `viola voice-worker`: ein Gespräch auf Desktop-Chrome, Android-Chrome, iPhone-Safari und als installierte App |
| Mikrofon-Erlaubnis und Wiederholung auf dem iPhone (Safari fragt je Sitzung), Bluetooth-Kopfhörer | Testbrowser ersetzt `getUserMedia` | iPhone + Android, auch „verweigern“ und in den Einstellungen wieder erlauben |
| Ton ohne Klick (Autoplay) | Safari blockiert Ton ohne frische Geste; dafür gibt es „Ton einschalten“ (`room.startAudio()`) | iPhone: Ton direkt nach dem Verbinden hörbar? Sonst erscheint der Knopf |
| `connectAudio()` mit dem Ton aus WebRTC (Atem bewegt sich mit Violas Stimme) | nur mit echtem Ton | Desktop und iPhone ansehen; notfalls bleibt die ruhige Animation |
| Web-Push echt zustellen (FCM, Apple, Mozilla) und Klick auf die Mitteilung | im Testbrowser gibt es keinen Push-Dienst; `subscribe` ist ersetzt, der Weg bis `save_push_subscription` ist echt | Android-Chrome und iPhone (installiert, iOS ≥ 16.4): einschalten, `notify-dispatch` auslösen, Mitteilung tippen → öffnet `/abende/<id>` |
| Sprachmodell (Bedrock) | lokal Attrappe | mit Zugang (viola.md, Abschnitt 14) |

## Entscheidungen

| Thema | Entscheidung | Grund |
|---|---|---|
| Textdienst | Browser spricht direkt mit dem Textdienst (Adresse und Token aus `interview-token`) | so vorgesehen (viola.md 8.3), Antworten fließen ohne Umweg Satz für Satz; der Supabase-Zugang bleibt auf dem Server |
| Attrappe für Stimme | `VIOLA_VOICE_MODE=fake` (wie `DIDIT_MODE=fake`), Server entscheidet, Modul nur bei Bedarf geladen | lokale Vorführung und E2E ohne LiveKit; in production gesperrt |
| Fake-Zugang für Stimme lokal | Stapel setzt LiveKit-Platzhalter, damit `interview-token` echt antwortet | so prüft der Test den echten Weg bis zum Token |
| Beenden der Stimme | Datenpaket `{"type":"end"}` und Raum verlassen | der Worker kennt das Paket noch nicht (siehe offene Punkte); die Sitzung endet dann mit `technik` und bleibt fortsetzbar |
| Zeiten | eigene kleine Hilfe `lib/berlin.ts` (Intl, keine Bibliothek), Bezug auf `app.now()` | Fristen „bis Freitag, 12 Uhr“, Testuhr wirkt auch in der Anzeige |
| Raster | 17–23 Uhr, halbe Stunden, ganze Wochen | ein Abend dauert 2 Stunden; 6 Stunden = längstes Fenster |
| Einwilligungen auf der Seite | gleicher Weg wie das Onboarding (`giveConsentAction`, aktuelle Fassung, Text aufklappbar) | keine Sackgasse; „erteilt“ genügt, neue Fassung nur als Angebot |
| Kontakt-Einwilligung im Formular | Häkchen mit Text im Rückmeldeformular, Erteilung unmittelbar vor `submit_feedback` | eine Handlung statt Umweg über eine andere Seite |
| Gerät erkennen | SHA-256 der Push-Adresse statt Adressen im Browser | fremde Adressen bleiben auf dem Server |
| Andere Geräte entfernen | direkt `delete` auf `app.push_subscriptions` (RLS: nur eigene Zeilen) | es gibt kein RPC nach ID; keine Migration nötig |
| Sicherheits-Wege | `/sicherheit/melden?abend=`, `/sicherheit/teilen?abend=`, `/abende/<id>/checkin` an einer Stelle (`lib/evening-links.ts`) | stimmt mit dem Bereich Sicherheit (ui-member-b) überein |
| Stile | eine Datei `gespraech-abende.css`, von den Seiten geladen | gemeinsame Dateien bleiben unverändert |

## Offene Punkte

| # | Punkt | Vorschlag |
|---|---|---|
| 1 | **Beenden im Sprachgespräch**: der Worker wertet nur `switch_to_text` aus; „Beenden“ endet deshalb als `technik` (fortsetzbar), nicht als `person_beendet` | im Worker `{"type":"end"}` → `conv.end_by_person()` (services/viola, `voice/worker.py`, `_data`) |
| 2 | **Nachbesprechung**: M5 bietet sie nach der eigenen Rückmeldung an (`confirmed` reicht), `interview_request` verlangt `happened` | eine Regel wählen (z. B. M3: `confirmed` + eigene Rückmeldung „war da“ zulassen) |
| 3 | LiveKit Cloud (Weg A/B) kann auf Regions-Adressen ausweichen, die nicht in der CSP stehen | bei Weg A/B `FERMATA_CSP_EXTRA_CONNECT="https://*.livekit.cloud wss://*.livekit.cloud"`; Weg C (eigener Server) braucht nichts |
| 4 | Gesprächsarten je Stufe stehen in der Oberfläche als Start-Wert (`KINDS_BY_TIER`); die Einstellung `interview.kinds_by_tier` ist nicht öffentlich | bei Änderung der Einstellung `lib/gespraech.ts` anpassen oder ein öffentliches RPC ergänzen |
| 5 | Die Zahl der Runden, Mindest-Fensterlänge (2 h) und höchstens 12 Fenster stehen als Start-Werte in der Vorab-Prüfung; die Datenbank prüft endgültig | bei Änderung `DEFAULT_RULES` in `lib/availability.ts` anpassen |
| 6 | Gibt es eine neue Fassung einer Einwilligung, gilt die alte weiter (Vorgabe aus der Härtung); die Oberfläche bietet „neu bestätigen“ an | prüfen, ob `submit_feedback`/`interview_request` nach der Härtung wirklich jede erteilte Fassung annehmen |
| 7 | Zurückgezogene Kontaktfreigabe (`counterpart.withdrawn`) ist eingebaut, aber nur mit der Härtung testbar (nicht in diesem Arbeitsbereich) | nach dem Zusammenführen einen E2E-Fall ergänzen |
| 8 | Push-Zustellung und Klick nur auf echten Geräten prüfbar | siehe Tabelle oben |
| 9 | Der „Melden“-Knopf als Dialog (`ReportButton` aus ui-member-b) ist hier noch ein Link auf `/sicherheit/melden?abend=<id>` | nach dem Zusammenführen in `SafetyCard` und `EndEvening` gegen `ReportButton` tauschen |
| 10 | `/zeiten` hat keinen eigenen Eintrag in der Navigation (fünf Punkte unten sind genug); der Weg führt über Abende und Start | so lassen oder „Abende“ für `/zeiten` aktiv markieren (NavLinks) |
| 11 | ui-member-b bringt `src/lib/datetime.ts` mit ähnlichen Zeit-Hilfen wie `src/lib/berlin.ts` | später zusammenlegen |
| 12 | Texte `placeholders.gespraech` / `placeholders.abende` und `start.next.fertig` in `copy/member.ts` werden nicht mehr benutzt | beim Aufräumen entfernen (gemeinsame Datei, deshalb nicht hier) |

## Hinweise für die Integration

Geänderte gemeinsame Dateien (klein und additiv):

- `apps/web/scripts/stack.sh` – Textdienst starten/stoppen, VAPID-Schlüssel, Umgebung für Gespräch und Push
  (Block nach `SUPABASE_DB_URL`, damit er neben dem Stripe-Block von ui-member-b ohne Konflikt liegt; doppelte Zeile
  `SUPABASE_JWT_SECRET` mit gleichem Wert ist harmlos).
- `apps/web/src/lib/csp.ts` – `serviceOrigins()`, `violaConnectSources()`; `buildCsp()` hängt sie an `connect-src`.
- `apps/web/src/lib/routes.ts` – `/zeiten` gehört zum Mitgliederbereich (in `isMemberPath`).
- `apps/web/src/app/(member)/start/page.tsx` – Karte „Nächster Schritt“ nach dem Onboarding (`StartNextStep`).
- `apps/web/src/app/(member)/konto/page.tsx` – Karte „Mitteilungen“ verlinkt `/konto/mitteilungen`.
- `apps/web/src/copy/titles.ts` – drei Titel.
- `apps/web/public/sw.js` – Klick auf Mitteilung öffnet sicher die Adresse.
- `apps/web/tests/e2e/public.spec.ts` – CSP-Erwartung um eingerichtete Ziele erweitert.
- `apps/web/.env.example` – Variablen fürs Gespräch (am Dateiende).
- `apps/web/package.json`, `pnpm-lock.yaml` – `livekit-client@2.22.3`.
- `/abende/[id]/check-in/page.tsx` ist **wortgleich** mit der Fassung aus ui-member-b.

Probe-Zusammenführung am 03.10.2026 (`git merge-tree`) mit `build/ui-member-b`, `build/ui-admin` und `build/hardening`:
keine Konflikte.
