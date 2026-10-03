# Datenkarte (DATA.md)

Stand: 03.10.2026 · Meilenstein M8 · Grundlage: PLAN.md 2.2, 3.1–3.3 und der Code.

> **Hinweis:** Die Rechtsgrundlagen in dieser Datei sind Vorschläge. Sie sind ein **ENTWURF – nicht
> rechtsverbindlich, Prüfung durch Anwalt/Datenschutzbeauftragten ausstehend**. Fakten zu Tabellen, Rechten und
> Löschjobs sind aus dem Code abgelesen; wo Code und PLAN auseinandergehen, steht es dabei.

**Welcher Code gilt hier?**

| Bereich | Quelle | Stand |
|---|---|---|
| M0, M1, M4, M5, M6, M7 | Branch `build/docs` (diese Arbeitskopie), `supabase/migrations/20261003000000` bis `…099000` | zusammengeführt |
| M3 Viola | Hauptzweig `claude/dating-app-build-0uszhn` (Commit `e84647b`): `supabase/migrations/20261003000310_viola.sql`, `services/viola`, `supabase/functions/interview-*`, `docs/bereiche/viola.md` | zusammengeführt, aber noch nicht in `build/docs` |
| M2 Web-App | Branch `build/web` (Commit `e70b4a5`): `supabase/migrations/20261003000210` bis `…000270`, `supabase/functions/{account-*,admin-invite,verification-*}`, `apps/web` | **noch im Bau**, Dokumentation `docs/bereiche/web.md` fehlt noch |

Was M2 betrifft, ist hier als „M2 (im Bau)“ markiert und muss nach der Zusammenführung noch einmal geprüft werden.

---

## 1. Kurz für dich

- **Alle Mitgliederdaten liegen in einer Datenbank: Supabase, Frankfurt (AWS eu-central-1).** Dazu kommen Dienste,
  die Daten nur durchleiten oder kurz verarbeiten: Brevo (Mails, Frankreich), Stripe (Zahlung), Didit (Ausweis),
  AWS Frankfurt (Viola, Auswahl-Job, Sprachmodell, Stimme), Deepgram EU (Spracherkennung), LiveKit (Sprachverbindung),
  Vercel (Auslieferung der Seiten), Push-Dienste von Apple, Google und Mozilla.
- **Art.-9-Daten** (Geschlecht, gesuchtes Geschlecht, Orientierung, Religion, Gesundheit) liegen verschlüsselt im
  Schema `sensitive`. Die Auswahl und das Sprachmodell der Auswahl sehen sie nie; sie bekommen nur Ja/Nein.
- **Ausnahme, die du kennen musst:** Im Gespräch mit Viola gehen die gesprochenen Worte live an Deepgram und an das
  Sprachmodell (Bedrock). Erzählt jemand von sich aus etwas zu Gesundheit oder Religion, wird das dort verarbeitet,
  aber nicht gespeichert (Transkript geschwärzt, Profil abgelehnt). Das muss so in die Texte (siehe Abschnitt 8).
- **Löschung und Fristen laufen automatisch** über 14 pg_cron-Jobs (Abschnitt 6; davon kommen je einer aus M2 und M3). Für einige Tabellen gibt es **noch keine
  Löschfrist** (Abschnitt 7, z. B. Meldungen, Stripe-Ereignisse, Versandprotokoll). Vorschläge dazu stehen im
  [Löschkonzept](recht/loeschkonzept.md).
- **Was die EU verlassen kann:** das EU-Geo-Profil von Bedrock (London, Zürich – mit Angemessenheitsbeschluss),
  US-Mutterkonzerne (Didit, Deepgram, Supabase, Vercel, Stripe, AWS, LiveKit), Push-Dienste (Inhalt
  Ende-zu-Ende-verschlüsselt). Details in Abschnitt 5.

---

## 2. Rollen und Zugriffswege

| Wer | Technisch | Darf |
|---|---|---|
| Besucherin der Landingpage | ohne Anmeldung; Edge Functions `waitlist-*`, `link-hit` | nur über Funktionen schreiben; liest nur eigene Statusseite per Geheimlink |
| Mitglied | Supabase-Rolle `authenticated`, RLS „nur eigene Zeilen“, Funktionen `api.*` | eigene Daten lesen, Regeln über `api.*` auslösen; Daten des Gegenübers nur Vorname, „Warum Sie beide“, Erkennungszeichen im Finde-Fenster, Kontaktdaten nach beidseitigem Ja |
| Benn (Admin) | `authenticated` + Eintrag in `app.admin_users` + Zwei-Faktor-Sitzung (`aal2`), geprüft durch `app.is_admin()` (`20261003000000_foundation.sql`) | Admin-Funktionen `api.admin_*`, Lesen per RLS-Policy „… or app.is_admin()“; jede Einsicht in Meldungen, Konten und Vorschläge steht in `ops.audit_log` |
| Edge Functions | direkte Verbindung `SUPABASE_DB_URL` als Rolle **`postgres`** (`supabase/functions/_shared/db.ts`) | alles, was `postgres` darf; Regeln liegen in SQL-Funktionen. Ausnahme Viola-Functions: setzen `set local role authenticated` bzw. `fermata_agent` |
| PostgREST mit `service_role`-Schlüssel | Rolle `service_role` | alle Tabellen in `app`, `private`, `safety`, `billing`, `ops`, **nicht** `sensitive.*` (Rechte entzogen, `20261003000200_accounts.sql`) |
| Auswahl-Job | Login-Rolle (z. B. `fermata_matcher_job`) → `SET ROLE fermata_matcher` | nur Lesen der für die Auswahl nötigen Tabellen, Schreiben von Läufen/Kandidaten/Vorschlägen; Art. 9 nur über Ja/Nein-Funktionen (`20261003000400`, `…000410`) |
| Viola-Dienst | kein Datenbankzugang; schreibt nur über Edge Function `interview-agent` (Geheimnis), die `set local role fermata_agent` setzt | nur `api.agent_*` |
| Art.-9-Tabellen | Eigentümerin `fermata_sensitive` (ohne Anmeldung) | Zugriff nur über `security definer`-Funktionen; Schlüssel `fermata_sensitive_key` in Supabase Vault |
| pg_cron-Jobs | laufen als `postgres` | Lösch- und Fristenjobs (Abschnitt 6) |

