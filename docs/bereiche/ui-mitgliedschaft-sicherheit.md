# Oberfläche Mitgliedschaft und Sicherheit (ui-member-b)

Stand: 03.10.2026 · Bereich `apps/web` (Next.js 16) auf der Schnittstelle aus
[`mitgliedschaft.md`](mitgliedschaft.md) (M6) und [`sicherheit.md`](sicherheit.md) (M7). Keine neuen Migrationen.
Alle rechtlichen Abläufe und Texte sind **ENTWURF** und brauchen die Prüfung durch den Anwalt.

> **Kurz für Benn:** Mitgliedschaft (Stufen, Bestellübersicht mit Pflicht-Häkchen und Stripe Payment Element,
> Kündigungsknopf und Widerrufsbutton – angemeldet und ohne Anmeldung), Sicherheit (Melden überall, eigene Meldungen,
> Hinweise mit Widerspruch, Abend teilen), Check-in, Hilfe-Seite mit allen Nummern, die öffentlichen Seiten für
> Vertrauensperson und Lokal und die Rechtstexte mit ENTWURF-Hinweis sind fertig und getestet (15 neue E2E-Abläufe,
> 15 neue Unit-Tests, 74 Bildschirmfotos). Echte Zahlungen mit Stripe (Testmodus) und echte Geräte stehen noch aus,
> siehe [Was noch echt geprüft werden muss](#was-noch-echt-geprüft-werden-muss).

## Inhalt

1. [Seiten](#seiten)
2. [Bausteine für andere Bereiche](#bausteine-für-andere-bereiche)
3. [Lokal ausprobieren](#lokal-ausprobieren)
4. [Tests](#tests)
5. [Stripe und CSP](#stripe-und-csp)
6. [Verträge mit der Härtung](#verträge-mit-der-härtung)
7. [Was noch echt geprüft werden muss](#was-noch-echt-geprüft-werden-muss)
8. [Für den Anwalt: Prüfpunkte](#für-den-anwalt-prüfpunkte)
9. [Entscheidungen](#entscheidungen)
10. [Offene Punkte](#offene-punkte)
11. [Geänderte gemeinsame Dateien](#geänderte-gemeinsame-dateien)

## Seiten

| Weg | Wer | Was | Schnittstelle |
|---|---|---|---|
| `/mitgliedschaft` | Mitglied | Stand (Status, Stufe, Vertragsnummer, Zeitraum, verfügbare und gebundene Abende, nächste Abbuchung, Ende, Widerrufsfrist), Gratisphase, Stufen mit Preis, Abenden und USt-Hinweis, Vertragsknöpfe, Verlauf der Erklärungen mit Datum und Uhrzeit | `api.billing_overview()`, `api.billing_tiers()`, eigene Zeilen in `billing.contract_actions` |
| `/mitgliedschaft/bestellen/[stufe]` | Mitglied | Bestellübersicht mit allen Pflichtangaben (Stufe, Preis mit USt, Laufzeit, Abende, automatische Verlängerung, Kündigung, Widerruf mit Link zur Belehrung, Verlängerungsregel, AGB), Stripe Payment Element, **Pflicht-Häkchen direkt über dem Knopf**, Knopf „Mitgliedschaft zahlungspflichtig abschließen“ | `api.billing_order_summary(p_tier)`, `billing-checkout` `{action:"order", tier, summaryHash, requestId, start_request:true}`, `stripe.confirmPayment` |
| `/mitgliedschaft/bestellen/ergebnis` | Mitglied | Danke / aktiv / Zahlung wird geprüft / Zahlung fehlgeschlagen (auch Rücksprung von Stripe mit `redirect_status`) | `api.billing_overview()` |
| `/mitgliedschaft/kuendigen` | Mitglied | Kündigungsknopf: Schritt 1 Angaben (vorausgefüllt: Vertrag, Name, E-Mail, Art, Grund, Wirksamkeit), Schritt 2 „Jetzt kündigen“, Eingangsbestätigung mit Datum, Uhrzeit (Sekunden, Zeitzone), drucken/speichern | `billing-cancel` `preview` / `confirm` |
| `/mitgliedschaft/widerrufen` | Mitglied | Widerrufsbutton: Schritt 1 Name, Vertragsnummer, E-Mail (vorausgefüllt) und Berechnung (bezahlt, Wertersatz, Erstattung), Schritt 2 „Widerruf bestätigen“, Eingangsbestätigung | `billing-withdraw` `preview` / `confirm` |
| `/kuendigen` | alle (Fuß jeder Seite) | Kündigen ohne Anmeldung: Name, E-Mail, Vertragsnummer, Art, Grund → „Jetzt kündigen“ → gleiche Antwort für alle, Mail mit Link → Seite der Function mit „Kündigung bestätigen“. Angemeldet → `/mitgliedschaft/kuendigen` | `billing-cancel` `request`, Link `GET ?t=` + `confirm_link` |
| `/widerrufen` | alle (Fuß jeder Seite) | wie oben für den Widerruf | `billing-withdraw` `request` |
| `/sicherheit` | Mitglied | Überblick: Melden, Abend teilen, Hilfe-Nummern, eigene Meldungen, Hinweise, Standards | `api.help_contacts()`, `api.my_reports()`, `api.my_sanctions()`, `api.my_trust_shares()` |
| `/sicherheit/melden` (`?abend=<id>`) | Mitglied | Bereich, (optional) Abend, „betrifft mein Gegenüber / etwas anderes“, Art mit Erklärung zur Null-Toleranz, Beschreibung (freiwillig, Zähler), Rückfrage gewünscht, ruhige Bestätigung; Drossel und Beziehung erklärt | `api.report(...)`, `api.my_evenings()`, `api.evening_detail()` |
| `/sicherheit/meldungen` | Mitglied | eigene Meldungen mit Stand und Frist | `api.my_reports()` |
| `/sicherheit/sanktionen` | Mitglied | Hinweise und Sperren mit Begründung, Widerspruch (einmal je Sanktion), Entscheidung | `api.my_sanctions()`, `api.appeal()`, `api.my_appeals()` |
| `/sicherheit/teilen` (`?abend=<id>`) | Mitglied | je bestätigtem Abend: Link erstellen, kopieren/teilen, aktive Links zurückziehen; Erklärung, was die Vertrauensperson sieht | `api.create_trust_share()`, `api.revoke_trust_share()`, `api.my_trust_shares()` |
| `/abende/[id]/checkin` | Mitglied | drei große Antworten „Alles gut“ / „Ich bin unsicher“ / „Ich brauche Hilfe“; bei Hilfe sofort 110 groß (Nummer als Text und `tel:`), 112, Heimwegtelefon, Hilfetelefon; dazu „Etwas melden“ | `api.checkin_respond()`, `api.help_contacts()` |
| `/hilfe` | alle (Hilfe-Knopf) | 110, 112, Heimwegtelefon mit Zeiten, Hilfetelefon Gewalt gegen Frauen, TelefonSeelsorge (3 Nummern); Melden und Abend teilen | `api.help_contacts()` (Ersatz: `public_settings` bzw. 110/112) |
| `/teilen#t=<Schlüssel>` | Vertrauensperson | Vorname, Datum und Uhrzeit, Lokal mit Adresse und Anfahrt, Heimwegtelefon, 110, Ablauf; nie das Gegenüber; `noindex`, `no-referrer` | `trust-view` (JSON) |
| `/lokal/bestaetigen#t=<Schlüssel>` | Partner-Lokal | Datum, Uhrzeit, Name der Reservierung, Tisch-Code, Personen; erst der Knopf bestätigt (POST) | `venue-confirm` (JSON, sonst Ersatz) |
| `/rechtliches`, `/rechtliches/[art]` | alle | Impressum, Datenschutz, AGB, **Widerrufsbelehrung**, KI-Hinweis, Einwilligungstexte; deutlicher Hinweis „ENTWURF – noch nicht rechtsverbindlich“ bei Status `entwurf` oder fehlendem Text; Verträge (Kündigen/Widerrufen) | `api.legal_document(kind)` |
| `/konto/mitgliedschaft`, `/konto/sicherheit`, `/abende/[id]/check-in` | – | Weiterleitungen für Links aus den Mails (`/konto/…`) und den Mitteilungen (`check-in`) | – |

Im **Fuß jeder Seite** stehen jetzt zusätzlich „Widerrufsbelehrung“, „Verträge hier kündigen“ und „Vertrag widerrufen“
(§ 312k BGB: ständig verfügbar, auch ohne Anmeldung). Bei gesperrtem Konto zeigt der Hinweis oben einen Link zu
„Hinweise und Widerspruch“.

Bildschirmfotos (mobil 390 px, Desktop 1440 px, hell und dunkel): [`docs/screenshots/web/ui-b/`](../screenshots/web/ui-b/).

## Bausteine für andere Bereiche

| Baustein | Datei | Verwendung |
|---|---|---|
| `ReportButton` | `components/sicherheit/ReportButton.tsx` | `<ReportButton form={form} eveningId={id} eveningLabel="Sa., 10.10.2026, 19:30 · Café am See" counterpartName="Jonas" />` – Knopf mit Dialog; ohne `eveningId` frei wählbarer Bereich. Ohne JavaScript bzw. als Link: `/sicherheit/melden?abend=<id>`. |
| `TrustSharePanel` | `components/sicherheit/TrustSharePanel.tsx` | Teilen für einen Abend direkt auf einer Seite: `<TrustSharePanel form={form} eveningId={id} shares={aktiveLinks} />`. Als Link: `/sicherheit/teilen?abend=<id>`. |
| `HelpNumbers`, `PoliceCall`, `HeimwegCall` | `components/sicherheit/HelpNumbers.tsx` | Hilfe-Nummern (`variant` `full`, `urgent`, `compact`), Daten aus `getHelpContacts()` (`lib/safety.ts`). |
| `CheckinChoices` | `components/sicherheit/CheckinChoices.tsx` | die drei Antworten des Check-ins. |
| `TierCards`, `orderHref()` | `components/mitgliedschaft/TierCards.tsx` | Stufen-Karten. Links zur Bestellung **immer als normalen Link** (`<a href={orderHref(t)}>`), nicht `next/link` – siehe CSP. |

Meldungen zu einem Abend betreffen auf Wunsch das Gegenüber: Die Oberfläche kennt nur den Vornamen; die Server Action
liest die Kennung des Gegenübers mit der Sitzung der meldenden Person aus `app.evenings` (RLS: nur eigene Abende) und
gibt sie als `p_reported_user` an `api.report`. Nur so greift die vorläufige Sperre bei Null-Toleranz.

## Lokal ausprobieren

Arbeitskopie mit eigenem Stapel (Slot 2: App 3241, Gateway 54545, Mailpit 54547, stripe-mock 54583):

```bash
STACK_SLOT=2 bash apps/web/scripts/stack.sh up      # Postgres, GoTrue, PostgREST, Mailpit, Functions, Gateway, stripe-mock
STACK_SLOT=2 bash apps/web/scripts/serve-e2e.sh     # baut und startet die App auf http://localhost:3241
```

`stack.sh` startet jetzt zusätzlich **stripe/stripe-mock** (Port 54383 + 100 × Slot) und schreibt in `.stack/env`:
`SUPABASE_JWT_SECRET` (die `billing-*`-Functions prüfen damit die Anmeldung, HS256 wie GoTrue lokal),
`FERMATA_FUNCTIONS_URL`, `STRIPE_SECRET_KEY=sk_test_fermatalocal`, `STRIPE_API_BASE` (stripe-mock),
`STRIPE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_fermatalocal` und `VENUE_LINK_SECRET`.
stripe-mock akzeptiert nur Schlüssel der Form `sk_test_<Buchstaben/Ziffern>` (kein zweiter Unterstrich).

Ausprobieren (nach dem Anlegen eines Mitglieds wie in [`web.md`](web.md#lokal-starten)):

- **Bestellung:** `/mitgliedschaft` → „Andante wählen“. Im Browser lädt die Seite das echte Stripe.js von js.stripe.com;
  mit dem Platzhalter-Schlüssel zeigt das Payment Element einen Fehler. Für einen Durchlauf ohne Stripe.js:
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=` leer lassen – dann erscheint „Zahlungen sind in dieser Umgebung nicht
  eingerichtet“ und die Bestellung geht ohne Zahlung an `billing-checkout` (stripe-mock). Die E2E-Tests ersetzen
  Stripe.js durch ein kleines Testskript (`tests/e2e/helpers/ui-b.ts`, `fakeStripe`).
- **Mitgliedschaft aktiv schalten** (statt Stripe-Webhook):
  `select billing.apply_invoice_paid('<sub>', '<cus>', 'in_test', app.now(), app.now() + interval '28 days', 14900, null, null, '<user>')`
  – oder `activeMembership()` aus `tests/e2e/helpers/ui-b.ts`.
- **Kündigen/Widerrufen ohne Anmeldung:** Die Mails der Functions landen lokal in `ops.mail_outbox` (nicht in Mailpit,
  das bekommt nur die Anmelde-Mails von GoTrue): `select text from ops.mail_outbox where template like 'billing.%_link' order by id desc limit 1`.
- **Abend für Teilen/Check-in/Lokal:** `confirmedEvening()` in `tests/e2e/helpers/ui-b.ts` (Lokal, Paar, Platz, Abend,
  `request_time` + `confirm`; die Reservierung entsteht dabei). Lokal-Link: `venueToken(reservationId)`.

Aufräumen: `STACK_SLOT=2 bash apps/web/scripts/stack.sh down`.

## Tests

| Was | Befehl | Stand 03.10.2026 |
|---|---|---|
| Unit (Vitest) | `pnpm --filter @fermata/web test` | 39 Tests grün (neu: `lib/ui-b.test.ts` 12, `lib/markdown-extra.test.tsx` 3) |
| E2E (Playwright, axe, CSP) | Stapel + `serve-e2e.sh`, dann `pnpm --filter @fermata/web test:e2e -- tests/e2e/mitgliedschaft.spec.ts tests/e2e/sicherheit.spec.ts tests/e2e/public-pages.spec.ts` | 15 neue Abläufe grün; ganze Suite 30 grün |
| Bildschirmfotos | `pnpm --filter @fermata/web exec playwright test --project=screenshots tests/e2e/sicherheit-screenshots.spec.ts` | 74 Bilder in `docs/screenshots/web/ui-b/` |
| Typen, Lint, Build, Tonalität, Kontraste | `pnpm --filter @fermata/web typecheck`, `… lint`, `… build`, `pnpm checks` | grün |

Abgedeckt (jede Seite mit axe WCAG 2.1 AA und Prüfung auf CSP-Verstöße):

- **Mitgliedschaft:** Stufen mit Preisen, USt-Hinweis, nicht buchbare Loge; CSP der Bestellseite mit Stripe, der
  Übersicht ohne; Pflichtangaben der Übersicht; Payment Element im Modus `subscription` mit Betrag und Währung;
  Knopf mit genauem Wortlaut; ohne Häkchen gesperrt (`aria-disabled`, Klick zeigt Hinweis, keine Bestellung);
  mit Häkchen Bestellung über `billing-checkout` gegen stripe-mock, Ergebnis, Vertragszeile mit Knopftext, Mail;
  Fehler im Zahlungsfeld blockiert; Rücksprung „fehlgeschlagen“; Kündigen angemeldet (vorausgefüllt, außerordentlich
  ohne Grund abgelehnt, Eingang mit Sekunden, Mail, „bereits gekündigt“); Kündigen ohne Anmeldung (Fußlink,
  Pflichtfelder, gleiche Antwort bei falschen Angaben ohne Mail, Link aus der Mail, erst der Knopf führt aus,
  angemeldet Weiterleitung); Widerruf angemeldet (Berechnung, falsche Vertragsnummer am Feld, Eingang, Mail) und
  ohne Anmeldung (Link).
- **Sicherheit:** Melden aus einem Abend (Gegenüber, Null-Toleranz-Hinweis, Pflicht „Art“, Bestätigung, Datenbank:
  gemeldete Person, Beziehung, Stufe), eigene Meldungen; ReportButton-Dialog im Check-in (betrifft „etwas anderes“,
  ohne Rückfrage) und Drossel nach 5 Meldungen; Widerspruch (zu kurz, eingegangen, nur einmal), `/konto/sicherheit`;
  Abend teilen (Link mit `#t=`, Kopieren, öffentliche Seite ohne Gegenüber und Nachnamen, `noindex`, `no-referrer`,
  Zurückziehen → ungültig); Check-in „Hilfe“ (110 groß und fokussiert, 112, Heimwegtelefon, Hinweis „akut“ in der
  Datenbank, `check-in`-Weiterleitung, fremder Abend); Hilfe-Seite mit allen Nummern.
- **Öffentlich:** Rechtstexte mit ENTWURF, Widerrufsbelehrung, Verträge in Fuß und Übersicht, 404; Lokal-Bestätigung
  (Öffnen bestätigt nichts, Knopf bestätigt, Datenbank, ungültiger und fehlender Link); `/teilen` ohne gültigen Link,
  strenge CSP ohne Rahmen.

## Stripe und CSP

- **Stripe.js** kommt aus `@stripe/stripe-js/pure` (9.17.0) und wird erst auf der Bestellseite geladen,
  `advancedFraudSignals: false` (keine zusätzlichen Gerätedaten an Stripe).
- **Payment Element** mit „deferred intent“: `elements({mode: "subscription", amount, currency, locale: "de"})`,
  Farben aus den Tokens (hell/dunkel). Klick: `elements.submit()` → Server Action `orderMembership` →
  `billing-checkout` (`action: "order"`, `start_request: true`, `requestId` je Klick) → `stripe.confirmPayment({redirect: "if_required", return_url: …/ergebnis})`.
- **CSP nur auf `/mitgliedschaft/bestellen/*`** (`lib/routes.ts` `isStripePath`, `src/proxy.ts`, `lib/csp.ts` `STRIPE_CSP`):
  `script-src … https://js.stripe.com https://*.js.stripe.com`, `frame-src https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com`,
  `connect-src … https://api.stripe.com`, `img-src … https://*.stripe.com`. Alle anderen Seiten behalten
  `frame-src 'none'` und keine fremden Ziele (geprüft in `public.spec.ts`, `public-pages.spec.ts`, `lib/ui-b.test.ts`).
  Weil die CSP am Dokument hängt, führen alle Links zur Bestellseite als normaler Link (ganzer Seitenaufruf) dorthin.
- **Permissions-Policy** bleibt `payment=()` (next.config.ts): Karten gehen, **Apple Pay / Google Pay nicht**. Wenn
  gewünscht: auf der Bestellseite `payment=(self "https://js.stripe.com")` setzen (Frage an Benn).
- **Lokal/Test:** Server gegen **stripe-mock** (liefert ein leeres `client_secret`; dann überspringt die Seite
  `confirmPayment` und zeigt das Ergebnis „eingegangen“), Browser mit Ersatz-Stripe.js. Der echte Ablauf mit
  3-D Secure ist **nicht** automatisch getestet.

## Verträge mit der Härtung

**Gegen die Härtung geprüft:** Der Integrationszweig (`claude/dating-app-build-0uszhn`, Stand 03.10.2026 mit der
zusammengeführten Härtung) wurde nur lesend nach `scratchpad/integ` ausgepackt (`git archive`), sein Stapel auf Slot 2
gestartet (Datenbank und Functions der Härtung, Web-App aus diesem Zweig). Ergebnis: alle 16 eigenen E2E-Abläufe und
die ganze Suite (31) grün, Bildschirmfotos aus diesem Lauf. Die Spalte rechts sagt, was **ohne** die Härtung (in
dieser Arbeitskopie) geprüft ist.

| Vertrag | So gebaut | In dieser Arbeitskopie geprüft? |
|---|---|---|
| 1. `api.billing_order_summary` liefert `start_request_text` und `withdrawal_policy_url`; `billing-checkout` verlangt `start_request: true` (sonst 422 `start_request_required`) | Häkchen zeigt `start_request_text`; fehlt er, ein eigener ENTWURF-Text (`copy/mitgliedschaft.ts` `startRequestFallback`). Link zur Belehrung aus `withdrawal_policy_url` (nur eigene Adressen), sonst `/rechtliches/widerruf`. Die Bestellung schickt immer `start_request: true`; `start_request_required` hat einen eigenen Text. | **Nein** – beide Felder fehlen hier noch; getestet mit dem Ersatztext. Der Hash der Übersicht kommt immer aus derselben Funktion, ändert sich also mit den neuen Feldern konsistent. |
| 2. `trust-view` und `venue-confirm` antworten mit JSON bei `Accept: application/json` (Schlüssel als `t` oder im JSON-Körper; POST bestätigt) | `/teilen` und `/lokal/bestaetigen` lesen den Schlüssel aus `#t=` (für alte Links auch `?t=`) und rufen die Functions über Server Actions (kein CORS, Schlüssel nicht in Adresszeilen der Web-App). `venue-confirm`: GET mit `?t=` und `Accept: application/json`; POST mit `{t}` im JSON-Körper. Liefert die Function HTML (heutige Fassung), zeigt die Seite „Einzelheiten stehen in der E-Mail“ und bestätigt als Formular (`t=` im Körper und in der Adresse). | `trust-view`: **ja** (JSON gibt es schon). `venue-confirm`: nur der **Ersatzweg** (HTML); die JSON-Auswertung ist per Unit-Test geprüft (`asReservation`, Felder wie `ops.venue_reservation_summary`, auch unter `reservation`/`summary`). Der E2E-Test schaltet automatisch auf die JSON-Prüfung (Tisch-Code sichtbar), sobald die Function JSON liefert. |
| 3. `/rechtliches/[kind]` rendert `api.legal_document(kind)` mit ENTWURF-Banner | Banner bei Status `entwurf` **und** wenn der Text fehlt. Markdown ohne HTML, jetzt mit Zitat, Tabelle, Trennlinie, `####` und Links nur zu `https:`, `http:`, `mailto:`, `tel:` und eigenen Adressen (für die Texte aus `docs/recht/`). | `agb`, `ki_hinweis` ja. `impressum`, `datenschutz`, `widerruf` stehen hier noch nicht in `ops.legal_documents` → Seite zeigt ENTWURF und „Der Text wird gerade rechtlich geprüft …“. |
| Mail-Links | `/konto/mitgliedschaft` → `/mitgliedschaft`, `/konto/sicherheit` → `/sicherheit/sanktionen`, `/abende/<id>/check-in` → `…/checkin` | ja |
| Link „Abend teilen“ | Die Web-App baut den Link immer selbst als `<Adresse der App>/teilen#t=<Schlüssel>`. Die `url` aus `create_trust_share` (`safety.trust_view_base_url`, mit der Härtung `site.app_url` + `/teilen#t=`) wird nicht übernommen: lokal zeigt sie auf den Platzhalter `app.fermata.example`. | ja |

## Was noch echt geprüft werden muss

- **Stripe Testmodus** mit echtem Konto: Payment Element (Karte, SEPA), 3-D Secure (Rücksprung auf
  `/mitgliedschaft/bestellen/ergebnis`), Webhook `invoice.paid` → Status „aktiv“, abgelehnte Karte (`4000 0000 0000 0002`),
  Erstattung beim Widerruf. Dafür `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (Vercel) und `STRIPE_*` (Functions) setzen.
- **CSP mit echtem Stripe.js** im Browser (die Tests laden ein Ersatzskript): auf Verstöße in der Konsole achten;
  Stripe kann weitere Ziele brauchen (z. B. `m.stripe.network`, wenn „advanced fraud signals“ an sind).
- **Geräte:** `tel:`-Links und „Teilen …“ (Web Share) auf iPhone und Android, Kopieren in der installierten App,
  Check-in-Link aus der Mitteilung auf dem Sperrbildschirm.
- **Lokal-Link** aus der echten Reservierungs-Mail, sobald `notify-dispatch` auf `/lokal/bestaetigen#t=` verlinkt.

## Für den Anwalt: Prüfpunkte

1. **Bestellknopf** (§ 312j Abs. 3 BGB): Wortlaut „Mitgliedschaft zahlungspflichtig abschließen“; alle Pflichtangaben
   stehen unmittelbar vor dem Knopf (Übersicht links bzw. oben, Knopf rechts bzw. unten). Reicht die Anordnung auf
   Desktop (zwei Spalten)?
2. **Häkchen „vorzeitiger Beginn“** (§ 356 Abs. 4/§ 357a BGB): Text kommt von der Härtung; bis dahin eigener ENTWURF.
   Pflicht vor dem Knopf; ohne Häkchen ist der Knopf gesperrt.
3. **Kündigungsknopf** (§ 312k BGB): Einstieg „Verträge hier kündigen“ auf `/mitgliedschaft` und im Fuß jeder Seite;
   Bestätigungsseite mit Angaben und Knopf „Jetzt kündigen“ (beides auf **einer** Seite, ohne Zwischenschritt);
   Eingangsbestätigung auf der Seite (mit Sekunden und Zeitzone, druckbar) und per Mail. Ohne Anmeldung: Eingang =
   Zeitpunkt des Formulars, danach Bestätigungslink – ist der zusätzliche Link zulässig? (siehe `mitgliedschaft.md`).
4. **Widerrufsbutton** (§ 356a BGB): „Vertrag widerrufen“ während der Frist auf `/mitgliedschaft` und im Fuß;
   Schritt 1 Name, Vertrag, Kontaktweg; Schritt 2 „Widerruf bestätigen“. Der Fußlink ist **immer** sichtbar (auch nach
   der Frist): Angemeldet erklärt die Seite dann, dass die Frist abgelaufen ist; ohne Anmeldung kommt in dem Fall
   keine Mail (gleiche Antwort für alle). Wertersatz-Berechnung angemeldet sichtbar vor dem Knopf.
5. **Widerrufsbelehrung** unter `/rechtliches/widerruf` (Text aus `docs/recht/widerrufsbelehrung.md` muss noch in
   `ops.legal_documents`).
6. Meldungen: Texte zur Null-Toleranz und zur vorläufigen Sperre; Hinweis „Die gemeldete Person erfährt nie, wer
   gemeldet hat“.

## Entscheidungen

| Thema | Entscheidung | Grund |
|---|---|---|
| Gruppe der Wege | `(member)` statt `(app)` | So heißt die Gruppe im Repo; gleiche Shell und gleicher Schutz. |
| Kündigen/Widerrufen in zwei Schritten | Angaben und Bestätigungsknopf auf einer Seite (als „Schritt 1/2“ gekennzeichnet) | Gesetz: Einstiegsknopf → Bestätigungsseite mit Knopf; ein zusätzlicher „Weiter“-Klick wäre eine Hürde. |
| Gesperrter Bestellknopf | `aria-disabled` statt `disabled` | bleibt fokussierbar; ein Klick erklärt, was fehlt, und setzt den Fokus auf das Häkchen. |
| Kein `revalidatePath` nach Kündigung/Widerruf/Bestellung | Seiten laden bei jedem Aufruf neu | sonst würde die Eingangsbestätigung sofort durch „bereits gekündigt“ ersetzt. |
| Zeitpunkt ohne Anmeldung | „Abgeschickt am … um … Uhr“ = Zeit der Server-Antwort | `request` antwortet bewusst ohne Zeitstempel (niemand soll erfahren, ob es den Vertrag gibt). |
| Öffentliche Seiten | Schlüssel im Fragment, Abruf per Server Action | kein CORS, keine Schlüssel in Protokollen der Web-App; CSP bleibt streng. |
| Hilfe bei „Ich brauche Hilfe“ | Nummern erscheinen sofort im Browser, unabhängig von der Antwort des Servers | bei Netzproblemen darf die Hilfe nicht fehlen. |
| „Advanced fraud signals“ | aus | Grundsatz „auf Nummer sicher“; Benn kann es für Radar einschalten (dann CSP prüfen). |

## Offene Punkte

| # | Punkt | Stand |
|---|---|---|
| 1 | Härtung (`start_request_text` wörtlich als Häkchen, `start_request: true`, `withdrawal_policy_url`, JSON von `trust-view` und `venue-confirm`, Rechtstexte in der Datenbank) | gegen den Integrationszweig geprüft (siehe oben); nach dem Zusammenführen die E2E einmal auf dem gemeinsamen Stand laufen lassen |
| 2 | `site.app_url` ist ein Platzhalter (`app.fermata.example`) | vor dem Start setzen (Links in Mails); die Seite „Abend teilen“ hängt nicht davon ab |
| 3 | Bestätigungslink für Kündigen/Widerrufen ohne Anmeldung zeigt auf die Seite der Function (schlichtes HTML) | Option: eigene Seite in der Web-App (`/kuendigen/bestaetigen#t=`), dann `contract.ts` anpassen |
| 4 | Apple Pay / Google Pay | `payment=()` in der Permissions-Policy, siehe oben |
| 5 | `billing.contract_actions` wird direkt gelesen (RLS, eigene Zeilen), weil `api.billing_overview()` keinen Verlauf hat | nimmt `history` aus der Übersicht, sobald es das gibt |
| 6 | Die Kennung des Gegenübers für Meldungen liest der Server aus `app.evenings` (RLS); wenn die Härtung das Leserecht entzieht, gehen Meldungen ohne gemeldete Person ein (keine automatische Sperre) | Vorschlag: `api.report` leitet das Gegenüber selbst aus `p_evening_id` ab (`p_about_counterpart boolean`) |
| 7 | Alte Platzhalter-Texte `placeholders(f).mitgliedschaft` in `copy/member.ts` werden nicht mehr benutzt | beim Zusammenführen entfernen |

## Geänderte gemeinsame Dateien

- `apps/web/src/proxy.ts`, `src/lib/csp.ts`, `src/lib/routes.ts`: Stripe-CSP nur auf der Bestellseite, `/sicherheit` als geschützter Weg.
- `apps/web/src/components/shell/Footer.tsx`: Widerrufsbelehrung, „Verträge hier kündigen“, „Vertrag widerrufen“.
- `apps/web/src/app/(member)/layout.tsx`: Link zu „Hinweise und Widerspruch“ im Sperr-Hinweis.
- `apps/web/src/components/ui/Dialog.tsx`: optionale `className`.
- `apps/web/src/lib/markdown.tsx` (+ `markdown.css`): Zitat, Tabelle, Trennlinie, `####`, Code, sichere Links.
- `apps/web/src/copy/help.ts`: Texte für Hilfe und Rechtliches nach `copy/sicherheit.ts` und `copy/rechtliches.ts` verschoben.
- `apps/web/scripts/stack.sh`: stripe-mock und Variablen (siehe oben). `apps/web/.env.example`: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
- `apps/web/package.json`, `pnpm-lock.yaml`: `@stripe/stripe-js` 9.17.0.
- Neue Wege unter `(member)/konto/mitgliedschaft`, `(member)/konto/sicherheit` und `(member)/abende/[id]/check-in` (nur Weiterleitungen).
