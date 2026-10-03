# Auswahl-Job (M4)

Stand: 03.10.2026 · Code: `services/matcher` · Datenbank: `supabase/migrations/20261003000410_matcher.sql` ·
Tests: `services/matcher/tests`, `supabase/tests/400_matcher.test.sql`

## Kurz für dich

- Der Job läuft in der Testphase alle 14 Tage. Er sucht für möglichst viele Menschen genau ein passendes Gegenüber
  und ein Lokal möglichst in der Mitte. **Nichts geht raus, bevor du es freigibst.**
- Er arbeitet mit einer eigenen, engen Datenbankrolle. Geschlecht, gesuchtes Geschlecht und Religion sieht er nie;
  er bekommt dafür nur ein Ja oder Nein von Prüffunktionen der Datenbank.
- Das Sprachmodell (Claude Sonnet 5.5 über Bedrock in der EU) bekommt nur die bestätigten Zusammenfassungen ohne
  Namen, ohne PLZ und ohne Art.-9-Inhalte. Bewertungen werden wiederverwendet, solange sich nichts geändert hat.
- Simulation mit 200 Profilen: 45 Vorschläge, 0,7 Sekunden. Lasttest mit 5.000 Profilen: 1.819 Vorschläge
  (87 % des Pools), 137 Sekunden ohne Sprachmodell-Wartezeit. Geschätzte Sprachmodell-Kosten: siehe Abschnitt 13.
- Offen für dich: Wartebonus, Gewichte, LLM-Anteil, Sperrfrist nach Ablehnung, Preise (Abschnitt 15).

---

## 1. Ablauf eines Laufs in einfachen Worten

1. **Pool:** Wer darf diesmal einen Vorschlag bekommen? (Abschnitt 2)
2. **Harte Filter:** Für jedes mögliche Paar: Passt es überhaupt? Entfernung, Alter, Deal-Breaker, Zeiten, Lokal,
   Geschlecht, Religion. (Abschnitt 3)
3. **Teil-Scores:** Für jedes übrige Paar fünf Zahlen zwischen 0 und 1 nach festen Regeln. (Abschnitt 4)
4. **Vorauswahl:** Je Person die zehn ähnlichsten Kandidaten (Embeddings). (Abschnitt 6)
5. **Sprachmodell:** Bewertet diese Paare nach einer festen Rubrik und schreibt einen Entwurf „Warum Sie beide“.
6. **Gesamtscore:** Regeln und Sprachmodell zusammen, dazu ein kleiner Bonus für Menschen, die lange gewartet haben.
7. **Zuordnung:** Eine Rechnung, die möglichst viele Paare bildet und dabei die Summe der Scores maximiert. Jede
   Person bekommt höchstens einen Vorschlag.
8. **Lokal:** Je Paar das Lokal mit freiem Tisch, das für beide möglichst gleich weit ist.
9. **Prüf-Agent:** Ein zweiter Durchgang schreibt dir Notizen (passt das, Risiken, Art.-9-Verdacht). Ein fester
   Wortfilter prüft den Text „Warum Sie beide“; bei einem Treffer wird er durch einen neutralen Text ersetzt.
10. **Speichern und Bericht:** Der Lauf steht auf „review“. Du siehst ihn im Admin und gibst frei oder lehnst ab.
    Erst mit der Freigabe entsteht der Abend mit drei Terminvorschlägen.

Status eines Laufs (`app.match_runs.status`): `scheduled` → `running` → `review` (oder `failed`) → nach deiner
Prüfung `approved` (nichts abgelehnt), `partially_approved` (teils abgelehnt) oder `cancelled` (alles abgelehnt).

## 2. Pool

Eine Person ist im Pool, wenn alles zutrifft (gezählt wird im Bericht jeweils der erste Grund, der nicht passt):

| Grund im Bericht | Bedingung |
|---|---|
| `nicht_aktiv`, `loeschung_beantragt` | Konto `active`, keine Löschung beantragt |
| `nicht_verifiziert` | `app.is_verified` (Ausweis geprüft, volljährig, Name und Geburtsdatum passen) |
| `einwilligung_gespraech`, `einwilligung_art9` | aktuelle Einwilligungen `gespraech` und `art9_profile` (`app.has_consent`) |
| `kein_profil`, `zusammenfassung_unbestaetigt`, `nicht_bereit` | Profil vorhanden, Zusammenfassung bestätigt (`summary_confirmed_at`), `ready_for_matching` |
| `kein_geburtsjahr` | Geburtsjahr bekannt (für Alter und Altersband) |
| `gesperrt` | keine aktive Sperre (`safety.is_suspended`) |
| `keine_plz` | PLZ-Mittelpunkt in `app.geo` |
| `keine_zeiten` | mindestens ein freies Fenster im Zeitraum des Laufs |
| `kein_abend_frei` | `billing.available_evenings > 0` |
| `offener_abend` | kein laufender Abend (vorgeschlagen, in Abstimmung oder bestätigt) |
| `offener_vorschlag` | kein Vorschlag aus einem anderen Lauf, der noch auf deine Prüfung wartet |

## 3. Harte Filter je Paar

Reihenfolge (für die Zählung im Bericht zählt der erste nicht erfüllte Filter):

1. **entfernung:** Luftlinie zwischen den PLZ-Mittelpunkten ≤ der kleineren Fahrbereitschaft beider.
   Fahrbereitschaft: Angabe in km; oder Minuten × Geschwindigkeit des schnellsten genannten Verkehrsmittels
   (Auto 50, ÖPNV 30, Rad 15, zu Fuß 4,5 km/h) ÷ 1,3 (Umwegfaktor Straße/Luftlinie); beides → das Kleinere;
   nichts → `matching.max_distance_km` (60 km).
2. **alter:** Das Alter jeder Person liegt im Wunschbereich der anderen. Ohne Angabe: eigenes Alter ± 
   `matching.default_age_window_years` (10). Nur eine Grenze angegeben: die andere ist offen (18 bzw. 99).