**Wichtig für die DSFA:** Weil die Edge Functions als `postgres` verbunden sind und `postgres` Mitglied von
`fermata_sensitive` ist, könnten sie technisch auch Art.-9-Tabellen lesen und den Vault-Schlüssel abrufen. Der Code
tut das nur in den vorgesehenen Funktionen (Speichern, Export). Die Verschlüsselung schützt also gegen PostgREST
(`service_role`), gegen die Auswahl-Rolle und gegen versehentliches Mitlesen, nicht gegen einen gestohlenen
Datenbank-Zugang `postgres`. Empfehlung in [tom.md](recht/tom.md) (eigene, enge Login-Rolle für Edge Functions).

---

## 3. Datenkarte nach Bereichen

Legende Rechtsgrundlage (Vorschlag): **a** = Einwilligung Art. 6 Abs. 1 lit. a, **b** = Vertrag lit. b,
**c** = rechtliche Pflicht lit. c, **d** = lebenswichtige Interessen lit. d, **f** = berechtigtes Interesse lit. f,
**9a** = ausdrückliche Einwilligung Art. 9 Abs. 2 lit. a DSGVO. „Konto gelöscht“ heißt: Edge Function
`account-delete` (M2) löscht die Person in Supabase Auth, alle Tabellen mit `on delete cascade` folgen.

Ort ist überall **Supabase Frankfurt**, wenn nichts anderes steht.

### 3.1 Landingpage und Warteliste (M1, `20261003000100_waitlist.sql`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `public.waitlist` | Vorname, E-Mail, Region, PLZ, Einwilligungsversion und -zeit, Plakat-Kürzel (`source`), Einladungscode der einladenden Person, Grundnummer, Vorrückungen, Gründungsstatus, Hashes von Bestätigungs-, Status- und Abmeldelink, Zeit der letzten Mail, `invited_to_app_at` | Warteliste, Platz, Einladungen, Start-Mails | a (Einwilligung `einwilligung_warteliste`) | nur Funktionen `api.waitlist_*` (Edge Functions); Benn nur Summen (`api.admin_waitlist_stats`); Person per Statuslink | unbestätigt: 7 Tage nach letzter Mail (`waitlist.unconfirmed_retention_days`, Job `fermata-waitlist-cleanup`); bestätigt: bis Abmeldung (`api.waitlist_unsubscribe`) oder Kontolöschung (M2 löscht den Eintrag mit, `ops.account_deletion_prepare`). **Wird bei Kontoeröffnung nicht gelöscht** (nur `invited_to_app_at` gesetzt) |
| `public.waitlist_invites` | Einladungscode, einladende Person, eingeladene Person, Zeit | Einladungen, Vorrücken | a | nur Funktionen | mit dem Eintrag der einladenden Person (`on delete cascade`) |
| `public.waitlist_counters` | letzte Grundnummer je Region | Platznummern | – (kein Personenbezug) | Funktionen | dauerhaft |
| `public.signup_attempts` | IP als HMAC mit Tagessalz, Zeit | Drossel gegen Missbrauch | f | niemand (nur Zählung) | 24 h (`waitlist.attempts_retention_hours`, Job `fermata-waitlist-cleanup`) |
| `ops.daily_salts` | Zufallssalz je Tag | macht IP-Hashes nach 2 Tagen unzuordenbar | f | Funktion `ops.daily_hash` | 2 Tage (Job `fermata-waitlist-cleanup`) |
| `public.link_hits` | Plakat-Kürzel, Tag, Anzahl | Plakat-Statistik | – (kein Personenbezug) | Benn (Summen) | dauerhaft |

Außerhalb Supabase: Vercel liefert die Seite aus (Zugriffsprotokolle bei Vercel, Dauer laut Vercel-Tarif – prüfen);
die Server-Funktion `/s/[kürzel]` läuft in `fra1` und gibt keine IP weiter. Mails (Bestätigung, Willkommen) über
Brevo. Im Browser: keine Cookies, kein Local Storage (Playwright-Test in `apps/landing/tests`).

### 3.2 Anmeldung und Konto (M2 im Bau, Kern in `20261003000200_accounts.sql`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `auth.users` (Supabase Auth) | E-Mail, Zeitpunkte der Anmeldung, Bestätigung | Anmeldung mit 6-stelligem Code | b | Person, Benn (über `api.admin_accounts`) | bis Kontolöschung; nie angenommene Einladung: nach `account.invitation_valid_days` (7) gelöscht (Job `fermata-expire-invitations`, M2) |
| `auth.sessions`, `auth.refresh_tokens`, `auth.mfa_factors`, `auth.one_time_tokens` | Sitzungen (laut Supabase mit IP und Browser-Kennung – prüfen), Zwei-Faktor-Schlüssel (Admin) | Anmeldung, Sicherheit | b, f | Supabase Auth | mit der Person; Sitzungsdauer laut Auth-Einstellungen |
| `auth.audit_log_entries` | Anmeldeereignisse mit IP-Adresse | Sicherheit | f | Benn im Supabase-Dashboard | **keine Löschfrist im Code** (Tabelle hängt nicht per Fremdschlüssel an der Person) – offen |
| `app.accounts` | Status, Anrede, freigeschaltete Gesprächstiefe, Gründungsstatus, SHA-256 der Wartelisten-E-Mail, Pause, Löschwunsch | Konto | b | Person (RLS), Benn, Auswahl (Status) | bis Kontolöschung |
| `app.account_invitations` | E-Mail (Klartext), Wartelisten-Bezug, einladender Admin, Gültigkeit, angenommen/zurückgezogen | Einladung aus dem Admin | b, f | Benn, Functions | nie angenommen: mit dem Konto gelöscht (Job `fermata-expire-invitations`); sonst bis Kontolöschung (`ops.account_deletion_prepare` löscht auch nach E-Mail) |
| `app.admin_users` | Admin-Kennung, Anzeigename | Admin-Rechte | b, f | Admin selbst | bis Entfernung |

### 3.3 Konto-Fakten und Ort (Schema `private`, `app.geo`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `private.account_facts` | Vor- und Nachname, Geburtsdatum, PLZ, Ort, Telefon (freiwillig), Straße (nur wenn `account.collect_street = true`, Standard aus – Frage B1) | Abgleich mit dem Ausweis, Altersprüfung, Kontakttausch (Telefon), Polizeivorlage | b (Telefon: freiwillig) | Person (`api.my_facts`), Benn (`api.admin_account`), Polizeivorlage (`api.admin_police_report_template`); **nie** die Auswahl | bis Kontolöschung; Name und Geburtsdatum sind nach bestandener Prüfung gesperrt (`facts_locked`, M2) |
| `app.geo` | PLZ und PLZ-Mittelpunkt (lat/lon) | Entfernung in der Auswahl | b | Person, Auswahl | bis Kontolöschung |
| `app.postal_codes` | PLZ-Mittelpunkte (GeoNames, CC BY 4.0, M2) | Nachschlagen ohne externen Dienst | – | alle Angemeldeten | dauerhaft |

