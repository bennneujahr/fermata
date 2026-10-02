# Fermata – Plan für Phase 1

Stand: 03.10.2026 (Fassung 2, mit Benns ersten Entscheidungen) · Status: **Entwurf zur Freigabe durch Benn** · Es gibt noch keinen Code.

Dieser Plan folgt Abschnitt 18 des Auftrags. Grundlage sind der Auftrag (Abschnitte 0–18) und die Design-Datei „fermata-claude-design-landingpage-prompt-2026-10-02.md“ (Teil 1 und Teil 2). Wo beide sich widersprechen, gilt der Auftrag (Abschnitt 3 und 12 des Auftrags).

---

## Kurz für dich

- **Was ich noch von dir brauche:** die Antworten auf die Fragen A2 bis A9 in Abschnitt 6 und dein OK zum Plan als Ganzes. Danach starte ich mit M0.

### Entschieden am 03.10.2026

| Punkt | Entscheidung | Folge im Plan |
|---|---|---|
| Heimwegtelefon | prüfen | Geprüft: **030 12074182** (deutschlandweit, Berliner Festnetznummer zum normalen Tarif, keine 0800-Nummer). Zeiten laut offizieller Seite So–Do 21–01 Uhr, Fr/Sa 21–03 Uhr; ältere Artikel nennen So–Do bis 24 Uhr. Die Nummer im Auftrag (0800 46484648) ist falsch. Nummer und Zeiten werden eine Einstellung; die Startcheckliste (M9) enthält eine erneute Prüfung. |
| Didit | einverstanden | Didit bleibt Anbieter; Sitzungen werden direkt nach dem Ergebnis gelöscht (5.5). |
| Sprachmodell im Gespräch | nicht Haiku 4.5 | Standard wird **Claude Sonnet 5.5** über das EU-Profil (Begründung und Kosten in 5.1). Haiku 4.5 entfällt. |
| Anmeldung | einverstanden | E-Mail mit 6-stelligem Code und Link. |
| Datenschutz | „immer auf Nummer sicher gehen“ | Gilt als Grundsatz für den ganzen Bau: Im Zweifel wird eine Angabe wie Art.-9-Daten behandelt, und es wird die sparsamere Variante gebaut. Geschlecht und gesuchtes Geschlecht liegen im geschützten Bereich. |

### Weiterhin wichtig vor der Freigabe

- **Hörprobe und Stimmen-Blindtest passen zeitlich nicht:** Die Landingpage (M1) soll eine Hörprobe haben, die Stimme wird aber erst in M3 per Blindtest gewählt. Vorschlag: Der Abschnitt ist per Schalter ausblendbar, bis die Datei da ist, oder wir ziehen einen kleinen Blindtest vor (Frage A4).
- **Markenrecherche „Fermata“** vor Druck und Domainkauf (5.3).

---

## 1. Mein Verständnis in 10 Sätzen

1. Fermata ist eine Dating-Web-App für Menschen ab 18, zuerst in Westmecklenburg, die ohne Wischen, Feed und freien Chat auskommt und stattdessen echte Abende in Partner-Lokalen verabredet.
2. Zuerst geht nur die Landingpage mit Warteliste live: Double-Opt-in, Platznummer, eine persönliche Einladung, keine Cookies und keine Anfragen an Drittanbieter im Browser.
3. Eingeladene legen per E-Mail ein Konto an, tragen ihre Fakten in ein Formular ein, erteilen einzelne Einwilligungen und zeigen über Didit ihren Ausweis; gespeichert wird davon nur das, was der Auftrag ausdrücklich erlaubt.
4. Danach sprechen sie mit Viola, einer klar als KI benannten Stimme ohne Gesicht, die nur nach Persönlichkeit, Werten, Wünschen, Lebensumständen, Fahrbereitschaft und freien Zeiten fragt.
5. Aus dem Gespräch entsteht eine Zusammenfassung, die die Person bestätigt oder korrigiert; Rohaudio wird nirgends gespeichert, Transkripte werden nach 30 Tagen gelöscht.
6. In der Testphase alle 14 Tage sucht ein Auswahl-Job mit harten Filtern, einem Score und einer Zuordnung für möglichst viele Menschen ein passendes Gegenüber und ein Lokal möglichst in der Mitte; Benn prüft und gibt jeden Vorschlag frei.
7. Die beiden stimmen über feste 24-Stunden-Fristen eine Uhrzeit ab, bekommen Erinnerungen per Web-Push und E-Mail und geben am nächsten Tag eine kurze Rückmeldung, aus der nur bei beidseitigem „Ja“ ein freiwilliger Kontakttausch werden kann.
8. Bis einschließlich zum ersten Abend ist alles kostenlos und ohne Karte; danach gibt es eine Mitgliedschaft in drei Stufen (49 €, 149 €, 299 € je 4 Wochen) über Stripe, mit Bestellknopf, Kündigungsknopf und Widerrufsknopf.
9. Sicherheit (15 Standards, Melden überall, vorläufige Sperre, Hilfe-Knopf) und Datenschutz (EU-Hosting, getrennte Art.-9-Einwilligungen, DSFA, externer Datenschutzbeauftragter) sind Startbedingungen, keine Zusatzfunktionen.
10. Die Regeln liegen im Backend (Supabase-Datenbank und Edge Functions), damit die spätere Expo-App sie unverändert nutzt, und ich baue alles in zehn Meilensteinen, die du jeweils abnimmst, bevor der nächste beginnt.

---

## 2. Architektur und Datenflüsse

### 2.1 Bausteine auf einen Blick

```
                    ┌──────────────────────────┐      ┌───────────────────────────────┐
  Besucher  ──────► │ Landingpage (Astro)      │      │ Web-App / PWA (Next.js)       │ ◄── Mitglieder, Benn (/admin)
                    │ Vercel, statisch         │      │ Vercel, Funktionen in fra1    │
                    └────────────┬─────────────┘      └───────┬───────────────┬───────┘
                                 │ Formular, Zähler            │ Daten          │ Sprache (WebRTC)
                                 ▼                             ▼                ▼
                    ┌───────────────────────────────────────────────┐   ┌───────────────────────┐
                    │ Supabase, Frankfurt (eu-central-1)             │   │ LiveKit (Medienserver)│
                    │  Postgres + RLS + pgvector + Cron              │   │ Weg A/B/C, siehe 5.4  │
                    │  Auth (E-Mail-Code/Link, TOTP für Admin)       │   └──────────┬────────────┘
                    │  Edge Functions (immer x-region eu-central-1)  │              │
                    └──┬─────────┬─────────┬──────────┬──────────────┘              ▼
                       │         │         │          │              ┌──────────────────────────────┐
                       ▼         ▼         ▼          ▼              │ Sprach-Agent „Viola“ (Python) │
                    Brevo     Didit     Stripe     Web Push          │ AWS Frankfurt, Docker         │
                    (Mail)  (Ausweis)  (Zahlung)  (VAPID)            │  hört: Deepgram EU            │
                                                                     │  denkt: Bedrock EU (Sonnet)   │
                    ┌───────────────────────────────┐                │  spricht: TTS-Anbieter        │
                    │ Auswahl-Job (Python)          │                │  schreibt nur über eigene     │
                    │ AWS Frankfurt, nach Zeitplan  │                │  Edge Function                │
                    │ Bedrock EU (Sonnet)           │                └──────────────────────────────┘
                    │ eigene, enge Datenbankrolle   │
                    └───────────────────────────────┘
```

