# Löschkonzept

> **ENTWURF – nicht rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend.**
> Stand: 03.10.2026 (Härtung). Grundlage: Code (Datenkarte [`docs/DATA.md`](../DATA.md), Abschnitte 3, 6, 7).
> Status je Zeile: **Job** = automatisch im Code, **Ereignis** = Löschung durch eine Handlung (Widerruf, Abmeldung,
> Kontolöschung), **dauerhaft** = bewusst ohne Löschung (Begründung dabei), **Vorschlag** = noch nicht gebaut.
> Fristen mit PLATZHALTER (Einstellungen `retention.*`, `docs/PLATZHALTER.md` C11) bestätigen Benn bzw. Anwalt und
> Steuerberatung.

## 1. Grundsätze

1. Daten werden gelöscht, sobald der Zweck entfällt (Art. 5 Abs. 1 lit. e, Art. 17 DSGVO), spätestens zur Regelfrist.
2. Fristen stehen als Einstellungen in `ops.app_settings` (`retention.*` und ältere Schlüssel wie
   `interview.transcript_retention_days`); die Löschung macht ein pg_cron-Job oder die Handlung selbst.
3. **Gesetzliche Aufbewahrung** geht vor; dann werden die Daten gesperrt (nur noch für den Aufbewahrungszweck) und
   so weit wie möglich vom Konto gelöst.
4. Löschen heißt in der Datenbank `DELETE` (oder Leeren der Spalte). Kopien in Backups verschwinden mit deren Ablauf.
5. Jede automatische Löschung schreibt nur Zählungen (keine Inhalte) zurück; `ops.apply_retention()` legt dafür eine
   Zeile `retention.applied` im Audit-Protokoll an, Kontolöschungen stehen ohne Inhalt im Audit-Protokoll.

## 2. Löschklassen und Fristen

Der gemeinsame Löschjob heißt **`fermata-retention`** (täglich 03:41 UTC, Funktion `ops.apply_retention()`,
`supabase/migrations/20261003000905_retention.sql`, Test `supabase/tests/905_retention.test.sql` mit der Testuhr).

