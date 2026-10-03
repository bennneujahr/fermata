# Kennzahlen für das Dashboard (M9)

Stand: 03.10.2026 · Entwurf. Definitionen, Abfrage-Skizzen gegen die echten Tabellen und Datenschutzregeln.
Die Skizzen sind **Lesevorlagen für die Technik**, kein fertiger Code; sie wurden am 03.10.2026 gegen eine
Test-Datenbank mit allen Migrationen des Hauptzweigs (Commit `2489e06`) auf Syntax und Spaltennamen geprüft. Gebaut werden sollen sie als Admin-Funktionen
`api.admin_kpi_*` (security definer, `app.is_admin()`, Audit wie bei den übrigen Admin-Funktionen).
Tabellen und Spalten: [DATA.md](DATA.md).

---

## 1. Datenschutzregeln für alle Kennzahlen

1. **Nur Summen**, nie Zeilen je Person. Keine IDs, Namen, Freitexte (Notizen, Schilderungen, Zusammenfassungen).
2. **k ≥ 5:** Jede Zelle mit weniger als 5 Personen (bzw. Ereignissen, wenn sie Personen entsprechen) wird als
   „< 5“ angezeigt. Wenn sich eine unterdrückte Zelle aus Summe und übrigen Zellen zurückrechnen lässt, wird eine
   weitere kleine Zelle unterdrückt (sekundäre Unterdrückung). Dafür gibt es schon `ops.k_anonymous_groups(jsonb, k)`
   (`20261003000410_matcher.sql`) – wiederverwenden; Einstellung `matching.fairness_min_group_size` (mindestens 5).
3. **Keine Art.-9-Merkmale je Person**, auch nicht in Summen gekreuzt mit anderen Merkmalen. Auswertungen nach
   Geschlecht gibt es **nur** im Fairness-Bericht des Auswahl-Laufs (`sensitive.match_run_fairness`, steht in
   `app.match_runs.report -> 'fairness'`): je Geschlecht **oder** je Altersband, nie gekreuzt, nie mit Region, Lokal
   oder Stufe kombiniert. Religion, Orientierung, Gesundheit: keine Kennzahl.
4. **Grobe Raster:** Region nur als `region_group` (Warteliste) bzw. Landkreis-Ebene; Zeit in Wochen, wenn Tageswerte
   klein sind; Altersbänder statt Alter.
5. **Sicherheitszahlen** (Meldungen, Check-in „Hilfe“) sind oft klein. Im Dashboard gilt k ≥ 5; Einzelfälle sieht
   Benn ohnehin im Sicherheitsbereich (mit Audit).
6. **Gelöschte Daten fehlen später** (Abmeldungen, unbestätigte Einträge nach 7 Tagen, gelöschte Konten). Für
   Zeitreihen deshalb eine **tägliche Momentaufnahme** nur mit Summen: Tabelle `ops.kpi_daily (day, key, value)` ohne
   Personenbezug, gefüllt von einem pg_cron-Job (Vorschlag `fermata-kpi-snapshot`, 02:30 Europe/Berlin). Sie darf
   dauerhaft bleiben.
7. Das Dashboard ist nur für Admins mit Zwei-Faktor; jeder Abruf steht im Audit-Protokoll (`kpi.viewed`).

Hilfsausdruck für die Skizzen (Unterdrückung einer einzelnen Zahl):

```sql
-- k = greatest(ops.setting_int('matching.fairness_min_group_size'), 5)
case when n < k then null else n end   -- null wird im Dashboard als „< 5“ angezeigt
```

---

## 2. Warteliste