### 3.4 Einwilligungen (`app.consents`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `app.consents` (+ Sicht `app.consents_current`) | Art (`agb`, `datenschutz_kenntnis`, `art9_profile`, `art9_religion`, `art9_health`, `biometrie`, `gespraech`, `push`, `kontakttausch`), erteilt/widerrufen, Textfassung, Zeit, Quelle | Nachweis nach Art. 7 Abs. 1 DSGVO | c i. V. m. Art. 7 Abs. 1 | Person, Benn, Auswahl (nur `has_consent`) | nur anhängen (Trigger `consents_no_update`); gelöscht **nur mit dem Konto**. Offen: Nachweis nach Kontolöschung (Löschkonzept) |
| `ops.legal_documents` | Texte mit Version und Status (`entwurf` …) | Fassung, auf die eine Einwilligung verweist | c | alle (`api.legal_document`) | dauerhaft (Versionen bleiben) |

Folgen eines Widerrufs (M2, `api.revoke_consent` in `20261003000230_web_onboarding.sql`): `art9_profile` →
`sensitive.profile_identity` sofort gelöscht; `art9_religion` / `art9_health` → die jeweiligen Spalten geleert;
`push` → alle Push-Abos gelöscht; `gespraech` → alle Transkripte gelöscht. `biometrie` und `kontakttausch`: kein
Löschen (bereits getauschte Kontakte bleiben sichtbar). `agb` und `datenschutz_kenntnis` nur über die Kontolöschung.

### 3.5 Ausweisprüfung (Didit, M2 im Bau: `20261003000240_web_verification.sql`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `app.verifications` | Anbieter, Didit-Sitzungs-ID, Status, volljährig ja/nein, Geburtsjahr, Name passt, Geburtsdatum passt, Sperrlisten-Treffer, Zeiten, `provider_session_deleted_at` | Nachweis 18+ und Echtheit | b, f (Sicherheit) | Person, Benn, Auswahl (`app.is_verified`) | bis Kontolöschung |
| `safety.verification_hashes` | HMAC(Ausweisnummer + Geburtsdatum), HMAC(Name + Geburtsdatum) | späterer Ausschluss wirkt auch bei neuem Konto | f | nur Functions | mit dem Konto (`on delete cascade`); Ausnahme: Löschung während Sperre/offener Meldung → Hashes werden in `safety.safety_flags.details` kopiert (Frist offen) |
| bei **Didit** | Ausweisbild, Gesichtsvideo, biometrischer Abgleich, ausgelesene Daten | Prüfung | 9a (`biometrie`) | Didit | Sitzung wird nach dem Ergebnis per API gelöscht (`DELETE /v2/session/{id}/delete/`, `verification-webhook`); Nachholen bei jedem weiteren Webhook; zusätzlich kürzeste Aufbewahrung im Didit-Konto (1 Monat) einstellen – **Aufgabe im Runbook** |

Ausweisnummer, Bilder und der Name aus dem Ausweis werden **nicht** gespeichert, nur verglichen bzw. gehasht
(`ops.verification_complete`).

### 3.6 Art.-9-Daten (Schema `sensitive`, `20261003000200_accounts.sql`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `sensitive.profile_identity` | Geschlecht, gesuchte Geschlechter, Orientierung (freiwillig) – alle mit `pgp_sym_encrypt` (AES-256) verschlüsselt | Auswahl: passt das Geschlecht in beide Richtungen? | 9a (`art9_profile`) | Person (`api.my_identity`), Export; Auswahl **nur** Ja/Nein (`sensitive.gender_compatible`, `…_pairs`); Fairness-Bericht nur k-anonyme Zählungen; **Benn sieht sie nicht** (keine Admin-Funktion) | bis Widerruf (sofort gelöscht) oder Kontolöschung |
| `sensitive.profile_sensitive` | Religion, Bedeutung, „gleiche Religion nötig“ (Klartext-Ja/Nein), Gesundheit – verschlüsselt | Religion als Filter (nur wenn verlangt) | 9a (`art9_religion`, `art9_health`) | wie oben, `sensitive.religion_compatible` | bis Widerruf oder Kontolöschung |

Hinweise: Es gibt im Code **noch keine Funktion zum Speichern von Gesundheitsangaben** (`health_notes_enc` wird nur
gelöscht und exportiert). Die Einwilligung `art9_health` ist also derzeit ohne Verarbeitung. Der Schlüssel liegt in
Vault (`fermata_sensitive_key`), angelegt von der Migration.

### 3.7 Profil und Gespräch mit Viola (M3: `20261003000300_profile_interview.sql`, `…000310_viola.sql` im Hauptzweig)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `app.interview_sessions` | Art, Modus (Stimme/Text), Status, Anrede, Tiefe, Zeiten, Zeitpunkt des KI-Hinweises, Entwurf der Zusammenfassung, Status, Sicherheits-Hinweis ja/nein, Ende-Grund, besprochene Themen | Gespräch steuern, KI-Hinweis nachweisen | a (`gespraech`) | Person (RLS) | bis Kontolöschung. **Entwurf (`summary_draft`) hat keine eigene Frist** |
| `app.interview_transcripts` | Gesprächsbeiträge als Text (Art.-9-Sätze durch „[geschützte Angabe entfernt]“ ersetzt, außer Beiträge mit Sicherheits-Treffer) | Auswertung, Sicherheit, Nachvollziehbarkeit für die Person | a (`gespraech`), 9a soweit Art.-9-Inhalte wörtlich bleiben | Person (RLS); kein Admin-Zugriff über die API | **30 Tage** ab erstem Beitrag (`interview.transcript_retention_days`, Job `fermata-purge-transcripts`); bei Sicherheits-Hinweis verlängerbar (`interview.safety_transcript_retention_days`, Frage B5, jetzt 30 = keine Verlängerung); Widerruf `gespraech` löscht sofort |
| `app.profile_core` | Anzeigename, Geburtsjahr, bestätigte Zusammenfassung, Persönlichkeit/Werte/Lebensumstände (JSON, ohne Art. 9 – SQL lehnt Treffer ab), Altersbereich, Fahrbereitschaft, Sprachen, Rauchen, Kinder, Kinderwunsch, bereit für Auswahl | Auswahl | b | Person, Benn, Auswahl | bis Kontolöschung |
| `app.wants`, `app.dealbreakers` | Wünsche und Ausschlüsse (Text, Art) | Auswahl (Filter, LLM) | b | Person, Auswahl | bis Kontolöschung |
| `app.personal_weights` | Gewichte der Teil-Scores | Auswahl | b | Auswahl | bis Kontolöschung |
| `app.profile_embeddings` | Vektor (1024 Zahlen) der bereinigten Zusammenfassung, Hash | Vorauswahl | b | Auswahl | bis Kontolöschung; neu bei Änderung |
| `ops.session_costs` | Sitzungs-ID, Minuten, Sekunden Spracherkennung, Token, Zeichen, Euro, Antwortzeiten | Kostenkontrolle | f | Benn | dauerhaft; keine Personen-ID, Sitzung wird mit dem Konto gelöscht → danach ohne Personenbezug |
| `safety.safety_flags` (Quelle `agent`) | Art (Krise, minderjährig, Gewalt, Belästigung), Stufe, Sitzung, Beitragsnummer – **kein Freitext** | Sicherheit | f, d | Benn | siehe 3.12 |

