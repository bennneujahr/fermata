# Bereich Web-App (M2)

Stand: 03.10.2026 · Bereich `apps/web` (Next.js 16, App Router) mit Datenbank-Migrationen `20261003000210`–`…270`,
Edge Functions `account-*`, `verification-*`, `admin-invite` und `_shared/didit`.

> **Kurz für Benn:** Anmeldung mit Code und Link, Einladung aus dem Admin, Einwilligungen einzeln,
> Formular, Ausweisprüfung (Didit, lokal als Simulation), Datenexport, Kontolöschung und ein Admin mit
> Zwei-Faktor sind fertig und getestet. Offene Entscheidungen stehen unten unter „Für Benn“.

## Inhalt

1. [Was es gibt](#was-es-gibt)
2. [Lokal starten](#lokal-starten)
3. [Tests](#tests)
4. [Umgebungsvariablen](#umgebungsvariablen)
5. [Deployment (Vercel, fra1)](#deployment-vercel-fra1)
6. [API-Vertrag (für Welle 2)](#api-vertrag-für-welle-2)
7. [Aufbau der App und Bausteine](#aufbau-der-app-und-bausteine)
8. [Datenschutz und Sicherheit](#datenschutz-und-sicherheit)
9. [Entscheidungen](#entscheidungen)
10. [Für Benn: offene Punkte und Platzhalter](#für-benn-offene-punkte-und-platzhalter)
11. [Abweichungen von PLAN.md](#abweichungen-von-planmd)
12. [Hinweise für die Integration](#hinweise-für-die-integration)

## Was es gibt

| Bereich | Wege | Stand |
|---|---|---|
| Anmeldung | `/anmelden`, `/anmelden/code`, `/anmelden/bestaetigen`, `/abgemeldet` | E-Mail mit 6-stelligem Code **und** Link (PLAN 2.5), nur eingeladene Adressen (`shouldCreateUser: false`) |
| Onboarding | `/onboarding/einwilligungen` → `/angaben` → `/identitaet` → `/ausweis` (+ `/zurueck`, `/simulation`) | Schritte serverseitig gespeichert, jederzeit fortsetzbar (Stand aus `api.my_onboarding()`) |
| Mitglieder | `/start`, `/gespraech`, `/abende`, `/mitgliedschaft`, `/konto`, `/konto/einwilligungen`, `/konto/daten`, `/konto/loeschen` | Start mit Stand und nächstem Schritt; Gespräch, Abende, Mitgliedschaft und Sicherheit sind gebaut (Welle 2, siehe [ui-gespraech-abende.md](ui-gespraech-abende.md) und [ui-mitgliedschaft-sicherheit.md](ui-mitgliedschaft-sicherheit.md)) |
| Hilfe | `/hilfe` (immer über den Hilfe-Knopf oben rechts), `/installieren`, `/rechtliches`, `/offline` | Notruf 110 und Heimwegtelefon aus `api.public_settings()`; Anleitung „Zum Home-Bildschirm“ (PLAN 5.2) |
| Admin | `/admin`, `/admin/konten`, `/admin/konten/[id]`, `/admin/einladen`, `/admin/pruefungen`, `/admin/hinweise`, `/admin/einstellungen`, `/admin/mfa/*` | nur für `app.admin_users` mit TOTP (aal2); serverseitig erzwungen (Proxy, Layout) und in der Datenbank (`app.is_admin()`) |
| PWA | `/manifest.webmanifest`, `/sw.js` | Offline-Seite, Empfang von Web-Push und Klick auf Mitteilungen (Versand baut M5) |

Bildschirmfotos (mobil 390 px und Desktop, hell und dunkel): [`docs/screenshots/web/`](../screenshots/web/).

## Lokal starten

Voraussetzungen: Node 22, pnpm 10, Deno 2, Docker. Alles im Ordner des Repositorys.

```bash
pnpm install
# Stapel: Postgres (54348) + GoTrue (54343) + PostgREST (54344) + Mailpit (54346/54347)
#         + Edge Functions (54341) + kleines Gateway (54345, ersetzt Kong)
bash apps/web/scripts/stack.sh up          # schreibt apps/web/.stack/env
bash apps/web/scripts/serve-e2e.sh         # baut die App mit dieser Umgebung und startet sie auf :3041
```

Dann <http://localhost:3041>. Mails der Anmeldung landen in Mailpit (<http://localhost:54347>), Mails der
Edge Functions (Einladung, Löschung) in `ops.mail_outbox`.

Erste Personen anlegen (lokal):

```bash
set -a; . apps/web/.stack/env; set +a
# Admin anlegen (danach unter /anmelden mit Code anmelden und TOTP einrichten)
ID=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "content-type: application/json" \
  -d '{"email":"benn@example.de","email_confirm":true}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
psql "$SUPABASE_DB_URL" -c "insert into app.admin_users (user_id, display_name) values ('$ID', 'Benn')"
# Mitglieder lädt der Admin unter /admin/einladen ein.
```

Die Ausweisprüfung läuft lokal mit `DIDIT_MODE=fake`: Statt zu Didit führt „Ausweis jetzt prüfen“ auf
`/onboarding/ausweis/simulation`. Dort wählt man „bestätigen“, „ablehnen“, „anderer Name“, „17 Jahre“ oder
„manuelle Prüfung“; die Seite schickt einen signierten Webhook wie Didit an `verification-webhook`.

Aufräumen: `bash apps/web/scripts/stack.sh down` (stoppt Container, Gateway, Functions und Next).

Für `next dev` (Port 3041): `set -a; . apps/web/.stack/env; set +a; pnpm --filter @fermata/web dev`.
In der Entwicklung erlaubt die CSP zusätzlich `'unsafe-eval'` (React-Fehleranzeigen), im Build nicht.

## Tests

| Was | Befehl | Stand 03.10.2026 |
|---|---|---|
| Datenbank (pgTAP, inkl. Kern-Tests) | `DB_PORT=54342 DB_CONTAINER=fermata-db-web bash scripts/db.sh test` | 6 Dateien, 457 Prüfungen grün |
| Edge Functions (Deno) | `cd supabase/functions && SUPABASE_DB_URL=postgres://postgres:postgres@localhost:54342/postgres deno test --allow-env --allow-net --allow-read _shared/didit verification-webhook account-export account-delete admin-invite` | 18 Tests grün (braucht die Test-DB aus der Zeile darüber) |
| Unit (Vitest) | `pnpm --filter @fermata/web test` | 24 Tests grün |
| E2E (Playwright, axe, CSP) | Stapel + `serve-e2e.sh`, dann `pnpm --filter @fermata/web test:e2e` | 15 Tests grün |
| Bildschirmfotos | `pnpm --filter @fermata/web screenshots` | 75 Bilder |
| Typen, Lint, Build | `pnpm --filter @fermata/web typecheck`, `… lint`, `… build` | grün |
| Tonalität, Kontraste | `pnpm checks` | grün |

Die RLS-Prüfung (`supabase/tests/200_rls_all_tables.test.sql`) geht über **jede** Tabelle in `app`, `private`,
`sensitive`, `safety`, `billing`, `ops` (und `public.waitlist*`, falls vorhanden): Sie legt fremde Daten an
und prüft als Mitglied (aal1), als Mitglied mit aal2, als Admin **ohne** Zwei-Faktor und als anon, dass keine
fremde Zeile sichtbar ist. Dazu: keine Schreibrechte außer den gewollten, anon ohne Tabellenrechte, keine
Fermata-Funktion für PUBLIC ausführbar, interne Funktionen weder für anon noch für Mitglieder ausführbar.
Neue Tabellen ohne Testdaten meldet der Test als Diagnose.

E2E-Hauptablauf: Einladung → Anmeldung mit dem Code aus der Mail (Mailpit) → drei Einwilligungen einzeln →
Angaben (18+, PLZ → Ort) → Identität → Einwilligung Biometrie → Fake-Didit „bestätigen“ → Start „eingerichtet“.
Auf jeder Seite laufen axe (WCAG 2.1 AA) und eine Prüfung auf CSP-Verstöße in der Konsole.

## Umgebungsvariablen

### Web-App (Vercel)

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ja | Supabase-Projekt (Frankfurt). Einzige fremde Adresse, die der Browser anspricht (CSP `connect-src`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ja | öffentlicher Schlüssel (anon/publishable) |
| `SUPABASE_FUNCTIONS_URL` | nein | Basis der Edge Functions, Standard `<SUPABASE_URL>/functions/v1` |
| `FERMATA_ENV` | ja | `production`, `staging`, `local`, `test`, `ci` |
| `DIDIT_MODE` | nein | `live` (Standard) oder `fake` (nur außerhalb von production; schaltet `/onboarding/ausweis/simulation` frei) |
| `DIDIT_WEBHOOK_SECRET` | nur fake | Geheimnis, mit dem die Simulationsseite den Webhook signiert |
| `FERMATA_CSP_EXTRA_CONNECT`, `FERMATA_CSP_EXTRA_FRAME` | später | zusätzliche CSP-Ziele für Stripe (M6) und LiveKit (M3), durch Leerzeichen getrennt |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | später | für Web-Push-Abos (M5) |
| `NEXT_PUBLIC_SW_DEV` | nein | `1` meldet den Service Worker auch in `next dev` an |

Vorlage: [`apps/web/.env.example`](../../apps/web/.env.example).

### Edge Functions (Supabase Secrets)

| Variable | Bedeutung |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` | setzt Supabase selbst |
| `FERMATA_ENV` | wie oben |
| `FERMATA_APP_URL` | Adresse der Web-App (Links in Mails, Rücksprung von Didit) |
| `FERMATA_ALLOWED_ORIGINS` | CORS (kommagetrennt) |
| `FERMATA_CONTACT_EMAIL` | Kontakt in Mails |
| `DIDIT_MODE` | `live` oder `fake` (fake ist in production gesperrt) |
| `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID` | Didit-Zugang (Sandbox vor dem Start) |
| `DIDIT_WEBHOOK_SECRET` | Webhook-Geheimnis aus dem Didit-Konto |
| `DIDIT_API_BASE` | optional, Standard `https://verification.didit.me` |
| `BREVO_API_KEY`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | Mailversand (aus M0) |

### Supabase Auth (gehostet)

- **Site URL = Adresse der Web-App** (die Anmelde-Mail baut daraus `…/anmelden/bestaetigen?token_hash=…`).
- Vorlage „Magic Link“ = `supabase/templates/anmeldung.html`, Code-Länge 6, Gültigkeit 15 Minuten.
- Registrierung aus (nur Einladung), MFA/TOTP an, SMTP über Brevo.
- Rate-Limit „E-Mails je Stunde“ in Produktion deutlich über dem lokalen Wert 2 einstellen.
- `verification-webhook` ohne JWT-Prüfung deployen (`supabase/config.toml`: `[functions.verification-webhook] verify_jwt = false`).

## Deployment (Vercel, fra1)

1. Vercel-Projekt mit Wurzel `apps/web` anlegen; `apps/web/vercel.json` setzt Next.js, Region `fra1`,
   `pnpm install --frozen-lockfile` und `pnpm build` (kopiert dabei die Marken-Symbole nach `public/brand`).
2. Umgebungsvariablen aus der Tabelle oben eintragen (`FERMATA_ENV=production`, `DIDIT_MODE=live`).
3. Migrationen und Functions: `supabase db push`, `supabase functions deploy account-export account-delete admin-invite verification-start verification-webhook`
   (Region der Aufrufe: die Web-App schickt `x-region: eu-central-1`).
4. In Didit den Webhook auf `<SUPABASE_URL>/functions/v1/verification-webhook` setzen, Rücksprung-Adresse
   ist `<FERMATA_APP_URL>/onboarding/ausweis/zurueck`, Aufbewahrung auf die kürzeste Stufe (1 Monat).
5. Ersten Admin anlegen (siehe „Lokal starten“, mit Studio statt curl) und TOTP einrichten.

## API-Vertrag (für Welle 2)

Alle Regeln liegen in der Datenbank. Die Web-App ruft nur auf. Fehler kommen als PostgREST-Fehler mit
`code` und einem maschinenlesbaren **`hint`** (Liste unten); die Texte dazu stehen in `apps/web/src/copy`.

### RPC für Mitglieder (Schema `api`, Rolle `authenticated`)

| Funktion | Parameter | Ergebnis / Regel |
|---|---|---|
| `my_overview()` | – | `{onboarding, first_name, membership, available_evenings, is_admin_user, sanctions_active}` |
| `my_onboarding()` | – | `{has_account, status, address_form, is_founding_member, next_step, complete, steps[{key,state}], consents_ok, facts_done, identity_done, verification{status,…,verified}, verification_attempts_left}`; Schritte `einwilligungen → angaben → identitaet → ausweis → fertig` |
| `onboarding_settings()` | – | `{collect_street, min_age, required_consents[], verification_alternative_enabled}` |
| `give_consent(p_kind, p_version)` | Art und **aktuelle** Fassung | neue Zeile in `app.consents`; doppelt ist harmlos; alte Fassung → `version_mismatch`; Art, die Phase 1 nicht anbietet (`art9_health`, Einstellung `account.consents_not_offered`) → `not_offered` (Härtung) |
| `revoke_consent(p_kind)` | Art | neue Zeile (Widerruf); löscht sofort, was nur mit der Einwilligung erlaubt ist (art9_profile → Identität, art9_religion/health → Angaben, push → Abos, gespraech → Transkripte, kontakttausch → noch nicht freigegebene Kontakt-Freigaben, Antwort dann mit `pending_shares_withdrawn`); `agb`/`datenschutz_kenntnis` → `delete_account` |
| `my_consents()` | – | je Art: `kind, required, granted, version, current_version, needs_renewal, at`; nur angebotene Arten (seit der Härtung **ohne `art9_health`**, außer jemand hätte sie noch erteilt – dann zum Widerrufen). Nach den neuen Fassungen `2026-10-03-m8-entwurf` steht bei erteilten Einwilligungen `needs_renewal: true` → erneut zustimmen lassen |
| `save_facts(p_first_name, p_last_name, p_birth_date, p_postal_code, p_city?, p_phone?, p_street?)` | Pflicht-Einwilligungen vorher | 18+ mit `app.now()` (Europe/Berlin), PLZ muss in `app.postal_codes` stehen, setzt `app.geo` (nur PLZ-Mittelpunkt) und `profile_core.birth_year`; Straße nur mit `account.collect_street`; nach bestandener Prüfung sind Name und Geburtsdatum fest |
| `postal_code_lookup(p_postal_code)` | – | `postal_code, place_name, state` |
| `save_identity(p_gender, p_seeking[], p_orientation?)` *(Kern)* | `art9_profile` | `frau`, `mann`, `nichtbinaer` |
| `save_religion(p_religion, p_importance, p_must_match)` *(Kern)* | `art9_religion` | `unwichtig`, `etwas`, `wichtig` |
| `my_facts()`, `my_identity()` *(Kern)* | – | eigene Angaben (Identität entschlüsselt) |
| `save_address_form(p_form)` | `sie` \| `du` | |
| `save_push_subscription(p_endpoint, p_p256dh, p_auth, p_platform?)` | `push` | für M5; gleiches Gerät, andere Person → altes Abo weg |
| `my_export()` | – | ganzer Datenexport (wie Edge Function `account-export`) |
| `my_admin_status()` | – | `{is_admin_user, aal, is_admin}` (auch mit aal1) |
| `legal_document(p_kind)`, `public_settings()` *(Kern, auch anon)* | – | Rechtstext (aktuelle Fassung), öffentliche Einstellungen. Seit der Härtung gibt es für `impressum`, `datenschutz`, `agb`, `widerruf`, `ki_hinweis` (Fassung `2026-10-03-entwurf`) und alle Einwilligungen einen Text aus `docs/recht`; `art9_health` liefert keinen gültigen Text mehr (`abgeloest`) |

### RPC für den Admin (nur mit aal2, sonst `admin_aal2_required`)

| Funktion | Parameter | Ergebnis |
|---|---|---|
| `admin_overview()` | – | Zahlen: Konten nach Stand, Einladungen offen/angenommen/abgelaufen, Prüfungen, noch zu löschende Didit-Sitzungen, offene Hinweise und Meldungen, Warteliste (falls verbunden) |
| `admin_accounts(p_search?, p_status?, p_limit=50, p_offset=0)` | Suche in E-Mail, Name, PLZ | Liste mit `next_step`, `verification_status`, Einladung |
| `admin_account(p_user)` | – | Konto, Fakten, Onboarding, Einwilligungs-Verlauf, Prüfungen, Einladungen, Mitgliedschaft, Hinweise – **ohne Art.-9-Angaben**; jedes Ansehen steht im Audit |
| `admin_invitations(p_limit=100)` | – | mit `state`: offen, angenommen, abgelaufen, ersetzt |
| `admin_verifications(p_status?, p_limit=100)` | – | nur die erlaubten Prüffelder |
| `admin_safety_flags(p_open_only=true, p_limit=100)` | – | nach Dringlichkeit |
| `admin_settings()` | – | alle `ops.app_settings` |
| `admin_update_setting(p_key, p_value jsonb)` | bestehender Schlüssel, gleicher JSON-Typ | Verlauf in `ops.app_settings_history` + Audit `setting.updated` |

### Interne Funktionen (nur `service_role`, über Edge Functions)

| Funktion | Zweck |
|---|---|
| `app.on_account_created(p_user, p_is_founding_member=false, p_waitlist_email_hash=null)` | legt `app.accounts`, `billing.memberships` (status `free`) und den Gratis-Abend (`evening_ledger` `free_grant` +1) an; idempotent. **Eine Stelle für alle Wege**, M6 darf sie mit gleicher Signatur ersetzen. |
| `ops.create_invited_account(p_email, p_user, p_invited_by, p_waitlist_id=null)` | Einladung festhalten, Warteliste dynamisch markieren (`invited_to_app_at`, `is_founding_member` übernehmen, nur wenn `public.waitlist` da ist), `on_account_created`, Audit |
| `ops.expire_invitations()` | stündlich (pg_cron): nie benutzte Konten aus abgelaufenen Einladungen löschen |
| `ops.verification_begin(p_user, p_provider)` | prüft Einwilligung `biometrie`, Formular, Versuche (`verification.max_attempts`) |
| `ops.verification_attach_session(p_verification, p_session_id)` | Didit-Sitzung zuordnen |
| `ops.verification_complete(p_session_id, p_status, p_first_name?, p_last_name?, p_birth_date?, p_document_number?)` | volljährig, Abgleich Name/Geburtsdatum, Sperrliste; speichert nur erlaubte Felder; Ausweis-Treffer → `blocked`, Konto `suspended`, vorläufige Sperre, Hinweis; Namens-Treffer → nur Hinweis |
| `app.verification_record_hashes(p_user, p_document_number, p_first_name, p_last_name, p_birth_date)` | **die eine Stelle** für Sperrlisten-Hashes (siehe Integration) |
| `ops.verification_session_deleted(p_session_id)`, `ops.verifications_pending_deletion(p_limit)` | Nachweis der Löschung bei Didit, Nachholen |
| `ops.account_deletion_prepare(p_user)`, `ops.account_deletion_done(p_user)` | Audit, Einladungen/Protokolle entfernen, Warteliste mitlöschen, Sicherheits-Hinweis bei laufender Prüfung; seit der Härtung auch: offene Abende absagen (Nachricht an Gegenüber und Lokal bleibt erhalten), Kündigung eines Stripe-Abos festhalten. Rückgabe `{email, first_name, address_form, evenings{cancelled, failed}, stripe{contract_action_id, subscription_id} \| null}`; Ergebnis der Stripe-Kündigung über `ops.account_deletion_stripe_result(action_id, ok, detail)` |
| `ops.auth_user_id_by_email(p_email)`, `billing.member_contact(p_user)` (Härtung) | E-Mail-Bezug aus `auth.users` für die Functions, die in der engen Rolle `fermata_edge` kein `auth`-Schema lesen |
| `app.export_account(p_user)` | Inhalt des Datenexports |
| `ops.is_admin_user(p_user)` | Admin-Prüfung für Edge Functions |

### Edge Functions

| Function | Aufruf | Antwort |
|---|---|---|
| `account-export` | `GET`/`POST`, `Authorization: Bearer <Token>` | JSON-Datei (`content-disposition: attachment; filename="fermata-datenexport-JJJJ-MM-TT.json"`); läuft als die Person (`asUser`) über `api.my_export()` |
| `account-delete` | `POST {"confirm": true}`, Bearer | `{deleted, mail_sent, evenings_cancelled, subscription_cancelled}` (Härtung); sagt offene Abende ab, beendet ein Stripe-Abo **sofort und ohne anteilige Erstattung** (`subscription_cancelled`: `true`, `false` = Stripe-Fehler, Benn wird informiert, `null` = kein Abo – vorher in der Oberfläche darauf hinweisen), löscht über die GoTrue-Admin-API, Bestätigungs-Mail `account.deleted` |
| `admin-invite` | `POST {"email", "waitlist_id"?}`, Bearer mit **aal2** | `{invited, user_id, invitation_id, expires_at, is_founding_member, waitlist_linked, mail_sent}`; legt die Person in Auth an (E-Mail bestätigt), Mail `account.invite` mit Link auf `/anmelden` |
| `verification-start` | `POST`, Bearer | `{url, verification_id, mode}` – Weiterleitung zu Didit bzw. zur Simulation |
| `verification-webhook` | `POST` von Didit, ohne JWT, `X-Signature` + `X-Timestamp` | `{ok, status, session_deleted}`; unbekannte Sitzung und nicht endgültige Stände werden quittiert |

Fehlercodes der Functions: `unauthorized` (401), `consent_missing`, `admin_aal2_required`, `no_account`,
`account_inactive` (403), `facts_missing`, `already_verified`, `verification_pending`, `already_member` (409),
`too_many_attempts` (429), `invalid_email`, `confirmation_required` (422), `provider_unavailable`,
`auth_unavailable` (502), `signature_missing|stale|mismatch` (401).

### `hint`-Werte der Datenbank

`no_account`, `account_closed`, `unknown_kind`, `no_document`, `version_mismatch`, `delete_account`,
`consent_missing`, `invalid_name`, `invalid_birth_date`, `too_young`, `invalid_postal_code`, `unknown_postal_code`,
`invalid_city`, `invalid_phone`, `street_not_collected`, `invalid_street`, `facts_locked`, `invalid_address_form`,
`invalid_subscription`, `invalid_platform`, `invalid_email`, `already_member`, `waitlist_missing`,
`facts_missing`, `already_verified`, `verification_pending`, `too_many_attempts`, `account_inactive`,
`admin_aal2_required`, `unknown_setting`, `type_mismatch`, `invalid_value`, `admin_account`, `not_offered` (Härtung).

### Neue Einstellungen (`ops.app_settings`)

| Schlüssel | Start | Bedeutung |
|---|---|---|
| `account.collect_street` | `false` | Frage B1: Straße abfragen |
| `account.min_age` | `18` | Mindestalter |
| `account.invitation_valid_days` | `7` | Gültigkeit einer Einladung |
| `account.required_consents` | `["agb","datenschutz_kenntnis","art9_profile"]` | Einwilligungen vor dem Formular, in dieser Reihenfolge |
| `verification.max_attempts` | `3` | Versuche der Ausweisprüfung |
| `verification.alternative_enabled` | `false` (öffentlich) | Frage B2 |

Rechtstexte (Fassung `2026-10-03-entwurf`, Status `entwurf`): `agb`, `datenschutz_kenntnis`, `art9_profile`,
`art9_religion`, `art9_health`, `biometrie`, `gespraech`, `push`, `kontakttausch`, `ki_hinweis`.

**Härtung (`20261003000900_legal_documents.sql`, `…000906`):** Die Texte kommen jetzt aus `docs/recht/*.md`
(Abschnitte zwischen `<!-- db kind="…" version="…" -->` und `<!-- /db -->`, umgewandelt in das Markdown, das die App
darstellt: Überschriften, Absätze, Listen, fett, kursiv – keine Links und Tabellen). Neue Arten `impressum`,
`datenschutz`, `widerruf` (Fassung `2026-10-03-entwurf`); `agb` und `ki_hinweis` neu aus den Dokumenten. Die
Einwilligungen `art9_profile`, `art9_religion`, `biometrie`, `gespraech`, `push`, `kontakttausch`,
`datenschutz_kenntnis` haben die neue Fassung `2026-10-03-m8-entwurf` (wahrheitsgemäß: ungefragt Erzähltes geht live
an Spracherkennung und Sprachmodell); die alten Fassungen bleiben als Nachweis (`abgeloest`). `art9_health` wird nicht
angeboten (PLATZHALTER C10). Ein Test (`supabase/functions/_shared/legal/legal_docs.test.ts`) schlägt fehl, wenn
Datenbank und `docs/recht` auseinanderlaufen – Fassungen nie ändern, immer neue anlegen.

## Aufbau der App und Bausteine

```
apps/web/src
├── proxy.ts               Nonce + CSP, Sitzung auffrischen, Wege schützen (Next 16: früher middleware)
├── app/                   Seiten (Gruppen: (public), (info), (member), onboarding, admin)
│   └── actions/           Server Actions (rufen RPC bzw. Edge Functions)
├── components/ui/         Bausteine: Button/ButtonLink, Field/TextArea, Checkbox, RadioGroup, Select, Card/CardLink,
│                          Notice, Stepper, Dialog, PageHeader, EmptyState, Skeleton, Badge, TableWrap, SubmitButton, Icon/Fermate
├── components/shell/      AppShell, PublicShell, FocusShell, AdminShell, Hilfe-Knopf, Navigation
├── components/pwa/        ThemeScript (Nonce), ThemeSwitcher, Service-Worker-Anmeldung
├── copy/                  ALLE sichtbaren Texte (Tonalitätsprüfung); Sie/Du über af(form, sie, du)
├── lib/                   supabase (server/browser), data (RPC), functions (Edge Functions), csp, routes, validation, markdown, format
└── styles/                base, components, shell (nur Tokens aus packages/tokens)
```

Regeln für Welle 2:

- Neue Seiten in die passende Gruppe legen; `requireMember()` liefert Überblick und Anrede.
- Texte nur in `src/copy`, mit Anrede-Variante, wo die Person angesprochen wird.
- Keine Inline-Styles (ESLint-Regel), keine fremden Skripte; die CSP erlaubt nur Nonce-Skripte.
- Erledigt in Welle 2: `/gespraech` (M3), `/abende` (M5), `/mitgliedschaft` (M6), Melden und „Abend teilen“ (M7),
  Admin-Bereiche ([ui-admin.md](ui-admin.md)).

## Datenschutz und Sicherheit

- **Cookies:** nur das Auth-Cookie von Supabase (`sb-…-auth-token`). Die Hilfs-Cookies des PKCE-Ablaufs
  (`…-code-verifier`) entfernt die App direkt nach der Anmeldung. Darstellung (hell/dunkel) liegt nur im
  `localStorage` des Geräts, wenn die Person sie wählt.
- **Keine Anfragen an Dritte aus dem Browser** außer Supabase (CSP `connect-src`). Schriften und Symbole sind
  selbst gehostet. Keine Analyse.
- **CSP:** `script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src 'self' 'nonce-…'`, `frame-ancestors 'none'`,
  `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`; dazu `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy` (Mikrofon nur für die eigene Seite, für M3).
- **Anmeldung im Browser:** Code und Link laufen direkt gegen Supabase Auth (nicht über den Server), damit die
  IP-Drosseln von Supabase je Person greifen. Unbekannte Adressen bekommen dieselbe Antwort wie eingeladene.
- **Link aus der Mail** löst die Anmeldung erst mit einem Klick aus (Vorschau-Programme verbrauchen ihn nicht).
- **Admin:** aal2 im Proxy, im Layout und in jeder Admin-Funktion (`app.is_admin()`). Nicht-Admins sehen 404.
- **Service Worker** speichert keine persönlichen Seiten, nur die Offline-Seite und statische Dateien.

## Entscheidungen

| Thema | Entscheidung | Grund |
|---|---|---|
| PLZ-Mittelpunkte | **GeoNames**-Postleitzahlen (Lizenz **CC BY 4.0**), aufbereitet von [zauberware/postal-codes-json-xml-csv](https://github.com/zauberware/postal-codes-json-xml-csv) (`data/DE.zip`, Stand 31.07.2026, Commit `b4be5a6`). Nur Zustell-PLZ (8 309), Großkunden-PLZ entfallen; Mittelpunkt = Mittelwert der Ortskoordinaten, 4 Nachkommastellen. Erzeugt mit `apps/web/scripts/postal-codes/build-migration.mjs` → Migration `20261003000220`. | Ganz Deutschland, klare Lizenz ohne Share-Alike (ODbL wäre auch möglich gewesen). **Pflicht: Quellenangabe** „Postleitzahlen: GeoNames (geonames.org), CC BY 4.0“ in Datenschutzerklärung/Impressum (M8). Die Mittelpunkte sind eine Näherung, für „möglichst in der Mitte“ reicht das. |
| Straße (B1) | nicht abgefragt (`account.collect_street=false`), technisch vorbereitet | Empfehlung aus PLAN; Rechnungsanschrift hat Stripe |
| Orientierung | freiwillig, mit Hinweis „für die Auswahl nicht nötig“ | Datensparsamkeit, Auswahl braucht nur Geschlecht und Suche |
| Religion | im Schritt „Über Sie“ aufklappbar, mit eigener Einwilligung im selben Formular | freiwillig und nur mit Art.-9-Einwilligung |
| Gesundheit | Einwilligungstext angelegt, aber keine Abfrage in M2 | wird erst gefragt, wenn sie gebraucht wird (Viola, M3) |
| Name-Abgleich | Nachname gleich, Vorname gleich oder einer der Vornamen; ohne Groß/klein, Umlaute → Grundbuchstaben (ä→a, ß→ss); „oe“ ≠ „ö“ | lieber eine Ablehnung zu viel; nach Ablehnung kann die Person ihre Angaben prüfen (höchstens 3 Versuche) |
| Nach bestandener Prüfung | Name und Geburtsdatum lassen sich nicht mehr ändern | sonst wäre der Abgleich wertlos |
| Einladung | Konto wird bei der Einladung angelegt (E-Mail bestätigt), die Mail enthält **keinen** Code, nur den Link zur Anmeldung | Codes von Supabase gelten 15 Minuten; Einladungen 7 Tage. Nie benutzte Konten löscht `ops.expire_invitations()` |
| Anmelde-Link | `{{ .SiteURL }}/anmelden/bestaetigen?token_hash=…&type=email` statt `ConfirmationURL` | funktioniert in jedem Browser (auch Safari ↔ installierte App), kein PKCE-Code nötig |
| Sperrlisten-Hashes | `safety.verification_hashes` (je Person, Form wie M7) mit `safety.blocklist_doc_hash/-name_hash` (wortgleich mit M7) | PLAN 2.2 erlaubt „Sperrlisten-Hash“; nötig, damit Benn später ausschließen kann |
| Löschung während laufender Prüfung | Sperrlisten-Hashes bleiben als Hinweis für Benn (ohne Namen) | sonst könnte sich jemand durch Löschen einer Sperre entziehen |
| Funktionsrechte | Event-Trigger `fermata_revoke_public_execute` + `revoke … from public` | PostgreSQL gibt neue Funktionen PUBLIC frei; damit war z. B. `app.evening_transition(…, p_actor)` für jede angemeldete Person per PostgREST aufrufbar |
| Löschung | über die GoTrue-Admin-API, gesetzliche Reste ohne Personenbezug (`contract_actions.user_id = null`, Meldungen ohne Melder) | Einwilligungen werden mitgelöscht (kein gesetzlicher Grund, sie aufzubewahren); Wartelisten-Eintrag wird mitgelöscht |

## Für Benn: offene Punkte und Platzhalter

| # | Punkt | Stand |
|---|---|---|
| B1 | Straße im Formular | weggelassen (Empfehlung). Einschalten: `account.collect_street = true` im Admin. |
| B2 | Alternative ohne Biometrie | Hinweis auf der Ausweis-Seite („in Vorbereitung, schreiben Sie uns“); Schalter `verification.alternative_enabled` vorhanden. |
| Didit | **Webhook-Format vor dem Start mit der Didit-Sandbox prüfen.** Umgesetzt: `X-Signature` = HMAC-SHA256 (hex) über den rohen Body, `X-Timestamp` ±5 Minuten; API v2 `POST /v2/session/`, `GET /v2/session/{id}/decision/`, `DELETE /v2/session/{id}/delete/`, Header `x-api-key`. Signaturprüfung steckt in **einer** Datei (`_shared/didit/signature.ts`), das Lesen der Entscheidung in `_shared/didit/decision.ts` (liest `id_verification`, `id_verifications[]` und `kyc`). | Platzhalter |
| Didit | Aufbewahrung im Didit-Konto auf 1 Monat, Training aus, AV-Vertrag | Aufgabe für dich |
| iOS | Anmeldung in der installierten Web-App auf einem **echten iPhone** testen (eigener Speicher, Code statt Link) | offen (PLAN 5.2) |
| Texte | Alle Einwilligungstexte sind **Entwürfe** (Status `entwurf`) und brauchen die Prüfung durch den Anwalt (M8). | Platzhalter |
| PLZ | Quellenangabe GeoNames (CC BY 4.0) in die Datenschutzerklärung | M8 |
| Supabase | Site URL = App-Adresse, Mail-Vorlage, Rate-Limits (siehe oben) | beim Einrichten |
| Admin | Erster Admin wird per SQL eingetragen (`app.admin_users`) | Runbook |

Bekannt offen (nicht M2):

- `billing.available_evenings(uuid)` ist (aus der Kern-Migration 0600) für jede angemeldete Person mit fremder ID
  aufrufbar und verrät so die Zahl verfügbarer Abende einer anderen Person. Vorschlag für M6: `grant` an
  `authenticated` entfernen; die eigene Zahl liefert `api.my_overview()`.
- ~~Bei Löschung eines Kontos mit bestätigtem Abend verschwindet der Abend auch für das Gegenüber~~ – erledigt in der
  Härtung: offene Abende werden vorher abgesagt, das Gegenüber und das Lokal erhalten die neutrale M5-Nachricht
  (`abende.md` Abschnitt 6).
- Datumsfeld: Das Format folgt der Sprache des Browsers (in den Bildschirmfotos aus dem Testbrowser „mm/dd/yyyy“).

## Abweichungen von PLAN.md

- Einladungs-Mail mit Link statt Code (Code würde nach 15 Minuten ablaufen), Anmeldung danach wie immer mit Code.
- Sperrlisten-Hashes werden je Person gespeichert (PLAN 2.2 nennt „Sperrlisten-Hash“ als erlaubt; 3.2 Nr. 7 sagt
  nicht, wo) – nötig für einen späteren Ausschluss.
- Quelle und Lizenz der PLZ stehen hier statt in `docs/DECISIONS.md` (Datei liegt nicht in diesem Arbeitsbereich).
- Lokal läuft statt der Supabase-CLI ein kleiner Stapel (GoTrue, PostgREST, Mailpit, Gateway), weil die CLI ihre
  Abbilder teils aus AWS ECR lädt.

## Hinweise für die Integration

- **Migrationen 0210–0270 laufen vor 0300–0700.** Funktionen, die spätere Tabellen nutzen, sind plpgsql.
- **`safety.verification_hashes`:** In `20261003000240_web_verification.sql` wird die Tabelle in **gleicher Form**
  wie in M7 (`20261003000710_safety_core.sql`) mit `create table if not exists` angelegt, die Funktionen
  `safety.blocklist_doc_hash/-name_hash` wortgleich mit `create or replace`. Beim Zusammenführen den
  `create table`-Block in 0240 entfernen (0710 legt die Tabelle ohne `if not exists` an). Alles andere greift nur über
  `app.verification_record_hashes()` darauf zu.
- **Funktionsrechte:** 0270 legt den Event-Trigger `fermata_revoke_public_execute` an (entzieht PUBLIC das
  Ausführungsrecht an jeder neuen Funktion in den Fermata-Schemas) und endet mit
  `revoke execute on all functions in schema app, api, ops, private, sensitive, safety, billing from public;`.
  Jede aufrufbare Funktion hat ein ausdrückliches `grant`.
- **`app.on_account_created`** ist der vereinbarte Haken für Kontoanlage (Mitgliedschaft `free` + `free_grant` +1).
- Geänderte gemeinsame Dateien: `supabase/templates/anmeldung.html` (Link mit `token_hash`), `supabase/config.toml`
  (Redirect `localhost:3041`, `verify_jwt = false` für `verification-webhook`); neue Dateien in
  `supabase/functions/_shared/`: `auth.ts`, `gotrue.ts`, `dberror.ts`, `web_test_utils.ts`, `didit/*`,
  `mail/templates/account.ts`.
