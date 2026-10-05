-- Fermata · Startwerte als Einstellungen (PLAN 2.4: „Einstellungen statt fester Zahlen“).
-- Werte mit „PLATZHALTER“ in der Beschreibung sind noch nicht von Benn entschieden (docs/PLATZHALTER.md).
-- Spätere Migrationen ergänzen Einstellungen mit „on conflict do nothing“.

insert into ops.app_settings (key, value, description, category, is_public) values
  -- Umgebung und Marke
  ('site.domain', '"fermata.example"', 'PLATZHALTER (Frage A3): Domain der Landingpage.', 'marke', true),
  ('site.app_url', '"https://app.fermata.example"', 'PLATZHALTER (Frage A3): Adresse der Web-App.', 'marke', true),
  ('site.contact_email', '"hallo@fermata.example"', 'PLATZHALTER (Frage A7): Kontakt-E-Mail für Impressum und Mails.', 'marke', true),
  ('site.start_month', 'null', 'PLATZHALTER (Frage A8): Startmonat der ersten Abende, z. B. "März 2027". null blendet die Zeile aus.', 'marke', true),

  -- Warteliste (PLAN 2.3 Nr. 1, 3.2 Nr. 1–3)
  ('waitlist.rate_limit_per_hour', '5', 'Höchstens so viele Anmeldeversuche je IP-Hash und Stunde.', 'warteliste', false),
  ('waitlist.min_fill_seconds', '3', 'Mindestzeit zwischen Laden und Absenden des Formulars (gegen Bots).', 'warteliste', false),
  ('waitlist.unconfirmed_retention_days', '7', 'Unbestätigte Einträge werden nach so vielen Tagen gelöscht.', 'warteliste', false),
  ('waitlist.attempts_retention_hours', '24', 'Drossel-Einträge werden nach so vielen Stunden gelöscht.', 'warteliste', false),
  ('waitlist.bonus_places', '50', 'So viele Plätze rückt man je bestätigter Einladung vor.', 'warteliste', true),
  ('waitlist.invites_per_person', '1', 'Einladungen je Person zum Start; eine zweite kann nach Nutzung freigeschaltet werden.', 'warteliste', false),
  ('waitlist.founding_limit', '500', 'Die ersten so vielen Bestätigten aus der Gründungsregion werden Gründungsmitglied.', 'warteliste', true),
  ('waitlist.founding_region_group', '"westmecklenburg"', 'Region der Gründungsmitglieder.', 'warteliste', true),
  ('waitlist.confirm_token_hours', '72', 'Gültigkeit des Bestätigungslinks in Stunden.', 'warteliste', false),

  -- Landingpage-Schalter
  ('landing.hoerprobe_enabled', 'false', 'Hörprobe auf der Landingpage zeigen (PLAN 4: erst nach dem Stimmen-Blindtest, Frage A4).', 'landingpage', true),
  ('landing.prices_mode', '"geplant"', 'PLATZHALTER (Frage A5): "geplant" zeigt „Preise geplant, Stand …“, "fest" zeigt die Preise als gültig, "aus" blendet sie aus.', 'landingpage', true),
  ('landing.vat_mode', '"inkl_ust"', 'PLATZHALTER (Frage A5): "inkl_ust" (inkl. 19 % USt) oder "kleinunternehmer" (§ 19 UStG).', 'landingpage', true),

  -- Sicherheit: Heimwegtelefon (geprüft am 03.10.2026, vor Start erneut prüfen – M9)
  ('safety.heimwegtelefon_number', '"030 12074182"', 'Heimwegtelefon, deutschlandweit zum Festnetztarif. Vor dem Start erneut prüfen.', 'sicherheit', true),
  ('safety.heimwegtelefon_hours', '"So–Do 21–01 Uhr, Fr/Sa 21–03 Uhr"', 'Zeiten laut heimwegtelefon.net (Stand 03.10.2026).', 'sicherheit', true),
  ('safety.emergency_number', '"110"', 'Polizei-Notruf.', 'sicherheit', true),
  ('safety.trust_share_hours', '24', 'Ein geteilter Abend ist so viele Stunden nach Beginn nicht mehr abrufbar.', 'sicherheit', false),
  ('safety.checkin_after_minutes', '30', 'Check-in-Nachricht so viele Minuten nach Beginn des Abends.', 'sicherheit', false),
  ('safety.report_response_hours', '24', 'Ziel: Meldungen werden innerhalb so vieler Stunden geprüft.', 'sicherheit', false),

  -- Gespräch mit Viola (PLAN 5.1)
  ('voice.llm_model_id', '"eu.anthropic.claude-sonnet-5-5"', 'Sprachmodell im Gespräch (Bedrock, EU-Profil). Entschieden am 03.10.2026.', 'gespraech', false),
  ('voice.llm_effort', '"low"', 'Denkaufwand für Viola (niedrigste Stufe wegen Antwortzeit).', 'gespraech', false),
  ('voice.llm_thinking', '"between_tools"', 'Denkmodus für Viola (thinking: disabled lehnt Sonnet 5.5 ab).', 'gespraech', false),
  ('analysis.llm_model_id', '"eu.anthropic.claude-sonnet-5-5"', 'Modell für Hintergrund-Agenten, Auswertung und Auswahl-Rubrik.', 'gespraech', false),
  ('voice.stt_model', '"nova-3"', 'Spracherkennung Deepgram, einsprachig Deutsch.', 'gespraech', false),
  ('voice.stt_language', '"de"', 'Sprache der Spracherkennung.', 'gespraech', false),
  ('voice.tts_provider', '"polly"', 'PLATZHALTER (Frage B4): Stimme bis zum Blindtest. polly | google | cartesia | elevenlabs.', 'gespraech', false),
  ('voice.tts_voice', '"Vicki"', 'PLATZHALTER (Frage B4): Stimmenname beim Anbieter.', 'gespraech', false),
  ('voice.max_session_minutes', '30', 'Längste Dauer eines einzelnen Gesprächs; danach Zusammenfassung und neue Sitzung.', 'gespraech', false),
  ('voice.target_cost_eur_per_hour', '2.0', 'Kostenziel je 60 Gesprächsminuten.', 'gespraech', false),
  ('voice.latency_target_ms_p90', '2000', 'Ziel: 90 % der Antworten schneller als so viele Millisekunden.', 'gespraech', false),
  ('interview.transcript_retention_days', '30', 'Transkripte werden nach so vielen Tagen gelöscht.', 'gespraech', false),

  -- Auswahl (PLAN 2.3 Nr. 5, M4)
  ('matching.rhythm_days', '14', 'Abstand der Auswahl-Läufe in der Testphase.', 'auswahl', false),
  ('matching.min_score', '0.60', 'Mindestscore für einen Vorschlag.', 'auswahl', false),
  ('matching.candidates_per_person', '10', 'Vorauswahl: so viele Kandidaten je Person gehen in die LLM-Bewertung.', 'auswahl', false),
  ('matching.wait_bonus_per_round', '0.02', 'PLATZHALTER: Wartebonus je Lauf ohne Vorschlag (Wert aus dem Auftrag prüfen).', 'auswahl', false),
  ('matching.wait_bonus_max', '0.10', 'PLATZHALTER: höchster Wartebonus.', 'auswahl', false),
  ('matching.max_distance_km', '60', 'PLATZHALTER: größte Entfernung, wenn eine Person keine eigene Fahrbereitschaft angibt.', 'auswahl', false),
  ('matching.weights', '{"werte": 0.30, "wuensche": 0.25, "lebensumstaende": 0.15, "persoenlichkeit": 0.20, "zeiten": 0.10}', 'PLATZHALTER: Gewichte der Teil-Scores (Summe 1).', 'auswahl', false),
  ('matching.llm_weight', '0.5', 'PLATZHALTER: Anteil der LLM-Rubrik am Gesamtscore (Rest: Regel-Teil-Scores).', 'auswahl', false),
  ('matching.score_retention_months', '12', 'Teil-Scores werden nach so vielen Monaten gelöscht (Vorschlag).', 'auswahl', false),
  ('matching.venue_max_detour_ratio', '1.3', 'Lokal möglichst in der Mitte: größtes Verhältnis der längeren zur kürzeren Anfahrt.', 'auswahl', false),

  -- Abende und Fristen (PLAN 2.3 Nr. 6, 3.2 Nr. 13)
  ('evening.time_request_hours', '24', 'Frist für die Wunschzeit nach dem Vorschlag.', 'abend', false),
  ('evening.time_answer_hours', '24', 'Frist für Bestätigung oder Alternative.', 'abend', false),
  ('evening.reminder_hours_before', '[24, 2]', 'Erinnerungen so viele Stunden vor dem Abend.', 'abend', false),
  ('evening.feedback_local_time', '"10:00"', 'Rückmeldung am nächsten Tag zu dieser Uhrzeit (Europe/Berlin).', 'abend', false),
  ('evening.late_cancel_hours', '24', 'Absage innerhalb so vieler Stunden vor Beginn gilt als kurzfristig.', 'abend', false),
  ('evening.deadline_check_minutes', '5', 'Der Fristen-Job läuft alle so viele Minuten.', 'abend', false),
  ('evening.default_duration_minutes', '120', 'Geplante Dauer eines Abends (für Reservierung und Check-in).', 'abend', false),
  ('evening.credit_validity_months', '3', 'PLATZHALTER (Frage B8): Gültigkeit von Gutschriften.', 'abend', false),
  ('evening.debrief_minutes', '{"auftakt": 0, "andante": 10, "loge": 20}', 'PLATZHALTER (Frage B6): Länge der Nachbesprechung je Stufe.', 'abend', false),

  -- Mitgliedschaft (PLAN 1 Nr. 8, M6)
  ('billing.period_days', '28', 'Abrechnungszeitraum: 4 Wochen.', 'mitgliedschaft', true),
  ('billing.tiers', '{"auftakt": {"name": "Auftakt", "price_cents": 4900, "evenings": 1}, "andante": {"name": "Andante", "price_cents": 14900, "evenings": 2}, "loge": {"name": "Loge", "price_cents": 29900, "evenings": 4}}', 'PLATZHALTER: Stufen. Preise und Abende aus dem Auftrag; der Name „Auftakt“ für die erste Stufe ist ein Platzhalter.', 'mitgliedschaft', true),
  ('billing.loge_in_test_phase', 'false', 'PLATZHALTER (Frage B11): Loge in der Testphase anbieten.', 'mitgliedschaft', true),
  ('billing.loge_test_phase_evenings', '2', 'Loge in der Testphase: höchstens so viele Abende je 4 Wochen.', 'mitgliedschaft', false),
  ('billing.free_until_first_evening', 'true', 'Bis einschließlich zum ersten Abend kostenlos und ohne Karte.', 'mitgliedschaft', true),
  ('billing.extension_rule_enabled', 'true', 'Verlängerungsregel: Zeitraum ohne Abend verlängert sich (Definition „kein Abend“: Frage B12).', 'mitgliedschaft', false),
  ('billing.currency', '"eur"', 'Währung.', 'mitgliedschaft', false),

  -- Benachrichtigungen
  ('notify.push_enabled', 'true', 'Web-Push zusätzlich zur E-Mail.', 'benachrichtigung', false),
  ('notify.quiet_hours', '{"start": "22:00", "end": "08:00"}', 'In diesen Stunden keine Push-Nachrichten (außer Sicherheit).', 'benachrichtigung', false),
  ('notify.mail_from_name', '"Fermata"', 'Absendername der Mails.', 'benachrichtigung', false),
  ('notify.mail_from_address', '"hallo@fermata.example"', 'PLATZHALTER (Frage A3/A7): Absenderadresse.', 'benachrichtigung', false)
on conflict (key) do nothing;