| Datenart | Tabelle / Ort | Regelfrist | Auslöser | Umsetzung | Status |
|---|---|---|---|---|---|
| Warteliste unbestätigt | `public.waitlist` | 7 Tage nach letzter Mail | Zeit | `api.waitlist_cleanup()`, Job `fermata-waitlist-cleanup` (stündlich) | Job |
| Warteliste bestätigt | `public.waitlist`, `public.waitlist_invites` | bis Abmeldung oder bis die Einladung in die App angenommen ist | Abmeldung; Annahme; Kontolöschung | `api.waitlist_unsubscribe`; Trigger `app.on_auth_user_signed_in` (erste Anmeldung); Rückfall im Job `fermata-retention`; `ops.account_deletion_prepare` | Ereignis + Job |
| Warteliste nach Kontoeröffnung | `public.waitlist` | gelöscht mit der **Annahme der Einladung** (erste Anmeldung). Der Gründungsstatus steht seit der Einladung in `app.accounts`; eine offene, nie angenommene Einladung lässt den Eintrag stehen (sonst verlöre die Person ihren Platz) | Annahme | `app.on_auth_user_signed_in` (`20261003000905`) | Ereignis |
| IP-Drossel | `public.signup_attempts` | 24 h | Zeit | Job `fermata-waitlist-cleanup` | Job |
| Tagessalze | `ops.daily_salts` | 2 Tage | Zeit | Job `fermata-waitlist-cleanup` | Job |
| Plakat-Zähler | `public.link_hits` | dauerhaft (kein Personenbezug) | – | – | – |
| Nie angenommene Einladung samt vorbereitetem Konto | `auth.users`, `app.account_invitations` | 7 Tage (`account.invitation_valid_days`) | Zeit | `ops.expire_invitations()`, Job `fermata-expire-invitations` (M2) | Job |
| Konto, Fakten, Ort, Profil, Wünsche, Gewichte, Embeddings, Zeiten, Abende, Rückmeldungen, Mitgliedschaft, Kontingent, Sanktionen, Push-Abos | alle Tabellen mit `on delete cascade` an `auth.users` | bis Kontolöschung | Kontolöschung | Edge Function `account-delete` (Abschnitt 3) | Ereignis |
| Art.-9-Angaben | `sensitive.profile_identity`, `sensitive.profile_sensitive` | bis Widerruf | Widerruf; Kontolöschung | `api.revoke_consent` (sofort) | Ereignis |
| Gesundheitsangaben | `sensitive.profile_sensitive.health_notes_enc` | werden in Phase 1 **nicht erhoben** (Einwilligung `art9_health` nicht angeboten, C10) | – | – | – |
| Gesprächstext | `app.interview_transcripts` | 30 Tage (`interview.transcript_retention_days`) | Zeit; Widerruf `gespraech` | `ops.purge_transcripts()`, Job `fermata-purge-transcripts` (stündlich); `api.revoke_consent` | Job |
| Gesprächstext mit Sicherheits-Hinweis | dto. | wie oben; verlängerbar über `interview.safety_transcript_retention_days` (B5, heute 30 = keine Verlängerung). Einsicht durch Benn nur über `api.admin_safety_transcript` (Zwei-Faktor, offener Sicherheitsfall, Begründung, Audit) | Zeit | `api.agent_flag_safety` setzt `delete_at` | Job |
| Entwurf der Zusammenfassung | `app.interview_sessions.summary_draft` | geleert **30 Tage** nach Bestätigung, Korrektur, Verwerfen oder Ende des Gesprächs (`retention.summary_draft_days`); ein nie bestätigter Entwurf bekommt dabei den Status `none` | Zeit | Job `fermata-retention` | Job |
| Audio | – | wird nicht gespeichert | – | `record=False` | – |
| Ausweisprüfung bei Didit | Didit | sofort nach dem Ergebnis; Sicherung 1 Monat (Didit-Konsole) | Ergebnis | `verification-webhook` (`DELETE /v2/session/{id}/delete/`), Nachholen über `ops.verifications_pending_deletion` | Ereignis; Konsole: TODO |
| Ergebnis der Ausweisprüfung | `app.verifications` | bis Kontolöschung | Kontolöschung | Kaskade | Ereignis |
| Sperrlisten-Hashes der Person | `safety.verification_hashes` | bis Kontolöschung | Kontolöschung | Kaskade | Ereignis |
| Teil-Scores, Lauf-Teilnahmen | `app.pair_candidates`, `app.match_run_members` | 12 Monate nach Laufende (`matching.score_retention_months`) | Zeit | `ops.purge_match_scores()`, Job `fermata-purge-match-scores` (täglich) | Job |
| Gesamtscore, Prüfnotizen und Kommentar eines Vorschlags | `app.pairings.total_score`, `review_notes`, `review_comment` | geleert 12 Monate nach Laufende (gleiche Einstellung `matching.score_retention_months`); der Vorschlag selbst bleibt bis Kontolöschung | Zeit | Job `fermata-retention` | Job |
| Lauf-Berichte | `app.match_runs` | dauerhaft (Summen, k-anonym) | – | – | dauerhaft |
| Freie Zeitfenster | `app.availability_windows` | **30 Tage** nach dem letzten Tag des Zeitraums (`retention.availability_days`); der Zeitraum selbst bleibt (ohne Personenbezug) | Zeit | Job `fermata-retention` | Job |
| Erkennungszeichen | `app.evening_hints` | bis Ende des Finde-Fensters (45 min nach Beginn) | Zeit | `ops.purge_evening_data()`, Job `fermata-evening-purge` (täglich) | Job |
| Nachrichten-Warteschlange | `ops.notification_queue` | 90 Tage nach Erledigung (`notify.queue_retention_days`) | Zeit | Job `fermata-evening-purge` | Job |
| Versandprotokoll | `ops.notifications_log` | **12 Monate** (`retention.notifications_log_months`, PLATZHALTER) | Zeit; Kontolöschung | Job `fermata-retention`; `ops.account_deletion_prepare` | Job |
| Push-Abos | `app.push_subscriptions` | bis Abmeldung/Widerruf | Widerruf `push`; Antwort 404/410; 20 Fehlschläge; Kontolöschung | `api.revoke_consent`, `ops.push_subscription_result` | Ereignis |
| Kontakttausch | `app.contact_shares` | mit dem Abend; Widerruf `kontakttausch` löscht offene Freigaben, freigegebene werden nicht mehr angezeigt | Widerruf; Kontolöschung | `api.revoke_consent`, `app.contact_share_for` (`20261003000906`) | Ereignis |
| „Abend teilen“ | `app.trust_shares` | Link ungültig 24 h nach Beginn; Zeile mit dem Abend | Zeit | Prüfung beim Abruf | Ereignis |
| Stripe-Ereignisse | `billing.stripe_events` | beim Eingang **gekürzt** (keine Karten-, Adress-, Kontakt-, Namens- und E-Mail-Felder, keine Rechnungslinks: `minimizeEvent` in der Function und `billing.stripe_strip_personal` in der Datenbank); gelöscht nach **13 Monaten** (`retention.stripe_events_months`, PLATZHALTER) – Stripe hält das Original | Zeit | Job `fermata-retention` | Job |
| Vertragserklärungen (Bestellung, Kündigung, Widerruf) | `billing.contract_actions` | bis Kontolöschung; danach ohne `user_id` weiter als Nachweis, gelöscht **6 Jahre nach Ende des Kalenderjahres** (`retention.contract_actions_years`, PLATZHALTER; Abschnitt 5) | Zeit | Job `fermata-retention` | Job |
| Kündigung/Widerruf ohne Anmeldung | `billing.contract_requests` | **30 Tage** nach Bestätigung oder Ablauf des Links (`retention.contract_requests_days`); der Eingangszeitpunkt steht dann in `contract_actions` | Zeit | Job `fermata-retention` | Job |
| Zeiträume mit Rechnungsbezug | `billing.membership_periods` | mit dem Konto gelöscht | Kontolöschung | Kaskade | **prüfen** mit Steuerberatung: Buchungsbelege 8 Jahre (§ 257 Abs. 4 HGB, § 147 Abs. 3 AO in der Fassung seit 2025) – Rechnungen liegen bei Stripe |
| Meldungen | `safety.reports` | **24 Monate** nach der Entscheidung (resolved/dismissed, `retention.reports_months`, PLATZHALTER); nie, solange eine Sanktion aus dieser Meldung gilt; offene Meldungen nie | Zeit | Job `fermata-retention` | Job |
| Sanktionen, Widersprüche | `safety.sanctions`, `safety.appeals` | mit dem Konto gelöscht | Kontolöschung | Kaskade | prüfen (Nachweis für Rechtsstreit?) |
| Sicherheits-Hinweise | `safety.safety_flags` | **24 Monate** nach der Prüfung (`retention.safety_flags_months`, PLATZHALTER); Sperrlisten-Hashes in Hinweisen „Konto gelöscht während Prüfung“ schon **30 Tage** nach der Prüfung entfernt (`retention.flag_hashes_days`; ein Ausschluss steht dann in `safety.blocklist`) | Zeit, Entscheidung | Job `fermata-retention` | Job |
| Sicherheits-Mail-Ausgang | `safety.mail_queue` | **30 Tage** nach Versand bzw. nach dem letzten erfolglosen Versuch (`retention.safety_mail_days`) | Zeit | Job `fermata-retention` | Job |
| Check-ins | `safety.checkins` | mit dem Abend | Kontolöschung | Kaskade | Ereignis |
| **Sperrliste** | `safety.blocklist` | **dauerhaft**, solange der Ausschluss gilt; Aufheben löscht den Eintrag | Aufhebung | `api.admin_lift_sanction` | dauerhaft; Begründung Abschnitt 4 |
| Einwilligungsnachweise | `app.consents` | mit dem Konto gelöscht | Kontolöschung | Kaskade | **Anwalt:** 3 Jahre nach Kontolöschung als Nachweis aufbewahren? |
| Rechtstexte | `ops.legal_documents` | dauerhaft (jede Fassung bleibt, alte mit Status `abgeloest`) | – | – | dauerhaft (Nachweis, worauf sich eine Einwilligung bezieht) |
| **Admin-Protokoll** | `ops.audit_log` | **dauerhaft**, Löschen per Trigger gesperrt | – | – | dauerhaft; Begründung Abschnitt 4a |
| Einstellungsverlauf | `ops.app_settings_history` | dauerhaft (Admin-ID) | – | – | dauerhaft |
| Kostenprotokoll | `ops.session_costs` | dauerhaft, ohne Personen-ID | – | – | dauerhaft |
| Anmeldeprotokolle mit IP | `auth.audit_log_entries` | **30 Tage** (`retention.auth_audit_days`, PLATZHALTER) | Zeit | Job `fermata-retention` (`postgres` darf dort löschen; fehlt das Recht, meldet der Job `null` – dann Aufgabe im Runbook) | Job |
| Partner-Lokale: Ansprechperson | `app.venues.contact_*` | **Vorschlag:** Kontaktfelder leeren 3 Jahre nach Ende der Partnerschaft; Lokal selbst bleibt (Verlauf der Abende) | Ende der Partnerschaft | Admin-Funktion | Vorschlag |
| Server-Protokolle der Anbieter | Supabase, Vercel, AWS CloudWatch, Brevo | je Anbieter | Zeit | Konfiguration | TODO (Runbook: CloudWatch 30 Tage) |
| Backups | Supabase | laut Tarif (z. B. 7 Tage tägliche Backups; PITR nach Einstellung) | Zeit | Anbieter | Konfiguration |