Grundsatz: Die Oberflächen zeigen an und schicken Eingaben. Alles, was eine Regel ist (Fristen, Kontingente, Gutschriften, Sperren, Platznummern), entscheidet die Datenbank oder eine Edge Function. So kann die Expo-App später dieselben Regeln nutzen.

### 2.2 Wo welche Daten liegen

| Daten | Ort | Wie lange | Wer sieht sie |
|---|---|---|---|
| Warteliste: Vorname, E-Mail, Region, PLZ, Einwilligung, Platz | Supabase Frankfurt, Tabelle `waitlist` | bis Abmeldung; unbestätigt 7 Tage | nur Benn (Admin), Person bekommt ihre Platznummer |
| Drossel gegen Missbrauch (IP nur als Hash mit Tagessalz) | Supabase, `signup_attempts` | 24 h | niemand |
| Plakat-Zähler je Kürzel und Tag | Supabase, `link_hits` | dauerhaft, ohne Personenbezug | Benn |
| Konto-Fakten: Name, Anschrift, Geburtsdatum, E-Mail, Telefon (freiwillig) | Supabase, eigenes Schema `private` | bis Kontolöschung (+ gesetzliche Fristen für Rechnungen) | Person selbst, Benn |
| Geschlecht, gesuchtes Geschlecht, Orientierung, Religion, Gesundheit (Art. 9) | Supabase, Schema `sensitive`, verschlüsselte Spalten, eigene Rolle | bis Widerruf oder Löschung | Person selbst; die Auswahl bekommt nur Ja/Nein-Antworten aus Prüffunktionen |
| Ausweisprüfung | Didit (Verarbeitung laut Didit in der EU, Firmensitz USA); bei uns nur `is_adult`, Geburtsjahr, Prüf-ID, Abgleich ja/nein, Sperrlisten-Hash | bei Didit: Sitzung sofort nach dem Ergebnis per API löschen; zusätzlich kürzeste Einstellung (1 Monat) als Sicherung | Benn sieht nur die Prüffelder |
| Sperrliste (nur Hashes) | Supabase, Schema `safety` | dauerhaft, Begründung in der DSFA | Benn |
| Audio des Gesprächs | **nirgends gespeichert**; fließt live: Telefon → LiveKit → Agent → Deepgram EU; Stimme zurück vom TTS-Anbieter | – | – |
| Transkript (Text) | Supabase, eigene Tabelle `interview_transcripts` | 30 Tage, Löschung per Cron | Person selbst, Sicherheits-Agent, Benn bei Sicherheitsfall |
| Zusammenfassung, Profil, Wünsche, Deal-Breaker | Supabase | bis Löschung | Person selbst; Gegenüber sieht nie etwas daraus außer „warum Sie beide“ |
| Anfragen an Claude | AWS Bedrock, EU-Geo-Profil (`eu.`-Präfix), Invocation-Logging ohne Inhalte | bei AWS nicht gespeichert (prüfen in M3 und im AV-Vertrag) | – |
| Auswahl-Läufe, Scores, Prüfnotizen | Supabase | Lauf-Berichte dauerhaft, Teil-Scores 12 Monate (Vorschlag) | Benn |
| Termine, Abend-Ereignisse | Supabase | bis Löschung | beide Beteiligten, nur das Nötige |
| Rückmeldungen | Supabase | bis Löschung | nie das Gegenüber; Benn |
| Meldungen, Sanktionen | Supabase, Schema `safety` | nach Löschkonzept (M8) | Benn |
| Zahlungsdaten | Stripe (Karten nur bei Stripe) | gesetzliche Fristen | Benn im Stripe-Dashboard |
| E-Mail-Versand | Brevo (Frankreich) | Versandprotokoll laut Brevo | – |
| Push-Abos (Adresse des Push-Dienstes, Schlüssel) | Supabase | bis Abmeldung | niemand |
| Push-Nachrichten selbst | laufen verschlüsselt über die Push-Dienste von Apple, Google oder Mozilla | – | deshalb kurz und ohne Namen formulieren |
| Kostenprotokoll je Gespräch | Supabase, Schema `ops` | dauerhaft | Benn |
| Admin-Handlungen | Supabase, `audit_log` | dauerhaft | Benn |

Hinweis für die Datenschutzerklärung: Laut AWS-Modellkarte gehören zum EU-Geo-Profil auch die Regionen London und Zürich. Beide liegen außerhalb der EU, haben aber einen Angemessenheitsbeschluss der EU-Kommission. Das muss so in die Datenschutzerklärung.

### 2.3 Die wichtigsten Abläufe in Kürze

1. **Warteliste:** Formular → `waitlist-signup` (prüft Felder, Honeypot, Mindestzeit 3 s, Drossel 5 je Stunde) → Brevo schickt die Bestätigungs-Mail ohne Werbung → Klick → `waitlist-confirm` vergibt Platz, Einladungscode, Gründungsstatus → Seite „Willkommen“. Antwort beim Absenden ist immer gleich, damit niemand herausfinden kann, wer angemeldet ist.
2. **Plakat-Kürzel:** `/s/pfaffenteich` → kleine Server-Funktion zählt einen Aufruf je Kürzel und Tag (ohne IP, ohne Cookie) → Weiterleitung auf `/?q=pfaffenteich` → das Formular schickt `q` als `source` mit. Eine rein statische Seite kann nicht zählen; deshalb bekommt die Landingpage genau diese eine Server-Funktion (Vercel, fra1).
3. **Konto:** Einladung aus dem Admin → Mail mit Code und Link → Einwilligungen einzeln → Formular → Didit-Ablauf → Webhook an Edge Function → Abgleich (volljährig, Name und Geburtsdatum passen) → nur erlaubte Felder speichern → Didit-Sitzung löschen.
4. **Gespräch:** Web-App fragt Edge Function nach LiveKit-Zugang → Function prüft Ausweis, Einwilligungen, Gesprächsart → Agent startet mit KI-Hinweis → Werkzeuge laufen im Hintergrund → Ergebnisse nur über die Agent-Function mit eigenem Geheimnis → Zusammenfassung zum Bestätigen.
5. **Auswahl:** Cron startet den Job → Pool, Filter, Vorauswahl, LLM-Bewertung, Zuordnung, Lokal → Prüf-Agent schreibt Notizen → Benn gibt im Admin frei.
6. **Termin bis Rückmeldung:** Vorschlag → Wunschzeit (24 h) → Bestätigung oder Alternative (24 h) → Reservierungs-Mail ans Lokal → Erinnerungen 24 h und 2 h vorher → Check-in nach 30 Min. → Rückmeldung am nächsten Tag um 10:00 Uhr.
7. **Zahlung:** Stufe wählen → Anmeldung → Übersicht → Stripe Payment Element → Knopf „Mitgliedschaft zahlungspflichtig abschließen“ → Webhook → Stufe aktiv.

### 2.4 Wo der Code entsteht und wie getestet wird