| Kennzahl | Definition |
|---|---|
| Neue Einträge je Tag/Woche | `created_at` je Tag (Europe/Berlin), bestätigte nach `confirmed_at` |
| Bestätigungsquote | bestätigte / alle Einträge eines Tages, frühestens 7 Tage danach gemessen (später sind unbestätigte gelöscht → Momentaufnahme nötig) |
| Bestand je Region | bestätigte je `region_group` |
| Gründungsmitglieder | `is_founding_member` (höchstens `waitlist.founding_limit`) |
| Quellen | Einträge und Bestätigungen je `source` (Plakat-Kürzel) |
| Plakat-Aufrufe → Einträge | `link_hits.count` je Kürzel vs. Einträge mit diesem `source` |
| Einladungen | erzeugte / genutzte Codes (`waitlist_invites.used_at`) |
| Ins Konto eingeladen | `invited_to_app_at is not null` |
| Abmeldungen | nur über die Momentaufnahme (Bestand gestern − heute + neue Bestätigungen) |

Der größte Teil liefert schon `api.admin_waitlist_stats()` (`20261003000100_waitlist.sql`).

```sql
select w.region_group,
       (w.created_at at time zone 'Europe/Berlin')::date as tag,
       count(*)                                         as eintraege,
       count(*) filter (where w.confirmed_at is not null) as bestaetigt,
       count(*) filter (where w.is_founding_member)     as gruendung
from public.waitlist w
group by 1, 2 order by 2, 1;
-- Quellen
select coalesce(w.source, '(ohne)') as quelle, count(*) as eintraege,
       count(*) filter (where w.confirmed_at is not null) as bestaetigt,
       max(h.aufrufe) as aufrufe
from public.waitlist w
left join (select slug, sum(count) as aufrufe from public.link_hits group by slug) h on h.slug = w.source
group by w.source;
```

## 3. Onboarding-Trichter

Stufen (je Kohorte = Woche der Einladung):

1. eingeladen (`app.account_invitations.invited_at`)
2. Einladung angenommen (`accepted_at`)
3. Pflicht-Einwilligungen erteilt (`account.required_consents`: `agb`, `datenschutz_kenntnis`, `art9_profile`)
4. Formular ausgefüllt (`private.account_facts` vorhanden)
5. Angaben im geschützten Bereich gemacht (`sensitive.profile_identity` vorhanden – **nur Existenz zählen**)
6. Ausweis geprüft (`app.is_verified`)
7. erstes Gespräch abgeschlossen (`app.interview_sessions.status = 'completed'`, `kind = 'erstgespraech'`)
8. Zusammenfassung bestätigt (`app.profile_core.summary_confirmed_at`)
9. bereit für die Auswahl (`profile_core.ready_for_matching` und freie Zeiten im nächsten Zeitraum)
10. erster Vorschlag erhalten (`app.pairings.status` ab `proposed`)
11. erster Abend stattgefunden (`app.evenings.state = 'happened'`)

Zusätzlich: Ausweisprüfung abgelehnt / gesperrt / Versuche aufgebraucht (`app.verifications.status`), Dauer zwischen
den Stufen (Median).

```sql
with kohorte as (
  select i.user_id, date_trunc('week', i.invited_at) as woche, i.accepted_at
  from app.account_invitations i where i.revoked_at is null
)
select k.woche,
       count(*)                                                                as eingeladen,
       count(*) filter (where k.accepted_at is not null)                       as angenommen,
       count(*) filter (where (select bool_and(app.has_consent(k.user_id, x))
                               from unnest(app.required_consents()) x))         as einwilligungen,
       count(*) filter (where exists (select 1 from private.account_facts f where f.user_id = k.user_id)) as formular,
       count(*) filter (where exists (select 1 from sensitive.profile_identity p where p.user_id = k.user_id)) as geschuetzt,
       count(*) filter (where app.is_verified(k.user_id))                      as ausweis,
       count(*) filter (where exists (select 1 from app.interview_sessions s where s.user_id = k.user_id
                                        and s.kind = 'erstgespraech' and s.status = 'completed')) as gespraech,
       count(*) filter (where exists (select 1 from app.profile_core p where p.user_id = k.user_id
                                        and p.summary_confirmed_at is not null)) as bestaetigt
from kohorte k group by 1 order by 1;
-- im Dashboard jede Zahl < k unterdrücken
```

## 4. Gespräche mit Viola