Datenweg ohne Speicherung: Stimme → LiveKit → Viola-Dienst (AWS Frankfurt) → Deepgram EU (Text) → Sprachmodell
Claude Sonnet 5.5 über Bedrock (EU) → Stimme von Amazon Polly (Frankfurt, Platzhalter B4) → LiveKit → Person.
**Rohaudio wird nirgends gespeichert** (LiveKit-Sitzung `record=False`, kein Egress, Test prüft, dass keine Dateien
entstehen). Untertitel gehen nur an die Person und werden nicht gespeichert.

### 3.8 Freie Zeiten (`20261003000300`, `…000530_availability.sql`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `app.availability_periods` | Zeiträume (14 Tage), Abfragezeit | Zeitenabfrage | – | alle Angemeldeten | dauerhaft |
| `app.availability_windows` | freie Zeitfenster je Person und Zeitraum | Auswahl, Terminvorschläge | b | Person, Auswahl | bis Kontolöschung. **Alte Zeiträume werden nicht gelöscht** – offen |

### 3.9 Auswahl (M4, `20261003000400`, `…000410_matcher.sql`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `app.match_runs` | Zeitraum, Status, Zahlen, Einstellungen, Bericht (inkl. k-anonymem Fairness-Bericht), Kosten | Nachvollziehbarkeit | f | Benn | dauerhaft (PLAN 2.2) |
| `app.pair_candidates` | Paar, Teil-Scores, LLM-Score, Begründung des Modells, Entwurf „Warum Sie beide“, `input_hash` | Bewertung, Wiederverwendung | b, 9a (Ja/Nein-Prüfung) | Auswahl, Benn | **12 Monate** nach Laufende (`matching.score_retention_months`, Job `fermata-purge-match-scores`) oder mit einem der beiden Konten |
| `app.match_run_members` | wer war im Pool, Wartezeit, Ergebnis, Grund ohne Vorschlag | Wartebonus, Bericht | b | Auswahl, Benn | 12 Monate (gleicher Job) |
| `app.pairings` | Paar, Gesamtscore, Lokal, „Warum Sie beide“, Prüfnotizen des Prüf-Agenten, Status, Entscheidung von Benn | Vorschlag und Freigabe | b | Mitglieder: nur `id, user_a, user_b, venue_id, reasons_text, status, created_at` ab Status `proposed`; Benn alles | bis Kontolöschung eines der beiden. **Gesamtscore und Prüfnotizen haben keine 12-Monats-Frist** (anders als die Teil-Scores) |

An Bedrock (Auswahl-Job, AWS Frankfurt): je Person Alter, bereinigte Zusammenfassung, Persönlichkeit, Werte,
Wünsche, Lebensumstände, Rauchen, Kinder, Kinderwunsch, Sprachen, „sonstige“ Deal-Breaker, auf 5 km gerundete
Entfernung, Anrede. **Nie** Name, PLZ, Koordinaten, IDs, Geschlecht, Orientierung, Religion, Gesundheit
(`docs/bereiche/matcher.md` Abschnitt 7). An Titan Embeddings (Frankfurt): die bereinigte Zusammenfassung.

