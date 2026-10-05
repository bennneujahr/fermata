# Entscheidungen (technisch)

Hier stehen Entscheidungen, die beim Bau getroffen wurden, mit Grund. Entscheidungen, die **Benn** noch treffen muss,
stehen in [PLATZHALTER.md](PLATZHALTER.md). Die Grundsatzentscheidungen aus [PLAN.md](../PLAN.md) (Abschnitt 2.5 und
„Entschieden am 03.10.2026“) gelten unverändert und werden hier nicht wiederholt.

Die Bereiche ergänzen eigene Entscheidungen in `docs/bereiche/*.md`.

## Grundgerüst (M0)

| Thema | Entscheidung | Grund |
|---|---|---|
| Repository | Monorepo im GitHub-Repo `bennneujahr/fermata` (Frage A2 damit erledigt), pnpm-Workspaces | ein Ort für Landingpage, Web-App, Datenbank und Dienste; CI prüft alles zusammen |
| Ordner | `apps/landing`, `apps/web`, `packages/{tokens,brand,shared}`, `supabase/`, `services/{viola,matcher}`, `docs/` | PLAN 2.4; die Struktur aus Abschnitt 4.2 des Auftrags lag nicht vor, deshalb eigene, gleichwertige Aufteilung |
| Node / TypeScript | Node 22, TypeScript 5.9 | TypeScript 7 ist neu (native Fassung); Next.js und Astro laufen mit 5.9 sicher |
| Design-Tokens | eine Quelle `packages/tokens/tokens.json` → CSS-Variablen, JSON, TypeScript | PLAN M0 („Tokens: CSS, JSON, TS“) |
| Farben | eigener Entwurf: Papier, Tinte, Weinrot, Messing, Nacht; hell und dunkel | die Design-Datei lag nicht im Repository; alle Paare erfüllen WCAG (Fließtext ≥ 7:1), geprüft mit `pnpm check:contrast` |
| Schriften | Fraunces (Überschriften) und Source Sans 3 (Text), beide SIL Open Font License, selbst gehostet, nur Latin/Latin Extended | keine Anfragen an Google; Latin Extended lädt nur bei Bedarf |
| Marke | Fermate „graviert“ (Bogen wie im Notenstich, zu den Enden fein) und „kompakt“ (für 16–32 px) | PLAN M0 |
| „Atem“ | Custom Element `<fermata-atem>`, CSS-Animation ohne Inline-Styles, Lautstärke über CSS-Variable; 2,4 KB gzip | PLAN M0 (≤ 8 KB gzip), CSP ohne `unsafe-inline` |
| Tonalität | Regeln in `scripts/tone-rules.json`, Prüfung `pnpm check:tone` | PLAN 2.4; Regeln sind ein Entwurf (siehe PLATZHALTER) |

## Datenbank

| Thema | Entscheidung | Grund |
|---|---|---|
| Testumgebung | Docker-Abbild `supabase/postgres:17.6.1.054` plus die echten Auth-Migrationen von `supabase/gotrue:v2.180.0`; pgTAP-Runner `scripts/db-test.mjs` | so nah wie möglich an Supabase; die Rolle `postgres` ist wie im gehosteten Betrieb kein Superuser |
| Umgebung | Tabelle `ops.deployment` (Standard `production`), nicht eine Datenbank-Einstellung | `alter database … set` darf `postgres` bei Supabase nicht; die Tabelle lässt sich ohne Superuser nicht von `production` wegschalten |
| Simulierte Uhr | `app.now()` = echte Zeit + Versatz aus `ops.sim_clock`, Versatz nur in test/local/ci | PLAN 2.4; in Produktion technisch gesperrt (Trigger + `ops.deployment`) |
| Einstellungen | `ops.app_settings` mit Verlauf `ops.app_settings_history`; öffentliche Werte über `api.public_settings()` | PLAN 2.4 |
| Erreichbare Schemas | über die API nur `public`, `app`, `billing`, `api`; `private`, `sensitive`, `safety`, `ops` bleiben verborgen | PLAN 3.1; Zugriff dort nur über geprüfte Funktionen |
| Rechte | `anon` und `authenticated` bekommen nie Standardrechte, jede Tabelle ausdrücklich; `service_role` darf alles außer den Art.-9-Tabellen | „immer auf Nummer sicher“ |
| Art.-9-Verschlüsselung | Spalten `*_enc` mit `pgp_sym_encrypt` (AES-256), Schlüssel in Supabase Vault (`fermata_sensitive_key`); Tabellen gehören der Rolle `fermata_sensitive`; `service_role` hat keine Rechte darauf | PLAN 3.2 Nr. 4–5; pgsodium-TCE wird von Supabase nicht mehr empfohlen, Vault bleibt |
| Prüffunktionen | `sensitive.gender_compatible(a, b)`, `sensitive.religion_compatible(a, b)` liefern nur `true`/`false` | PLAN 3.2 Nr. 5 |
| Sperrliste | HMAC-SHA256 mit eigenem Vault-Schlüssel (`fermata_blocklist_key`), nicht mit dem Tagessalz | Hashes müssen dauerhaft vergleichbar bleiben |
| Drossel | HMAC mit Tagessalz (`ops.daily_hash`), Salze werden gelöscht | PLAN 2.2 (IP nur als Hash mit Tagessalz) |
| Einwilligungen | nur anhängen; Ändern per Trigger gesperrt; Löschen nur mit dem Konto | PLAN 3.2 Nr. 8 |
| Abende | erlaubte Wechsel als Daten in `app.evening_transitions`; Zustand ändert nur `app.evening_transition()`; direkter `UPDATE` wird abgelehnt | PLAN 3.2 Nr. 13 |
| Auswahl-Job | eigene Rolle `fermata_matcher` ohne RLS-Umgehung, mit eigenen Richtlinien nur für die nötigen Tabellen | PLAN 3.2 Nr. 5 („eigene, enge Datenbankrolle“) |
| Edge Functions | Deno, Regeln in SQL-Funktionen (`api.*`), Functions rufen sie über eine direkte Verbindung (`SUPABASE_DB_URL`, Transaktions-Pooler, `prepare: false`) | Regeln einmal in der Datenbank, testbar mit pgTAP; die Expo-App nutzt später dieselben Regeln (PLAN 2.1) |
| Mails | Brevo in production/staging, sonst `ops.mail_outbox`; jede Mail ohne Inhalt in `ops.notifications_log` | keine echten Mails in Tests; Protokoll ohne Personenbezug |

## Quellen

Die geprüften Quellen stehen am Ende von [PLAN.md](../PLAN.md). Neue Quellen ergänzen die Bereiche in `docs/bereiche/`.
