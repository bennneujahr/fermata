# Abende (M5): Zeitenabfrage, Terminabstimmung, Lokale, Benachrichtigungen, Rückmeldung

Stand: 03.10.2026 · Bereich M5 (Backend und API, ohne Oberfläche) · Grundlage: PLAN.md 1 Nr. 7, 2.2, 2.3 Nr. 6, 2.4, 3.2 Nr. 10, 13, 14, 5.2, Fragen B6–B10.

## Kurz für dich, Benn

- Alles läuft in der Datenbank: Fristen, Reservierung, Erinnerungen, Ergebnis des Abends. Die Oberfläche ruft nur Funktionen auf (`api.*`).
- Jede Frist ist fest: **24 Stunden** für die Wunschzeit, **24 Stunden** für jede Antwort. Wer nicht antwortet, lässt den Vorschlag verfallen (`lapsed`).
- Nachrichten gehen per **E-Mail und Web-Push**. Läuft eine Frist, geht immer auch eine E-Mail raus. Push-Texte nennen nie Namen. Zwischen 22 und 8 Uhr kommt kein Push (außer dem Check-in); die Mail kommt trotzdem sofort.
- Das Lokal bekommt eine Reservierungs-Mail mit Datum, Uhrzeit, Name „Fermata“, 4-stelligem Tisch-Code und „2 Personen“ – nie Namen oder Kontaktdaten der Mitglieder. Es kann mit einem Klick bestätigen. Reserviert ein Lokal nur per Telefon, bekommst **du** die Mail und rufst an.
- Rückmeldung am nächsten Tag um 10:00. Kontaktdaten werden nur getauscht, wenn **beide** Ja sagen; ein Nein sieht niemand.
- Offene Entscheidungen von dir: B6 (Länge der Nachbesprechung), B7 (Erkennungsfoto), B9 (Folgen von Nichterscheinen), B10 (Lokal-Liste) und vier neue Platzhalter-Werte (Abschnitt 8).
- **Wichtiger Fund für den Kern:** Funktionen in Postgres sind standardmäßig für alle ausführbar; die Grundmigration kann das nicht verhindern. Für alle Abend-Funktionen habe ich es abgestellt, für den Rest des Kerns ist es noch offen (Abschnitt 10).

---

## 1. Der Ablauf als einfache Folge

1. **Zeitenabfrage** (alle `matching.rhythm_days` = 14 Tage): 10 Tage vor einem neuen Zeitraum, frühestens um 10:00 Uhr, legt der Job `ops.availability_tick()` den Zeitraum an und schreibt allen passenden Mitgliedern (aktiv, nicht pausiert, nicht gesperrt, Profil fertig): „Wann haben Sie Zeit?“. Die Abfrage ist 72 Stunden offen. 24 Stunden vor Schluss bekommen alle ohne Eintrag eine Erinnerung.
2. **Auswahl** (M4, nicht dieser Bereich): Der Auswahl-Job rechnet gemeinsame Fenster, du gibst frei, die Freigabe legt den Abend in `app.evenings` an (Zustand `proposed`, Lokal, bis zu drei Uhrzeiten).
3. **Vorschlag**: Ein Trigger startet sofort die 24-Stunden-Frist und schreibt beiden „Vorschlag für einen Abend“ (Lokal, „warum Sie beide“, Uhrzeiten, Frist). 4 Stunden vor Fristende kommt eine Erinnerung.
4. **Wunschzeit**: Eine der beiden Personen wählt 1–3 Uhrzeiten (vorgeschlagene oder eigene, die in die gemeinsamen freien Fenster passen und für die im Lokal ein Tisch frei ist) → `time_requested`. Jetzt hat die andere Person 24 Stunden.
5. **Antwort**: Die andere Person bestätigt eine der Zeiten → `confirmed`, oder schlägt eine Alternative vor → `time_countered` (wieder 24 Stunden für die erste Person). Höchstens 4 Runden; danach nur noch bestätigen oder ablehnen.
6. **Bestätigung**: Der Tisch wird in derselben Transaktion reserviert (Zeilensperre, `reserved < tables`). Ist kein Tisch mehr frei, scheitert die Bestätigung mit `no_table_free` und nichts ändert sich. Danach: Bestätigung an beide, Reservierungs-Mail ans Lokal, Erinnerungen 24 h und 2 h vorher, Check-in 30 Minuten nach Beginn, Rückmeldung am nächsten Tag um 10:00 Uhr (Europe/Berlin). Hat das Lokal nach 24 Stunden nicht bestätigt, bekommst du einen Hinweis.
7. **Absage** (nur bestätigte Abende, vor Beginn): bis genau 24 Stunden vorher früh (`cancelled_early`), danach kurzfristig (`cancelled_late`). Tisch wird frei, Gegenüber und Lokal werden informiert, die absagende Person bekommt eine Eingangsbestätigung.
8. **Am Abend**: Ab 15 Minuten vor bis 45 Minuten nach Beginn zeigt das **Finde-Fenster** Reservierungsname, Tisch-Code, Vorname und (falls hinterlegt) Erkennungszeichen des Gegenübers.
9. **Rückmeldung** am nächsten Tag um 10:00: war ich da, war das Gegenüber da, Kontakt ja/nein, Bewertungen, Notiz. Das Gegenüber sieht sie nie.
10. **Ergebnis**: Sagen beide „war da“ → sofort `happened`. Ohne gegenteilige Angabe automatisch 24 h nach der Rückmeldungs-Anfrage `happened`. Nichterscheinen siehe Abschnitt 6.
11. **Kontakttausch** bei beidseitigem Ja (je Person E-Mail und/oder Telefon). **Nachbesprechung** mit Viola für Andante und Loge.

