# Mitgliedschaft und Zahlung (M6)

Stand: 03.10.2026 · Bereich: Backend und API (Datenbank, Edge Functions). Die Oberfläche baut eine spätere Welle auf dieser Schnittstelle.
Alle Rechtstexte und rechtlichen Abläufe hier sind **ENTWURF** und müssen vom Anwalt geprüft werden.

---

## 1. Die Regeln in einfachen Worten

- **Gratisphase:** Bis einschließlich zum ersten Abend ist Fermata kostenlos, ohne Karte. Jede Person bekommt beim Anlegen des Kontos einen Gratis-Abend. Die Gratisphase endet, sobald der erste Abend stattgefunden hat – oder wenn die Person selbst kurzfristig absagt oder nicht erscheint. Sagt das Gegenüber ab, läuft die Gratisphase weiter.
- **Danach** gibt es neue Vorschläge nur mit einer laufenden Mitgliedschaft und einem freien Abend im Kontingent.
- **Stufen** (je 4 Wochen, Preise aus den Einstellungen): Auftakt 49 € / 1 Abend, Andante 149 € / 2 Abende, Loge 299 € / 4 Abende. Die Loge ist erst buchbar, wenn `billing.loge_in_test_phase` an ist; dann höchstens `billing.loge_test_phase_evenings` (2) Abende.
- **Kontingent:** Jede Zuteilung, Bindung, Rückgabe, Nutzung und jeder Verfall steht als Zeile im Kontingent-Buch. Verfügbare Abende sind die Summe. Ein Abend wird beim Bestätigen gebunden; das Buch wird nie negativ – ohne freien Abend lehnt die Datenbank die Bestätigung ab.
- **Absagen:** Früh absagen kostet nichts (beide bekommen den Abend zurück). Wer kurzfristig absagt (innerhalb von `evening.late_cancel_hours`, 24 h) oder nicht erscheint, verbraucht den Abend; das Gegenüber bekommt ihn zurück.
- **Verlängerungsregel:** Kommt in einem Zeitraum kein Abend zustande und liegt das nicht an der Person, verlängert sich der Zeitraum ohne Zahlung um 4 Wochen; die übrigen Abende bleiben erhalten.
- **Kündigen** geht jederzeit zum Ende des laufenden Zeitraums, mit zwei Schritten („Verträge hier kündigen“ → „Jetzt kündigen“), auch ohne Anmeldung.
- **Widerruf** geht 14 Tage ab Bestellung, mit zwei Schritten („Vertrag widerrufen“ → „Widerruf bestätigen“). Die Mitgliedschaft endet sofort; für bereits genutzte Abende wird Wertersatz berechnet, der Rest erstattet.
- **Jede Erklärung** (Bestellung, Kündigung, Widerruf) wird mit Zeitpunkt gespeichert und sofort per Mail mit Datum und Uhrzeit bestätigt (dauerhafter Datenträger).

---

## 2. Kontingent-Buch

### 2.1 Töpfe

`billing.evening_ledger` bleibt eine Tabelle, die nur angehängt wird. Neu ist die Spalte `source_entry_id`:

- **Topf:** jede positive Zeile ohne `source_entry_id` – Gratis-Abend (`free_grant`, verfällt nicht), Zuteilung (`period_grant`, verfällt am Ende des Zeitraums), Gutschrift (`credit`, verfällt nach `evening.credit_validity_months`), Admin-Gutschrift (`adjust`).
- **Bewegung:** jede Zeile mit `source_entry_id` bezieht sich auf genau einen Topf (Bindung −1, Rückgabe +1, Nutzung −1, Verfall −n).
- **Verfügbar** = Summe der Reste aller nicht verfallenen Töpfe (plus negative Pauschalbuchungen ohne Topf, die es nur aus Altbeständen geben kann).
- Gebunden wird zuerst der **Gratis-Abend** (der erste Abend ist immer der kostenlose, auch wenn schon bestellt wurde), danach der Topf, der **zuerst verfällt**.

Grund: Mit einer einfachen Summe würden Abende, die aus einem später verfallenen Zeitraum stammen, doppelt abgezogen. `billing.available_evenings(uuid)` hat deshalb eine neue Fassung mit gleicher Signatur.

