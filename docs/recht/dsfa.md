# Datenschutz-Folgenabschätzung (DSFA) nach Art. 35 DSGVO

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026 · Fassung 0.1 · Verfasst aus dem Code (Datenkarte: [`docs/DATA.md`](../DATA.md)).
> Verantwortlich: [[Name/Firma]] · Datenschutzbeauftragter: [[Name (B15)]] – Stellungnahme nach Art. 35 Abs. 2:
> [[ausstehend]].
> Stand des Codes: M0, M1, M4–M7 (Branch `build/docs`); M3 Viola (Commit `e84647b`) und M2 Web-App (Merge-Commit
> `2489e06`) im Hauptzweig `claude/dating-app-build-0uszhn`. **Nachgeführt nach der Härtung** (Branch
> `build/hardening`, Migrationen `20261003000900` bis `…000907`): M-1 bis M-5 im Code umgesetzt (M-1 braucht noch die
> Einrichtung der Login-Rolle im gehosteten Projekt), M-9 als Textentwurf.

---

## 0. Ergebnis in Kürze

- Eine DSFA ist **erforderlich**: Fermata verarbeitet besondere Kategorien (Art. 9) zu Geschlecht, gesuchtem
  Geschlecht, Orientierung und Religion, biometrische Daten bei der Ausweisprüfung, erstellt Profile und bewertet sie
  automatisiert (auch mit einem Sprachmodell), nutzt neue Technik (Sprach-KI) und verknüpft Daten aus mehreren
  Quellen.
- Die wichtigsten Risiken sind: **Offenlegung der sexuellen Orientierung**, **Missbrauch durch andere Mitglieder**
  (Belästigung, Stalking), **Datenleck der zentralen Datenbank**, **Drittlandzugriff** über US-Mutterkonzerne und
  **fehlerhafte oder unfaire Auswahl**.
- Der Code setzt viele Maßnahmen bereits technisch um (Verschlüsselung, enge Rollen, Ja/Nein-Prüffunktionen,
  menschliche Freigabe, kein Rohaudio, Löschjobs, Sperrliste nur mit Hashes, Beziehungsprüfung bei Meldungen).
- **Restrisiko:** nach Umsetzung der offenen Maßnahmen (Abschnitt 6) aus unserer Sicht **vertretbar**; ohne sie
  **hoch** bei R1, R6 und R9. Seit der Härtung sind die technischen Maßnahmen M-1 bis M-5 gebaut; offen bleiben vor
  allem Verträge (M-6), Anbieter-Einstellungen (M-7, M-8), die Prüfung der Texte (M-9) und die Einrichtung der
  Login-Rolle `fermata_edge_login` (M-1, Runbook Abschnitt 5). Eine Konsultation der Aufsichtsbehörde (Art. 36) halten wir dann nicht für nötig
  [[DSB bewerten]].

## 1. Warum eine DSFA nötig ist

| Kriterium (Art. 35 Abs. 3, Leitlinien WP 248, DSK-Muss-Liste) | Bei Fermata |
|---|---|
| Besondere Kategorien in großem Umfang (Art. 35 Abs. 3 lit. b) | Geschlecht/gesuchtes Geschlecht (EuGH C-184/20), Orientierung, Religion; biometrische Daten (Didit); geplant bis 5.000 Profile (Lasttest M4) |
| Profiling mit Bewertung von Personen (Art. 35 Abs. 3 lit. a) | Auswahl-Job: Teil-Scores, LLM-Bewertung, Zuordnung |
| Innovative Technologie | Sprach-KI (Viola), Sprachmodell zur Bewertung von Menschen |
| Abgleich/Zusammenführung von Datensätzen | Formular, Gespräch, Ausweisprüfung, Zeiten, Rückmeldungen |
| Schutzbedürftige Situation | intime Lebensentscheidungen, Treffen mit Fremden, Gefahr von Belästigung |
| Systematische Überwachung | nicht gegeben (keine Ortung, kein Tracking) |

## 2. Systematische Beschreibung

### 2.1 Zwecke

1. Warteliste und Einladung.
2. Konto, Einwilligungen, Ausweisprüfung (nur echte, volljährige Menschen).
3. Kennenlernen im Gespräch mit Viola, Zusammenfassung und Profil.
4. Auswahl eines Gegenübers und eines Lokals (Profiling), Freigabe durch einen Menschen.
5. Terminabstimmung, Reservierung, Erinnerungen, Rückmeldung, freiwilliger Kontakttausch.
6. Mitgliedschaft, Zahlung, Kündigung, Widerruf.
7. Sicherheit: Melden, Sperren, Sperrliste, Check-in, Hilfe, „Abend teilen“.
8. Betrieb: Protokolle, Kosten, Fairness-Bericht.

### 2.2 Betroffene

Interessierte (Warteliste), Mitglieder, Vertrauenspersonen (öffnen einen geteilten Link), Ansprechpersonen der
Partner-Lokale, Admin (Benn), Testpersonen des Stimmen-Blindtests (nur Bewertungsdateien ohne Namen).