3. **sprache:** mindestens eine gemeinsame Sprache (Standard Deutsch).
4. **Deal-Breaker** (beide Richtungen; der Name beschreibt die Eigenschaft des Gegenübers, die ausschließt):

   | `app.dealbreakers.kind` | schließt aus | `value` |
   |---|---|---|
   | `raucht` | Gegenüber raucht `ja` oder `gelegentlich` | `{"gelegentlich_ok": true}` lässt „gelegentlich“ zu |
   | `hat_kinder` | Gegenüber hat Kinder | – |
   | `will_kinder` | Gegenüber will Kinder (`wants_children = 'ja'`) | – |
   | `will_keine_kinder` | Gegenüber will keine Kinder (`'nein'`) | – |
   | `alter` | Gegenüber außerhalb `min`/`max` | `{"min": 30, "max": 45}` |
   | `entfernung` | Entfernung über `max_km` | `{"max_km": 20}` |
   | `sonstiges` | kein harter Filter; nur das Sprachmodell berücksichtigt den Text | – |

   Unbekannte Angaben (z. B. Rauchen nicht angegeben) schließen nicht aus.
5. **schon_vorgeschlagen** (`app.already_paired`), **blockiert** (`app.is_blocked`), **kuerzlich_abgelehnt**
   (von dir abgelehnt innerhalb von `matching.rejected_pair_cooldown_days`, 90 Tage).
6. **keine_gemeinsame_zeit:** ein gemeinsames Fenster ≥ `evening.default_duration_minutes` (120), genau wie
   `app.shared_windows`.
7. **kein_lokal:** ein aktives Lokal in Reichweite beider mit einem freien Platz, dessen Abend ganz in ein
   gemeinsames Fenster passt, frühestens `matching.slot_lead_hours` (72 h) nach dem Start.
8. **geschlecht** und **religion:** nur über die Prüffunktionen der Datenbank (Ja/Nein, Abschnitt 11).

Die Schritte 1–5 laufen vektorisiert (numpy) je Person über alle anderen; 6–7 nur für die Übrigen; 8 in einer
einzigen Datenbankabfrage.

## 4. Teil-Scores (je 0 bis 1)

Fehlen einer Person die Angaben, ist der Teil-Score neutral 0,5 und im Bericht als „fehlt“ markiert.

| Teil-Score | Formel |
|---|---|
| **werte** | gemeinsame Schlüssel von `values_profile.werte`: 1 − Σ wₖ·\|aₖ − bₖ\| / Σ wₖ mit wₖ = max(aₖ, bₖ) + 0,05. Unterschiede bei Werten, die einer Person wichtig sind, zählen mehr. |
| **wuensche** | Mittel aus (a) „Wunsch an das Gegenüber“ (`values_profile.gegenueber`) gegen die tatsächlichen Werte der anderen Person (Persönlichkeit, Werte, Lebensstil): 1 − mittlere Abweichung, beide Richtungen gemittelt, und (b) Kinderwunsch-Tabelle (ja/ja 1, nein/nein 1, ja/nein 0, ja/offen 0,7, ja/vielleicht 0,6, nein/offen 0,7, nein/vielleicht 0,5, offen/offen 0,9, vielleicht/vielleicht 0,8, offen/vielleicht 0,8). Freitext-Wünsche bewertet nur das Sprachmodell. |
| **lebensumstaende** | Mittel der vorhandenen Teile: Lebensstil (1 − mittlere Abweichung), Interessen (Überlappung \|A∩B\| / min(\|A\|,\|B\|)), Rauchen (gleich 1, nein/gelegentlich 0,6, gelegentlich/ja 0,7, nein/ja 0,3), Kinder vorhanden (gleich 1, sonst 0,7), Arbeitszeiten (gleich 1, flexibel 0,9, Schicht/Tag 0,6, sonst 0,8), Altersabstand (≤ 3 Jahre 1, dann linear bis 0,3 bei 15 Jahren), Entfernung (1 − 0,7 · Entfernung / kleinere Fahrbereitschaft). |
| **persoenlichkeit** | gemeinsame Merkmale (offenheit, gewissenhaftigkeit, extraversion, vertraeglichkeit, emotionale_stabilitaet, humor): 1 − mittlere Abweichung. |
| **zeiten** | Anzahl verschiedener Tage mit gemeinsamem Fenster / 3, höchstens 1. |

Werte auf einer Skala 1–5 oder 0–100 werden automatisch auf 0–1 umgerechnet.

## 5. Gewichte, Gesamtscore, Wartebonus, Mindestscore

- **Gewichte je Person:** w = (1 − β) · global + β · persönlich, danach auf Summe 1. Global: `matching.weights`
  (werte 0,30 · wuensche 0,25 · lebensumstaende 0,15 · persoenlichkeit 0,20 · zeiten 0,10). Persönlich:
  `app.personal_weights` (falls vorhanden). β = `matching.personal_weight_share` (0,5). Für ein Paar zählt das
  Mittel beider Personen.
- **Regel-Score** R = Σ Gewicht × Teil-Score.
- **Qualität** Q = (1 − λ) · R + λ · L mit L = LLM-Score, λ = `matching.llm_weight` (0,5). Ohne LLM-Bewertung
  (abgeschaltet, Ablehnung, Fehler): Q = R, und das Paar trägt einen Hinweis für dich.
- **Wartebonus** B = min(`wait_bonus_max`, `wait_bonus_per_round` × (Runden A + Runden B) / 2). „Runden“ = abgeschlossene
  Läufe, in denen die Person im Pool war, seit ihrem letzten Vorschlag (abgelehnte zählen nicht als Vorschlag).
- **Gesamtscore** T = Q + B. Das ist das Gewicht in der Zuordnung und `total_score` im Vorschlag.
- **Mindestscore:** Ein Paar kommt nur in Frage, wenn **Q ≥ `matching.min_score` (0,60)**. Der Bonus hilft also nicht
  über die Schwelle, er verschiebt nur die Reihenfolge (Entscheidung: Qualität vor Wartezeit; siehe Abschnitt 15).

## 6. Vorauswahl mit Embeddings

- Für jede Person ein Embedding der bereinigten Zusammenfassung (Titan Text Embeddings V2, 1024 Dimensionen,
  Frankfurt). Neu gerechnet nur, wenn sich der Text geändert hat (`source_hash`).
