# Viola – Gespräch mit Stimme oder Text (M3)

Stand: 03.10.2026 · Bereich: `services/viola`, Migration `20261003000310_viola.sql`, Edge Functions `interview-*`, `_shared/interview/`.

Viola ist eine Stimme ohne Gesicht und klar als künstliche Intelligenz benannt. Sie lernt Mitglieder im Gespräch kennen
(Persönlichkeit, Werte, Wünsche an das Gegenüber, Lebensumstände, Fahrbereitschaft, freie Zeiten), fasst zusammen und lässt
die Person die Zusammenfassung bestätigen oder korrigieren. Dieselbe Gesprächslogik läuft mit Stimme (LiveKit) und als Text
(„Text statt Stimme“).

---

## 1. Was gebaut ist

| Baustein | Ort | Inhalt |
|---|---|---|
| Gesprächskern | `services/viola/src/viola/engine.py`, `state.py` | Zustandsautomat, Leitfaden, Werkzeuge, Zeitlimit, Sie/Du, kurze Antworten, Sicherheit |
| Leitfaden | `services/viola/src/viola/prompts/*.md` | Systemtext, Gesprächsarten, je Stufe 15 Situationen mit Beispielen, feste Sätze, Hinweise |
| Werkzeuge | `tools.py` | `note_profile_fact`, `propose_summary`, `flag_safety`, `end_conversation`, `switch_to_text` (strenge Schemas) |
| Art.-9-Filter | `art9.py`, `art9_patterns.json`, SQL `app.art9_categories` | Regeln (gleiche Liste in Python und SQL) + Gegenprüfung durch das Modell |
| Hintergrund-Agent | `analysis.py` | Transkript → Profil (`profile_core`, `wants`, `dealbreakers`, `personal_weights`) + Entwurf der Zusammenfassung |
| Sicherheits-Agent | `safety.py` | Regeln je Beitrag (sofort) + Modell nach dem Gespräch → `safety.safety_flags` |
| Sprachmodell | `llm/anthropic_llm.py` | Claude Sonnet 5.5 über Amazon Bedrock (Mantle-Client, eu-central-1), Attrappe in `llm/fake.py` |
| Stimme | `tts/` | `TtsProvider`: Polly (Platzhalter), Google Chirp 3 HD, Cartesia, ElevenLabs (Grundgerüste), Attrappe |
| Sprach-Worker | `voice/` | LiveKit Agents 1.8: Silero-VAD, Sprach-Tor, Deepgram Nova-3 (EU), Gesprächskern, TTS |
| Textmodus | `text_api.py` | FastAPI: Start, Nachricht (JSON oder Server-Sent Events), Ende, Zustand |
| Kosten, Antwortzeit | `metrics.py` | Median und 90-%-Wert, Kosten in Euro → `ops.session_costs` |
| Blindtest | `services/viola/blindtest/` | Sprachproben, anonyme Bewertungsseite, Auswertung |
| Datenbank | `supabase/migrations/20261003000310_viola.sql` | Einstellungen, Spalten, Agent-Funktionen, Art.-9-Prüfung, Cron |
| Edge Functions | `supabase/functions/interview-token`, `interview-agent`, `interview-summary` | Zugang, Schreibweg des Agenten, Bestätigung |

---

## 2. Architektur und Datenfluss

```
Web-App ──(1) POST interview-token──► Edge Function ──► api.interview_request()  (als Mitglied: Ausweis, Einwilligung
   │                                                      „gespraech“, keine Sperre, Gesprächsart je Stufe, Tageslimit)
   │◄── Sitzung + LiveKit-Token (Stimme) oder Text-Token (Text) + Hinweis „Viola ist eine KI“
   │
   ├─ Stimme ──WebRTC──► LiveKit (Weg A/B/C) ──► Viola-Worker (AWS Frankfurt)
   │                                              │ Silero-VAD → Sprach-Tor → Deepgram Nova-3 (api.eu.deepgram.com, de, mip_opt_out)
   │                                              │ Gesprächskern → Claude Sonnet 5.5 (Bedrock eu-central-1, EU-Geo-Profil)
   │                                              │ Antwort Satz für Satz → TtsProvider (Polly Frankfurt) → LiveKit → Lautsprecher
   │
   └─ Text ──HTTPS──► Viola-Textdienst (/v1/text/sessions/…) → derselbe Gesprächskern
                                                  │
                         nur Text, Zahlen, Zeiten │ POST interview-agent (x-agent-secret)
                                                  ▼
                       Supabase Frankfurt: interview_sessions, interview_transcripts (30 Tage), profile_core,
                       wants, dealbreakers, personal_weights, safety.safety_flags, ops.session_costs
```

**Audio wird nirgends gespeichert.** Im Einzelnen:

- Der Worker startet die LiveKit-Sitzung mit `record=False` (LiveKit würde sonst je nach Projekt-Einstellung Audio, Transkript,
  Traces und Logs hochladen). Es gibt keine Egress-Aufträge; das Token erlaubt nur das Mikrofon.
- Audio fließt nur im Speicher durch: Mikrofon → Sprach-Tor → Deepgram, und TTS → LiveKit. Es gibt im Dienst keinen Code, der
  Dateien schreibt. Ein Test liest den Quelltext (AST) und schlägt fehl, sobald Schreibzugriffe oder Egress auftauchen; ein
  zweiter Test führt einen Zug mit Stimme aus und prüft, dass weder Dateien entstehen noch Binärdaten an die Datenbank gehen.
- Der Rückweg (`backend.py`) weist Binärdaten grundsätzlich ab.
- Deepgram: EU-Endpunkt, `mip_opt_out=true` (keine Nutzung zur Modellverbesserung). Stille wird nicht gesendet (Sprach-Tor).
- Einzige Audiodateien im Repo-Kontext: die synthetischen Sprachproben des Blindtests (keine Menschen).

