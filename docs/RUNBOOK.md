# Betriebshandbuch (RUNBOOK)

Stand: 03.10.2026 · Meilenstein M9 (Entwurf) · für Benn.
Grundlage: Code in `build/docs` (M0, M1, M4–M7), Viola im Hauptzweig (M3, Commit `e84647b`), Web-App im Branch
`build/web` (M2, **im Bau** – Abschnitte mit „M2“ nach der Zusammenführung prüfen). Alle Datenwege:
[`docs/DATA.md`](DATA.md). Rechtliches: [`docs/recht/`](recht/).

> **Kurz für dich:** Fermata besteht aus einer Datenbank in Frankfurt (Supabase), zwei Websites (Vercel), zwei
> Diensten in AWS Frankfurt (Viola und Auswahl-Job) und sieben weiteren Anbietern. Dieses Handbuch sagt, welche
> Konten du anlegst, welche Schlüssel wohin gehören, in welcher Reihenfolge deployt wird und was du täglich, je Lauf
> und im Notfall tust. **Wichtigste Regel:** Wenn du nicht prüfen kannst, wird nichts ungeprüft freigegeben – Läufe
> bleiben dann einfach liegen (Abschnitt 9).

---

## 1. Umgebungen

| Umgebung | Wo | Datenbank `ops.deployment` | Mails | Zweck |
|---|---|---|---|---|
| `local` / `test` / `ci` | Docker (`scripts/db.sh`), GitHub Actions | `test`/`local`/`ci` (Testuhr erlaubt) | `ops.mail_outbox` (keine echten Mails) | Entwicklung, automatische Tests |
| `staging` | eigenes Supabase-Projekt + Vercel-Vorschau + AWS-Dienste mit `staging` | bleibt `production` (Umschalten nur als Superuser möglich – bei Supabase nicht; Wirkung: Testuhr und Mail-Ersatz gesperrt wie in Produktion) | Brevo (mit Testadressen) | Probelauf, Abnahme |
| `production` | Supabase Frankfurt, Vercel `fra1`, AWS `eu-central-1` | `production` | Brevo | echter Betrieb |

`FERMATA_ENV` (Edge Functions), `VIOLA_ENV` (Viola) und die Vercel-Variablen stellen die Umgebung für die Dienste
ein; in `production` verweigern Edge Functions den Mail-Ersatz und Viola Attrappen. **Der Auswahl-Job hat keine
solche Sperre** – dort die Variablen aus Abschnitt 3.6 unbedingt setzen.

---

## 2. Konten, die du anlegst

Für **jedes** Konto: Zwei-Faktor einschalten, Zugang im Passwort-Manager, Rechnungsadresse, AV-Vertrag
([av-liste.md](recht/av-liste.md)).

| # | Anbieter | Was anlegen | Einstellungen, die zählen |
|---|---|---|---|
| 1 | **Supabase** | Organisation, Projekt **Region Frankfurt (eu-central-1)**, Tarif mit täglichen Backups (Pro oder höher); zweites Projekt für Staging | Erweiterungen **pg_cron** und **pg_net** einschalten; Auth-Einstellungen (Abschnitt 3.2); AV-Vertrag (DPA) im Dashboard; ggf. eigene Domain für Functions (Abschnitt 4, Schritt 9) |
| 2 | **Vercel** | Team, zwei Projekte aus dem GitHub-Repo: `landing` (Root `apps/landing`) und `web` (Root `apps/web`) | Region **fra1** für Funktionen (Landingpage: `apps/landing/vercel.json`; Web-App: in den Projekteinstellungen oder einer `vercel.json` – fehlt noch im Branch `build/web`); Vercel Analytics und Speed Insights **aus** |
| 3 | **Brevo** | Konto, Absender-Domain | Domain mit **SPF, DKIM, DMARC** verifizieren; **Öffnungs- und Klickverfolgung aus**; API-Schlüssel (Functions) und **SMTP-Schlüssel** (Supabase Auth) anlegen; Transaktions-Protokolle: kürzeste Aufbewahrung wählen [[prüfen]] |
| 4 | **Stripe** | Konto, zuerst **Testmodus** | Webhook (Abschnitt 4, Schritt 11); API-Version ab `2025-03-31` oder `STRIPE_API_VERSION` setzen; Kundenportal nicht nötig; Live-Modus erst nach Freigabe (Startcheckliste) |
| 5 | **Didit** | Konto, Workflow für Ausweis + Gesichtsabgleich, zuerst Sandbox | **Datenaufbewahrung: 1 Monat** (kürzeste); **Training mit Kundendaten aus**; Webhook auf `verification-webhook` mit Geheimnis |
| 6 | **AWS** | Konto mit MFA am Root-Konto, IAM-Benutzer bzw. Identity Center für den Alltag; Region **eu-central-1** | **Bedrock:** Modellzugang für Claude Sonnet 5.5 über **AWS-Marketplace-Abo** (einmalig, sonst Zugriffsfehler) und für Titan Text Embeddings V2; **Bedrock Invocation Logging aus** (oder nur Metadaten, ohne Inhalte); **AI-Services-Opt-out-Richtlinie** in AWS Organizations (betrifft u. a. Polly) [[prüfen]]; **Polly** (Stimme „Vicki“, Platzhalter B4); **ECR** (zwei Image-Repositories), **ECS/Fargate** (Cluster, Dienste, Tasks), **ALB** mit TLS-Zertifikat für den Textdienst, **EventBridge Scheduler**, **Secrets Manager**, **CloudWatch** (Aufbewahrung der Log-Gruppen **30 Tage**); bei LiveKit Weg C zusätzlich **EC2** |
| 7 | **Deepgram** | Projekt, API-Schlüssel | EU-Endpunkt `https://api.eu.deepgram.com/v1/listen` (im Code Standard); Modellverbesserung: Code sendet `mip_opt_out=true`; Datenaufbewahrung im Konto prüfen |
| 8 | **LiveKit** (Frage B3) | Weg A/B: LiveKit-Cloud-Projekt mit Region EU (Agent `eu-central`; B mit Regionsbindung). Weg C: kein Konto, eigener Server | A/B: Aufnahmen, Egress und Agent-Observability **aus** |
| 9 | **TTS** (Frage B4) | nur Polly (AWS) im Standard; Google Cloud nur nach Blindtest | Cartesia/ElevenLabs nur mit Enterprise-Vertrag samt EU-Datenhaltung |
| 10 | **Domain** (Frage A3) | Registrar, DNS | Einträge für Vercel, Brevo (SPF/DKIM/DMARC), ggf. Supabase Custom Domain, LiveKit (Weg C) |
| 11 | **GitHub** | besteht (`bennneujahr/fermata`) | Branch-Schutz für `main`, keine Geheimnisse im Repo (`.gitignore` schließt `.env*` aus) |

