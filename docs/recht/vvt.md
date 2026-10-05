# Verzeichnis von Verarbeitungstätigkeiten (Art. 30 Abs. 1 DSGVO)

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026 · Fassung 0.1 · aus dem Code abgeleitet (Datenkarte [`docs/DATA.md`](../DATA.md)).
> Nachgeführt nach der Härtung: Löschfristen aus den Einstellungen `retention.*` (Job `fermata-retention`,
> [loeschkonzept.md](loeschkonzept.md)); Werte sind Platzhalter (C11), bis Benn/Anwalt sie bestätigen.

## Allgemeine Angaben

| Feld | Angabe |
|---|---|
| Verantwortlicher | [[Name/Firma, Anschrift, Kontakt]] |
| Vertreter in der EU | entfällt (Sitz in Deutschland) [[prüfen]] |
| Datenschutzbeauftragter | [[Name, Kontakt (B15)]] |
| Technische und organisatorische Maßnahmen (Art. 32) | [tom.md](tom.md) – gilt für alle Tätigkeiten |
| Auftragsverarbeiter | [av-liste.md](av-liste.md) |
| Löschfristen | [loeschkonzept.md](loeschkonzept.md) |
| DSFA | [dsfa.md](dsfa.md) (betrifft V07–V15, V22) |

Abkürzungen der Rechtsgrundlagen: a/b/c/d/f = Art. 6 Abs. 1 lit. a–f DSGVO; 9a = Art. 9 Abs. 2 lit. a DSGVO.
„Supabase“ = Datenbank und Edge Functions in Frankfurt (AWS eu-central-1).

---

### V01 Warteliste

- **Zweck:** Interessierte vormerken, Platz und Gründungsstatus berechnen, Einladungen, Start-Mails.
- **Betroffene:** Interessierte.
- **Daten:** Vorname, E-Mail, Region, PLZ, Einwilligung (Fassung, Zeit), Plakat-Kürzel, Einladungscode, Grundnummer,
  Vorrückungen, Gründungsstatus, Link-Hashes.
- **Grundlage:** a (Einwilligung Warteliste) [[A9]].
- **Empfänger:** Supabase, Brevo (Mails), Vercel (Auslieferung der Seite).
- **Drittland:** US-Mütter von Supabase und Vercel (SCC/DPF prüfen).
- **Löschung:** unbestätigt 7 Tage (Job `fermata-waitlist-cleanup`); bestätigt bei Abmeldung, bei der ersten Anmeldung
  in der App nach einer Einladung (Härtung) oder bei Kontolöschung.
- **Code:** `20261003000100_waitlist.sql`, Functions `waitlist-*`.

### V02 Plakat-Zählung

- **Zweck:** Wirkung von Plakaten messen. **Daten:** Kürzel, Tag, Anzahl – kein Personenbezug.
- **Grundlage:** entfällt. **Löschung:** dauerhaft. **Code:** `api.link_hit`, `apps/landing` `/s/[slug]`.

### V03 Missbrauchsschutz der Warteliste

- **Zweck:** massenhafte Anmeldungen verhindern. **Betroffene:** Besucherinnen.
- **Daten:** HMAC der IP mit Tagessalz, Zeitpunkt. **Grundlage:** f.
- **Empfänger:** Supabase. **Löschung:** 24 h, Salz 2 Tage. **Code:** `ops.daily_hash`, `public.signup_attempts`.

### V04 Einladung, Konto, Anmeldung

- **Zweck:** Konto anlegen und schützen, Anmeldung mit Code.
- **Betroffene:** Eingeladene, Mitglieder, Admin.
- **Daten:** E-Mail, Einladung, Kontostatus, Anrede, Gründungsstatus, Anmeldezeiten, Sitzungsdaten (Supabase Auth,
  mit IP), Zwei-Faktor-Schlüssel (Admin).
- **Grundlage:** b, f.
- **Empfänger:** Supabase (Auth), Brevo (Anmelde- und Einladungsmails).
- **Löschung:** nie angenommene Einladung nach 7 Tagen (Job `fermata-expire-invitations`); sonst Kontolöschung.
  `auth.audit_log_entries` (mit IP): 30 Tage (`retention.auth_audit_days`, falls die Rolle löschen darf; sonst
  Aufbewahrung im Supabase-Dashboard).
- **Code:** `app.accounts`, `app.account_invitations`, `admin-invite`, `ops.create_invited_account` (M2).

### V05 Einwilligungsverwaltung