## 2. Zustände

```
proposed ──request_time──► time_requested ──counter──► time_countered ──counter──► time_requested …
   │                          │ confirm                    │ confirm
   │ decline / lapse          ▼                            ▼
   ▼                       confirmed ──cancel_early / cancel_late / cancel_admin──► cancelled_early | cancelled_late
declined | lapsed             │
                              └──happened / no_show (System oder Admin)──► happened | no_show
```

Zustandswechsel gehen nur über `app.evening_transition()` (Kern). M5 ersetzt `app.evening_after_transition()` und hängt die Nebenwirkungen an: Fristen des alten Zustands beenden, neue planen, Tisch reservieren oder freigeben, Nachrichten, Status des Vorschlags (`app.pairings.status`: declined, expired, completed, cancelled).

## 3. Fristen und Zeitpunkte

| Was | Wann | Einstellung |
|---|---|---|
| Wunschzeit nach dem Vorschlag | 24 h | `evening.time_request_hours` |
| Antwort auf Wunschzeit oder Alternative | 24 h ab der letzten Aktion | `evening.time_answer_hours` |
| Erinnerung vor Fristende | 4 h vorher | `evening.deadline_reminder_hours` (0 = aus) |
| Wunschzeit/Alternative frühestens | 30 h in der Zukunft | `evening.min_lead_hours` |
| Bestätigung frühestens | 6 h vor Beginn | `evening.confirm_min_lead_hours` |
| Erinnerungen vor dem Abend | 24 h und 2 h | `evening.reminder_hours_before` |
| Finde-Fenster | 15 min vor bis 45 min nach Beginn | `evening.find_window_before_minutes`, `…_after_minutes` |
| Check-in | 30 min nach Beginn | `safety.checkin_after_minutes` |
| Rückmeldung | nächster Tag 10:00 Europe/Berlin | `evening.feedback_local_time` |
| Automatisch „stattgefunden“ | 24 h nach der Rückmeldungs-Anfrage | `evening.happened_auto_hours` |
| Widerspruch bei „nicht erschienen“ | 24 h ab der Meldung | `evening.no_show_contest_hours` |
| Rückmeldung möglich bis | 7 Tage nach Beginn | `evening.feedback_open_days` |
| Nachbesprechung angeboten bis | 7 Tage nach Beginn | `evening.debrief_offer_days` |
| Kurzfristige Absage | weniger als 24 h vor Beginn | `evening.late_cancel_hours` |
| Hinweis „Lokal hat nicht bestätigt“ | 24 h nach Bestätigung (spätestens 3 h vor Beginn) | `venue.confirm_alert_hours` |
| Fristen-Job | alle 5 min | `evening.deadline_check_minutes` |

Alle Zeiten kommen aus `app.now()` (Testuhr, PLAN 2.4).

## 4. Einstellungen (neu in M5)

| Schlüssel | Start | Bedeutung |
|---|---|---|
| `availability.ask_lead_days` | 10 | Abfrage so viele Tage vor dem Zeitraum |
| `availability.ask_local_time` | "10:00" | frühestens um diese Uhrzeit |
| `availability.answer_hours` | 72 | Abfrage offen |
| `availability.reminder_hours_before_close` | 24 | Erinnerung vor Schluss |
| `availability.max_windows` | 12 | Fenster je Person und Zeitraum |
| `availability.min_window_minutes` | 120 | kürzestes Fenster |
| `availability.max_window_hours` | 6 | längstes Fenster |
| `evening.max_times_per_answer` | 3 | Uhrzeiten je Wunsch/Alternative |
| `evening.min_lead_hours` | 30 | PLATZHALTER |
| `evening.confirm_min_lead_hours` | 6 | PLATZHALTER |
| `evening.max_time_rounds` | 4 | PLATZHALTER |
| `evening.deadline_reminder_hours` | 4 | Erinnerung vor Fristende |
| `evening.reservation_name` | "Fermata" | Name der Reservierung |
| `evening.find_window_before_minutes` / `…_after_minutes` | 15 / 45 | Finde-Fenster |
| `evening.recognition_hint_max_chars` | 80 | Erkennungszeichen |
| `evening.happened_auto_hours` | 24 | siehe oben |
| `evening.no_show_contest_hours` | 24 | PLATZHALTER (B9) |
| `evening.feedback_open_days` | 7 | Rückmeldung möglich |
| `evening.debrief_offer_days` | 7 | Nachbesprechung angeboten |
| `venue.confirm_alert_hours` | 24 | Hinweis an Benn |
| `venue.max_slot_weeks` | 26 | Plätze je Anlage |
| `notify.max_attempts` | 5 | Versuche je Nachricht |
| `notify.retry_minutes` | 10 | Wartezeit × Versuch |
| `notify.push_ttl_seconds` | 86400 | Haltezeit beim Push-Dienst |
| `notify.dispatch_url` | null | Adresse von notify-dispatch für pg_net |
| `notify.queue_retention_days` | 90 | erledigte Nachrichten löschen |