### 3.10 Abende, Lokale, Rückmeldung (M5, `20261003000500` bis `…000590`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `app.evenings` | Paar, Lokal, Platz, Zustand, Zeitvorschläge, Wunschzeiten, Beginn, Absage (wer, Grund), nicht erschienen | Abend verabreden | b | beide Beteiligten (über `api.*`, nie Nachname/Kontakt des Gegenübers), Benn | bis Kontolöschung **eines** der beiden (`on delete cascade` an `user_a`/`user_b`) – dann verliert auch das Gegenüber den Verlauf |
| `app.evening_events` | Verlauf der Zustandswechsel (wer, wann, Details) | Nachweis, Kontingent-Regeln | b | Benn | mit dem Abend |
| `app.evening_deadlines` | Fristen und geplante Nachrichten | Fristen | b | – | mit dem Abend |
| `app.evening_reservations` | Lokal, Zeit, 4-stelliger Tisch-Code, Status, Lokal benachrichtigt/bestätigt | Reservierung unter „Fermata“ | b | Benn; Mitglieder über `api.*` | mit dem Abend |
| `app.evening_hints` | Erkennungszeichen (Freitext ≤ 80 Zeichen) | Finden im Lokal | b | Gegenüber nur im Finde-Fenster | nach dem Finde-Fenster gelöscht (Job `fermata-evening-purge`, täglich) |
| `app.feedback` | war da, Gegenüber war da, Kontakt ja/nein, wieder treffen, sicher gefühlt, Bewertungen 1–5, Notiz | Ergebnis des Abends, Qualität, Sicherheit | b, f | Person, Benn; **nie das Gegenüber** | mit dem Abend |
| `app.contact_shares` | wer teilt E-Mail/Telefon, Zeitpunkte | freiwilliger Kontakttausch | a (`kontakttausch`) | jede Seite nur, was die andere freigibt, nach beidseitigem Ja | mit dem Abend; Widerruf der Einwilligung löscht nichts |
| `app.blocks` | wer blockiert wen | nie wieder zusammen vorschlagen | b, f | blockierende Person, Auswahl | bis Kontolöschung eines der beiden |
| `app.trust_shares` | Link-Hash, Ablauf, zurückgezogen | „Abend teilen“ mit Vertrauensperson | b auf Wunsch der Person, f | Ersteller; Vertrauensperson sieht über `trust-view` Lokal, Adresse, Zeit, eigenen Vornamen | Link ungültig 24 h nach Beginn (`safety.trust_share_hours`); Zeile bleibt mit dem Abend |
| `safety.checkins` | gut / unsicher / Hilfe | Sicherheit am Abend | d, f | Benn | mit dem Abend |
| `app.venues`, `app.venue_slots` | Lokal, Anschrift, **Ansprechperson mit E-Mail und Telefon**, Vereinbarung, Plätze | Reservierung | b (Vertrag mit dem Lokal), f | Benn; Mitglieder nur Lokal ihres Abends | solange Partnerschaft; keine Frist im Code |
| `app.push_subscriptions` | Push-Adresse des Browsers, Schlüssel, Plattform, Fehlerzähler | Web-Push | a (`push`; zugleich § 25 TDDDG) | niemand (nur Versand) | bis Abmeldung, Widerruf `push`, Antwort 404/410 des Push-Dienstes, 20 Fehlschläge oder Kontolöschung |
| `ops.notification_queue` | Empfänger-ID, Vorlage, Parameter (nur IDs), Zustände | Versand | b | – | erledigte Einträge nach 90 Tagen (`notify.queue_retention_days`, Job `fermata-evening-purge`) |
| `ops.notifications_log` | Empfänger-ID, Kanal, Vorlage, Anbieter-ID, Status (ohne Inhalt, ohne Adresse) | Nachweis des Versands | f | Benn, Export der Person | **keine Frist**; nur Kontolöschung löscht (M2) |

Was das Lokal bekommt: Datum, Uhrzeit, „Fermata“, Tisch-Code, 2 Personen, Hinweis aus der Vereinbarung – nie Namen
oder Kontaktdaten der Mitglieder. Push-Texte enthalten keine Namen; Mails nennen das Gegenüber nicht beim Namen.

### 3.11 Mitgliedschaft und Zahlung (M6, `20261003000600` bis `…000640`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `billing.memberships` | Stufe, Status, Stripe-Kunden- und Abo-ID, Vertragsnummer, Bestell-, Kündigungs-, Widerrufszeit | Vertrag | b | Person (ohne Stripe-IDs), Benn | bis Kontolöschung |
| `billing.membership_periods` | Zeiträume, Abende, Verlängerung, Stripe-Rechnungs-/Zahlungs-ID, Betrag | Abrechnung, Verlängerungsregel | b, c | Person, Benn | **mit dem Konto gelöscht** (`on delete cascade`); Rechnungen selbst liegen bei Stripe |
| `billing.evening_ledger` | Kontingent-Buch (Gratis-Abend, Zuteilung, Bindung, Nutzung, Gutschrift, Verfall) | Kontingent | b | Person, Benn | nur anhängen; mit dem Konto gelöscht |
| `billing.contract_actions` | Bestellung (gezeigte Übersicht, Hash, Knopftext), Kündigung und Widerruf (Name, Kontakt-E-Mail, Art, Grund, Vertragsnummer, Berechnung), Bestätigungs-Mail, Ergebnis | Nachweis Bestellknopf, § 312k, § 356a BGB | b, c | Person, Benn | `user_id` wird bei Kontolöschung `null`, **Name und E-Mail in `details` bleiben**; keine Frist im Code (Vorschlag: 6 Jahre, Löschkonzept) |
| `billing.contract_requests` | Kündigung/Widerruf ohne Anmeldung: Link-Hash, Formularangaben, Zeiten | Nachweis des Eingangs | b, c | Functions | mit dem Konto; abgelaufene Anfragen werden nicht gelöscht |
| `billing.stripe_events` | Stripe-Ereignisse **ohne** Karten-, Adress-, Telefon- und Namensfelder (`minimizeEvent`); enthalten weiter z. B. `customer_email` und Rechnungslinks | idempotente Verarbeitung | b, f | Benn | **keine Frist** – offen |
| bei **Stripe** | Karte bzw. Zahlungsmittel, Rechnungsanschrift, E-Mail, Rechnungen | Zahlung, Rechnung | b, c | Benn im Stripe-Dashboard | laut Stripe (gesetzliche Fristen) |

### 3.12 Sicherheit (M7, `20261003000700` bis `…000730`; Sperrliste in `…000200`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `safety.reports` | meldende und gemeldete Person, Abend, Bereich, Art, Beschreibung (≤ 4000 Zeichen), Rückmeldung gewünscht, Stufe, Status, Frist, Entscheidung | Melden überall, Prüfung in 24 h | f, b; bei Übergriffen ggf. Art. 9 (Sexualleben) und Art. 10 (Straftaten) – Anwalt | Benn (`api.admin_report*`, mit Audit); meldende Person eigene Meldungen; **gemeldete Person nie** | Personen-IDs werden bei Kontolöschung `null`, Beschreibung bleibt; **keine Frist** – Vorschlag im Löschkonzept |
| `safety.sanctions` | Art (Hinweis, vorläufige Sperre, Sperre, Ausschluss), Begründung, Zeitraum, aufgehoben | Schutz | f, b | Person (ohne Meldungsbezug, `api.my_sanctions`), Benn, Auswahl (nur `is_suspended`) | **mit dem Konto gelöscht** (`on delete cascade`); Sperrliste bleibt |
| `safety.appeals` | Widerspruchstext, Entscheidung | Widerspruch | b, f | Person, Benn | mit der Sanktion |
| `safety.blocklist` | nur Hashes (Ausweis, Name+Geburtsdatum), Grund-Code, Bezug Meldung/Sanktion, Notiz | Ausgeschlossene bleiben ausgeschlossen | f | Benn, Prüf-Funktionen | **dauerhaft** (PLAN 2.2; Begründung in [dsfa.md](recht/dsfa.md)); Aufheben des Ausschlusses löscht den Eintrag |
| `safety.safety_flags` | Hinweise (Agent, Sperrlisten-Name, System, Meldung, Check-in, Nichterscheinen), Stufe, Details (IDs, keine Freitexte) | Hinweise für Benn | f, d | Benn | `user_id` wird bei Kontolöschung `null`; **keine Frist** |
| `safety.mail_queue` | Empfänger-ID oder „an Benn“, Vorlage, Daten (ohne Adressen und Namen), Versandstand | Sicherheits-Mails | f, b | – | **keine Frist** (gesendete Zeilen bleiben) – offen |