---

## 3. Umgebungsvariablen und Geheimnisse (vollständig aus dem Code gesammelt)

Geheimnisse erzeugen mit z. B. `openssl rand -hex 32` (mindestens 32 Zeichen). **Gleiche Werte** an zwei Stellen sind
in der Spalte „Gegenstück“ markiert.

### 3.1 Supabase Edge Functions (`supabase secrets set NAME=…`)

| Variable | Pflicht | Wer liest | Wert / Gegenstück |
|---|---|---|---|
| `FERMATA_ENV` | ja | alle (`_shared/env.ts`) | `production` bzw. `staging` |
| `FERMATA_SITE_URL` | ja | Links in Mails (Landingpage) | `https://<domain>` |
| `FERMATA_APP_URL` | ja | Links in Mails (Web-App) | `https://app.<domain>` |
| `FERMATA_ALLOWED_ORIGINS` | ja | CORS (`_shared/http.ts`) | Landingpage und Web-App, kommagetrennt |
| `FERMATA_FUNCTIONS_URL` | nein | Links auf Functions in Mails | Standard `SUPABASE_URL/functions/v1`; bei eigener Domain diese |
| `FERMATA_FUNCTIONS_REGION` | nein | `waitlist-signup` (Bestätigungslink mit fester Region) | Standard `eu-central-1` |
| `FERMATA_INTERNAL_SECRET` | ja | `billing-extend`, `safety-dispatch` | Gegenstück: Vault `fermata_internal_secret` |
| `FERMATA_CONTACT_EMAIL` | ja (M2) | `account-delete`, `admin-invite` | Kontaktadresse in Mails |
| `BREVO_API_KEY` | ja | `_shared/mail` | Brevo-API-Schlüssel (ohne ihn verweigert Produktion jeden Versand) |
| `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | ja | `_shared/mail` | Absender auf der verifizierten Domain; Name „Fermata“ |
| `LINK_HIT_SECRET` | nein | `link-hit` | Gegenstück: Vercel-Variable der Landingpage |
| `NOTIFY_DISPATCH_SECRET` | ja | `notify-dispatch` | Gegenstück: Vault `fermata_notify_dispatch_secret` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | ja | `push-key`, `_shared/push` | erzeugen mit `deno run supabase/functions/_shared/push/generate-vapid-keys.ts`; Subject `mailto:…`; öffentlicher Schlüssel auch als `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Web-App) |
| `VENUE_LINK_SECRET` | ja | `notify-dispatch`, `venue-confirm` | Signatur der Bestätigungslinks für Lokale |
| `STRIPE_SECRET_KEY` | ja | `_shared/stripe/client.ts` | `sk_test_…` bzw. `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | ja | `stripe-webhook` | `whsec_…` aus dem Webhook-Endpunkt |
| `STRIPE_PUBLISHABLE_KEY` | ja | `billing-checkout` (an die Web-App durchgereicht) | `pk_test_…` bzw. `pk_live_…` |
| `STRIPE_API_VERSION` | nein | Stripe-Client | feste API-Version |
| `STRIPE_PRICE_AUFTAKT`, `STRIPE_PRICE_ANDANTE`, `STRIPE_PRICE_LOGE` | nein | `_shared/stripe/prices.ts` | feste Preis-IDs; sonst legt der Code Preise mit `lookup_key` an |
| `SUPABASE_JWT_SECRET` | nein | Prüfung der Mitglieder-Tokens (Billing, Viola) | nur bei alten HS256-Schlüsseln; sonst JWKS über `SUPABASE_URL` |
| `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID` | ja (M2) | `_shared/didit` | aus der Didit-Konsole |
| `DIDIT_API_BASE` | nein (M2) | dto. | Standard `https://verification.didit.me` |
| `DIDIT_MODE` | nein (M2) | dto. | **nie `fake` in Produktion** |
| `INTERVIEW_AGENT_SECRET` | ja (M3) | `interview-agent` | Gegenstück: Viola (Secrets Manager) |
| `VIOLA_TEXT_TOKEN_SECRET` | ja (M3) | `interview-token` | Gegenstück: Viola |
| `VIOLA_TEXT_URL` | ja (M3) | `interview-token` | öffentliche Adresse des Textdienstes (ALB), z. B. `https://viola.<domain>` |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_NAME` | ja (M3) | `interview-token` | Gegenstück: Viola; Agent-Name Standard `viola` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` | – | alle | **setzt Supabase selbst** |
| `DATABASE_URL`, `DB_PORT`, `DB_PASSWORD`, `FUNCTIONS_PORT`, `FERMATA_TEST_DB_URL`, `TEST_DB_URL`, `STRIPE_API_BASE`, `STRIPE_MOCK_URL` | – | nur lokal/Tests | in Produktion **nicht** setzen |

### 3.2 Supabase Auth (Dashboard → Authentication)

- **SMTP:** Host `smtp-relay.brevo.com`, Benutzer und Passwort = Brevo-SMTP-Zugang (`BREVO_SMTP_USER`,
  `BREVO_SMTP_KEY` in `supabase/config.toml` als Kommentar), Absender wie `MAIL_FROM_ADDRESS`.
- **Vorlagen:** „Magic Link“ = `supabase/templates/anmeldung.html` (Betreff „Ihr Anmeldecode für Fermata“), „Invite“
  = `supabase/templates/einladung.html` (Betreff „Ihre Einladung zu Fermata“).
- **Einstellungen wie in `supabase/config.toml`:** Registrierung aus (`enable_signup = false`), anonyme Anmeldung aus,
  Code 6-stellig, gültig 15 Minuten, Refresh-Token-Rotation an, **MFA TOTP an** (Admin).