---

## 3. Gesprächsablauf

**Phasen** (`state.py`): Begrüßung → Themenblöcke → Zusammenfassung zum Bestätigen → Abschluss → beendet. Jede Phase kann mit
einem Grund enden: `fertig`, `person_beendet`, `zeitlimit`, `technik`, `krise`, `minderjaehrig`, `missbrauch`.

**Begrüßung mit KI-Hinweis (Art. 50 AI Act):** Der erste Satz ist fest und kommt nie vom Modell:
„Guten Tag. Ich bin Viola, eine künstliche Intelligenz von Fermata, kein Mensch.“ Danach Datenhinweis und Zweck. In der Stimme ist
die Begrüßung nicht unterbrechbar. Erst wenn sie gesprochen bzw. angezeigt wurde, vermerkt die Datenbank `ai_notice_at`; vorher
lehnt `api.agent_append_turns` jeden Beitrag ab (`ai_notice_missing`). Zusätzlich zeigt die Web-App vor dem Verbinden den Text
`ai_notice` aus `interview-token`. Der schriftliche Hinweis (`ops.legal_documents`, Art `ki_hinweis`) ist seit der Härtung
wahrheitsgemäß: Was jemand Viola von sich aus erzählt – auch Gesundheit, Religion oder Orientierung –, verarbeiten
Spracherkennung und Sprachmodell live; gespeichert wird es nicht (Fassung `2026-10-03-entwurf`, Text in
`docs/recht/ki-hinweis.md` Abschnitt 4; die frühere Fassung „gehen nie an ein Sprachmodell“ ist `abgeloest`). Ebenso die
Einwilligung `gespraech` (Fassung `2026-10-03-m8-entwurf`, `docs/recht/einwilligungen.md`).

**Themenblöcke je Gesprächsart** (`domain.py`):

| Art | Blöcke |
|---|---|
| Erstgespräch | Persönlichkeit, Werte, Wünsche an das Gegenüber, Lebensumstände, Fahrbereitschaft, freie Zeiten |
| Vertiefung | Werte, Wünsche, Persönlichkeit, Lebensumstände (knüpft an die bestätigte Zusammenfassung an) |
| Nachbesprechung | Eindruck vom Abend, was gepasst hat, was beim nächsten Vorschlag anders sein soll (nie über das Gegenüber) |
| Korrektur | Korrektur der Zusammenfassung |

**Tiefe je Stufe** (Einstellung `interview.tier_depth`): Ein Block gilt als besprochen, wenn die Person mindestens *min*
Antworten gegeben und Viola mindestens eine Tatsache notiert hat, spätestens nach *max* Antworten. Auftakt 2–3 (Zielzeit
20 Minuten), Andante 3–5 (30 Minuten), Loge 4–7 (45 Minuten, verteilt auf zwei Sitzungen). Die Steuerung sagt dem Modell per
Hinweis, wann es weitergeht.

**Zeitlimit und Fortsetzung:** Höchstdauer `voice.max_session_minutes` (30), im Text `interview.text_max_session_minutes` (60),
Nachbesprechung `evening.debrief_minutes` je Stufe. `voice.wrapup_minutes` (4) vor Schluss: Hinweis „zusammenfassen, Fortsetzung
anbieten“ (`propose_summary` mit `is_partial`). Bei Zeitende verabschiedet sich Viola; spätestens `voice.grace_minutes` (2) danach
beendet der Kern das Gespräch selbst (`zeitlimit`). Fortsetzung: `interview-token` mit `continues_session_id` (nur eigene Sitzung,
Ende `zeitlimit` oder `technik`, gleiche Art, innerhalb `interview.continuation_days`). Die neue Sitzung übernimmt die
Zusammenfassung und überspringt besprochene Blöcke. Auch die Fortsetzung beginnt mit dem KI-Hinweis.

**Sie/Du:** `address_form` kommt aus `app.accounts` und gilt für das ganze Gespräch. Feste Texte stehen als
`[[Sie-Form|Du-Form]]` in den Prompts (`address.py`); Tests prüfen alle Sätze in beiden Formen.

**Kurze Antworten (PLAN 5.8):** Leitfaden „höchstens zwei Sätze, dann genau eine Frage“, zusätzlich hart begrenzt
(`voice.max_sentences` = 3, `text_stream.BrevityGuard`): die ersten zwei Sätze sofort, danach bevorzugt die erste Frage.

**Werkzeuge** (strenge JSON-Schemas, `tool_choice: auto`):

| Werkzeug | Wirkung |
|---|---|
| `note_profile_fact(category, fact, importance)` | Notiz für die Auswertung; Art.-9-Treffer werden nicht notiert, das Modell erfährt es |
| `propose_summary(summary, is_partial)` | Zusammenfassung zum Bestätigen (Art.-9-Sätze entfernt), Ereignis `summary_proposed` an die Oberfläche |
| `flag_safety(kind, severity)` | Hinweis an Benn ohne Freitext |
| `end_conversation(reason)` | Ende nach der Verabschiedung |
| `switch_to_text(reason)` | Wechsel zu Text; die Sitzung läuft im Textmodus weiter |

Werkzeug-Ergebnisse gehen mit dem nächsten Beitrag der Person mit (spart eine Anfrage). Nur wenn das Modell ohne Text ein
Werkzeug aufruft, fragt der Kern sofort nach.

**Situationen** (Leitfaden je Stufe, `prompts/stufe_*.md`, je 15): Person schweigt lange, antwortet knapp oder weicht aus,
schweift ab, will flirten, fragt ob Viola ein Mensch ist, Krise oder Suizidgedanken, minderjährig, beleidigend oder übergriffig,
erzählt ungefragt aus geschützten Bereichen, will Daten löschen, fragt nach Kosten, fragt nach anderen Mitgliedern,
Technikprobleme, will lieber schreiben, plus je Stufe eine eigene (Auftakt: mehr Tiefe wünschen; Andante: Rat fürs Liebesleben;
Loge: „bekomme ich sicher einen Vorschlag?“).

