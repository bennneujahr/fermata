# Löschkonzept

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026. Grundlage: Code (Datenkarte [`docs/DATA.md`](../DATA.md), Abschnitte 3, 6, 7).
> Status je Zeile: **Job** = automatisch im Code, **Ereignis** = Löschung durch eine Handlung (Widerruf, Abmeldung,
> Kontolöschung), **Vorschlag** = noch nicht gebaut, Frist von Benn/Anwalt zu bestätigen.

## 1. Grundsätze

1. Daten werden gelöscht, sobald der Zweck entfällt (Art. 5 Abs. 1 lit. e, Art. 17 DSGVO), spätestens zur Regelfrist.
2. Fristen stehen als Einstellungen in `ops.app_settings`, wo es sie schon gibt; die Löschung macht ein pg_cron-Job
   oder die Handlung selbst (Widerruf, Abmeldung, Kontolöschung).
3. **Gesetzliche Aufbewahrung** geht vor; dann werden die Daten gesperrt (nur noch für den Aufbewahrungszweck) und
   so weit wie möglich vom Konto gelöst.
4. Löschen heißt in der Datenbank `DELETE` (oder Leeren der Spalte). Kopien in Backups verschwinden mit deren Ablauf.
5. Jede automatische Löschung schreibt nur Zählungen (keine Inhalte) zurück; Kontolöschungen stehen ohne Inhalt im
   Audit-Protokoll.

## 2. Löschklassen und Fristen