- Je Person werden die gefilterten Kandidaten nach Kosinus-Ähnlichkeit (pgvector, in der Datenbank gerechnet)
  sortiert; ohne Embedding nach dem Regel-Score („sonst nur Regeln“, PLAN 2.5). Abschalten:
  `matching.embeddings_enabled = false`.
- Ein Paar kommt weiter, wenn es bei mindestens einer der beiden Personen unter den besten
  `matching.candidates_per_person` (10) ist (`matching.topn_mode = "union"`; `"mutual"` verlangt beide). So
  entstehen höchstens 10 × N Bewertungen (PLAN 5.10).

## 7. Sprachmodell-Rubrik

- **Modell:** `analysis.llm_model_id` = `eu.anthropic.claude-sonnet-5-5` (Bedrock, EU-Geo-Profil), Backend
  `bedrock`; alternativ `bedrock-mantle` (Mantle-Endpunkt in eu-central-1, Modell `anthropic.claude-sonnet-5-5`).
- **Anfrage:** feste deutsche Rubrik als System-Text mit Prompt-Caching, Denken adaptiv mit
  `output_config.effort = matching.llm_effort` („low“), strukturierte Ausgabe per JSON-Schema
  (`score`, `begruendung`, `bedenken`, `warum_sie_beide`), kein `temperature` (Sonnet 5.5 lehnt das ab), kein
  erzwungener Werkzeugaufruf. Eine Ablehnung (`stop_reason = refusal`) oder ein Fehler führt zu „nur Regeln“ für
  dieses Paar, nicht zum Abbruch des Laufs.
- **Eingaben je Person** (nur diese): Alter, bereinigte Zusammenfassung, Persönlichkeit, Werte, Wünsche ans
  Gegenüber, Lebensumstände, Rauchen, Kinder, Kinderwunsch, Sprachen, Freitext-Wünsche, „sonstige“ Deal-Breaker;
  dazu die auf 5 km gerundete Entfernung und die Anrede. **Nie:** Namen (werden durch „die Person“ ersetzt), PLZ,
  Koordinaten, IDs, Geschlecht, Orientierung, Religion, Gesundheit. Sätze mit Art.-9-Begriffen werden entfernt,
  Geschlechtshinweise (er/ihm/ihn, Frau/Mann, Ehefrau/Ehemann …) neutralisiert. Die Zusammenfassung soll laut
  Vertrag mit M3 in direkter Anrede (Sie/du) geschrieben sein.
- **Text „Warum Sie beide“:** zwei bis drei Sätze, nur gemeinsame, allgemeine Dinge; Anrede: beide „Sie“ →
  „Sie beide …“, beide „du“ → „Ihr beide …“, gemischt → ohne direkte Anrede („Beide …“).
- **Wiederverwendung (PLAN 5.10):** `input_hash` = SHA-256 aus Rubrik-Version, Modell und beiden Eingaben. Gibt es
  denselben Hash schon in `app.pair_candidates` mit Score, wird die Bewertung übernommen (im Bericht:
  `wiederverwendet`). Neue Rubrik-Version oder neues Modell → neu bewerten.
- **Batch-Verarbeitung:** Die Message-Batches-Schnittstelle von Anthropic gibt es auf Bedrock nicht. Bedrock hat
  eine eigene Batch-Inferenz (Aufträge über S3, laut AWS etwa halber Preis, Ergebnis innerhalb von 24 h). Nicht
  eingebaut; lohnt sich erst ab vielen tausend Bewertungen je Lauf (Abschnitt 15).

## 8. Zuordnung

- Graph: Personen als Knoten, Paare mit Q ≥ Mindestscore aus der Vorauswahl als Kanten, Gewicht T.
- `networkx.max_weight_matching` mit `maxcardinality = matching.max_cardinality` (true): zuerst möglichst viele
  Paare, dann die höchste Summe. Jeder zusammenhängende Teilgraph wird einzeln gerechnet und gemessen.
- Teilgraphen über `matching.assignment_inline_max_nodes` (600) laufen in einem eigenen Prozess mit Zeitlimit
  `matching.assignment_timeout_seconds` (600 s). Wird es überschritten, übernimmt der Ersatz (PLAN 5.9):
  „mwmatching“, falls installiert, sonst eine gierige Zuordnung (höchstes Gewicht zuerst, mindestens halb so gut),
  und der Bericht sagt das.
- **mwmatching** (J. van Rantwijk, MIT) ist **nicht auf PyPI** (geprüft am 03.10.2026: `mwmatching`,
  `max-weight-matching`, `pymwmatching` u. a.; das GitHub-Projekt war von hier nicht erreichbar). Der Adapter
  (`assignment._mwmatching`) erwartet `maximum_weight_matching(edges)` mit Kanten (i, j, w); wer die Bibliothek
  braucht, legt `mwmatching.py` in das Image. Beim Lasttest war das nicht nötig (Abschnitt 12).
- Hat ein zugeordnetes Paar kein Lokal mehr (alle Tische vergeben), wird es verworfen und die Zuordnung für die
  übrigen Personen bis zu dreimal wiederholt (`kein_lokal` im Bericht).

## 9. Lokal-Wahl

Unter den Lokalen mit freiem Platz in einem gemeinsamen Fenster und in Reichweite beider gewinnt das Lokal mit der
kleinsten **längeren** Anfahrt. Bedingung: längere ÷ kürzere Anfahrt ≤ `matching.venue_max_detour_ratio` (1,3),
sobald die längere Anfahrt über `matching.venue_ratio_min_km` (5 km) liegt. Erfüllt kein Lokal die Bedingung, nimmt
der Job trotzdem das Lokal mit der kleinsten längeren Anfahrt und markiert das für dich (Text im Vorschlag und
Hinweis des Prüf-Agenten). Gleichstand (auf 0,1 km) → früherer Platz. Der Lauf zählt die Tische mit, damit ein
Platz nicht öfter verplant wird, als Tische frei sind. `venue_reason` erklärt die Wahl (Anfahrten, Verhältnis,
frühester Platz).

## 10. Prüf-Agent und Art.-9-Filter (PLAN 5.7)