- **Site URL** = Web-App; **Redirect URLs** = `https://app.<domain>/anmelden/bestaetigen`.

### 3.3 Supabase Vault (SQL-Editor als `postgres`)

| Name | Anlegen | Achtung |
|---|---|---|
| `fermata_sensitive_key` | **legt die Migration selbst an** (`20261003000200_accounts.sql`) | Schlüssel für alle Art.-9-Spalten. **Geht er verloren, sind die Angaben unlesbar.** Nicht ändern (es gibt noch keine Funktion zum Umschlüsseln). Sicherung: Abschnitt 10 |
| `fermata_blocklist_key` | legt die Migration selbst an | Schlüssel der Sperrliste. **Nie ändern** – sonst passen die Hashes nicht mehr |
| `fermata_internal_secret` | `select vault.create_secret('<FERMATA_INTERNAL_SECRET>', 'fermata_internal_secret');` | gleich wie die Function-Variable |
| `fermata_notify_dispatch_secret` | `select vault.create_secret('<NOTIFY_DISPATCH_SECRET>', 'fermata_notify_dispatch_secret');` | gleich wie die Function-Variable |

### 3.4 Einstellungen in der Datenbank nach dem Deploy (`ops.app_settings`, Admin → Einstellungen oder SQL)

| Schlüssel | Setzen auf | Warum |
|---|---|---|
| `internal.functions_base_url` | `"https://<ref>.supabase.co/functions/v1"` (bzw. eigene Domain) | Datenbank ruft `billing-extend` und `safety-dispatch` sofort über pg_net auf |
| `notify.dispatch_url` | `"https://<ref>.supabase.co/functions/v1/notify-dispatch"` | Versand-Anstoß jede Minute |
| `site.domain`, `site.app_url`, `site.contact_email`, `notify.mail_from_address` | echte Werte (A3, A7) | Links, Impressum, Absender |
| `safety.admin_alert_email` | überwachte Adresse (mit Vertretung, Abschnitt 9) | Sofort-Hinweise (Hilfe beim Check-in, akute Meldungen) |
| `safety.trust_view_base_url` | `"https://<ref>.supabase.co/functions/v1/trust-view"` oder eigene Domain | Standardwert `https://app.fermata.example/functions/v1/trust-view` funktioniert nur mit einer Weiterleitung auf der App-Domain |
| `safety.heimwegtelefon_*`, `safety.telefonseelsorge_*`, `safety.hilfetelefon_gewalt_*`, `safety.crisis_lines` | vor dem Start erneut prüfen | Hilfe-Knopf und Viola (zwei Einstellungen mit denselben Nummern: `safety.telefonseelsorge_numbers` und `safety.crisis_lines` – beide pflegen) |
| Platzhalter (A5, B6–B13, C1–C9) | nach Entscheidung | [PLATZHALTER.md](PLATZHALTER.md) |

### 3.5 Vercel

**Landingpage (`apps/landing`)** – Build: `PUBLIC_FUNCTIONS_URL` (`https://<ref>.supabase.co/functions/v1`),
`PUBLIC_SITE_URL`, optional `PUBLIC_FUNCTIONS_REGION`, `SUPABASE_URL` + `SUPABASE_ANON_KEY` (lädt öffentliche
Einstellungen), `LANDING_HOERPROBE_ENABLED`, `LANDING_HOERPROBE_SRC`, `LANDING_PRICES_MODE`, `LANDING_VAT_MODE`,
`LANDING_START_MONTH`, `LANDING_CONTACT_EMAIL`. Laufzeit (`/s/…`): `FUNCTIONS_URL`, `LINK_HIT_SECRET`.
In `apps/landing/vercel.json` die CSP `connect-src` von `https://*.supabase.co` auf die genaue Projektadresse
einschränken. Nach Änderungen an Einstellungen **neu bauen** (die Seite ist statisch).