### 2.2 Regeln je Zustandswechsel

Die Regeln hängen als Trigger an `app.evening_events` (jede Zeile = ein Wechsel über `app.evening_transition()`), nicht an `app.evenings`. So ist der Auslöser (`actor`) bekannt, zum Beispiel wer kurzfristig abgesagt hat. Ein Fehler im Trigger bricht den ganzen Wechsel ab.

| Wechsel (Ereignis → Zustand) | Person | Buchung | Gratisphase |
|---|---|---|---|
| `confirm` → `confirmed` | beide | `reserve` −1 (aus dem zuerst verfallenden Topf). **Kein Abend frei oder gesperrt → Fehler, Wechsel abgelehnt** | – |
| `cancel_early` / `cancel_admin` → `cancelled_early` | beide | `release` +1 (in denselben Topf; ist der Topf inzwischen verfallen: zusätzlich `credit` +1 mit neuer Gültigkeit) | – |
| `cancel_late` → `cancelled_late` | absagende Person | `release` +1 und `use` −1 (Umwandlung, unterm Strich bleibt −1) | endet |
| | Gegenüber | `release` +1; `credit` +1, wenn `billing.credit_on_counterpart_late_cancel` | läuft weiter |
| | niemand bestimmbar | beide `release` +1 | – |
| `no_show` → `no_show` | nicht erschienen | `release` +1 und `use` −1 | endet |
| | anwesend | `release` +1; `credit` +1, wenn `billing.credit_on_counterpart_no_show` (Frage B9) | läuft weiter |
| | beide nicht erschienen (keine Angabe) | beide `use` | endet für beide |
| `happened` → `happened` | beide | `release` +1 und `use` −1 | endet |
| `decline`, `lapse`, `cancel_admin` vor der Bestätigung | – | nichts (es war nichts gebunden) | – |

Weitere Buchungen:

- **Gratisphase endet:** Ein übriger Gratis-Abend verfällt (`expire`, „Gratisphase beendet“). Gutschriften bleiben.
- **Zeitraum endet:** Die Zuteilung verfällt automatisch (zählt nicht mehr). `billing.expire_ledger()` schreibt stündlich sichtbare `expire`-Zeilen; der Bestand ändert sich dadurch nicht.
- **Kündigung wirksam / Abo gelöscht / Widerruf:** übrige Zuteilungen verfallen sofort.
- **Verlängerung:** Rest der Zuteilung wird in einen neuen Topf mit späterem Verfall übertragen (`expire` −n, `period_grant` +n).
- **Admin-Korrektur:** `api.admin_ledger_adjust` (+n als eigener Topf, −n je Abend aus einem Topf; nie unter 0).

### 2.3 Wer bekommt Vorschläge? (für M4)

`billing.can_receive_proposal(uuid) → boolean` und mit Grund `billing.proposal_eligibility(uuid) → jsonb`:

1. nicht gesperrt (`safety.is_suspended`), Konto nicht `suspended`, `closed` oder `paused`;
2. Mitgliedschaftszeile vorhanden (sonst `no_membership_row`);
3. Gratisphase nicht beendet **oder** Mitgliedschaft `active` bzw. `cancelled` mit `cancel_at` in der Zukunft (`past_due` bekommt keine neuen Vorschläge);
4. verfügbare Abende minus offene, noch unbestätigte Vorschläge ≥ 1 (Gründe `open_proposal`, `no_evening_available`).

---

## 3. Bestellung (PLAN 2.3 Nr. 7)

Ablauf (Stripe „Payment Element“ mit späterem Intent):

