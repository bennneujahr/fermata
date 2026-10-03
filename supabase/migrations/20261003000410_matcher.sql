-- Fermata · Auswahl-Job (M4)
-- Einstellungen, Lauf-Teilnehmende, Stapel-Prüffunktionen (nur Ja/Nein), Fairness-Bericht mit k-Anonymität,
-- Aufbewahrung der Teil-Scores, Zeitplan, Terminvorschläge und Admin-Freigabe.
-- PLAN 1 Nr. 6, 2.3 Nr. 5, 2.5, 3.2 Nr. 5, 5.7, 5.9, 5.10. Beschreibung: docs/bereiche/matcher.md.
-- Grundsatz: Der Job arbeitet nur mit den Rechten von fermata_matcher. Diese Migration ergänzt genau das,
-- was der Job dafür braucht, und nichts darüber hinaus.

-- ---------------------------------------------------------------------------
-- 1. Weitere Einstellungen (bestehende Schlüssel aus 20261003000010 bleiben unverändert)
-- ---------------------------------------------------------------------------
insert into ops.app_settings (key, value, description, category) values
  ('matching.personal_weight_share', '0.5',
   'PLATZHALTER: Anteil der persönlichen Gewichte (app.personal_weights) an den Gewichten der Teil-Scores; Rest: matching.weights.', 'auswahl'),
  ('matching.default_age_window_years', '10',
   'PLATZHALTER: Ohne eigene Altersangabe (age_min/age_max) gilt das eigene Alter plus/minus so viele Jahre.', 'auswahl'),
  ('matching.topn_mode', '"union"',
   'Vorauswahl: "union" = ein Paar wird bewertet, wenn es bei mindestens einer der beiden Personen unter den Top-N ist (PLAN 5.10: 5 × N bis 10 × N Bewertungen); "mutual" = bei beiden.', 'auswahl'),
  ('matching.max_cardinality', 'true',
   'Zuordnung: zuerst möglichst viele Paare (PLAN 1 Nr. 6 „für möglichst viele Menschen“), dann die höchste Summe der Scores.', 'auswahl'),
  ('matching.embeddings_enabled', 'true',
   'Vorauswahl mit Embeddings (Titan Text Embeddings V2). false: nur Regel-Scores (PLAN 2.5 „sonst nur Regeln“).', 'auswahl'),
  ('matching.embedding_model_id', '"amazon.titan-embed-text-v2:0"', 'Embedding-Modell (Bedrock, Frankfurt).', 'auswahl'),
  ('matching.llm_enabled', 'true', 'LLM-Rubrik verwenden. false: Gesamtscore nur aus Regel-Teil-Scores.', 'auswahl'),
  ('matching.llm_effort', '"low"', 'Denkaufwand der LLM-Rubrik und des Prüf-Agenten (Sonnet 5.5: low | medium | high).', 'auswahl'),
  ('matching.llm_concurrency', '8', 'So viele LLM-Anfragen laufen gleichzeitig.', 'auswahl'),
  ('matching.rejected_pair_cooldown_days', '90',
   'PLATZHALTER: Ein von Benn abgelehntes Paar wird so viele Tage nicht erneut vorgeschlagen.', 'auswahl'),
  ('matching.venue_ratio_min_km', '5',
   'Das Verhältnis matching.venue_max_detour_ratio gilt erst, wenn die längere Anfahrt mehr als so viele Kilometer beträgt.', 'auswahl'),
  ('matching.slot_lead_hours', '72',
   'Lokal-Plätze zählen im Lauf erst ab so vielen Stunden nach dem Start (Prüfung durch Benn plus Terminabstimmung).', 'auswahl'),
  ('matching.proposal_lead_hours', '48',
   'Terminvorschläge bei der Freigabe frühestens so viele Stunden später (zwei 24-Stunden-Fristen).', 'auswahl'),
  ('matching.proposed_times_count', '3', 'So viele Terminvorschläge bekommt ein freigegebener Abend.', 'auswahl'),
  ('matching.assignment_timeout_seconds', '120',
   'PLAN 5.9: Braucht networkx für einen Teilgraphen länger, übernimmt die Ersatz-Zuordnung.', 'auswahl'),
  ('matching.assignment_inline_max_nodes', '600',
   'Teilgraphen bis zu so vielen Knoten rechnet networkx direkt (ohne eigenen Prozess mit Zeitlimit).', 'auswahl'),
  ('matching.fairness_min_group_size', '5', 'k-Anonymität im Fairness-Bericht: kleinere Gruppen werden unterdrückt (mindestens 5).', 'auswahl'),
  ('matching.llm_price_usd_per_mtok', '{"input": 2.2, "output": 11.0, "cache_read": 0.22, "cache_write": 2.75}',
   'PLATZHALTER: Preise Sonnet 5.5 im EU-Profil je 1 Mio. Token in US-Dollar, Listenpreis plus 10 % EU-Aufschlag (PLAN 5.1). Vor dem Start mit der AWS-Preisliste prüfen.', 'auswahl'),
  ('matching.embedding_price_usd_per_mtok', '0.02', 'PLATZHALTER: Preis Titan Text Embeddings V2 je 1 Mio. Token in US-Dollar.', 'auswahl'),
  ('matching.usd_eur_rate', '0.92', 'PLATZHALTER: Umrechnungskurs US-Dollar → Euro für die Kostenschätzung im Lauf-Bericht.', 'auswahl')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Teilnehmende eines Laufs (für Wartebonus, Gründe ohne Vorschlag und den Fairness-Bericht)
