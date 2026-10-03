# Landingpage und Warteliste (M1)

Stand: 3. Oktober 2026 · Branch `build/landing` · Grundlage: PLAN.md Abschnitte 1, 2.2, 2.3 (Nr. 1 und 2), 2.5, 3.2 (Nr. 1–3), 4 (M1), 5.13, 6 (A3–A9), 7.

**Kurz:** Die Landingpage ist fertig gebaut und getestet: Startseite, Warteliste mit Double-Opt-in, Platznummer, Einladung, Gründungsstatus, Plakat-Kürzel, Rechtsseiten als Entwurf. Keine Cookies, keine Anfragen an Drittanbieter im Browser, strenge CSP ohne `unsafe-inline`. Alles, was noch deine Entscheidung braucht, steht unten unter [Platzhalter und offene Entscheidungen](#platzhalter-und-offene-entscheidungen).

Bildschirmfotos zum Ansehen: [`docs/screenshots/landing/`](../screenshots/landing/) (Startseite Desktop 1440 px und Mobil 390 px, jeweils hell und dunkel; Willkommensseite mit Daten; Formular mit Fehlern; Unterseiten).

---

## Was gebaut ist

| Teil | Ort | Inhalt |
|---|---|---|
| Datenbank | `supabase/migrations/20261003000100_waitlist.sql` | Tabellen `waitlist`, `waitlist_invites`, `waitlist_counters`, `signup_attempts`, `link_hits`; alle Regeln als Funktionen in `api.*`; pg_cron-Job für Löschfristen |
| DB-Tests | `supabase/tests/100_waitlist.test.sql` | 77 pgTAP-Prüfungen |
| Edge Functions | `supabase/functions/waitlist-signup`, `waitlist-confirm`, `waitlist-status`, `waitlist-unsubscribe`, `link-hit` | je `handler.ts` + `index.ts`, Deno-Tests in `handler.test.ts` |
| Mail-Vorlagen | `supabase/functions/_shared/mail/templates/waitlist.ts` | Bestätigung (ohne Werbung), Willkommen, „schon eingetragen“ |
| Landingpage | `apps/landing` (`@fermata/landing`) | Astro 7, statisch, genau eine Server-Funktion `/s/[slug]` |
| Texte | `apps/landing/src/content/*.ts` | alle sichtbaren Texte (von `pnpm check:tone` geprüft) |
| Tests | `apps/landing/tests/` | Playwright (Ablauf, Formular, axe hell/dunkel, Build-Prüfung) |
| Bildschirmfotos | `docs/screenshots/landing/` | erzeugt mit `pnpm --filter @fermata/landing screenshots` |

Seiten: `/`, `/bestaetigen`, `/willkommen`, `/bestaetigung-abgelaufen`, `/abmelden` (Rückfrage vor dem Löschen), `/abgemeldet`, `/gruendungsmitglied`, `/impressum` (Entwurf), `/datenschutz` (Entwurf), 404.

## Ablauf in Kürze

1. **Formular** (braucht JavaScript; ohne JS erscheint ein Hinweis mit Kontaktadresse) → `POST waitlist-signup`.
2. Die Function prüft Felder (zod), Honigtopf (`website`, für Menschen unsichtbar; Bots bekommen die normale Antwort, es passiert nichts) und Mindestzeit (`fill_ms`, im Browser gemessene Dauer seit dem Laden; zu schnell → freundlicher Hinweis). Dann `api.waitlist_signup`: Drossel je IP-Hash (`ops.daily_hash`), Prüfung, Speichern.
3. **Antwort immer gleich** (`202 {"ok": true}`), egal ob die Adresse neu, unbestätigt oder bestätigt ist. Danach Weiterleitung auf `/bestaetigen`.
4. **Bestätigungs-Mail** (ohne Werbung) mit Link `…/functions/v1/waitlist-confirm?t=…` (gilt 72 h, nur einmal).
5. `GET waitlist-confirm` → Grundnummer, Gründungsstatus, Einladungscode, ggf. Vorrückung → **303 auf `/willkommen#t=<Statuslink>`** (Token nur im Fragment, nie in Server-Logs) und Willkommens-Mail mit Platz „zum Zeitpunkt der Bestätigung“, Einladungslink und Abmeldelink. Ungültig/abgelaufen/schon benutzt → `/bestaetigung-abgelaufen`.
6. `/willkommen` liest `#t=` und fragt `POST waitlist-status`: Platz, Gründungsstatus, Einladungslink mit Kopierknopf, Abmeldelink.
7. `/abmelden#u=…` (aus der Mail) oder `#t=…` (von der persönlichen Seite) → Knopf „Ja, abmelden und löschen“ → `POST waitlist-unsubscribe` → Eintrag gelöscht → `/abgemeldet`. Die Rückfrage verhindert, dass Link-Vorschauen in Mailprogrammen jemanden abmelden.
8. **Plakat:** `/s/pfaffenteich` (Vercel-Funktion, fra1) → `POST link-hit` zählt Kürzel + Tag (keine IP, kein Cookie) → 302 auf `/?q=pfaffenteich` → das Formular schickt `q` als `source` mit.

## Regeln (in der Datenbank)

- **Platz** (PLAN 3.2 Nr. 1): `base_number` wird bei Bestätigung fortlaufend je `region_group` vergeben (Zeilensperre auf `waitlist_counters`, Nummern werden nie wiederverwendet). Angezeigter Platz = Rang nach `base_number − waitlist.bonus_places × bonus_steps`, bei Gleichstand nach `confirmed_at`, je Gruppe, mindestens 1.
- **Regionen:** Auswahl `schwerin`, `nordwestmecklenburg` (Wismar und Nordwestmecklenburg), `ludwigslust-parchim` → Gruppe `westmecklenburg`; `hamburg`, `luebeck`, `rostock`, `anderswo` → eigene Gruppe.
- **Gründungsmitglied** (3.2 Nr. 2): bei Bestätigung einmal festgelegt, wenn Gruppe = `waitlist.founding_region_group` und Grundnummer ≤ `waitlist.founding_limit` (= die ersten 500 Bestätigungen nach `confirmed_at`). Nie entzogen; Abmeldungen geben keinen Platz frei (siehe Abweichungen).
- **Einladungen** (3.2 Nr. 3): Bei Bestätigung entstehen `waitlist.invites_per_person` Codes (8 Zeichen ohne verwechselbare Zeichen). Bestätigt eine eingeladene Person, rücken einladende und eingeladene Person je eine Stufe vor. Jeder Code wirkt einmal. Weitere Codes: `api.admin_waitlist_grant_invite(id)` (nur Admin mit Zwei-Faktor, protokolliert).
- **Erneute Anmeldung:** unbestätigt → neuer Link, Angaben werden aktualisiert, der alte Link gilt nicht mehr; schon bestätigt → Mail mit neuem persönlichem Link (der alte Statuslink gilt nicht mehr). Zwischen zwei Mails an dieselbe Adresse liegen mindestens `waitlist.resend_min_minutes` (10). Schlägt der Versand fehl, wird die Pause zurückgesetzt (`api.waitlist_mail_failed`) und die Seite bittet, es gleich noch einmal zu versuchen.
- **Löschfristen** (2.2): `api.waitlist_cleanup()` stündlich per pg_cron (`fermata-waitlist-cleanup`, Minute 23): unbestätigte Einträge nach 7 Tagen (ab letzter Mail), Drossel-Einträge nach 24 h, Tagessalze nach 2 Tagen. Ohne pg_cron läuft die Migration trotzdem durch (Hinweis im Log).
- **Admin-Zahlen:** `api.admin_waitlist_stats()` (nur `app.is_admin()`, also Admin mit `aal2`): Summen, je Gruppe, je Tag, je Quelle (Plakat-Kürzel), Plakat-Aufrufe, Einladungen.
- **Zugriff:** RLS auf allen fünf Tabellen, keine Policies, keine Rechte für `anon`/`authenticated`. Alle `api.waitlist_*`-Funktionen sind `security definer`, `search_path = ''`, nur für `service_role` ausführbar.

### Neue Einstellungen (`ops.app_settings`)

| Schlüssel | Start | Zweck |
|---|---|---|
| `waitlist.resend_min_minutes` | 10 | Mindestpause zwischen zwei Mails an dieselbe Adresse |
| `waitlist.consent_version` | `"warteliste-2026-10-03-entwurf"` | aktuelle Version des Einwilligungstexts (öffentlich) |
| `landing.poster_codes` | `null` | Liste zugelassener Plakat-Kürzel; `null` zählt jedes gültige Kürzel |

Der Einwilligungstext liegt als `ops.legal_documents` (kind `einwilligung_warteliste`, Status `entwurf`) und wortgleich in `apps/landing/src/content/form.ts`; ein Playwright-Test prüft die Gleichheit.

## Lokal starten

Alle Befehle aus der Repo-Wurzel. Ports wie im Bau verwendet (Datenbank 54332, Functions 54331, Seite 4331); die Standardwerte von `scripts/db.sh` sind 54322/`fermata-db`.

```bash
pnpm install

# 1. Datenbank (Docker) mit allen Migrationen, Umgebung "test"
DB_PORT=54332 DB_CONTAINER=fermata-db-landing bash scripts/db.sh reset

# 2. Edge Functions (Mails landen in ops.mail_outbox)
cd supabase/functions && SUPABASE_DB_URL=postgres://postgres:postgres@localhost:54332/postgres \
  FERMATA_ENV=local FUNCTIONS_PORT=54331 FERMATA_SITE_URL=http://localhost:4331 \
  FERMATA_ALLOWED_ORIGINS=http://localhost:4331 FERMATA_FUNCTIONS_URL=http://localhost:54331/functions/v1 \
  deno run --allow-net --allow-env --allow-read dev-server.ts

# 3. Landingpage (zweites Terminal): Entwicklung …
pnpm --filter @fermata/landing dev          # http://localhost:4331
# … oder gebaute Seite wie in den Tests
cd apps/landing && FERMATA_ADAPTER=node pnpm build && PORT=4331 HOST=localhost node dist/server/entry.mjs
```

Bestätigungslinks lokal: `select recipient, text from ops.mail_outbox order by id desc limit 1;` (über `bash scripts/db.sh psql` mit denselben `DB_PORT`/`DB_CONTAINER`).

Hinweis: `@astrojs/vercel` kann kein `astro preview`. Für Tests, Lighthouse und lokale Vorschau baut `FERMATA_ADAPTER=node` dieselben Seiten mit `@astrojs/node`. Astro 7 startet `astro preview` in nicht-interaktiven Shells im Hintergrund (`astro preview stop` beendet ihn); deshalb starten die Tests `node dist/server/entry.mjs` direkt.

## Tests

| Was | Befehl | Ergebnis (3.10.2026) |
|---|---|---|
| pgTAP (Fundament + Warteliste) | `DB_PORT=54332 DB_CONTAINER=fermata-db-landing bash scripts/db.sh test` | 2 Dateien, 93 Prüfungen (16 + 77), alle grün |
| Deno (Edge Functions) | `cd supabase/functions && DB_PORT=54332 deno test --allow-env --allow-net --allow-read waitlist-signup/ waitlist-confirm/ waitlist-unsubscribe/ link-hit/` | 21 Tests grün (Datenbank muss migriert laufen) |
| Playwright | `cd apps/landing && DB_PORT=54332 npx playwright test` | 42 Tests grün |
| Bildschirmfotos | `cd apps/landing && DB_PORT=54332 npx playwright test --config playwright.screenshots.config.ts` | 16 PNGs in `docs/screenshots/landing/` |
| Lighthouse | Seite und Functions laufen lassen, dann `pnpm --filter @fermata/landing lighthouse` | siehe unten |
| Checks | `pnpm checks` | grün (Tonalität: 32 Dateien, 0 Funde) |
| Typen | `pnpm --filter @fermata/landing typecheck` | 0 Fehler |

Die Playwright-Tests starten Functions und Seite selbst (Build mit `@astrojs/node`). Sie prüfen: Formular → Mail in `ops.mail_outbox` → Bestätigungslink → `/willkommen` zeigt Platz 1 und Gründungsstatus → Einladungslink in neuem Browser → zweite Person bestätigt → beide rücken vor (Platz, Hinweise, Datenbank); gleiche Antwort für bekannte Adressen; Kopierknopf; Abmeldung; abgelaufener Link; Plakat-Kürzel zählt und leitet weiter; Fehler werden per `role="alert"` angesagt und sind per `aria-describedby` am Feld; Tastatur (alle Felder erreichbar, Fokus immer sichtbar); ohne JavaScript; weniger Bewegung; axe (WCAG 2.2 AA + Best Practices) auf jeder Seite hell und dunkel, mit geöffneten Fragen, mit Formularfehlern und mit Daten; keine Anfrage verlässt localhost; keine Cookies, kein Local/Session Storage; keine CSP-Verstöße, keine Skriptfehler; gebautes HTML ohne Inline-Skripte, `<style>`, `style=`-Attribute, Event-Attribute, fremde Quellen und doppelte IDs; Startwerte der Einstellungen passen zur Datenbank; Einwilligungstext auf der Seite = gespeicherter Text.

### Lighthouse (lokal gemessen, Lighthouse 13.5, Chromium 141)

| Seite | Mobil (Leistung / Barrierefreiheit / Best Practices / SEO) | Desktop |
|---|---|---|
| `/` | 99 / 100 / 100 / 100 (LCP 2,0 s, simuliertes 4G) | 100 / 100 / 100 / 100 |
| `/gruendungsmitglied` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/impressum` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/datenschutz` | 100 / 100 / 100 / 100 | 100 / 100 / 100 / 100 |
| `/bestaetigen` | 100 / 100 / 100 / 63 | 100 / 100 / 100 / 63 |
| `/willkommen` | 100 / 100 / 100 / 63 | 100 / 100 / 100 / 63 |

SEO 63 auf `/bestaetigen` und `/willkommen` ist gewollt: Diese Seiten (wie `/abmelden`, `/abgemeldet`, `/bestaetigung-abgelaufen`, 404) tragen `noindex`, weil sie in Suchmaschinen nichts verloren haben; Lighthouse wertet genau das ab. Gemessen über `http://localhost` (ohne HTTPS-Header von Vercel); nach dem ersten Deploy bitte einmal auf der echten Domain wiederholen.

### axe

0 Verstöße auf allen 10 Seiten, hell und dunkel, dazu Formular mit Fehlern und Willkommensseite mit Daten (Regelsätze `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice`). Ein echter Fehler, den erst der Playwright-Barrierebaum fand (axe nicht): Abschnitt und Auswahlfeld hatten beide die ID `region`, das Feld hatte dadurch keinen Namen. Behoben; ein Test prüft jetzt alle Seiten auf doppelte IDs.

## Deploy

### Supabase (Frankfurt, eu-central-1)

1. Migrationen einspielen (`supabase db push`), pg_cron ist bei Supabase verfügbar.
2. Functions deployen: `supabase functions deploy waitlist-signup waitlist-confirm waitlist-status waitlist-unsubscribe link-hit`. `supabase/config.toml` setzt für diese fünf `verify_jwt = false` (Aufruf ohne Anmeldung, Bestätigungslink aus der Mail).
3. Secrets (`supabase secrets set …`):

| Variable | Wert |
|---|---|
| `FERMATA_ENV` | `production` |
| `FERMATA_SITE_URL` | Adresse der Landingpage, z. B. `https://fermata…` (Frage A3) |
| `FERMATA_ALLOWED_ORIGINS` | dieselbe Adresse (CORS), kommagetrennt bei mehreren |
| `BREVO_API_KEY` | Brevo-Schlüssel (Öffnungs- und Klickverfolgung im Konto ausschalten) |
| `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | Absender (Frage A3/A7), Domain mit SPF/DKIM/DMARC |
| `LINK_HIT_SECRET` | optional, gleicher Wert wie bei Vercel |
| `FERMATA_FUNCTIONS_URL` | optional; Standard `SUPABASE_URL/functions/v1` |
| `FERMATA_FUNCTIONS_REGION` | optional; Standard `eu-central-1` (hängt `forceFunctionRegion` an den Bestätigungslink) |

`SUPABASE_DB_URL` und `SUPABASE_URL` setzt Supabase selbst.

### Vercel

1. Neues Projekt aus dem Repository, **Root Directory `apps/landing`**, Framework Astro (wird erkannt), Install über pnpm im Monorepo (Standard). Build-Befehl `pnpm build` (kopiert Favicons, lädt optional Einstellungen, baut, prüft das Ergebnis).
2. Region: `vercel.json` setzt `regions: ["fra1"]`; zusätzlich schreibt der Build die Region in die Funktion (`.vc-config.json`) und die Sicherheits-Header direkt in `.vercel/output/config.json`.
3. Umgebungsvariablen:

| Variable | Wann | Wert |
|---|---|---|
| `PUBLIC_FUNCTIONS_URL` | Build | `https://<projekt>.supabase.co/functions/v1` (landet in der CSP `connect-src`) |
| `PUBLIC_SITE_URL` | Build | öffentliche Adresse (canonical, Open Graph) |
| `PUBLIC_FUNCTIONS_REGION` | Build, optional | Standard `eu-central-1`; `none` schaltet den Parameter ab |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Build, optional | dann lädt `scripts/pull-settings.mjs` die öffentlichen Einstellungen (`api.public_settings`) |
| `LANDING_HOERPROBE_ENABLED` | Build | `true` zeigt die Hörprobe (Standard: aus) |
| `LANDING_HOERPROBE_SRC` | Build | Pfad der Audiodatei in `public/` (Standard `/hoerprobe/viola.mp3`) |
| `LANDING_PRICES_MODE`, `LANDING_VAT_MODE`, `LANDING_START_MONTH`, `LANDING_CONTACT_EMAIL` | Build, optional | überschreiben die Einstellungen |
| `FUNCTIONS_URL` | Laufzeit (`/s/…`) | Basis der Functions; sonst `PUBLIC_FUNCTIONS_URL` |
| `LINK_HIT_SECRET` | Laufzeit, optional | wie in Supabase |

4. In `vercel.json` die CSP `connect-src 'self' https://*.supabase.co` auf die genaue Projektadresse einschränken, sobald sie feststeht. (Die Seite setzt zusätzlich ein `<meta>`-CSP mit der genauen Adresse aus `PUBLIC_FUNCTIONS_URL`; beide gelten gemeinsam.)
5. Nach dem ersten Deploy prüfen: `curl -sI https://<domain>/ | grep -i -E 'content-security|strict-transport|referrer|permissions'` und `curl -sI https://<domain>/s/test` (302 auf `/?q=test`).

### Einstellungen ändern

Die Seite ist statisch: Werte wie Hörprobe, Preisanzeige, Umsatzsteuer, Startmonat oder Heimwegtelefon-Zeiten werden beim **Build** übernommen. Reihenfolge: Startwerte in `apps/landing/src/settings-defaults.ts` (gleich den Startwerten der Datenbank) → öffentliche Einstellungen aus Supabase (wenn `SUPABASE_URL`/`SUPABASE_ANON_KEY` gesetzt) → `LANDING_*`-Variablen. Nach einer Änderung in `ops.app_settings` also neu deployen.

**Hörprobe (Frage A4):** Schalter `landing.hoerprobe_enabled` (Standard `false`) bzw. `LANDING_HOERPROBE_ENABLED=true`. Die Datei kommt nach `apps/landing/public/hoerprobe/viola.mp3`; der Text zur Hörprobe steht in `src/content/home.ts` (`viola.hoerprobe.transcript`). Während die Hörprobe läuft, atmet „Atem“ im Takt der Stimme.

## Platzhalter und offene Entscheidungen

| Frage | Was jetzt drin ist | Wo |
|---|---|---|
| **A3 Domain** | `https://fermata.example` (canonical, Open Graph), Mails `hallo@fermata.example`; CSP erlaubt `*.supabase.co` | `PUBLIC_SITE_URL`, `vercel.json`, Secrets |
| **A4 Hörprobe** | ausgeblendet; Beispieltext für die Abschrift | Schalter, `src/content/home.ts` |
| **A5 Preise und USt** | Modus `geplant`: Abzeichen „Preise geplant · Stand Oktober 2026“ und Satz „Die Preise sind geplant …“; USt-Modus `inkl_ust` („Alle Preise inklusive 19 % Umsatzsteuer.“); bei `kleinunternehmer` erscheint der § 19-Satz, bei `aus` keine Preise | `landing.prices_mode`, `landing.vat_mode`, `src/content/home.ts` |
| **A6 Gründungsvorteil** | kein Vorteil versprochen; Startseite und `/gruendungsmitglied` beschreiben nur, wer dazugehört | `src/content/home.ts`, `src/content/pages.ts` |
| **A7 Impressum** | Name, Anschrift, Telefon, E-Mail, Register, USt-ID, § 18 MStV als markierte Platzhalter | `src/content/legal.ts` |
| **A8 Startmonat** | `site.start_month = null`: Frage „Ab wann geht es los?“ ohne Monat | Einstellung |
| **A9 Einwilligung** | Pflicht-Häkchen mit Entwurfstext (Kopplungsverbot, PLAN 5.13: Anwalt prüft) | `ops.legal_documents`, `src/content/form.ts` |
| Rechtstexte | Impressum und Datenschutzerklärung als **ENTWURF**, nur für Landingpage und Warteliste; offene Punkte markiert (Vercel-Logs und Drittlandgrundlage, AV-Verträge, Aufsichtsbehörde, B14, B15) | `src/content/legal.ts` |
| Gestaltung | eigener Entwurf, weil die Design-Datei nicht im Repository liegt (Farben und Schriften aus `packages/tokens`) | `src/styles/global.css` |
| Stufen-Untertitel | „Der erste Takt“, „In ruhigem Schritt“, „Der Platz mit Blick“ und je ein Satz | `src/content/home.ts` |
| Beispiel-Vorschlag im Hero | Donnerstag 19:30, Partner-Lokal in Wismar, Beispieltext, klar als „Beispiel“ markiert | `src/content/home.ts` |
| Heimwegtelefon | 030 12074182, So–Do 21–01, Fr/Sa 21–03 (aus den Einstellungen; vor dem Start erneut prüfen, M9) | Einstellungen |
| Sicherheitsfunktionen | Texte zu Melden, Hilfe-Knopf, Check-in nach 30 Minuten, Abend teilen beschreiben M5/M7 | `src/content/home.ts` |
| Vorschaubild | `public/og.png` (Fermate, Schriftzug, „Weniger Profile. Ein echter Abend.“), neu erzeugen mit `node --experimental-strip-types scripts/og-image.mjs` | `apps/landing/public/og.png` |

## Abweichungen vom Plan und bewusste Entscheidungen

- **Zusätzliche Tabelle `waitlist_counters`** für die Grundnummern je Gruppe: saubere Sperre bei gleichzeitigen Bestätigungen, Nummern werden nie doppelt vergeben.
- **Gründungsstatus = Grundnummer ≤ 500** in Westmecklenburg: entspricht „die ersten 500 Bestätigten nach `confirmed_at`“. Meldet sich eines dieser Gründungsmitglieder ab, rückt niemand nach. Wenn du lieber immer 500 aktive Gründungsmitglieder willst, ist das eine kleine Änderung in `api.waitlist_confirm`.
- **Seite `/abmelden` mit Rückfrage** zusätzlich zu `/abgemeldet`: Mailprogramme öffnen Links zur Vorschau; ohne Rückfrage würden sie Menschen abmelden. Der Bestätigungslink bleibt wie im Plan ein GET (HEAD-Anfragen bestätigen nicht).
- **Schon bestätigte Adresse erneut eingetragen:** Es kommt eine Mail mit neuem persönlichem Link; der alte Link gilt dann nicht mehr. So kommt jemand, der die Willkommens-Mail verloren hat, wieder an seinen Platz, ohne dass die Antwort im Browser etwas verrät.
- **Mindestzeit als Dauer** (`fill_ms`, im Browser gemessen) statt Zeitstempel: Uhren von Geräten gehen oft falsch. Zu schnell → Hinweis statt stillem Verwerfen (Menschen mit Passwort-Manager sollen nicht ohne Mail bleiben); der Honigtopf verwirft still.
- **Plakat-Zähler über Supabase:** Die Vercel-Funktion `/s/[slug]` hat keinen Datenbankzugang und ruft deshalb die Function `link-hit` auf (mit 1,5 s Zeitlimit; die Weiterleitung klappt auch, wenn das Zählen scheitert).
- **CSP doppelt:** als Header (`vercel.json`) und als `<meta>` mit der genauen Functions-Adresse; lokal und in den Tests gilt das `<meta>`.
- **Favicon:** neue Datei `packages/brand/svg/favicon-plain.svg` (ohne `<style>`, damit sie auch unter der strengen CSP sicher funktioniert; ohne eigene Dunkel-Fassung).
- **Playwright 1.56.1** statt der neuesten Version, weil das vorinstallierte Chromium (Build 1194) genau dazu passt; kein `playwright install` nötig.
- **Hörprobe als Build-Schalter** (statt zur Laufzeit), weil die Seite statisch ist und keine Anfrage an Supabase beim Laden machen soll.

## Änderungen an gemeinsamen Dateien (für die Zusammenführung)

- `supabase/functions/_shared/env.ts`: neue Funktion `functionsUrl()` (rein ergänzend).
- `supabase/functions/_shared/waitlist.ts`: neu (Tokens, Einstellungen, Regionsliste).
- `supabase/functions/_shared/mail/templates/waitlist.ts`: neu.
- `supabase/config.toml`: am Ende fünf Abschnitte `[functions.<name>] verify_jwt = false`.
- `supabase/functions/deno.lock`: Eintrag für zod ergänzt.
- `packages/brand/svg/favicon-plain.svg`: neu.
- `pnpm-lock.yaml`: Abhängigkeiten von `@fermata/landing`.