Bestehende, jetzt genutzte Einstellungen: `matching.rhythm_days`, alle `evening.*` aus dem Seed, `notify.push_enabled`, `notify.quiet_hours`, `safety.checkin_after_minutes`, `safety.emergency_number`, `safety.heimwegtelefon_*`.

## 5. API-Vertrag für die Oberfläche

Alle Funktionen liegen im Schema `api` (PostgREST: `POST /rest/v1/rpc/<name>` mit `Content-Profile: api`), laufen als `security definer` und prüfen selbst, wer aufruft. Fehler kommen mit deutscher Meldung, SQLSTATE und einer **stabilen Kennung im Feld `hint`** (gleiche Konvention wie in der Web-App-Migration). Zeiten sind ISO 8601; Listen von Uhrzeiten werden als UTC-Strings `"2026-10-09T17:30:00Z"` geliefert.

### 5.1 Abende (Mitglieder)

| Funktion | Parameter | Rückgabe | Fehler (`hint`) |
|---|---|---|---|
| `my_evenings()` | – | Tabelle: `evening_id, state, my_action, my_deadline_at, counterpart_first_name, reasons_text, venue (jsonb), proposed_times, requested_times, countered_times, requested_by_me, starts_at, ends_at, created_at` | `not_authenticated` |
| `evening_detail(p_evening_id)` | uuid | jsonb, siehe 5.2 | `not_participant` |
| `evening_time_options(p_evening_id)` | uuid | Tabelle `starts_at, source` (`proposed` \| `shared_window`) | `not_participant` |
| `evening_request_time(p_evening_id, p_times)` | uuid, timestamptz[] (1–3) | `evening_detail` | `invalid_state`, `invalid_times`, `time_too_soon`, `time_not_allowed`, `no_table_free`, `no_venue`, `account_suspended`, `evening_on_hold`, `not_participant` |
| `evening_counter(p_evening_id, p_times)` | uuid, timestamptz[] (1–3) | `evening_detail` | wie oben, dazu `not_your_turn`, `max_rounds` |
| `evening_confirm(p_evening_id, p_time)` | uuid, timestamptz (eine der angebotenen Zeiten) | `evening_detail` | `invalid_state`, `not_your_turn`, `time_not_offered`, `time_too_soon`, **`no_table_free`**, `venue_inactive`, `account_suspended`, `evening_on_hold`, dazu die Fehler von `billing.assert_evening_available` (M6, für beide Personen geprüft) |
| `evening_decline(p_evening_id, p_reason)` | uuid, Grund optional: `krank`, `termin`, `kein_interesse`, `sicherheit`, `lokal`, `sonstiges` | `evening_detail` | `invalid_state`, `invalid_reason` |
| `evening_cancel(p_evening_id, p_reason)` | uuid, Grund wie oben | `evening_detail` | `invalid_state`, `evening_started`, `invalid_reason` |
| `set_recognition_hint(p_evening_id, p_hint)` | uuid, Text (≤ 80 Zeichen; leer löscht) | Text oder null | `invalid_state`, `find_window_closed`, `hint_too_long` |
| `evening_find_info(p_evening_id)` | uuid | jsonb im Finde-Fenster, sonst **null**: `opens_at, closes_at, starts_at, reservation_name, table_code, venue, counterpart_first_name, counterpart_hint, my_hint, counterpart_photo_url (immer null, B7)` | `not_participant` |
| `submit_feedback(p_evening_id, p_attended, p_other_attended, p_wants_contact, p_would_meet_again, p_felt_safe, p_venue_rating, p_match_quality, p_note, p_share_email, p_share_phone)` | uuid, boolean, boolean?, boolean, `ja`/`nein`/`vielleicht`?, boolean?, 1–5?, 1–5?, Text ≤ 2000?, boolean, boolean | jsonb `{submitted, state, contact_share, debrief}` | `feedback_not_open`, `already_submitted`, `invalid_input`, `invalid_rating`, `text_too_long`, `consent_missing` (kontakttausch), `nothing_to_share`, `no_phone` |
| `my_contact_share(p_evening_id)` | uuid | jsonb `{status: none \| pending \| closed \| released, mine: {share_email, share_phone}, counterpart: {first_name, email, phone} \| null}` | `not_participant` |
| `debrief_offer(p_evening_id)` | uuid | jsonb `{eligible, reason, minutes, tier, offer_until, session_id, session_status}`; `reason`: `tier`, `not_applicable`, `feedback_missing`, `not_attended`, `done`, `expired` | `not_participant` |

**`my_action`** (was die Oberfläche anbieten soll): `choose_time` (Vorschlag: Zeit wählen oder ablehnen), `answer_time` (bestätigen, Alternative oder ablehnen), `wait` (das Gegenüber ist dran), `prepare` (bestätigt, vor dem Finde-Fenster: Erkennungszeichen, Absage), `find` (Finde-Fenster offen), `feedback`, `contact` (Kontaktdaten freigegeben), `debrief`, `none`.