1. Ausrufezeichen werden zu Punkten.
2. **Fester Filter** (`art9.check_reasons`, ohne LLM) auf „Warum Sie beide“: Religion/Weltanschauung, Gesundheit,
   Sexualität/Orientierung/Geschlechtsidentität, Herkunft, politische Meinung, Gewerkschaft, Genetik/Biometrie,
   Geschlechtshinweise (er/ihn/ihm, Frau/Mann …), Namen, fünfstellige Zahlen (PLZ), Tonalität (kein „Match“, keine
   Versprechen, keine Emojis), Länge über 600 Zeichen. Die Muster sind absichtlich weit („auf Nummer sicher“).
3. **Prüf-Agent** (gleiches Modell, eigener fester Prompt): `plausibel`, `einschaetzung`, `risiken`,
   `art9_verdacht`, `art9_hinweis`, `empfehlung` (`freigeben` | `genauer_pruefen` | `ablehnen`).
4. Schlägt der Filter an **oder** meldet der Agent einen Verdacht, wird der Text durch einen neutralen Ersatztext
   (je Anrede) ersetzt. Alles steht in `pairings.review_notes`:
   `{"version", "agent": {…}, "agent_fehler", "art9_filter": {"ok", "treffer": [Kategorien]}, "ersatztext_verwendet", "hinweise": [...], "empfehlung"}`.
   Die Treffer nennen nur Kategorien, nie die gefundenen Wörter.

## 11. Datenschutz und Rechte

- Der Job verbindet sich mit einer Login-Rolle und wechselt sofort per `SET ROLE` in **`fermata_matcher`**. Die Rolle
  liest nur, was die Auswahl braucht (Konto-Status, Profil ohne Art.-9-Daten, Wünsche, Deal-Breaker, Gewichte,
  Embeddings, PLZ-Mittelpunkt, Zeiten, Lokale, Plätze, Prüfstatus, Einwilligungen, Blockierungen, frühere Vorschläge)
  und schreibt nur Läufe, Kandidaten, Vorschläge, Lauf-Teilnahmen und Embeddings. Kein Zugriff auf `private`,
  `sensitive`-Tabellen, `safety`-Tabellen, `billing`-Tabellen, `app.evenings`, Transkripte, Rückmeldungen.
  Die Tests beweisen das (`test_db_checks.py`, `400_matcher.test.sql`).
- Ergänzt in dieser Migration (nur, was fehlte): `usage` auf Schema `extensions` (Typ `vector` und Operator `<=>`),
  `insert/update` auf `app.profile_embeddings`, die neue Tabelle `app.match_run_members`, die Ja/Nein-Funktion
  `app.has_open_evening(uuid)`, die Stapel-Prüffunktionen und die Fairness-Funktion.
- **Stapel-Prüffunktionen** `sensitive.gender_compatible_pairs(uuid[], uuid[])` und
  `sensitive.religion_compatible_pairs(uuid[], uuid[])`: dieselbe Ja/Nein-Antwort wie die Einzelfunktionen, aber jede
  Person wird nur einmal entschlüsselt. Grund: Die Einzelfunktion kostet ca. 1,5 ms (pgcrypto); bei 5.000 Profilen
  wären das geschätzt ca. 6 Minuten statt 6 Sekunden (gemessen bei 1.000 Profilen: 14,9 s statt 0,7 s). Ein Test
  vergleicht beide Wege für alle 210 Paare aus den 21 Kombinationen von Geschlecht und Suche. Mit `--art9-check single` nutzt der Job nur die ursprünglichen Einzelfunktionen.
- **Fairness-Bericht** `sensitive.match_run_fairness(run_id)`: nur Zählungen (im Pool, vorgeschlagen, Anteil), einmal
  nach Geschlecht, einmal nach Altersband, nie gekreuzt. Gruppen unter k = `matching.fairness_min_group_size`
  (mindestens 5) werden unterdrückt, dazu so viele weitere kleine Gruppen, bis sich die unterdrückte Summe nicht aus
  der Gesamtzahl zurückrechnen lässt. Vorgeschlagene je Gruppe nur, wenn vorgeschlagen und nicht vorgeschlagen je ≥ k.
- **Aufbewahrung:** `ops.purge_match_scores()` löscht täglich (pg_cron 03:23) Kandidaten mit Teil-Scores und
  Lauf-Teilnahmen älter als `matching.score_retention_months` (12). Lauf-Berichte und Vorschläge bleiben. Seit der
  Härtung (`20261003000905_retention.sql`) leert `ops.apply_retention()` (Job `fermata-retention`, 03:41 UTC) nach
  derselben Frist auch `app.pairings.total_score`, `review_notes` und `review_comment` (die Spalte `total_score` darf
  dafür `null` sein); Paar, Abend-Bezug und Status bleiben.

**Login-Rolle im Betrieb einrichten** (einmal, als Datenbank-Admin; Passwort aus dem Passwort-Tresor):

```sql
create role fermata_matcher_job login noinherit password '…';
grant fermata_matcher to fermata_matcher_job;
alter role fermata_matcher_job set statement_timeout = '15min';
-- Der Job führt nach dem Verbinden selbst "set role fermata_matcher" aus (FERMATA_MATCHER_DB_ROLE).
-- noinherit: ohne SET ROLE hat die Login-Rolle gar keine Rechte.
```

Bei Supabase über den Pooler: Benutzername `fermata_matcher_job.<projekt-ref>`, Session-Modus (Port 5432), weil
`SET ROLE` für die ganze Verbindung gilt.

## 12. Simulation und Lasttest

Befehle (nur in den Umgebungen test, local, ci; in Produktion verweigert):

```bash
cd services/matcher
uv run fermata-matcher simulate --profiles 200                 # voller Lauf mit Attrappen
uv run fermata-matcher simulate --profiles 200 --approve-all   # zusätzlich als Admin freigeben (legt Abende an)
uv run fermata-matcher simulate --profiles 200 --rounds 2      # zwei Zeiträume (Wartebonus, offene Abende)
FERMATA_LOADTEST=1 uv run pytest -k load_5000 -s               # Lasttest 5.000 (in CI optional)
```