## 3. Ablauf der Kontolöschung (Härtung)

1. Person drückt „Konto löschen“ → Edge Function `account-delete`.
2. `ops.account_deletion_prepare` (`20261003000904_account_deletion.sql`):
   - Audit „Löschung beantragt“; Admin-Konten werden nicht selbst gelöscht;
   - läuft eine Sperre oder Meldung gegen die Person, entsteht ein Hinweis mit den Sperrlisten-Hashes (ohne Namen)
     für Benn;
   - **alle offenen und bevorstehenden Abende werden abgesagt** (`app.evening_transition(…, 'cancel_admin')`, Quelle
     `konto_geloescht`). Das Gegenüber bekommt die neutrale Nachricht aus M5 („Ihr Abend am … findet nicht statt“ bzw.
     „Aus dem Vorschlag wird diesmal kein Abend“, ohne Grund) und seinen Abend im Kontingent zurück; das Lokal bekommt
     die Absage der Reservierung, wenn es die Reservierung schon erhalten hatte;
   - diese Nachrichten hängen am Abend und würden mit ihm gelöscht. `ops.detach_evening_notifications` hält ihren
     Inhalt fest (`payload.snapshot`, ohne „Warum Sie beide“) und löst den Bezug; Nachrichten an die gelöschte Person
     entfallen. Der Empfänger (E-Mail-Adresse) wird weiter erst beim Versand aufgelöst;
   - läuft ein Stripe-Abo (Status pending, active, past_due oder gekündigt mit Restlaufzeit), hält
     `billing.record_deletion_cancellation` eine **Kündigung „konto_geloescht“** fest (Vertragsnummer, Zeitpunkt,
     Stripe-Kennung, **ohne Name und E-Mail**) und setzt die Mitgliedschaft auf `ended`;
   - Einladungen (auch per E-Mail), Versandprotokoll und Wartelisten-Eintrag werden gelöscht.