### 2.3 Datenkategorien

Siehe [`docs/DATA.md`](../DATA.md) Abschnitt 3. Zusammengefasst:

| Kategorie | Beispiele | Schutzbedarf |
|---|---|---|
| Stammdaten | Name, Geburtsdatum, E-Mail, PLZ, Ort, Telefon | hoch (Treffen mit Fremden) |
| Art. 9 | Geschlecht, gesuchtes Geschlecht, Orientierung, Religion, (Gesundheit – keine Eingabe) | sehr hoch |
| Biometrie | Gesichtsbild, Ausweisbild – nur bei Didit | sehr hoch |
| Gesprächsinhalte | Transkript (30 Tage), Zusammenfassung, Profil | hoch |
| Bewertungen | Teil-Scores, LLM-Bewertung, Prüfnotizen, Rückmeldungen | hoch |
| Verhaltens- und Sicherheitsdaten | Meldungen, Sanktionen, Check-ins, Nichterscheinen | sehr hoch (Ruf, ggf. Straftaten) |
| Vertragsdaten | Stufe, Zeiträume, Bestellung, Kündigung, Widerruf, Stripe-Kennungen | normal |
| Technische Daten | IP (nur gehasht bzw. in Protokollen der Anbieter), Push-Abos | normal |

### 2.4 Systeme und Datenflüsse

```
Landingpage (Vercel, statisch) ──► Edge Functions ──► Supabase Frankfurt ◄── Web-App (Vercel, fra1)
                                         │                  ▲  ▲
                    Brevo (Mail) ◄───────┤                  │  └── Auswahl-Job (AWS Frankfurt, Rolle fermata_matcher)
                    Stripe (Zahlung) ◄───┤                  │         └─► Bedrock EU (Claude Sonnet 5.5), Titan
                    Didit (Ausweis) ◄────┤                  │
                    Push-Dienste ◄───────┘                  └── interview-agent ◄── Viola (AWS Frankfurt)
                                                                                     ├─► Deepgram EU (Sprache → Text)
          Browser ══WebRTC══► LiveKit (Weg A/B/C) ══════════════════════════════════►├─► Bedrock EU (Antworten)
                                                                                     └─► Polly Frankfurt (Stimme)
```

Kein Rohaudio wird gespeichert. Die Auswahl erhält Art.-9-Daten nur als Ja/Nein der Datenbank. Einzelheiten zu
Anbietern und Drittland: [av-liste.md](av-liste.md), DATA.md Abschnitte 4–5.

### 2.5 Speicherdauer

Siehe [loeschkonzept.md](loeschkonzept.md) und DATA.md Abschnitt 6 (pg_cron-Jobs) und 7 (Lücken).

## 3. Notwendigkeit und Verhältnismäßigkeit

| Grundsatz | Umsetzung | Nachweis im Code |
|---|---|---|
| Rechtsgrundlage | Einwilligungen einzeln (Art. 9: `art9_profile`, `art9_religion`, `biometrie`, `gespraech`), Vertrag, berechtigtes Interesse für Sicherheit; `art9_health` wird in Phase 1 nicht angeboten | `app.consents` (nur anhängen), `api.give_consent` nur aktuelle Fassung und nur angebotene Arten (`account.consents_not_offered`) |
| Zweckbindung | Art.-9-Daten nur für Ja/Nein-Prüfung und k-anonyme Fairness-Zählung; Formulardaten nie für die Auswahl | `sensitive.gender_compatible(_pairs)`, `sensitive.religion_compatible(_pairs)`, `sensitive.match_run_fairness`; `private.account_facts` ohne Recht für `fermata_matcher` |
| Datenminimierung | keine Straße (B1), nur PLZ-Mittelpunkt, keine Ausweisbilder/-nummer, IP nur als Tages-HMAC, kein Rohaudio, Lokal erfährt keine Namen, Push ohne Namen, Mails ohne Namen des Gegenübers, Sicherheits-Hinweise ohne Freitext, Stripe-Ereignisse gekürzt | `account.collect_street = false`, `app.geo.source = plz_centroid`, `ops.verification_complete`, `ops.daily_hash`, `record=False` (Viola), `minimizeEvent` |
| Richtigkeit | Zusammenfassung wird von der Person bestätigt/korrigiert; Name/Geburtsdatum per Ausweis geprüft | `api.interview_confirm_summary`, `facts_locked` |
| Speicherbegrenzung | 15 pg_cron-Jobs (neu: `fermata-retention` mit 11 Fristen `retention.*`); Transkripte 30 Tage; Teil- und Gesamtscores 12 Monate; unbestätigte Warteliste 7 Tage, angenommene Einladung löscht den Eintrag; Drossel 24 h | DATA.md Abschnitt 6, `ops.apply_retention` |
| Transparenz | Datenschutzerklärung, KI-Hinweis (gesprochen, angezeigt, schriftlich), Einwilligungstexte – in der Datenbank genau wie in `docs/recht` (Abgleich-Test) | `ai_notice_at`, `ops.legal_documents`, `_shared/legal/legal_docs.test.ts` |
| Betroffenenrechte | Export als Datei, Löschung per Knopf, Widerruf je Einwilligung, Widerspruch gegen Sanktionen, menschliche Prüfung jedes Vorschlags | `api.my_export`, `account-delete`, `api.revoke_consent`, `api.appeal`, `api.admin_approve_pairing` |
| Auftragsverarbeitung, Drittland | AV-Verträge, EU-Regionen und EU-Endpunkte gewählt | av-liste.md (Verträge noch offen) |

