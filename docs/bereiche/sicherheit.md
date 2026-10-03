# Sicherheit (M7)

Stand: 03.10.2026 · Bereich: Backend und API (Datenbank, Edge Functions). Die Oberfläche baut eine spätere Welle auf dieser Schnittstelle.
Texte für Mitglieder: ruhig, „Sie“, ohne Schuldzuweisung. Rechtliche Teile (Polizeivorlage, Datenschutz) sind **ENTWURF**.

---

## 1. Die 15 Sicherheitsstandards

> **Zu vergleichen mit Abschnitt „Sicherheit“ des Auftrags.** Die Liste aus dem Auftrag liegt nicht im Repository. Diese 15 Standards sind aus PLAN.md abgeleitet (Abschnitte 1 Nr. 9, 2.2, 3.2, 4 M7, 5.2). Bitte mit dem Auftrag abgleichen und Abweichungen hier eintragen.

| # | Standard | Wo und wie umgesetzt | Nachweis (Tests) |
|---|---|---|---|
| 1 | **Ausweisprüfung vor dem ersten Abend** (volljährig, Name und Geburtsdatum passen) | M2: Didit, `app.verifications`, `app.is_verified()`. Hier: Bei der Prüfung gespeicherte Sperrlisten-Hashes (`safety.verification_hashes`) machen einen späteren Ausschluss wirksam. | M2; `710_safety_admin` (Ausweis-Hash landet auf der Sperrliste) |
| 2 | **Sperrliste** nur mit Hashes: Ausweis-Hash sperrt automatisch, Namens-Hash meldet nur einen Verdacht | `safety.blocklist`; Ausschluss schreibt Namens-Hash und – wenn bei der Prüfung gespeichert – Ausweis-Hash (`api.admin_impose_sanction`). Einheitliche Schlüssel: `safety.blocklist_name_hash()`, `safety.blocklist_doc_hash()`. Aufheben des Ausschlusses entfernt den Eintrag. | `710_safety_admin` |
| 3 | **Nur öffentliche Orte**: Abende finden ausschließlich in Partner-Lokalen statt | M4/M5: jeder Abend hat ein Lokal aus `app.venues`; kein Treffen an privaten Orten vorgesehen. „Abend teilen“ zeigt das Lokal. | M4/M5; `720_safety_trust_checkin`, `trust-view/handler.test.ts` |
| 4 | **Keine Kontaktdaten vor beidseitigem Ja** | Kern: `app.contact_shares` nur nach beidseitigem Ja. Hier: keine Sicherheits-Mail, kein geteilter Link und keine Absage nennt das Gegenüber. | `720_safety_trust_checkin` („Keine Daten des Gegenübers“), `safety.test.ts` |
| 5 | **Melden überall** (Abend, Termin, Gespräch, Rückmeldung, Konto, Sonstiges) | `api.report(context, category, …)` für jede angemeldete Person; Beziehungsprüfung, Drossel, Bestätigungs-Mail, Hinweis für Benn. | `700_safety_reports` |
| 6 | **Vorläufige Sperre sofort** bei Null-Toleranz (Übergriff, Bedrohung, Verdacht auf Minderjährigkeit) | `safety.provisional_suspend`: Sanktion, Konto `suspended`, alle offenen und bevorstehenden Abende abgesagt, Gegenüber neutral informiert, akuter Hinweis für Benn. | `700_safety_reports` |
| 7 | **Prüfung innerhalb von 24 Stunden** | `reports.due_at` = Eingang + `safety.report_response_hours`; Admin-Liste sortiert nach Stufe und Frist, zeigt Überfälliges; Sofort-Mail an Benn ab Stufe „hoch“. | `700_safety_reports`, `710_safety_admin` |
| 8 | **Hilfe-Knopf** mit Heimwegtelefon und 110 (dazu 112, TelefonSeelsorge, Hilfetelefon Gewalt gegen Frauen) | `api.help_contacts()` öffentlich aus den Einstellungen, mit wählbaren Nummern. | `720_safety_trust_checkin` |
| 9 | **Abend teilen** mit einer Vertrauensperson | `api.create_trust_share` → Link auf `trust-view` (Lokal, Adresse, Zeit, eigener Vorname, Heimwegtelefon); Schlüssel nur als Hash; läuft `safety.trust_share_hours` nach Beginn ab, zurückziehbar; abgesagte Abende zeigen nichts. | `720_safety_trust_checkin`, `trust-view/handler.test.ts` |
| 10 | **Check-in nach 30 Minuten** | M5 schickt die Nachricht nach `safety.checkin_after_minutes`. Hier: `api.checkin_respond` – „hilfe“ liefert Hilfe-Nummern, akuter Hinweis und Sofort-Mail an Benn; „unsicher“ Hinweis „hoch“. | `720_safety_trust_checkin` |
| 11 | **Null-Toleranz mit Vorlage für eine Polizeimeldung** | `api.admin_police_report_template(report_id)`: Entwurf mit den vorhandenen Fakten, Platzhaltern und dem Hinweis, dass Benn entscheidet. | `710_safety_admin` |
| 12 | **Widerspruch** gegen jede Sanktion | `api.appeal` (einmal je Sanktion), `api.admin_decide_appeal`; Entscheidung per Mail; angenommen → Sanktion aufgehoben. | `700_safety_reports`, `710_safety_admin` |
| 13 | **Keine Namen in Push-Nachrichten** (und in Hinweis-Mails an Benn) | M5 formuliert Push ohne Namen. Hier: Sofort-Mails an Benn enthalten keine Namen, nur Art, Stufe, Zeit und Link in den Admin-Bereich (Zwei-Faktor). | `safety.test.ts` |
| 14 | **Einweisung des Personals in Partner-Lokalen** | Organisatorisch (Abschnitt 9, Frage B10). Nicht im Code. | – |
| 15 | **Datensparsamkeit**: die gemeldete Person erfährt nie, wer gemeldet hat; nur nötige Daten in Links und Mails | Keine Lese-Rechte auf `safety.*` für Mitglieder; Sanktionen ohne Meldungsbezug sichtbar; Absagen ohne Absender und Grund; Mail-Ausgang ohne Adressen (Auflösung erst beim Versand); Sperrliste nur Hashes; Admin-Einsicht im Audit-Protokoll. | `700_safety_reports` (Anonymität), `710_safety_admin` |