1. Web-App ruft `billing-checkout` mit `action: "summary"` auf und zeigt die **Bestellübersicht**: Stufe, Preis mit USt-Hinweis, 4 Wochen, Abende je Zeitraum, automatische Verlängerung, Kündigungsbedingungen, Widerrufshinweis, Verlängerungsregel (alle Texte als ENTWURF in den Einstellungen).
2. Darunter das Stripe Payment Element im Modus `subscription` (ohne Client-Geheimnis, Betrag und Währung aus der Antwort).
3. Knopf **„Mitgliedschaft zahlungspflichtig abschließen“** (fester Wortlaut, `LABELS.orderButton`, auch in `api.billing_overview().order_button_label`).
4. Klick → `billing-checkout` mit `action: "order"` und dem `summaryHash` der gezeigten Übersicht: Stripe-Kunde anlegen oder wiederverwenden (nur E-Mail und interne ID), Abo mit `payment_behavior=default_incomplete` anlegen, Bestellung als `contract_actions` `order` mit der gezeigten Übersicht, ihrem Hash und dem Knopftext speichern, Eingangsbestätigung per Mail. Antwort: `clientSecret`.
5. Web-App ruft `stripe.confirmPayment()` auf. Bezahlt → Webhook `invoice.paid` → Zeitraum und Zuteilung, Status `active`, Mail „Mitgliedschaft ist aktiv“.

Hat sich die Übersicht seit dem Anzeigen geändert (z. B. Preis), lehnt der Server mit `summary_changed` ab. Eine noch nicht bezahlte frühere Bestellung wird ersetzt.

**Status der Mitgliedschaft:** `free` → `pending` (bestellt, noch nicht bezahlt) → `active` → `cancelled` (gekündigt, läuft bis `cancel_at`) → `ended`. Daneben `past_due` (Zahlung fehlgeschlagen) und `withdrawn` (widerrufen). Läuft eine erste Zahlung ab (`incomplete_expired`), geht es zurück auf `free`.

---

## 4. Stripe-Webhook

Endpunkt: `https://<projekt>.supabase.co/functions/v1/stripe-webhook` (ohne Supabase-JWT-Prüfung deployen).

- Signatur selbst geprüft (WebCrypto): HMAC-SHA256 über `"<t>.<Rohtext>"` mit `STRIPE_WEBHOOK_SECRET`, alle `v1`-Werte, Vergleich in konstanter Zeit, Toleranz 5 Minuten. Ungeprüfte Ereignisse werden nicht gespeichert.
- Idempotent: `billing.stripe_events` (Schlüssel = Ereignis-ID); Verarbeitung in einer Transaktion mit Sperre je Ereignis; Zeiträume zusätzlich eindeutig je Rechnung.
- Gespeichert wird das Ereignis **ohne** Karten-, Adress-, Telefon- und Namensfelder.
- Ausgewertet: `invoice.paid` (Zeitraum + Zuteilung; Rechnungen über 0 € – z. B. bei der Verlängerung – legen keinen Zeitraum an), `invoice.payment_failed` (`past_due`, Mail beim ersten Fehlschlag je Rechnung mit Link zur Stripe-Rechnungsseite), `customer.subscription.created/updated/deleted` (Status, Kündigung zum Periodenende, Ende). Alles andere wird nur gespeichert.
- Fehler bei der Verarbeitung → Antwort 500, Stripe stellt erneut zu.

---

## 5. Verlängerungsregel (Frage B12)

- **Platzhalter-Definition „kein Abend“:** Im Zeitraum fand kein Abend statt, kein bestätigter Abend steht mehr an, und es gab kein Ereignis, das der Person zugerechnet wird. Zugerechnet werden laut `billing.extension_attributable_events`: eigene Ablehnung (`decline`), eigene frühe oder kurzfristige Absage, eigenes Nichterscheinen, eine Frist, die die Person selbst verstreichen ließ (`lapse`). Absagen und Fristversäumnisse des Gegenübers schließen die Verlängerung nicht aus.
- **Wann:** `billing.apply_extension_rule()` läuft stündlich (pg_cron) und prüft Zeiträume `billing.extension_lead_hours` (6 h) vor ihrem Ende – vorher, weil Stripe am Ende abbucht.
- **Was:** Ende + `billing.extension_days` (28), höchstens `billing.extension_max_per_period` (1) Mal je Zeitraum. Übrige Abende werden mitverlängert. Bei gekündigter Mitgliedschaft verschiebt sich auch das Kündigungsdatum.
- **Stripe-Seite:** `billing-extend` setzt am Abo `trial_end` auf das neue Ende mit `proration_behavior=none`. Stripe beendet damit den laufenden Abrechnungszeitraum und startet eine kostenlose Phase bis `trial_end`; danach wird normal abgebucht. Quelle: https://docs.stripe.com/billing/subscriptions/billing-cycle (Abschnitt zu `trial_end`). Verworfen: `pause_collection` – der Zeitraum läuft dabei weiter, nur die Rechnung wird nicht eingezogen; das ist schwerer nachvollziehbar.
- Danach Mail „Ihr Zeitraum wurde verlängert“. Fehlschläge bei Stripe stehen in `membership_periods.stripe_sync_status = 'failed'` (`stripe_sync_error`).