Die Profile sind synthetisch: Vornamen, PLZ rund um Schwerin, Wismar, Ludwigslust, Parchim, Hamburg, Lübeck und
Rostock, Frauen, Männer und nichtbinäre Menschen mit unterschiedlichen Wünschen (auch gleichgeschlechtlich und
mehrere Geschlechter), Alter 25–65, Fahrbereitschaft, Deal-Breaker, 2–6 freie Abende in 14 Tagen, 15 Lokale. Etwa
16 % fallen absichtlich aus dem Pool (nicht verifiziert, keine Einwilligung, keine Zeiten …). Die Attrappe des
Sprachmodells mischt in 3 % der Texte einen Religionsbezug, damit der Filter etwas zu tun hat.

Ergebnisse (4 CPU-Kerne Xeon 2,1 GHz, 16 GB, Datenbank im Docker-Container, Attrappen für LLM und Embeddings):

| | 200 Profile | 1.000 Profile | 5.000 Profile |
|---|---|---|---|
| im Pool | 173 | 827 | 4.188 |
| Paare geprüft / bestanden | 14.878 / 136 | 341.551 / 2.857 | 8.767.578 / 69.095 |
| Paare nach Vorauswahl (= LLM-Bewertungen) | 136 | 2.620 | 23.062 |
| Vorschläge (Personen mit Vorschlag) | 45 (52 %) | 331 (80 %) | 1.819 (87 %) |
| Ohne Vorschlag: keine Kandidaten / unter Mindestscore / nicht zugeordnet / kein Lokal | 66 / 3 / 14 / 0 | 135 / 3 / 27 / 0 | 415 / 13 / 14 / 108 |
| Größter Teilgraph (Knoten) | 91 | 687 | 3.756 (21.306 Kanten) |
| Laufzeit gesamt | 0,7 s | 6,6 s | 136,8 s |
| davon Filter + Art.-9-Prüfung | 0,2 s | 1,1 s | 12,9 s |
| davon Regel-Scores + Vorauswahl | 0,02 s | 0,3 s | 8,1 s |
| davon Zuordnung + Lokal | 0,02 s | 2,2 s | 94,8 s |
| davon Kandidaten speichern | 0,03 s | 0,6 s | 4,6 s |
| Art.-9-Prüfung mit Einzelfunktionen statt Stapel | – | 14,9 s statt 0,7 s | geschätzt ca. 6 min |

Beobachtungen:

- Bei 200 Profilen auf sieben Regionen verteilt ist der Pool dünn: 66 Personen haben gar keinen Kandidaten
  (meist Entfernung, Alter, Orientierung). Mit mehr Menschen pro Region steigt der Anteil mit Vorschlag deutlich.
- networkx braucht bei 5.000 Profilen 95 s für den größten Teilgraphen. Das liegt weit unter dem Zeitlimit von
  600 s; die Ersatz-Bibliothek war nicht nötig. Die Zuordnung wächst etwa mit n³ – bei 10.000 Profilen im selben
  Gebiet wäre mwmatching sinnvoll (Abschnitt 15).
- 34 % der Vorschläge (5.000er-Lauf) überschreiten das Anfahrtsverhältnis 1,3, weil die 15 Lokale in den Zentren
  liegen und viele Menschen im Umland wohnen. Mehr Partner-Lokale im Umland würden das senken.
- Fairness im 5.000er-Lauf: Frauen 88 %, Männer 88 %, nichtbinäre Menschen 73 % mit Vorschlag; Altersbänder 85–88 %.
  Der Unterschied bei nichtbinären Menschen kommt aus den kleineren passenden Gruppen; der Bericht macht so etwas
  sichtbar.
- Mit echtem Sprachmodell kommt die Wartezeit der Anfragen dazu: bei ca. 3 s je Anfrage und 8 gleichzeitigen
  Anfragen (`matching.llm_concurrency`) etwa 2,4 h für 23.000 Bewertungen im ersten Lauf; danach meist
  Wiederverwendung. Mehr Gleichzeitigkeit hängt von den Bedrock-Kontingenten ab.

## 13. Kosten je Lauf (Sprachmodell)

Annahmen (Einstellungen `matching.llm_price_usd_per_mtok`, `matching.usd_eur_rate`, alle PLATZHALTER):
Sonnet 5.5 Listenpreis 2 $ / 10 $ je 1 Mio. Token Ein-/Ausgabe, Cache lesen 0,20 $, Cache schreiben 2,50 $, plus
10 % EU-Aufschlag (PLAN 5.1) → 2,20 / 11,00 / 0,22 / 2,75 $; 1 $ = 0,92 €. Titan V2: 0,02 $ je 1 Mio. Token.
Je Bewertung ca. 1.500 Token Rubrik aus dem Cache, 850 Token Eingabe, 500 Token Ausgabe (inkl. kurzem Denken bei
„low“) → ca. 0,0077 $. Je Prüfung ca. 670 Token Cache, 1.600 Eingabe, 400 Ausgabe → ca. 0,0081 $.

| Lauf | Bewertungen | Prüfungen | geschätzt |
|---|---|---|---|
| 200 Profile wie simuliert | 136 | 45 | ca. 1,30 € |
| 200 Profile, dichter Pool (Obergrenze 10 × N) | bis 2.000 | ca. 100 | bis ca. 15 € |
| 5.000 Profile wie simuliert, erster Lauf | 23.062 | 1.819 | ca. 177 € |
| 5.000 Profile, Obergrenze | bis 50.000 | ca. 2.500 | bis ca. 370 € |
| Folgeläufe | nur geänderte Zusammenfassungen und neue Paare | | meist ein Bruchteil |

Embeddings kosten dagegen fast nichts (5.000 Zusammenfassungen ≈ 0,2 Mio. Token ≈ 0,004 $). Die Attrappe schätzt
ihre Token grob aus der Textlänge (1.000er-Lauf: 12,69 €, 5.000er-Lauf: 107 €); der Bericht jedes echten Laufs
rechnet mit den echten Token-Zahlen aus der Antwort (`usage`) und schreibt das Ergebnis in
`app.match_runs.cost_eur`.

## 14. Schnittstelle für die Admin-Prüfung (für die Web-App)