| Datenart | Tabelle / Ort | Regelfrist | Auslöser | Umsetzung | Status |
|---|---|---|---|---|---|
| Warteliste unbestätigt | `public.waitlist` | 7 Tage nach letzter Mail | Zeit | `api.waitlist_cleanup()`, Job `fermata-waitlist-cleanup` (stündlich) | Job |
| Warteliste bestätigt | `public.waitlist`, `public.waitlist_invites` | bis Abmeldung | Abmeldung; Kontolöschung | `api.waitlist_unsubscribe`; `ops.account_deletion_prepare` (M2) | Ereignis |
| Warteliste nach Kontoeröffnung | `public.waitlist` | **Vorschlag:** löschen, sobald das Konto `active` ist (Gründungsstatus steht in `app.accounts`) | Kontostatus | neue Funktion in `app.refresh_account_status` oder Job | Vorschlag |
| IP-Drossel | `public.signup_attempts` | 24 h | Zeit | Job `fermata-waitlist-cleanup` | Job |
| Tagessalze | `ops.daily_salts` | 2 Tage | Zeit | Job `fermata-waitlist-cleanup` | Job |
| Plakat-Zähler | `public.link_hits` | dauerhaft (kein Personenbezug) | – | – | – |
| Nie angenommene Einladung samt vorbereitetem Konto | `auth.users`, `app.account_invitations` | 7 Tage (`account.invitation_valid_days`) | Zeit | `ops.expire_invitations()`, Job `fermata-expire-invitations` (M2) | Job |
| Konto, Fakten, Ort, Profil, Wünsche, Gewichte, Embeddings, Zeiten, Abende, Rückmeldungen, Mitgliedschaft, Kontingent, Sanktionen, Push-Abos | alle Tabellen mit `on delete cascade` an `auth.users` | bis Kontolöschung | Kontolöschung | Edge Function `account-delete` (M2) | Ereignis |
| Art.-9-Angaben | `sensitive.profile_identity`, `sensitive.profile_sensitive` | bis Widerruf | Widerruf; Kontolöschung | `api.revoke_consent` (sofort) | Ereignis |
| Gesprächstext | `app.interview_transcripts` | 30 Tage (`interview.transcript_retention_days`) | Zeit; Widerruf `gespraech` | `ops.purge_transcripts()`, Job `fermata-purge-transcripts` (stündlich); `api.revoke_consent` | Job |
| Gesprächstext mit Sicherheits-Hinweis | dto. | wie oben; verlängerbar über `interview.safety_transcript_retention_days` (B5, heute 30 = keine Verlängerung) | Zeit | `api.agent_flag_safety` setzt `delete_at` | Job |
| Entwurf der Zusammenfassung | `app.interview_sessions.summary_draft` | **Vorschlag:** leeren, sobald bestätigt, korrigiert oder verworfen; sonst nach 30 Tagen | Bestätigung, Zeit | Erweiterung `api.interview_confirm_summary` + Job | Vorschlag |
| Audio | – | wird nicht gespeichert | – | `record=False` | – |
| Ausweisprüfung bei Didit | Didit | sofort nach dem Ergebnis; Sicherung 1 Monat (Didit-Konsole) | Ergebnis | `verification-webhook` (`DELETE /v2/session/{id}/delete/`), Nachholen über `ops.verifications_pending_deletion` | Ereignis; Konsole: TODO |
| Ergebnis der Ausweisprüfung | `app.verifications` | bis Kontolöschung | Kontolöschung | Kaskade | Ereignis |
| Sperrlisten-Hashes der Person | `safety.verification_hashes` | bis Kontolöschung | Kontolöschung | Kaskade | Ereignis |
| Teil-Scores, Lauf-Teilnahmen | `app.pair_candidates`, `app.match_run_members` | 12 Monate nach Laufende (`matching.score_retention_months`) | Zeit | `ops.purge_match_scores()`, Job `fermata-purge-match-scores` (täglich) | Job |
| Gesamtscore und Prüfnotizen eines Vorschlags | `app.pairings.total_score`, `review_notes` | **Vorschlag:** nach 12 Monaten leeren (wie Teil-Scores); Vorschlag selbst bis Kontolöschung | Zeit | Erweiterung `ops.purge_match_scores` | Vorschlag |
| Lauf-Berichte | `app.match_runs` | dauerhaft (Summen, k-anonym) | – | – | – |
| Freie Zeitfenster | `app.availability_windows` | **Vorschlag:** 30 Tage nach Ende des Zeitraums | Zeit | neuer Job | Vorschlag |
| Erkennungszeichen | `app.evening_hints` | bis Ende des Finde-Fensters (45 min nach Beginn) | Zeit | `ops.purge_evening_data()`, Job `fermata-evening-purge` (täglich) | Job |
| Nachrichten-Warteschlange | `ops.notification_queue` | 90 Tage nach Erledigung (`notify.queue_retention_days`) | Zeit | Job `fermata-evening-purge` | Job |
| Versandprotokoll | `ops.notifications_log` | **Vorschlag:** 12 Monate | Zeit; Kontolöschung | neuer Job; `ops.account_deletion_prepare` (M2) | Vorschlag |
| Push-Abos | `app.push_subscriptions` | bis Abmeldung/Widerruf | Widerruf `push`; Antwort 404/410; 20 Fehlschläge; Kontolöschung | `api.revoke_consent`, `ops.push_subscription_result` | Ereignis |
| „Abend teilen“ | `app.trust_shares` | Link ungültig 24 h nach Beginn; Zeile mit dem Abend | Zeit | Prüfung beim Abruf | Ereignis |
| Stripe-Ereignisse | `billing.stripe_events` | **Vorschlag:** 90 Tage nach Verarbeitung (Stripe hält das Original) | Zeit | neuer Job | Vorschlag |
| Vertragserklärungen (Bestellung, Kündigung, Widerruf) | `billing.contract_actions` | **Vorschlag:** 6 Jahre nach Ende des Kalenderjahres (Handels- und Geschäftsbriefe, § 257 Abs. 1 Nr. 2, 3, Abs. 4 HGB; § 147 AO) | Zeit | neuer Job; bei Kontolöschung heute nur `user_id = null` (Name und E-Mail bleiben) | Vorschlag |
| Kündigung/Widerruf ohne Anmeldung, nicht bestätigt | `billing.contract_requests` | **Vorschlag:** 30 Tage nach Ablauf des Links | Zeit | neuer Job | Vorschlag |
| Zeiträume mit Rechnungsbezug | `billing.membership_periods` | heute: mit dem Konto gelöscht | Kontolöschung | Kaskade | **prüfen** mit Steuerberatung: Buchungsbelege 8 Jahre (§ 257 Abs. 4 HGB, § 147 Abs. 3 AO in der Fassung seit 2025) – Rechnungen liegen bei Stripe |
| Meldungen | `safety.reports` | **Vorschlag:** 3 Jahre nach Abschluss (Verjährung zivilrechtlicher Ansprüche, § 195 BGB); bei Ausschluss nur Grund-Code und Datum bis zum Ende des Ausschlusses | Zeit | neuer Job; heute bei Kontolöschung nur Personen-IDs `null` | Vorschlag |
| Sanktionen, Widersprüche | `safety.sanctions`, `safety.appeals` | heute: mit dem Konto gelöscht | Kontolöschung | Kaskade | prüfen (Nachweis für Rechtsstreit?) |
| Sicherheits-Hinweise | `safety.safety_flags` | **Vorschlag:** 1 Jahr nach Prüfung; mit Sperrlisten-Hashes nach Kontolöschung: löschen, sobald entschieden (Ausschluss → Sperrliste) | Zeit, Entscheidung | neuer Job | Vorschlag |
| Sicherheits-Mail-Ausgang | `safety.mail_queue` | **Vorschlag:** 90 Tage nach Versand | Zeit | neuer Job | Vorschlag |
| Check-ins | `safety.checkins` | mit dem Abend | Kontolöschung | Kaskade | Ereignis |
| **Sperrliste** | `safety.blocklist` | **dauerhaft**, solange der Ausschluss gilt; Aufheben löscht den Eintrag | Aufhebung | `api.admin_lift_sanction` | Ereignis; Begründung Abschnitt 4 |
| Einwilligungsnachweise | `app.consents` | heute: mit dem Konto gelöscht | Kontolöschung | Kaskade | **Anwalt:** 3 Jahre nach Kontolöschung als Nachweis aufbewahren? |
| Admin-Protokoll | `ops.audit_log` | heute: dauerhaft, Löschen per Trigger gesperrt | – | – | **Vorschlag:** 3 Jahre; Lösch-Funktion mit Ausnahme vom Trigger |
| Einstellungsverlauf | `ops.app_settings_history` | dauerhaft (Admin-ID) | – | – | – |
| Kostenprotokoll | `ops.session_costs` | dauerhaft, ohne Personen-ID | – | – | – |
| Anmeldeereignisse mit IP | `auth.audit_log_entries` | heute: dauerhaft | – | – | **Vorschlag:** 90 Tage (Job als `postgres`, Supabase-Doku prüfen) |
| Partner-Lokale: Ansprechperson | `app.venues.contact_*` | **Vorschlag:** Kontaktfelder leeren 3 Jahre nach Ende der Partnerschaft; Lokal selbst bleibt (Verlauf der Abende) | Ende der Partnerschaft | Admin-Funktion | Vorschlag |
| Server-Protokolle der Anbieter | Supabase, Vercel, AWS CloudWatch, Brevo | je Anbieter | Zeit | Konfiguration | TODO (Runbook: CloudWatch 30 Tage) |
| Backups | Supabase | laut Tarif (z. B. 7 Tage tägliche Backups; PITR nach Einstellung) | Zeit | Anbieter | Konfiguration |