3. `account-delete` beendet das Abo bei Stripe sofort (`DELETE /v1/subscriptions/{id}`, keine anteilige Erstattung –
   PLATZHALTER C15) und meldet das Ergebnis (`ops.account_deletion_stripe_result`). **Fehler halten die Löschung nicht
   auf:** Sie stehen in `contract_actions.result`, im Audit (`account.stripe_cancel_failed`) und als Hinweis „hoch“ für
   Benn (mit Sofort-Mail); Benn beendet das Abo dann im Stripe-Dashboard. Gleiches gilt, wenn eine Absage fehlschlägt
   (Hinweis `abend_absage_bei_kontoloeschung_fehlgeschlagen`).
4. Supabase Auth löscht die Person; alle Tabellen mit `on delete cascade` folgen. (Behoben: Diese Kaskade scheiterte
   bisher am Anhänge-Trigger des Kontingent-Buchs, sobald ein Abend oder ein bezahlter Zeitraum bestand –
   `billing.ledger_append_only` erlaubt jetzt genau das Leeren von `evening_id`/`period_id`.)
5. Bleiben ohne Konto-Bezug: `billing.contract_actions` (Abschnitt 5), `safety.reports` (IDs `null`, Schilderung
   bleibt bis zur Frist), `safety.safety_flags` (`user_id = null`), `ops.audit_log`, `ops.session_costs`,
   Lauf-Berichte, die festgehaltenen Nachrichten an Gegenüber und Lokal (bis zum Versand, danach 90 Tage).