---

## 4. Sicherheit und Art.-9-Schutz

**Feste Zusagen unabhängig vom Modell:**

| Fall | Erkennung | Verhalten |
|---|---|---|
| Krise | Regeln (sofort) + `flag_safety` + Sicherheits-Agent | Hinweis an das Modell; fehlen die Nummern in der Antwort, hängt der Kern den festen Satz an (Telefonseelsorge 0800 1110111, 0800 1110222, 116 123; Notruf 112). Bei „akut“ endet das Gespräch (`krise`). Ereignis `crisis_resources` an die Oberfläche. Keine Auswertung, kein Profil. |
| Minderjährig | Regeln + Modell | Freundlich beenden (`minderjaehrig`), Hinweis „hoch“, kein Profil (SQL lehnt Profil-Speichern ab). |
| Beleidigung/Übergriff | Regeln + Modell | Erstes Mal Grenze, zweites Mal Ende (`missbrauch`) mit festem Satz. |
| Gewalt | Regeln + Modell | Hinweis, Notruf 110/112 nennen. |

Sicherheits-Hinweise landen in `safety.safety_flags` (`source = 'agent'`, `details` nur Sitzung, Erkennungsweg, Nummer des
Beitrags – kein Freitext), gleiche Art je Sitzung wird zusammengeführt, `interview_sessions.safety_flagged = true`.

**Art. 9 (und Art. 10):** Viola fragt nie nach Gesundheit, Religion, Politik, Gewerkschaft, Herkunft, Sexualität, Geschlecht oder
gesuchtem Geschlecht, Genetik/Biometrie, Straftaten. Erzählt die Person davon, nimmt Viola es zur Kenntnis, ohne nachzufragen.
Gespeichert wird es nie:

1. Regeln (`art9_patterns.json`, ca. 125 Muster, im Zweifel streng) – im Werkzeug `note_profile_fact`, in `propose_summary`, in
   der Auswertung, im Transkript (Sätze werden durch „[geschützte Angabe entfernt]“ ersetzt; Ausnahme: Beiträge mit
   Sicherheits-Treffer bleiben für Benns Prüfung wörtlich – Frist siehe B5).
2. Gegenprüfung durch das Modell (`prompts/art9_pruefung.md`) für Umschreibungen. Fällt sie aus, gilt die sparsame Variante:
   nur Wünsche und Deal-Breaker-Arten werden gespeichert.
3. Die Datenbank prüft beim Speichern erneut (`app.art9_categories`) und lehnt Treffer ab (`art9_content`) – auch bei
   Korrekturen durch die Person selbst. Die Muster sind identisch (ein pytest vergleicht Migration und JSON;
   `scripts/sync_art9.py` überträgt Änderungen).
4. Gesuchtes Geschlecht: Zusammenfassungen sind geschlechtsneutral („das Gegenüber“); Formulierungen wie „sucht eine Frau“
   werden abgelehnt (EuGH C-184/20, PLAN 3.2 Nr. 4).

---

## 5. Claude Sonnet 5.5 – Einstellungen

- Modell aus `voice.llm_model_id` = `eu.anthropic.claude-sonnet-5-5`, Client `AsyncAnthropicBedrockMantle(aws_region="eu-central-1")`.
- `thinking: {"type": "between_tools"}` (niedrigste Stufe; `disabled` lehnt Sonnet 5.5 ab) mit `output_config.effort = "low"`.
  Hintergrund-Agenten: `thinking: adaptive`, `effort` aus `analysis.llm_effort` (medium), strukturierte Ausgabe
  (`output_config.format` mit JSON-Schema).
- Nie `temperature`, `top_p`, `top_k` (Test prüft den gesendeten Request).
- `tool_choice: auto`, fünf Werkzeuge mit `strict: true`. `eager_input_streaming` ist aus (sonst prüft die API die Eingaben nicht);
  Schalter `VIOLA_EAGER_TOOL_STREAMING`.
- Prompt-Caching: fester Systemtext je Art/Stufe/Anrede mit Breakpoint, Verlauf über automatisches Caching. Sitzungsdaten
  stehen in der ersten Nachricht, nicht im Systemtext.
- Verlauf wird nur angehängt (preserved thinking); thinking-Blöcke gehen unverändert zurück; Hinweise als mid-conversation
  `system`-Nachricht (Ausweichweg `VIOLA_SYSTEM_NOTICES=user_text`). Bei Unterbrechung hält der Kern den Verlauf gültig.
- `stop_reason: refusal` → fester Satz „Darauf kann ich nicht eingehen …“. Serverseitiges `fallbacks` gibt es auf Bedrock nicht;
  ein Ausweichmodell wäre ein anderer Datenweg und ist bewusst nicht eingebaut.

---

## 6. Lokal ausprobieren (ohne Zugänge)

```bash
cd services/viola
uv sync                                   # Python 3.12
uv run viola demo                         # Gespräch im Terminal mit Attrappen (Sie); --du für Du
uv run pytest                             # alle Tests ohne Netz
uv run ruff check src tests blindtest scripts && uv run mypy

# Textmodus als Server mit Attrappen:
export VIOLA_TEXT_TOKEN_SECRET=$(python -c "import secrets;print(secrets.token_hex(32))")
uv run viola text-server &                # http://localhost:8352
TOKEN=$(uv run viola dev-token 00000000-0000-0000-0000-000000000001)
curl -s -X POST -H "Authorization: Bearer $TOKEN" localhost:8352/v1/text/sessions/00000000-0000-0000-0000-000000000001/start
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"text":"Ja, gern."}' localhost:8352/v1/text/sessions/00000000-0000-0000-0000-000000000001/messages
```