## 3. Ablauf der Kontolöschung (heute, M2)

1. Person drückt „Konto löschen“ → Edge Function `account-delete`.
2. `ops.account_deletion_prepare` (`20261003000260_web_export_delete.sql`): Audit „Löschung beantragt“; Admin-Konten
   werden nicht selbst gelöscht; läuft eine Sperre oder Meldung gegen die Person, legt die Funktion einen Hinweis
   mit den Sperrlisten-Hashes (ohne Namen) für Benn an; Einladungen (auch per E-Mail), Versandprotokoll und
   Wartelisten-Eintrag werden gelöscht.
3. Supabase Auth löscht die Person; alle Tabellen mit `on delete cascade` folgen.
4. Bleiben ohne Konto-Bezug: `billing.contract_actions` (`user_id = null`, aber Name/E-Mail in `details`),
   `safety.reports` (IDs `null`, Schilderung bleibt), `safety.safety_flags` (`user_id = null`), `ops.audit_log`,
   `ops.session_costs`, Lauf-Berichte.
5. `ops.account_deletion_done`: Nachweis im Audit; Bestätigungs-Mail.

**Lücken im Ablauf:**

- **Das Stripe-Abo wird nicht gekündigt** und der Stripe-Kunde nicht gelöscht. Abbuchungen würden weiterlaufen, der
  Webhook fände kein Konto mehr. Vor dem Start beheben: Löschung nur nach Kündigung erlauben oder bei Löschung das Abo
  sofort beenden (`DELETE /v1/subscriptions/{id}`) und den Kunden bei Stripe löschen lassen, soweit Stripe das
  zulässt.