**Alternativen, die geprüft wurden:** Geschlecht im normalen Profil (verworfen: EuGH C-184/20); Embeddings und LLM
ohne Bereinigung (verworfen); Speichern von Audio zur Qualitätssicherung (verworfen); externer Geodienst (verworfen);
Haiku statt Sonnet (Kosten, nicht Datenschutz); Veriff als Alternative zu Didit (Plan B, Sitz Estland).

## 4. Risiken

Bewertung: Eintrittswahrscheinlichkeit (EW) gering / mittel / hoch; Schwere (S) gering / mittel / hoch / sehr hoch;
Risiko = Kombination, vor Maßnahmen („roh“) und danach („rest“).

| Nr. | Risiko | Quelle | EW roh | S | Risiko roh |
|---|---|---|---|---|---|
| R1 | **Offenlegung von Art.-9-Merkmalen** (Orientierung über gesuchtes Geschlecht, Religion; schon die Teilnahme an einer Dating-App ist sensibel) | Datenleck, Fehlberechtigung, Rückschluss durch das Gegenüber, Texte „Warum Sie beide“, Protokolle | mittel | sehr hoch | hoch |
| R2 | **Profiling mit Fehlern oder Benachteiligung** (Menschen bekommen keinen Vorschlag; LLM-Bewertung verzerrt; nichtbinäre Menschen in kleineren Gruppen) | Algorithmus, Sprachmodell, dünner Pool | mittel | mittel | mittel |
| R3 | **Biometrie bei Didit** (Gesichtsbild, Ausweis), US-Mutterkonzern, Aufbewahrung beim Anbieter | Anbieter, Drittland, fehlgeschlagene Löschung | mittel | sehr hoch | hoch |
| R4 | **Verarbeitung durch Sprachmodelle** (Gesprächsinhalte inkl. ungefragt erzählter Art.-9-Inhalte gehen live an Bedrock; Ausgaben können Art.-9-Inhalte erfinden; Prompt-Injection; Geo-Profil mit London/Zürich) | Sprachmodell, Anbieter | mittel | hoch | hoch |
| R5 | **Drittlandzugriff** (US-Behörden über Supabase, AWS, Vercel, Deepgram, Didit, LiveKit, Stripe; Push-Dienste) | Rechtsordnung der USA | gering–mittel | hoch | mittel |
| R6 | **Datenleck oder unbefugter Zugriff** (zentrale Datenbank; gestohlener `postgres`- oder `service_role`-Zugang; Admin-Konto übernommen; Fehler in RLS oder Ausführungsrechten; Backups) | Angriff, Fehlkonfiguration | mittel | sehr hoch | hoch |
| R7 | **Missbrauch durch Mitglieder** (Stalking, Belästigung, Nachstellen nach dem Abend; Weitergabe des geteilten Links; falsche Meldungen, um jemanden sperren zu lassen) | andere Mitglieder | mittel | hoch | hoch |
| R8 | **Minderjährige** nehmen teil | Täuschung | gering | sehr hoch | mittel |
| R9 | **Gesprächstexte und Stimme** (Aufzeichnung, längere Aufbewahrung, Einsicht ohne Anlass) | Anbieter, Admin | mittel | hoch | hoch |
| R10 | **Ein einziger Admin** (Benn): Insider-Zugriff, Freigaben „durchwinken“ (dann wäre Art. 22 einschlägig), Ausfall | Organisation | mittel | mittel | mittel |
| R11 | **Mitteilungen und Mails** auf gesperrten Bildschirmen oder geteilten Geräten | Umgebung der Person | mittel | mittel | mittel |
| R12 | **Unvollständige Löschung** (Daten bleiben ohne Frist, Stripe-Abo läuft nach Kontolöschung weiter, Gegenüber verliert Verlauf) | Code-Lücken | hoch | mittel | mittel |
| R13 | **Dauerhafte Sperrliste**, Fehltreffer beim Namen | Hashes | gering | mittel | gering |
| R14 | **Weitergabe an die Polizei** (Daten der beschuldigten Person, Vorwürfe = Art.-10-Daten) | Entscheidung Benn | gering | hoch | mittel |