Alle Funktionen: `security definer`, verlangen `app.is_admin()` (Admin **mit Zwei-Faktor**, `aal2`), sonst Fehler
`42501`. Aufruf über PostgREST-RPC (`/rest/v1/rpc/<name>`, Schema `api`). Entscheidungen stehen in `ops.audit_log`
(`matching.pairing_approved`, `matching.pairing_rejected`, `matching.run_finished`; Ansicht der Vorschläge als
`matching.run_pairings_viewed`). Zustandsfehler haben den Code `55000` und eine deutsche Meldung für die Oberfläche.

| Funktion | Rückgabe |
|---|---|
| `api.admin_match_runs()` | Zeilen: `id, period_id, period_starts_on, period_ends_on, status, scheduled_for, started_at, finished_at, pool_size, candidate_pairs, proposed_pairs, pending_review, approved, rejected, cost_eur, error, report` (neueste zuerst) |
| `api.admin_run_pairings(p_run_id uuid)` | Zeilen je Vorschlag: `pairing_id, status, total_score, rule_score, llm_score, wait_bonus, subscores, llm_rationale, reasons_text, reasons_art9_clean, review_notes, venue_id, venue_name, venue_city, venue_reason, a_display_name, a_age_band, b_display_name, b_age_band, evening_id, reviewed_at, review_comment, created_at` (höchster Score zuerst). Personen nur mit Anzeigename und Altersband. |
| `api.admin_approve_pairing(p_pairing_id uuid, p_comment text default null)` | `{"pairing_id", "status": "proposed", "evening_id", "proposed_times": [...]}`. Prüft vorher erneut: Blockierung, Sperre, Konto aktiv, kein laufender Abend, Abend frei, Einwilligungen; dann Status `approved`, Abend anlegen (`state = proposed`, Lokal, bis zu `matching.proposed_times_count` Termine), Status `proposed`. |
| `api.admin_reject_pairing(p_pairing_id uuid, p_comment text default null)` | `{"pairing_id", "status": "rejected"}`. Kein Abend. Das Paar wird `matching.rejected_pair_cooldown_days` nicht erneut vorgeschlagen. |
| `api.admin_finish_run(p_run_id uuid, p_reject_pending boolean default false)` | `{"run_id", "status", "approved", "rejected", "rejected_on_finish"}`. Mit offenen Vorschlägen nur, wenn `p_reject_pending = true` (lehnt sie ab). Status `approved` / `partially_approved` / `cancelled`. |

Freigabe und Ablehnung gehen nur, solange der Lauf auf `review` steht. Mitglieder sehen von `app.pairings` nur
`id, user_a, user_b, venue_id, reasons_text, status, created_at` und nur ab Status `proposed`; Scores,
Prüfnotizen, Kandidaten und Läufe nie (Tests in beiden Suiten).

**Vertrag mit M5 (Abende):** Die Freigabe legt die Zeile in `app.evenings` an (`state = 'proposed'`,
`venue_id`, `slot_id = null`). `proposed_times` ist eine Liste
`[{"starts_at": "2026-11-12T18:00:00+00:00", "slot_id": "…"}, …]`: Beginnzeiten aus den gemeinsamen Fenstern
(`app.shared_windows`) mit freiem Platz im Lokal, frühestens `matching.proposal_lead_hours` (48 h) nach der Freigabe,
zuerst verschiedene Tage, dann die früheste Zeit (`app.pairing_candidate_times`). Fristen und Nachrichten setzt der
AFTER-INSERT-Trigger von M5.

**Bericht** (`app.match_runs.report`, für die Lauf-Ansicht): `pool` (Konten, im Pool, ausgeschlossen je Grund),
`filter` (geprüft, bestanden, verworfen je Grund), `eingaben_bereinigt`, `embeddings`, `vorauswahl`, `scores`
(Verteilungen mit Histogramm für Regel, LLM, Qualität, Gesamt, Vorgeschlagene), `mindestscore`, `zuordnung`
(Teilgraphen, Verfahren, Sekunden), `ergebnis` (Vorschläge, Anteil, ohne Vorschlag je Grund, Wartebonus), `lokale`,
`pruefung`, `llm` (Aufrufe, Wiederverwendung, Fehler, Token, Kosten, Preisannahmen), `fairness`,
`laufzeit_sekunden` je Stufe; nach deinem Abschluss zusätzlich `freigabe`.

## 15. Einstellungen

Verwendet (alle in `ops.app_settings`, Änderungen mit Verlauf). **Neu in M4** fett.

| Schlüssel | Start | Bedeutung |
|---|---|---|
| `matching.rhythm_days` | 14 | Abstand der Läufe (für den Zeitplan) |
| `matching.min_score` | 0,60 | Mindestqualität Q |
| `matching.candidates_per_person` | 10 | Top-N der Vorauswahl |
| `matching.wait_bonus_per_round` / `_max` | 0,02 / 0,10 | PLATZHALTER Wartebonus |
| `matching.max_distance_km` | 60 | PLATZHALTER Fahrbereitschaft ohne Angabe |
| `matching.weights` | 0,30/0,25/0,15/0,20/0,10 | PLATZHALTER Gewichte |
| `matching.llm_weight` | 0,5 | PLATZHALTER Anteil LLM |
| `matching.score_retention_months` | 12 | Aufbewahrung Teil-Scores |
| `matching.venue_max_detour_ratio` | 1,3 | Anfahrtsverhältnis |
| `evening.default_duration_minutes` | 120 | Dauer eines Abends |
| `analysis.llm_model_id` | eu.anthropic.claude-sonnet-5-5 | Modell |
| **`matching.personal_weight_share`** | 0,5 | PLATZHALTER Anteil persönlicher Gewichte |
| **`matching.default_age_window_years`** | 10 | PLATZHALTER Altersbereich ohne Angabe |
| **`matching.topn_mode`** | "union" | Vorauswahl einseitig oder beidseitig |
| **`matching.max_cardinality`** | true | möglichst viele Paare zuerst |
| **`matching.embeddings_enabled`** | true | Embeddings für die Vorauswahl |
| **`matching.embedding_model_id`** | amazon.titan-embed-text-v2:0 | Embedding-Modell |
| **`matching.llm_enabled`** | true | LLM-Rubrik an/aus |
| **`matching.llm_effort`** | "low" | Denkaufwand |
| **`matching.llm_concurrency`** | 8 | gleichzeitige Anfragen |
| **`matching.rejected_pair_cooldown_days`** | 90 | PLATZHALTER Sperrfrist nach deiner Ablehnung |
| **`matching.venue_ratio_min_km`** | 5 | ab hier gilt das Anfahrtsverhältnis |
| **`matching.slot_lead_hours`** | 72 | Plätze im Lauf frühestens so spät |
| **`matching.proposal_lead_hours`** | 48 | Terminvorschläge frühestens so spät nach Freigabe |
| **`matching.proposed_times_count`** | 3 | Terminvorschläge je Abend |
| **`matching.assignment_timeout_seconds`** | 600 | Zeitlimit networkx je Teilgraph |
| **`matching.assignment_inline_max_nodes`** | 600 | kleinere Teilgraphen ohne eigenen Prozess |
| **`matching.fairness_min_group_size`** | 5 | k-Anonymität (mindestens 5) |
| **`matching.llm_price_usd_per_mtok`** | 2,2/11/0,22/2,75 | PLATZHALTER Preise inkl. EU-Aufschlag |
| **`matching.embedding_price_usd_per_mtok`** | 0,02 | PLATZHALTER |
| **`matching.usd_eur_rate`** | 0,92 | PLATZHALTER Kurs |