Kontakttausch: Die Einwilligung `kontakttausch` erteilt die Oberfläche vorher mit `api.give_consent('kontakttausch', <Fassung>)` (Web-App, M2). Ohne sie lehnt `submit_feedback` ein Ja mit `consent_missing` ab. Ein Ja ohne Teilnahme (`p_attended = false`) wird als Nein gespeichert.

### 5.2 `evening_detail` (jsonb)

```json
{
  "evening_id": "…", "state": "time_requested", "my_action": "answer_time", "my_deadline_at": "…",
  "counterpart_first_name": "Ben", "reasons_text": "…",
  "venue": {"name": "…", "street": "…", "postal_code": "…", "city": "…", "public_transport": "…", "accessibility": "…", "description": "…"},
  "proposed_times": ["2026-10-09T17:00:00Z"], "requested_times": [], "countered_times": [],
  "requested_by_me": false, "countered_by_me": false,
  "time_options": [{"starts_at": "…", "source": "proposed"}],
  "max_times_per_answer": 3, "rounds_left": 3,
  "starts_at": null, "ends_at": null, "late_cancel_from": null,
  "reservation": {"name": "Fermata", "table_code": "K7QX", "persons": 2},
  "find_window": {"opens_at": "…", "closes_at": "…"},
  "my_recognition_hint": null,
  "feedback": {"submitted": false, "open": false, "open_until": "…", "mine": null},
  "contact_share": {"status": "none", "mine": null, "counterpart": null},
  "debrief": {"eligible": false, "reason": "not_applicable", "minutes": 10, "…": "…"},
  "cancelled_by_me": false, "created_at": "…"
}
```

Nie enthalten: Nachname, E-Mail oder Telefon des Gegenübers (außer nach beidseitigem Ja in `contact_share`), seine Rückmeldung, Scores, IDs des Gegenübers.

### 5.3 Zeitenabfrage (Mitglieder)

| Funktion | Parameter | Rückgabe | Fehler (`hint`) |
|---|---|---|---|
| `my_availability_periods()` | – | Tabelle `period_id, starts_on, ends_on, answer_until, is_open, window_count` (laufende und kommende) | – |
| `my_availability(p_period_id)` | uuid | Tabelle `window_id, starts_at, ends_at` | – |
| `set_availability(p_period_id, p_windows)` | uuid, jsonb `[{"starts_at": ISO, "ends_at": ISO}, …]` (ersetzt alle Fenster; `[]` löscht) | Tabelle wie oben | `not_authenticated`, `account_inactive`, `period_not_found`, `period_closed`, `invalid_input`, `too_many_windows`, `window_too_short`, `window_too_long`, `window_in_past`, `window_outside_period`, `windows_overlap` |

Mitglieder können `app.availability_windows` nicht mehr direkt beschreiben (nur über diese Funktion mit Prüfregeln).

### 5.4 Push-Abos (Mitglieder)

| Funktion | Parameter | Rückgabe | Fehler (`hint`) |
|---|---|---|---|
| `save_push_subscription(p_endpoint, p_p256dh, p_auth, p_platform)` | Werte aus `PushSubscription.toJSON()`, Plattform `ios`/`android`/`desktop` optional | uuid | `consent_missing` (Einwilligung `push`), `invalid_subscription`, `invalid_platform`, `no_account`, `account_closed` |
| `delete_push_subscription(p_endpoint)` | Text | boolean | – |
| `my_push_subscriptions()` | – | Tabelle `id, platform, created_at, last_success_at` (ohne Adressen und Schlüssel) | – |

Gleiche Signatur wie die Fassung der Web-App-Migration (M2); die M5-Fassung läuft später und ersetzt sie (prüft zusätzlich das Schlüsselformat). Widerruf der Einwilligung `push` löscht die Abos (Web-App, `api.revoke_consent`).

### 5.5 Admin (nur `app.is_admin()`, also mit Zwei-Faktor; alles im Audit-Protokoll)

| Funktion | Zweck |
|---|---|
| `admin_create_venue(p_data jsonb)` | Lokal anlegen. Felder: `name, street, postal_code, city, lat, lon` (ohne Koordinaten: PLZ-Mittelpunkt), `contact_name, contact_email, contact_phone, reservation_mode (email \| telefon \| manuell), description, accessibility, public_transport, agreement` (Objekt; `agreement.reservation_note` steht in der Reservierungs-Mail). Fehler: `unknown_field`, `invalid_*`, `email_required` |
| `admin_update_venue(p_venue_id, p_data)` | nur übergebene Felder ändern |
| `admin_set_venue_active(p_venue_id, p_active)` | deaktivieren/aktivieren; liefert `upcoming_reservations` (bestehende bleiben, Absage über `cancel_admin`) |
| `admin_venues(p_include_inactive)` | Liste mit Zahl der kommenden Plätze, freien Tische, Reservierungen |
| `admin_create_slots(p_venue_id, p_first_day, p_weeks, p_weekdays, p_times, p_tables, p_update_existing)` | z. B. `('…', '2026-10-05', 4, '{4,5,6}', '{19:00,19:30,20:00}', 3)` = Do–Sa, drei Uhrzeiten, vier Wochen, je 3 Tische. Ortszeit Europe/Berlin (auch über die Zeitumstellung). Rückgabe `{created, updated, skipped}` |
| `admin_update_slot(p_slot_id, p_tables)` | Tische ändern (nie unter `reserved`: `below_reserved`) |
| `admin_delete_slot(p_slot_id)` | nur ohne Reservierung (`slot_reserved`) |
| `admin_venue_slots(p_venue_id, p_from, p_to)` | Plätze mit Reservierungen (Tisch-Code, Status, verschickt/bestätigt) – ohne Namen |
| `admin_resolve_evening(p_evening_id, p_outcome, p_no_show_user, p_note)` | `happened` oder `no_show` von Hand (z. B. bestrittenes Nichterscheinen) |
| `admin_create_availability_period(p_starts_on, p_notify)` | Zeitraum von Hand anlegen (sonst pg_cron) |