- Dein Ordner „Dating-App“ ist leer. Ich mache ihn zur Wurzel des Monorepos (die Struktur aus Abschnitt 4.2 des Auftrags, ohne zusätzlichen Unterordner `fermata/`). Wenn du lieber einen Unterordner willst, sag es.
- Die Arbeitsumgebung auf deinem Rechner hat Node 22, Python 3.10 und Git, aber **kein Docker**. Die lokale Supabase braucht Docker. Meine Cloud-Arbeitsumgebung hat Docker, Node 22, pnpm und Python 3.13. Plan: Ich schreibe den Code in deinen Ordner und lasse Datenbank-Tests und Playwright in meiner Arbeitsumgebung laufen. Die CI (GitHub Actions) prüft jeden Stand noch einmal unabhängig.
- Werkzeuge: pnpm-Workspaces für TypeScript, `uv` für Python 3.12 (in den Containern), Deno für die Edge Functions (Supabase-Standard).
- Tests: pgTAP für Regeln in der Datenbank, Vitest für TypeScript, pytest für Python, Playwright für Abläufe im Browser, axe und Lighthouse für Barrierefreiheit und Tempo, eigene Skripte für Tonalität und Kontraste.
- **Simulierte Uhr:** Alle Regeln fragen die Zeit über eine Funktion `app.now()` ab. In Tests kann eine Testeinstellung die Uhr vorstellen; in der echten Umgebung ist das technisch gesperrt. So lassen sich 24-Stunden-Fristen und 30-Tage-Löschungen in Sekunden testen.
- **Einstellungen statt fester Zahlen:** Alle Startwerte aus dem Auftrag (Rhythmus, Mindestscore 0,60, Wartebonus, 10 Kandidaten, Fristen, Uhrzeiten, Gewichte, Heimwegtelefon) liegen in einer Tabelle `app_settings`. Jede Änderung wird mit Zeit und Person protokolliert.

### 2.5 Technik-Entscheidungen

| Frage | Entscheidung | Grund |
|---|---|---|
| Landingpage | Astro, statisch, plus eine Server-Funktion für `/s/[KÜRZEL]` | wie vorgegeben; die Funktion braucht es nur für die Zählung |
| Web-App | Next.js (App Router), TypeScript, PWA | wie vorgegeben. Expo Router für Web habe ich geprüft und verworfen: Die Store-App kommt später, und Next.js ist für Admin, Web-Push und Barrierefreiheit im Browser ausgereifter. Gemeinsam genutzt werden Datenbank, Edge Functions, Texte und Typen. |
| Anmeldung | Supabase Auth, E-Mail mit 6-stelligem Code und Link; Admin zusätzlich mit TOTP (Zwei-Faktor) | Code funktioniert auch in der installierten iPhone-Web-App |
| Mailversand für die Anmeldung | Supabase Auth über Brevo (eigener SMTP-Zugang) | der eingebaute Supabase-Versand ist nur für Tests gedacht |
| Zuordnung | `networkx.max_weight_matching` wie vorgegeben, mit Laufzeit-Messung und Ersatz-Bibliothek (siehe Risiko 5.9) | deckt alle Orientierungen ab |
| Embeddings | Amazon Titan Text Embeddings V2 (`amazon.titan-embed-text-v2:0`), laut AWS direkt in Frankfurt verfügbar | Vorauswahl über pgvector; deutsche Qualität teste ich in M4, sonst nur Regeln |
| Sprachmodell | Claude Sonnet 5.5 über `eu.anthropic.claude-sonnet-5-5` für Gespräch und Hintergrund-Agenten | Entscheidung vom 03.10.2026, Details in 5.1 |
| Spracherkennung | Deepgram Nova-3 mit `language=de` (einsprachig), EU-Endpunkt, `mip_opt_out=true` | Nova-3 kann Deutsch einsprachig seit 09/2025; der EU-Endpunkt leitet laut Deepgram nie außerhalb der EU weiter |

---

## 3. Verfeinertes Datenmodell

Der Vorschlag aus Abschnitt 5 des Auftrags bleibt die Grundlage. Hier stehen nur die Änderungen und Ergänzungen, mit Grund. Alle Zeiten `timestamptz`, Anzeige Europe/Berlin, RLS auf jeder Tabelle.

### 3.1 Aufteilung in Schemas

| Schema | Inhalt | Zugriff |
|---|---|---|
| `public` | `waitlist`, `signup_attempts`, `link_hits` (wie Design-Datei 2.1, ohne Policies für `anon`) | nur Edge Functions |
| `app` | Konto, Profil ohne Art.-9-Daten, Zeiten, Gespräche, Auswahl, Abende, Lokale, Rückmeldungen | Person sieht nur eigene Zeilen |
| `private` | `account_facts` (Name, Anschrift, Geburtsdatum, Telefon) | Person selbst, Admin; nie die Auswahl |
| `sensitive` | Art.-9-Daten, verschlüsselte Spalten | eigene Rolle; Auswahl nur über Prüffunktionen |
| `safety` | Meldungen, Sanktionen, Sperrliste, Sicherheits-Hinweise des Agenten | nur Admin und eng begrenzte Functions |
| `billing` | Mitgliedschaft, Zeiträume, Kontingent-Buch, Stripe-Ereignisse, Kündigung und Widerruf | Person liest eigene Daten, schreiben nur Functions |
| `ops` | `app_settings`, `audit_log`, `notifications_log`, Kostenprotokoll, Testuhr | Admin, Functions |

### 3.2 Wichtige Änderungen gegenüber dem Vorschlag

1. **Warteliste – Platznummer:** Die Design-Datei hat `place_number integer unique` und „fortlaufend je Startregion“. Beides zusammen geht nicht (zwei Regionen hätten dann Nr. 1). Außerdem verträgt sich „beide rücken 50 Plätze vor“ nicht mit einer festen, eindeutigen Nummer.
   Lösung:
   - `region_group` (westmecklenburg, hamburg, luebeck, rostock, anderswo) wird aus `region` abgeleitet.
   - `base_number` wird bei Bestätigung vergeben, fortlaufend je `region_group`, eindeutig als Paar (`region_group`, `base_number`).
   - `bonus_steps` zählt die Vorrückungen (eigene bestätigte Einladung plus „wurde eingeladen und hat bestätigt“).
   - Der angezeigte Platz wird berechnet: Reihenfolge nach `base_number − 50 × bonus_steps`, bei Gleichstand nach `confirmed_at`, mindestens Platz 1.
   - Folge, die du kennen solltest: Wenn andere vorrücken, kann die eigene Nummer etwas größer werden. Die Willkommens-Mail nennt deshalb den Platz „zum Zeitpunkt der Bestätigung“.
