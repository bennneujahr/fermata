# Platzhalter und offene Entscheidungen

Alles, was im Code als Platzhalter steht oder eine Entscheidung von Benn braucht. Jeder Punkt nennt, **wo** er im Code
steckt und **was passiert, wenn du nichts entscheidest** (der eingebaute Standard). Fast alles ist eine Einstellung in
`ops.app_settings` und lässt sich ohne Code-Änderung umstellen (Admin → Einstellungen).

Die Fragen A2–A9 und B1–B15 stammen aus [PLAN.md](../PLAN.md), Abschnitt 6.

## Zuerst entscheiden (in dieser Reihenfolge)

**Damit die Landingpage live gehen kann**

1. **Domain und Markenrecherche** (A3, PLAN 5.3): Domain festlegen, vorher Marke „Fermata“ prüfen lassen (DPMA, EUIPO, WIPO).
2. **Impressum, Preise, Startmonat, Einwilligung** (A5, A7, A8, A9): Kontaktdaten, Umsatzsteuer-Modus, Preisanzeige.
3. **Rechtstexte prüfen lassen** (`docs/recht/`, alles ENTWURF): Anwalt und externer Datenschutzbeauftragter (B15).
4. **Konten anlegen**: Supabase (Frankfurt), Vercel, Brevo mit SPF/DKIM/DMARC – Schritte in [RUNBOOK.md](RUNBOOK.md).

**Damit die Testphase mit echten Abenden starten kann**

5. **Ausweisprüfung**: Didit-Sandbox, Format des Webhooks prüfen; Alternative ohne Biometrie (B2).
6. **Sprachmodell und Auswertung**: AWS-Marketplace-Abo für Sonnet 5.5, Weg über das EU-Geo-Profil oder nur
   Frankfurt; deutsche Qualität der Embeddings mit 20–30 echten Zusammenfassungen testen.
7. **Viola**: LiveKit-Weg (B3) und Stimme nach Blindtest mit 12–16 Personen (B4).
8. **Mitgliedschaft**: Loge in der Testphase (B11), „kein Abend“ (B12), Wertersatz (B13), Leistungsbeginn (C12),
   Erstattung bei Kontolöschung (C15), Umsatzsteuer.
9. **Lokale**: Partner-Lokale und Vereinbarungen (B10), Nachbesprechung (B6), Erkennungsfoto (B7), Gutschriften (B8),
   Nichterscheinen (B9).
10. **Auswahl**: Wartebonus, Gewichte, LLM-Anteil, Sperrfrist nach Ablehnung, Standard-Entfernung (C4–C6 und
    [matcher.md §18](bereiche/matcher.md)).
11. **Löschfristen** (C11) und Höchstdauer für das Audit-Protokoll.
12. **Betrieb**: eigene Datenbankrolle für die Edge Functions einrichten (C14), Vertretung für Sicherheitsfälle
    benennen ([RUNBOOK.md §9](RUNBOOK.md)).

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
| C10 | Einwilligung „Gesundheit“ (`art9_health`) | `account.consents_not_offered` = `["art9_health"]`, `app.consent_kinds_offered()`, Text `art9_health` auf `abgeloest` (`20261003000900`, `…000906`) | In Phase 1 **nicht angeboten**: Fermata speichert keine Gesundheitsangaben und fragt nicht danach (datensparsam). Die Art bleibt in `app.consents` erlaubt und widerrufbar. Zurückholen nur mit klarem Zweck, Eingabe und neuem Text |
| C11 | Löschfristen | `retention.reports_months` 24, `retention.safety_flags_months` 24, `retention.stripe_events_months` 13, `retention.notifications_log_months` 12, `retention.auth_audit_days` 30, `retention.contract_actions_years` 6 (ab Ende des Kalenderjahres, nur gelöschte Konten); ohne Rechtsfrage: `retention.safety_mail_days` 30, `retention.contract_requests_days` 30, `retention.availability_days` 30, `retention.summary_draft_days` 30, `retention.flag_hashes_days` 30 (`20261003000905_retention.sql`) | Werte aus dem Auftrag der Härtung bzw. vorsichtig gewählt; Anwalt/Steuerberatung bestätigen (Vertragsunterlagen: 3 Jahre Verjährung vs. 6/8 Jahre HGB/AO) |
| C12 | Erklärung zum Leistungsbeginn vor Ende der Widerrufsfrist | `billing.start_request_text`, `billing.start_request_version` = `2026-10-03-entwurf` | Wortlaut: „Ich verlange ausdrücklich, dass Fermata vor Ende der Widerrufsfrist mit der Leistung beginnt. Mir ist bekannt, dass ich bei einem Widerruf Wertersatz für bereits genutzte Abende leisten muss.“ (ENTWURF, Anwalt). Bei jeder Änderung neue Fassung setzen |
| C13 | Seiten der Web-App für Links aus Mails | `safety.trust_view_base_url` = `https://app.fermata.example/teilen` (Link `…#t=<Schlüssel>`), Lokal-Bestätigung `<FERMATA_APP_URL>/lokal/bestaetigen#t=<Schlüssel>` (`_shared/notify/dispatch.ts`) | Domain folgt aus Frage A3; die Seiten `/teilen` und `/lokal/bestaetigen` baut die Web-App und spricht `trust-view` bzw. `venue-confirm` mit `Accept: application/json` an |
| C14 | Rolle der Edge Functions | `FERMATA_DB_ROLE` = `fermata_edge`, `FERMATA_DB_URL` mit Login-Rolle `fermata_edge_login` (RUNBOOK Abschnitt 5) | Empfohlen statt `service_role`, weil `service_role` im Supabase-Abbild Vault lesen darf. Ohne die Variablen verbinden sich die Functions weiter als `postgres` |
| C15 | Kontolöschung bei laufender Mitgliedschaft | `account-delete`, `billing.record_deletion_cancellation` | Abo endet sofort, **ohne anteilige Erstattung** des laufenden Zeitraums; Nachweis ohne Name und E-Mail. Anwalt: Erstattung nötig (§ 627/§ 628 BGB)? Die Web-App sollte vor dem Löschen darauf hinweisen |

## D. Offene Punkte je Bereich

Jeder Bereich führt seine Detailfragen selbst; hier die Verweise:

| Bereich | Abschnitt |
|---|---|
| Landingpage und Warteliste | [landing.md – Platzhalter und offene Entscheidungen](bereiche/landing.md) |
| Web-App, Anmeldung, Ausweis | [web.md – Für Benn: offene Punkte](bereiche/web.md) |
| Viola | [viola.md §14](bereiche/viola.md) |
| Auswahl-Job | [matcher.md §18](bereiche/matcher.md) |
| Abende, Lokale, Benachrichtigungen | [abende.md §8](bereiche/abende.md) |
| Mitgliedschaft und Zahlung | [mitgliedschaft.md §10](bereiche/mitgliedschaft.md) |
| Sicherheit | [sicherheit.md §11](bereiche/sicherheit.md) |
| Rechtstexte, DSFA, Löschkonzept | „Offene Punkte“ am Ende jedes Dokuments in [docs/recht/](recht/README.md) |
| Start | [STARTCHECKLISTE.md](STARTCHECKLISTE.md) |