## 5. Maßnahmen je Risiko (umgesetzt im Code oder organisatorisch)

### R1 Offenlegung von Art.-9-Merkmalen

| Maßnahme | Wo | Stand |
|---|---|---|
| Eigenes Schema `sensitive`, Tabellen gehören `fermata_sensitive`, Rechte für `service_role`, `anon`, `authenticated` entzogen | `20261003000200_accounts.sql` | umgesetzt |
| Spaltenverschlüsselung `pgp_sym_encrypt` (AES-256), Schlüssel `fermata_sensitive_key` in Supabase Vault | `sensitive.enc/dec`, `sensitive.key()` | umgesetzt |
| Auswahl nur über Ja/Nein-Funktionen (einzeln und im Stapel), Fairness nur k-anonym (k ≥ 5, nie gekreuzt) | `sensitive.*_compatible(_pairs)`, `sensitive.match_run_fairness`, `ops.k_anonymous_groups` (`…000410`) | umgesetzt, Tests `400_matcher.test.sql`, `test_db_checks.py` |
| Keine Admin-Funktion zeigt Art.-9-Angaben | `20261003000250_web_admin.sql` (M2) | umgesetzt |
| Text „Warum Sie beide“: Wortfilter (Religion, Gesundheit, Sexualität, Geschlecht, Herkunft …, Namen, PLZ) und Prüf-Agent; bei Treffer neutraler Ersatztext; Benn prüft vor Freigabe | `services/matcher/src/fermata_matcher/art9.py`, `pairings.review_notes` | umgesetzt |
| Eingaben an das LLM der Auswahl ohne Namen, PLZ, IDs, Art. 9; Geschlechtshinweise neutralisiert | `docs/bereiche/matcher.md` Abschnitt 7 | umgesetzt |
| Gespräch: Art.-9-Sätze nicht notiert, nicht in Zusammenfassung/Profil, im Transkript ersetzt; Datenbank lehnt Treffer erneut ab | `app.art9_categories`, `api.agent_save_*` (`…000310`) | umgesetzt |
| Mitglieder sehen von Vorschlägen nur ausgewählte Spalten; Gegenüber nie Nachname, Kontakt (vor beidseitigem Ja), Rückmeldung, Scores | Spaltenrechte `app.pairings`, `api.evening_detail` | umgesetzt |
| Push ohne Namen, Mails ohne Namen des Gegenübers, Lokal ohne Namen | `notify-dispatch`, Vorlagen | umgesetzt |
| Edge Functions mit enger Rolle `fermata_edge` (`FERMATA_DB_ROLE`): kein `sensitive.*`, kein Vault, kein `auth`; Speichern/Export laufen über security-definer-Funktionen | `_shared/db.ts`, `20261003000907_edge_role.sql`, Tests `907_edge_role`, `_shared/db.test.ts`, ganze Deno-Testreihe mit `FERMATA_DB_ROLE=fermata_edge` | **umgesetzt im Code**; Einrichtung der Login-Rolle im gehosteten Projekt **offen** (Runbook Abschnitt 5) |
| Einwilligungstext: Rückschluss des Gegenübers aus einem Vorschlag offen benennen | einwilligungen.md (`art9_profile`, Fassung `2026-10-03-m8-entwurf`) | Entwurf, Prüfung Anwalt |

**Rest:** mittel → nach offener Maßnahme gering–mittel. Rückschluss durch das Gegenüber lässt sich bei einer
Dating-App nicht vermeiden; Transparenz ist die Maßnahme.

### R2 Profiling, Fehler und Benachteiligung

| Maßnahme | Wo | Stand |
|---|---|---|
| **Jeder Vorschlag wird von einem Menschen geprüft** (Ansicht mit Scores, Begründung, Prüfnotizen, Art.-9-Filter-Treffern; Ablehnen jederzeit) | `api.admin_run_pairings`, `api.admin_approve_pairing`, `api.admin_reject_pairing` (aal2, Audit) | umgesetzt |
| Harte Filter nach festen, dokumentierten Regeln; LLM nur als Teil (50 %, Einstellung) | `docs/bereiche/matcher.md` | umgesetzt |
| Mindestscore auf Qualität; Wartebonus hilft nicht über die Schwelle | `matching.min_score` | umgesetzt |
| Fairness-Bericht je Lauf (Geschlecht, Altersband, k-anonym) | `sensitive.match_run_fairness` | umgesetzt; **Benn muss ihn lesen** (Routine im Runbook) |
| LLM-Ablehnung oder Fehler → nur Regeln, markiert | Auswahl-Job | umgesetzt |
| Verlängerungsregel: kein Abend ohne eigenes Zutun → Zeitraum kostenlos verlängert | `billing.apply_extension_rule` | umgesetzt (B12 offen) |
| Erklärung und menschliche Prüfung auf Anfrage („warum kein Vorschlag?“), Bericht nennt Gründe je Person (`match_run_members.unmatched_reason`) | Datenschutzerklärung Abschnitt 10 | Prozess **offen** (Runbook) |
| Matcher-Attrappe statt echtem Modell in Produktion verhindern | `services/matcher` (`config.ensure_production_safe`, `Runner.ensure_production_safe`, CLI Ausgang 3) | **umgesetzt:** bei `FERMATA_ENV=production` oder Datenbank `production` (bzw. unbekannt) bricht der Job vor jeder Arbeit ab, wenn LLM oder Embeddings `fake` sind; Test `test_production_guard.py` |