**Web-App (`apps/web`, M2)** – `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, optional
`SUPABASE_FUNCTIONS_URL`, `FERMATA_ENV`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `FERMATA_CSP_EXTRA_CONNECT` und
`FERMATA_CSP_EXTRA_FRAME` (für Stripe, LiveKit und den Viola-Textdienst, sobald die Oberflächen dafür gebaut sind),
`DIDIT_MODE` (in Produktion **nicht** `fake`), `DIDIT_WEBHOOK_SECRET` (nur für die Simulationsseite außerhalb der
Produktion). `NEXT_PUBLIC_SW_DEV` nur in der Entwicklung.

### 3.6 AWS: Auswahl-Job (`services/matcher`, Secrets Manager + Task-Definition)

| Variable | Wert |
|---|---|
| `FERMATA_MATCHER_DB_URL` | Verbindung der Login-Rolle (Abschnitt 5) über den Supabase-Pooler im **Session-Modus** (Port 5432), Benutzer `fermata_matcher_job.<projekt-ref>` – aus Secrets Manager |
| `FERMATA_MATCHER_DB_ROLE` | `fermata_matcher` (Standard) |
| `FERMATA_LLM_BACKEND` | **`bedrock`** (oder `bedrock-mantle`) – **Standard ist `fake`!** Ohne diese Variable rechnet der Job mit erfundenen Bewertungen |
| `FERMATA_EMBEDDING_BACKEND` | **`titan`** (oder `none`) – Standard ist `fake` |
| `FERMATA_AWS_REGION` | `eu-central-1` |
| `FERMATA_LLM_MODEL_ID` | leer (dann `analysis.llm_model_id`) |
| `FERMATA_FAKE_ART9_RATE` | nicht setzen (nur Simulation) |

IAM-Rolle des Tasks: `bedrock:InvokeModel` nur für das EU-Inference-Profil von Sonnet 5.5 und für Titan V2 (bzw. die
Rechte des Mantle-Endpunkts). Image: `services/matcher/Dockerfile`, Standardbefehl `run --next`.

### 3.7 AWS: Viola (`services/viola`, zwei ECS-Dienste aus einem Image)

Vollständige Liste mit Erklärungen: `services/viola/.env.example` (Hauptzweig). In Produktion:

| Variable | Wert |
|---|---|
| `VIOLA_ENV` | `production` (im Image voreingestellt; verbietet Attrappen, verlangt EU-Wege) |
| `VIOLA_BACKEND` | `http` |
| `INTERVIEW_AGENT_URL` | `https://<ref>.supabase.co/functions/v1/interview-agent` |
| `INTERVIEW_AGENT_SECRET` | Gegenstück zur Function-Variable |
| `VIOLA_LLM_PROVIDER` | `bedrock` (`anthropic` nur Entwicklung, **nie** mit echten Daten) |
| `VIOLA_AWS_REGION` | `eu-central-1` |
| `VIOLA_LLM_MODEL_ID`, `VIOLA_ANALYSIS_MODEL_ID` | leer (aus den Einstellungen); Schalter, falls der Mantle-Endpunkt eine andere Modell-ID verlangt |
| `VIOLA_LLM_MAX_TOKENS`, `VIOLA_ANALYSIS_MAX_TOKENS`, `VIOLA_SYSTEM_NOTICES`, `VIOLA_EAGER_TOOL_STREAMING` | Standardwerte lassen |
| `DEEPGRAM_API_KEY`, `DEEPGRAM_URL` | Schlüssel; EU-Endpunkt (Standard) |
| `VIOLA_STT_GATE` | `true` |
| `VIOLA_TTS_PROVIDER`, `VIOLA_TTS_VOICE` | leer (aus den Einstellungen, B4) |
| `VIOLA_TTS_ENTERPRISE_EU` | `false` (nur mit Enterprise-Vertrag `true`) |
| `GOOGLE_TTS_ENDPOINT`, `GOOGLE_APPLICATION_CREDENTIALS`, `CARTESIA_*`, `ELEVENLABS_*` | nur bei entsprechender Wahl (B4) |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_NAME` | Gegenstück zu den Function-Variablen |
| `VIOLA_LIVEKIT_PATH` | leer (aus `voice.livekit_path`) |
| `VIOLA_TEXT_TOKEN_SECRET` | Gegenstück zur Function-Variable |
| `VIOLA_TEXT_ALLOWED_ORIGINS` | `https://app.<domain>` |
| `VIOLA_TEXT_HOST`, `VIOLA_TEXT_PORT` | `0.0.0.0`, `8352` |
| `VIOLA_HEALTH_PORT`, `VIOLA_HEALTH_PATH` | Sprach-Worker: `8081`, `/` (Textdienst: Standard `8352`, `/healthz`) |
| `VIOLA_LOG_LEVEL` | `INFO` |

Task-Rolle: `bedrock:InvokeModel*` nur für Sonnet 5.5 im EU-Profil, `polly:SynthesizeSpeech`. Zwei Dienste:
`viola text-server` (hinter dem ALB mit HTTPS, Port 8352, Health `/healthz`) und `viola voice-worker start` (keine
eingehenden Verbindungen, Health 8081). Der Textdienst hält Gespräche im Speicher: eine Instanz oder Sitzungsbindung
am ALB.

---

## 4. Erstes Deployment – Reihenfolge

1. **Konten** aus Abschnitt 2 anlegen (mindestens Supabase, Vercel, Brevo, Domain für die Landingpage; Stripe, Didit,
   AWS, Deepgram vor M9).
2. **Supabase verbinden:** `supabase login`, `supabase link --project-ref <ref>`. Erweiterungen **pg_cron** und
   **pg_net** im Dashboard einschalten (pgcrypto, citext, vector und Vault legen die Migrationen bzw. Supabase an).
3. **Migrationen:** `supabase db push`. Sie laufen in Dateireihenfolge bis `20261003099000_function_privileges.sql`.
   Vorher beachten (Stand 03.10.2026):
   - Nach der Zusammenführung von M2 und M4: **`app.require_admin()` gibt es in zwei Fassungen** (M2
     `20261003000250_web_admin.sql`: `returns uuid`; M4 `20261003000410_matcher.sql`: `returns void`). PostgreSQL
     lehnt das Ändern des Rückgabetyps mit `create or replace` ab – die Migration 0410 bricht dann ab. Muss bei der
     Integration bereinigt werden.
   - M2 legt `safety.verification_hashes` mit `if not exists` an, M7 (`…000710`) ohne – laut Kommentar in
     `20261003000240_web_verification.sql` bei der Zusammenführung den Block in M2 entfernen.
   - M2 nutzt einen **Event-Trigger** (`20261003000270_web_function_privileges.sql`); prüfen, ob die Rolle `postgres`
     im gehosteten Projekt Event-Trigger anlegen darf.
4. **Prüfen** (SQL-Editor, Abschnitt 6).
5. **Vault-Geheimnisse** anlegen (Abschnitt 3.3) und die beiden automatisch angelegten Schlüssel sichern
   (Abschnitt 10).
6. **Einstellungen** setzen (Abschnitt 3.4).
7. **Secrets der Functions:** `supabase secrets set --env-file <datei>` mit den Werten aus 3.1 (Datei danach löschen).
8. **Functions deployen.** `supabase/config.toml` setzt `verify_jwt = false` bisher nur für `waitlist-signup`,
   `waitlist-confirm`, `waitlist-status`, `waitlist-unsubscribe`, `link-hit`. Alle anderen ohne Supabase-Anmeldung
   aufgerufenen Functions brauchen beim Deploy `--no-verify-jwt` (oder einen Eintrag in `config.toml`):

   ```bash
   # öffentlich oder mit eigenem Geheimnis/Signatur – ohne JWT-Prüfung
   for f in waitlist-signup waitlist-confirm waitlist-status waitlist-unsubscribe link-hit \
            notify-dispatch push-key venue-confirm trust-view safety-dispatch billing-extend \
            stripe-webhook billing-cancel billing-withdraw verification-webhook interview-agent; do
     supabase functions deploy "$f" --no-verify-jwt
   done
   # nur für angemeldete Mitglieder (prüfen den Token zusätzlich selbst)
   for f in billing-checkout account-export account-delete admin-invite verification-start \
            interview-token interview-summary; do
     supabase functions deploy "$f"
   done
   ```

   `billing-cancel` und `billing-withdraw` haben einen Weg ohne Anmeldung (Formular und Mail-Link), deshalb ohne
   JWT-Prüfung. Die Functions aus M2 und M3 gibt es erst nach deren Zusammenführung.