Datenbank und Edge Functions (aus dem Repo-Wurzelordner):

```bash
DB_PORT=54352 DB_CONTAINER=fermata-db-viola bash scripts/db.sh test          # Migrationen + pgTAP
cd supabase/functions && DB_PORT=54352 deno test --allow-env --allow-net --allow-read \
  interview-token interview-agent interview-summary _shared/interview
```

Ende zu Ende lokal (Test-Datenbank + Edge Functions über `dev-server.ts` auf Port 54351 + Textdienst auf 8354, Attrappe als
Sprachmodell): `cd services/viola && bash scripts/e2e_local.sh` – legt eine Person an, holt `interview-token`, führt ein kurzes
Gespräch, beendet es und zeigt Sitzung, Transkript (KI-Hinweis zuerst, Art.-9-Satz ersetzt, Löschung nach 30 Tagen) und
Kostenzeile. Mit echter Datenbank: `VIOLA_BACKEND=http`, `INTERVIEW_AGENT_URL`, `INTERVIEW_AGENT_SECRET` setzen.

---

## 7. Umgebungsvariablen

Vollständig mit Erklärungen: `services/viola/.env.example`. Die wichtigsten:

| Variable | Wo | Zweck |
|---|---|---|
| `INTERVIEW_AGENT_SECRET` | Viola + Supabase-Secrets | Geheimnis für `interview-agent` (≥ 32 Zeichen, Vergleich in konstanter Zeit) |
| `VIOLA_TEXT_TOKEN_SECRET` | Viola + Supabase-Secrets | Signatur des Zugangs zum Textmodus (HS256, ≥ 32 Zeichen) |
| `VIOLA_TEXT_URL` | Supabase-Secrets | öffentliche Adresse des Textdienstes (für `interview-token`) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | beide | LiveKit-Zugang; Token wird in der Edge Function mit WebCrypto signiert |
| `LIVEKIT_AGENT_NAME` | beide | Name des Agenten für den Auftrag (Standard `viola`) |
| `SUPABASE_JWT_SECRET` oder `SUPABASE_URL` | Supabase | Prüfung der Mitglieder-Tokens (HS256 bzw. JWKS für ES256/RS256) |
| `VIOLA_LLM_PROVIDER`, `VIOLA_AWS_REGION` | Viola | `bedrock` in eu-central-1 (Produktion erzwingt EU) |
| `DEEPGRAM_API_KEY`, `DEEPGRAM_URL` | Viola | Spracherkennung, EU-Endpunkt (Produktion erzwingt EU) |
| `VIOLA_ENV=production` | Viola | verbietet Attrappen, verlangt EU-Wege |

---

## 8. API-Vertrag für die Web-App

### 8.1 Gespräch anfragen: `POST /functions/v1/interview-token`

Header `Authorization: Bearer <Supabase-Zugangstoken>`. Body:

```json
{ "kind": "erstgespraech", "mode": "voice", "evening_id": null, "continues_session_id": null }
```

`kind`: `erstgespraech` | `vertiefung` | `nachbesprechung` (mit `evening_id`) | `korrektur`; `mode`: `voice` | `text`.

Antwort 200:

```json
{
  "session": { "id": "…", "kind": "erstgespraech", "mode": "voice", "address_form": "sie", "tier_depth": "auftakt",
               "room_name": "…", "expires_at": "…", "max_minutes": 30, "continues_session_id": null, "evening_id": null,
               "ai_notice_version": "2026-10-03" },
  "ai_notice": "Sie sprechen gleich mit Viola. Viola ist eine künstliche Intelligenz, kein Mensch. Ihre Stimme wird nicht aufgezeichnet.",
  "voice": { "url": "wss://…", "token": "<LiveKit-JWT>", "room": "<session id>", "identity": "person-<session id>" },
  "text":  { "url": "https://viola…/v1/text/sessions/<id>", "token": "<JWT>", "expires_at": "…" }
}
```

(`voice` nur bei `mode=voice`, `text` nur bei `mode=text`.) Der Hinweis `ai_notice` wird vor dem Verbinden angezeigt.

Wechsel einer laufenden Sitzung zu Text: Body `{"session_id": "<eigene offene Sitzung>", "mode": "text"}` → gleiche Antwort
mit `text` (keine neue Sitzung; 404 bei fremder, 409 `session_closed` bei beendeter Sitzung).

Fehler (`{"error": code}`): 401 `not_authenticated`; 403 `consent_missing`, `not_verified`, `suspended`, `account_inactive`,
`kind_not_allowed`; 422 `invalid_kind`, `invalid_mode`, `evening_not_eligible`, `invalid_continuation`, `no_profile_yet`;
409 `session_active`; 429 `daily_limit`; 503 `voice_unavailable` (dann Text anbieten), `text_unavailable`; 400 bei ungültigen IDs.
Eine neue Anfrage beendet eine noch nicht begonnene ältere Anfrage derselben Person.

### 8.2 Stimme (LiveKit) und `<fermata-atem>`

Mit `voice.url` und `voice.token` dem Raum beitreten (livekit-client), Mikrofon veröffentlichen. Der Agent wird über das Token
beauftragt und spricht zuerst (KI-Hinweis, nicht unterbrechbar).

- **Zustände für `<fermata-atem>`:** Teilnehmer-Attribut `lk.agent.state` des Agenten (LiveKit Agents):
  `initializing` → `ruhig`, `listening` → `hoert`, `thinking` → `denkt`, `speaking` → `spricht`; Mikrofon stumm oder Pause → `pause`.
  `atem.connectAudio(<Audio-Element des Agenten>)` legt die Lautstärke live auf die Animation (nur im Browser, keine Aufnahme).