6. `ops.account_deletion_done`: Nachweis im Audit; Bestätigungs-Mail.

**Offen:**

- **Gemeinsame Abende:** `app.evenings` hängt mit `on delete cascade` an beiden Personen. Löscht eine Person ihr
  Konto, verschwinden vergangene Abende, beide Rückmeldungen, Kontakttausch und Check-ins auch für das Gegenüber.
  Datensparsam, aber das Gegenüber verliert seinen Verlauf (und Benn die Rückmeldung zu einem möglichen
  Sicherheitsfall). Entscheidung Benn/Anwalt; Alternative: Bezug auf die gelöschte Person `null` setzen.
- Sanktionen verschwinden mit dem Konto; die Sperrliste bleibt. Für einen späteren Rechtsstreit fehlt dann der
  Nachweis der Sanktion [[Anwalt]].
- Der Stripe-Kunde bleibt bei Stripe (Rechnungen, gesetzliche Pflichten von Stripe). Benn löscht ihn nicht selbst.

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

## 4a. Begründung: Admin-Protokoll ohne Löschfrist

- **Zweck:** Nachweis nach Art. 5 Abs. 2 und Art. 32 DSGVO, wer wann Meldungen, Konten, Transkripte (mit Begründung),
  Vorschläge, Einstellungen und Polizeivorlagen eingesehen oder entschieden hat. Bei einer Beschwerde, einer
  Datenpanne oder einem Strafverfahren muss Fermata das lückenlos zeigen können.
- **Warum keine Löschfunktion:** Das Protokoll ist „nur anhängen“ (Trigger `audit_log_append_only`). Eine
  Löschfunktion – auch mit Frist – wäre eine Hintertür, mit der sich Einsichten verwischen ließen; beim einzigen Admin
  (R10 der DSFA) wiegt das schwer.
- **Minimierung:** Das Protokoll enthält keine Inhalte (keine Gesprächstexte, keine Schilderungen, keine
  Art.-9-Angaben), nur Kennungen, Zählungen und die Begründungen der Admins. Nach einer Kontolöschung bleiben nur
  pseudonyme Kennungen.
- **Offen [[Anwalt/DSB]]:** eine Höchstfrist (z. B. 3 oder 6 Jahre) festlegen. Technisch ginge das nur über eine
  eigens freigegebene Funktion (Transaktionsvariable wie bei `app.evening_transition`) – bewusst nicht gebaut.

## 5. Ausnahmen und Sperrung

| Grund | Wirkung |
|---|---|
| Gesetzliche Aufbewahrung (HGB, AO), Nachweis von Vertragserklärungen | `billing.contract_actions` bleibt nach der Kontolöschung ohne `user_id` bis Fristende (unten) |
| Laufender Sicherheitsfall | Meldung und Hinweise bleiben bis zur Entscheidung (offene werden nie gelöscht); Meldungen, aus denen eine Sanktion gilt, bleiben bis zu deren Ende; Transkript nur bei Verlängerung (B5) |
| Rechtsstreit oder behördliche Anfrage | Löschung aussetzen für die betroffenen Datensätze (Entscheidung Benn mit Anwalt, im Audit vermerken; technisch: Frist der Einstellung vorübergehend erhöhen) |