**Rest:** gering–mittel.

### R3 Biometrie bei Didit

| Maßnahme | Wo | Stand |
|---|---|---|
| Ausdrückliche Einwilligung `biometrie` vor der Prüfung | `ops.verification_begin` (M2) | umgesetzt |
| Bei Fermata keine Bilder, keine Ausweisnummer, kein Name aus dem Ausweis | `ops.verification_complete` | umgesetzt |
| Sitzung bei Didit direkt nach dem Ergebnis löschen; Nachweis `provider_session_deleted_at`; Nachholen; Zähler im Admin | `verification-webhook`, `ops.verifications_pending_deletion`, `api.admin_overview` | umgesetzt (M2) |
| Kürzeste Aufbewahrung bei Didit (1 Monat), Training mit Kundendaten abschalten | Didit-Konsole | **offen** (Runbook) |
| Webhook-Signatur geprüft | `_shared/didit/signature.ts` | umgesetzt |
| Plan B Veriff (Sitz EU) | – | Option |
| Alternative ohne Biometrie (B2) | – | **offen** |

**Rest:** mittel (Drittlandbezug bleibt).

### R4 Sprachmodelle

| Maßnahme | Wo | Stand |
|---|---|---|
| Bedrock in der EU (`eu.`-Profil bzw. Mantle `eu-central-1`); in Produktion erzwingt Viola EU-Wege und verbietet Attrappen | `services/viola/src/viola/config.py` | umgesetzt |
| Kein `temperature`, feste Systemtexte, strenge Werkzeug-Schemas, Regeln gegen Rollenwechsel (Prompt-Injection) | `prompts/system.md`, Tests | umgesetzt |
| Art.-9-Gegenprüfung durch Regeln + Modell; Datenbank prüft erneut | `analysis.py`, `app.art9_categories` | umgesetzt |
| Bedrock-Invocation-Logging ohne Inhalte; AWS speichert/trainiert nicht | AWS-Konto | **offen** (Runbook, AV-Vertrag) |
| Ablehnung durch das Modell → fester Satz bzw. „nur Regeln“; kein Ausweichmodell (ein Datenweg) | Code | umgesetzt |
| Transparenz: ungefragt erzählte Art.-9-Inhalte gehen live an das Modell | einwilligungen.md (`gespraech`), ki-hinweis.md Abschnitt 4 (neue Fassungen, alte bleiben als Nachweis; Mitglieder werden um erneute Zustimmung gebeten) | Entwurf, Prüfung Anwalt |
| Entscheidung EU-Geo-Profil (London, Zürich) oder regional Frankfurt | – | **offen** |

**Rest:** mittel.

### R5 Drittland

| Maßnahme | Stand |
|---|---|
| EU-Regionen und EU-Endpunkte (Supabase Frankfurt mit fester Region, Vercel `fra1`, AWS `eu-central-1`, Deepgram EU, Polly Frankfurt, LiveKit Weg C) | umgesetzt/konfiguriert (LiveKit B3 offen) |
| AV-Verträge mit SCC bzw. DPF-Zertifizierung je Anbieter, Transfer-Folgenabschätzung (TIA) | **offen** (av-liste.md) |
| Verschlüsselung in Ruhe (Anbieter) und Art.-9-Spaltenverschlüsselung mit Schlüssel in Vault | umgesetzt |
| Push-Inhalte Ende-zu-Ende verschlüsselt (RFC 8291) | umgesetzt |

**Rest:** gering–mittel.

### R6 Datenleck, unbefugter Zugriff