2. **Gründungsmitglied:** Wird bei Bestätigung einmal festgelegt (erste 500 bestätigte aus der Gruppe Westmecklenburg, nach `confirmed_at`, nicht nach dem berechneten Platz) und nie wieder entzogen.
3. **Einladungen:** Eigene Tabelle `waitlist_invites` (Code, Einladende Person, genutzt von, genutzt am). Die Zahl der Einladungen je Person ist eine Einstellung (Start: 1, zweite nach Nutzung freischaltbar).
4. **Geschlecht und gesuchtes Geschlecht** wandern aus `profile_core` nach `sensitive.profile_identity` (Begründung: EuGH C-184/20, Urteil vom 01.08.2022: Daten, die mittelbar die Orientierung offenbaren, sind Art.-9-Daten). Die Einwilligung `art9_profile` deckt sie ab und wird **vor** dem Formular eingeholt.
5. **Prüffunktionen statt Rohdaten für die Auswahl:** Der Auswahl-Job liest keine Art.-9-Spalten. Er ruft Datenbankfunktionen auf wie `sensitive.gender_compatible(a, b)` und `sensitive.religion_compatible(a, b)`, die nur `true` oder `false` liefern. So bleibt der Grundsatz „keine Art.-9-Rohdaten an das LLM“ auch technisch gesichert.
6. **Ausweis:** `verifications` bekommt `name_match`, `birth_date_match` und `provider_session_deleted_at` (Nachweis, dass die Sitzung bei Didit gelöscht wurde).
7. **Sperrliste mit zwei Schlüsseln:** Neben dem Hash aus Ausweisnummer und Geburtsdatum ein zweiter Hash aus normalisiertem vollen Namen und Geburtsdatum. Grund: Ein neuer Ausweis hat eine neue Nummer. Der zweite Hash sperrt nicht automatisch, sondern meldet Benn einen Verdachtsfall (Namensgleichheit ist möglich).
8. **Einwilligungen nur anhängen, nie ändern:** Jede Erteilung und jeder Widerruf ist eine neue Zeile; der aktuelle Stand ist eine Sicht (`consents_current`). Das ist der Nachweis nach Art. 7 Abs. 1 DSGVO.
9. **Transkripte in eigener Tabelle** `interview_transcripts` mit `delete_at`. Löschen ist dann ein einfaches Entfernen der Zeile, und der Zugriff lässt sich strenger regeln als bei den Zusammenfassungen.
10. **Freie Zeiten als Einzelzeilen** `availability_windows (user_id, period_id, starts_at, ends_at)` statt `jsonb`. Gemeinsame Fenster lassen sich so direkt in der Datenbank berechnen und testen.
11. **Kontingent als Buch** `billing.evening_ledger` statt Zähler `evenings_used`: Jede Gutschrift, Zuteilung, Nutzung und jeder Verfall ist eine Zeile. Verfügbare Abende = Summe. Das macht Absage-Regeln, Gutschriften und Verlängerungen nachvollziehbar und gut testbar. `free_phase` und `evening_credits` gehen darin auf.
12. **Mitgliedschafts-Zeiträume** `billing.membership_periods (user_id, starts_at, ends_at, tier, evenings_allowed, extended_by_rule)`. Die Verlängerungsregel prüft am Ende jedes Zeitraums.
13. **Abend als Zustandsautomat:** Zustandswechsel nur über die Funktion `app.evening_transition(evening_id, ereignis)`. Unerlaubte Wechsel lehnt die Datenbank ab. Fristen stehen in `app.evening_deadlines`; ein Cron-Job prüft alle 5 Minuten.
    Zustände: `proposed → time_requested ⇄ time_countered → confirmed → happened | cancelled_early | cancelled_late | no_show`, dazu `lapsed` bei abgelaufener Frist und `declined` bei Ablehnung des Vorschlags (fehlt im Vorschlag).
14. **Lokale:** Kapazität als Zeilen `venue_slots (venue_id, starts_at, tables)` statt `jsonb`, damit „Lokal mit Platz“ eine echte Abfrage ist.
15. **Admin-Rolle:** Tabelle `admin_users`. Admin-Policies verlangen eine Sitzung mit Zwei-Faktor (Supabase-Stufe `aal2`).
16. **Kostenprotokoll** `ops.session_costs` (Minuten, STT-Sekunden, LLM-Tokens ein/aus/Cache, TTS-Zeichen, Betrag in Euro).

### 3.3 Übersicht der Tabellen

```
public    waitlist, waitlist_invites, signup_attempts, link_hits
app       accounts(user_id, status, address_form, tier_view)
          geo(user_id, lat, lon, source)                    -- nur PLZ-Mittelpunkt
          verifications(...)                                -- siehe 3.2 Nr. 6
          consents (+ Sicht consents_current)
          profile_core(... ohne gender/seeking ...)
          wants, dealbreakers
          availability_periods, availability_windows
          interview_sessions, interview_transcripts, profile_embeddings, personal_weights
          match_runs, pair_candidates, pairings
          evenings, evening_events, evening_deadlines, feedback
          venues, venue_slots
          blocks, push_subscriptions, trust_shares (Abend teilen, läuft nach 24 h ab)
private   account_facts
sensitive profile_identity(gender, seeking_genders, orientation)
          profile_sensitive(religion, religion_importance, religion_must_match, health_notes)
safety    reports, sanctions, appeals, blocklist, safety_flags
billing   memberships, membership_periods, evening_ledger, stripe_events, contract_actions
ops       app_settings, audit_log, notifications_log, session_costs, legal_documents, sim_clock (nur Test)
```

Die genauen Spalten, Prüfregeln und RLS-Policies schreibe ich in M0 als Migrationen; die RLS-Tests („niemand liest fremde Daten“) kommen in M2.

### 3.4 Postleitzahlen

Für die PLZ-Mittelpunkte brauche ich offene Daten zum lokalen Import. Die üblichen Quellen stammen aus OpenStreetMap (Lizenz ODbL: Nutzung erlaubt, Quellenangabe Pflicht, Änderungen an der Datenbank unter gleicher Lizenz). Die amtlichen PLZ-Daten der Deutschen Post sind nicht frei. Ich prüfe die genaue Quelle und Lizenz in M2 und trage sie in `docs/DECISIONS.md` ein. Kein externer Geodienst zur Laufzeit.

---

## 4. Meilensteinplan M0–M9

Aufwand in **Arbeitstagen von mir**, grob geschätzt. Dazu kommt deine Zeit für Abnahme und für deine eigenen Aufgaben (Konten, Verträge, Anwalt). Die Kalenderzeit hängt vor allem davon ab, wie schnell Konten und Verträge stehen.