---

## 2. Melden

`api.report(p_context, p_category, p_reported_user?, p_evening_id?, p_description?, p_wants_contact?)`

- **Bereiche:** `abend`, `termin`, `gespraech`, `rueckmeldung`, `konto`, `sonstiges`.
- **Arten und Stufen:** `uebergriff`, `bedrohung`, `minderjaehrig` → **akut** (Null-Toleranz, `safety.zero_tolerance_categories`); `belaestigung`, `diskriminierung`, `falsche_identitaet`, `betrug` → hoch; `nicht_erschienen`, `unangenehm`, `sonstiges` → mittel.
- **Beziehungsprüfung:** Wer eine Person meldet, muss sie über Fermata kennen (gemeinsamer Abend oder ein gezeigter Vorschlag). Ausnahme: Bereich `sonstiges` – die Meldung wird angenommen, löst aber **keine** automatische Sperre aus (Schutz vor Missbrauch) und ist als „ohne Beziehung“ markiert. Bei Angabe eines Abends muss die meldende Person dazugehören und die gemeldete auch.
- **Drossel:** höchstens `safety.report_rate_limit_per_day` (5) Meldungen in 24 Stunden; die Fehlermeldung verweist auf 110.
- **Folgen:** Meldung mit Frist `due_at`, Hinweis für Benn (`safety.safety_flags`), Bestätigungs-Mail an die meldende Person, Sofort-Mail an Benn ab Stufe `safety.admin_alert_min_severity` (hoch). Null-Toleranz mit Beziehung → vorläufige Sperre (Abschnitt 3).

## 3. Vorläufige Sperre