### 5.6 Edge Functions

| Function | Methode | Zweck |
|---|---|---|
| `notify-dispatch` | POST, Kopfzeile `x-fermata-dispatch-secret` | verschickt fällige Nachrichten; Antwort `{claimed, email_sent, email_failed, push_sent, push_failed, push_removed, skipped}` |
| `push-key` | GET | `{"publicKey": "<VAPID_PUBLIC_KEY>"}` für `pushManager.subscribe({applicationServerKey})`; 503 `push_not_configured` |
| `venue-confirm` | GET `?t=…` zeigt die Reservierung mit Knopf, POST bestätigt | Bestätigungslink für Lokale (signiertes Token, gültig bis einen Tag nach dem Abend). GET bestätigt bewusst nicht, weil Mail-Programme Links vorab öffnen |

### 5.7 Push-Inhalt und Pfade der Web-App

Der Service Worker bekommt JSON: `{"title": "Fermata", "body": "…", "url": "/abende/<id>", "tag": "abend-<id>", "safety": true?}`. `tag` ersetzt ältere Nachrichten zum selben Abend.

Pfade, auf die Mails und Push verlinken (bitte so in der Web-App anlegen): `/abende`, `/abende/<id>`, `/abende/<id>/finden`, `/abende/<id>/check-in`, `/abende/<id>/rueckmeldung`, `/abende/<id>/kontakt`, `/abende/<id>/nachbesprechung`, `/zeiten/<period_id>`.

## 6. Regeln und Entscheidungen

**Wer wählt beim Vorschlag?** Beide dürfen; wer zuerst Wunschzeiten schickt, ist „wünschende Person“. Gleichzeitige Wünsche: die Zeilensperre lässt nur den ersten durch, der zweite bekommt `invalid_state`.

**Welche Uhrzeiten?** Vorgeschlagene Zeiten oder eigene, wenn sie samt geplanter Dauer (120 min) in ein gemeinsames freies Fenster passen. In beiden Fällen muss das Lokal zu genau dieser Zeit einen Platz mit freiem Tisch haben (`evening_time_options` liefert die Liste). Hinweis für M4: vorgeschlagene Zeiten sollten mindestens `evening.min_lead_hours` in der Zukunft liegen und zu `venue_slots` passen.

**Kurzfristig oder früh?** Absage genau 24:00 h vor Beginn ist noch früh, 23:59:59 h vorher kurzfristig. Was daraus fürs Kontingent folgt, regelt M6 (Trigger auf den Zustandswechsel; `cancelled_by` und `cancel_reason` sind vorher gesetzt).

**Stattgefunden / nicht erschienen (Platzhalter B9):**
- Beide sagen „war da“ und keiner meldet das Gegenüber als abwesend → sofort `happened`.
- Gibt eine Person selbst „war nicht da“ an, gilt sie als nicht erschienen.
- Meldet eine Person „Gegenüber war nicht da“ und die andere hat noch keine Rückmeldung, bekommt sie eine neutrale Bitte um Rückmeldung mit Frist (24 h, `evening.no_show_contest_hours`). Die Nachricht verrät nicht, was gemeldet wurde. Ohne Widerspruch → `no_show` mit `no_show_user` = gemeldete Person.
- Waren beide nicht da → `no_show` ohne `no_show_user`.
- Widerspruch (sagt „ich war da“, wurde aber als abwesend gemeldet) → keine automatische Entscheidung, Hinweis `no_show_bestritten` in `safety.safety_flags`, du entscheidest mit `admin_resolve_evening`.
- Ohne jede Rückmeldung → 24 h nach der Anfrage `happened`.
- Offene Meldung zum Abend (`safety.reports`, open/in_review) → keine automatische Entscheidung, tägliche Prüfung.
- „Nicht sicher gefühlt“ in der Rückmeldung → Hinweis `rueckmeldung_unsicher` (Stufe hoch) an dich; das Ergebnis wird trotzdem bestimmt.
- Späte Rückmeldungen nach der Entscheidung ändern das Ergebnis nicht mehr (Kontakttausch geht noch).
- Folgen wiederholten Nichterscheinens (B9) sind nicht gebaut (M6/M7).