- **Gemeinsame Abende:** `app.evenings` hängt mit `on delete cascade` an beiden Personen. Löscht eine Person ihr
  Konto, verschwinden Abend, beide Rückmeldungen, Kontakttausch und Check-ins auch für das Gegenüber. Datensparsam,
  aber das Gegenüber verliert seinen Verlauf (und Benn die Rückmeldung zu einem möglichen Sicherheitsfall).
  Entscheidung Benn/Anwalt; Alternative: Bezug auf die gelöschte Person `null` setzen.
- Sanktionen verschwinden mit dem Konto; die Sperrliste bleibt. Für einen späteren Rechtsstreit fehlt dann der
  Nachweis der Sanktion [[Anwalt]].

## 4. Begründung: dauerhafte Sperrliste

- **Zweck:** Personen, die wegen Übergriffen, Bedrohungen, Minderjährigkeit, Betrug oder wiederholter Verstöße
  ausgeschlossen wurden, sollen sich nicht mit neuem Konto wieder anmelden. Das schützt Leben, Gesundheit und sexuelle
  Selbstbestimmung anderer Mitglieder (Art. 6 Abs. 1 lit. f DSGVO).
- **Minimierung:** Gespeichert werden nur HMAC-SHA256-Werte aus Ausweisnummer + Geburtsdatum und aus Name +
  Geburtsdatum mit einem eigenen geheimen Schlüssel (Vault `fermata_blocklist_key`), ein Grund-Code und Verweise. Ohne
  den Schlüssel lassen sich die Werte keiner Person zuordnen; mit ihm nur, wenn man Ausweisnummer oder Name und
  Geburtsdatum schon kennt.
- **Wirkung:** Ein Ausweis-Treffer sperrt automatisch (vorläufige Sperre, Hinweis an Benn); ein Namens-Treffer sperrt
  nicht, sondern führt zu einer Prüfung durch einen Menschen (Namensgleichheit möglich).
- **Dauer:** solange der Ausschluss gilt. Hebt Benn den Ausschluss auf (Widerspruch, Irrtum), wird der Eintrag
  gelöscht. **Vorschlag:** Einträge alle 5 Jahre überprüfen [[DSB]].
- **Rechte der Betroffenen:** Widerspruch gegen den Ausschluss (`api.appeal`) vor dessen Wirkung; Auskunft über den
  Eintrag auf Anfrage.

## 5. Ausnahmen und Sperrung

| Grund | Wirkung |
|---|---|
| Gesetzliche Aufbewahrung (HGB, AO) | Vertragsunterlagen bleiben ohne Konto-Bezug bis Fristende |
| Laufender Sicherheitsfall | Meldung und Hinweise bleiben bis zur Entscheidung; Transkript nur bei Verlängerung (B5) |
| Rechtsstreit oder behördliche Anfrage | Löschung aussetzen für die betroffenen Datensätze (Entscheidung Benn mit Anwalt, im Audit vermerken) |

## 6. Umsetzung der Vorschläge (für die Technik)

Ein gemeinsamer täglicher Job `fermata-retention` mit einer Funktion `ops.apply_retention()`, die je Löschklasse eine
Einstellung liest (z. B. `retention.reports_days`, `retention.stripe_events_days`, `retention.notifications_log_days`,
`retention.availability_days`, `retention.safety_mail_days`, `retention.contract_actions_years`,
`retention.auth_audit_days`) und nur Zählungen zurückgibt. Tests mit der Testuhr (`ops.sim_clock_advance`) wie bei den
bestehenden Jobs. Für `ops.audit_log` braucht die Lösch-Funktion eine bewusst schmale Ausnahme vom
Anhänge-Trigger (z. B. Transaktionsvariable wie bei `app.evening_transition`).

## Offene Punkte für Benn/Anwalt

1. Alle Fristen mit „Vorschlag“ bestätigen oder ändern.
2. Stripe-Abo bei Kontolöschung (Fehler, vor dem Start beheben).
3. Gemeinsame Abende bei Kontolöschung: Kaskade oder Bezug lösen?
4. Einwilligungsnachweise und Sanktionen nach Kontolöschung behalten?
5. Aufbewahrung von Buchungsbelegen mit Steuerberatung klären (8 Jahre seit 2025 / 6 Jahre für Geschäftsbriefe).
6. Überprüfungsrhythmus der Sperrliste.
7. Fristen der Anbieter-Protokolle eintragen.