## 16. Betrieb

**Befehle**

```bash
fermata-matcher run --next                 # fälligen Lauf ausführen (für den Zeitplan)
fermata-matcher run --period <zeitraum-id> # Lauf für einen bestimmten Zeitraum
fermata-matcher run --run-id <lauf-id>     # angelegten Lauf (scheduled) ausführen
fermata-matcher report <lauf-id> [--json]  # Bericht anzeigen
fermata-matcher simulate --profiles 200    # nur Test-Datenbank
```

**Umgebungsvariablen:** `FERMATA_MATCHER_DB_URL` (Login-Rolle, aus AWS Secrets Manager), `FERMATA_MATCHER_DB_ROLE`
(Standard `fermata_matcher`), `FERMATA_LLM_BACKEND` (`bedrock` | `bedrock-mantle` | `fake` | `none`),
`FERMATA_EMBEDDING_BACKEND` (`titan` | `fake` | `none`), `FERMATA_AWS_REGION` (eu-central-1),
`FERMATA_LLM_MODEL_ID` (überschreibt das Modell), `FERMATA_ENV` (Härtung: `production` in Produktion setzen). AWS-Zugang
über die IAM-Rolle des Tasks (Rechte: `bedrock:InvokeModel` für Sonnet 5.5 im EU-Profil und für Titan V2; beim
Mantle-Endpunkt die dort nötigen Rechte).

**Produktionssperre (Härtung, DSFA M-3):** Der Standard für `FERMATA_LLM_BACKEND` und `FERMATA_EMBEDDING_BACKEND` bleibt
`fake` (Entwicklung). Gilt die Umgebung als Produktion – `FERMATA_ENV=production` **oder** `ops.environment()` meldet
`production` **oder** die Datenbank kann ihre Umgebung nicht nennen (auf Nummer sicher) –, bricht der Job mit
`fake` vor jeder Arbeit ab: die CLI mit Ausgang **3** und der Meldung „FERMATA_LLM_BACKEND=fake ist in Produktion
verboten …“, `Runner.run()` mit `ProductionGuardError`, bevor ein Lauf auf `running` geht. Geprüft wird auch, was
tatsächlich rechnet (eine `FakeLLM`-/`FakeEmbedder`-Instanz zählt als Attrappe, egal wie das Backend heißt). `none`
(nur Regeln bzw. ohne Embeddings) bleibt erlaubt. Dafür darf `fermata_matcher` `ops.environment()` ausführen
(`20261003000907_edge_role.sql`). Code: `config.py` (`production_problems`, `ensure_production_safe`), `db.py`
(`environment_or_none`), `runner.py`, `cli.py`.

**Image:** `services/matcher/Dockerfile` (python:3.12-slim, Benutzer `fermata` ohne Root, Standardbefehl
`run --next`). Im Bau-Container hier wurde es mit dem Proxy-Zertifikat gebaut und gegen die Test-Datenbank
ausgeführt.

**Zeitplan – zwei Wege:**

1. **Empfohlen:** pg_cron legt fällige Läufe an (`app.schedule_due_match_runs()`, stündlich: für jeden Zeitraum,
   dessen Antwortfrist abgelaufen ist, höchstens ein Lauf `scheduled`). AWS EventBridge Scheduler startet täglich
   (z. B. 06:15 Europe/Berlin) einen ECS-Fargate-Task in Frankfurt mit `run --next`. Gibt es nichts zu tun, endet
   der Task mit Code 2 („Kein fälliger Zeitraum“). So bestimmt der Zeitraum (14-tägig, `matching.rhythm_days`),
   wann ausgewählt wird, nicht der Kalender des Schedulers.
2. Nur EventBridge: Regel `rate(14 days)` mit `run --next`. Einfacher, aber der Takt muss zu den Zeiträumen passen.

Läuft ein Lauf schief, steht er auf `failed` mit Fehlertext im Bericht; ein neuer Aufruf legt einen neuen Lauf an.
Bereits bezahlte LLM-Bewertungen werden dabei über den `input_hash` wiederverwendet.

## 17. Datenvertrag mit M3 (Viola, Hintergrund-Agent)

Der Job erwartet in `app.profile_core` (alle Zahlen 0–1, andere Skalen werden umgerechnet):

```json
{
  "personality": {"offenheit": 0.7, "gewissenhaftigkeit": 0.6, "extraversion": 0.4, "vertraeglichkeit": 0.8,
                  "emotionale_stabilitaet": 0.7, "humor": 0.6},
  "values_profile": {"werte": {"familie": 0.9, "ehrlichkeit": 0.9, "natur": 0.6},
                     "gegenueber": {"extraversion": 0.6, "familie": 0.8}},
  "life_circumstances": {"lebensstil": {"aktiv": 0.7, "gesellig": 0.4, "naturnah": 0.8},
                         "interessen": ["Wandern", "Kochen"], "arbeitszeiten": "tagsueber"}
}
```