**Finde-Fenster:** nur im Zustand `confirmed` (oder `happened`) und nur von 15 Minuten vor bis 45 Minuten nach Beginn; sonst `null`. Das Erkennungszeichen ist freiwillig, freier Text, höchstens 80 Zeichen, und wird nach dem Fenster gelöscht. **B7 (Erkennungsfoto):** nicht gebaut, `counterpart_photo_url` ist immer `null`.

**Kontakttausch:** nur bei beidseitigem Ja, nur mit aktueller Einwilligung `kontakttausch` beider, nicht bei Blockierung oder offener Meldung. Jede Seite sieht nur, was die andere freigegeben hat. Die Daten stehen nur in der App, nie in einer Mail. Ein Nein wird nie gezeigt: wer Ja gesagt hat, sieht „offen“ und nach 7 Tagen „geschlossen“.

**Nachbesprechung (B6):** angeboten nach eigener Rückmeldung mit „war da“, wenn `evening.debrief_minutes` für die Stufe (`app.accounts.tier_view`) größer als 0 ist: Auftakt 0, Andante 10, Loge 20 (Platzhalter). Die Sitzung selbst legt der Viola-Bereich an (`interview_sessions.kind = 'nachbesprechung'`, `evening_id`); M5 entscheidet nur, ob angeboten wird.

**Sperre und Blockierung:** Ist eine beteiligte Person gesperrt (`safety.is_suspended`) oder hat eine die andere blockiert, sind Wunschzeit, Alternative und Bestätigung angehalten (`account_suspended` bzw. `evening_on_hold`, ohne Grund). Ablehnen und Absagen gehen immer.

**Lokale (B10):** Reservierung unter „Fermata“, 4-stelliger Code aus Zeichen ohne Verwechslungsgefahr (z. B. „K7QX“), 2 Personen, Hinweis aus `agreement.reservation_note`. Lokale mit `reservation_mode` `telefon` oder `manuell` bekommen keine Mail; stattdessen bekommen alle Admins die Reservierung bzw. Absage zum Anrufen. Ein deaktiviertes Lokal nimmt keine neuen Reservierungen an.

**Mails nennen das Gegenüber nicht beim Namen.** Der Vorname steht in der App. So landet beim Mail-Dienst möglichst wenig über die andere Person (Grundsatz „auf Nummer sicher“).

## 7. Nachrichten im Überblick

Alle Texte: `supabase/functions/_shared/mail/templates/evening.ts`, `evening-venue.ts`, `notify.ts` (Sie- und Du-Form, Tonalitätsprüfung `pnpm check:tone`). „Frist“ = geht immer auch per E-Mail.

| Vorlage | Wann | An | Frist | Push-Text (Beispiel) |
|---|---|---|---|---|
| `availability.request` | neuer Zeitraum | passende Mitglieder | ja | „Freie Abende bitte bis Mi., 7. Okt., 10:05 Uhr eintragen.“ |
| `availability.reminder` | 24 h vor Schluss | ohne Eintrag | ja | „Freie Abende noch bis … eintragen.“ |
| `evening.proposed` | Vorschlag | beide | ja | „Ein Vorschlag für einen Abend. Antwort bis …“ |
| `evening.deadline_reminder` | 4 h vor Fristende | wer antworten muss | ja | „Der Abend wartet auf Antwort, bis …“ |
| `evening.time_requested` | Wunschzeit | Gegenüber | ja | „Wunschzeiten für den Abend. Antwort bis …“ |
| `evening.time_countered` | Alternative | wünschende Person | ja | „Eine andere Uhrzeit für den Abend. Antwort bis …“ |
| `evening.confirmed` | Bestätigung | beide | nein | „Der Abend steht: Fr., 9. Okt., 19:30 Uhr.“ |
| `evening.declined` | Ablehnung | Gegenüber | nein | „Aus dem Vorschlag wird diesmal kein Abend.“ |
| `evening.lapsed` | Frist abgelaufen | beide | nein | „Der Vorschlag für einen Abend ist beendet.“ |
| `evening.cancelled` | Absage | Gegenüber (bei Admin-Absage beide) | nein | „Der Abend am … findet nicht statt.“ |
| `evening.cancel_receipt` | Absage | absagende Person | nein | (nur Mail) |
| `evening.reminder` | 24 h und 2 h vorher | beide | nein | „Heute um 19:30 Uhr: der Abend.“ |
| `evening.checkin` | 30 min nach Beginn | beide, Sicherheit (auch in der Ruhezeit) | nein | „Ist alles in Ordnung? Kurz in der App bestätigen.“ |
| `evening.feedback_request` | nächster Tag 10:00 | ohne Rückmeldung | nein | „Wie war Ihr Abend? Die Rückmeldung sieht nur Fermata.“ |
| `evening.feedback_needed` | nach Meldung „nicht da“ | gemeldete Person (neutral) | ja | „Die Rückmeldung zum Abend fehlt noch, bitte bis …“ |
| `evening.contact_released` | beidseitiges Ja | beide | nein | „Sie haben beide Ja gesagt. Die Kontaktdaten stehen in der App.“ |
| `evening.debrief_offer` | nach Rückmeldung | Andante/Loge | nein | „Möchten Sie kurz über den Abend sprechen?“ |
| `venue.reservation` | Bestätigung | Lokal (E-Mail) oder Admins (Telefon-Lokal) | – | – |
| `venue.cancellation` | Absage | wie oben (nur wenn die Reservierung verschickt war) | – | – |
| `admin.venue_unconfirmed` | 24 h ohne Bestätigung | Admins | – | – |