9. **HTML aus Functions prüfen:** `trust-view`, `venue-confirm` und die Bestätigungsseiten von `billing-cancel` und
   `billing-withdraw` liefern HTML. Laut Supabase-Dokumentation werden HTML-Antworten auf der Standard-Domain
   `*.supabase.co` aus Sicherheitsgründen nicht als HTML ausgeliefert [[prüfen]]; dann eine **eigene Domain für
   Supabase** (Custom Domain) einrichten oder die Seiten über die Web-App ausliefern. Test: Link „Abend teilen“ im
   Browser öffnen.
10. **Supabase Auth** einrichten (Abschnitt 3.2).
11. **Stripe:** Webhook-Endpunkt `https://<ref>.supabase.co/functions/v1/stripe-webhook` mit den Ereignissen
    `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`,
    `customer.subscription.deleted`; `whsec_…` als `STRIPE_WEBHOOK_SECRET`. Preise legt der Code selbst an.
12. **Didit:** Webhook auf `…/functions/v1/verification-webhook`; Aufbewahrung 1 Monat; Training aus. Das Format des
    Webhooks mit der Sandbox prüfen (Startcheckliste).
13. **Brevo:** Domain verifizieren (SPF, DKIM, DMARC), Tracking aus, Testmail aus `waitlist-signup`.
14. **Vercel Landingpage:** Projekt aus dem Repo, Root `apps/landing`, Variablen 3.5, Domain verbinden. Nach dem
    ersten Deploy: `curl -sI https://<domain>/ | grep -i -E 'content-security|strict-transport|referrer|permissions'`
    und `curl -sI https://<domain>/s/test` (302 auf `/?q=test`).
15. **Vercel Web-App** (nach M2): Root `apps/web`, Region `fra1`, Variablen 3.5, Domain `app.<domain>`.
16. **Admin-Zugang:** Benn als Person in Supabase Auth anlegen (Dashboard → Users → Invite), dann im SQL-Editor
    `insert into app.admin_users (user_id, display_name) values ('<uuid>', 'Benn');` – danach in der Web-App unter
    `/admin/mfa/einrichten` TOTP einrichten. Ohne Zwei-Faktor sind alle Admin-Funktionen gesperrt.
17. **AWS** (vor M9): Images bauen und nach ECR schieben (`docker build services/matcher`, `docker build
    services/viola`), Secrets Manager befüllen (3.6, 3.7), ECS-Dienste für Viola starten, Task-Definition für den
    Auswahl-Job, **EventBridge Scheduler** täglich 06:15 Europe/Berlin → ECS-Task `run --next` (Ausgang 2 = „nichts zu
    tun“, kein Fehler). Bei LiveKit Weg C: EC2 mit `livekit-server` ≥ 1.8, öffentliche IP, TLS, UDP 50000–60000,
    TCP 7881, TURN über TLS 443.
18. **Login-Rolle des Auswahl-Jobs** anlegen (Abschnitt 5).
19. **Ende-zu-Ende-Test** in Staging (Startcheckliste, Abschnitt „Technik“).

### Spätere Deployments

- Migrationen nur vorwärts, nie bestehende Dateien ändern; `supabase db push`; danach Abschnitt 6.
- Functions: nur die geänderten deployen (gleiche Flags wie oben).
- Container: neues Image, ECS-Dienst neu starten (Viola nachts, laufende Gespräche brechen ab und sind fortsetzbar).
- Landingpage: jede Einstellungsänderung braucht einen neuen Build.

---

## 5. Login-Rollen für Auswahl-Job und Agent

**Auswahl-Job** (einmal, SQL-Editor als `postgres`, Passwort aus dem Passwort-Manager):

```sql
create role fermata_matcher_job login noinherit password '<starkes Passwort>';
grant fermata_matcher to fermata_matcher_job;
alter role fermata_matcher_job set statement_timeout = '15min';
-- Der Job führt nach dem Verbinden selbst "set role fermata_matcher" aus (FERMATA_MATCHER_DB_ROLE).
-- noinherit: ohne SET ROLE hat die Login-Rolle keine Rechte.
```

Verbindung über den Pooler im Session-Modus (Port 5432), Benutzername `fermata_matcher_job.<projekt-ref>`, weil
`SET ROLE` für die ganze Verbindung gilt. Wert als `FERMATA_MATCHER_DB_URL` in Secrets Manager.

**Agent (Viola):** braucht **keine** Login-Rolle. Viola spricht nur mit der Edge Function `interview-agent`; diese
setzt innerhalb einer Transaktion `set local role fermata_agent`. Falls später ein Dienst direkt zur Datenbank
verbinden soll, gleiches Muster: `create role fermata_agent_job login noinherit …; grant fermata_agent to
fermata_agent_job;`.

**Edge Functions** verbinden sich heute als `postgres` (`SUPABASE_DB_URL`). Empfehlung aus der DSFA (M-1): eigene
Login-Rolle mit engen Rechten – das ist eine Code-Änderung, kein Betriebsschritt.

---

## 6. Prüfungen nach jedem Deploy (SQL-Editor)

```sql
-- Umgebung
select environment from ops.deployment;                                   -- production
-- Zeitpläne (14 nach Zusammenführung von M2 und M3)
select jobname, schedule, active from cron.job order by jobname;
-- letzte Fehler der Zeitpläne
select j.jobname, d.status, d.return_message, d.start_time
  from cron.job_run_details d join cron.job j using (jobid)
 where d.status <> 'succeeded' order by d.start_time desc limit 20;
-- keine Fermata-Funktion für PUBLIC ausführbar (wie Test 990_privileges)
select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('app','private','sensitive','safety','billing','ops','api')
   and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
-- Vault vollständig
select name from vault.secrets order by name;                               -- 4 Namen aus Abschnitt 3.3
-- Einstellungen für pg_net gesetzt
select key, value from ops.app_settings where key in ('internal.functions_base_url', 'notify.dispatch_url');
```

---

## 7. Routinen

### Täglich (ca. 10 Minuten, morgens)