1. Sanktion `vorlaeufige_sperre` (ohne Ende), alter Kontostatus wird gemerkt, Konto `suspended`.
2. Alle offenen Vorschläge und bestätigten, noch nicht begonnenen Abende werden über `app.evening_transition(…, 'cancel_admin')` abgesagt (neue Übergänge für `proposed`, `time_requested`, `time_countered` → `declined`; bestätigte → `cancelled_early`). Beide bekommen gebundene Abende zurück.
3. Das Gegenüber jedes Abends bekommt die Mail „Ihr Abend findet nicht statt“ – ohne Grund, ohne Person. `cancelled_by` und `cancel_reason` bleiben leer.
4. Die gemeldete Person bekommt eine neutrale Mail („Ihr Konto ist vorübergehend gesperrt, solange wir einen Hinweis prüfen“) mit Weg zum Widerspruch – ohne Hinweis auf die meldende Person.
5. Akuter Hinweis für Benn; die Sofort-Mail zur Meldung nennt die Sperre.

Bereits begonnene Abende (Startzeit vorbei) bleiben unberührt; dort greifen Check-in und Hilfe-Knopf.

## 4. Prüfung durch Benn (Admin, nur mit Zwei-Faktor)

| Funktion | Zweck |
|---|---|
| `api.admin_reports(p_status?)` | offene Meldungen (Standard) oder nach Status; mit Namen beider Seiten, Beziehung, früheren Meldungen, aktiver Sanktion, „überfällig“ |
| `api.admin_report(p_report_id)` | Einzelansicht: Meldung, Abend (Lokal, Verlauf, Check-ins), frühere Meldungen, Sanktionen, Hinweise. Jede Einsicht steht im Audit-Protokoll. |
| `api.admin_set_report_status(id, 'in_review')` | in Prüfung nehmen |
| `api.admin_decide_report(id, 'resolved'|'dismissed', begründung, lift_provisional?)` | abschließen; bei `dismissed` wird eine vorläufige Sperre aus dieser Meldung aufgehoben (abschaltbar), zugehörige Hinweise erledigt; meldende Person bekommt eine Abschluss-Mail ohne Einzelheiten |
| `api.admin_impose_sanction(user, 'hinweis'|'sperre'|'ausschluss', begründung, ende?, report_id?, blocklist_reason?)` | Hinweis (nur Mitteilung), Sperre (befristet oder unbefristet), Ausschluss (dauerhaft + Sperrliste). Sperre und Ausschluss ersetzen eine vorläufige Sperre und sagen offene Abende ab. Die Begründung sieht die Person – **keine Angaben zur meldenden Person**. |
| `api.admin_lift_sanction(id, begründung)` | aufheben; Konto zurück auf den vorherigen Status, Ausschluss löscht den Sperrlisten-Eintrag |
| `api.admin_sanctions(user?, nur_aktive?)` | Sanktionen mit Widerspruch |
| `api.admin_appeals(status?)`, `api.admin_decide_appeal(id, 'accepted'|'rejected', begründung)` | Widersprüche; Entscheidung per Mail |
| `api.admin_safety_flags(nur_offene?)`, `api.admin_review_flag(id, ergebnis)` | Hinweise (Sicherheits-Agent, Sperrliste, Meldungen, Check-in, wiederholtes Nichterscheinen) |
| `api.admin_police_report_template(report_id)` | Vorlage für eine Polizeimeldung (Abschnitt 5) |

Befristete Sperren enden automatisch (`safety.release_expired_sanctions()`, stündlich); das Konto wird wieder freigegeben und die Person informiert. Konten, die aus anderen Gründen gesperrt sind (z. B. M2), bleiben unberührt.

**Sperrliste beim Ausschluss:** Der Ausweis-Hash lässt sich ohne Ausweisnummer nicht berechnen. Deshalb: Namens-Hash aus Name und Geburtsdatum (`private.account_facts`), Ausweis-Hash aus `safety.verification_hashes`, wenn M2 ihn bei der Prüfung abgelegt hat. Fehlt er, steht in `blocklist.note` „doc_hash aus Ausweisprüfung nachtragen“, und die Antwort meldet `doc_hash_missing: true`.

## 5. Vorlage für eine Polizeimeldung