- **Zweck:** Nachweis nach Art. 7 Abs. 1. **Betroffene:** Mitglieder.
- **Daten:** Art, Aktion, Fassung, Zeit, Quelle. **Grundlage:** c.
- **Empfänger:** Supabase. **Löschung:** mit dem Konto [[Aufbewahrung danach prüfen: Nachweis entfällt mit dem Konto]].
- **Code:** `app.consents`, `api.give_consent`, `api.revoke_consent`.

### V06 Konto-Fakten und Ort

- **Zweck:** Abgleich mit dem Ausweis, Altersprüfung, Entfernung in der Auswahl (nur PLZ-Mittelpunkt),
  Kontakttausch (Telefon).
- **Daten:** Vor-/Nachname, Geburtsdatum, PLZ, Ort, Telefon (freiwillig), Straße nur wenn eingeschaltet (aus).
- **Grundlage:** b. **Empfänger:** Supabase. **Löschung:** Kontolöschung.
- **Code:** `private.account_facts`, `app.geo`, `api.save_facts` (M2).

### V07 Besondere Kategorien: Geschlecht, gesuchtes Geschlecht, Orientierung, Religion

- **Zweck:** Ja/Nein-Prüfung in der Auswahl; k-anonyme Fairness-Zählung.
- **Daten:** verschlüsselte Angaben (`sensitive.*`).
- **Grundlage:** 9a + a (`art9_profile`, `art9_religion`).
- **Empfänger:** Supabase; niemand sonst (keine Admin-Ansicht, kein LLM).
- **Löschung:** Widerruf (sofort) oder Kontolöschung.
- **Code:** `20261003000200_accounts.sql`, `…000410_matcher.sql`.

### V08 Ausweisprüfung und Sperrlisten-Abgleich

- **Zweck:** nur echte, volljährige Menschen; ausgeschlossene Personen erkennen.
- **Daten:** bei Didit: Ausweisbild, Gesichtsvideo, Biometrie, ausgelesene Daten; bei Fermata: Ergebnis (18+,
  Geburtsjahr, Abgleich ja/nein, Prüf-ID), HMAC-Hashes.
- **Grundlage:** 9a (`biometrie`) für den Abgleich bei Didit; b und f für Ergebnis und Hashes.
- **Empfänger:** Didit (Auftragsverarbeiter), Supabase.
- **Drittland:** Didit mit Sitz USA (laut Didit EU-Verarbeitung).
- **Löschung:** Didit-Sitzung direkt nach Ergebnis (API) bzw. 1 Monat (Konsole); Ergebnis und Hashes bis
  Kontolöschung.
- **Code:** `verification-start`, `verification-webhook`, `ops.verification_complete` (M2).

### V09 Gespräch mit Viola (live)

- **Zweck:** Kennenlernen, KI-Hinweis, Sicherheit.
- **Daten:** Stimme (nur durchgeleitet), Gesprächstext, Gesprächsablauf; ggf. ungefragt genannte Art.-9-Inhalte
  (nur live).
- **Grundlage:** a (`gespraech`), 9a – ungefragt erzählte Art.-9-Inhalte nennt die Einwilligung seit der Fassung
  `2026-10-03-m8-entwurf` ausdrücklich [[Anwalt prüfen]].
- **Empfänger:** LiveKit (Weg A/B) bzw. eigener Server (C), AWS (Viola-Dienst, Bedrock, Polly), Deepgram, Supabase.
- **Drittland:** EU-Geo-Profil Bedrock (London, Zürich – Angemessenheit); US-Mütter (AWS, Deepgram, LiveKit).
- **Löschung:** Audio nie gespeichert; Transkript 30 Tage (Job `fermata-purge-transcripts`), Widerruf sofort.
  Einsicht durch Benn nur im Sicherheitsfall (`api.admin_safety_transcript`, Audit).
- **Code:** `services/viola`, `interview-*`, `20261003000310_viola.sql` (Hauptzweig).

### V10 Auswertung des Gesprächs, Profil

- **Zweck:** Zusammenfassung und Profil für die Auswahl; Person bestätigt.
- **Daten:** Zusammenfassung, Persönlichkeit, Werte, Wünsche, Ausschlüsse, Lebensumstände, Fahrbereitschaft,
  Gewichte, Embedding.
- **Grundlage:** b (Profil), a (Erstellung aus dem Gespräch).
- **Empfänger:** AWS Bedrock (Auswertung), Supabase.
- **Löschung:** Kontolöschung; Entwurf der Zusammenfassung 30 Tage nach Bestätigung bzw. Ende
  (`retention.summary_draft_days`). **Code:** `api.agent_save_analysis`, `api.interview_confirm_summary`.