### 3.13 Betrieb (Schema `ops`)

| Tabelle | Inhalt | Zweck | Grundlage | Wer liest | Aufbewahrung, Löschung |
|---|---|---|---|---|---|
| `ops.audit_log` | Zeit, handelnde Person (ID), Rolle, Handlung, Ziel, Details | Rechenschaft (Art. 5 Abs. 2, Art. 32), Admin-Handlungen | c, f | Benn | **dauerhaft**, nur anhängen (Trigger verbietet Löschen) |
| `ops.app_settings`, `ops.app_settings_history` | Einstellungen, Verlauf mit Admin-ID | Betrieb | f | Benn | dauerhaft |
| `ops.mail_outbox` | abgefangene Mails | nur Test/lokal (in Produktion und Staging per Trigger gesperrt) | – | Entwickler | – |
| `ops.deployment`, `ops.sim_clock` | Umgebung, Testuhr | Betrieb | – | – | – |

### 3.14 Außerhalb der Datenbank

| Wo | Was | Wie lange |
|---|---|---|
| Supabase-Plattformprotokolle (API-Gateway, Postgres, Edge Functions) | Anfragen mit IP, Zeit, Pfad; Ausgaben der Functions (der Code schreibt keine Mailadressen und Tokens ins Log) | laut Supabase-Tarif (prüfen) |
| Supabase-Backups | vollständige Kopie der Datenbank | laut Tarif (tägliche Backups, ggf. PITR) – siehe Runbook |
| Vercel (Landingpage, Web-App) | Zugriffsprotokolle mit IP | laut Vercel-Tarif (prüfen) |
| AWS CloudWatch (Viola, Auswahl-Job) | Protokolle der Dienste; Bedrock-Invocation-Logging **ohne Inhalte** einstellen | Aufbewahrung je Log-Gruppe festlegen (Runbook) |
| Brevo | Versandprotokolle, Inhalte der Transaktionsmails | laut Brevo (prüfen), Öffnungs- und Klickverfolgung aus |
| Didit, Deepgram, LiveKit Cloud (Weg A/B), TTS-Anbieter | siehe Abschnitt 5 | – |
| Browser der Mitglieder | Anmelde-Cookie von Supabase (Web-App), Farbschema im Local Storage, Service Worker, Push-Abo | bis Abmeldung bzw. Löschen im Browser |

---

## 4. Datenflüsse zu Diensten außerhalb von Supabase

| Dienst | Was geht hin | Aus welchem Code | Rückweg |
|---|---|---|---|
| **Brevo** (API und SMTP) | Empfängeradresse, Betreff, Mailtext (Anmeldecode, Bestätigungen, Fristen, Sicherheits-Mails, Eingangsbestätigungen) | `supabase/functions/_shared/mail/brevo.ts`; Supabase Auth über Brevo-SMTP (Dashboard) | Message-ID in `ops.notifications_log` |
| **Stripe** | E-Mail und interne Kennung (`metadata.fermata_user_id`) beim Anlegen des Kunden; Abo, Preis; Karte gibt die Person direkt im Stripe Payment Element ein | `billing-checkout`, `billing-cancel`, `billing-withdraw`, `billing-extend` | Webhook `stripe-webhook` (gekürzt gespeichert) |
| **Didit** | Sitzung anlegen (Workflow, interne Referenz); die Person lädt Ausweis und Gesichtsvideo direkt bei Didit hoch | `verification-start`, `verification-webhook` (M2) | Entscheidung (Name, Geburtsdatum, Ausweisnummer werden nur verglichen/gehasht), danach Löschauftrag |
| **AWS Bedrock** (Claude Sonnet 5.5) | Gespräch: Gesprächsverlauf als Text, Leitfaden; Auswertung: Transkript (Text); Auswahl: bereinigte Profile ohne Namen und Art. 9 | `services/viola` (Mantle-Client, `eu-central-1`), `services/matcher` (`bedrock` EU-Geo-Profil oder `bedrock-mantle`) | Antworten, strukturierte Auswertung |
| **AWS Bedrock Titan Embeddings** | bereinigte Zusammenfassung | `services/matcher/src/fermata_matcher/embeddings.py` (`bedrock-runtime`, `eu-central-1`) | Vektor |
| **Amazon Polly** (Platzhalter B4) | Antwortsätze von Viola als Text | `services/viola/src/viola/tts` | Audio (nicht gespeichert) |
| **Deepgram** (EU-Endpunkt `api.eu.deepgram.com`, `mip_opt_out=true`) | Audio, nur wenn gesprochen wird (Sprach-Tor) | `services/viola/src/viola/voice` | Text |
| **LiveKit** | Sprachverbindung (WebRTC) zwischen Browser und Viola | Weg A/B: LiveKit Cloud; Weg C: eigener Server in AWS Frankfurt (Frage B3) | – |
| **Web-Push-Dienste** (Apple, Google, Mozilla) | Ende-zu-Ende-verschlüsselte, kurze Nachricht ohne Namen (RFC 8291) | `supabase/functions/_shared/push` | Zustellstatus |
| **Vercel** | Seitenaufrufe (IP, Pfad); Server-Funktion `/s/…` ruft `link-hit` ohne IP auf | `apps/landing`, `apps/web` | – |
| **Lokale** (keine Auftragsverarbeiter) | Reservierungs-Mail ohne Namen der Mitglieder | `notify-dispatch`, Vorlage `evening-venue.ts` | Bestätigung per Link |
| **Polizei** (nur nach Entscheidung von Benn) | Sachverhalt, Name, Geburtsdatum, Wohnort der beschuldigten Person | Vorlage `api.admin_police_report_template` (Text, kein automatischer Versand) | – |

---

## 5. Was die EU verlässt oder verlassen kann