`api.admin_police_report_template(report_id)` liefert Text:
„ENTWURF – Sachverhaltsdarstellung für eine Strafanzeige“ mit Art des Vorfalls, Tatzeit (Beginn des Abends), Tatort (Lokal mit Anschrift), Angaben zur beschuldigten Person (Name, Geburtsdatum, Wohnort aus dem geprüften Konto), Schilderung im Wortlaut, Zeitpunkt der Meldung, bisherige Maßnahmen, Platzhalter in [ECKIGEN KLAMMERN] für Fehlendes (Dienststelle, Beweismittel) und die Erinnerung: **Ob Anzeige erstattet wird, entscheidet Benn – nach Rücksprache mit der betroffenen Person.** Die meldende Person steht nur als Platzhalter drin („nur mit ausdrücklichem Einverständnis eintragen“). Hinweis zur Rechtsgrundlage der Weitergabe (ENTWURF, Art. 6 Abs. 1 lit. f DSGVO, § 24 BDSG). Jeder Abruf steht im Audit-Protokoll.

## 6. Abend teilen

- `api.create_trust_share(evening_id)` → `{share_id, token, expires_at, url}`; nur für Beteiligte, nur bei bestätigtem Abend mit Zeit; höchstens `safety.trust_shares_per_evening` (3) aktive Links. Der Schlüssel (192 Bit) wird nur als SHA-256 gespeichert und nur einmal zurückgegeben.
- Öffentliche Seite `GET /functions/v1/trust-view?t=<token>` (HTML; mit `Accept: application/json` als JSON): Lokal, Adresse, Anfahrt, Datum und Uhrzeit, **nur der eigene Vorname**, Heimwegtelefon, 110. Kein Wort über das Gegenüber. Strenge Header (`noindex`, `no-referrer`, CSP ohne Skripte).
- Ungültig nach `safety.trust_share_hours` (24 h) ab Beginn, nach `api.revoke_trust_share`, oder wenn der Abend abgesagt ist.

## 7. Check-in und Hilfe

- M5 schickt `safety.checkin_after_minutes` (30) nach Beginn die Frage; die Antwort geht an `api.checkin_respond(evening_id, 'gut'|'unsicher'|'hilfe')`.
- `hilfe` → Rückgabe der Hilfe-Nummern, akuter Hinweis, **Sofort-Mail an `safety.admin_alert_email`** („Bitte sofort … anrufen. Bei Gefahr: 110.“).
- `unsicher` → Hilfe-Nummern, Hinweis „hoch“ (Mail an Benn ab Stufe hoch).
- `api.help_contacts()` (ohne Anmeldung): Heimwegtelefon (Nummer, Zeiten, wählbar), Polizei 110, Notruf 112, TelefonSeelsorge (0800 111 0 111, 0800 111 0 222, 116 123), Hilfetelefon Gewalt gegen Frauen (116 016). **Alle Nummern vor dem Start erneut prüfen (M9).**

## 8. Mail-Ausgang der Sicherheit

Sicherheits-Mails laufen über einen eigenen kleinen Ausgang `safety.mail_queue` (unabhängig von der Benachrichtigungs-Queue aus M5). Die Zeilen enthalten keine Adressen und keine Namen; die Adresse wird erst beim Versand aufgelöst (Mitglied: `auth.users`, Benn: `safety.admin_alert_email`).

- Versand: Edge Function `safety-dispatch` (intern, `FERMATA_INTERNAL_SECRET`). Bis zu `safety.mail_max_attempts` (5) Versuche, keine Doppelzustellung (Sperre je Zeile).
- **Sofort:** Jede Meldung, Sperre, jeder Check-in „hilfe“ ruft über `pg_net` direkt `safety-dispatch` auf (`internal.functions_base_url` und Vault `fermata_internal_secret` setzen). **Rückfall:** pg_cron jede Minute.
- Vorlagen: `supabase/functions/_shared/mail/templates/safety.ts` (Meldung erhalten, Abend findet nicht statt, Konto vorübergehend gesperrt, Entscheidung, Sperre aufgehoben, Widerspruch erhalten/entschieden, Meldung bearbeitet, Hinweis an Benn).

## 9. Einweisung der Partner-Lokale (Standard 14, Entwurf für Benn)