| Kennzahl | Definition |
|---|---|
| Gespräche je Woche | `app.interview_sessions` mit `started_at`, nach `kind` und `mode` |
| Abschlussquote | `status = 'completed'` / Sitzungen mit `started_at` |
| Ende-Gründe | Verteilung `end_reason` (`fertig`, `person_beendet`, `zeitlimit`, `technik`, `krise`, `minderjaehrig`, `missbrauch`) – Sicherheitsgründe nur mit k ≥ 5 |
| Wechsel Stimme → Text | `mode_switched_at is not null` / Sprachgespräche |
| Zusammenfassung | Anteil `summary_status` = `confirmed` / `corrected` / `rejected` |
| Auswertung gescheitert | `analysis_status = 'failed'` |
| Dauer | Median `ended_at − started_at` |
| Antwortzeit | Median von `ops.session_costs.latency_ms_p50`, Anteil Sitzungen mit `latency_ms_p90 ≤ voice.latency_target_ms_p90` (2000) |

```sql
select date_trunc('week', s.started_at) as woche, s.kind, s.mode,
       count(*)                                              as gestartet,
       count(*) filter (where s.status = 'completed')        as abgeschlossen,
       count(*) filter (where s.mode_switched_at is not null) as zu_text,
       count(*) filter (where s.summary_status in ('confirmed', 'corrected')) as zusammenfassung_ok,
       percentile_cont(0.5) within group (order by extract(epoch from s.ended_at - s.started_at) / 60) as median_min
from app.interview_sessions s where s.started_at is not null
group by 1, 2, 3 order by 1;
```

## 5. Auswahl-Läufe

| Kennzahl | Definition |
|---|---|
| Poolgröße | `app.match_runs.pool_size` |
| Ausgeschlossen je Grund | `report -> 'pool'` (Gründe wie `nicht_verifiziert`, `keine_zeiten`, `kein_abend_frei` …) |
| Anteil mit Vorschlag | `2 × proposed_pairs / pool_size` |
| Ohne Vorschlag je Grund | `app.match_run_members.unmatched_reason` (12 Monate verfügbar) bzw. `report -> 'ergebnis'` |
| Wartezeit | Verteilung `match_run_members.wait_rounds` |
| Fairness | `report -> 'fairness'` (schon k-anonym; unverändert anzeigen, nichts nachrechnen) |
| Laufzeit, Kosten | `finished_at − started_at`, `cost_eur`, `report -> 'llm'` (Aufrufe, Wiederverwendung, Token) |

```sql
select r.id, r.status, r.started_at, r.pool_size, r.candidate_pairs, r.proposed_pairs,
       round(2.0 * r.proposed_pairs / nullif(r.pool_size, 0), 2) as anteil_mit_vorschlag,
       r.cost_eur, r.report -> 'pool' as pool_gruende, r.report -> 'fairness' as fairness
from app.match_runs r order by r.started_at desc;
```

## 6. Freigaben durch Benn

| Kennzahl | Definition |
|---|---|
| Freigabequote | `app.pairings` je Lauf: freigegeben (`status` in `proposed`, `declined`, `expired`, `completed`, `cancelled`) / entschieden (zusätzlich `rejected`) |
| Prüfdauer | Median `reviewed_at − created_at` (Ziel: am Tag des Laufs) |
| Ersatztext verwendet | Anteil `review_notes ->> 'ersatztext_verwendet' = 'true'` |
| Empfehlung des Prüf-Agenten vs. Entscheidung | Kreuztabelle `review_notes ->> 'empfehlung'` × freigegeben/abgelehnt (zeigt, ob Benn „durchwinkt“) |

```sql
select p.run_id,
       count(*) filter (where p.status <> 'pending_review')                 as entschieden,
       count(*) filter (where p.status not in ('pending_review', 'rejected')) as freigegeben,
       percentile_cont(0.5) within group (order by extract(epoch from p.reviewed_at - p.created_at) / 3600) as median_h,
       count(*) filter (where (p.review_notes ->> 'ersatztext_verwendet')::boolean) as ersatztext
from app.pairings p group by 1;
```