- **Untertitel:** LiveKit sendet Transkriptionen in den Raum (Text-Streams), nur an die Person; sie werden nicht gespeichert.
- **Ereignisse** als Datenpakete, Topic `viola`, JSON:
  `{"type":"ai_notice","spoken":true}`, `{"type":"summary_proposed","text":"…","partial":false}`,
  `{"type":"crisis_resources","lines":{"telefonseelsorge":["0800 1110111","0800 1110222","116 123"],"notruf":"112"}}`
  (dauerhaft sichtbar anzeigen), `{"type":"switch_to_text","reason":"wunsch_der_person"}` (Viola hat auf Wunsch zu Text
  gewechselt), `{"type":"ended","reason":"fertig","summary_pending":true}`.
- **Knopf „Text statt Stimme“:** Datenpaket `{"type":"switch_to_text"}` mit Topic `viola` an den Agenten senden, Raum verlassen,
  dann `interview-token` mit `{"session_id": "<id>", "mode": "text"}` aufrufen (Zugang zum Textmodus für dieselbe, noch offene
  Sitzung; keine neue Sitzung) und den Textmodus starten (8.3). Dasselbe nach dem Ereignis `switch_to_text`. Der Textdienst setzt
  mit dem bisherigen Verlauf fort. Verlässt die Person den Raum ohne Wechsel, endet die Sitzung mit `technik` und kann fortgesetzt
  werden (`continues_session_id`).

### 8.3 Textmodus

Basis `text.url`, Header `Authorization: Bearer <text.token>`.

| Aufruf | Antwort |
|---|---|
| `POST …/start` | `{session_id, phase, ended, end_reason, address_form, remaining_seconds, covered_blocks, resumed, ai_notice: true, messages: [{role: "viola", text}]}` – Begrüßung mit KI-Hinweis; erneuter Aufruf liefert sie wieder (`resumed: true`) |
| `POST …/messages` `{"text": "…"}` (1–2000 Zeichen) | `{…Zustand, messages: [{role: "viola", text}], events: [{type, …}]}` |
| dasselbe mit `Accept: text/event-stream` | Server-Sent Events: `event: sentence` `{"text"}` je Satz, dann `event: event` je Ereignis, zum Schluss `event: done` mit dem Zustand |
| `POST …/end` | Person beendet; Zustand + Ereignisse |
| `GET …` | Zustand |

Ereignisse wie bei der Stimme (`summary_proposed`, `crisis_resources`, `ended`). Fehler: 401 `invalid_token`/`not_authenticated`,
403 `wrong_session`, 409 `not_started`/`session_ended`/`session_closed`, 422 bei zu langem Text, 429 `too_many_messages`,
503 `text_not_configured`. Nach einem Neustart des Dienstes antwortet `messages` mit 409 `not_started`: dann `start` erneut aufrufen
(die Sitzung wird mit dem gespeicherten Verlauf fortgesetzt). Ohne Nachricht für 20 Minuten endet die Sitzung mit `technik`
(fortsetzbar). Nach `ended` mit `summary_pending: true` läuft die Auswertung im Hintergrund (Sekunden bis etwa eine
Minute); die Web-App fragt `interview-summary` ab, bis `summary_status = "draft"` – oder bis `analysis_status` `failed` bzw.
`skipped` ist und kein Entwurf kam (dann freundlich anbieten, das Gespräch später fortzusetzen).

### 8.4 Zusammenfassung: `/functions/v1/interview-summary`

- `GET ?session_id=…` → `{session_id, kind, status, summary_status, summary_draft, summary_confirmed_at, covered_blocks, end_reason, address_form, analysis_status, summary_version}` (nur eigene Sitzungen, sonst 404).
- `POST {"session_id": "…", "action": "confirm" | "correct" | "reject", "text": "… (nur bei correct, 20–4000 Zeichen)"}`
  → `{session_id, summary_status, summary_version}`. Bestätigt/korrigiert: `profile_core.summary_text`, `summary_version + 1`,
  `summary_confirmed_at`.
- Fehler: 404 `session_not_found`, 409 `no_draft`, 422 `invalid_action`, `invalid_text`, `art9_content` (dann steht in `message`
  die Kategorie, z. B. `gesundheit` oder `religion,politik`; Vorschlag für die Oberfläche: „Angaben zu Gesundheit, Religion …
  gehören nicht in die Zusammenfassung. Sie können sie, wenn Sie möchten, im geschützten Bereich machen.“).

### 8.5 Direkt lesbar (RLS, nur eigene Zeilen)

`app.interview_sessions` (Zustand, Entwurf, Gründe), `app.interview_transcripts` (Transkript als Text, Art.-9-Sätze ersetzt,
Löschung nach 30 Tagen). Schreiben nur über die Functions.

---

## 9. Interne Schnittstelle `interview-agent`

`POST` mit Header `x-agent-secret`, Body `{"action", "session_id", …}`; jede Aktion ruft genau eine SQL-Funktion in der Rolle
`fermata_agent`:

| Aktion | Felder | SQL-Funktion |
|---|---|---|
| `context` | – | `api.agent_session_context` (Sitzung, Einstellungen, Profil, Fortsetzung, Abend nur Zeit/Lokal, Beiträge bei Wiederaufnahme) |
| `start` | – | `api.agent_start_session` (prüft Einwilligung und Sperre erneut) |
| `ai_notice` | `version` | `api.agent_mark_ai_notice` |
| `append_turns` | `turns: [{role, text, at?, mode?}]` (≤ 50) | `api.agent_append_turns` |
| `summary_draft` | `text`, `covered_blocks?` | `api.agent_save_summary_draft` (Art.-9-Prüfung) |
| `analysis` | `analysis` | `api.agent_save_analysis` (Art.-9-Prüfung, Grenzen, Gewichte = 1) |
| `analysis_status` | `status` (`skipped`/`failed`) | `api.agent_mark_analysis` |
| `safety_flag` | `kind`, `severity`, `detector?`, `turn_index?` | `api.agent_flag_safety` |
| `costs` | `costs` | `api.agent_record_costs` |
| `switch_mode` | `mode` | `api.agent_switch_mode` |
| `end` | `reason`, `covered_blocks?` | `api.agent_end_session` |