| # | Inhalt (Kurzfassung) | Aufwand | Was du dafür brauchst oder tust |
|---|---|---|---|
| M0 | Monorepo, CI, Supabase lokal, Migrationen-Grundgerüst, Tokens (CSS, JSON, TS), Schriften selbst gehostet, Fermate-SVG (graviert, kompakt), Favicons, Animation „Atem“ (≤ 8 KB gzip), Tonalitäts- und Kontrastprüfung, `docs/`-Dateien | 3–4 | GitHub-Repo (Frage A2); sonst nichts |
| M1 | Landingpage + Warteliste: Astro, Edge Functions `waitlist-*`, Brevo-DOI (Attrappe im Test), Platz, Einladung, Gründungsstatus, Plakat-Kürzel, Statistik, Hörprobe (per Schalter), Rechtsseiten als Entwurf | 5–7 | für die Live-Schaltung: Domain, Supabase-Projekt Frankfurt, Brevo mit SPF/DKIM/DMARC, Vercel, Impressumsdaten |
| M2 | Web-App-Gerüst (PWA), Anmeldung, Einwilligungen, Formular, PLZ-Mittelpunkt, Didit-Sandbox, Sperrliste, Konto löschen, Datenexport, RLS-Tests | 6–8 | Didit-Sandbox-Zugang, Antwort zur Biometrie-Alternative |
| M3 | Viola: LiveKit + Deepgram EU + Bedrock EU + TTS-Schnittstelle, „Atem“ live, KI-Hinweis, Sie/Du, Leitfaden (je Stufe ≥ 8 Situationen), Hintergrund- und Sicherheits-Agent, Text statt Stimme, Kostenprotokoll, Transkript-Löschung, Blindtest-Werkzeug | 12–18 | AWS-Zugang zu Sonnet 5.5 in Frankfurt (mit Marketplace-Abo), Deepgram, LiveKit-Entscheidung, TTS-Testzugänge, 12–16 Testpersonen für den Blindtest |
| M4 | Profil-Auswertung, Auswahl-Job (Filter, Teil-Scores, LLM-Rubrik, Zuordnung, Mindestscore, Wartebonus, Lokal-Wahl), Prüf-Agent, Admin-Freigabe, Simulation 200 Profile, Lasttest 5.000 | 8–12 | – |
| M5 | Zeitenabfrage, Terminabstimmung mit Fristen, Lokale (Pflege, Plätze, Reservierungs-Mail), Web-Push + E-Mail, Erinnerungen, Finde-Fenster, Rückmeldung, Nachbesprechung | 10–14 | ein Android-Telefon und ein iPhone zum Testen, erste Lokal-Daten |
| M6 | Stripe (Testmodus): 3 Stufen, 4-Wochen-Abrechnung, Gratisphase ohne Karte, Verlängerungsregel, Kontingente, Kündigungs- und Widerrufsknopf, Bestätigungs-Mails | 6–8 | Stripe-Konto (Testmodus), Antworten zu USt, Loge in der Testphase, Definition „kein Abend“, Wertersatz |
| M7 | Sicherheit: 15 Standards, Melden überall, vorläufige Sperre, Null-Toleranz-Ablauf mit Vorlage für die Polizeimeldung, Widerspruch, Abend teilen, Check-in, Hilfe-Knopf | 6–8 | Entscheidung Erkennungsfoto, Folgen bei Nichterscheinen |
| M8 | Rechtstexte als ENTWURF eingebunden, DSFA-Entwurf, Verzeichnis, AV-Liste, TOM, Löschkonzept, `DATA.md` | 4–6 | externer Datenschutzbeauftragter, Anwalt für die Prüfung |
| M9 | Staging, Probelauf mit 10–20 Testpersonen über einen vollen 14-Tage-Zyklus, Kennzahlen-Dashboard, Runbook, Startcheckliste | 5–7 + 14 Tage Probelauf | Testpersonen, mindestens ein Partner-Lokal |
| | **Summe** | **ca. 65–92 Arbeitstage** plus Probelauf | |

Zwei Vorschläge zur Reihenfolge:

- **Hörprobe:** Entweder geht M1 ohne Hörprobe live (Abschnitt per Schalter ausgeblendet, kommt nach M3), oder wir ziehen einen kleinen Blindtest mit zwei bis drei Stimmen vor, die schon jetzt in der EU laufen (siehe 5.12). Die Warteliste soll zuerst live gehen; ich würde sie nicht an der Stimme warten lassen.
- **M8 nicht ans Ende schieben:** Impressum, Datenschutzerklärung (Gliederung) und Einwilligungstext der Warteliste brauche ich schon in M1. Ich lege sie in M1 als Entwurf an; M8 ergänzt den Rest.

---

## 5. Risiken

### 5.1 Sprachmodell für das Gespräch (entschieden: nicht Haiku 4.5)

**Ehrliche Einordnung zu „fähiger und günstiger“:** Bei Claude gibt es das zurzeit nicht in einem Modell. Laut Anthropic-Modellübersicht (Stand 03.10.2026) ist Haiku 4.5 weiterhin das schnellste und günstigste Claude-Modell; ein neueres Haiku gibt es nicht. Fähiger ist Sonnet 5.5, es kostet aber je Token das Doppelte. Günstiger als Haiku sind nur Modelle anderer Anbieter, und die sind in den üblichen Vergleichen schwächer.

| Modell (EU-Profil) | Preis je 1 Mio. Token (Listenpreis, ein/aus) | Einordnung |
|---|---|---|
| Claude Haiku 4.5 | 1 $ / 5 $ | schnellstes Claude-Modell; entfällt auf deinen Wunsch |
| **Claude Sonnet 5.5** `eu.anthropic.claude-sonnet-5-5` | 2 $ / 10 $ | deutlich fähiger, laut Anthropic „schnell“; Start 28.09.2026, Abschaltung frühestens 28.09.2027 |
| Amazon Nova 2 Lite `eu.amazon.nova-2-lite-v1:0` | laut Preisvergleich ca. 0,30 $ / 2,50 $ | günstiger, in Benchmarks im Mittelfeld; Abschaltung frühestens 02.12.2026 |

Bei Claude über Bedrock kommen für EU-Profile laut Anthropic 10 % Aufschlag dazu.

**Was das je Gesprächsstunde kostet (Überschlag, nur das Sprachmodell):** Annahmen: 90 Antworten von Viola je Stunde, je Antwort ca. 5.000 Token aus dem Zwischenspeicher, 1.000 neue Token und 130 Token Ausgabe, EU-Aufschlag eingerechnet.
- Sonnet 5.5: ca. **0,48 $ je Stunde**
- Haiku 4.5 zum Vergleich: ca. 0,24 $ je Stunde

Der Unterschied liegt also bei rund einem Vierteldollar je Gesprächsstunde. Das Ziel von ca. 2 € je 60 Minuten bleibt erreichbar, weil Spracherkennung, Stimme und Medienserver den größeren Teil ausmachen. Echte Zahlen kommen aus dem Kostenprotokoll in M3.

**Entscheidung:** Sonnet 5.5 wird Standard für das Gespräch **und** für die Hintergrund-Agenten. Ein Modell für alles macht Betrieb und Tests einfacher. Die Modell-IDs bleiben Einstellungen (`VOICE_LLM_MODEL_ID`, `ANALYSIS_LLM_MODEL_ID`), ein späterer Wechsel bleibt also eine Einstellung plus Testlauf.

**Optional in M3:** ein Vergleichslauf mit Nova 2 Lite (Antwortzeit, Deutsch, Regeltreue bei Krise und Minderjährigen). Das wäre eine Abweichung vom Auftrag (Claude). Ich würde es nur als Vergleich messen, nicht ohne deine Zustimmung einsetzen.

**Technische Punkte für Sonnet 5.5, die ich in M3 einbaue (laut Anthropic-Migrationsleitfaden):**
- Denken ist standardmäßig an. Für Viola stelle ich es auf die niedrigste Stufe (`thinking: between_tools`, `effort: low`), sonst wird die Antwortzeit zu lang. `thinking: disabled` lehnt Sonnet 5.5 mit einem Fehler ab.
- `temperature`, `top_p` und `top_k` werden nicht mehr angenommen. Ich prüfe, ob das LiveKit-Bedrock-Plugin solche Werte mitschickt, und stelle es sonst passend ein.
- Ein erzwungener Werkzeugaufruf geht nicht mehr; Werkzeuge laufen mit `tool_choice: auto` und strengen Schemas (höchstens 20 Werkzeuge je Anfrage, wir brauchen 5).
- Antwortzeit messe ich wie geplant (Median und 90-%-Wert, Ziel unter 2 s).