## 7. Abende

| Kennzahl | Definition |
|---|---|
| Vorschläge → Termin | Anteil `app.evenings`, die `confirmed` erreicht haben (`confirmed_at is not null`) |
| Ausgang | Verteilung `state`: `happened`, `declined`, `lapsed`, `cancelled_early`, `cancelled_late`, `no_show` |
| Zeit bis zur Einigung | Median `confirmed_at − created_at`; Runden aus `app.evening_events` (`counter`) |
| Fristversäumnisse | Anteil `lapsed`; Erinnerungen wirksam? (`evening.deadline_reminder` vor `lapse`) |
| Lokal bestätigt | Anteil `app.evening_reservations.venue_confirmed_at is not null`, Median der Dauer |
| Nichterscheinen | `no_show` je 100 bestätigte Abende |
| Abende je Lokal | `venue_id` – nur Zählungen ≥ k |

```sql
select date_trunc('week', e.created_at) as woche,
       count(*)                                           as vorschlaege,
       count(*) filter (where e.confirmed_at is not null) as termin,
       count(*) filter (where e.state = 'happened')       as stattgefunden,
       count(*) filter (where e.state = 'declined')       as abgelehnt,
       count(*) filter (where e.state = 'lapsed')         as verfallen,
       count(*) filter (where e.state = 'cancelled_early') as frueh_abgesagt,
       count(*) filter (where e.state = 'cancelled_late') as kurzfristig_abgesagt,
       count(*) filter (where e.state = 'no_show')        as nicht_erschienen
from app.evenings e group by 1 order by 1;
```

## 8. Rückmeldungen

| Kennzahl | Definition |
|---|---|
| Rücklaufquote | `app.feedback` je stattgefundenem Abend und Person |
| Passung | Mittelwert und Verteilung `match_quality` (1–5) |
| Lokal | Mittelwert `venue_rating` je Lokal (nur mit ≥ k Rückmeldungen) |
| Wieder treffen | Verteilung `would_meet_again` |
| Kontakttausch | Abende mit `app.contact_shares.released_at` (beidseitiges Ja) / stattgefundene Abende |
| Sicherheitsgefühl | Anteil `felt_safe = false` (k ≥ 5; Einzelfälle im Sicherheitsbereich) |

```sql
select count(*)                                   as rueckmeldungen,
       round(avg(f.match_quality), 2)             as passung,
       round(avg(f.venue_rating), 2)              as lokal,
       count(*) filter (where f.would_meet_again = 'ja') as wieder_ja,
       count(*) filter (where f.felt_safe is false)      as unsicher
from app.feedback f
join app.evenings e on e.id = f.evening_id and e.state = 'happened';
select count(distinct c.evening_id) filter (where c.released_at is not null) as kontakt_getauscht
from app.contact_shares c;
```

## 9. Sicherheit

| Kennzahl | Definition |
|---|---|
| Meldungen | `safety.reports` je 100 stattgefundene Abende, nach `severity`, nach `category` (k ≥ 5) |
| Reaktionszeit | erste Bearbeitung: `ops.audit_log` mit `action = 'safety.report_status'` und `target_id` = Meldung − `reports.created_at`; Abschluss: `resolved_at − created_at` |
| 24-Stunden-Ziel | Anteil Meldungen, die vor `due_at` in Prüfung bzw. entschieden waren |
| Vorläufige Sperren | `safety.sanctions.kind = 'vorlaeufige_sperre'`, Anteil später aufgehoben (`lifted_at`) |
| Widersprüche | `safety.appeals` nach `status` |
| Check-in | Verteilung `safety.checkins.status` (`gut`, `unsicher`, `hilfe`) |
| Hinweise | `safety.safety_flags` nach `source` und `kind`, Zeit bis `reviewed_at` |