`arbeitszeiten`: `tagsueber` | `schicht` | `flexibel` | `wochenende`. Empfohlene Werte-Schlüssel: familie,
partnerschaft, freundschaft, freiheit, sicherheit, abenteuer, tradition, karriere, gemeinschaft, natur, kultur,
nachhaltigkeit, bildung, ehrlichkeit, verlaesslichkeit, bewegung. `summary_text` bitte in direkter Anrede (Sie/du)
und ohne Geschlechtshinweise; der Job neutralisiert zusätzlich. Deal-Breaker wie in Abschnitt 3.

## 18. Offene Entscheidungen und Platzhalter

1. **Wartebonus** (0,02 je Lauf, höchstens 0,10) und ob er über den Mindestscore helfen darf (jetzt: nein).
2. **Gewichte** der Teil-Scores, **Anteil persönlicher Gewichte** (0,5) und **LLM-Anteil** (0,5).
3. **Sperrfrist nach Ablehnung** (90 Tage) – oder für immer?
4. **Altersbereich ohne Angabe** (± 10 Jahre) und **Fahrbereitschaft ohne Angabe** (60 km).
5. **Stapel-Prüffunktionen** für Geschlecht und Religion bestätigen (gleiche Ja/Nein-Antwort; bei 1.000 Profilen
   22-mal, bei 5.000 geschätzt 60-mal schneller).
6. **Embeddings auf Deutsch:** Titan V2 konnte hier ohne AWS-Zugang nicht mit echten Texten geprüft werden. Vor
   dem Start: 20–30 echte (anonymisierte) Zusammenfassungen einbetten und prüfen, ob ähnliche Menschen nah liegen;
   sonst `matching.embeddings_enabled = false` (dann nur Regeln).
7. **Bedrock-Weg:** `bedrock` (EU-Geo-Profil, wie in PLAN 5.1; laut AWS-Modellkarte gehören London und Zürich dazu)
   oder `bedrock-mantle` (regional in Frankfurt, von Anthropic für neuen Code empfohlen). Vor dem Start prüfen, ob
   Sonnet 5.5 auf dem Mantle-Endpunkt in Frankfurt verfügbar ist.
8. **Ablehnung durch das Modell:** Bei `refusal` nimmt der Job für das Paar nur die Regeln und markiert es. Ein
   automatischer Wechsel auf ein anderes Modell ist bewusst nicht eingebaut (ein Modell, ein Datenweg).
9. **Preise und Kurs** vor dem Start mit der AWS-Preisliste prüfen; **Bedrock-Batch** (halber Preis) erst, wenn die
   Kosten je Lauf spürbar werden.
10. **mwmatching** ist nicht auf PyPI. Bei deutlich mehr als 5.000 Profilen im selben Gebiet die Datei ins Image legen.
11. **Mehr Partner-Lokale im Umland**: 34 % der simulierten Vorschläge überschreiten das Anfahrtsverhältnis.

## 19. Abweichungen vom PLAN

| PLAN | Umsetzung | Grund |
|---|---|---|
| 3.2 Nr. 5: Prüffunktionen `gender_compatible(a, b)`, `religion_compatible(a, b)` | zusätzlich Stapel-Varianten mit derselben Ja/Nein-Antwort; Einzelweg per `--art9-check single` | Laufzeit bei 5.000 Profilen |
| 2.5: Zuordnung mit networkx | Teilgraphen getrennt; Ersatz mwmatching nur als Adapter, dazu gierige Notlösung | mwmatching nicht auf PyPI |
| 5.10: Batch-Verarbeitung bei Bedrock prüfen | geprüft, nicht eingebaut; parallele Einzelanfragen | Message-Batches gibt es auf Bedrock nicht; Bedrock-Batch lohnt sich erst später |
| 2.2: Auswahl liest keine Art.-9-Daten | zusätzlich: Geschlechtshinweise in Texten an das LLM werden neutralisiert, Fairness-Bericht nur k-anonym | „auf Nummer sicher“ |
| Gemeinsame Fenster über `app.shared_windows` | Job rechnet im Speicher mit identischer Regel (Test vergleicht); Terminvorschläge nutzen die Datenbankfunktion | Hunderttausende Paare |
| — | Lauf-Teilnahmen (`app.match_run_members`) als neue Tabelle | Wartebonus, Gründe ohne Vorschlag, Fairness |

## 20. Tests

- `cd services/matcher && uv run pytest`: 216 Tests (176 ohne Datenbank, 40 gegen die Test-Datenbank), dazu der
  Lasttest mit `FERMATA_LOADTEST=1`. Abgedeckt: jeder Filter und Deal-Breaker in beide Richtungen, alle
  Kombinationen aus Geschlecht und Suche über die Datenbankfunktionen (Einzel und Stapel), Formeln der Teil-Scores,
  Top-N, Wartebonus mit Obergrenze, Zuordnung gegen Brute Force auf 50 Zufallsgraphen, Zeitlimit und Ersatz,
  Lokal-Wahl, Art.-9-Filter und Bereinigung, Anfrageform an Bedrock, input_hash und Wiederverwendung, Bericht,
  k-Anonymität, Rechte der Rolle, Aufbewahrung, Zeitplan, Simulation.
- `DB_PORT=54362 DB_CONTAINER=fermata-db-matcher bash scripts/db.sh test`: pgTAP inklusive
  `400_matcher.test.sql` (46 Prüfungen: Zwei-Faktor-Pflicht, Mitglieder sehen keine Scores, Freigabe legt den Abend
  an, Ablehnung nicht, Abschluss, Audit, Rechte von fermata_matcher).
- `uv run ruff check src tests` und `uv run ruff format --check src tests`.
- Härtung: `tests/test_production_guard.py` (Entscheidungstabelle der Sperre, Meldung nennt die Variable,
  `FERMATA_ENV` wird gelesen, Runner verweigert Attrappen bei `FERMATA_ENV=production` und bei Datenbank `production`
  – auch als Rolle `fermata_matcher` –, kein Lauf bleibt auf `running`, CLI endet mit 3 vor jeder Datenbankarbeit);
  pgTAP `905_retention` (Scores der Vorschläge), `907_edge_role` (`ops.environment()` für `fermata_matcher`).