### V11 Sicherheitsprüfung im Gespräch

- **Zweck:** Krise, Minderjährigkeit, Gewalt, Belästigung erkennen und helfen.
- **Daten:** Art, Stufe, Sitzung, Beitragsnummer (kein Freitext). **Grundlage:** d, f.
- **Empfänger:** Supabase; Benn. **Löschung:** erledigte Hinweise nach 24 Monaten (`retention.safety_flags_months`),
  Namens-/Ausweis-Hashes darin nach 30 Tagen (`retention.flag_hashes_days`).
- **Code:** `api.agent_flag_safety`, `services/viola/src/viola/safety.py`.

### V12 Zeitenabfrage

- **Zweck:** freie Abende je Zeitraum. **Daten:** Zeitfenster. **Grundlage:** b.
- **Empfänger:** Supabase, Brevo/Push (Abfrage-Nachricht). **Löschung:** 30 Tage nach Ende des Zeitraums
  (`retention.availability_days`), sonst Kontolöschung. **Code:** `20261003000530_availability.sql`.

### V13 Auswahl (Profiling)

- **Zweck:** Gegenüber und Lokal vorschlagen.
- **Daten:** Profil ohne Art. 9, PLZ-Mittelpunkt, Zeiten, Ausschlüsse, Blockierungen, Einwilligungsstand,
  Prüfstatus, Kontingent; Ja/Nein zu Geschlecht/Religion; Ergebnisse: Teil-Scores, LLM-Bewertung, Vorschlag.
- **Grundlage:** b; 9a für die Ja/Nein-Prüfung.
- **Empfänger:** AWS (ECS Frankfurt, Bedrock, Titan Embeddings), Supabase.
- **Drittland:** wie V09 (Bedrock-Weg festlegen).
- **Löschung:** Teil-Scores und Lauf-Teilnahmen 12 Monate (Job `fermata-purge-match-scores`), Gesamtscore und
  Prüfnotizen der Vorschläge ebenso (`fermata-retention`); Lauf-Berichte dauerhaft; Vorschläge bis Kontolöschung.
- **Code:** `services/matcher`, `20261003000410_matcher.sql`.

### V14 Menschliche Freigabe der Vorschläge

- **Zweck:** Prüfung jedes Vorschlags (Art. 22). **Daten:** Vorschlag mit Anzeigename, Altersband, Scores,
  Begründungen, Prüfnotizen; Entscheidung, Kommentar.
- **Grundlage:** b, f. **Empfänger:** Benn (Admin, aal2). **Löschung:** mit dem Vorschlag; Audit dauerhaft.
- **Code:** `api.admin_run_pairings`, `api.admin_approve_pairing`, `api.admin_reject_pairing`.

### V15 Fairness-Bericht

- **Zweck:** Benachteiligung erkennen. **Daten:** Zählungen je Geschlecht bzw. Altersband (k ≥ 5, nie gekreuzt).
- **Grundlage:** 9a [[Zweck im Einwilligungstext ergänzen]], f. **Löschung:** dauerhaft im Lauf-Bericht (anonym).
- **Code:** `sensitive.match_run_fairness`.

### V16 Terminabstimmung und Reservierung

- **Zweck:** Abend verabreden, Tisch reservieren.
- **Betroffene:** Mitglieder, Ansprechpersonen der Lokale.
- **Daten:** Abend, Zeiten, Lokal, Tisch-Code, Verlauf; Lokal: Name, Anschrift, Ansprechperson, E-Mail, Telefon.
- **Grundlage:** b (Mitglieder; Vertrag mit dem Lokal), f.
- **Empfänger:** Supabase, Brevo (Reservierungs-Mail an das Lokal ohne Mitgliedernamen), Lokale.
- **Löschung:** mit dem Abend bzw. Konto; Lokaldaten solange Partnerschaft [[Frist festlegen]].
- **Code:** `20261003000500`–`…000590`.

### V17 Benachrichtigungen (E-Mail, Web-Push)

- **Zweck:** Fristen, Erinnerungen, Bestätigungen. **Daten:** Empfänger-ID, Vorlage, Parameter; Push-Abo-Adresse und
  Schlüssel; Versandprotokoll ohne Inhalt.
