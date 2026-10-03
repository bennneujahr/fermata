# Startcheckliste (M9)

Stand: 03.10.2026 · Entwurf. Abhaken, bevor die ersten echten Abende stattfinden. Punkte mit **(Blocker)** müssen
erledigt sein; ohne sie bitte nicht starten. Verweise: [RUNBOOK.md](RUNBOOK.md), [DATA.md](DATA.md),
[recht/](recht/), [PLATZHALTER.md](PLATZHALTER.md).

Zwei Stufen: **A** = Landingpage mit Warteliste live (M1), **B** = erste echte Abende (nach dem Probelauf).
Stufe A braucht nur die mit „A“ markierten Punkte.

---

## Recht

- [ ] **A (Blocker)** Markenrecherche „Fermata“ (DPMA, EUIPO, WIPO; Klassen 45, 9, 42) durch Markenanwalt oder
      Rechercheagentur, **vor** Domainkauf und Druck (PLAN 5.3; japanische Marke „fermata“).
- [ ] **A (Blocker)** Domain gekauft (A3); Einstellungen `site.*`, `notify.mail_from_address` gesetzt.
- [ ] **A (Blocker)** Impressum vollständig (A7), [impressum.md](recht/impressum.md) → `apps/landing/src/content/legal.ts`.
- [ ] **A (Blocker)** Datenschutzerklärung Landingpage vom Anwalt geprüft und in `legal.ts` übernommen
      ([datenschutzerklaerung-landing.md](recht/datenschutzerklaerung-landing.md)).
- [ ] **A** Pflicht-Häkchen der Warteliste (A9, Kopplungsverbot) entschieden.
- [ ] **A** Preisanzeige und Umsatzsteuer (A5) entschieden: `landing.prices_mode`, `landing.vat_mode`.
- [ ] **B (Blocker)** Nutzungsbedingungen ([agb.md](recht/agb.md)) geprüft, in `ops.legal_documents` als neue Fassung.
- [ ] **B (Blocker)** Widerrufsbelehrung und Muster-Formular ([widerrufsbelehrung.md](recht/widerrufsbelehrung.md))
      geprüft; als Art `widerruf` hinterlegt; in der Bestellbestätigung vollständig enthalten.
- [ ] **B (Blocker)** Erklärung „Beginn vor Ablauf der Widerrufsfrist“ in der Bestellung abgefragt und gespeichert
      (sonst kein Wertersatz, § 357a Abs. 2 BGB) – Code-Änderung.
- [ ] **B** Wertersatz-Methode (B13) und Definition „kein Abend“ (B12) mit dem Anwalt bestätigt.
- [ ] **B** Kündigungsknopf (§ 312k BGB) und Widerrufsknopf (§ 356a BGB) vom Anwalt am laufenden System geprüft,
      inklusive Weg ohne Anmeldung und Eingangsbestätigung.
- [ ] **B** Verbraucherschlichtung (B14) entschieden, Satz in Impressum und AGB.
- [ ] **B** § 656/§ 627 BGB (Partnervermittlung) geprüft.
- [ ] **B** KI-Verordnung: Wortlaut Art. 50 im Amtsblatt geprüft; Art. 50 Abs. 2 (Kennzeichnung synthetischer
      Stimme) eingeordnet ([ki-hinweis.md](recht/ki-hinweis.md)).
- [ ] **B** Vereinbarungen mit allen Partner-Lokalen unterschrieben (B10), inkl. Vertraulichkeit.

## Datenschutz

- [ ] **A (Blocker)** Externer Datenschutzbeauftragter benannt (B15) und der Aufsichtsbehörde gemeldet.
- [ ] **A (Blocker)** AV-Verträge Supabase, Vercel, Brevo abgeschlossen ([av-liste.md](recht/av-liste.md)).
- [ ] **B (Blocker)** AV-Verträge AWS, Deepgram, Didit, Stripe (bzw. Hinweis eigene Verantwortung), LiveKit (falls
      Weg A/B), TTS-Anbieter (falls nicht Polly); Drittland-Grundlage je Anbieter dokumentiert.