**Weitere Hinweise:**
- Laut AWS-Modellkarte wird Sonnet 5.5 über den AWS Marketplace abgerechnet. Im AWS-Konto braucht es dafür ein Marketplace-Abo (Aufgabe für dich, Runbook).
- Zu Haiku 4.5 der Vollständigkeit halber: Es ist bei AWS noch „Active“. Nach der AWS-Regel für ältere Modelle steht ein Modell mindestens 6 Monate auf „Legacy“, bevor es abgeschaltet wird; neue Kunden können Legacy-Modelle aber nicht mehr freischalten. Mit deiner Entscheidung spielt das für Fermata keine Rolle mehr.

### 5.2 Web-Push auf dem iPhone

- Web-Push gibt es auf dem iPhone ab iOS 16.4 und **nur**, wenn die Web-App auf dem Home-Bildschirm liegt. In einem Browser-Tab geht es nicht, auch nicht in anderen Browsern.
- Praxisberichte sprechen von geringerer Zuverlässigkeit als bei Android.
- Dazu kommt das Anmeldeproblem: Die installierte Web-App hat einen eigenen Speicher, getrennt von Safari. Ein Link aus der Mail öffnet Safari, nicht die installierte App. Nach meinem Kenntnisstand ist das so; ich teste es in M2 auf einem echten iPhone.
- **Maßnahmen:** Anmeldung mit 6-stelligem Code; einfache Anleitung „Zum Home-Bildschirm“; jede Nachricht geht **immer** auch per E-Mail, wo eine Frist läuft; Push-Texte kurz und ohne Namen.

### 5.3 Name „Fermata“

- Es gibt eine japanische Femtech-Marke „fermata“ (hellofermata.com) mit Produkten unter anderem zur sexuellen Gesundheit. Das ist kein Dating, liegt aber thematisch nah.
- **Maßnahme:** Vor Druck und Domainkauf eine Markenrecherche (DPMA, EUIPO, WIPO) für die Klassen 45 (Partnervermittlung) und 9/42 (Software). Das kann ich nicht verbindlich für dich machen; ein Markenanwalt oder eine Rechercheagentur schon.

### 5.4 LiveKit: Region und Kosten

Der Auftrag verlangt beide Wege mit Kosten und Datenfluss. Stand laut LiveKit-Doku und Preisseite (02.10.2026):

| Weg | Datenfluss | Kosten | Aufwand für dich |
|---|---|---|---|
| **A: LiveKit Cloud „Ship“** ohne Regionsbindung | Agent in `eu-central` (Frankfurt) und Projektdaten in der EU laut Doku wählbar (ob schon in diesem Tarif, kläre ich in M3). Aber: Ohne Regionsbindung kann der Medienstrom über Server außerhalb der EU laufen (laut LiveKit ohne Speicherung). | ab 50 $/Monat, 5.000 Agent-Minuten und 150.000 Verbindungsminuten inklusive, danach 0,01 $/Agent-Min. | gering |
| **B: LiveKit Cloud „Scale“** mit Regionsbindung | Verbindungen außerhalb der erlaubten Regionen werden abgelehnt; Agent in `eu-central` | ab 500 $/Monat, 50.000 Agent-Minuten und 1,5 Mio. Verbindungsminuten inklusive | gering |
| **C: Selbst betrieben in AWS Frankfurt** (LiveKit-Server ist Open Source) | Medien bleiben auf deinem Server in Frankfurt | keine LiveKit-Gebühr; AWS-Server und Datenverkehr nach Verbrauch (rechne ich in M3 mit echten AWS-Preisen) | mittel: Server, TLS-Zertifikat, offene UDP-Ports, TURN, Updates; ich schreibe die Anleitung ins Runbook |

Mein Vorschlag für die Testphase: **C**, weil es die Daten am klarsten in Frankfurt hält und ohne Grundgebühr auskommt; A nur für die Entwicklung. B lohnt sich erst bei vielen Gesprächen. Entscheidung: Frage B3.

### 5.5 Didit (Drittland)

- **Neuer Stand:** Laut Didit-Hilfe und -Doku werden die Daten **standardmäßig in der EU** verarbeitet und gespeichert. „Enterprise“ betrifft nur die Verarbeitung im eigenen Land. Die Angabe im Auftrag („EU-Datenhaltung nur im Enterprise-Vertrag“) ist damit überholt.
- **Es bleibt ein Drittland-Risiko:** Didit hat seinen Sitz in San Francisco (USA). Ein US-Mutterunternehmen kann US-Behördenzugriffen unterliegen. Das gehört in die DSFA und in die Datenschutzerklärung (AV-Vertrag, Standardvertragsklauseln oder Data Privacy Framework prüfen).
- **Aufbewahrung:** Standard bei Didit ist „unbegrenzt“. Kürzeste Einstellung ist 1 Monat. Zusätzlich lösche ich jede Sitzung direkt nach dem Ergebnis per API (Didit nennt das „process-and-purge“). Training mit unseren Daten abschalten (laut Didit möglich).
- Plan B bleibt Veriff (Sitz Estland).

### 5.6 Store-Zahlungsregeln (spätere Expo-App)

- **Apple:** 3.1.1 verlangt In-App-Kauf, wenn Funktionen in der App freigeschaltet werden. 3.1.3(e) verlangt andere Zahlungswege für Leistungen, die außerhalb der App genutzt werden. Die Abende passen zu 3.1.3(e); die stufenabhängigen Gespräche und Nachbesprechungen sind digital und passen zu 3.1.1. Dazu 4.3(b): Neue Dating-Apps werden nur angenommen, wenn sie sich deutlich unterscheiden.
- **Google Play:** Die Zahlungsrichtlinie nennt **Dating-Abos ausdrücklich** als Fall für die Google-Play-Abrechnung; ausgenommen sind physische Leistungen wie eine Fitnessstudio-Mitgliedschaft. Das Risiko ist hier höher als bei Apple.
- **Maßnahme jetzt:** Die Gesprächstiefe ist schon im Backend als Freischaltung gebaut, sodass die Store-App sie für alle freigeben kann, ohne Code zu ändern. Entscheidung erst vor der Einreichung.

### 5.7 Art.-9-Daten über die Hintertür

- Gesuchtes Geschlecht, Teilnahme an einer Dating-App (Grindr-Fall), Religion als Filter: Vieles verrät sensible Merkmale.
- **Maßnahmen:** siehe 3.2 Nr. 4 und 5; Auswertungen und Fairness-Berichte nur nach Geschlecht und Altersband; die Gründe „warum Sie beide“ werden vor dem Speichern automatisch auf Art.-9-Inhalte geprüft.

### 5.8 Sprach-Agent: Antwortzeit und Kosten

- Ziel ca. 2 € je 60 Gesprächsminuten, 90 % der Antworten unter 2 s (aus dem Blindtest-Kriterium).
- Das EU-Geo-Profil kann Anfragen auf verschiedene EU-Regionen verteilen; das kann die Antwortzeit schwanken lassen.
- **Maßnahmen:** Kurze Antworten (höchstens zwei Sätze, dann eine Frage), Prompt-Caching, Stille nicht übertragen, mehrere kurze Sitzungen mit Zusammenfassung. Messung je Sitzung im Kostenprotokoll; Bericht mit Median und 90-%-Wert in M3.

### 5.9 Laufzeit der Zuordnung

