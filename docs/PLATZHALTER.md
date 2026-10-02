# Platzhalter und offene Entscheidungen

Alles, was im Code als Platzhalter steht oder eine Entscheidung von Benn braucht. Jeder Punkt nennt, **wo** er im Code
steckt und **was passiert, wenn du nichts entscheidest** (der eingebaute Standard). Fast alles ist eine Einstellung in
`ops.app_settings` und lässt sich ohne Code-Änderung umstellen (Admin → Einstellungen).

Die Fragen A2–A9 und B1–B15 stammen aus [PLAN.md](../PLAN.md), Abschnitt 6.

## A. Vor der Live-Schaltung der Landingpage

| # | Frage | Wo im Code | Standard bis zur Entscheidung |
|---|---|---|---|
| A1 | Freigabe des Plans als Ganzes | – | Bau nach PLAN.md, Fassung 2 |
| A2 | Wo liegt der Code? | erledigt: GitHub `bennneujahr/fermata` | – |
| A3 | Domain | Einstellungen `site.domain`, `site.app_url`, `notify.mail_from_address`; CSP in `apps/landing/vercel.json` | `fermata.example` |
| A4 | Hörprobe in M1 | Einstellung `landing.hoerprobe_enabled` | aus (Abschnitt ausgeblendet) |
| A5 | Umsatzsteuer und Preisanzeige | `landing.vat_mode`, `landing.prices_mode` | „inkl. 19 % USt“, Preise als „geplant“ |
| A6 | Vorteil für Gründungsmitglieder | Landingpage-Texte | nur „Die ersten 500 aus Westmecklenburg werden Gründungsmitglieder.“ |
| A7 | Impressum: E-Mail und Telefon | `site.contact_email`, Impressum-Seite | Platzhalter-Adresse, Seite als ENTWURF markiert |
| A8 | Startmonat der ersten Abende | `site.start_month` | Zeile ausgeblendet |
| A9 | Pflicht-Häkchen der Warteliste | Formular der Landingpage | Pflicht-Häkchen wie in der Design-Datei, Anwalt prüft |

## B. Später (mit Meilenstein)

| # | Frage | Wo im Code | Standard bis zur Entscheidung |
|---|---|---|---|
| B1 | Straße im Formular nötig? | Einstellung `account.collect_street` (M2) | **aus** (Empfehlung: weglassen) |
| B2 | Alternative ohne Biometrie | Onboarding, Schritt Ausweis | Hinweis „folgt“, kein zweiter Weg |
| B3 | LiveKit: Weg A, B oder C | `services/viola` (Umgebungsvariablen) | Konfiguration für C (selbst betrieben), A für Entwicklung |
| B4 | Stimme nach Blindtest | `voice.tts_provider`, `voice.tts_voice` | Amazon Polly „Vicki“ |
| B5 | Transkripte bei Sicherheitsfällen länger aufbewahren | `interview.transcript_retention_days` | 30 Tage für alle |
| B6 | Länge der Nachbesprechung | `evening.debrief_minutes` | Auftakt 0, Andante 10, Loge 20 Minuten |
| B7 | Erkennungsfoto am Abendtag | Finde-Fenster (M5) | kein Foto, nur ein selbst geschriebener Hinweis |
| B8 | Gültigkeit von Gutschriften | `evening.credit_validity_months` | 3 Monate |
| B9 | Folgen wiederholten Nichterscheinens | Abend-Regeln (M5/M6) | Nichterscheinen verbraucht den Abend; keine weitere Sperre |
| B10 | Partner-Lokale und Vereinbarungen | Admin → Lokale, Spalte `agreement` | keine Lokale angelegt |
| B11 | Loge in der Testphase | `billing.loge_in_test_phase` | aus |
| B12 | Definition „kein Abend“ für die Verlängerung | `billing.apply_extension_rule()` (M6) | kein Abend aus Gründen, die die Person nicht zu vertreten hat |
| B13 | Wertersatz-Methode | Widerruf (M6) | 49 € / 74,50 € / 74,75 € je genutztem Abend |
| B14 | Verbraucherschlichtung | Rechtstexte (M8) | Hinweis „nicht bereit und nicht verpflichtet“ als Entwurf |
| B15 | Externer Datenschutzbeauftragter | Datenschutzerklärung (M8) | Platzhalter |

## C. Platzhalter aus dem Bau

Diese Punkte sind beim Bau entstanden, weil der Auftrag (Abschnitte 0–18) und die Design-Datei nicht im Repository
liegen. Bitte mit den Originalen abgleichen.

| # | Platzhalter | Wo | Was ich angenommen habe |
|---|---|---|---|
| C1 | Name der ersten Stufe | `billing.tiers` | „Auftakt“ (49 €, 1 Abend). Andante und Loge stehen im Plan; die Zuordnung 1/2/4 Abende folgt aus den Wertersatz-Beträgen in B13 |
| C2 | Farben, Abstände, Schriften | `packages/tokens/tokens.json` | eigener Entwurf, da die Design-Datei fehlt |
| C3 | Tonalitätsregeln | `scripts/tone-rules.json` | keine Ausrufezeichen, kein Wisch-/Match-Jargon, kein Druck, keine Versprechen, keine Emojis |
| C4 | Wartebonus | `matching.wait_bonus_per_round`, `matching.wait_bonus_max` | 0,02 je Lauf, höchstens 0,10 |
| C5 | Gewichte der Teil-Scores und Anteil der LLM-Bewertung | `matching.weights`, `matching.llm_weight` | Werte 0,30 · Wünsche 0,25 · Persönlichkeit 0,20 · Lebensumstände 0,15 · Zeiten 0,10; LLM 50 % |
| C6 | Größte Entfernung ohne eigene Angabe | `matching.max_distance_km` | 60 km |
| C7 | Gültigkeit des Bestätigungslinks der Warteliste | `waitlist.confirm_token_hours` | 72 Stunden |
| C8 | Dauer eines Abends | `evening.default_duration_minutes` | 120 Minuten |
| C9 | Ruhezeiten für Push | `notify.quiet_hours` | 22–8 Uhr (Sicherheit ausgenommen) |