| Dienst | Verarbeitungsort laut Plan/Code | Drittlandbezug | Einordnung (prüfen) |
|---|---|---|---|
| Supabase | AWS Frankfurt; Edge Functions mit `x-region: eu-central-1` bzw. `forceFunctionRegion` | Supabase Inc. (USA) als Vertragspartner und Betreiber | US-Behördenzugriff denkbar; AV-Vertrag mit Standardvertragsklauseln oder Data Privacy Framework (DPF) prüfen |
| AWS (Bedrock, Polly, ECS, EventBridge, Secrets Manager, CloudWatch) | `eu-central-1`; **EU-Geo-Profil** `eu.anthropic.claude-sonnet-5-5` verteilt Anfragen auf EU-Regionen und laut AWS-Modellkarte auch **London und Zürich** | Vertragspartner Amazon Web Services EMEA SARL (Luxemburg), US-Mutter; UK und Schweiz haben Angemessenheitsbeschlüsse | in die Datenschutzerklärung (PLAN 2.2). Alternative: `bedrock-mantle` regional in Frankfurt (Viola nutzt den Mantle-Client; ob mit `eu.`-Präfix, ist offen – `docs/bereiche/viola.md` Abschnitt 14) |
| Deepgram | EU-Endpunkt, laut Deepgram keine Weiterleitung außerhalb der EU | Deepgram Inc. (USA) | AV-Vertrag, SCC/DPF prüfen |
| Didit | laut Didit standardmäßig EU | Firmensitz USA (PLAN 5.5) | DSFA-Punkt; SCC/DPF, Sub-Auftragsverarbeiter prüfen; Plan B Veriff (Estland) |
| LiveKit Cloud (Weg A/B) | Agent und Projektdaten in der EU wählbar; Weg A ohne Regionsbindung: Medienstrom kann über Server außerhalb der EU laufen (laut LiveKit ohne Speicherung) | LiveKit Inc. (USA) | Weg C (selbst in Frankfurt) vermeidet das (Frage B3) |
| TTS Google (Option) | EU-Endpunkt `eu-texttospeech.googleapis.com` | Google (USA) | nur nach Blindtest (B4) |
| TTS Cartesia, ElevenLabs (Optionen) | EU nur mit Enterprise-Vertrag | USA | im Echtbetrieb gesperrt, solange `VIOLA_TTS_ENTERPRISE_EU` nicht gesetzt ist |
| Stripe | Stripe Payments Europe Ltd. (Irland) | Übermittlung an Stripe Inc. (USA) | Stripe ist teils eigenständig verantwortlich (Betrugsprävention, Aufsicht) – prüfen |
| Vercel | Funktionen in `fra1`, statische Dateien über das weltweite CDN | Vercel Inc. (USA) | AV-Vertrag, DPF/SCC prüfen; Landingpage-Entwurf nennt das schon |
| Brevo | Sendinblue SAS (Frankreich) | Unterauftragnehmer prüfen | – |
| Push-Dienste | Apple, Google, Mozilla (USA) | Inhalt Ende-zu-Ende verschlüsselt, Dienst sieht Abo-Adresse und Zeitpunkt | in der Datenschutzerklärung nennen |
| GitHub (Code, CI) | – | USA | keine Mitgliederdaten (Tests mit erfundenen Daten) |

---

## 6. Alle pg_cron-Jobs

Alle Jobs entstehen in den Migrationen, sofern pg_cron verfügbar ist (bei Supabase: Erweiterung einschalten, Runbook).

| Job | Zeitplan (UTC) | Funktion | Was er tut / löscht | Migration |
|---|---|---|---|---|
| `fermata-waitlist-cleanup` | stündlich, Minute 23 | `api.waitlist_cleanup()` | löscht unbestätigte Wartelisten-Einträge nach 7 Tagen (ab letzter Mail), Drossel-Einträge nach 24 h, Tagessalze nach 2 Tagen | `20261003000100_waitlist.sql` |
| `fermata-purge-transcripts` | stündlich, Minute 17 | `ops.purge_transcripts()` | löscht Transkripte mit `delete_at ≤ jetzt` (30 Tage) | `20261003000300_profile_interview.sql` |
| `fermata-expire-interviews` | alle 10 min | `ops.expire_interview_sessions()` | beendet verfallene Gesprächsanfragen und hängende Sitzungen (löscht nichts) | `20261003000310_viola.sql` (Hauptzweig) |
| `fermata-expire-invitations` | stündlich, Minute 41 | `ops.expire_invitations()` | löscht Konten aus abgelaufenen, nie angenommenen Einladungen (samt Einladung) | `20261003000230_web_onboarding.sql` (M2, im Bau) |
| `fermata-purge-match-scores` | täglich 03:23 | `ops.purge_match_scores()` | löscht `app.pair_candidates` und `app.match_run_members` älter als 12 Monate | `20261003000410_matcher.sql` |
| `fermata-schedule-match-runs` | stündlich, Minute 7 | `app.schedule_due_match_runs()` | legt fällige Auswahl-Läufe an (löscht nichts) | `20261003000410_matcher.sql` |
| `fermata-evening-deadlines` | alle 5 min (`evening.deadline_check_minutes`) | `ops.process_evening_deadlines()` | Fristen, Erinnerungen, Check-in, Rückmeldung, Ergebnis (löscht nichts) | `20261003000560_evening_jobs.sql` |
| `fermata-availability-tick` | stündlich, Minute 5 | `ops.availability_tick()` | legt Zeiträume an, verschickt Zeitenabfrage und Erinnerung | `20261003000560_evening_jobs.sql` |
| `fermata-notify-kick` | jede Minute | `ops.notify_kick()` | stößt `notify-dispatch` über pg_net an, wenn etwas fällig ist | `20261003000560_evening_jobs.sql` |
| `fermata-evening-purge` | täglich 03:23 | `ops.purge_evening_data()` | löscht erledigte Nachrichten der Warteschlange nach 90 Tagen und Erkennungszeichen nach dem Finde-Fenster | `20261003000560_evening_jobs.sql` |
| `fermata-billing-extension` | stündlich, Minute 7 | `billing.apply_extension_rule()` | Verlängerungsregel, ruft `billing-extend` über pg_net | `20261003000640_billing_extension.sql` |
| `fermata-billing-expire` | stündlich, Minute 37 | `billing.expire_ledger()` | schreibt sichtbare Verfallszeilen ins Kontingent-Buch (löscht nichts) | `20261003000640_billing_extension.sql` |
| `fermata-safety-release` | stündlich, Minute 23 | `safety.release_expired_sanctions()` | hebt abgelaufene befristete Sperren auf, informiert die Person | `20261003000710_safety_core.sql` |
| `fermata-safety-dispatch` | jede Minute | `safety.kick_dispatch()` (nur wenn Mails warten) | stößt `safety-dispatch` an (Rückfall zum sofortigen Anstoß) | `20261003000710_safety_core.sql` |