---

## 6. Kündigungsknopf (§ 312k BGB) – ENTWURF

- **Angemeldet:** Einstieg „Verträge hier kündigen“ → **Schritt 1** (`billing-cancel`, `action: "preview"`): Vertrag (Vertragsnummer, Stufe), Name, E-Mail, Art (`ordentlich` / `ausserordentlich`, bei außerordentlich Pflichtfeld Grund), Kontaktweg für die Bestätigung, Zeitpunkt der Wirksamkeit → **Schritt 2** „Jetzt kündigen“ (`action: "confirm"`).
- Gespeichert wird zuerst die Erklärung (`contract_actions` `cancel` mit Eingangszeitpunkt), danach bei Stripe `cancel_at_period_end=true` gesetzt (bei noch nicht bezahlter Bestellung: sofortiges Ende). Schlägt Stripe fehl, gilt die Kündigung trotzdem; Benn bekommt einen Hinweis.
- Sofort danach Mail „Eingangsbestätigung Ihrer Kündigung“ mit Datum, Uhrzeit (Sekunden, Zeitzone), Vertrag, Art, Grund und Wirksamkeit an den angegebenen Kontaktweg.
- **Ohne Anmeldung:** Formular (E-Mail, Vertragsnummer, Art, Grund, Name) → `action: "request"`. Die Antwort ist immer gleich (niemand erfährt, ob es den Vertrag gibt). Passen die Angaben, geht eine Mail mit Link an die hinterlegte Adresse. Der Link öffnet eine Seite mit dem Knopf „Kündigung bestätigen“ (ein bloßes Öffnen, z. B. durch Link-Vorschau des Mailprogramms, führt nichts aus). **Als Eingang gilt der Zeitpunkt des Formulars.** Link gilt `billing.contract_link_hours` (24 h), einmal; höchstens `billing.contract_requests_per_hour` (3) Anfragen je Vertrag und Stunde.

## 7. Widerrufsbutton (§ 356a BGB, seit 19.06.2026) – ENTWURF

- Einstieg „Vertrag widerrufen“, verfügbar `billing.withdrawal_days` (14) Tage ab Bestellung.
- **Schritt 1** (`billing-withdraw`, `action: "preview"`): Name, Vertrag (Vertragsnummer) und Kontaktweg angeben (vorausgefüllt), Berechnung sichtbar. **Schritt 2** „Widerruf bestätigen“ (`action: "confirm"`).
- Danach sofort: Erklärung speichern (`contract_actions` `withdraw`), offene und bevorstehende Abende absagen (Gegenüber bekommt eine neutrale Mail und den Abend zurück), übrige Abende verfallen, Abo bei Stripe sofort beenden, Erstattung über Stripe (`/v1/refunds`, Zahlung aus der Rechnung), **Eingangsbestätigung per Mail mit Datum und Uhrzeit**.
- **Wertersatz (Frage B13):** genutzte Abende aus Zuteilungen dieses Vertrags × Wert je Abend (`billing.withdrawal_value_per_evening_cents`: Auftakt 49,00 €, Andante 74,50 €, Loge 74,75 €), höchstens der bezahlte Betrag. Erstattung = bezahlt − Wertersatz. Gratis-Abend und Gutschriften zählen nicht. Kann Stripe nicht erstatten, steht `refund.status = 'manual'` im Ergebnis, die Mail sagt „wird von Hand bearbeitet“, Benn bekommt einen Hinweis.
- Ohne Anmeldung wie beim Kündigungsknopf (Formular → Link → Knopf „Widerruf bestätigen“).

---

## 8. Stripe einrichten (Testmodus)