---

## 10. Datenbank

**Neue Einstellungen** (`ops.app_settings`, Kategorie `gespraech` bzw. `sicherheit`):
`voice.wrapup_minutes` (4), `voice.grace_minutes` (2), `voice.silence_prompt_seconds` (15), `voice.max_silence_prompts` (2),
`voice.max_sentences` (3), `voice.livekit_path` (`C`, Platzhalter B3), `voice.prices` (Platzhalter, Abschnitt 11),
`interview.tier_depth` (Platzhalter), `interview.kinds_by_tier` (Platzhalter), `interview.max_sessions_per_day` (6),
`interview.request_ttl_minutes` (15), `interview.text_max_session_minutes` (60), `interview.continuation_days` (7),
`interview.safety_transcript_retention_days` (30, Platzhalter B5), `interview.ai_notice_version` (`2026-10-03`),
`interview.redact_art9_in_transcripts` (true), `analysis.llm_effort` (`medium`). Die frühere Einstellung `safety.crisis_lines`
ist seit der Härtung (`20261003000903_links_settings.sql`) gelöscht: `api.agent_session_context` liefert `crisis_lines`
(gleiches Format `[{name, number}]`) aus `safety.crisis_lines()`, also aus denselben Einstellungen wie der Hilfe-Knopf
(`safety.telefonseelsorge_numbers`, `safety.ambulance_number`). Viola selbst ändert sich dadurch nicht.

**Neue Spalten** an `app.interview_sessions`: `continues_session_id`, `covered_blocks`, `expires_at`, `last_activity_at`,
`ai_notice_version`, `mode_switched_at`, `analysis_status`, `analyzed_at`; höchstens eine offene Sitzung je Person.

**Funktionen:** Mitglied: `api.interview_request`, `api.interview_text_access` (Wechsel zu Text), `api.interview_confirm_summary`, `app.art9_categories(_jsonb)`. Agent:
`api.agent_*` (nur `fermata_agent`, `service_role`). Cron: `ops.expire_interview_sessions` alle 10 Minuten (verfallene Anfragen,
hängende Sitzungen), Transkript-Löschung `ops.purge_transcripts` stündlich (bestehend). `EXECUTE` für `PUBLIC` ist in `app`,
`api`, `ops` entzogen; jede aufrufbare Funktion hat eine ausdrückliche Berechtigung.

**Härtung:**
- **Transkript im Sicherheitsfall:** nur `api.admin_safety_transcript(p_session_id, p_reason)` (Admin mit Zwei-Faktor, offener
  Hinweis oder offene Meldung zur Person, Begründung, Audit ohne Inhalt; Einzelheiten in `sicherheit.md` Abschnitt 4).
- **Entwurf der Zusammenfassung** (`summary_draft`) wird 30 Tage nach Bestätigung, Korrektur, Verwerfen bzw. Ende des Gesprächs
  geleert (`retention.summary_draft_days`, Job `fermata-retention`).
- Die Functions `interview-token`, `interview-agent`, `interview-summary` laufen mit `FERMATA_DB_ROLE=fermata_edge`; der
  Wechsel in `authenticated` bzw. `fermata_agent` je Anfrage bleibt (die Login-Rolle muss Mitglied sein, `RUNBOOK.md` Abschnitt 5).

---

## 11. Kostenmodell und Antwortzeit

**Preisannahmen** (Einstellung `voice.prices`, USD, Umrechnung 0,86 €/$ – alles Platzhalter, vor dem Start mit den gültigen
Preislisten abgleichen):

| Posten | Annahme | Quelle |
|---|---|---|
| Claude Sonnet 5.5 | 2,20 $ / 11 $ je 1 Mio. Token (ein/aus), Cache lesen 0,22 $, Cache schreiben 2,75 $ | Anthropic-Listenpreis 2 $/10 $ (Cache 0,20 $/2,50 $) plus 10 % für regionale Endpunkte (PLAN 5.1); Bedrock-Preisliste prüfen |
| Deepgram Nova-3 Streaming | 0,0077 $ je Minute gesendeten Audios | Deepgram-Preisseite (Pay as you go), EU-Endpunkt ggf. anders |
| Amazon Polly Generative | 30 $ je 1 Mio. Zeichen | AWS-Preisseite Polly |
| Google Chirp 3 HD | 30 $ je 1 Mio. Zeichen | Google-Cloud-Preisseite TTS |
| Cartesia / ElevenLabs | 40 $ / 100 $ je 1 Mio. Zeichen | grobe Annahme aus Tarifen, nur Platzhalter |
| LiveKit | A: 0,01 $/Agent-Minute über dem Kontingent; B: wie A bei voller Auslastung; C: 0,001 $/Minute (Server und Datenverkehr, geschätzt) | PLAN 5.4 |

**Beispiel je Gesprächsstunde** (90 Antworten, je 5.000 Token aus dem Cache, 1.000 neu, 130 Ausgabe; 25 Minuten echte Sprache der
Person; 90 × 180 Zeichen Stimme; Weg C): Sprachmodell 0,43 $, Spracherkennung 0,19 $, Stimme 0,49 $, Medien 0,06 $ = 1,16 $ ≈
**1,00 €** (Weg A: ≈ 1,52 €). Ohne Sprach-Tor kämen ca. 0,27 $ für Stille dazu. Die Auswertung nach jedem Gespräch kostet
zusätzlich wenige Cent. Ziel `voice.target_cost_eur_per_hour` = 2 €. Ein Test rechnet dieses Beispiel nach.