1. **Sicherheit zuerst:** Admin → Sicherheit. Offene Meldungen nach Stufe und Frist (`api.admin_reports`), Ziel:
   **jede Meldung innerhalb von 24 Stunden** in Prüfung nehmen und entscheiden; überfällige sind markiert. Hinweise
   (`api.admin_safety_flags`): Sicherheits-Agent (Krise, minderjährig, Gewalt, Belästigung), Sperrlisten-Namens-
   treffer, „nicht sicher gefühlt“, bestrittenes Nichterscheinen, wiederholtes Nichterscheinen, Kontolöschung während
   einer Prüfung. Offene Widersprüche (`api.admin_appeals`).
2. **Postfach `safety.admin_alert_email`** – Sofort-Hinweise (Hilfe beim Check-in, akute Meldungen) kommen dort an,
   auch nachts.
3. **Lokale:** Hinweise „Lokal hat nicht bestätigt“ → anrufen; Lokale mit Telefon-Reservierung: Reservierungs- und
   Absage-Mails an dich → anrufen.
4. **Technik:** fehlgeschlagene Zeitpläne (SQL Abschnitt 6), gescheiterte Nachrichten
   (`select template, count(*) from ops.notification_queue where failed_at > now() - interval '1 day' group by 1;`),
   offene Löschaufträge bei Didit (`api.admin_overview` → `verifications_pending_deletion`, soll 0 sein),
   Verlängerungen mit Stripe-Fehler
   (`select id, user_id, stripe_sync_error from billing.membership_periods where stripe_sync_status = 'failed';`),
   Erstattungen „von Hand“ (`api.admin_contract_actions('withdraw')`, `result.refund = 'manual'`).

### Je Auswahl-Lauf (alle 14 Tage)

1. Der Lauf steht nach dem Job auf `review` (`api.admin_match_runs`). **Bericht lesen:** Poolgröße, Gründe ohne
   Vorschlag, Kosten, **Fairness-Bericht** (Anteil mit Vorschlag je Geschlecht und Altersband – auffällige
   Unterschiede notieren), Lokale über dem Anfahrtsverhältnis.
2. **Jeden Vorschlag prüfen** (`api.admin_run_pairings`): „Warum Sie beide“ lesen (Ersatztext verwendet?), Hinweise
   des Prüf-Agenten, Art.-9-Treffer, Anfahrt, Lokal. Freigeben oder ablehnen (mit Kommentar). Nicht „durchwinken“:
   Die menschliche Prüfung ist die Grundlage dafür, dass Art. 22 DSGVO nicht greift.
3. **Zeitnah:** Terminvorschläge liegen frühestens 48 h nach der Freigabe (`matching.proposal_lead_hours`); Plätze im
   Lokal zählen ab 72 h nach Laufstart. Freigabe am besten **am Tag des Laufs**.
4. Lauf abschließen (`api.admin_finish_run`).
5. Bei `failed`: Fehlertext im Bericht; neu starten mit `fermata-matcher run --next` (bereits bezahlte Bewertungen
   werden wiederverwendet).

### Wöchentlich

- Plätze der Lokale für die kommenden Wochen anlegen (`api.admin_create_slots`), Lokale aktiv/inaktiv.
- Bestrittenes Nichterscheinen entscheiden (`api.admin_resolve_evening`).
- Warteliste und Einladungen (`api.admin_waitlist_stats`), Einladungen verschicken (Admin → Einladen).
- Kosten: Gespräche (`ops.session_costs`), Läufe (`app.match_runs.cost_eur`) – siehe [KENNZAHLEN.md](KENNZAHLEN.md).
- Anfragen von Betroffenen (Auskunft, Löschung, Beschwerden) beantworten – Frist 1 Monat.

### Monatlich

- Kennzahlen ansehen, Einstellungen (Platzhalter) prüfen, Rechnungen der Anbieter mit den Kostenprotokollen
  vergleichen.
- Sicherheitsupdates der Abhängigkeiten (Dependabot/CI), Container neu bauen.
- Zugriffe prüfen: wer hat Zugang zu Supabase, AWS, Vercel, Stripe?

### Halbjährlich

- **Wiederherstellungstest** (Abschnitt 10).
- Schlüssel rotieren (Abschnitt 11), soweit vorgesehen.
- DSFA, TOM, VVT, AV-Liste durchsehen; Hilfe-Nummern prüfen.

---

## 8. Störungen und Notfälle

### 8.1 Datenpanne (Art. 33/34 DSGVO) – Frist 72 Stunden

1. **Erkennen und festhalten:** Zeitpunkt der Kenntnis notieren (ab da laufen 72 h). Was ist passiert, welche Daten,
   wie viele Personen?
2. **Eindämmen:** betroffene Schlüssel sofort rotieren (Abschnitt 11), betroffene Function deaktivieren
   (`supabase functions delete` bzw. neu deployen mit Sperre), Admin-Sitzungen beenden, Datenbankpasswort ändern,
   ggf. Projekt pausieren.
3. **Datenschutzbeauftragten informieren** (B15) und Anwalt.
4. **Risiko bewerten:** Art.-9-Daten, Biometrie, Meldungen, Gesprächstexte = in der Regel hohes Risiko.
5. **Meldung an die Aufsichtsbehörde** binnen 72 h (Landesbeauftragter für Datenschutz und Informationsfreiheit
   Mecklenburg-Vorpommern [[Formular/Adresse prüfen]]): Art der Verletzung, Kategorien und ungefähre Zahl der
   Betroffenen und Datensätze, Kontakt des DSB, wahrscheinliche Folgen, ergriffene Maßnahmen. Nachreichen ist erlaubt.
6. **Betroffene benachrichtigen** bei hohem Risiko (Art. 34) – klar, ohne Fachsprache, mit Empfehlungen.
7. **Dokumentieren** (Art. 33 Abs. 5) – auch, wenn keine Meldung nötig war. Ablage [[Ort]].
8. Auftragsverarbeiter: Pannen bei Anbietern müssen sie dir unverzüglich melden (AV-Vertrag); dann ab Schritt 3.

### 8.2 Sicherheitsnotfall eines Mitglieds