Kurze Einweisung je Lokal, schriftlich bestätigt (Vereinbarung, Frage B10):
- Was Fermata ist; Reservierung läuft auf „Fermata“, nicht auf Namen.
- Gäste dürfen jederzeit gehen; das Personal ruft auf Bitte ein Taxi oder hilft, die Polizei zu rufen (110).
- Wer sich unwohl fühlt, kann sich ans Personal wenden; das Personal begleitet, ohne Fragen zu stellen. Prüfen: Teilnahme an einer bestehenden Kampagne wie „Ist Luisa hier?“.
- Keine Auskunft über Gäste an Dritte, auch nicht an das Gegenüber.
- Vorfälle meldet das Lokal an `safety.admin_alert_email`.

---

## 10. Schnittstelle für die Oberfläche

Fehler: deutscher Text (`message`) und fester Code (`hint`). Über PostgREST kommen sie als `{code, message, hint}`.

| Funktion | Wer | Rückgabe | Fehler (`hint`) |
|---|---|---|---|
| `api.report(p_context, p_category, p_reported_user?, p_evening_id?, p_description?, p_wants_contact? = true)` | angemeldet | `{report_id, status, due_at, severity}` | `not_authenticated`, `invalid_context`, `invalid_category`, `description_too_long`, `self_report`, `evening_not_found`, `not_related`, `rate_limited` |
| `api.my_reports()` | angemeldet | eigene Meldungen `(id, context, category, evening_id, status, created_at, due_at, resolved_at)` | – |
| `api.my_sanctions()` (Kern) | angemeldet | eigene Sanktionen ohne Meldungsbezug | – |
| `api.appeal(p_sanction_id, p_text)` | angemeldet | `{appeal_id, status}` | `sanction_not_found`, `sanction_lifted`, `invalid_text` (10–4000 Zeichen), `already_appealed` |
| `api.my_appeals()` | angemeldet | eigene Widersprüche mit Entscheidung | – |
| `api.help_contacts()` | alle | `{heimwegtelefon{name, number, tel, hours, description}, police, emergency, telefonseelsorge{numbers, tels, hours}, hilfetelefon_gewalt, note}` | – |
| `api.checkin_respond(p_evening_id, p_status)` | Beteiligte | `{checkin_id, status, help}` (`help` bei unsicher/hilfe) | `invalid_status`, `evening_not_found`, `checkin_not_possible` |
| `api.create_trust_share(p_evening_id)` | Beteiligte | `{share_id, token, expires_at, url}` | `evening_not_found`, `evening_not_confirmed`, `evening_over`, `too_many_shares` |
| `api.revoke_trust_share(p_share_id)` | Ersteller | `boolean` | – |
| `api.my_trust_shares(p_evening_id?)` | angemeldet | `(id, evening_id, created_at, expires_at, revoked_at, active)` | – |
| Admin-Funktionen (Abschnitt 4) | Admin mit aal2 | siehe Abschnitt 4 | `admin_required` und je Funktion `invalid_*`, `*_not_found`, `*_required`, `blocklist_data_missing` |

Edge Functions: `trust-view` (öffentlich, GET), `safety-dispatch` (intern).

### Für andere Bereiche

- **M2:** Nach erfolgreicher Ausweisprüfung `safety.verification_hashes` schreiben: `doc_hash = safety.blocklist_doc_hash(ausweisnummer, geburtsdatum)`, `name_hash = safety.blocklist_name_hash(vorname, nachname, geburtsdatum)`; beim Abgleich mit `safety.blocklist` dieselben Funktionen nutzen.
- **M3 (Viola):** Hinweise des Sicherheits-Agenten in `safety.safety_flags` (Quelle `agent`) erscheinen in `api.admin_safety_flags`; für eine Sofort-Mail an Benn `safety.raise_flag(...)` statt direktem Insert nutzen.
- **M5:** Check-in-Nachricht schicken und auf `api.checkin_respond` verlinken; bei `cancel_admin` mit `details.notify_by = 'safety'` keine eigene Absage-Nachricht; `no_show` mit `details.no_show_user`.

---

## 11. Platzhalter und offene Entscheidungen