1. Stripe-Konto im **Testmodus**. API-Version des Kontos ab `2025-03-31` (sonst `STRIPE_API_VERSION` setzen; der Code liest beide Formen).
2. **Produkte und Preise:** nichts von Hand nötig. `billing-checkout` sucht je Stufe einen Preis mit `lookup_key = fermata_<stufe>_<cent>_4w` und legt ihn sonst an (wiederkehrend `interval=week`, `interval_count=4`, EUR, `tax_behavior=inclusive` bei „inkl. USt“). Ändert sich ein Preis in den Einstellungen, entsteht ein neuer Preis; laufende Abos behalten ihren alten Preis. Wer feste Preise will: `STRIPE_PRICE_AUFTAKT`, `STRIPE_PRICE_ANDANTE`, `STRIPE_PRICE_LOGE`.
   *Begründung 4 Wochen:* `week × 4` statt `day × 28` (beides 28 Tage), weil Stripe dann auf Rechnungen und im Kundenportal „alle 4 Wochen“ anzeigt.
3. **Webhook:** Endpunkt `…/functions/v1/stripe-webhook`, Ereignisse `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Das Signatur-Geheimnis (`whsec_…`) als `STRIPE_WEBHOOK_SECRET` hinterlegen.
4. **Umgebungsvariablen der Edge Functions:**

| Variable | Zweck |
|---|---|
| `STRIPE_SECRET_KEY` | geheimer Schlüssel (`sk_test_…`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook-Signatur (`whsec_…`) |
| `STRIPE_PUBLISHABLE_KEY` | öffentlicher Schlüssel für das Payment Element (`pk_test_…`), wird in `billing-checkout` mitgeliefert |
| `STRIPE_API_VERSION` | optional, feste API-Version |
| `STRIPE_API_BASE` | nur Tests (stripe-mock) |
| `STRIPE_PRICE_<STUFE>` | optional, feste Preis-IDs |
| `SUPABASE_JWT_SECRET` oder `SUPABASE_URL` | Anmeldung prüfen (HS256 bzw. JWKS der neuen Supabase-Schlüssel) |
| `FERMATA_INTERNAL_SECRET` | Schutz für `billing-extend` und `safety-dispatch` (gleicher Wert im Vault als `fermata_internal_secret`) |
| `FERMATA_FUNCTIONS_URL` | öffentliche Adresse der Functions (für Bestätigungslinks ohne Anmeldung) |
| `FERMATA_APP_URL` | Adresse der Web-App (Links in Mails) |

5. **Aufrufe aus der Datenbank** (sofortiger Mailversand, Verlängerung): Erweiterung `pg_net` einschalten, Einstellung `internal.functions_base_url` setzen, Vault-Eintrag `fermata_internal_secret` anlegen. Ohne das laufen die Zeitpläne trotzdem; `billing-extend` dann stündlich per externem Cron aufrufen.
6. **Stripe-Kundenportal** ist nicht nötig (Kündigen und Widerrufen laufen über Fermata).

**Tests lokal:** `docker run -d -p 54383:12111 stripe/stripe-mock`; die Deno-Tests für `billing-checkout` nutzen stripe-mock, wenn erreichbar, sonst einen Ersatz.

---

## 9. Schnittstelle für die Oberfläche

Fehler aus SQL-Funktionen tragen einen deutschen Text (`message`) und einen festen Code (`hint`). Edge Functions antworten mit `{ "error": <hint>, "message": <Text> }` und HTTP-Status: `28000` → 401, `42501` → 403, `P0002` → 404, `22023` → 400, `P0001` (Regel verletzt) → 409.

### 9.1 RPC (PostgREST, Schema `api`)

| Funktion | Wer | Rückgabe | Fehler (`hint`) |
|---|---|---|---|
| `api.billing_overview()` | angemeldet | `{status, tier, tier_name, contract_number, ordered_at, cancel_at, cancelled_at, withdrawn_at, free_phase{active, ended_at}, current_period{starts_at, ends_at, extended_until, extended_by_rule, evenings_allowed}, available_evenings, reserved_evenings, can_receive_proposal, withdrawal{possible, until}, cancellation{possible, effective_at}, tiers[], vat_note, order_button_label, cancel_entry_label, withdraw_entry_label}` | `not_authenticated` |
| `api.billing_order_summary(p_tier)` | angemeldet | Bestellübersicht + `summary_hash` | `invalid_tier`, `tier_not_orderable` |
| `api.billing_tiers()` | alle | `[{key, name, price_cents, price_display, evenings, period_days, orderable, note, vat_note}]` | – |
| `api.admin_contract_actions(p_kind?, p_limit?)` | Admin (aal2) | Bestellungen, Kündigungen, Widerrufe mit Ergebnis | `admin_required` |
| `api.admin_ledger_adjust(p_user, p_amount, p_note, p_expires_at?)` | Admin (aal2) | ID der ersten Zeile | `invalid_input`, `would_be_negative` |

Direkt lesbar (RLS, nur eigene Zeilen): `billing.evening_ledger`, `billing.membership_periods`, `billing.contract_actions`, `billing.memberships` (ohne Stripe-Kennungen).

### 9.2 Edge Functions

**`billing-checkout`** (POST, `Authorization: Bearer <JWT>`)
- `{action: "summary", tier}` → `{summary, summaryHash, buttonLabel, publishableKey, payment: {mode: "subscription", amount, currency}}`
- `{action: "order", tier, summaryHash, requestId?}` (`requestId`: UUID je Klick, schützt vor Doppelklick) → `{subscriptionId, clientSecret, contractNumber, orderedAt, withdrawalUntil, confirmationSent, publishableKey}`
- Fehler: 401 `not_authenticated`, 400 `invalid_tier`, 409 `tier_not_orderable` / `summary_changed` / `already_member` / `suspended`, 502 `payment_provider_error`

**`billing-cancel`** (POST; GET nur für den Mail-Link)
- angemeldet `{action: "preview"}` → `{possible, reason, contract_number, tier, tier_name, status, effective_at, immediate, name, email, kinds, entryLabel, buttonLabel}`
- angemeldet `{action: "confirm", kind: "ordentlich"|"ausserordentlich", reason?, name?, contactEmail?}` → `{contractActionId, contractNumber, kind, receivedAt, effectiveAt, immediate, stripe: "ok"|"failed"|"skipped", confirmationSent}`; Fehler 409 `no_contract` / `already_cancelled`, 400 `reason_required` / `invalid_email`
- ohne Anmeldung `{action: "request", email, contractNumber, kind?, reason?, name?}` → immer 202 `{ok, message}`
- `GET ?t=` → Bestätigungsseite; `{action: "confirm_link", t}` (JSON oder Formular) → wie `confirm` bzw. HTML-Seite; 404 `invalid_link`

**`billing-withdraw`** (wie oben)
- `{action: "preview"}` → `{possible, reason, until, contractNumber, tierName, name, email, paidCents, eveningsUsed, valuePerEveningCents, wertersatzCents, refundCents, entryLabel, buttonLabel, legalStatus}`
- `{action: "confirm", name, contractNumber, contactEmail?}` → `{contractActionId, contractNumber, receivedAt, paidCents, eveningsUsed, wertersatzCents, refundCents, refund: "ok"|"manual"|"none", stripe, cancelledEvenings, confirmationSent}`; Fehler 400 `name_required` / `contract_required` / `contract_mismatch`, 409 `period_over` / `already_withdrawn` / `no_contract`
- `request`, `GET ?t=`, `confirm_link` wie beim Kündigen

**`billing-extend`**, **`safety-dispatch`**: intern, nur mit `x-fermata-internal-secret`.
**`stripe-webhook`**: nur Stripe.

Links in Mails erwarten diese Seiten der Web-App: `/konto/mitgliedschaft`, `/konto/sicherheit`, `/hilfe`, `/admin/sicherheit`.

### 9.3 Für andere Bereiche

- **M2 (Konto):** Beim Anlegen eines Kontos `billing.memberships` (Status `free`) **und** eine Zeile `free_grant` +1 schreiben. Ohne Mitgliedschaftszeile bucht das Kontingent nichts und die Person bekommt keine Vorschläge.
- **M4 (Auswahl):** `billing.can_receive_proposal(uuid)` (Recht für `fermata_matcher`), für den Bericht `billing.proposal_eligibility(uuid)`.
- **M5 (Abende):**
  - Vor `confirm` für **beide** `billing.assert_evening_available(uuid)` aufrufen (Fehler `no_evening_available` oder `suspended`). Der Trigger prüft zusätzlich selbst und bricht den Wechsel ab (`detail` = `self` oder `counterpart`).
  - `cancel_late` mit `p_actor` = absagende Person aufrufen (oder `evenings.cancelled_by` vorher setzen bzw. `details.cancelled_by` mitgeben).
  - `no_show` mit `details.no_show_user` (oder Spalte `no_show_user`); ohne Angabe gelten beide als nicht erschienen.
  - Absagen durch die Sicherheit kommen als `cancel_admin` mit `details.notify_by = 'safety'`: dafür bitte **keine** eigene Absage-Nachricht schicken (die Sicherheit schickt eine neutrale).

---

## 10. Platzhalter und offene Entscheidungen

| Punkt | Stand im Code | Einstellung |
|---|---|---|
| B8 Gültigkeit von Gutschriften | 3 Monate | `evening.credit_validity_months` |
| B9 Gutschrift bei Nichterscheinen des Gegenübers; Folgen wiederholten Nichterscheinens | aus; ab 2× Hinweis an Benn | `billing.credit_on_counterpart_no_show`, `safety.no_show_flag_threshold` |
| Gutschrift bei kurzfristiger Absage des Gegenübers | aus (Abend kommt zurück, keine Extra-Gutschrift) | `billing.credit_on_counterpart_late_cancel` |
| B11 Loge in der Testphase | aus; wenn an: höchstens 2 Abende, Preis bleibt 299 € (prüfen) | `billing.loge_in_test_phase`, `billing.loge_test_phase_evenings` |
| B12 Definition „kein Abend“ | siehe Abschnitt 5; einmal je Zeitraum | `billing.extension_attributable_events`, `billing.extension_max_per_period` |
| B13 Wertersatz | 49,00 / 74,50 / 74,75 € je genutztem Abend | `billing.withdrawal_value_per_evening_cents` |
| B14 Verbraucherschlichtung | nicht im Code; gehört in AGB/Impressum (M8) | – |
| B7 Erkennungsfoto | nicht im Code (Sicherheit, siehe sicherheit.md) | – |
| USt-Ausweis (A5) | Hinweis je `landing.vat_mode`; Stripe-Preis `inclusive` | `landing.vat_mode` |
| Laufzeit- und Kündigungstext, Widerrufshinweis | ENTWURF | `billing.cancellation_terms`, `billing.withdrawal_note` |
| Wortlaut „Vertrag widerrufen“ | ENTWURF, mit Anwalt prüfen | `LABELS.withdrawEntry` |
| Logged-out-Weg mit Bestätigungslink | Eingang = Zeitpunkt des Formulars; ob der zusätzliche Link zulässig ist, prüft der Anwalt | – |

---

## 11. Abweichungen vom PLAN und Entscheidungen

1. **Kontingent-Buch mit Töpfen** (`source_entry_id`) und neuer Fassung von `billing.available_evenings` (gleiche Signatur), weil sonst Verbrauch nach einem Verfall doppelt zählt.
2. **Trigger an `app.evening_events`** statt `AFTER UPDATE OF state` an `app.evenings`: nur dort ist bekannt, wer kurzfristig abgesagt hat.
3. **Kontingent-Regeln nur für Personen mit Mitgliedschaftszeile** (Grund: Kern-Tests und Altbestände ohne Zeile); ohne Zeile keine Vorschläge.
4. **Nutzung als Paar** `release` +1 / `use` −1: die Bindung wird sichtbar in eine Nutzung umgewandelt.
5. **Bestellung mit „Payment Element ohne Client-Geheimnis“:** Das Abo entsteht erst beim Klick auf den Bestellknopf. So gibt es keine verwaisten Abos, und der Klick ist genau der gespeicherte Bestellzeitpunkt.
6. **`cancelled` heißt „gekündigt, läuft bis `cancel_at`“**; danach `ended`. Eine noch nicht bezahlte Bestellung endet bei Kündigung sofort.
7. **`past_due`:** keine neuen Vorschläge, bestehende Abende bleiben.
8. **Bestellen in der Gratisphase** ist möglich; der erste Abend nutzt trotzdem den Gratis-Abend, die bezahlte Zuteilung bleibt voll erhalten.
9. **Verlängerung auch bei gekündigter Mitgliedschaft** (das Kündigungsdatum wandert mit); Prüfung 6 h vor Ende.
10. **Widerruf sagt offene Abende ab** (das Gegenüber bekommt den Abend zurück).
11. **Ausführung nach Speicherung:** Kündigung und Widerruf gelten mit dem Speichern; Stripe-Fehler werden nachgeholt (Hinweis an Benn), nicht dem Mitglied angelastet.
12. **Rechte gehärtet:** Postgres gibt neuen Funktionen das Ausführungsrecht für `PUBLIC`; schemaweite Standardrechte heben das nicht auf. Die Migrationen entziehen es für alle Funktionen in `billing` (und `safety`) und geben nur Benötigtes frei. Siehe auch Hinweis an den Kern unten.
13. Verträge bleiben bei Kontolöschung erhalten (`contract_actions.user_id` wird `null`), wegen Aufbewahrungspflichten (Löschkonzept M8).

**Hinweis an den Kern (nicht geändert, außerhalb dieses Bereichs):** Alle bisherigen Funktionen in `app`, `api`, `ops`, `private` haben ebenfalls `PUBLIC`-Ausführungsrecht. Beispiel: `app.evening_transition` ist für jede angemeldete Person aufrufbar, wenn das Schema `app` über PostgREST erreichbar ist, und prüft den Auslöser nur bei Teilnehmer-Ereignissen (`happened`, `cancel_admin`, `lapse` wären aufrufbar). Empfehlung: im Fundament einmal `revoke execute on all functions in schema … from public` und gezielt freigeben.

---

## 12. Einstellungen (neu in diesem Bereich)

`billing.withdrawal_days`, `billing.withdrawal_value_per_evening_cents`, `billing.credit_on_counterpart_late_cancel`, `billing.credit_on_counterpart_no_show`, `billing.extension_days`, `billing.extension_lead_hours`, `billing.extension_max_per_period`, `billing.extension_attributable_events`, `billing.contract_link_hours`, `billing.contract_requests_per_hour`, `billing.cancellation_terms`, `billing.withdrawal_note`, `internal.functions_base_url`.

Genutzt aus dem Fundament: `billing.period_days`, `billing.tiers`, `billing.loge_in_test_phase`, `billing.loge_test_phase_evenings`, `billing.free_until_first_evening`, `billing.extension_rule_enabled`, `billing.currency`, `evening.credit_validity_months`, `landing.vat_mode`.

## 13. Dateien und Tests

- Migrationen: `supabase/migrations/20261003000610_billing_ledger.sql`, `…620_billing_membership.sql`, `…630_billing_contract.sql`, `…640_billing_extension.sql`
- Edge Functions: `billing-checkout`, `billing-cancel`, `billing-withdraw`, `billing-extend`, `stripe-webhook`; gemeinsam `supabase/functions/_shared/stripe/*`; Mails `_shared/mail/templates/billing.ts`, `billing-format.ts`
- pgTAP: `600_billing_ledger` (Regeln, Gratisphase, Verfall, Ablehnung), `610_billing_membership` (Bestellung, Stripe-Ereignisse, Kündigung, Widerruf, Links ohne Anmeldung, Rechte), `620_billing_extension` (Verlängerungsregel mit Testuhr)
- Deno: `_shared/stripe/webhook.test.ts` (Signatur gültig/verändert/abgelaufen, Client, JWT), `stripe-webhook/handler.test.ts` (Idempotenz, Ereignisse, Datensparsamkeit), `billing-checkout/handler.test.ts` (gegen stripe-mock), `billing-cancel`, `billing-withdraw`, `billing-extend`, `_shared/mail/templates/billing.test.ts`

```bash
DB_PORT=54382 DB_CONTAINER=fermata-db-billing bash scripts/db.sh test
docker run -d --name fermata-stripe-mock -p 54383:12111 stripe/stripe-mock
cd supabase/functions && SUPABASE_DB_URL=postgres://postgres:postgres@localhost:54382/postgres \
  deno test --allow-env --allow-net --allow-read --allow-sys _shared/stripe _shared/mail/templates \
  billing-checkout billing-cancel billing-withdraw billing-extend stripe-webhook safety-dispatch trust-view
```