| Maßnahme | Wo | Stand |
|---|---|---|
| RLS auf jeder Tabelle; `anon`/`authenticated` ohne Standardrechte; nur `public`, `app`, `billing`, `api` über die API erreichbar | Fundament, `supabase/config.toml` | umgesetzt; RLS-Test über alle Tabellen (M2) |
| **Ausführungsrechte:** PUBLIC darf keine Fermata-Funktion ausführen; Test prüft das dauerhaft; Event-Trigger entzieht PUBLIC bei neuen Funktionen (M2) | `20261003099000_function_privileges.sql`, `990_privileges.test.sql`, `20261003000270_web_function_privileges.sql` | umgesetzt (Fund aus M5/M6, im Kern behoben) |
| Admin nur mit Zwei-Faktor (`aal2`) | `app.is_admin()` | umgesetzt |
| Audit-Protokoll nur anhängen | `ops.audit_log` + Trigger | umgesetzt |
| Geheimnisse nur in Umgebung/Vault/AWS Secrets Manager; interne Functions mit eigenem Geheimnis, Vergleich in konstanter Zeit | Functions | umgesetzt |
| Tokens in Links nur als SHA-256-Hash gespeichert; Statuslink im URL-Fragment | Warteliste, `trust_shares`, `contract_requests` | umgesetzt |
| CSP ohne `unsafe-inline` (Landingpage), CSP mit Nonce (Web-App), HSTS, keine Drittanbieter-Skripte | `apps/landing/vercel.json`, `apps/web/src/lib/csp.ts` | umgesetzt |
| Testuhr in Produktion technisch gesperrt; Mail-Ersatz in Produktion gesperrt | `ops.deployment`, Trigger | umgesetzt |
| Edge Functions in enger Rolle `fermata_edge` statt `postgres` | `_shared/db.ts`, `…000907` | umgesetzt im Code; Login-Rolle einrichten **offen** (siehe R1). Fund: `service_role` liest im Supabase-Abbild Vault – deshalb nicht `service_role`, sondern `fermata_edge` |
| Links „Abend teilen“ und Lokal-Bestätigung tragen das Token im URL-Fragment (`#t=…`) der Web-App; es erreicht weder Server-Protokolle noch Referrer | `api.create_trust_share`, `venueConfirmLink` (`…000903`) | umgesetzt |
| Backups verschlüsselt, Wiederherstellungstest, Zugriff auf das Supabase-Dashboard nur mit 2FA | Runbook | **offen** (organisatorisch) |
| Meldeprozess bei Datenpanne (72 h) | Runbook | beschrieben |

**Rest:** mittel.

### R7 Missbrauch durch Mitglieder

| Maßnahme | Wo | Stand |
|---|---|---|
| Kein freier Chat, keine Profile zum Stöbern, keine Suche nach Personen | Produktentscheidung | umgesetzt |
| Kontaktdaten nur nach beidseitigem Ja, nur in der App, nur gewählte Kanäle; „Nein“ unsichtbar | `api.submit_feedback`, `app.contact_share_for` | umgesetzt |
| Treffen nur in Partner-Lokalen, Reservierung ohne Namen | M5 | umgesetzt |
| Erkennungszeichen nur im Finde-Fenster, danach gelöscht | `api.evening_find_info`, `ops.purge_evening_data` | umgesetzt |
| Blockieren; Abstimmung ruht bei Blockierung oder Sperre | `app.blocks`, `evening_on_hold` | umgesetzt |
| Melden überall, Drossel 5/24 h, **automatische Sperre nur bei Beziehung** (gemeinsamer Abend oder gezeigter Vorschlag) gegen Falschmeldungen; meldende Person bleibt anonym | `api.report` (`…000710`) | umgesetzt |
| „Abend teilen“: 192-Bit-Schlüssel nur als Hash, höchstens 3 Links, Ablauf 24 h nach Beginn, zurückziehbar, nichts über das Gegenüber; Link auf die App-Seite `/teilen#t=…` | `api.create_trust_share`, `trust-view` | umgesetzt |
| Widerruf der Einwilligung `kontakttausch` zieht noch nicht freigegebene Kontakt-Freigaben zurück; dem Gegenüber werden widerrufene Kontaktdaten nicht mehr gezeigt | `api.revoke_consent`, `app.contact_share_for` (`…000906`), Test `900_legal_consents` | umgesetzt |
| Check-in, Hilfe-Knopf, Sofort-Mail an Benn | `api.checkin_respond` | umgesetzt |
| Sperrliste gegen Wiederanmeldung | `safety.blocklist` | umgesetzt |
| Kontolöschung während einer Prüfung hinterlässt Benn die Hashes | `ops.account_deletion_prepare` (M2) | umgesetzt |
| Einweisung des Lokal-Personals (Standard 14) | organisatorisch | **offen** |

**Rest:** mittel (Verhalten von Menschen lässt sich nur begrenzen).

### R8 Minderjährige

| Maßnahme | Stand |
|---|---|
| Geburtsdatum ≥ 18 Jahre (`app.is_of_age`), Ausweisprüfung mit Abgleich des Geburtsdatums; Hinweis „minderjährig“ bei Treffer | umgesetzt (M2) |
| Viola erkennt Hinweise, beendet das Gespräch, kein Profil (SQL lehnt ab), Hinweis „hoch“ an Benn | umgesetzt (M3) |
| Meldungsart „minderjährig“ = Null-Toleranz, vorläufige Sperre | umgesetzt (M7) |

**Rest:** gering.

### R9 Gesprächstexte und Stimme