- [ ] **B (Blocker)** DSFA ([dsfa.md](recht/dsfa.md)) mit Stellungnahme des DSB abgeschlossen; offene Maßnahmen
      M-1 bis M-12 erledigt oder bewusst akzeptiert.
- [ ] **B (Blocker)** Datenschutzerklärung der Web-App ([datenschutzerklaerung-app.md](recht/datenschutzerklaerung-app.md))
      geprüft und in der App unter „Rechtliches“.
- [ ] **B (Blocker)** Einwilligungstexte ([einwilligungen.md](recht/einwilligungen.md)) geprüft, als neue Fassungen
      in `ops.legal_documents`; insbesondere `gespraech` mit Art.-9-Klausel; KI-Hinweis korrigiert.
- [ ] **B** `art9_health` entfernt oder mit Zweck und Eingabe gebaut.
- [ ] **B** Verzeichnis von Verarbeitungstätigkeiten ([vvt.md](recht/vvt.md)) vollständig.
- [ ] **B** Löschkonzept ([loeschkonzept.md](recht/loeschkonzept.md)): Fristen entschieden, fehlende Jobs gebaut.
- [ ] **B** Didit: Aufbewahrung 1 Monat, Training aus (Screenshot ablegen).
- [ ] **B** AWS: Bedrock-Invocation-Logging ohne Inhalte; AI-Services-Opt-out (Polly) geprüft; CloudWatch 30 Tage.
- [ ] **B** Brevo: Öffnungs- und Klickverfolgung aus (Screenshot ablegen).
- [ ] **B** Bedrock-Weg entschieden (EU-Geo-Profil mit London/Zürich oder regional Frankfurt) und in den Texten.
- [ ] **B** Datenexport und Kontolöschung mit einem Testkonto vollständig geprüft (Export enthält keine fremden
      Daten; nach Löschung keine Zeile mehr mit der ID außer den gewollten Ausnahmen).

## Technik

- [ ] **A (Blocker)** Supabase-Projekt in **Frankfurt**, pg_cron und pg_net an, Migrationen eingespielt, Prüfungen aus
      RUNBOOK Abschnitt 6 grün (`cron.job`: 12 bzw. 14 Jobs; keine Funktion für PUBLIC).
- [ ] **A (Blocker)** Functions der Warteliste deployt (ohne JWT-Prüfung), Secrets gesetzt, Testanmeldung mit echter
      Mail: Bestätigung, Willkommen, Abmeldung.
- [ ] **A (Blocker)** Landingpage auf Vercel `fra1`, CSP auf die genaue Supabase-Adresse eingeschränkt, Header geprüft
      (`curl -sI`), `/s/test` leitet weiter.
- [ ] **A** **Lighthouse auf der echten Domain** (mobil und Desktop, alle öffentlichen Seiten) ≥ 95 in Leistung,
      Barrierefreiheit, Best Practices; SEO außer den `noindex`-Seiten.
- [ ] **A** axe-Prüfung auf der echten Domain (hell und dunkel) ohne Verstöße.
- [ ] **B (Blocker)** Integration von M2: Konflikt `app.require_admin()` (`returns uuid` vs. `returns void`) und
      doppelte Tabelle `safety.verification_hashes` bereinigt; alle Migrationen laufen auf einer leeren Datenbank
      durch; CI grün.
- [ ] **B (Blocker)** Alle Functions mit der richtigen JWT-Einstellung deployt (RUNBOOK Abschnitt 4, Schritt 8);
      `supabase/config.toml` ergänzt.
- [ ] **B (Blocker)** HTML-Seiten aus Functions (`trust-view`, `venue-confirm`, Kündigung/Widerruf per Link) werden
      im Browser als Seite angezeigt (ggf. Custom Domain).
- [ ] **B (Blocker)** Auswahl-Job in Produktion mit `FERMATA_LLM_BACKEND=bedrock` und
      `FERMATA_EMBEDDING_BACKEND=titan` (Standard wäre die Attrappe) – besser: Code verweigert Attrappen in Produktion.