Veraltete Nachrichten (z. B. Vorschlag schon beantwortet, Abend abgesagt) werden beim Versand übersprungen (`skip_reason = 'outdated'`). Ohne Push-Abo oder Einwilligung `push` wird Push übersprungen; war nur Push vorgesehen, geht die Nachricht per E-Mail. Ungültige Abos (404/410) werden gelöscht. Fehler: neuer Versuch nach 10, 20, 30 … Minuten, nach 5 Versuchen aufgegeben. Protokoll ohne Inhalt in `ops.notifications_log`.

## 8. Platzhalter und offene Fragen

| Nr. | Thema | Stand |
|---|---|---|
| B6 | Länge der Nachbesprechung | `evening.debrief_minutes` = Auftakt 0, Andante 10, Loge 20 (Vorschlag aus PLAN) |
| B7 | Erkennungsfoto | nicht gebaut; Feld `counterpart_photo_url` ist reserviert (immer null) |
| B8 | Gültigkeit von Gutschriften | M6 (Kontingent-Buch), nicht hier |
| B9 | Nichterscheinen | Regel aus Abschnitt 6 als Platzhalter; Folgen fehlen (M6/M7) |
| B10 | Lokal-Liste, Vereinbarungen | Admin-Funktionen fertig; `agreement` ist frei (jsonb) |
| neu | `evening.min_lead_hours` = 30 | Vorlauf für Wunschzeiten (24 h Antwortfrist + 6 h fürs Lokal) |
| neu | `evening.confirm_min_lead_hours` = 6 | kürzester Vorlauf fürs Lokal |
| neu | `evening.max_time_rounds` = 4 | gegen endloses Hin und Her |
| neu | `evening.no_show_contest_hours` = 24 | Widerspruchsfrist |

## 9. Abweichungen vom PLAN und Ergänzungen

- **Ergänzt:** Erinnerung 4 h vor Ablauf jeder 24-Stunden-Frist; Rundenbegrenzung; Eingangsbestätigung für die absagende Person; neutrale Bitte um Rückmeldung bei gemeldetem Nichterscheinen; Hinweis an Benn, wenn ein Lokal nicht bestätigt; Aufräum-Job.
- **Kontaktdaten nur in der App**, nicht per Mail (Datensparsamkeit).
- **Web-Push ohne Bibliothek:** RFC 8291 (aes128gcm) und RFC 8292 (VAPID) mit WebCrypto; `npm:web-push` dient nur in Tests als Gegenprobe. Grund: keine Abhängigkeit von Node-Modulen (`https`, `crypto`) in der Edge-Laufzeit. Das Beispiel aus RFC 8291 Anhang A wird byte-genau erzeugt.
- **Verlauf:** Das Anlegen des Vorschlags steht nicht in `app.evening_events` (der Kern-Test zählt dort nur Zustandswechsel); der Zeitpunkt ist `app.evenings.created_at`.
- **Ablehnung:** speichert Grund und Person in `cancel_reason`/`cancelled_by` (eigene Spalten gibt es nicht).

## 10. Betrieb und Einrichtung

