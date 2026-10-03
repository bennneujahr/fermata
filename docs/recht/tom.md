# Technische und organisatorische Maßnahmen (TOM, Art. 32 DSGVO)

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026. Jede technische Maßnahme nennt die Stelle im Code. Status: **umgesetzt** (im Code und getestet),
> **Konfiguration** (Benn stellt beim Anbieter ein, siehe [Runbook](../RUNBOOK.md)), **TODO** (noch zu tun).
> M2 (Web-App) ist im Branch `build/web` noch im Bau; M3 (Viola) liegt im Hauptzweig (Commit `e84647b`).

## 1. Vertraulichkeit

### 1.1 Zutritt und Zugang zu Systemen

| Maßnahme | Umsetzung | Status |
|---|---|---|
| Keine eigenen Server-Räume; Rechenzentren der Anbieter (AWS Frankfurt über Supabase und eigenes AWS-Konto, Vercel) | Zertifizierungen der Anbieter [[ISO 27001/SOC 2 je Anbieter ablegen]] | Konfiguration |
| Zwei-Faktor für alle Anbieter-Konten (Supabase, Vercel, AWS-Root und IAM, Stripe, Brevo, Didit, Deepgram, GitHub, Domain) | Passwort-Manager, Hardware- oder App-Faktor | TODO (organisatorisch) |
| Admin-Bereich der App nur mit Zwei-Faktor (TOTP, Supabase-Stufe `aal2`) | `app.is_admin()` (`20261003000000_foundation.sql`); Einrichtung `apps/web/src/app/admin/mfa` (M2) | umgesetzt |
| Anmeldung der Mitglieder ohne Passwort (6-stelliger Code, 15 Minuten gültig), Selbstregistrierung aus | `supabase/config.toml` (`enable_signup = false`, `otp_length = 6`, `otp_expiry = 900`) | umgesetzt |
| Arbeitsrechner von Benn: Festplattenverschlüsselung, Bildschirmsperre, aktuelle Updates | – | TODO (organisatorisch) |

### 1.2 Zugriff auf Daten (Berechtigungen)

| Maßnahme | Umsetzung | Status |
|---|---|---|
| **Row Level Security** auf jeder Tabelle; `anon` und `authenticated` ohne Standardrechte, jede Tabelle ausdrücklich | Fundament; RLS-Test über alle Tabellen (M2) | umgesetzt |
| Über die API erreichbar nur `public`, `app`, `billing`, `api` (dazu `graphql_public` als Supabase-Standard); `private`, `sensitive`, `safety`, `ops` verborgen | `supabase/config.toml` `[api] schemas` | umgesetzt; **prüfen:** GraphQL-Schnittstelle im gehosteten Projekt abschalten, wenn nicht genutzt |
| **Ausführungsrechte** von Funktionen: PUBLIC darf keine Fermata-Funktion ausführen; `anon` nur eine Liste öffentlicher Funktionen; dauerhaft per Test geprüft; neue Funktionen bekommen das Recht per Event-Trigger entzogen | `20261003099000_function_privileges.sql`, `supabase/tests/990_privileges.test.sql`, `20261003000270_web_function_privileges.sql` (M2) | umgesetzt (Fund aus M5/M6, im Kern behoben) |
| Alle Funktionen mit erhöhten Rechten `security definer` mit `search_path = ''` und eigener Prüfung, wer aufruft | alle Migrationen | umgesetzt |
| Art.-9-Tabellen gehören der Rolle `fermata_sensitive`; `service_role`, `anon`, `authenticated` haben keine Rechte | `20261003000200_accounts.sql` | umgesetzt |
| Auswahl-Job mit eigener Rolle `fermata_matcher` ohne RLS-Umgehung, nur nötige Tabellen; Login-Rolle `noinherit` mit `SET ROLE` | `20261003000400`, `…000410`; Runbook | umgesetzt (Login-Rolle: Konfiguration) |
| Viola ohne Datenbankzugang; schreibt nur über `interview-agent` mit Geheimnis, dort `set local role fermata_agent` | `supabase/functions/_shared/interview/db.ts` (Hauptzweig) | umgesetzt |
| Mitglieder sehen von Vorschlägen nur ausgewählte Spalten (Spaltenrechte) | `app.pairings`, `billing.memberships` | umgesetzt |
| Admin sieht keine Art.-9-Angaben | keine Admin-Funktion liest `sensitive.*` (M2) | umgesetzt |
| **Edge Functions verbinden sich als `postgres`** (Mitglied von `fermata_sensitive`, Zugriff auf Vault) | `supabase/functions/_shared/db.ts` | **TODO:** eigene Login-Rolle mit engen Rechten (DSFA M-1) |
| Einsicht in Transkripte im Sicherheitsfall nur über eine Funktion mit Audit | – | **TODO** (DSFA M-2); bis dahin keine Einsicht |