- [ ] **B (Blocker)** Kontolöschung beendet bzw. verhindert ein laufendes Stripe-Abo.
- [ ] **B (Blocker)** **Didit-Sandbox: Webhook-Format** mit echten Sandbox-Aufrufen geprüft (Signatur, Felder für
      Name, Geburtsdatum, Ausweisnummer, Status), Löschung der Sitzung bestätigt (`provider_session_deleted_at`).
- [ ] **B (Blocker)** **Stripe Live-Modus:** Live-Schlüssel und Live-Webhook gesetzt; eine echte Bestellung mit
      kleinem Betrag, Kündigung, Widerruf mit Erstattung durchgespielt; Preise und USt-Behandlung im Dashboard geprüft.
- [ ] **B (Blocker)** AWS: Marketplace-Abo Sonnet 5.5 in `eu-central-1`, Bedrock-Aufruf aus Viola und Auswahl-Job
      erfolgreich; Modell-ID für den Mantle-Weg geklärt (`eu.`-Präfix oder nicht).
- [ ] **B** Titan-Embeddings mit 20–30 echten (anonymisierten) Zusammenfassungen geprüft; sonst
      `matching.embeddings_enabled = false` (matcher.md, offener Punkt 6).
- [ ] **B** LiveKit-Weg entschieden (B3) und eingerichtet; Gespräch mit Stimme aus dem Mobilfunknetz und aus einem
      restriktiven WLAN (TURN) getestet; Antwortzeit gemessen (Ziel: 90 % unter 2 s).
- [ ] **B** Stimme nach Blindtest (B4) eingestellt.
- [ ] **B** **Web-Push auf einem echten iPhone** (iOS ≥ 16.4, Web-App auf dem Home-Bildschirm) **und einem
      Android-Gerät** getestet: Einschalten, Erinnerung, Check-in in der Ruhezeit, Abschalten; Anmeldung mit Code in
      der installierten iPhone-Web-App.
- [ ] **B** Region `fra1` für die Web-App gesetzt; CSP der Web-App um Stripe, LiveKit und Viola-Textdienst ergänzt.
- [ ] **B** Staging-Projekt getrennt von Produktion; keine Produktionsdaten in Staging.
- [ ] **B** EventBridge-Zeitplan des Auswahl-Jobs aktiv; ein Lauf in Staging von „scheduled“ bis „approved“.
- [ ] **B** Wiederherstellungstest eines Backups inkl. Entschlüsselung der Art.-9-Spalten (RUNBOOK Abschnitt 10).

## Sicherheit

- [ ] **A** **Hilfe-Nummern erneut geprüft** (Heimwegtelefon 030 12074182 und Zeiten, 110, 112, TelefonSeelsorge
      0800 111 0 111 / 0800 111 0 222 / 116 123, Hilfetelefon Gewalt gegen Frauen 116 016) – Einstellungen
      `safety.*` **und** `safety.crisis_lines` (Viola) gleich gepflegt; Landingpage neu gebaut.
- [ ] **B (Blocker)** Zwei-Faktor für Benn eingerichtet (TOTP) und für alle Anbieter-Konten.
- [ ] **B (Blocker)** `safety.admin_alert_email` auf ein überwachtes Postfach; Vertretung benannt (RUNBOOK Abschnitt 9).
- [ ] **B (Blocker)** Ende-zu-Ende in Staging: Meldung → vorläufige Sperre → Absage beim Gegenüber → Prüfung →
      Sanktion → Widerspruch → Entscheidung; Check-in „Hilfe“ erzeugt Sofort-Mail; „Abend teilen“ zeigt nichts über
      das Gegenüber und läuft ab.
- [ ] **B** Die 15 Sicherheitsstandards (`docs/bereiche/sicherheit.md`) mit dem Auftrag abgeglichen.
- [ ] **B** Sperrliste getestet: Ausschluss → neues Testkonto mit gleichem Ausweis wird gesperrt; Namens-Treffer
      erzeugt nur einen Hinweis.
- [ ] **B** Viola: Krise, Minderjährigkeit, Beleidigung in Stimme und Text getestet (feste Sätze, Nummern, Ende,
      Hinweis an Benn, kein Profil).