**Kostenprotokoll** je Sitzung in `ops.session_costs`: Minuten, STT-Sekunden (nur gesendetes Audio), Token ein/aus/Cache
lesen/schreiben (Gespräch + Auswertung), TTS-Zeichen, Medienminuten, Betrag in Euro, Antwortzeit Median und 90-%-Wert; in
`details`: Modus, Züge, Anbieter, LiveKit-Weg, € je Stunde, Anteil unter dem Ziel, Zeit bis zum ersten Token, Kürzungen,
Ablehnungen.

**Antwortzeit-Budget** (Ziel: 90 % unter 2 s, `voice.latency_target_ms_p90`):

| Schritt | Annahme |
|---|---|
| Ende der Äußerung erkennen (VAD + Endpointing `min_delay` 0,5 s) | 0,5–0,6 s |
| Deepgram-Endergebnis (Finalize beim Schließen des Sprach-Tors) | 0,1–0,3 s |
| Sonnet 5.5 bis zum ersten Satz (between_tools, effort low, Cache) | 0,5–1,0 s, EU-Geo-Profil kann schwanken |
| Polly bis zum ersten Ton (Frankfurt) | 0,2–0,4 s |
| Netz/WebRTC | 0,05–0,1 s |

Gemessen wird je Zug ab dem Moment, in dem die Antwort angefordert wird (nach dem Endpointing), bis zum ersten Ton der Stimme;
im Text bis zum ersten fertigen Satz. Für den Vergleich mit dem Blindtest-Kriterium kommt das Endpointing (ca. 0,5 s) hinzu.
Stellschrauben: `min_delay`, kurzer erster Satz, Prompt-Caching, Stimme mit Streaming.

---

## 12. Stimmen-Blindtest (Frage B4)

1. Sprachproben erzeugen (mit Zugängen zu den Anbietern; ohne Netz mit `fake:` zum Ausprobieren):
   `uv run python -m blindtest.blindtest render --stimmen polly:Vicki,google:de-DE-Chirp3-HD-Aoede --out blindtest/ausgabe --seed 42`
   Ergebnis: `audio/*.wav`, `index.html`, `antwortzeiten.json` (Zeit bis zum ersten Ton je Satz) und `schluessel.json`
   (Zuordnung Buchstabe → Anbieter – nicht weitergeben). Cartesia und ElevenLabs nur nach Entscheidung B4 (ohne Enterprise kein
   EU-Datenweg).
2. Den Ordner (ohne `schluessel.json`) an **12–16 Testpersonen** geben, z. B. als ZIP oder auf einem internen Webspace. Die
   Personen öffnen `index.html`, setzen Kopfhörer auf, hören jeden der zehn Sätze in jeder Stimme (Reihenfolge je Person
   gemischt), bewerten jede Stimme von 1 bis 5, wählen je Satz und insgesamt einen Favoriten und klicken „Ergebnis speichern“.
   Es entsteht eine Datei `blindtest-<zufall>.json` ohne Namen; sie schicken sie an Benn. Die Seite lädt nichts nach und setzt
   keine Cookies. Dauer: ca. 10–15 Minuten.
3. Auswerten: `uv run python -m blindtest.blindtest aggregate --ergebnisse ergebnisse/*.json --schluessel blindtest/ausgabe/schluessel.json --zeiten blindtest/ausgabe/antwortzeiten.json`
   → Tabelle mit Mittelwert, Anzahl, Favoriten je Satz und insgesamt, Median und 90-%-Wert der Antwortzeit je Anbieter.
   Unter 12 Personen weist die Tabelle auf die geringe Aussagekraft hin.
4. Gewinner als `voice.tts_provider` / `voice.tts_voice` eintragen; danach kann die Hörprobe der Landingpage entstehen.

---

## 13. Betrieb (AWS Frankfurt)

- **Abbild:** `services/viola/Dockerfile` (python:3.12-slim, eigener Benutzer 10001, kein Schreibzugriff nötig). Zwei ECS/Fargate-
  Dienste aus demselben Abbild in `eu-central-1`: `viola text-server` (hinter einem ALB, HTTPS, Port 8352,
  Gesundheitsprüfung `/healthz`) und `viola voice-worker start` (keine eingehenden Verbindungen; verbindet sich ausgehend mit
  LiveKit; Gesundheitsprüfung Port 8081 mit `VIOLA_HEALTH_PORT=8081`, `VIOLA_HEALTH_PATH=/`).
- **Rechte:** Task-Rolle mit `bedrock:InvokeModel*` nur für das EU-Inference-Profil von Sonnet 5.5 und `polly:SynthesizeSpeech`;
  Geheimnisse aus AWS Secrets Manager; Bedrock-Invocation-Logging ohne Inhalte (PLAN 2.2).
- **Bedrock-Marketplace:** Sonnet 5.5 wird laut AWS-Modellkarte über den AWS Marketplace abgerechnet; im Konto muss das
  Marketplace-Abo einmal abgeschlossen werden (Benn, Runbook), sonst antwortet Bedrock mit einem Zugriffsfehler.
- **Textdienst skalieren:** Gespräche liegen im Speicher einer Instanz; bei mehreren Instanzen Sitzungsbindung am ALB (Cookie)
  oder eine Instanz. Nach einem Neustart setzt der Dienst die Sitzung aus den gespeicherten Beiträgen fort.