| Maßnahme | Stand |
|---|---|
| Kein Rohaudio: LiveKit `record=False`, kein Egress, Test liest den Quelltext auf Schreibzugriffe | umgesetzt (M3) |
| Deepgram EU, `mip_opt_out=true`, Stille wird nicht gesendet | umgesetzt (M3) |
| Transkript 30 Tage, stündlicher Löschjob; Widerruf löscht sofort | umgesetzt |
| Art.-9-Sätze im Transkript ersetzt | umgesetzt |
| Längere Aufbewahrung bei Sicherheitsfällen nur per Einstellung (B5), heute aus | umgesetzt (aus) |
| **Admin-Einsicht in Transkripte** im Sicherheitsfall nur über eine Funktion mit Audit und Zwei-Faktor | umgesetzt: `api.admin_safety_transcript` (`…000902`) – nur `aal2`, nur bei offenem Hinweis oder offener Meldung zur Person, Begründung ≥ 10 Zeichen, Audit ohne Inhalt; Test `902_admin_transcript`. Einsicht im SQL-Editor bleibt technisch möglich (Runbook: verboten) |
| Entwurf der Zusammenfassung (`summary_draft`) nach Bestätigung löschen | umgesetzt: 30 Tage nach Bestätigung/Korrektur/Ende (`retention.summary_draft_days`) |

**Rest:** gering–mittel nach den offenen Maßnahmen.

### R10 Ein einziger Admin

| Maßnahme | Stand |
|---|---|
| Zwei-Faktor, Audit jeder Einsicht und Entscheidung | umgesetzt |
| Admin-Ansicht der Vorschläge nur mit Anzeigename und Altersband | umgesetzt |
| Regel „Lauf aussetzen statt ungeprüft freigeben“, Vertretung, Urlaubsregel | Runbook (organisatorisch) |
| Schulung zu KI-Grenzen (Art. 4 KI-VO) und zu Art. 22 („nicht durchwinken“) | **offen** |

### R11 Mitteilungen und Mails

Push ohne Namen, kurze Texte, Ruhezeiten; Mails ohne Namen des Gegenübers und ohne Kontaktdaten; Sicherheits-Mails
an Benn ohne Namen (nur Art, Stufe, Link). **Rest:** gering.

### R12 Unvollständige Löschung

| Maßnahme | Stand |
|---|---|
| Kontolöschung kaskadiert über alle Tabellen; Warteliste, Einladungen, Versandprotokoll werden mitgelöscht | umgesetzt (M2) |
| Lücken ohne Frist (Meldungen, Hinweise, Sicherheits-Mails, Stripe-Ereignisse, Vertragsanfragen, Vertragshandlungen, Versandprotokoll, Zeitfenster, Entwurf der Zusammenfassung, Scores, angenommene Einladungen, `auth.audit_log_entries`) | umgesetzt: täglicher Job `fermata-retention` (`ops.apply_retention`, `…000905`), Fristen als Einstellungen (Platzhalter C11), Test `905_retention`. `auth.audit_log_entries`: nur, wenn die Rolle es darf – sonst Aufbewahrung im Dashboard (Runbook) |
| Audit-Protokoll (`ops.audit_log`) | **bewusst ohne automatische Löschung** (Nachweis nach Art. 5 Abs. 2, enthält keine Inhalte); Höchstdauer offen – [loeschkonzept.md](loeschkonzept.md) |
| **Stripe-Abo nach Kontolöschung** | umgesetzt: `account-delete` beendet das Abo sofort (`DELETE /v1/subscriptions/{id}`), Vertragshandlung `cancel` mit Grund `konto_geloescht` (ohne Name/E-Mail, Personenbezug fällt mit der Löschung weg); scheitert Stripe, wird trotzdem gelöscht und Benn bekommt einen Hinweis „hoch“. Erstattung ungenutzter Zeiträume offen (C15) |
| Löscht eine Person ihr Konto, verschwindet der gemeinsame Abend auch für das Gegenüber | entschieden: offene Abende werden vorher über den Zustandsautomaten abgesagt (`cancel_admin`), Gegenüber und Lokal erhalten die neutrale M5-Nachricht (Inhalt festgehalten, überlebt die Löschung); das Gegenüber bekommt den Abend gutgeschrieben. Vergangene Abende verschwinden mit dem Konto; die Kontingent-Buchungen des Gegenübers bleiben, ohne Bezug auf den Abend – Test `904_account_deletion` |

### R13 Sperrliste

Nur HMAC-Hashes mit eigenem Vault-Schlüssel; Namens-Treffer sperrt nicht, sondern führt zu einer Prüfung durch
Benn; Aufheben des Ausschlusses löscht den Eintrag. **Begründung der dauerhaften Aufbewahrung:** Ausschlüsse erfolgen
nach Übergriffen, Bedrohungen oder Betrug; ohne dauerhafte Sperre könnte eine ausgeschlossene Person mit neuem Konto
erneut Menschen gefährden. Der Hash erlaubt keinen Rückschluss auf Namen oder Ausweisnummer ohne den Schlüssel.
[[DSB: Überprüfung der Einträge alle 5 Jahre vorschlagen?]] **Rest:** gering.