- [ ] **B** Polizeivorlage einmal durchgespielt ([polizeimeldung-vorlage.md](recht/polizeimeldung-vorlage.md)).

## Betrieb

- [ ] **A** Postfächer `hallo@…`, `datenschutz@…`, `sicherheit@…` eingerichtet und erreichbar.
- [ ] **B (Blocker)** **Probelauf mit 10–20 Testpersonen über einen vollen 14-Tage-Zyklus** in Staging oder
      Produktion mit Testmodus: Einladung → Einwilligungen → Formular → Ausweis (Sandbox) → Gespräch → Zusammenfassung →
      Zeitenabfrage → Lauf → Freigabe → Terminabstimmung → Reservierung → Abend in einem Partner-Lokal → Check-in →
      Rückmeldung → Kontakttausch → Nachbesprechung (Andante/Loge) → Bestellung → Kündigung bzw. Widerruf. Ergebnisse
      und Probleme protokollieren; Kennzahlen ([KENNZAHLEN.md](KENNZAHLEN.md)) danach ansehen.
- [ ] **B** Routinen aus RUNBOOK Abschnitt 7 einmal vollständig durchgeführt (Tag, Lauf, Woche).
- [ ] **B** Kosten je Gespräch und je Lauf mit echten Preisen geprüft (`voice.prices`, `matching.llm_price_usd_per_mtok`,
      Kurs); Budget-Alarm in AWS gesetzt.
- [ ] **B** Notfallumschlag und Zugänge für die Vertretung hinterlegt.
- [ ] **B** Überwachung: Alarm bei gescheiterten Zeitplänen, Fehlern der Functions, Fehlern der ECS-Dienste.

## Lokale

- [ ] **B (Blocker)** Mindestens ein Partner-Lokal mit Vereinbarung (B10), angelegt (`api.admin_create_venue`) mit
      Reservierungsweg (Mail oder Telefon) und Plätzen für die nächsten Wochen.
- [ ] **B (Blocker)** Personal eingewiesen (Sicherheitsstandard 14, `docs/bereiche/sicherheit.md` Abschnitt 9):
      Reservierung auf „Fermata“, Tisch-Code, Gäste dürfen jederzeit gehen, Hilfe auf Bitte, keine Auskunft über
      Gäste, Vorfälle an `sicherheit@…`; „Ist Luisa hier?“ geprüft.
- [ ] **B** Reservierungs-Mail und Bestätigungslink mit dem Lokal getestet.
- [ ] **B** Barrierefreiheit und Anfahrt (ÖPNV) je Lokal eingetragen.
- [ ] **B** Lokale im Umland prüfen (34 % der simulierten Vorschläge über dem Anfahrtsverhältnis, matcher.md).

## Inhalte

- [ ] **A** Startmonat (A8), Gründungsvorteil (A6) entschieden; Texte geprüft (`pnpm check:tone`).
- [ ] **A** Hörprobe (A4): an erst nach Blindtest.
- [ ] **B** Name der ersten Stufe (C1) und Untertitel der Stufen bestätigt.
- [ ] **B** Länge der Nachbesprechung (B6), Gültigkeit von Gutschriften (B8), Nichterscheinen (B9), Loge in der
      Testphase (B11) entschieden.
- [ ] **B** Mail-Vorlagen in Sie- und Du-Form einmal gelesen (Bestellung, Kündigung, Widerruf, Sicherheit, Abende).
- [ ] **B** Hilfe-Seite in der App mit den 15 Standards und den Nummern.
- [ ] **B** Hinweis für Mitglieder, wie man die Web-App auf dem iPhone zum Home-Bildschirm hinzufügt.

---

## Offene Punkte für Benn

1. Reihenfolge: Stufe A kann vor M2–M7-Abnahme live gehen; Stufe B erst nach dem Probelauf.
2. Wer neben dir den Probelauf begleitet (Testpersonen, mindestens ein Lokal).
3. Welche Blocker du bewusst akzeptierst (dann mit Begründung hier vermerken).