**Vertragserklärungen nach der Kontolöschung (`billing.contract_actions`):**

- **Was bleibt:** Bestellung (gezeigte Übersicht, Knopftext, Verlangen des Leistungsbeginns mit Fassung), Kündigung
  und Widerruf **mit dem Namen und der Kontakt-E-Mail, die die Person im Formular angegeben hat**, Art, Grund,
  Vertragsnummer, Zeitpunkte, Ergebnis (Stripe, Erstattung). Eine Kündigung wegen Kontolöschung enthält bewusst
  **keinen** Namen und keine E-Mail.
- **Warum:** Fermata muss Eingang und Wirkung dieser Erklärungen nachweisen können – Kündigungsbutton (§ 312k BGB),
  Widerrufsbutton (§ 356a BGB), Wertersatz (§ 357a BGB), Abwehr oder Durchsetzung von Ansprüchen. Grundlage:
  Art. 6 Abs. 1 lit. c (Aufbewahrungspflichten, soweit es Handels- oder Geschäftsbriefe bzw. Buchungsbelege sind:
  § 257 HGB, § 147 AO) und lit. f DSGVO (Rechtsverteidigung), Art. 17 Abs. 3 lit. b und e DSGVO.
- **Wie lange:** `retention.contract_actions_years` = 6 Jahre ab Ende des Kalenderjahres der Erklärung (PLATZHALTER:
  mindestens 3 Jahre wegen der regelmäßigen Verjährung, § 195, § 199 BGB; 6 Jahre für Geschäftsbriefe; Buchungsbelege
  8 Jahre – die Rechnungen selbst liegen bei Stripe). Danach löscht der Job `fermata-retention` die Zeilen ohne Konto.
- Die frühere Code-Anmerkung „user_id wird null, gesetzlich Nötiges bleibt ohne Personenbezug“ war ungenau: ohne
  `user_id`, aber mit Name und E-Mail im Nachweis. Kommentar an Tabelle und Spalte ist korrigiert
  (`20261003000905_retention.sql`).

## 6. Umsetzung (Technik)

- Ein täglicher Job `fermata-retention` mit `ops.apply_retention()`; jede Frist ist eine Einstellung `retention.*`
  (Liste in `docs/DATA.md` Abschnitt 6 und `docs/PLATZHALTER.md` C11). Zurück kommen nur Zählungen.
- Test mit der Testuhr: `supabase/tests/905_retention.test.sql` (`ops.sim_clock_advance` über 31 Tage, 13 Monate,
  24 Monate und 7 Jahre; offene Fälle, geltende Sanktionen und das Audit-Protokoll bleiben).
- Stripe-Ereignisse werden schon beim Eingang gekürzt (`billing.accept_stripe_event` →
  `billing.stripe_strip_personal`); vorhandene Zeilen wurden in der Migration nachgekürzt.
- `auth.audit_log_entries`: `postgres` darf dort löschen (geprüft im Supabase-Abbild 17.6.1.054). Sollte das im
  gehosteten Projekt nicht gehen, liefert der Job `auth_audit_log_entries: null`; dann gilt die Aufgabe im Runbook
  (Abschnitt 7, monatlich).

## Offene Punkte für Benn/Anwalt

1. Alle Fristen mit PLATZHALTER bestätigen oder ändern (C11).
2. Aufbewahrung von Vertragserklärungen und Buchungsbelegen mit Steuerberatung klären (3 / 6 / 8 Jahre).
3. Gemeinsame Abende bei Kontolöschung: Kaskade oder Bezug lösen?
4. Einwilligungsnachweise und Sanktionen nach Kontolöschung behalten?
5. Höchstfrist für das Admin-Protokoll festlegen (Abschnitt 4a).
6. Kontolöschung bei laufender Mitgliedschaft: anteilige Erstattung (C15)?
7. Überprüfungsrhythmus der Sperrliste.
8. Fristen der Anbieter-Protokolle eintragen.