### 1.3 Trennung

| Maßnahme | Umsetzung | Status |
|---|---|---|
| Schemas nach Schutzbedarf: `private` (Fakten), `sensitive` (Art. 9), `safety`, `billing`, `ops` | PLAN 3.1, Fundament | umgesetzt |
| Umgebungen getrennt (production, staging, local, test, ci); Produktion lässt sich ohne Superuser nicht umschalten | `ops.deployment` + Trigger | umgesetzt |
| Testuhr und Mail-Ersatz in Produktion technisch gesperrt; Simulation des Auswahl-Jobs verweigert Produktion | `ops.guard_sim_clock`, `ops.guard_outbox`, `services/matcher/src/fermata_matcher/simulate.py` | umgesetzt |
| Tests nur mit erfundenen Daten | `supabase/tests`, `services/*/tests` | umgesetzt |
| Eigenes Supabase-Projekt für Staging | – | TODO (Runbook) |

### 1.4 Verschlüsselung und Pseudonymisierung

| Maßnahme | Umsetzung | Status |
|---|---|---|
| Transportverschlüsselung überall (HTTPS, HSTS auf der Landingpage, WebRTC verschlüsselt) | `apps/landing/vercel.json`; Anbieter | umgesetzt |
| Verschlüsselung in Ruhe | Anbieter (Supabase/AWS) | Konfiguration (Standard) |
| **Spaltenverschlüsselung Art. 9** mit `pgp_sym_encrypt` (AES-256), Schlüssel `fermata_sensitive_key` in Supabase Vault, nie im Code | `sensitive.enc/dec/key` | umgesetzt |
| Sperrliste nur als HMAC-SHA256 mit eigenem Vault-Schlüssel `fermata_blocklist_key`; Ausweisnummer und Name werden nie gespeichert | `safety.blocklist_hash`, `app.verification_record_hashes` | umgesetzt |
| IP-Adressen nur als HMAC mit Tagessalz; Salze nach 2 Tagen gelöscht | `ops.daily_hash`, `api.waitlist_cleanup` | umgesetzt |
| Links in Mails: nur SHA-256-Hash des Schlüssels gespeichert (Warteliste, Kündigung/Widerruf ohne Anmeldung, „Abend teilen“ mit 192 Bit); Statuslink im URL-Fragment (nicht in Server-Logs); Bestätigungslink der Lokale signiert (`VENUE_LINK_SECRET`) | `20261003000100`, `…000630`, `…000710`, `venue-confirm` | umgesetzt |
| Push-Inhalte Ende-zu-Ende verschlüsselt (RFC 8291, VAPID RFC 8292) | `supabase/functions/_shared/push` | umgesetzt |
| E-Mail der Warteliste im Konto nur als SHA-256 (`app.accounts.waitlist_email_hash`) | M2 | umgesetzt; Hinweis: ungesalzener Hash einer E-Mail ist nur schwach pseudonym |
| Auswahl-LLM erhält keine Namen, PLZ, IDs, Art. 9; Entfernung gerundet | `services/matcher` | umgesetzt |

## 2. Integrität