| Signal | Sofort | Danach |
|---|---|---|
| Check-in „Hilfe“ (Sofort-Mail „Bitte sofort … anrufen. Bei Gefahr: 110.“) | Person anrufen, wenn Telefon hinterlegt (Admin → Konto); keine Antwort und Hinweis auf Gefahr → **110** mit Lokal und Uhrzeit (aus der Meldung/dem Abend); Lokal anrufen | Meldung anlegen bzw. prüfen, vorläufige Sperre erwägen, Nachsorge |
| Akute Meldung (Übergriff, Bedrohung, minderjährig) | System hat bei Beziehung **vorläufig gesperrt** und offene Abende neutral abgesagt; bei Gefahr 110 | innerhalb 24 h prüfen; Polizeivorlage nach [polizeimeldung-vorlage.md](recht/polizeimeldung-vorlage.md); Sanktion; Widerspruch abwarten |
| Sicherheits-Agent „Krise“ | Viola hat Hilfsnummern genannt und beendet; **kein Profil** | behutsame Kontaktaufnahme nur, wenn sinnvoll; nie Inhalte weitergeben |
| „Minderjährig“ (Gespräch oder Ausweis) | kein Profil; Konto sperren | prüfen, Konto schließen |

### 8.3 Ausfall eines Anbieters

| Anbieter | Folge | Was tun |
|---|---|---|
| Brevo | Mails scheitern; Wiederholung bis 5 Versuche (10, 20, 30 … min), dann `failed`; Anmeldecodes kommen nicht | Status von Brevo prüfen; danach gescheiterte Nachrichten mit Frist ansehen (`select id, user_id, template from ops.notification_queue where failed_at > now() - interval '1 day' and has_deadline;`) und Betroffene direkt informieren bzw. Fristen verlängern (8.4). Ein Werkzeug zum erneuten Einreihen fehlt [[Technik]] |
| Stripe | Bestellung antwortet `payment_provider_error`; Webhooks stellt Stripe später zu | abwarten; Kündigung/Widerruf gelten trotzdem (gespeichert vor Ausführung), Hinweis an dich |
| Didit | Ausweisprüfung nicht möglich | Hinweis in der App; abwarten; Plan B Veriff |
| Bedrock | Viola antwortet nicht, Auswertung scheitert; Auswahl nimmt „nur Regeln“ | Gespräche später fortsetzen lassen; Lauf ggf. neu starten |
| Deepgram, LiveKit | Stimme nicht verfügbar (`voice_unavailable`) | **Text statt Stimme** anbieten (eingebaut) |
| Polly | keine Stimme | Text; ggf. anderen TTS-Anbieter (B4) |
| Vercel | Websites nicht erreichbar | abwarten; Functions laufen weiter |
| Push-Dienste | Push fehlt | Mails gehen bei Fristen immer mit |

### 8.4 Ausfall Supabase Frankfurt – Fermata steht

Es gibt bewusst **keine Umleitung** in eine andere Region (PLAN 5.13). Während des Ausfalls laufen keine Fristen,
keine Mails, keine Anmeldung.

1. Status prüfen (Supabase-Statusseite), Hinweis auf der Landingpage nur, wenn länger als ein paar Stunden.
2. **Nach der Rückkehr:** Der Fristen-Job holt alle überfälligen Fristen auf einmal nach – Vorschläge würden
   verfallen. Deshalb **sofort**:

   ```sql
   select cron.unschedule('fermata-evening-deadlines');                       -- Fristen-Job anhalten
   update app.evening_deadlines
      set due_at = due_at + interval '<Dauer des Ausfalls + 12 hours>'
    where done_at is null and cancelled_at is null
      and kind in ('time_request', 'time_answer') and due_at < now() + interval '12 hours';
   select ops.schedule_evening_jobs();                                         -- Jobs wieder anlegen
   ```

   [[Technik: dafür eine Admin-Funktion bauen; direktes SQL nur mit Backup und Bedacht.]]
3. Mitglieder mit verpassten Fristen informieren; Abende, die ausgefallen sind, über `cancel_admin` absagen (Abend
   kommt zurück).

### 8.5 Auswahl-Lauf fehlerhaft

Lauf ablehnen (alle Vorschläge ablehnen, `api.admin_finish_run(run_id, true)`), Ursache klären, neuen Lauf mit
`fermata-matcher run --period <zeitraum-id>` starten.

---

## 9. Was passiert, wenn Benn nicht erreichbar ist (PLAN 5.13)

**Grundsatz: lieber aussetzen als ungeprüft freigeben.** Der Code hat keine automatische Freigabe – Läufe bleiben auf
`review`, bis ein Admin entscheidet.

| Was läuft weiter ohne dich | Was ohne dich stehen bleibt |
|---|---|
| Null-Toleranz-Meldungen sperren automatisch vorläufig; Check-in, Hilfe-Knopf, Abend teilen; Fristen, Erinnerungen, Rückmeldungen, Kontakttausch; Löschjobs; Zahlungen und Verlängerungsregel | Freigabe neuer Vorschläge; Prüfung von Meldungen (24-h-Ziel); Widersprüche; bestrittenes Nichterscheinen; Lokal-Rückfragen; Einladungen |

**Vor einer geplanten Abwesenheit (Urlaub):**

1. Den Auswahl-Rhythmus so legen, dass kein Lauf in die Abwesenheit fällt, oder den **Zeitplan anhalten**:
   EventBridge-Schedule des Auswahl-Jobs deaktivieren **und** die Zeitenabfrage anhalten, damit Mitglieder nicht
   umsonst Zeiten eintragen:
   `select cron.unschedule('fermata-availability-tick');` (wieder an mit `select ops.schedule_evening_jobs();`).
2. **Vertretung** für Sicherheit benennen: eine vertrauenswürdige Person mit eigenem Admin-Konto
   (`app.admin_users`) und eigener Zwei-Faktor-Einrichtung, vertraglich auf Vertraulichkeit verpflichtet, eingewiesen
   in Abschnitt 8.2. `safety.admin_alert_email` auf ein Postfach legen, das die Vertretung liest. [[Benn: Person
   benennen]]
3. Hinweis an Mitglieder (Mail oder App): „In der Zeit vom … bis … gibt es keine neuen Vorschläge.“ Die
   Verlängerungsregel gleicht bezahlte Zeiträume ohne Abend aus (nicht der Person zuzurechnen).