Prüfen nach dem Deploy: `select jobname, schedule, command, active from cron.job order by jobname;` – es müssen
14 Zeilen sein (12 im Branch `build/docs` ohne M2 und M3).

---

## 7. Lücken: Daten ohne Löschfrist im Code

| Daten | Heute | Vorschlag (Löschkonzept) |
|---|---|---|
| `safety.reports`, `safety.safety_flags`, `safety.mail_queue` | dauerhaft | Meldungen 3 Jahre nach Abschluss; Hinweise 1 Jahr nach Prüfung; Mail-Ausgang 90 Tage nach Versand |
| `billing.stripe_events` | dauerhaft | 90 Tage nach Verarbeitung |
| `billing.contract_actions` | dauerhaft (Name, E-Mail bleiben nach Kontolöschung) | 6 Jahre für Geschäftsbriefe (§ 257 HGB); Buchungsbelege seit 2025 8 Jahre (§ 147 AO) – Steuerberatung fragen |
| `billing.contract_requests` | bis Kontolöschung | 30 Tage nach Ablauf, wenn nicht bestätigt |
| `ops.notifications_log` | bis Kontolöschung | 12 Monate |
| `app.availability_windows` vergangener Zeiträume | bis Kontolöschung | 30 Tage nach Ende des Zeitraums |
| `app.interview_sessions.summary_draft` | bis Kontolöschung | nach Bestätigung/Ablehnung leeren |
| `app.pairings` (Score, Prüfnotizen) | bis Kontolöschung | Score und Prüfnotizen nach 12 Monaten leeren (wie Teil-Scores) |
| `auth.audit_log_entries` (mit IP) | dauerhaft | 30–90 Tage |
| `ops.audit_log` | dauerhaft, Löschen technisch gesperrt | Frist festlegen (z. B. 3 Jahre); dafür Lösch-Funktion mit eigener Ausnahme vom Trigger |
| Wartelisten-Eintrag nach Kontoeröffnung | bleibt bis Abmeldung | löschen, sobald das Konto aktiv ist (Gründungsstatus steht dann in `app.accounts`) |
| `safety.safety_flags` mit Sperrlisten-Hashes nach Kontolöschung während einer Prüfung | dauerhaft | löschen, sobald Benn entschieden hat (Ausschluss → Sperrliste; sonst löschen) |

---

## 8. Unterschiede zwischen Code und PLAN 2.2

| PLAN 2.2 | Code | Folge |
|---|---|---|
| „Transkript … Benn bei Sicherheitsfall“ | Es gibt **keine Admin-Funktion** zum Lesen eines Transkripts; RLS erlaubt nur der Person selbst. Benn könnte nur über den SQL-Editor (als `postgres`, ohne Audit und ohne Zwei-Faktor-Prüfung der App) lesen | Admin-Funktion mit Audit nachrüsten (z. B. `api.admin_transcript(session_id)` nur bei `safety_flagged`) |
| „Anfragen an Claude … keine Art.-9-Rohdaten an das LLM“ (PLAN 3.2 Nr. 5) | gilt für die **Auswahl**. Im **Gespräch** gehen gesprochene Worte (auch ungefragt genannte Art.-9-Inhalte) an Deepgram und Bedrock; gespeichert wird davon nichts | Einwilligungstext `gespraech` und KI-Hinweis müssen das sagen; der Entwurf `ki_hinweis` (M2) behauptet „gehen nie an ein Sprachmodell“ – zu korrigieren |
| „Auswahl-Läufe … Teil-Scores 12 Monate“ | Teil-Scores ja; Gesamtscore und Prüfnotizen in `app.pairings` ohne Frist | siehe Abschnitt 7 |
| „Meldungen, Sanktionen nach Löschkonzept (M8)“ | Sanktionen werden mit dem Konto gelöscht; Meldungen bleiben ohne Personen-ID | im Löschkonzept bewusst entscheiden |
| „Zahlungsdaten: gesetzliche Fristen“ | `billing.membership_periods` (Beträge, Rechnungs-IDs) wird mit dem Konto gelöscht | Rechnungen liegen bei Stripe; trotzdem mit Steuerberatung klären, ob Fermata eigene Belege braucht |
| „Rückmeldungen bis Löschung“ | Rückmeldungen hängen am Abend; löscht **das Gegenüber** sein Konto, verschwindet der Abend mit beiden Rückmeldungen | bewusst entscheiden (Datensparsamkeit vs. Verlauf); im Löschkonzept beschrieben |
| „Kostenprotokoll dauerhaft“ | ja, ohne Personen-ID | – |
| „Gegenüber sieht nie etwas daraus außer ‚warum Sie beide‘“ | zusätzlich Vorname, Erkennungszeichen im Finde-Fenster, Kontakt nach beidseitigem Ja | PLAN-Formulierung präzisieren |

---

## 9. Offene Punkte für Benn/Anwalt

1. **Löschfristen** für die Tabellen in Abschnitt 7 festlegen; dann Jobs bauen.
2. **Edge Functions als `postgres`:** eigene, enge Login-Rolle für die Functions prüfen (DSFA-Maßnahme).
3. **Transkript-Einsicht** im Sicherheitsfall: Funktion mit Audit bauen oder PLAN anpassen (B5 hängt daran).
4. **Gesundheitsangaben:** Einwilligung `art9_health` existiert, aber keine Speicherfunktion. Entweder streichen
   (sparsamer) oder bauen.
5. **Wartelisten-Eintrag** nach Kontoeröffnung löschen?
6. **Einwilligungsnachweise nach Kontolöschung**: heute mit gelöscht. Anwalt: Nachweis für Rechtsstreit
   (3 Jahre) behalten oder nicht?
7. **Auftragsverarbeitung und Drittland** für jeden Dienst in [av-liste.md](recht/av-liste.md) klären.
8. **Bedrock-Weg** (EU-Geo-Profil mit London/Zürich oder Mantle regional) festlegen und in die Datenschutzerklärung.
9. Nach Zusammenführung von **M2**: diese Datei mit `docs/bereiche/web.md` abgleichen (Cookies der Web-App, Region
   `fra1` für die Web-App – im Branch `build/web` gibt es noch keine `vercel.json` mit `fra1`).