-- ---------------------------------------------------------------------------
create table app.match_run_members (
  run_id uuid not null references app.match_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  wait_rounds integer not null default 0 check (wait_rounds >= 0),
  outcome text not null default 'unmatched' check (outcome in ('matched', 'unmatched')),
  unmatched_reason text check (unmatched_reason is null or unmatched_reason in (
    'keine_kandidaten',     -- kein Paar hat alle harten Filter bestanden
    'unter_mindestscore',   -- Kandidaten vorhanden, aber keiner erreicht matching.min_score
    'nicht_zugeordnet',     -- geeignete Paare vorhanden, die Zuordnung hat andere gewählt
    'kein_lokal'            -- Paar gefunden, aber kein Lokal mit freiem Platz mehr
  )),
  created_at timestamptz not null default now(),
  primary key (run_id, user_id)
);
comment on table app.match_run_members is 'Wer war in welchem Lauf im Pool und mit welchem Ergebnis. Löschung mit den Teil-Scores (matching.score_retention_months).';
create index match_run_members_user_idx on app.match_run_members (user_id);
alter table app.match_run_members enable row level security;
grant select, insert, update on app.match_run_members to fermata_matcher;
create policy match_run_members_matcher_write on app.match_run_members for all to fermata_matcher using (true) with check (true);

-- Der Job berechnet fehlende Embeddings (Titan V2) aus der geprüften Zusammenfassung ohne Namen und Art.-9-Inhalte.
-- Für den Typ vector und den Operator <=> (pgvector) braucht er das Schema extensions (anon/authenticated haben das
-- bei Supabase ohnehin). Der Schlüssel für die Art.-9-Spalten liegt in Vault und bleibt unerreichbar.
grant usage on schema extensions to fermata_matcher;
grant insert, update on app.profile_embeddings to fermata_matcher;
create policy profile_embeddings_matcher_insert on app.profile_embeddings for insert to fermata_matcher with check (true);
create policy profile_embeddings_matcher_update on app.profile_embeddings for update to fermata_matcher using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3. Hilfsfunktionen
-- ---------------------------------------------------------------------------
-- Offener Abend (proposed, time_*, confirmed): Person kommt nicht in den Pool. Nur Ja/Nein, kein Lesezugriff auf app.evenings.
create or replace function app.has_open_evening(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.evenings e
    where (e.user_a = p_user or e.user_b = p_user)
      and e.state in ('proposed', 'time_requested', 'time_countered', 'confirmed')
  );
$$;
comment on function app.has_open_evening(uuid) is 'true, wenn die Person einen laufenden Abend hat (vorgeschlagen, in Abstimmung oder bestätigt).';
grant execute on function app.has_open_evening(uuid) to fermata_matcher, service_role;

-- Altersband aus dem Geburtsjahr (nur das Jahr ist bekannt). Für Admin-Ansicht und Fairness-Bericht.
create or replace function app.age_band(p_birth_year integer, p_on date default null)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_birth_year is null then 'unbekannt'
    when a < 25 then '18–24'
    when a < 35 then '25–34'
    when a < 45 then '35–44'
    when a < 55 then '45–54'
    when a < 65 then '55–64'
    else '65+'
  end
  from (select extract(year from coalesce(p_on, (app.now() at time zone 'Europe/Berlin')::date))::integer - p_birth_year as a) x;