- **Grundlage:** b; Push: a (`push`) + § 25 Abs. 1 TDDDG.
- **Empfänger:** Brevo; Push-Dienste von Apple, Google, Mozilla (Inhalt Ende-zu-Ende verschlüsselt).
- **Drittland:** Push-Dienste USA.
- **Löschung:** Warteschlange 90 Tage nach Erledigung (Job `fermata-evening-purge`); Push-Abo bis Widerruf/Abmeldung;
  Versandprotokoll 12 Monate (`retention.notifications_log_months`). Bei Kontolöschung bleiben Absage-Nachrichten an
  Gegenüber und Lokal (vom Abend gelöst, Inhalt festgehalten) bis zum Versand.
- **Code:** `ops.notification_queue`, `notify-dispatch`, `_shared/push`.

### V18 Sicherheit am Abend: Finde-Fenster, Check-in, Abend teilen, Hilfe-Knopf

- **Zweck:** sich finden, Sicherheit, Vertrauensperson informieren.
- **Betroffene:** Mitglieder, Vertrauenspersonen.
- **Daten:** Erkennungszeichen, Check-in-Antwort, Link-Hash; Vertrauensperson sieht Lokal, Zeit, Vornamen.
- **Grundlage:** b, d, f.
- **Empfänger:** Supabase; Vertrauensperson (durch das Mitglied); Benn bei „Hilfe“.
- **Löschung:** Erkennungszeichen nach dem Finde-Fenster; Link ungültig 24 h nach Beginn; Check-ins mit dem Abend.
- **Code:** `api.evening_find_info`, `api.checkin_respond`, `api.create_trust_share`, `trust-view`, `api.help_contacts`.

### V19 Rückmeldung und Kontakttausch

- **Zweck:** Ergebnis des Abends, Qualität, Sicherheit, freiwilliger Kontakttausch.
- **Daten:** Teilnahme, Bewertungen, sicher gefühlt, Notiz, Kontaktwunsch, geteilte Kanäle.
- **Grundlage:** b, f; Kontakttausch: a (`kontakttausch`).
- **Empfänger:** Supabase; Benn; beim Kontakttausch das Gegenüber (nur freigegebene Kanäle).
- **Löschung:** mit dem Abend.
- **Code:** `api.submit_feedback`, `app.contact_share_for`.

### V20 Mitgliedschaft und Zahlung

- **Zweck:** Vertrag, Abrechnung, Kontingent, Verlängerungsregel.
- **Daten:** Stufe, Status, Vertragsnummer, Zeiträume, Kontingent-Buch, Stripe-Kennungen, gekürzte Stripe-Ereignisse;
  bei Stripe: Zahlungsmittel, Rechnungsdaten.
- **Grundlage:** b, c (HGB/AO).
- **Empfänger:** Stripe (teils eigene Verantwortung), Supabase, Brevo.
- **Drittland:** Stripe Inc. (USA).
- **Löschung:** Kontolöschung (laufendes Abo wird dabei sofort beendet); Vertragsunterlagen 6 Jahre ab Jahresende
  (`retention.contract_actions_years`) [[6/8 Jahre bestätigen]]; Stripe-Ereignisse (ohne Name, E-Mail, Adresse,
  Karte) 13 Monate (`retention.stripe_events_months`).
- **Code:** `20261003000600`–`…000640`, `billing-*`, `stripe-webhook`.

### V21 Kündigung und Widerruf

- **Zweck:** § 312k und § 356a BGB, Eingangsbestätigung.
- **Daten:** Name, Kontakt-E-Mail, Vertragsnummer, Art, Grund, Zeitpunkte, Berechnung, Link-Hash (ohne Anmeldung).
- **Grundlage:** b, c. **Empfänger:** Supabase, Brevo, Stripe (Kündigung/Erstattung).
- **Löschung:** 6 Jahre ab Ende des Kalenderjahres (`retention.contract_actions_years`) [[bestätigen]]; bleibt nach
  Kontolöschung ohne Konto-ID; Anfragen ohne Anmeldung (`billing.contract_requests`) 30 Tage.
- **Code:** `billing.record_cancellation`, `billing.record_withdrawal`, `billing.contract_requests`.

### V22 Meldungen, Sanktionen, Widersprüche, Sperrliste

- **Zweck:** Schutz der Mitglieder, Durchsetzung der Nutzungsbedingungen.
- **Betroffene:** meldende und gemeldete Mitglieder.
- **Daten:** Meldung (Art, Bereich, Schilderung), Stufe, Entscheidung; Sanktionen; Widerspruchstexte; Sperrliste nur
  Hashes; Hinweise; Sicherheits-Mail-Ausgang.