### R14 Polizei

Vorlage nur als Entwurf, kein automatischer Versand; Entscheidung durch Benn nach Rücksprache mit der betroffenen
Person; meldende Person nur mit ausdrücklichem Einverständnis; jeder Abruf im Audit (`api.admin_police_report_template`).
Siehe [polizeimeldung-vorlage.md](polizeimeldung-vorlage.md). **Rest:** gering. [[Anwalt: Art. 10 DSGVO]]

## 6. Offene Maßnahmen (Voraussetzung für das Restrisiko „vertretbar“)

| Nr. | Maßnahme | Risiko | Wer |
|---|---|---|---|
| M-1 | Eigene Login-Rolle für Edge Functions ohne Art.-9- und Vault-Zugriff (außer Speichern/Export) | R1, R6 | Technik: **Code umgesetzt** (`fermata_edge`); Benn: Login-Rolle und Secrets im gehosteten Projekt (Runbook 5) |
| M-2 | Admin-Funktion für Transkripte im Sicherheitsfall mit Audit; `summary_draft` leeren | R9 | **umgesetzt** (`api.admin_safety_transcript`, `retention.summary_draft_days`) |
| M-3 | Auswahl-Job: Attrappen in Produktion verweigern (`FERMATA_LLM_BACKEND`, `FERMATA_EMBEDDING_BACKEND`) | R2 | **umgesetzt** |
| M-4 | Kontolöschung kündigt Stripe-Abo bzw. verlangt vorher Kündigung | R12 | **umgesetzt** (sofortige Kündigung; Erstattung C15 offen) |
| M-5 | Löschfristen für die Lücken (Löschkonzept) als Jobs | R12 | **umgesetzt** (`fermata-retention`); Benn: Fristen C11 bestätigen |
| M-6 | AV-Verträge, SCC/DPF, TIA je Anbieter | R3, R4, R5 | Benn, Anwalt |
| M-7 | Didit: Aufbewahrung 1 Monat, Training aus | R3 | Benn |
| M-8 | Bedrock-Invocation-Logging ohne Inhalte, AI-Services-Opt-out (Polly), Weg festlegen | R4 | Benn |
| M-9 | Texte: Einwilligung `gespraech` (Art. 9), KI-Hinweis, Rückschluss des Gegenübers | R1, R4 | Entwürfe geschrieben (Fassung `2026-10-03-m8-entwurf`); Anwalt prüft |
| M-10 | Runbook-Routinen: Fairness-Bericht lesen, Meldungen in 24 h, Vertretung | R2, R7, R10 | Benn |
| M-11 | Einweisung Lokal-Personal | R7 | Benn |
| M-12 | Backup-Wiederherstellungstest, 2FA für alle Anbieter-Konten | R6 | Benn |

## 7. Restrisiko und Ergebnis

Nach Umsetzung von M-1 bis M-12: Restrisiko **mittel bis gering** in allen Bereichen; die Verarbeitung ist aus unserer
Sicht zulässig. Ohne M-1, M-2, M-4 und M-6 bleibt das Restrisiko bei R1, R6, R9 und R12 **hoch**; dann sollte der
Start verschoben werden. Stand nach der Härtung: M-2 und M-4 sind umgesetzt, M-1 im Code; vor dem Start fehlen die
Login-Rolle (M-1) und die Verträge (M-6).

[[Stellungnahme des Datenschutzbeauftragten]] · [[Entscheidung des Verantwortlichen, Datum, Unterschrift]]

## 8. Überprüfung

Diese DSFA wird überprüft: vor dem Start (M9), nach dem Probelauf, bei jeder neuen Datenart, jedem neuen Anbieter oder
Modell, bei Wechsel des LiveKit-Wegs oder der Stimme, spätestens jährlich.

## Offene Punkte für Benn/Anwalt

1. Stellungnahme des externen Datenschutzbeauftragten (B15).
2. Bewertungsskala und Einstufungen bestätigen.
3. Offene Maßnahmen M-1 (Einrichtung), M-6 bis M-12 terminieren; M-2 bis M-5 sind umgesetzt.
4. Art. 10 DSGVO (Meldungen über Straftaten) und Art. 22 (Fall „kein Vorschlag“) rechtlich einordnen.
5. Begründung und Überprüfungsrhythmus der dauerhaften Sperrliste.
6. Abgleich mit dem Auftrag (15 Sicherheitsstandards) und mit dem Stand von M2 nach der Zusammenführung.
7. `service_role` liest im Supabase-Abbild Vault (Test `907_edge_role`): bewerten, ob das als Restrisiko bei R6
   reicht (Schlüssel nur in den Functions) oder ob Supabase das ändern muss.
8. Kontolöschung: Nachweis der Einwilligungen entfällt mit dem Konto (Kaskade) – bewusst so? Alternativ pseudonymisiert
   aufbewahren (Art. 7 Abs. 1 vs. Art. 17).