$$;
comment on function app.age_band(integer, date) is 'Altersband (18–24, 25–34, …, 65+) aus dem Geburtsjahr.';
grant execute on function app.age_band(integer, date) to fermata_matcher, service_role, authenticated;

create or replace function app.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Nur für Admins mit Zwei-Faktor-Anmeldung' using errcode = 'insufficient_privilege';
  end if;
end;
$$;
revoke execute on function app.require_admin() from public, anon;
grant execute on function app.require_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Prüffunktionen im Stapel (PLAN 3.2 Nr. 5). Gleiche Ja/Nein-Antwort wie
--    sensitive.gender_compatible(a, b) und sensitive.religion_compatible(a, b), aber jede Person wird nur
--    einmal entschlüsselt. Grund: pgp_sym_decrypt kostet ca. 1,5 ms je Einzelaufruf; bei 5.000 Profilen
--    dauerte die Einzelprüfung sonst viele Minuten. Die Gleichheit beider Wege prüft 400_matcher.test.sql.
-- ---------------------------------------------------------------------------
create or replace function sensitive.gender_compatible_pairs(p_a uuid[], p_b uuid[])
returns table (user_a uuid, user_b uuid, compatible boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_a), 0) <> coalesce(cardinality(p_b), 0) then
    raise exception 'Beide Listen müssen gleich lang sein' using errcode = '22023';
  end if;
  return query
  with pairs as (
    select u.a, u.b from unnest(p_a, p_b) as u (a, b)
  ),
  ids as (
    select pairs.a as id from pairs union select pairs.b from pairs
  ),
  x as materialized (
    select pi.user_id, sensitive.dec(pi.gender_enc) as g, string_to_array(sensitive.dec(pi.seeking_genders_enc), ',') as s
    from sensitive.profile_identity pi join ids on ids.id = pi.user_id
  )
  select p.a, p.b, coalesce((xa.s @> array[xb.g]) and (xb.s @> array[xa.g]), false)
  from pairs p
  left join x xa on xa.user_id = p.a
  left join x xb on xb.user_id = p.b;
end;
$$;
comment on function sensitive.gender_compatible_pairs(uuid[], uuid[]) is
  'Stapel-Variante von sensitive.gender_compatible: je Paar nur true/false. Nur für den Auswahl-Job.';

create or replace function sensitive.religion_compatible_pairs(p_a uuid[], p_b uuid[])
returns table (user_a uuid, user_b uuid, compatible boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_a), 0) <> coalesce(cardinality(p_b), 0) then
    raise exception 'Beide Listen müssen gleich lang sein' using errcode = '22023';
  end if;
  return query
  with pairs as (
    select u.a, u.b from unnest(p_a, p_b) as u (a, b)
  ),
  ids as (
    select pairs.a as id from pairs union select pairs.b from pairs
  ),
  x as materialized (
    select ps.user_id, lower(trim(sensitive.dec(ps.religion_enc))) as r, ps.religion_must_match as m
    from sensitive.profile_sensitive ps join ids on ids.id = ps.user_id
  )
  select p.a, p.b, case
    when not coalesce(xa.m, false) and not coalesce(xb.m, false) then true
    else coalesce(xa.r is not null and xa.r = xb.r, false)
  end
  from pairs p
  left join x xa on xa.user_id = p.a
  left join x xb on xb.user_id = p.b;
end;
$$;
comment on function sensitive.religion_compatible_pairs(uuid[], uuid[]) is
  'Stapel-Variante von sensitive.religion_compatible: je Paar nur true/false. Nur für den Auswahl-Job.';

revoke execute on function sensitive.gender_compatible_pairs(uuid[], uuid[]), sensitive.religion_compatible_pairs(uuid[], uuid[])
  from public, anon, authenticated, service_role;
grant execute on function sensitive.gender_compatible_pairs(uuid[], uuid[]), sensitive.religion_compatible_pairs(uuid[], uuid[])
  to fermata_matcher;

