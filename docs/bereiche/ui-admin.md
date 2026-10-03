# Admin-Oberfläche (UI-Welle)

Stand: 03.10.2026 · Bereich: `apps/web/src/app/admin/**`, `apps/web/src/components/admin/**`, Texte
`apps/web/src/copy/admin*.ts`, E2E `apps/web/tests/e2e/admin-*.spec.ts`, Datenbank
`supabase/migrations/20261003000830_admin_metrics.sql` mit `supabase/tests/830_admin_metrics.test.sql`.

> **Kurz für Benn:** Der Admin-Bereich ist fertig für den Probelauf. „Heute“ zeigt jeden Morgen, was ansteht.
> Unter „Auswahl“ prüfst du jeden Vorschlag einzeln (oder gesammelt, wenn es keine Warnung gibt), unter
> „Sicherheit“ arbeitest du Meldungen in der 24-Stunden-Frist ab. Alles läuft nur mit Zwei-Faktor-Anmeldung,
> jede Entscheidung steht im Audit-Protokoll. Offene Punkte stehen ganz unten.

Bildschirmfotos (Desktop 1440 px hell und dunkel, mobil 390 px für „Heute“ und die Prüfung eines Laufs):
[`docs/screenshots/web/ui-admin/`](../screenshots/web/ui-admin/).

## Inhalt