| Punkt | Stand | Einstellung |
|---|---|---|
| Adresse für Sofort-Hinweise an Benn | `sicherheit@fermata.example` (PLATZHALTER) | `safety.admin_alert_email` |
| Ab welcher Stufe Mail an Benn | hoch | `safety.admin_alert_min_severity` |
| B7 Erkennungsfoto am Abendtag | nicht gebaut, offen | – |
| B9 Folgen wiederholten Nichterscheinens | ab 2× Hinweis an Benn, keine automatische Folge | `safety.no_show_flag_threshold` |
| Null-Toleranz-Arten | Übergriff, Bedrohung, Minderjährigkeit | `safety.zero_tolerance_categories` |
| Hilfe-Nummern (Heimwegtelefon, TelefonSeelsorge, Hilfetelefon) | eingetragen, vor dem Start prüfen (M9) | `safety.*_number`, `safety.*_hours` |
| Adresse der Seite „Abend teilen“ | PLATZHALTER | `safety.trust_view_base_url` |
| Polizeivorlage, Rechtsgrundlage der Weitergabe | ENTWURF für den Anwalt | – |
| B5 Transkripte bei Sicherheitsfällen länger aufbewahren | nicht in diesem Bereich (M3) | – |

## 12. Abweichungen und Entscheidungen

1. **Automatische Sperre nur mit Beziehung:** Null-Toleranz-Meldungen sperren nur, wenn sich beide über Fermata kennen. Sonst Meldung mit akutem Hinweis, Benn entscheidet. Grund: Sonst könnte jede Person jede andere per Meldung sperren.
2. **Eigener Mail-Ausgang** (`safety.mail_queue` + `safety-dispatch`) statt der Queue aus M5, wie vorgegeben; „sofort“ über pg_net, sonst spätestens nach einer Minute.
3. **Absage durch Fermata** setzt weder `cancelled_by` noch `cancel_reason`, damit niemand aus dem Abend etwas ableiten kann.
4. **Reaktionen auf Abend-Wechsel** (wiederholtes Nichterscheinen) hängen wie das Kontingent an `app.evening_events`.
5. **Rechte gehärtet:** Alle Funktionen in `safety` ohne `PUBLIC`-Ausführung; siehe Hinweis an den Kern in `mitgliedschaft.md`, Abschnitt 11.
6. Die Kontext-Liste der Meldungen nutzt die Werte aus dem Kern (`abend`, `termin`, `gespraech`, `rueckmeldung`, `konto`, `sonstiges`).

## 13. Einstellungen (neu in diesem Bereich)

`safety.admin_alert_email`, `safety.admin_alert_min_severity`, `safety.report_rate_limit_per_day`, `safety.zero_tolerance_categories`, `safety.ambulance_number`, `safety.telefonseelsorge_numbers`, `safety.telefonseelsorge_hours`, `safety.hilfetelefon_gewalt_number`, `safety.hilfetelefon_gewalt_hours`, `safety.trust_view_base_url`, `safety.trust_shares_per_evening`, `safety.no_show_flag_threshold`, `safety.mail_max_attempts`.

Genutzt aus dem Fundament: `safety.heimwegtelefon_number`, `safety.heimwegtelefon_hours`, `safety.emergency_number`, `safety.trust_share_hours`, `safety.checkin_after_minutes`, `safety.report_response_hours`.

## 14. Dateien und Tests

- Migrationen: `supabase/migrations/20261003000710_safety_core.sql`, `…720_safety_admin.sql`, `…730_safety_reactions.sql`
- Edge Functions: `trust-view`, `safety-dispatch`; Mails `_shared/mail/templates/safety.ts`
- pgTAP: `700_safety_reports` (Beziehung, Drossel, Null-Toleranz, Absagen, neutrale Nachrichten, Anonymität, Widerspruch), `710_safety_admin` (nur aal2, Entscheidungen, Sanktionen, Sperrliste, Widersprüche, Hinweise, Polizeivorlage, Ablauf befristeter Sperren), `720_safety_trust_checkin` (Abend teilen mit Testuhr, Check-in, Hilfe-Knopf, Nichterscheinen, Versand)
- Deno: `trust-view/handler.test.ts`, `safety-dispatch/handler.test.ts`, `_shared/mail/templates/safety.test.ts`