- **Grundlage:** f, b; ggf. Art. 9 Abs. 2 lit. f und Art. 10 [[Anwalt]].
- **Empfänger:** Supabase, Brevo (Mails ohne Namen an Benn), Benn.
- **Löschung:** abgeschlossene Meldungen ohne geltende Sanktion 24 Monate nach Abschluss
  (`retention.reports_months`) [[bestätigen]]; Sicherheits-Mail-Ausgang 30 Tage; Sanktionen mit dem Konto; Sperrliste
  dauerhaft (Begründung DSFA R13).
- **Code:** `20261003000700`–`…000730`.

### V23 Weitergabe an die Polizei

- **Zweck:** Strafanzeige nach Entscheidung von Benn.
- **Daten:** Sachverhalt, Ort, Zeit, Name, Geburtsdatum, Wohnort der beschuldigten Person; meldende Person nur mit
  Einverständnis.
- **Grundlage:** f, § 24 Abs. 1 Nr. 1 BDSG [[Art. 10 prüfen]].
- **Empfänger:** Polizei. **Löschung:** Vorlage wird nicht gespeichert; Abruf im Audit.
- **Code:** `api.admin_police_report_template`.

### V24 Betroffenenrechte: Export und Löschung

- **Zweck:** Art. 15, 17, 20. **Daten:** alle eigenen Daten (Export ohne Daten über andere).
- **Grundlage:** c. **Empfänger:** die Person; Brevo (Bestätigungs-Mail).
- **Löschung:** Audit-Einträge `account.exported`, `account.deletion_requested`, `account.deleted` dauerhaft.
- **Code:** `api.my_export`, `account-export`, `account-delete`, `ops.account_deletion_prepare` (M2).

### V25 Admin-Protokoll und Einstellungen

- **Zweck:** Rechenschaft, Nachvollziehbarkeit. **Betroffene:** Admin, Mitglieder (als Ziel).
- **Daten:** Handlung, Zeit, handelnde Person, Ziel-ID, Details. **Grundlage:** c, f.
- **Löschung:** dauerhaft, nur anhängen – bewusst ohne automatische Löschung (Nachweis, keine Inhalte; Begründung im
  Löschkonzept) [[Höchstdauer festlegen]]. **Code:** `ops.audit_log`, `ops.app_settings_history`.

### V26 Kostenprotokoll der Gespräche

- **Zweck:** Kostenkontrolle. **Daten:** Sitzungs-ID, Mengen, Kosten, Antwortzeiten. **Grundlage:** f.
- **Löschung:** dauerhaft (nach Kontolöschung ohne Personenbezug). **Code:** `ops.session_costs`.

### V27 Betrieb: Hosting, Protokolle, Backups

- **Zweck:** sicherer Betrieb. **Daten:** Server-Protokolle (IP, Zeit, Pfad), Backups aller Daten.
- **Grundlage:** f, Art. 32. **Empfänger:** Supabase, Vercel, AWS (CloudWatch), GitHub (nur Code).
- **Löschung:** [[je Anbieter eintragen]]; CloudWatch-Aufbewahrung festlegen.

### V28 Partner-Lokale

- **Zweck:** Vereinbarung, Reservierungen. **Betroffene:** Ansprechpersonen der Lokale.
- **Daten:** Name, E-Mail, Telefon, Vereinbarung. **Grundlage:** b, f.
- **Empfänger:** Supabase, Brevo. **Löschung:** [[Ende der Partnerschaft + 3 Jahre vorgeschlagen]].
- **Code:** `app.venues`, `api.admin_create_venue`.

### V29 Stimmen-Blindtest (einmalig, M3)

- **Zweck:** Auswahl der Stimme. **Betroffene:** 12–16 Testpersonen.
- **Daten:** Bewertungsdatei ohne Namen; die Person schickt sie per E-Mail an Benn (damit E-Mail-Adresse beim
  Empfang). **Grundlage:** a [[kurze Einwilligung bei der Einladung]].
- **Löschung:** E-Mails nach Auswertung löschen; Ergebnisdateien anonym.
- **Code:** `services/viola/blindtest`.

---

## Offene Punkte für Benn/Anwalt

1. Verantwortlicher und Datenschutzbeauftragter eintragen.
2. Alle mit `[[…]]` markierten Fristen festlegen (Löschkonzept).
3. Rechtsgrundlagen V01 (A9), V09 (Art. 9), V15, V22/V23 (Art. 10) bestätigen.
4. Nach Zusammenführung von M2: V04–V08 und V24 mit `docs/bereiche/web.md` abgleichen.
5. Verzeichnis bei jeder neuen Funktion fortschreiben (Verantwortung: Benn).