- `networkx.max_weight_matching` hat laut Doku eine Laufzeit von O(n³) und ist in reinem Python geschrieben. Bei 5.000 Profilen kann das zu langsam werden.
- **Maßnahmen:** Der Graph bleibt dünn (nur Paare, die alle Filter bestehen und unter den Top 10 sind). Weit auseinanderliegende Regionen zerfallen oft in getrennte Teile, die einzeln gerechnet werden. Ich messe im Lasttest. Ersatz, falls nötig: die MIT-lizenzierte Bibliothek `mwmatching` (O(n·m·log n), Python und C++).

### 5.10 Kosten der LLM-Bewertung

- Bei 10 Kandidaten je Person sind es zwischen 5 × N (alle Vorschläge beruhen auf Gegenseitigkeit) und 10 × N Paar-Bewertungen je Lauf, also bei 200 Profilen bis 2.000 und bei 5.000 Profilen bis 50.000.
- **Maßnahmen:** Bewertung wiederverwenden, solange sich keine der beiden Zusammenfassungen geändert hat; Rubrik per Prompt-Caching; Batch-Verarbeitung bei Bedrock prüfen; Kosten je Lauf im Bericht. Genaue Preise rechne ich in M4 mit der dann gültigen AWS-Preisliste.

### 5.11 Stimme (TTS): Datenweg der Kandidaten

| Kandidat | EU-Weg laut Anbieter | Hinweis |
|---|---|---|
| Amazon Polly Generative „Vicki“ (de-DE) | in Frankfurt verfügbar, inklusive Streaming in beide Richtungen | gleicher Anbieter wie Bedrock |
| Google Chirp 3 HD | EU-Endpunkt `eu-texttospeech.googleapis.com` und Frankfurt | eigener Google-Cloud-Vertrag |
| Cartesia Sonic | EU-Regionen nur für Enterprise-Kunden | sonst Drittland |
| ElevenLabs | EU-Datenhaltung nur für Enterprise-Kunden; „Zero Retention Mode“ laut Anbieter | sonst Drittland |
| Azure Neural HD (optional) | in der Doku in M3 prüfen | – |

Die Versionsangabe „Cartesia Sonic 3.6“ aus dem Auftrag prüfe ich in M3. Vorschlag: Ohne Enterprise-Vertrag nehmen nur Kandidaten mit klarem EU-Weg am Blindtest teil, oder du entscheidest bewusst anders.

### 5.12 Recht: zwei geprüfte Daten

- **Widerrufsbutton:** § 356a BGB gilt seit 19.06.2026. Erster Schritt: Name, Vertrag und Kontaktweg angeben; zweiter Schritt: „Widerruf bestätigen“; sofortige Eingangsbestätigung auf einem dauerhaften Datenträger mit Datum und Uhrzeit.
- **KI-Hinweis:** Art. 50 AI Act gilt seit 02.08.2026. Laut Fachberichten wurde er durch den „AI Omnibus“ (VO (EU) 2026/1744, in Kraft seit 27.07.2026) nicht verschoben. Ich prüfe den Wortlaut in M8 direkt im Amtsblatt.

### 5.13 Weitere Punkte

- **Newsletter-Häkchen als Pflicht:** Die Design-Datei macht die Einwilligung zu Start-Mails zur Pflicht für die Warteliste. Weil die Warteliste genau dafür da ist, ist das vertretbar; das Kopplungsverbot (Art. 7 Abs. 4 DSGVO) sollte der Anwalt trotzdem ansehen.
- **Ein Mensch prüft alles:** Du bist die einzige Person für Freigaben und Meldungen (Ziel 24 h). Urlaub oder Krankheit sind ein Betriebsrisiko. Das Runbook bekommt einen Abschnitt „Was passiert, wenn Benn nicht erreichbar ist“ (zum Beispiel: Lauf aussetzen statt ungeprüft freigeben).
- **Supabase-Region fest:** Mit `x-region: eu-central-1` gibt es bei einem Ausfall in Frankfurt keine automatische Umleitung. Das ist gewollt (Daten bleiben in Frankfurt), bedeutet aber: Fällt Frankfurt aus, steht Fermata still.
- **Lighthouse ≥ 95 und CSP ohne `unsafe-inline`:** Astro bettet manche Skripte direkt ein. Ich stelle das so ein, dass alle Skripte als eigene Dateien kommen.

---

## 6. Fragen an dich

### A. Blockieren M0 oder M1 (bitte vor dem Start beantworten)

1. **Freigabe des Plans** inklusive meiner Abweichungen (Zusammenfassung in Abschnitt 7). Teilweise erledigt am 03.10.2026 (Heimwegtelefon, Didit, Sprachmodell, Anmeldung, Datenschutz); offen ist dein OK zum Rest.
2. **Wo liegt der Code?** Ich schlage ein privates GitHub-Repository vor (für CI und spätere Vercel-Anbindung). Hast du ein GitHub-Konto, und wie soll das Repo heißen? Bis dahin arbeite ich mit lokalem Git in deinem Ordner.
3. **Domain:** fermataclub.de, fermata.club oder etwas anderes? Ich baue mit Platzhalter, aber Mails, Links und CSP brauchen sie vor der Live-Schaltung. Vorher Markenrecherche (5.3).
4. **Hörprobe in M1:** (a) Abschnitt ausblenden bis nach dem Blindtest in M3, oder (b) kleinen Blindtest jetzt vorziehen mit Polly „Vicki“ und Google Chirp 3 HD?
5. **Preisangabe:** Umsatzsteuer ausweisen („inkl. 19 % USt“) oder Kleinunternehmer nach § 19 UStG? Davon hängt ab, wie die Preise auf der Landingpage stehen. Und: Preise in M1 schon zeigen oder per Schalter als „Preise geplant, Stand …“?
6. **Gründungsmitglieder:** Gibt es schon einen Vorteil? Wenn nicht, zeige ich nur „Die ersten 500 werden Gründungsmitglieder.“ und die Seite `/gruendungsmitglied` beschreibt nur, wer dazugehört.
7. **Impressum:** E-Mail-Adresse und Telefonnummer für Fermata (für die Live-Schaltung, nicht für den Bau).
8. **Startmonat** der ersten Abende, oder Zeile ausblenden?
9. **Einwilligung zur Warteliste:** Pflicht-Häkchen wie in der Design-Datei beibehalten (Anwalt prüft später)?

### B. Später (mit Meilenstein)