| Maßnahme | Umsetzung | Status |
|---|---|---|
| **Audit-Protokoll** aller Admin-Handlungen und Einsichten (Konten, Meldungen, Vorschläge, Polizeivorlage, Einstellungen), nur anhängen | `ops.audit_log` + Trigger `audit_log_append_only`; `ops.app_settings_history` | umgesetzt |
| Tabellen nur zum Anhängen: Einwilligungen, Abend-Verlauf, Kontingent-Buch, Vertragserklärungen (Art, Zeit, Inhalt) | Trigger `ops.forbid_change` | umgesetzt |
| Zustandsautomat für Abende; direkte Änderung des Zustands abgelehnt | `app.evening_transition`, `app.guard_evening_state` | umgesetzt |
| Eingaben in der Datenbank geprüft (Formate, Grenzen), Fehler mit fester Kennung | alle `api.*` | umgesetzt |
| Interne Aufrufe nur mit Geheimnis, Vergleich in konstanter Zeit (`FERMATA_INTERNAL_SECRET`, `NOTIFY_DISPATCH_SECRET`, `INTERVIEW_AGENT_SECRET` ≥ 32 Zeichen) | `_shared/crypto.ts`, `interview-agent` | umgesetzt |
| Webhooks mit Signaturprüfung: Stripe (HMAC, 5 Minuten Toleranz), Didit | `_shared/stripe/webhook.ts`, `_shared/didit/signature.ts` (M2) | umgesetzt |
| Idempotenz: Stripe-Ereignisse einmal; Nachrichten mit `dedupe_key`; Bestellung mit `requestId` | `billing.stripe_events`, `ops.notification_queue` | umgesetzt |
| Bestellübersicht mit Hash; Bestellung abgelehnt, wenn sich die Übersicht geändert hat | `billing.summary_hash` | umgesetzt |
| Art.-9-Prüfung beim Speichern von Zusammenfassung und Profil (Regeln in SQL, gleiche Liste wie im Dienst) | `app.art9_categories` | umgesetzt |
| Content-Security-Policy ohne `unsafe-inline` (Landingpage), mit Nonce (Web-App), keine Skripte Dritter | `apps/landing/vercel.json`, `apps/web/src/lib/csp.ts` (M2) | umgesetzt |
| Drosseln: Warteliste 5/h je IP-Hash, Meldungen 5/24 h, Kündigungs-/Widerrufslinks 3/h je Vertrag, Gespräche 6/Tag, „Abend teilen“ 3 je Abend; Wartelisten-Antwort immer gleich (keine Abfrage, wer angemeldet ist) | Einstellungen, `api.*` | umgesetzt |

## 3. Verfügbarkeit und Belastbarkeit

| Maßnahme | Umsetzung | Status |
|---|---|---|
| Backups der Datenbank | Supabase (tägliche Backups je Tarif; Point-in-Time-Recovery optional) | Konfiguration |
| **Wiederherstellungstest** mindestens halbjährlich | Runbook | TODO |
| Feste Region Frankfurt (keine automatische Umleitung) – bewusst; fällt Frankfurt aus, steht Fermata | PLAN 5.13 | bewusst so |
| Fristen-Jobs idempotent, Wiederholung bei Fehlern, keine Verklemmung (`skip locked`) | `ops.process_evening_deadlines` | umgesetzt |
| Versand mit Wiederholungen (5 Versuche), Mails immer, wenn eine Frist läuft | `ops.notify_claim`, `notify-dispatch` | umgesetzt |
| Container ohne Root-Rechte (Auswahl-Job Benutzer `fermata`, Viola Benutzer 10001, schreibgeschützt) | `services/matcher/Dockerfile`, `services/viola/Dockerfile` | umgesetzt |
| Zeitlimit der Zuordnung mit Ersatzverfahren | `matching.assignment_timeout_seconds` | umgesetzt |
| Überwachung (Fehler der Functions, gescheiterte Jobs, offene Löschaufträge bei Didit) | Runbook (tägliche Prüfung) | TODO |

## 4. Datenschutz durch Technikgestaltung (Art. 25)