```sql
select r.severity,
       count(*)                                                    as meldungen,
       count(*) filter (where r.resolved_at is not null)           as entschieden,
       percentile_cont(0.5) within group (order by extract(epoch from
         (select min(a.at) from ops.audit_log a
           where a.action = 'safety.report_status' and a.target_id = r.id::text) - r.created_at) / 3600) as median_h_bis_pruefung,
       count(*) filter (where r.resolved_at <= r.due_at)           as in_frist_entschieden
from safety.reports r group by 1;
```

## 10. Mitgliedschaft und Umsatz

| Kennzahl | Definition |
|---|---|
| Umwandlung nach dem Gratis-Abend | Personen mit `free_phase_ended_at` und danach `ordered_at` / Personen mit `free_phase_ended_at` |
| Stufen | Bestand je `tier` mit `status` `active`/`cancelled` |
| Kündigungen, Widerrufe | `billing.contract_actions` nach `kind` je Monat |
| Zahlungsausfälle | `status = 'past_due'` |
| Verlängerungsregel | Zeiträume mit `extended_by_rule` / alle Zeiträume |
| Umsatz | Summe `billing.membership_periods.amount_cents` je Monat (abzüglich Erstattungen aus `contract_actions.result`) |

## 11. Kosten

| Kennzahl | Definition |
|---|---|
| Kosten je Gespräch | `ops.session_costs.amount_eur` je Sitzung (Summe aller Zeilen einer Sitzung), Median und 90-%-Wert |
| Kosten je Gesprächsstunde | Summe `amount_eur` / Summe `minutes` × 60 – Ziel `voice.target_cost_eur_per_hour` (2 €) |
| Kosten je Lauf | `app.match_runs.cost_eur` |
| Kosten je stattgefundenem Abend | (Gespräche + Läufe + Ausweisprüfungen [[Didit-Preis]]) / Abende `happened` im Monat |
| Anteil nach Posten | `details` je Sitzung (LLM, Spracherkennung, Stimme, Medien) |

```sql
select date_trunc('month', c.recorded_at) as monat,
       count(distinct c.session_id)                 as gespraeche,
       round(sum(c.amount_eur), 2)                  as euro,
       round(sum(c.amount_eur) / nullif(sum(c.minutes), 0) * 60, 2) as euro_je_stunde,
       percentile_cont(0.5) within group (order by c.latency_ms_p90) as median_p90_ms
from ops.session_costs c group by 1 order by 1;
select date_trunc('month', r.started_at) as monat, count(*) as laeufe, round(sum(r.cost_eur), 2) as euro
from app.match_runs r group by 1 order by 1;
```

## 12. Benachrichtigungen und Technik

| Kennzahl | Definition |
|---|---|
| Zustellung | `ops.notification_queue`: Anteil `sent_at` vs. `failed_at`, je Kanal (`email_state`, `push_state`) |
| Push-Anteil | aktive Konten mit mindestens einem `app.push_subscriptions` / aktive Konten |
| Zeitpläne | `cron.job_run_details` mit `status <> 'succeeded'` je Tag |
| Didit-Löschungen offen | `api.admin_overview() -> 'verifications_pending_deletion'` (Ziel 0) |

---

## Offene Punkte für Benn

1. Welche 8–10 Kennzahlen kommen auf die erste Seite? Vorschlag: Warteliste je Region, Trichter, Abschlussquote
   Gespräch, Anteil mit Vorschlag, Freigabequote, Abende stattgefunden, Passung (Mittel), Meldungen im 24-h-Ziel,
   Kosten je Gesprächsstunde, Umwandlung nach Gratis-Abend.
2. Momentaufnahme-Tabelle `ops.kpi_daily` bauen lassen (sonst keine Zeitreihen über gelöschte Daten).
3. Ob der Fairness-Bericht im Dashboard über mehrere Läufe zusammengefasst werden darf (nur, wenn jede Gruppe ≥ k bleibt).
4. Preis der Ausweisprüfung je Person (Didit) als Einstellung ergänzen, damit „Kosten je Abend“ vollständig ist.