| # | Frage | Bis |
|---|---|---|
| B1 | Ist die Straßenanschrift im Formular wirklich nötig? Für die Auswahl reicht die PLZ; für Rechnungen hat Stripe die Anschrift. Weniger Daten = weniger Risiko. Nach deinem Grundsatz „auf Nummer sicher“ empfehle ich: Straße weglassen. | M2 |
| B2 | Alternative für Menschen, die der Biometrie nicht zustimmen (z. B. persönliche Prüfung im Lokal)? | M2 |
| B3 | LiveKit: Weg A, B oder C (5.4)? | M3 |
| B4 | TTS-Gewinner nach Blindtest; Enterprise-Verträge für Cartesia oder ElevenLabs gewünscht? | M3 |
| B5 | Transkripte bei Sicherheitsfällen länger aufbewahren (Beweissicherung)? | M3 |
| B6 | Länge der Nachbesprechung (Vorschlag Andante ca. 10 Min., Loge ca. 20 Min.)? | M5 |
| B7 | Erkennungsfoto am Abendtag ja oder nein? | M5 |
| B8 | Gültigkeit von Gutschriften (Vorschlag 3 Monate)? | M5 |
| B9 | Folgen wiederholten Nichterscheinens bei Mitgliedern? | M5 |
| B10 | Liste der Partner-Lokale und ihre Vereinbarungen (Getränke, Loge-Behandlung)? | M5 |
| B11 | Loge in der Testphase anbieten (dann höchstens 2 Abende je 4 Wochen)? | M6 |
| B12 | Definition „kein Abend“ für die Verlängerung bestätigen? | M6 |
| B13 | Wertersatz-Methode (rechnerisch 49 €, 74,50 €, 74,75 € je Abend) mit dem Anwalt bestätigen? | M6 |
| B14 | Teilnahme an der Verbraucherschlichtung ja oder nein (§ 36 VSBG)? | M8 |
| B15 | Externer Datenschutzbeauftragter: wer? | M8 |

---

## 7. Abweichungen vom Auftrag und Korrekturen (Übersicht)

| Punkt | Auftrag oder Design-Datei | Mein Vorschlag |
|---|---|---|
| Heimwegtelefon | 0800 46484648, So–Do 21–24 Uhr | 030 12074182 (geprüft am 03.10.2026), So–Do 21–01 Uhr, Fr/Sa 21–03 Uhr (offizielle Seite); als Einstellung, vor Start erneut prüfen |
| Didit-Datenhaltung | EU nur im Enterprise-Vertrag | laut Didit EU standardmäßig; Drittland-Risiko bleibt wegen US-Sitz |
| Sprachmodell im Gespräch | Haiku 4.5 | Sonnet 5.5 (entschieden am 03.10.2026), Denken auf niedrigster Stufe |
| Anmeldung | E-Mail-Link | E-Mail mit Code und Link (iPhone-Web-App) |
| Geschlecht / gesuchtes Geschlecht | in `profile_core` | im Art.-9-Bereich `sensitive` |
| Platznummer | `place_number unique`, fortlaufend je Region, +50 | Grundnummer je Region plus berechneter Platz |
| Kontingente | Zähler und Gutschrift-Tabelle | ein Kontingent-Buch |
| Abend-Zustände | ohne Ablehnung | zusätzlich `declined` |
| Hörprobe in M1 | Pflicht | per Schalter, bis die Stimme gewählt ist |
| Plakat-Kürzel | statische Seite | eine kleine Server-Funktion für die Zählung |

Texte der Design-Datei, die ich nach Abschnitt 12 des Auftrags ersetze: Schritt „Der Abend“ und „Die Rückmeldung“ (4.3), Regionstext (4.6), Preisabschnitt mit „monatlich kündbar“ und alten Beträgen (4.7), Gründungsvorteil „kostet dauerhaft weniger“ (4.6, 2.3), Fragen 1, 2, 7 und 8 (4.10). Jede Änderung markiere ich im README.

---

## 8. Nächster Schritt

Ich stoppe hier. Nach deinem OK und den Antworten auf Abschnitt 6 A beginne ich mit M0. Dabei lege ich auch `docs/DECISIONS.md` (mit den Quellen unten), `docs/PLATZHALTER.md`, `docs/DATA.md` und `docs/RUNBOOK.md` an.

---

## Quellen (geprüft am 02.10.2026)

- AWS Bedrock, Claude Haiku 4.5: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-4-5.html
- AWS Bedrock, Claude Sonnet 5.5: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html
- Anthropic, Modellübersicht: https://platform.claude.com/docs/en/models/overview
- Anthropic, Preise (inkl. 10 % Aufschlag für regionale Endpunkte): https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic, Migrationsleitfaden Sonnet 5.5: https://platform.claude.com/docs/en/models/sonnet-5-5/migration-guide
- AWS Bedrock, Nova 2 Lite: https://docs.aws.eu/bedrock/latest/userguide/model-card-amazon-nova-2-lite.html
- Preisvergleich Nova 2 Lite: https://pricepertoken.com/pricing-page/model/amazon-nova-2-lite-v1
- AWS Bedrock, Lebenszyklus-Regeln: https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle-legacy.html
- AWS Bedrock, Titan Text Embeddings V2: https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-titan-text-embeddings-v2.html
- Amazon Polly, Generative Stimmen: https://docs.aws.amazon.com/polly/latest/dg/generative-voices.html
- LiveKit, Region Pinning: https://docs.livekit.io/deploy/admin/regions/region-pinning
- LiveKit, Data Residency: https://docs.livekit.io/deploy/admin/regions/data-residency
- LiveKit, Preise: https://livekit.com/pricing
- Deepgram, Nova-3 Deutsch: https://deepgram.com/learn/deepgram-expands-nova-3-with-german-dutch-swedish-and-danish-support
- Deepgram, Regionale Endpunkte: https://developers.deepgram.com/reference/regional-endpoints
- Deepgram, Model Improvement Program: https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program
- Didit, Datenaufbewahrung: https://docs.didit.me/console/data-retention.md
- Didit, Datenschutz: https://help.didit.me/data-privacy/how-didit-protects-data
- Supabase, Regional Invocation: https://supabase.com/docs/guides/functions/regional-invocation
- Supabase, E-Mail-Code und Link: https://supabase.com/docs/guides/auth/auth-magic-link
- Stripe, Abrechnungsdatum verschieben: https://docs.stripe.com/billing/subscriptions/billing-cycle
- Google Cloud Text-to-Speech, Endpunkte: https://docs.cloud.google.com/text-to-speech/docs/endpoints
- Cartesia, Regionale Endpunkte: https://docs.cartesia.ai/enterprise/regional-endpoints
- ElevenLabs, EU-Datenhaltung: https://elevenlabs.io/pt/blog/introducing-european-data-residency
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Zahlungsrichtlinie: https://support.google.com/googleplay/android-developer/answer/9858738
- Web-Push auf iOS 2026 (Praxisbericht): https://webscraft.org/blog/pwa-pushspovischennya-na-ios-u-2026-scho-realno-pratsyuye?lang=de
- Widerrufsbutton § 356a BGB: https://www.noerr.com/de/insights/umsetzungsgesetz-zum-widerrufsbutton-veroeffentlicht
- AI Act Art. 50 nach dem AI Omnibus: https://kibrains.de/2026/08/19/ai-omnibus-kennzeichnungspflicht-dezember-2026/
- EuGH C-184/20 (mittelbar sensible Daten): https://stevens-bolton.com/site/insights/articles/the-cjeu-widening-the-definition-of-sensitive-personal-data
- Heimwegtelefon: https://heimwegtelefon.net/ und https://heimwegtelefon.net/kontakt/ (zweite Quelle: https://www.giga.de/artikel/heimwegtelefon-diese-telefonnummer-bringt-euch-nachts-nach-hause/)
- networkx `max_weight_matching`: https://networkx.org/documentation/latest/reference/algorithms/generated/networkx.algorithms.matching.max_weight_matching.html
- `mwmatching` (Ersatz-Bibliothek): https://git.jorisvr.nl/joris/maximum-weight-matching
- Marke „fermata“ (Japan): https://hellofermata.com/en/pages/community