-- ---------------------------------------------------------------------------
-- 5. Fairness-Bericht (PLAN 5.7): nur Zählungen je Geschlecht und je Altersband, getrennt (nie gekreuzt),
--    mit k-Anonymität. Gruppen unter k werden unterdrückt; damit sich eine unterdrückte Gruppe nicht aus der
--    Gesamtzahl zurückrechnen lässt, werden so lange weitere kleine Gruppen mit unterdrückt, bis die
--    unterdrückte Summe mindestens k ist und mindestens zwei Gruppen umfasst (sekundäre Unterdrückung).
--    Vorgeschlagene Personen werden je Gruppe nur gezeigt, wenn vorgeschlagen und nicht vorgeschlagen je
--    mindestens k sind; sonst nur „zu wenige für einen Anteil“.
-- ---------------------------------------------------------------------------
create or replace function ops.k_anonymous_groups(p_groups jsonb, p_k integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
-- p_groups: [{"gruppe": text, "im_pool": int, "vorgeschlagen": int}, …]
declare
  k integer := greatest(coalesce(p_k, 5), 5);
  g jsonb;
  names text[] := '{}';
  pools integer[] := '{}';
  matched integer[] := '{}';
  hidden boolean[] := '{}';
  n integer;
  i integer;
  hidden_count integer;
  hidden_sum integer;
  smallest integer;
  result jsonb := '[]'::jsonb;
  hidden_matched_sum integer := 0;
begin
  for g in select value from jsonb_array_elements(coalesce(p_groups, '[]'::jsonb)) order by (value ->> 'im_pool')::integer, value ->> 'gruppe' loop
    names := names || (g ->> 'gruppe');
    pools := pools || coalesce((g ->> 'im_pool')::integer, 0);
    matched := matched || coalesce((g ->> 'vorgeschlagen')::integer, 0);
    hidden := hidden || (coalesce((g ->> 'im_pool')::integer, 0) < k);
  end loop;
  n := coalesce(cardinality(names), 0);
  -- sekundäre Unterdrückung
  loop
    hidden_count := 0; hidden_sum := 0;
    for i in 1 .. n loop
      if hidden[i] then hidden_count := hidden_count + 1; hidden_sum := hidden_sum + pools[i]; end if;
    end loop;
    exit when hidden_count = 0 or (hidden_count >= 2 and hidden_sum >= k) or hidden_count = n;
    smallest := null;
    for i in 1 .. n loop
      if not hidden[i] and (smallest is null or pools[i] < pools[smallest]) then smallest := i; end if;
    end loop;
    exit when smallest is null;
    hidden[smallest] := true;
  end loop;
  for i in 1 .. n loop
    if hidden[i] then
      hidden_matched_sum := hidden_matched_sum + matched[i];
    else
      result := result || jsonb_build_array(jsonb_build_object(
        'gruppe', names[i],
        'im_pool', pools[i],
        'vorgeschlagen', case when matched[i] >= k and pools[i] - matched[i] >= k then matched[i] end,
        'anteil', case when matched[i] >= k and pools[i] - matched[i] >= k then round(matched[i]::numeric / pools[i], 2) end,
        'hinweis', case when matched[i] >= k and pools[i] - matched[i] >= k then null else 'zu wenige für einen Anteil' end));
    end if;
  end loop;
  hidden_count := 0; hidden_sum := 0;
  for i in 1 .. n loop
    if hidden[i] then hidden_count := hidden_count + 1; hidden_sum := hidden_sum + pools[i]; end if;
  end loop;
  return jsonb_build_object(
    'k', k,
    'gruppen', result,
    'unterdrueckt', jsonb_build_object(
      'anzahl_gruppen', hidden_count,
      'im_pool', case when hidden_count >= 2 and hidden_sum >= k then hidden_sum end,
      'hinweis', case when hidden_count > 0 then 'Gruppen mit weniger als ' || k || ' Personen sind zusammengefasst oder ausgeblendet.' end));
end;
$$;
comment on function ops.k_anonymous_groups(jsonb, integer) is 'k-Anonymität für Gruppenzählungen (primäre und sekundäre Unterdrückung).';
grant execute on function ops.k_anonymous_groups(jsonb, integer) to fermata_matcher, service_role;

create or replace function sensitive.match_run_fairness(p_run_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  k integer := greatest(coalesce(ops.setting_int('matching.fairness_min_group_size'), 5), 5);
  run_day date;
  by_gender jsonb;
  by_age jsonb;
  total integer;
begin
  select (coalesce(r.started_at, r.created_at) at time zone 'Europe/Berlin')::date into run_day from app.match_runs r where r.id = p_run_id;
  if run_day is null then
    raise exception 'Lauf nicht gefunden' using errcode = 'no_data_found';
  end if;
  select count(*)::integer into total from app.match_run_members m where m.run_id = p_run_id;

  select coalesce(jsonb_agg(jsonb_build_object('gruppe', x.gruppe, 'im_pool', x.n, 'vorgeschlagen', x.m)), '[]'::jsonb) into by_gender
  from (
    select coalesce(sensitive.dec(pi.gender_enc), 'unbekannt') as gruppe, count(*)::integer as n,
           count(*) filter (where m.outcome = 'matched')::integer as m
    from app.match_run_members m
    left join sensitive.profile_identity pi on pi.user_id = m.user_id
    where m.run_id = p_run_id
    group by 1
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('gruppe', x.gruppe, 'im_pool', x.n, 'vorgeschlagen', x.m)), '[]'::jsonb) into by_age
  from (
    select app.age_band(pc.birth_year, run_day) as gruppe, count(*)::integer as n,
           count(*) filter (where m.outcome = 'matched')::integer as m
    from app.match_run_members m
    left join app.profile_core pc on pc.user_id = m.user_id
    where m.run_id = p_run_id
    group by 1
  ) x;

  return jsonb_build_object(
    'im_pool', total,
    'k', k,
    'nach_geschlecht', ops.k_anonymous_groups(by_gender, k),
    'nach_altersband', ops.k_anonymous_groups(by_age, k));
end;
$$;
comment on function sensitive.match_run_fairness(uuid) is
  'Fairness-Bericht eines Laufs: nur Zählungen je Geschlecht bzw. Altersband (getrennt), k-anonym. Keine Angaben je Person.';
revoke execute on function sensitive.match_run_fairness(uuid) from public, anon, authenticated, service_role;
grant execute on function sensitive.match_run_fairness(uuid) to fermata_matcher;

-- ---------------------------------------------------------------------------
-- 6. Aufbewahrung (PLAN 2.2): Teil-Scores nach matching.score_retention_months löschen.
--    Lauf-Berichte (app.match_runs.report) und Paare (app.pairings) bleiben.
-- ---------------------------------------------------------------------------
create or replace function ops.purge_match_scores()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz := app.now() - make_interval(months => ops.setting_int('matching.score_retention_months'));
  n_candidates integer;
  n_members integer;
begin
  delete from app.pair_candidates pc using app.match_runs r
  where pc.run_id = r.id and coalesce(r.finished_at, r.started_at, r.created_at) < cutoff;
  get diagnostics n_candidates = row_count;
  delete from app.match_run_members m using app.match_runs r
  where m.run_id = r.id and coalesce(r.finished_at, r.started_at, r.created_at) < cutoff;
  get diagnostics n_members = row_count;
  return jsonb_build_object('pair_candidates', n_candidates, 'match_run_members', n_members, 'cutoff', cutoff);
end;
$$;
comment on function ops.purge_match_scores() is 'Löscht Teil-Scores (app.pair_candidates) und Lauf-Teilnahmen älter als matching.score_retention_months. Täglich per pg_cron.';
revoke execute on function ops.purge_match_scores() from public, anon, authenticated;
grant execute on function ops.purge_match_scores() to service_role;

-- ---------------------------------------------------------------------------
-- 7. Zeitplan: Für jeden Zeitraum, dessen Antwortfrist abgelaufen ist, einen Lauf „scheduled“ anlegen.
--    Der Job holt ihn mit `fermata-matcher run --next` ab (AWS EventBridge, siehe docs/bereiche/matcher.md).
-- ---------------------------------------------------------------------------
create or replace function app.schedule_due_match_runs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into app.match_runs (period_id, scheduled_for, status)
  select p.id, p.answer_until, 'scheduled'
  from app.availability_periods p
  where p.answer_until <= app.now()
    and p.ends_on >= (app.now() at time zone 'Europe/Berlin')::date
    and not exists (
      select 1 from app.match_runs r
      where r.period_id = p.id and r.status in ('scheduled', 'running', 'review', 'approved', 'partially_approved')
    );
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function app.schedule_due_match_runs() is 'Legt fällige Auswahl-Läufe an (je Zeitraum höchstens einer). Stündlich per pg_cron.';
revoke execute on function app.schedule_due_match_runs() from public, anon, authenticated;
grant execute on function app.schedule_due_match_runs() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fermata-purge-match-scores', '23 3 * * *', 'select ops.purge_match_scores()');
    perform cron.schedule('fermata-schedule-match-runs', '7 * * * *', 'select app.schedule_due_match_runs()');
  end if;
exception when others then
  raise notice 'pg_cron nicht eingerichtet: %', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Terminvorschläge für einen Abend: bis zu N Beginnzeiten aus den gemeinsamen Fenstern (app.shared_windows)
--    mit freiem Platz im gewählten Lokal. Bevorzugt verschiedene Tage, dann die früheste Zeit.
--    Format von app.evenings.proposed_times: [{"starts_at": "…", "slot_id": "…"}, …] (Vertrag mit M5).
-- ---------------------------------------------------------------------------
create or replace function app.pairing_candidate_times(p_pairing_id uuid, p_limit integer default 3)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select pa.user_a, pa.user_b, pa.venue_id, r.period_id
    from app.pairings pa join app.match_runs r on r.id = pa.run_id
    where pa.id = p_pairing_id
  ),
  cfg as (
    select ops.setting_int('evening.default_duration_minutes') as dur,
           app.now() + make_interval(hours => ops.setting_int('matching.proposal_lead_hours')) as earliest
  ),
  sw as (
    select w.starts_at, w.ends_at
    from p, cfg, lateral app.shared_windows(p.user_a, p.user_b, p.period_id, cfg.dur) w
  ),
  slots as (
    select s.id, s.starts_at
    from p, cfg, app.venue_slots s
    where s.venue_id = p.venue_id
      and s.reserved < s.tables
      and s.starts_at >= cfg.earliest
      and exists (
        select 1 from sw where s.starts_at >= sw.starts_at and s.starts_at + make_interval(mins => cfg.dur) <= sw.ends_at)
  ),
  ranked as (
    select id, starts_at,
           row_number() over (partition by (starts_at at time zone 'Europe/Berlin')::date order by starts_at) as nth_of_day
    from slots
  ),
  chosen as (
    select id, starts_at from ranked order by nth_of_day, starts_at limit greatest(coalesce(p_limit, 3), 1)
  )
  select coalesce(jsonb_agg(jsonb_build_object('starts_at', starts_at, 'slot_id', id) order by starts_at), '[]'::jsonb)
  from chosen;