| Maßnahme | Umsetzung | Status |
|---|---|---|
| Keine Cookies und keine Speicherung auf der Landingpage; Web-App nur Anmelde-Cookie und Farbschema | Playwright-Tests `apps/landing/tests` | umgesetzt |
| Schriften selbst gehostet; keine Anfragen an Dritte aus dem Browser (Ausnahmen: Stripe beim Bezahlen, Didit, LiveKit) | `packages/brand`, CSP | umgesetzt |
| **Kein Rohaudio**: LiveKit `record=False`, kein Egress; Test prüft, dass keine Dateien entstehen | `services/viola` (Hauptzweig) | umgesetzt |
| Transkripte 30 Tage, Art.-9-Sätze ersetzt | `ops.purge_transcripts`, `interview.redact_art9_in_transcripts` | umgesetzt |
| Löschjobs (14 pg_cron-Jobs, davon 5 mit Löschwirkung) | [`docs/DATA.md`](../DATA.md) Abschnitt 6 | umgesetzt |
| Sparsame Voreinstellungen: Straße nicht abgefragt, Orientierung freiwillig, Erkennungsfoto nicht gebaut (B7), Kontakte nur in der App | Einstellungen | umgesetzt |
| Sicherheits-Hinweise ohne Freitext; Mails an Benn ohne Namen | `api.agent_flag_safety`, `safety.mail_queue` | umgesetzt |
| Viola in Produktion: keine Attrappen, nur EU-Wege | `services/viola/src/viola/config.py` | umgesetzt |
| Auswahl-Job in Produktion: Attrappen verweigern | – | **TODO** (Standard `fake`) |

## 5. Verfahren zur regelmäßigen Überprüfung

| Maßnahme | Umsetzung | Status |
|---|---|---|
| Automatische Tests bei jedem Stand (pgTAP inkl. Rechte, Deno, pytest, Playwright inkl. „keine Anfrage verlässt localhost“, axe) | `.github/workflows/ci.yml` | umgesetzt |
| Datenschutz-Prüfung vor jedem neuen Anbieter, Modell oder Datenfeld (DSFA, VVT, AV-Liste fortschreiben) | Startcheckliste, Runbook | TODO (organisatorisch) |
| Jährliche Überprüfung der TOM mit dem Datenschutzbeauftragten | – | TODO |
| Schlüsselrotation (Vault, Geheimnisse der Functions, API-Schlüssel) | Runbook | TODO (Verfahren beschrieben) |
| Prozess für Datenpannen (Meldung binnen 72 h, Art. 33/34) | Runbook | beschrieben |
| Prozess für Betroffenenanfragen (Antwort binnen 1 Monat) | Export/Löschung in der App, sonst Runbook | umgesetzt/organisatorisch |

## 6. Organisatorische Maßnahmen

| Maßnahme | Status |
|---|---|
| Externer Datenschutzbeauftragter benannt und gemeldet (B15) | TODO |
| AV-Verträge mit allen Auftragsverarbeitern ([av-liste.md](av-liste.md)) | TODO |
| Verpflichtung auf Vertraulichkeit für alle, die Zugriff erhalten (heute nur Benn) | TODO |
| Vertretungsregel, wenn Benn nicht erreichbar ist (Runbook „Was passiert, wenn Benn nicht erreichbar ist“) | beschrieben |
| Einweisung des Lokal-Personals (Sicherheitsstandard 14) | TODO |
| Kurze Schulung zu KI-Grenzen und zur menschlichen Prüfung (Art. 4 KI-VO, Art. 22 DSGVO) | TODO |

## Offene Punkte für Benn/Anwalt

1. Edge Functions mit eigener, enger Login-Rolle (statt `postgres`).
2. Transkript-Einsicht mit Audit bauen.
3. Auswahl-Job: Attrappen in Produktion verweigern.
4. Zwei-Faktor für alle Anbieter-Konten, Wiederherstellungstest, Überwachung einrichten.
5. GraphQL-Schnittstelle im Supabase-Projekt prüfen/abschalten.
6. Zertifikate der Anbieter ablegen; jährliche Prüfung mit dem Datenschutzbeauftragten.