**Ungeplant (Krankheit):** Die Vertretung prüft täglich Sicherheit (7, Schritte 1–2) und hält bei Bedarf den Zeitplan
an (Schritt 1). Vorschläge gibt sie **nicht** frei, wenn sie dafür nicht eingewiesen ist.

**Notfallumschlag:** Zugänge zum Passwort-Manager und Anleitung für die Vertretung versiegelt hinterlegen
[[Ort, wer]].

---

## 10. Backups und Wiederherstellungstest

- **Supabase:** tägliche Backups je Tarif (Pro: Aufbewahrung laut Tarif, z. B. 7 Tage); Point-in-Time-Recovery als
  Zusatz für kurze Wiederherstellungspunkte [[Entscheidung Benn]].
- **Vault-Schlüssel:** `fermata_sensitive_key` und `fermata_blocklist_key` sind in Backups des **gleichen** Projekts
  enthalten. Ob sie nach einer Wiederherstellung in ein **neues** Projekt noch entschlüsselt werden können, hängt
  vom Projekt-Hauptschlüssel ab – **genau das muss der Test zeigen.** Zusätzlich die beiden Schlüssel einmal
  auslesen (`select name, decrypted_secret from vault.decrypted_secrets where name in (…)`) und **offline
  versiegelt** aufbewahren (Passwort-Manager mit eigenem Tresor) [[Benn/DSB: Abwägung Sicherheit vs. Datenverlust]].
- **Test (halbjährlich und vor dem Start):**
  1. Backup in ein Test-Projekt wiederherstellen (nie in Produktion).
  2. `select count(*) from app.accounts;` und Stichproben.
  3. **Art.-9-Entschlüsselung prüfen:** `select sensitive.dec(gender_enc) is not null from sensitive.profile_identity limit 1;`
     (als `postgres`).
  4. Sperrlisten-Hash prüfen: `select safety.blocklist_hash('test');` muss gleich wie in Produktion sein.
  5. Testprojekt danach löschen; Ergebnis protokollieren.
- **Gelöschte Daten** kommen mit einer Wiederherstellung zurück. Nach einer Wiederherstellung die Löschjobs laufen
  lassen und Kontolöschungen seit dem Backup aus dem Audit-Protokoll (`account.deleted`) nachziehen.
- **Code und Einstellungen:** GitHub; Einstellungen liegen in der Datenbank (`ops.app_settings`).

---

## 11. Schlüsselrotation

| Geheimnis | Wie | Folgen | Wann |
|---|---|---|---|
| `FERMATA_INTERNAL_SECRET` / Vault `fermata_internal_secret` | neuen Wert in **beiden** setzen (`supabase secrets set`, `vault.update_secret`) | kurze Lücke: pg_net-Aufrufe scheitern, Rückfall-Job holt nach | halbjährlich, bei Verdacht sofort |
| `NOTIFY_DISPATCH_SECRET` / Vault `fermata_notify_dispatch_secret` | dto. | Versand verzögert sich um Minuten | halbjährlich |
| `INTERVIEW_AGENT_SECRET` | Supabase und Secrets Manager, Viola-Dienste neu starten | laufende Gespräche brechen ab (fortsetzbar) – nachts | halbjährlich |
| `VIOLA_TEXT_TOKEN_SECRET` | dto. | offene Textsitzungen müssen neu starten | halbjährlich |
| `VENUE_LINK_SECRET` | Supabase | offene Bestätigungslinks der Lokale werden ungültig | nur, wenn keine Reservierung offen ist, oder bei Verdacht |
| `VAPID_*` | neu erzeugen | **alle Push-Abos werden ungültig**, Mitglieder müssen Mitteilungen neu einschalten | nur bei Verdacht |
| `LINK_HIT_SECRET` | Supabase und Vercel | Zählung kurz unterbrochen | jährlich |
| Stripe-Schlüssel, Webhook-Geheimnis | im Stripe-Dashboard „rollen“, neue Werte setzen | – | jährlich, bei Verdacht sofort |
| Brevo-, Didit-, Deepgram-, LiveKit-Schlüssel | im Dashboard neu erzeugen, setzen, alten löschen | – | jährlich |
| Passwort `fermata_matcher_job` | `alter role … password '…'`, Secrets Manager | – | jährlich |
| Supabase `service_role`/JWT-Schlüssel | im Dashboard (neue API-Schlüssel) | Web-App und Functions neu konfigurieren | bei Verdacht |
| `fermata_sensitive_key` | **noch nicht möglich** (keine Funktion zum Umschlüsseln aller `*_enc`-Spalten) | Datenverlust bei falschem Vorgehen | nur bei Kompromittierung – vorher Umschlüssel-Funktion bauen lassen |
| `fermata_blocklist_key` | **nicht rotieren** (Hashes lassen sich ohne Ausweisnummer nicht neu rechnen) | Sperrliste wirkungslos | nie |

---

## Offene Punkte für Benn

1. **Integration M2/M4:** `app.require_admin()` mit zwei Rückgabetypen – Migration bricht ab (Abschnitt 4, Schritt 3).
2. **`supabase/config.toml`** um `verify_jwt = false` für alle Functions aus Schritt 8 ergänzen (Datei gehört dem
   Kern), damit ein Deploy ohne Flags nicht versehentlich Webhooks sperrt.
3. **HTML aus Edge Functions** auf `*.supabase.co` prüfen; ggf. Custom Domain.
4. **Auswahl-Job:** Attrappen in Produktion verweigern (Standard `fake`).
5. **Region `fra1` für die Web-App** festlegen.
6. **Vertretung** für Sicherheitsfälle benennen; Notfallumschlag.
7. **Admin-Funktionen nachrüsten:** Fristen verschieben (Ausfall), Transkript im Sicherheitsfall einsehen, Weitergabe
   an die Polizei protokollieren.
8. **Kontolöschung** kündigt das Stripe-Abo nicht – vor dem Live-Modus beheben.
9. Sicherung der Vault-Schlüssel entscheiden und Wiederherstellungstest durchführen.
10. Eine Einstellung für Krisennummern statt zwei (`safety.crisis_lines` und `safety.telefonseelsorge_numbers`).