$$;
comment on function app.pairing_candidate_times(uuid, integer) is 'Bis zu N Beginnzeiten (gemeinsames Fenster, freier Platz im Lokal) für einen Vorschlag.';
revoke execute on function app.pairing_candidate_times(uuid, integer) from public, anon, authenticated;
grant execute on function app.pairing_candidate_times(uuid, integer) to service_role, fermata_matcher;

-- ---------------------------------------------------------------------------
-- 9. Admin-API für die Prüfung der Vorschläge (Benn, Zwei-Faktor). Jede Entscheidung steht in ops.audit_log.
-- ---------------------------------------------------------------------------
create or replace function api.admin_match_runs()
returns table (
  id uuid, period_id uuid, period_starts_on date, period_ends_on date, status text,
  scheduled_for timestamptz, started_at timestamptz, finished_at timestamptz,
  pool_size integer, candidate_pairs integer, proposed_pairs integer,
  pending_review integer, approved integer, rejected integer,
  cost_eur numeric, error text, report jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  return query
  select r.id, r.period_id, p.starts_on, p.ends_on, r.status, r.scheduled_for, r.started_at, r.finished_at,
         r.pool_size, r.candidate_pairs, r.proposed_pairs,
         (select count(*)::integer from app.pairings x where x.run_id = r.id and x.status = 'pending_review'),
         (select count(*)::integer from app.pairings x where x.run_id = r.id and x.status not in ('pending_review', 'rejected')),
         (select count(*)::integer from app.pairings x where x.run_id = r.id and x.status = 'rejected'),
         r.cost_eur, r.error, r.report
  from app.match_runs r
  left join app.availability_periods p on p.id = r.period_id
  order by r.scheduled_for desc, r.created_at desc;
end;
$$;
comment on function api.admin_match_runs() is 'Admin: alle Auswahl-Läufe mit Zählungen und Bericht.';

create or replace function api.admin_run_pairings(p_run_id uuid)
returns table (
  pairing_id uuid, status text, total_score numeric, rule_score numeric, llm_score numeric, wait_bonus numeric,
  subscores jsonb, llm_rationale text, reasons_text text, reasons_art9_clean boolean, review_notes jsonb,
  venue_id uuid, venue_name text, venue_city text, venue_reason text,
  a_display_name text, a_age_band text, b_display_name text, b_age_band text,
  evening_id uuid, reviewed_at timestamptz, review_comment text, created_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  if not exists (select 1 from app.match_runs r where r.id = p_run_id) then
    raise exception 'Lauf nicht gefunden' using errcode = 'no_data_found';
  end if;
  perform ops.audit('matching.run_pairings_viewed', 'app.match_runs', p_run_id::text, '{}'::jsonb);
  return query
  select pa.id, pa.status, pa.total_score, pc.rule_score, pc.llm_score, pc.wait_bonus,
         coalesce(pc.subscores, '{}'::jsonb), pc.llm_rationale, pa.reasons_text, pc.reasons_art9_clean, pa.review_notes,
         pa.venue_id, v.name, v.city, pa.venue_reason,
         ca.display_name, app.age_band(ca.birth_year), cb.display_name, app.age_band(cb.birth_year),
         e.id, pa.reviewed_at, pa.review_comment, pa.created_at
  from app.pairings pa
  left join app.pair_candidates pc on pc.id = pa.candidate_id
  left join app.venues v on v.id = pa.venue_id
  left join app.profile_core ca on ca.user_id = pa.user_a
  left join app.profile_core cb on cb.user_id = pa.user_b
  left join app.evenings e on e.pairing_id = pa.id
  where pa.run_id = p_run_id
  order by pa.total_score desc, pa.created_at;
end;
$$;
comment on function api.admin_run_pairings(uuid) is 'Admin: Vorschläge eines Laufs mit Scores, Prüfnotizen, Lokal; Personen nur mit Anzeigename und Altersband.';

-- Prüft vor der Freigabe, ob beide noch teilnehmen dürfen. Liefert einen Grund oder null.
create or replace function app.pairing_block_reason(p_user_a uuid, p_user_b uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app.is_blocked(p_user_a, p_user_b) then 'Eine Person hat die andere blockiert.'
    when safety.is_suspended(p_user_a) or safety.is_suspended(p_user_b) then 'Eine Person ist gesperrt.'
    when exists (select 1 from app.accounts a where a.user_id in (p_user_a, p_user_b) and a.status <> 'active')
      or (select count(*) from app.accounts a where a.user_id in (p_user_a, p_user_b)) < 2 then 'Ein Konto ist nicht mehr aktiv.'
    when app.has_open_evening(p_user_a) or app.has_open_evening(p_user_b) then 'Eine Person hat bereits einen laufenden Abend.'
    when billing.available_evenings(p_user_a) <= 0 or billing.available_evenings(p_user_b) <= 0 then 'Eine Person hat keinen Abend mehr frei.'
    when not (app.has_consent(p_user_a, 'gespraech') and app.has_consent(p_user_b, 'gespraech')
              and app.has_consent(p_user_a, 'art9_profile') and app.has_consent(p_user_b, 'art9_profile'))
      then 'Eine Einwilligung wurde widerrufen.'
  end;
$$;
revoke execute on function app.pairing_block_reason(uuid, uuid) from public, anon, authenticated;

create or replace function api.admin_approve_pairing(p_pairing_id uuid, p_comment text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p app.pairings;
  run_status text;
  reason text;
  times jsonb;
  evening uuid;
begin
  perform app.require_admin();
  select * into p from app.pairings where id = p_pairing_id for update;
  if not found then
    raise exception 'Vorschlag nicht gefunden' using errcode = 'no_data_found';
  end if;
  select r.status into run_status from app.match_runs r where r.id = p.run_id;
  if run_status <> 'review' then
    raise exception 'Der Lauf ist nicht in Prüfung (Status %).', run_status using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p.status <> 'pending_review' then
    raise exception 'Über diesen Vorschlag wurde schon entschieden (Status %).', p.status using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p.venue_id is null then
    raise exception 'Dieser Vorschlag hat kein Lokal.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  reason := app.pairing_block_reason(p.user_a, p.user_b);
  if reason is not null then
    raise exception 'Freigabe nicht möglich: %', reason using errcode = 'object_not_in_prerequisite_state';
  end if;
  times := app.pairing_candidate_times(p.id, ops.setting_int('matching.proposed_times_count'));
  if jsonb_array_length(times) = 0 then
    raise exception 'Freigabe nicht möglich: Im Lokal ist in den gemeinsamen Zeiten kein Platz mehr frei.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update app.pairings
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = app.now(), review_comment = nullif(trim(p_comment), '')
   where id = p.id;
  insert into app.evenings (pairing_id, user_a, user_b, venue_id, state, proposed_times)
  values (p.id, p.user_a, p.user_b, p.venue_id, 'proposed', times)
  returning id into evening;
  update app.pairings set status = 'proposed' where id = p.id;

  perform ops.audit('matching.pairing_approved', 'app.pairings', p.id::text,
    jsonb_build_object('run_id', p.run_id, 'evening_id', evening, 'comment', nullif(trim(p_comment), ''), 'proposed_times', times));
  return jsonb_build_object('pairing_id', p.id, 'status', 'proposed', 'evening_id', evening, 'proposed_times', times);
end;
$$;
comment on function api.admin_approve_pairing(uuid, text) is
  'Admin: Vorschlag freigeben. Status approved, dann Abend (state proposed, Lokal, bis zu 3 Terminvorschläge), dann Status proposed.';

create or replace function api.admin_reject_pairing(p_pairing_id uuid, p_comment text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  p app.pairings;
  run_status text;
begin
  perform app.require_admin();
  select * into p from app.pairings where id = p_pairing_id for update;
  if not found then
    raise exception 'Vorschlag nicht gefunden' using errcode = 'no_data_found';
  end if;
  select r.status into run_status from app.match_runs r where r.id = p.run_id;
  if run_status <> 'review' then
    raise exception 'Der Lauf ist nicht in Prüfung (Status %).', run_status using errcode = 'object_not_in_prerequisite_state';
  end if;
  if p.status <> 'pending_review' then
    raise exception 'Über diesen Vorschlag wurde schon entschieden (Status %).', p.status using errcode = 'object_not_in_prerequisite_state';
  end if;
  update app.pairings
     set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = app.now(), review_comment = nullif(trim(p_comment), '')
   where id = p.id;
  perform ops.audit('matching.pairing_rejected', 'app.pairings', p.id::text,
    jsonb_build_object('run_id', p.run_id, 'comment', nullif(trim(p_comment), '')));
  return jsonb_build_object('pairing_id', p.id, 'status', 'rejected');
end;
$$;
comment on function api.admin_reject_pairing(uuid, text) is 'Admin: Vorschlag ablehnen. Es entsteht kein Abend.';

create or replace function api.admin_finish_run(p_run_id uuid, p_reject_pending boolean default false)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r app.match_runs;
  pending integer;
  n_approved integer;
  n_rejected integer;
  new_status text;
begin
  perform app.require_admin();
  select * into r from app.match_runs where id = p_run_id for update;
  if not found then
    raise exception 'Lauf nicht gefunden' using errcode = 'no_data_found';
  end if;
  if r.status <> 'review' then
    raise exception 'Der Lauf ist nicht in Prüfung (Status %).', r.status using errcode = 'object_not_in_prerequisite_state';
  end if;
  select count(*)::integer into pending from app.pairings where run_id = r.id and status = 'pending_review';
  if pending > 0 and not coalesce(p_reject_pending, false) then
    raise exception 'Noch % Vorschläge offen.', pending using errcode = 'object_not_in_prerequisite_state';
  end if;
  if pending > 0 then
    update app.pairings
       set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = app.now(), review_comment = 'Beim Abschluss des Laufs abgelehnt.'
     where run_id = r.id and status = 'pending_review';
  end if;
  select count(*) filter (where status not in ('pending_review', 'rejected'))::integer,
         count(*) filter (where status = 'rejected')::integer
    into n_approved, n_rejected
    from app.pairings where run_id = r.id;
  new_status := case
    when n_rejected = 0 then 'approved'
    when n_approved = 0 then 'cancelled'
    else 'partially_approved'
  end;
  update app.match_runs
     set status = new_status,
         report = report || jsonb_build_object('freigabe', jsonb_build_object(
           'abgeschlossen_am', app.now(), 'freigegeben', n_approved, 'abgelehnt', n_rejected, 'beim_abschluss_abgelehnt', pending))
   where id = r.id;
  perform ops.audit('matching.run_finished', 'app.match_runs', r.id::text,
    jsonb_build_object('status', new_status, 'approved', n_approved, 'rejected', n_rejected, 'rejected_on_finish', pending));
  return jsonb_build_object('run_id', r.id, 'status', new_status, 'approved', n_approved, 'rejected', n_rejected,
                            'rejected_on_finish', pending);
end;
$$;
comment on function api.admin_finish_run(uuid, boolean) is
  'Admin: Lauf abschließen. approved (nichts abgelehnt), partially_approved (teils abgelehnt) oder cancelled (alles abgelehnt).';

revoke execute on function api.admin_match_runs(), api.admin_run_pairings(uuid), api.admin_approve_pairing(uuid, text),
  api.admin_reject_pairing(uuid, text), api.admin_finish_run(uuid, boolean) from public, anon;
grant execute on function api.admin_match_runs(), api.admin_run_pairings(uuid), api.admin_approve_pairing(uuid, text),
  api.admin_reject_pairing(uuid, text), api.admin_finish_run(uuid, boolean) to authenticated, service_role;