1. [Deine Routinen und die passenden Seiten](#deine-routinen-und-die-passenden-seiten)
2. [Die Seiten im Einzelnen](#die-seiten-im-einzelnen)
3. [Datenschutz und Sicherheit](#datenschutz-und-sicherheit)
4. [Neue Datenbank-Funktionen](#neue-datenbank-funktionen)
5. [Lokal ausprobieren](#lokal-ausprobieren)
6. [Tests](#tests)
7. [Gemeinsame Dateien, die ich geändert habe](#gemeinsame-dateien-die-ich-geändert-habe)
8. [Offene Punkte](#offene-punkte)

## Deine Routinen und die passenden Seiten

Die Routinen stammen aus [RUNBOOK.md, Abschnitt 7](../RUNBOOK.md#7-routinen).

### Täglich, morgens (ca. 10 Minuten)

| Schritt | Seite | Was du dort tust |
|---|---|---|
| 1. Überblick | **Heute** (`/admin`) | Karten „Jetzt zu tun“: Läufe in Prüfung, Meldungen mit Frist (überfällig rot, mit Symbol und Text), Hinweise nach Dringlichkeit, Reservierungen, die das Lokal noch nicht bestätigt hat, Abende ohne Ergebnis, offene Widersprüche, vorläufige Sperren. Leere Karten sind ruhig grau. |
| 2. Meldungen (Ziel 24 h) | **Sicherheit → Meldungen** (`/admin/sicherheit`) | Liste nach Stufe und Frist. Meldung öffnen → „In Prüfung nehmen“ → bei Bedarf Sanktion verhängen → „Abschließen“ mit Begründung. |
| 3. Hinweise | **Sicherheit → Hinweise** (`/admin/sicherheit/hinweise`) | Hinweise des Sicherheits-Agenten, Sperrliste, Check-in, Rückmeldungen. Mit kurzem Ergebnis als erledigt vermerken. Bei Hinweisen aus einem Gespräch: Transkript nur mit Begründung öffnen. |
| 4. Widersprüche | **Sicherheit → Widersprüche** | Annehmen (Sanktion wird aufgehoben) oder ablehnen; die Begründung geht per Mail an die Person. |
| 5. Lokale | **Heute**, Karte „Lokal hat noch nicht bestätigt“ | Bei Lokalen mit Telefon-Reservierung anrufen (Nummer steht in der Karte). |
| 6. Abende klären | **Lokale & Plätze → Abende klären** | Bestrittenes Nichterscheinen, offene Meldung zum Abend oder seit 48 h kein Ergebnis: „Stattgefunden“ oder wer nicht erschienen ist. |

### Je Auswahl-Lauf (alle 14 Tage)

| Schritt | Seite | Was du dort tust |
|---|---|---|
| 1. Lauf öffnen | **Heute** → Karte „Auswahl-Läufe in Prüfung“ oder **Auswahl** (`/admin/auswahl`) | Überblick: Pool, Vorschläge, offen, Kosten, Laufzeit. |
| 2. Vorschläge prüfen | **Auswahl → Lauf** (`/admin/auswahl/<id>`) | Je Vorschlag: beide Personen (Anzeigename, Altersband), „Warum Sie beide“ (das sehen beide), Lokal mit Begründung, Terminvorschläge (Vorschau), Gesamt- und Teil-Scores, Begründung des Sprachmodells, Prüf-Agent mit Empfehlung und Warnungen. Vorschläge mit Warnung haben einen gelben Rand und ein Abzeichen. |
| 3. Entscheiden | dieselbe Seite | „Freigeben“ (Kommentar freiwillig) oder „Ablehnen“ (Kommentar Pflicht). **Sammelfreigabe** nur für Vorschläge ohne Warnung, mit Rückfrage. Tastatur: Pfeil hoch/runter oder j/k springt von Vorschlag zu Vorschlag. |
| 4. Abschließen | dieselbe Seite, Karte „Lauf abschließen“ | Mit offenen Vorschlägen nur mit Häkchen „Offene Vorschläge beim Abschluss ablehnen“. |
| 5. Bericht | dieselbe Seite, Abschnitt „Bericht“ | Pool (Gründe), harte Filter (verworfene Paare je Grund), Verteilung der Qualität als Säulendiagramm mit Tabelle, Ergebnis, Fairness nach Geschlecht **oder** Altersband (k-anonym, kleine Gruppen ausgeblendet), Lokale, Prüfung, Sprachmodell und Kosten, Laufzeit je Stufe. |

### Wöchentlich und monatlich

| Was | Seite |
|---|---|
| Kennzahlen (Warteliste, Einrichtung der Konten, letzter Lauf, Abende, Rückmeldungen, Kosten, 24-Stunden-Ziel, Mitgliedschaften) | **Heute**, Abschnitt „Kennzahlen“ |
| Warteliste ansehen, die nächsten Personen in die App einladen | **Warteliste** (`/admin/warteliste`) |
| Lokale pflegen, neue Plätze anlegen (z. B. vier Wochen Do–Sa) | **Lokale & Plätze** (`/admin/lokale`) |
| Bestellungen, Kündigungen, Widerrufe prüfen (Bestätigung verschickt?) | **Mitgliedschaft** (`/admin/mitgliedschaft`) |
| Kontingent korrigieren (Kulanz, Fehler) | **Mitgliedschaft** → Person suchen → „Korrektur buchen“ (auch aus **Konten → Person**) |
| Platzhalter entscheiden und Werte ändern | **Einstellungen** (`/admin/einstellungen`), Filter „Nur Platzhalter zeigen“ |
| Zeitraum von Hand anlegen (sonst macht es der Zeitplan) | **Lokale & Plätze → Zeiträume** |

## Die Seiten im Einzelnen

| Weg | Inhalt | Funktionen (Schema `api`) |
|---|---|---|
| `/admin` **Heute** | Arbeitslisten, Kennzahlen (nur Summen, k ≥ 5), Bestand aus M2 | `admin_today`, `admin_kpis` (neu), `admin_overview` |
| `/admin/auswahl` | Läufe mit Stand, Pool, Vorschlägen, offen/freigegeben/abgelehnt, Kosten | `admin_match_runs` |
| `/admin/auswahl/<id>` | Prüfung aller Vorschläge, Sammelfreigabe, Abschluss, Bericht | `admin_run_pairings`, `admin_pairing_times` (neu), `admin_approve_pairing`, `admin_reject_pairing`, `admin_finish_run` |
| `/admin/sicherheit` | Meldungen (offen, erledigt, verworfen), Frist hervorgehoben | `admin_reports` |
| `/admin/sicherheit/meldungen/<id>` | Meldung, Beteiligte, Abend mit Verlauf und Check-ins, Vorgeschichte, Sanktionen (aufheben), Entscheiden, Sanktion verhängen, Polizeivorlage, Gespräche im Sicherheitsfall | `admin_report`, `admin_set_report_status`, `admin_decide_report`, `admin_impose_sanction`, `admin_lift_sanction`, `admin_case_sessions` (neu), `admin_safety_transcript` (Härtung) |
| `/admin/sicherheit/meldungen/<id>/polizei` | Vorlage für eine Polizeimeldung mit Kopierknopf und Erinnerung, dass du entscheidest | `admin_police_report_template` |
| `/admin/sicherheit/hinweise` | Hinweise als Liste, erledigen, Transkript bei Agent-Hinweisen (`/admin/hinweise` leitet hierhin) | `admin_safety_flags`, `admin_review_flag` |
| `/admin/sicherheit/widersprueche` | Widersprüche mit Sanktion und Wortlaut, entscheiden | `admin_appeals`, `admin_decide_appeal` |
| `/admin/sicherheit/sanktionen` (+ `/neu?person=<id>`) | aktive bzw. alle Sanktionen, aufheben; Sanktion ohne Meldung | `admin_sanctions`, `admin_impose_sanction` |
| `/admin/lokale`, `/neu`, `/<id>` | Lokale anlegen, ändern (Anschrift, Ort und Koordinaten aus der PLZ, Kontakt, Reservierungsart, Barrierefreiheit, Bus und Bahn, Vereinbarung), deaktivieren; Plätze anlegen (Wochentage, Uhrzeiten, Wochen, Tische), Tische ändern, Platz löschen; Reservierungen je Platz | `admin_venues`, `admin_create_venue`, `admin_update_venue`, `admin_set_venue_active`, `admin_create_slots`, `admin_update_slot`, `admin_delete_slot`, `admin_venue_slots`, `postal_code_lookup`; Lesen von `app.venues` (RLS für Admins) |
| `/admin/lokale/zeitraeume` | Zeiträume mit Zahl der Personen mit Zeiten und den Läufen; Zeitraum anlegen | `admin_availability_periods` (neu), `admin_create_availability_period` |
| `/admin/lokale/abende` | Abende zum Klären, Ergebnis festlegen (Hinweis „bestritten“ wird dabei erledigt) | `admin_evenings_to_resolve` (neu), `admin_resolve_evening`, `admin_review_flag` |
| `/admin/warteliste` | Summen, je Region, je Quelle mit Plakat-Aufrufen, je Tag (Säulen + Tabelle); bestätigte Einträge je Region nach Platz, Auswahl der ersten N, Einladung in die App, weiterer Einladungscode | `admin_waitlist_stats`, `admin_waitlist_entries` (neu), `admin_waitlist_grant_invite`, Edge Function `admin-invite` (mit `waitlist_id`) |
| `/admin/mitgliedschaft` | Erklärungen (Bestellung, Kündigung, Widerruf) mit Eingang, Wirksamkeit, Bestätigungsmail, Ergebnis; Kontingent korrigieren mit Pflicht-Begründung und Buchungsliste | `admin_contract_actions`, `admin_ledger_adjust`, `admin_accounts`, `admin_account`; Lesen von `billing.evening_ledger` (RLS) |
| `/admin/einstellungen` | nach Gruppe, Sprungliste, Platzhalter hervorgehoben (Rand, Abzeichen, Verweis auf die Frage in `docs/PLATZHALTER.md`), Filter „Nur Platzhalter“ | `admin_settings`, `admin_update_setting` |

Bausteine in `components/admin/`: `ActionForm` (Server Action mit Ladezustand, Rückfrage im Dialog,
Ergebnis als Hinweis; Eingaben bleiben nach einem Fehler erhalten), `SubNav`, `FilterLinks`, `DueText`,
`SeverityBadge`, `Figures`, `BarTable` (Balken mit Zahl, für Trichter und Verteilungen), `ColumnChart`
(Säulen in HTML, Höhen über Klassen wegen der CSP, Zusammenfassung für Screenreader und Werte als Tabelle),
`CopyButton`, `TranscriptAccess`, `SanctionForms`, `VenueForm`; Stile in `components/admin/admin.css`
(nur Tokens, hell und dunkel).

## Datenschutz und Sicherheit

- **Zwei-Faktor überall:** Proxy und Layout leiten ohne aal2 auf `/admin/mfa/bestaetigen`, jede Datenbank-Funktion
  prüft `app.is_admin()`. Mitglieder bekommen 404. Getestet in `admin-heute.spec.ts` und `830_admin_metrics.test.sql`.
- **Personen in der Auswahl** nur mit Anzeigename und Altersband; keine Nachnamen, keine Kontaktdaten.
- **Kennzahlen** nur als Summen, Zellen mit 1–4 Personen als „< 5“, in Verteilungen zusätzlich sekundäre
  Unterdrückung; Mittelwerte erst ab 5 Werten; keine Art.-9-Merkmale (der Test prüft den ganzen JSON-Text).
  Der Fairness-Bericht kommt unverändert aus dem Lauf (schon k-anonym, nie gekreuzt).
- **Transkripte** nur im Sicherheitsfall: erst die Liste der Gespräche (nur Metadaten, protokolliert, nur bei offenem
  Hinweis oder offener Meldung zur Person), dann je Gespräch „Transkript für diesen Sicherheitsfall öffnen“ mit
  Begründung (mindestens 10 Zeichen) und dem Hinweis, dass der Zugriff protokolliert wird. Das Transkript wird nur
  im Browser angezeigt, nicht in der Adresse und nicht im Seiten-Cache.
- **Polizeivorlage**: Entwurf, Erinnerung „Ob Anzeige erstattet wird, entscheidet Benn – nach Rücksprache mit der
  betroffenen Person“, jeder Abruf steht im Audit.
- **Strenge CSP** ohne Inline-Styles: Balkenbreiten und -höhen über Klassen `bar-w-0 … bar-w-100` und
  `bar-h-0 … bar-h-100`.
- **Barrierefreiheit:** axe (WCAG 2.1 AA) auf jeder Seite der E2E-Tests, auch im Dialog und mobil; Tastatur:
  alle Aktionen sind Knöpfe oder Links, Vorschläge mit j/k bzw. Pfeiltasten; Fristen und Warnungen immer mit Text
  und Symbol, nie nur Farbe; scrollbare Bereiche sind per Tastatur erreichbar.

## Neue Datenbank-Funktionen

Migration `20261003000830_admin_metrics.sql` (alle `security definer`, `app.is_admin()`, `grant execute … to authenticated`,
nicht für `anon`; jeder Abruf mit Personenbezug im Audit):

| Funktion | Zweck |
|---|---|
| `api.admin_today()` | Arbeitslisten für „Heute“ (ohne Namen): Läufe in Prüfung mit Zahl der Warnungen, Meldungen mit Frist, Hinweise je Stufe, unbestätigte Reservierungen, Abende zum Klären, Widersprüche, vorläufige Sperren, nächster Zeitraum |
| `api.admin_kpis()` | Kennzahlen nach `docs/KENNZAHLEN.md` (Warteliste, Trichter, letzter Lauf, Abende, Rückmeldungen, Kosten, 24-Stunden-Ziel, Mitgliedschaft), k ≥ 5 |
| `api.admin_waitlist_entries(p_region_group, p_include_invited, p_limit)` | bestätigte Einträge einer Gruppe nach Platz (gleiche Regel wie `app.waitlist_place`) |
| `api.admin_evenings_to_resolve()` | bestätigte, vergangene Abende ohne automatisches Ergebnis (bestritten, offene Meldung, über 48 h) |
| `api.admin_availability_periods()` | Zeiträume mit Zahl der Personen mit Zeiten und den Läufen |
| `api.admin_pairing_times(p_run_id)` | Terminvorschläge je Vorschlag (Vorschau mit derselben Regel wie die Freigabe; danach die des Abends) |
| `api.admin_case_sessions(p_user)` | Gespräche (nur Metadaten) einer Person mit offenem Sicherheitsfall, Fehler `no_safety_case` |
| `ops.kpi_k()`, `ops.kpi_n()`, `ops.kpi_cells()` | interne Hilfen für die k-Unterdrückung |

**Fund und Korrektur:** `api.admin_report` und `api.admin_police_report_template` (M7) waren `STABLE`, schreiben aber
ins Audit. PostgREST führt `STABLE`-Funktionen in einer schreibgeschützten Transaktion aus – die Einzelansicht einer
Meldung und die Polizeivorlage scheiterten daher über die API mit „cannot execute INSERT in a read-only transaction“
(in pgTAP fällt das nicht auf). Die Migration setzt beide auf `VOLATILE`; ein Test prüft, dass keine schreibende
API-Funktion `STABLE` ist.

## Lokal ausprobieren

Immer mit `STACK_SLOT=3` (App auf Port 3341, Gateway 54645, Stapel-Datenbank 54648):

```bash
pnpm install
STACK_SLOT=3 bash apps/web/scripts/stack.sh up        # Datenbank mit allen Migrationen, Auth, PostgREST, Mailpit, Functions
STACK_SLOT=3 bash apps/web/scripts/serve-e2e.sh       # baut die App und startet sie auf http://localhost:3341

# Testdaten: synthetische Profile und ein Auswahl-Lauf in Prüfung (nur Test-Umgebungen)
cd services/matcher && uv run fermata-matcher simulate --profiles 120 --seed 42 \
  --db-url postgres://postgres:postgres@localhost:54648/postgres && cd -

# Admin anlegen und anmelden (Zwei-Faktor wird beim ersten Mal eingerichtet)
set -a; . apps/web/.stack/env; set +a
ID=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "content-type: application/json" \
  -d '{"email":"benn@example.de","email_confirm":true}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
psql "$SUPABASE_DB_URL" -c "insert into app.admin_users (user_id, display_name) values ('$ID', 'Benn')"
# → http://localhost:3341/anmelden, Code aus Mailpit (http://localhost:54647), TOTP mit einer Authenticator-App
```

Mehr Testdaten (Meldungen, Widerspruch, Agent-Hinweis mit Transkript, Warteliste, Erklärungen) legt der
Bildschirmfoto-Test an: `pnpm --filter @fermata/web exec playwright test admin-screenshots.spec.ts --project=screenshots`.

Aufräumen: `STACK_SLOT=3 bash apps/web/scripts/stack.sh down`.

## Tests

| Was | Befehl | Stand 03.10.2026 |
|---|---|---|
| Datenbank (pgTAP) | `DB_PORT=54651 DB_CONTAINER=fermata-db-uic bash scripts/db.sh test` | 23 Dateien, 1 487 Prüfungen grün; neu `830_admin_metrics` (43 Prüfungen) |
| Unit (Vitest) | `pnpm --filter @fermata/web test` | 9 Dateien, 33 Tests grün; neu: Formate, Fristen, Ortszeit, Warnungen, Platzhalter gegen `docs/PLATZHALTER.md` |
| E2E Admin | Stapel + App wie oben, dann `pnpm --filter @fermata/web test:e2e -- admin-heute.spec.ts admin-auswahl.spec.ts admin-lokale.spec.ts admin-sicherheit.spec.ts admin-warteliste.spec.ts --project=e2e` | 14 Tests grün |
| E2E gesamt | `pnpm --filter @fermata/web test:e2e -- --project=e2e` | 28 Tests grün (14 bestehende, 14 neue) |
| Bildschirmfotos | `… test:e2e -- admin-screenshots.spec.ts --project=screenshots` | 36 Bilder in `docs/screenshots/web/ui-admin/` (16 Seiten Desktop hell/dunkel, „Heute“ und Prüfung zusätzlich mobil) |

Die E2E-Tests decken ab: „Heute“ mit überfälliger Meldung und k-Anonymität im Trichter, mobil ohne waagrechtes Scrollen;
Admin ohne Zwei-Faktor → Code-Abfrage, Datenbank lehnt aal1 ab; Mitglieder → 404; Lauf prüfen (Tastatur, Warnungen,
Ablehnen mit Pflicht-Kommentar, Freigeben legt den Abend an, Sammelfreigabe nur ohne Warnung, Abschluss, Audit,
Bericht mit Diagramm und Fairness); Lokal anlegen (Ort und Koordinaten aus der PLZ, Vereinbarung), ändern, Plätze
anlegen, Tische ändern, Platz löschen, deaktivieren; Zeitraum anlegen (doppelt abgelehnt); Abend klären;
Meldung (Frist, Einzelansicht im Audit, in Prüfung, befristete Sperre, aufheben, Polizeivorlage mit Kopieren,
abschließen); Widerspruch annehmen; Hinweis mit Transkript-Zugriff (Begründung, Protokoll) und erledigen; Warteliste
(Reihenfolge nach Platz, weiterer Code, zwei Personen einladen, Mail und Verknüpfung); Mitgliedschaft (Erklärungen,
Filter, Kontingent-Korrektur); Einstellungen (Gruppen, Platzhalter mit Frage, ändern). Auf jeder Seite axe und
keine CSP-Verstöße.

Testdaten: `tests/e2e/helpers/admin.ts` (Admin mit TOTP, Simulation über `services/matcher`) und
`tests/e2e/helpers/admin-fixtures.ts` (Mitglieder, Abende, Meldungen, Widersprüche, Agent-Hinweis, Warteliste,
Erklärungen).

## Gemeinsame Dateien, die ich geändert habe

Nur ergänzend:

- `apps/web/src/components/shell/Shells.tsx`: `adminNav` um Auswahl, Sicherheit, Lokale & Plätze, Warteliste,
  Mitgliedschaft erweitert; „Sicherheits-Hinweise“ liegt jetzt unter „Sicherheit“.
- `apps/web/src/components/ui/Icon.tsx`: drei neue Symbole (`copy`, `chart`, `pin`).
- `apps/web/src/copy/admin.ts`: Navigation („Übersicht“ heißt jetzt „Heute“).
- `apps/web/tests/e2e/admin.spec.ts`: Überschrift „Heute“ und neuer Weg zu den Hinweisen.
- `apps/web/tests/e2e/helpers/`: neue Dateien `admin.ts`, `admin-fixtures.ts`.
- `apps/web/src/app/admin/(bereich)/konten/[id]/page.tsx`: Links „Kontingent korrigieren“ und „Sanktion verhängen“.

## Offene Punkte

1. **Transkript-Zugriff** ruft `api.admin_safety_transcript(p_session_id, p_reason)` aus dem Bereich Härtung auf. In
   diesem Zweig gibt es die Funktion noch nicht; die Oberfläche zeigt dann „… Funktion api.admin_safety_transcript
   fehlt …“ statt eines Fehlers, der Test akzeptiert beide Fälle. Nach dem Zusammenführen einmal mit echtem Hinweis
   prüfen.
2. **`STABLE`-Fund** (siehe oben) bitte beim Zusammenführen mit der Härtung abgleichen, falls dort dieselben
   Funktionen neu angelegt werden (sonst wieder `STABLE`).
3. **Vorläufige Sperre von Hand** gibt es in der API nicht (`admin_impose_sanction` kennt Hinweis, Sperre,
   Ausschluss). Vorläufige Sperren entstehen automatisch bei Null-Toleranz-Meldungen und lassen sich aufheben oder
   durch Sperre/Ausschluss ersetzen. Wenn du sie auch von Hand willst: kleine Erweiterung der Funktion.
4. **Kennzahlen-Zeitreihen:** `ops.kpi_daily` (Momentaufnahme, KENNZAHLEN Abschnitt 1 Nr. 6) ist noch nicht gebaut;
   „Heute“ zeigt den aktuellen Stand. Die Auswahl der 8–10 Kennzahlen (KENNZAHLEN, Offene Punkte 1) ist ein Vorschlag.
5. **Warteliste-Zahlen** auf `/admin/warteliste` kommen unverändert aus `api.admin_waitlist_stats` (ohne k-Unterdrückung,
   weil du dort ohnehin einzelne Personen einlädst); die Kennzahlen auf „Heute“ sind k-anonym.
6. **Verweis auf `docs/PLATZHALTER.md`** zeigt auf GitHub (`bennneujahr/fermata`, Zweig `main`). Wenn der Zweig anders
   heißt oder das Repository privat bleibt, öffnet der Link nur mit Zugang.
7. **Kosten je Abend** (KENNZAHLEN 11) braucht den Preis der Ausweisprüfung als Einstellung (Didit) – noch nicht da.
8. **Bildschirmfotos von M2** in `docs/screenshots/web/20-*.png` zeigen noch die alte Übersicht; die aktuellen
   Admin-Bilder liegen in `docs/screenshots/web/ui-admin/`.
9. **Sammelfreigabe** läuft Vorschlag für Vorschlag (eine Datenbank-Transaktion je Vorschlag). Schlägt einer fehl
   (z. B. kein Platz mehr frei), stehen die Gründe in der Rückmeldung; die übrigen bleiben freigegeben.