- **LiveKit A/B/C:** Der Code ist für alle Wege gleich; es ändern sich nur `LIVEKIT_URL`, Schlüssel und `voice.livekit_path`
  (Kostenschätzung). Standard ist C (selbst betriebener `livekit-server` in Frankfurt: EC2 mit öffentlicher IP, TLS-Zertifikat,
  UDP 50000–60000 und TCP 7881, TURN über TLS 443 für restriktive Netze, Agent-Dispatch ab livekit-server 1.8). Für A/B im
  LiveKit-Projekt Agent und Daten in der EU wählen; B mit Regionsbindung.

---

## 14. Offene Entscheidungen für Benn

| # | Frage | Vorschlag / Stand |
|---|---|---|
| B3 | LiveKit-Weg A, B oder C | C für die Testphase (Daten bleiben in Frankfurt), A für Entwicklung; Einstellung `voice.livekit_path` |
| B4 | Stimme nach Blindtest; Enterprise-Verträge für Cartesia/ElevenLabs? | Blindtest mit Polly und Google; Cartesia/ElevenLabs sind im Echtbetrieb gesperrt, solange `VIOLA_TTS_ENTERPRISE_EU` nicht gesetzt ist |
| B5 | Transkripte bei Sicherheitsfällen länger aufbewahren? | Einstellung `interview.safety_transcript_retention_days` (jetzt 30 = keine Verlängerung); Mechanismus fertig |
| – | AWS Marketplace-Abo für Sonnet 5.5 | Aufgabe für Benn vor dem ersten echten Gespräch |
| – | EU-Geo-Profil über den Mantle-Client | `eu.anthropic.claude-sonnet-5-5` ist eingestellt; ob der Mantle-Endpunkt das `eu.`-Präfix annimmt oder `anthropic.claude-sonnet-5-5` in eu-central-1 erwartet, mit echtem Zugang prüfen (`VIOLA_LLM_MODEL_ID` als Schalter) |
| – | Schwärzen von Art.-9-Sätzen im Transkript | standardmäßig an (sparsam); Sicherheits-Treffer bleiben wörtlich – DSFA-Punkt |
| – | Gesprächsarten je Stufe, Tiefe, Tageslimit | Platzhalter in `interview.kinds_by_tier`, `interview.tier_depth`, `interview.max_sessions_per_day` |
| – | Minderjährig erkannt | jetzt: Hinweis „hoch“ an Benn, kein Profil; keine automatische Sperre (M7 entscheidet) |
| – | Wechsel Stimme → Text | gebaut (`interview-token` mit `session_id`, Datenpaket `switch_to_text`); die neue Textsitzung beginnt die Themenblöcke ab dem letzten gespeicherten Stand, das Modell kennt den bisherigen Verlauf |
| – | `ready_for_matching` | wird von Viola nicht gesetzt; Regel gehört in M4 (z. B. bestätigte Zusammenfassung + Fahrbereitschaft) |
| – | Krisennummern | eine Quelle seit der Härtung (`safety.telefonseelsorge_numbers`, `safety.ambulance_number`) – vor dem Start erneut prüfen (M9) |
| – | Neue Fassung `gespraech` | `app.has_consent` prüft keine Fassung: Wer der alten Fassung zugestimmt hat, kann weiter sprechen; `api.my_consents` meldet `needs_renewal`. Vor dem Start gibt es keine echten Zustimmungen – sollte der Anwalt eine harte Sperre bis zur erneuten Zustimmung wollen, in `api.interview_request` die Fassung prüfen |

---

## 15. Abweichungen vom PLAN

- **Antworten nicht über das LiveKit-Bedrock-Plugin**, sondern über den eigenen Gesprächskern mit dem Anthropic-SDK
  (Bedrock-Mantle-Client). Grund: Sonnet-5.5-Parameter (`between_tools`, `effort`, strenge Werkzeuge, Caching, nur anhängen)
  und dieselben Regeln in Stimme und Text. Das Converse-Plugin hätte `temperature` und die Werkzeug-Steuerung selbst gesetzt.
- **Zusammenfassung zweistufig:** Viola schlägt im Gespräch eine kurze Zusammenfassung vor (Bestätigung im Gespräch); der
  Entwurf zum Bestätigen in der App kommt vom Hintergrund-Agenten (fällt er aus, Violas Vorschlag).
- **Transkripte werden geschwärzt** (Art.-9-Sätze), über PLAN 2.2 hinaus („auf Nummer sicher“).
- **Sicherheits-Hinweise ohne Freitext** (nur Art, Dringlichkeit, Beitragsnummer).
- **Eigene Einstellungen** für Tiefe je Stufe, Gesprächsarten je Stufe, Tageslimit, Nachfrist, Preise (siehe Abschnitt 10).
- **Freie Zeiten** im Erstgespräch nur grob (Wochentage, Notiz in `life_circumstances`); die Fenster je Zeitraum fragt M5 ab.

---

## 16. Tests

| Prüfung | Befehl | Stand |
|---|---|---|
| Python (Kern, Prompts, Sie/Du, Werkzeuge, Art. 9, Sicherheit, Kosten, Claude-Anbindung, Rückweg, Textmodus, Stimme, Blindtest) | `cd services/viola && uv run pytest` | 338 bestanden |
| Lint und Typen | `uv run ruff check src tests blindtest scripts && uv run mypy` | sauber |
| pgTAP (inkl. Kern) | `DB_PORT=54352 DB_CONTAINER=fermata-db-viola bash scripts/db.sh test` | 3 Dateien, 121 Prüfungen (Viola: 78) |
| Deno (Edge Functions) | siehe Abschnitt 6 | 22 bestanden |
| Ende zu Ende (lokal) | `bash scripts/e2e_local.sh` | Token → Textdienst → interview-agent → SQL geprüft |
| Container | `docker build services/viola` | baut; läuft schreibgeschützt als Benutzer 10001 |
| Tonalität | `pnpm check:tone` | sauber |