**Secrets der Edge Functions:** `NOTIFY_DISPATCH_SECRET` (beliebig lang, zufällig), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:…`), `VENUE_LINK_SECRET`, optional `FERMATA_FUNCTIONS_URL` (sonst `SUPABASE_URL/functions/v1`), dazu wie bisher `FERMATA_APP_URL`, `BREVO_API_KEY`, `FERMATA_ENV`. VAPID-Schlüssel erzeugen: `deno run supabase/functions/_shared/push/generate-vapid-keys.ts`.

**Deployment:** `notify-dispatch`, `venue-confirm` und `push-key` werden ohne JWT-Prüfung aufgerufen (Geheimnis bzw. signierter Link bzw. öffentlich): `supabase functions deploy <name> --no-verify-jwt` oder `verify_jwt = false` in `supabase/config.toml` (Datei gehört dem Kern, deshalb nicht von mir geändert).

**Datenbank:** `notify.dispatch_url` auf die Adresse von `notify-dispatch` setzen und das gleiche Geheimnis in Vault ablegen: `select vault.create_secret('<NOTIFY_DISPATCH_SECRET>', 'fermata_notify_dispatch_secret');`. Dann stößt pg_cron jede Minute über pg_net an (nur wenn etwas fällig ist). Alternativ ruft ein externer Zeitplaner die Function mit der Kopfzeile auf.

**pg_cron-Jobs:** `fermata-evening-deadlines` (alle 5 min, `ops.process_evening_deadlines()`), `fermata-availability-tick` (stündlich, `ops.availability_tick()`), `fermata-notify-kick` (minütlich, `ops.notify_kick()`), `fermata-evening-purge` (täglich 03:23 UTC, `ops.purge_evening_data()`). Nach Änderung von `evening.deadline_check_minutes`: `select ops.schedule_evening_jobs();`.

**Rechte (wichtiger Fund):** In Postgres darf `PUBLIC` jede neue Funktion ausführen. `alter default privileges in schema … revoke execute … from public` aus der Grundmigration wirkt nicht, weil schema-bezogene Standardrechte die globalen nur ergänzen. Da das Schema `app` über die API freigegeben ist, könnten Mitglieder sonst z. B. `app.evening_transition()` direkt aufrufen. Migration `20261003000590_evening_privileges.sql` entzieht `PUBLIC` und `anon` das Recht für alle M5-Funktionen sowie `app.evening_transition` und `app.shared_windows` und zum Schluss für alle bis dahin vorhandenen Funktionen in `app`, `api` und `ops` (`revoke execute on all functions in schema app, api, ops from public`). Mitglieder-RPCs haben ein ausdrückliches `grant … to authenticated`, Jobs laufen als `service_role` (Standardrechte); interne Funktionen (Fristen-Job, Nebenwirkungen, Warteschlange) sind für Mitglieder gesperrt, ein Test prüft das. Funktionen aus späteren Migrationen (z. B. `api.my_sanctions` aus 0700) deckt die abschließende Integrations-Migration ab.

**Fristen-Job und Sperren:** Der Job sperrt erst die Frist und dann den Abend, die Mitglieder-Funktionen umgekehrt. Damit es nie zu einer Verklemmung kommt, überspringt der Job einen Abend, an dem gerade jemand handelt (`for update skip locked`, Zähler `busy`), und erledigt die Frist im nächsten Lauf.

## 11. Schnittstellen zu anderen Bereichen

- **Auswahl (M4):** fügt `app.evenings` mit `state = 'proposed'`, `venue_id`, `proposed_times` (jsonb, ISO-Zeiten passend zu `venue_slots`) ein; `app.pairings.reasons_text` ist der Text „warum Sie beide“. Alles Weitere startet der Trigger `evenings_m5_after_insert`. M5 setzt `app.pairings.status` am Ende (declined, expired, completed, cancelled).
- **Kontingent (M6):** Trigger auf `AFTER INSERT` von `app.evening_events`. Vor jedem Wechsel sind `starts_at`, `confirmed_at`, `cancelled_by`, `cancel_reason`, `no_show_user` gesetzt. Absagen (`cancel_early`, `cancel_late`) tragen die absagende Person als `actor`; `no_show` trägt `details.no_show_user` (null = beide nicht erschienen). Vor der Bestätigung ruft `api.evening_confirm` für beide `billing.assert_evening_available(uuid)` auf, sofern die Funktion existiert (defensiv über `to_regprocedure`). Grund `sicherheit` bei Absagen ist für Kulanz gedacht.
- **Sicherheit (M7):** Check-in-Nachricht kommt von M5 (Link `/abende/<id>/check-in`), die Antworten verarbeitet M7. `cancel_admin` gibt den Tisch frei, informiert das Lokal und beide Personen – außer bei `details.notify_by = 'safety'`: dann informiert M7 die beiden selbst und neutral, M5 schickt keine eigene Absage. Offene Meldungen halten die automatische Entscheidung an. Hinweise in `safety.safety_flags`: `no_show_bestritten`, `rueckmeldung_unsicher`.
- **Viola (M3):** legt die Nachbesprechung an; Eignung und Minuten aus `api.debrief_offer`.
- **Web-App (M2 und spätere Oberfläche):** alle Funktionen aus Abschnitt 5; Einwilligungen über `api.give_consent`.

## 12. Tests

- pgTAP (`supabase/tests/500_fixtures.sql` und `5xx_*.test.sql`, Testuhr): ganzer Ablauf, Fristablauf in jeder Phase, Erinnerungen, idempotenter Fristen-Job, Grenze früh/kurzfristig, letzter Tisch, nur Beteiligte, Rückmeldung bleibt verborgen, Finde-Fenster, Kontakttausch nur bei beidseitigem Ja, Nichterscheinen, Sicherheits-Halt, Push-Einwilligung, Ruhezeit, Wiederholung, Zeitenabfrage, Lokale im Admin, Zeitumstellung, Ausführungsrechte.
- Deno (`supabase/functions/_shared/push/push.test.ts`, `_shared/notify/dispatch.test.ts`): RFC-8291-Beispiel, Hin- und Rückweg, Gegenprobe mit `npm:web-push`, VAPID-JWT, nachgebauter Push-Dienst (201/410/500), MemoryMailer, Vorlagen in Sie- und Du-Form, Handler.
- Deno gegen die Test-Datenbank (`_shared/notify/dispatch.db.test.ts`, nur mit `FERMATA_TEST_DB_URL`): Versand über die echten SQL-Funktionen, zwei gleichzeitige Bestätigungen für den letzten Tisch über zwei Verbindungen, Fristen-Job neben einer offenen Mitglieder-Transaktion (keine Verklemmung).

```bash
DB_PORT=54372 DB_CONTAINER=fermata-db-evenings bash scripts/db.sh test
cd supabase/functions && deno test --allow-all _shared/push/push.test.ts _shared/notify/dispatch.test.ts
FERMATA_TEST_DB_URL=postgres://postgres:postgres@localhost:54372/postgres deno test --allow-all _shared/notify/dispatch.db.test.ts
```
