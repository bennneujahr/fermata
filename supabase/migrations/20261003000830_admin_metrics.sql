-- Fermata · Admin-Oberfläche (UI-Welle): Kennzahlen und Lese-Hilfen, die keine bestehende Funktion liefert.
-- Alle Funktionen: security definer, nur app.is_admin() (Admin mit Zwei-Faktor, aal2), sonst 42501 / admin_aal2_required.
-- Kennzahlen nur als Summen mit k ≥ 5 (docs/KENNZAHLEN.md, Abschnitt 1): Zellen mit 1–4 Personen werden null
-- (Anzeige „< 5“), dazu sekundäre Unterdrückung in Verteilungen. Keine Art.-9-Merkmale, keine Freitexte.
-- Jeder Abruf steht im Audit-Protokoll (kpi.viewed, admin.today_viewed, …).

-- ---------------------------------------------------------------------------
-- Hilfen (intern)
-- ---------------------------------------------------------------------------
create or replace function ops.kpi_k()
returns integer
language sql
stable
security definer
set search_path = ''
as $$ select greatest(coalesce(ops.setting_int('matching.fairness_min_group_size'), 5), 5); $$;
comment on function ops.kpi_k() is 'k für die Kennzahlen (mindestens 5, Einstellung matching.fairness_min_group_size).';

-- Einzelne Zahl: 1 … k−1 → null (Anzeige „< k“); 0 bleibt 0 (keine Person betroffen).
create or replace function ops.kpi_n(p_n bigint, p_k integer)
returns integer
language sql
immutable
set search_path = ''
as $$ select case when p_n is null then null when p_n > 0 and p_n < greatest(coalesce(p_k, 5), 5) then null else p_n::integer end; $$;
comment on function ops.kpi_n(bigint, integer) is 'k-Unterdrückung einer einzelnen Zahl (0 bleibt sichtbar).';

-- Verteilung {schluessel: anzahl} mit primärer und sekundärer Unterdrückung: Ist genau eine Zelle unterdrückt,
-- wird zusätzlich die nächstkleinere (> 0) unterdrückt, damit sie sich nicht aus der Summe zurückrechnen lässt.
create or replace function ops.kpi_cells(p_counts jsonb, p_k integer)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k integer := greatest(coalesce(p_k, 5), 5);
  r jsonb := '{}'::jsonb;
  hidden text[] := '{}';
  smallest text;
  e record;
begin
  for e in select key, value::integer as n from jsonb_each_text(coalesce(p_counts, '{}'::jsonb)) loop
    if e.n > 0 and e.n < k then hidden := hidden || e.key; end if;
  end loop;
  if cardinality(hidden) = 1 then
    select x.key into smallest from jsonb_each_text(p_counts) x
     where x.key <> all (hidden) and x.value::integer > 0 order by x.value::integer, x.key limit 1;
    if smallest is not null then hidden := hidden || smallest; end if;
  end if;
  for e in select key, value::integer as n from jsonb_each_text(coalesce(p_counts, '{}'::jsonb)) loop
    r := r || jsonb_build_object(e.key, case when e.key = any (hidden) then null else e.n end);
  end loop;
  return r;
end;
$$;
comment on function ops.kpi_cells(jsonb, integer) is 'k-Unterdrückung einer Verteilung (primär und sekundär); null = „< k“.';

revoke all on function ops.kpi_k(), ops.kpi_n(bigint, integer), ops.kpi_cells(jsonb, integer) from public, anon, authenticated;
grant execute on function ops.kpi_k(), ops.kpi_n(bigint, integer), ops.kpi_cells(jsonb, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 1. „Heute“: was Benn jetzt tun muss (Arbeitslisten, ohne Namen)
-- ---------------------------------------------------------------------------
create or replace function api.admin_today()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := app.now();
  v_result jsonb;
begin
  perform app.require_admin();
  select jsonb_build_object(
    'generated_at', v_now,
    'runs_review', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'period_starts_on', p.starts_on, 'period_ends_on', p.ends_on, 'finished_at', r.finished_at,
        'proposed_pairs', r.proposed_pairs,
        'pending', (select count(*) from app.pairings x where x.run_id = r.id and x.status = 'pending_review'),
        'with_warnings', (select count(*) from app.pairings x where x.run_id = r.id and x.status = 'pending_review'
                            and (coalesce(jsonb_array_length(x.review_notes -> 'hinweise'), 0) > 0
                                 or coalesce(x.review_notes ->> 'empfehlung', 'freigeben') <> 'freigeben'
                                 or coalesce((x.review_notes ->> 'ersatztext_verwendet')::boolean, false)
                                 or coalesce((x.review_notes -> 'art9_filter' ->> 'ok')::boolean, true) = false
                                 or x.review_notes ? 'agent_fehler' and x.review_notes ->> 'agent_fehler' is not null)))
        order by r.finished_at)
      from app.match_runs r left join app.availability_periods p on p.id = r.period_id
      where r.status = 'review'), '[]'::jsonb),
    'runs_failed_recent', (select count(*) from app.match_runs r where r.status = 'failed' and r.created_at > v_now - interval '14 days'),
    'runs_running', (select count(*) from app.match_runs r where r.status in ('scheduled', 'running')),
    'reports', jsonb_build_object(
      'open', (select count(*) from safety.reports r where r.status in ('open', 'in_review')),
      'overdue', (select count(*) from safety.reports r where r.status in ('open', 'in_review') and r.due_at < v_now),
      'items', coalesce((
        select jsonb_agg(x.j order by x.rank desc, x.due_at nulls last)
        from (
          select safety.severity_rank(r.severity) as rank, r.due_at,
                 jsonb_build_object('id', r.id, 'category', r.category, 'category_label', safety.category_label(r.category),
                   'severity', r.severity, 'status', r.status, 'created_at', r.created_at, 'due_at', r.due_at,
                   'overdue', r.due_at < v_now) as j
          from safety.reports r where r.status in ('open', 'in_review')
          order by safety.severity_rank(r.severity) desc, r.due_at nulls last
          limit 8
        ) x), '[]'::jsonb)),
    'flags_by_severity', (
      select jsonb_build_object(
        'akut', count(*) filter (where f.severity = 'akut'),
        'hoch', count(*) filter (where f.severity = 'hoch'),
        'mittel', count(*) filter (where f.severity = 'mittel'),
        'niedrig', count(*) filter (where f.severity = 'niedrig'))
      from safety.safety_flags f where f.reviewed_at is null),
    'reservations_unconfirmed', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reservation_id', er.id, 'venue_id', v.id, 'venue_name', v.name, 'venue_city', v.city,
        'reservation_mode', v.reservation_mode, 'contact_phone', v.contact_phone, 'starts_at', er.starts_at,
        'table_code', er.table_code, 'venue_notified_at', er.venue_notified_at) order by er.starts_at)
      from app.evening_reservations er join app.venues v on v.id = er.venue_id
      where er.status = 'reserved' and er.venue_confirmed_at is null and er.starts_at > v_now), '[]'::jsonb),
    'evenings_to_resolve', (
      select count(*) from app.evenings e
      where e.state = 'confirmed' and e.starts_at < v_now
        and (e.starts_at < v_now - interval '48 hours'
             or exists (select 1 from safety.safety_flags f where f.kind = 'no_show_bestritten' and f.reviewed_at is null
                          and f.details ->> 'evening_id' = e.id::text)
             or exists (select 1 from safety.reports r where r.evening_id = e.id and r.status in ('open', 'in_review')))),
    'appeals', jsonb_build_object(
      'open', (select count(*) from safety.appeals a where a.status = 'open'),
      'oldest_at', (select min(a.created_at) from safety.appeals a where a.status = 'open')),
    'provisional_suspensions', (select count(*) from safety.sanctions s where s.kind = 'vorlaeufige_sperre' and s.lifted_at is null),
    'next_period', (
      select jsonb_build_object('id', p.id, 'starts_on', p.starts_on, 'ends_on', p.ends_on, 'ask_at', p.ask_at, 'answer_until', p.answer_until)
      from app.availability_periods p where p.ends_on >= (v_now at time zone 'Europe/Berlin')::date
      order by p.starts_on limit 1)
  ) into v_result;
  perform ops.audit('admin.today_viewed', null, null, '{}'::jsonb);
  return v_result;
end;
$$;
comment on function api.admin_today() is 'Admin: Arbeitslisten für „Heute“ (Läufe in Prüfung, Meldungen mit Frist, Hinweise, Lokale, Abende, Widersprüche).';

-- ---------------------------------------------------------------------------
-- 2. Kennzahlen (docs/KENNZAHLEN.md) – nur Summen, k ≥ 5
-- ---------------------------------------------------------------------------
create or replace function api.admin_kpis()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k integer := ops.kpi_k();
  v_now timestamptz := app.now();
  v_waitlist jsonb;
  v_funnel jsonb;
  v_last_run jsonb;
  v_runs jsonb;
  v_evenings jsonb;
  v_feedback jsonb;
  v_costs jsonb;
  v_safety jsonb;
  v_membership jsonb;
begin
  perform app.require_admin();

  -- Warteliste (bestätigte je Gruppe und je Quelle)
  select jsonb_build_object(
    'confirmed', ops.kpi_n(count(*) filter (where w.confirmed_at is not null), k),
    'unconfirmed', ops.kpi_n(count(*) filter (where w.confirmed_at is null), k),
    'invited_to_app', ops.kpi_n(count(*) filter (where w.invited_to_app_at is not null), k),
    'by_region_group', (select ops.kpi_cells(coalesce(jsonb_object_agg(g.region_group, g.n), '{}'::jsonb), k)
                        from (select x.region_group, count(*) as n from public.waitlist x
                              where x.confirmed_at is not null group by x.region_group) g),
    'by_source', (select ops.kpi_cells(coalesce(jsonb_object_agg(s2.source, s2.n), '{}'::jsonb), k)
                  from (select coalesce(x.source, '(ohne)') as source, count(*) as n from public.waitlist x
                        where x.confirmed_at is not null group by 1) s2))
  into v_waitlist
  from public.waitlist w;

  -- Onboarding-Trichter über alle Konten (jede Stufe schließt die vorige nicht zwingend ein; gezählt wird je Stufe)
  with base as (
    select a.user_id from app.accounts a
  ), s as (
    select
      count(*) as konten,
      count(*) filter (where exists (select 1 from app.account_invitations i where i.user_id = b.user_id and i.accepted_at is not null)) as angemeldet,
      count(*) filter (where (select coalesce(bool_and(app.has_consent(b.user_id, x)), false) from unnest(app.required_consents()) x)) as einwilligungen,
      count(*) filter (where exists (select 1 from private.account_facts f where f.user_id = b.user_id)) as angaben,
      count(*) filter (where exists (select 1 from sensitive.profile_identity p where p.user_id = b.user_id)) as identitaet,
      count(*) filter (where app.is_verified(b.user_id)) as ausweis,
      count(*) filter (where exists (select 1 from app.interview_sessions x where x.user_id = b.user_id
                                       and x.kind = 'erstgespraech' and x.status = 'completed')) as gespraech,
      count(*) filter (where exists (select 1 from app.profile_core p where p.user_id = b.user_id and p.summary_confirmed_at is not null)) as zusammenfassung,
      count(*) filter (where exists (select 1 from app.profile_core p where p.user_id = b.user_id and p.ready_for_matching)) as bereit,
      count(*) filter (where exists (select 1 from app.pairings x where (x.user_a = b.user_id or x.user_b = b.user_id)
                                       and x.status in ('proposed', 'declined', 'expired', 'completed', 'cancelled'))) as vorschlag,
      count(*) filter (where exists (select 1 from app.evenings e where (e.user_a = b.user_id or e.user_b = b.user_id)
                                       and e.state = 'happened')) as abend
    from base b
  )
  select jsonb_build_array(
    jsonb_build_object('stage', 'konten', 'n', ops.kpi_n(s.konten, k)),
    jsonb_build_object('stage', 'angemeldet', 'n', ops.kpi_n(s.angemeldet, k)),
    jsonb_build_object('stage', 'einwilligungen', 'n', ops.kpi_n(s.einwilligungen, k)),
    jsonb_build_object('stage', 'angaben', 'n', ops.kpi_n(s.angaben, k)),
    jsonb_build_object('stage', 'identitaet', 'n', ops.kpi_n(s.identitaet, k)),
    jsonb_build_object('stage', 'ausweis', 'n', ops.kpi_n(s.ausweis, k)),
    jsonb_build_object('stage', 'gespraech', 'n', ops.kpi_n(s.gespraech, k)),
    jsonb_build_object('stage', 'zusammenfassung', 'n', ops.kpi_n(s.zusammenfassung, k)),
    jsonb_build_object('stage', 'bereit', 'n', ops.kpi_n(s.bereit, k)),
    jsonb_build_object('stage', 'vorschlag', 'n', ops.kpi_n(s.vorschlag, k)),
    jsonb_build_object('stage', 'abend', 'n', ops.kpi_n(s.abend, k)))
  into v_funnel from s;

  -- Letzter abgeschlossener oder geprüfter Lauf (Pool, Anteil mit Vorschlag)
  select jsonb_build_object(
    'id', r.id, 'status', r.status, 'started_at', r.started_at, 'finished_at', r.finished_at,
    'pool_size', ops.kpi_n(r.pool_size, k),
    'proposed_pairs', r.proposed_pairs,
    'persons_with_proposal', ops.kpi_n(2 * coalesce(r.proposed_pairs, 0), k),
    'matched_share', case when coalesce(r.pool_size, 0) >= k and 2 * coalesce(r.proposed_pairs, 0) >= k
                            and r.pool_size - 2 * coalesce(r.proposed_pairs, 0) >= k
                          then round(2.0 * r.proposed_pairs / r.pool_size, 3) end,
    'cost_eur', r.cost_eur,
    'runtime_seconds', round(extract(epoch from (r.finished_at - r.started_at))::numeric, 1))
  into v_last_run
  from app.match_runs r
  where r.status in ('review', 'approved', 'partially_approved', 'cancelled') and r.started_at is not null
  order by coalesce(r.finished_at, r.created_at) desc limit 1;

  select jsonb_build_object(
    'count', count(*),
    'cost_eur_total', round(coalesce(sum(r.cost_eur), 0), 2),
    'cost_eur_avg', round(avg(r.cost_eur), 2),
    'cost_eur_per_proposal', round(sum(r.cost_eur) / nullif(sum(r.proposed_pairs), 0), 3))
  into v_runs
  from app.match_runs r where r.status in ('review', 'approved', 'partially_approved', 'cancelled') and r.started_at is not null;

  -- Abende: Ausgang (Verteilung, k-anonym)
  select jsonb_build_object(
    'total', ops.kpi_n(count(*), k),
    'by_state', ops.kpi_cells(coalesce((select jsonb_object_agg(x.state, x.n) from (
        select e2.state, count(*) as n from app.evenings e2 group by e2.state) x), '{}'::jsonb), k),
    'reached_confirmed', ops.kpi_n(count(*) filter (where e.confirmed_at is not null), k))
  into v_evenings
  from app.evenings e;

  -- Rückmeldungen (nur stattgefundene Abende), Mittelwerte erst ab k Rückmeldungen
  select jsonb_build_object(
    'count', ops.kpi_n(count(*), k),
    'match_quality_avg', case when count(f.match_quality) >= k then round(avg(f.match_quality), 2) end,
    'venue_rating_avg', case when count(f.venue_rating) >= k then round(avg(f.venue_rating), 2) end,
    'would_meet_again', ops.kpi_cells(jsonb_build_object(
        'ja', count(*) filter (where f.would_meet_again = 'ja'),
        'vielleicht', count(*) filter (where f.would_meet_again = 'vielleicht'),
        'nein', count(*) filter (where f.would_meet_again = 'nein')), k),
    'felt_unsafe', ops.kpi_n(count(*) filter (where f.felt_safe is false), k),
    'contact_released', ops.kpi_n((select count(distinct c.evening_id) from app.contact_shares c where c.released_at is not null), k))
  into v_feedback
  from app.feedback f join app.evenings e on e.id = f.evening_id and e.state = 'happened';

  -- Kosten je Gespräch und je Gesprächsstunde (ops.session_costs, Summe je Sitzung)
  with per_session as (
    select c.session_id, sum(c.amount_eur) as eur, sum(c.minutes) as minutes, max(c.latency_ms_p90) as p90
    from ops.session_costs c group by c.session_id
  )
  select jsonb_build_object(
    'sessions', count(*),
    'eur_total', round(coalesce(sum(ps.eur), 0), 2),
    'eur_per_session_median', round((percentile_cont(0.5) within group (order by ps.eur))::numeric, 3),
    'eur_per_session_p90', round((percentile_cont(0.9) within group (order by ps.eur))::numeric, 3),
    'eur_per_hour', round(sum(ps.eur) / nullif(sum(ps.minutes), 0) * 60, 2),
    'target_eur_per_hour', ops.setting_num('voice.target_cost_eur_per_hour'),
    'latency_p90_median_ms', round((percentile_cont(0.5) within group (order by ps.p90))::numeric, 0))
  into v_costs
  from per_session ps;

  -- Sicherheit: 24-Stunden-Ziel (Anteil entschieden oder in Prüfung vor der Frist), k-anonym
  select jsonb_build_object(
    'reports_total', ops.kpi_n(count(*), k),
    'decided', ops.kpi_n(count(*) filter (where r.resolved_at is not null), k),
    'decided_in_time', ops.kpi_n(count(*) filter (where r.resolved_at is not null and r.resolved_at <= r.due_at), k),
    'in_time_share', case when count(*) filter (where r.resolved_at is not null) >= k
                          then round((count(*) filter (where r.resolved_at is not null and r.resolved_at <= r.due_at))::numeric
                                     / (count(*) filter (where r.resolved_at is not null)), 2) end,
    'median_hours_to_decision', case when count(*) filter (where r.resolved_at is not null) >= k
      then round((percentile_cont(0.5) within group (order by extract(epoch from r.resolved_at - r.created_at) / 3600)
                  filter (where r.resolved_at is not null))::numeric, 1) end)
  into v_safety
  from safety.reports r;

  -- Mitgliedschaft: Bestand je Status (k-anonym)
  select jsonb_build_object(
    'by_status', ops.kpi_cells(coalesce((select jsonb_object_agg(x.status, x.n) from (
        select m.status, count(*) as n from billing.memberships m group by m.status) x), '{}'::jsonb), k),
    'by_tier_active', ops.kpi_cells(coalesce((select jsonb_object_agg(x.tier, x.n) from (
        select m.tier, count(*) as n from billing.memberships m
        where m.status in ('active', 'cancelled') and m.tier is not null group by m.tier) x), '{}'::jsonb), k))
  into v_membership;

  perform ops.audit('kpi.viewed', null, null, '{}'::jsonb);
  return jsonb_build_object(
    'generated_at', v_now, 'k', k,
    'waitlist', v_waitlist,
    'funnel', v_funnel,
    'last_run', v_last_run,
    'runs', v_runs,
    'evenings', v_evenings,
    'feedback', v_feedback,
    'costs', v_costs,
    'safety', v_safety,
    'membership', v_membership);
end;
$$;
comment on function api.admin_kpis() is 'Admin: Kennzahlen nach docs/KENNZAHLEN.md, nur Summen, Zellen unter k als null (Anzeige „< k“).';

-- ---------------------------------------------------------------------------
-- 3. Warteliste: bestätigte Einträge je Gruppe in der Reihenfolge des Platzes (für „ins Konto einladen“)
-- ---------------------------------------------------------------------------
create or replace function api.admin_waitlist_entries(p_region_group text default 'westmecklenburg',
  p_include_invited boolean default false, p_limit integer default 50)
returns table (id uuid, place integer, first_name text, email text, region text, postal_code text, source text,
               confirmed_at timestamptz, is_founding_member boolean, invited_to_app_at timestamptz, bonus_steps integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  if p_region_group is null or p_region_group not in ('westmecklenburg', 'hamburg', 'luebeck', 'rostock', 'anderswo') then
    raise exception 'Unbekannte Gruppe' using errcode = '22023', hint = 'invalid_region_group';
  end if;
  perform ops.audit('waitlist.entries_viewed', 'public.waitlist', null, jsonb_build_object('region_group', p_region_group));
  return query
    with ranked as (
      select w.id as wid, w.first_name as wfirst, w.email::text as wemail, w.region as wregion, w.postal_code as wplz,
             w.source as wsource, w.confirmed_at as wconfirmed, w.is_founding_member as wfounding,
             w.invited_to_app_at as winvited, w.bonus_steps as wbonus,
             greatest(1, row_number() over (
               order by w.base_number - ops.setting_int('waitlist.bonus_places') * w.bonus_steps, w.confirmed_at, w.base_number))::integer as wplace
      from public.waitlist w
      where w.confirmed_at is not null and w.region_group = p_region_group
    )
    select r.wid, r.wplace, r.wfirst, r.wemail, r.wregion, r.wplz, r.wsource, r.wconfirmed, r.wfounding, r.winvited, r.wbonus
    from ranked r
    where coalesce(p_include_invited, false) or r.winvited is null
    order by r.wplace
    limit least(greatest(coalesce(p_limit, 50), 1), 500);
end;
$$;
comment on function api.admin_waitlist_entries(text, boolean, integer) is
  'Admin: bestätigte Einträge einer Gruppe nach Platz (wie app.waitlist_place), standardmäßig ohne schon Eingeladene. Im Audit.';

-- ---------------------------------------------------------------------------
-- 4. Abende, deren Ergebnis Benn klären muss
-- ---------------------------------------------------------------------------
create or replace function api.admin_evenings_to_resolve()
returns table (evening_id uuid, starts_at timestamptz, venue_name text, venue_city text,
               a_user_id uuid, a_name text, b_user_id uuid, b_name text,
               reasons text[], feedback jsonb, open_reports integer, flag_ids uuid[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := app.now();
begin
  perform app.require_admin();
  perform ops.audit('evening.resolve_list_viewed', 'app.evenings', null, '{}'::jsonb);
  return query
  select e.id, e.starts_at, v.name, v.city,
         e.user_a, coalesce(pa.display_name, fa.first_name, 'Person A'),
         e.user_b, coalesce(pb.display_name, fb.first_name, 'Person B'),
         array_remove(array[
           case when exists (select 1 from safety.safety_flags f where f.kind = 'no_show_bestritten' and f.reviewed_at is null
                               and f.details ->> 'evening_id' = e.id::text) then 'bestritten' end,
           case when exists (select 1 from safety.reports r where r.evening_id = e.id and r.status in ('open', 'in_review')) then 'meldung' end,
           case when e.starts_at < v_now - interval '48 hours' then 'ueberfaellig' end], null),
         coalesce((select jsonb_agg(jsonb_build_object('user_id', fb2.user_id, 'attended', fb2.attended,
                     'other_attended', fb2.other_attended, 'at', fb2.created_at) order by fb2.created_at)
                   from app.feedback fb2 where fb2.evening_id = e.id), '[]'::jsonb),
         (select count(*)::integer from safety.reports r where r.evening_id = e.id and r.status in ('open', 'in_review')),
         coalesce((select array_agg(f.id) from safety.safety_flags f where f.kind = 'no_show_bestritten' and f.reviewed_at is null
                     and f.details ->> 'evening_id' = e.id::text), '{}')
  from app.evenings e
  left join app.venues v on v.id = e.venue_id
  left join app.profile_core pa on pa.user_id = e.user_a
  left join app.profile_core pb on pb.user_id = e.user_b
  left join private.account_facts fa on fa.user_id = e.user_a
  left join private.account_facts fb on fb.user_id = e.user_b
  where e.state = 'confirmed' and e.starts_at < v_now
    and (e.starts_at < v_now - interval '48 hours'
         or exists (select 1 from safety.safety_flags f where f.kind = 'no_show_bestritten' and f.reviewed_at is null
                      and f.details ->> 'evening_id' = e.id::text)
         or exists (select 1 from safety.reports r where r.evening_id = e.id and r.status in ('open', 'in_review')))
  order by e.starts_at;
end;
$$;
comment on function api.admin_evenings_to_resolve() is
  'Admin: bestätigte, vergangene Abende ohne automatisches Ergebnis (bestritten, offene Meldung, über 48 h). Vornamen, keine Notizen.';

-- ---------------------------------------------------------------------------
-- 5. Zeiträume der Zeitenabfrage (nur Zählungen)
-- ---------------------------------------------------------------------------
create or replace function api.admin_availability_periods()
returns table (id uuid, starts_on date, ends_on date, ask_at timestamptz, answer_until timestamptz,
               people_with_windows integer, runs jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  return query
  select p.id, p.starts_on, p.ends_on, p.ask_at, p.answer_until,
         (select count(distinct w.user_id)::integer from app.availability_windows w where w.period_id = p.id),
         coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'status', r.status) order by r.created_at)
                   from app.match_runs r where r.period_id = p.id), '[]'::jsonb)
  from app.availability_periods p
  order by p.starts_on desc
  limit 30;
end;
$$;
comment on function api.admin_availability_periods() is 'Admin: Zeiträume mit Zahl der Personen, die Zeiten eingetragen haben, und den Läufen.';

-- ---------------------------------------------------------------------------
-- 6. Terminvorschläge je Vorschlag eines Laufs (Vorschau vor der Freigabe, danach die des Abends)
-- ---------------------------------------------------------------------------
create or replace function api.admin_pairing_times(p_run_id uuid)
returns table (pairing_id uuid, times jsonb, preview boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  return query
  select pa.id,
         case when e.id is not null then e.proposed_times
              when pa.status = 'pending_review' then app.pairing_candidate_times(pa.id, ops.setting_int('matching.proposed_times_count'))
              else '[]'::jsonb end,
         e.id is null and pa.status = 'pending_review'
  from app.pairings pa
  left join app.evenings e on e.pairing_id = pa.id
  where pa.run_id = p_run_id;
end;
$$;
comment on function api.admin_pairing_times(uuid) is
  'Admin: Terminvorschläge je Vorschlag. Vor der Freigabe eine Vorschau (dieselbe Regel wie bei der Freigabe), danach die des Abends.';

-- ---------------------------------------------------------------------------
-- 7. Gespräche einer Person mit offenem Sicherheitsfall (nur Metadaten, kein Inhalt).
--    Das Transkript selbst liefert api.admin_safety_transcript(p_session_id, p_reason) (Bereich Härtung).
-- ---------------------------------------------------------------------------
create or replace function api.admin_case_sessions(p_user uuid)
returns table (session_id uuid, kind text, mode text, status text, started_at timestamptz, ended_at timestamptz,
               end_reason text, safety_flagged boolean, has_transcript boolean, transcript_delete_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  if p_user is null or not (
       exists (select 1 from safety.safety_flags f where f.user_id = p_user and f.reviewed_at is null)
    or exists (select 1 from safety.reports r where r.reported = p_user and r.status in ('open', 'in_review'))) then
    raise exception 'Kein offener Sicherheitsfall zu dieser Person' using errcode = '42501', hint = 'no_safety_case';
  end if;
  perform ops.audit('safety.case_sessions_viewed', 'app.interview_sessions', p_user::text, '{}'::jsonb);
  return query
  select s.id, s.kind, s.mode, s.status, s.started_at, s.ended_at, s.end_reason, s.safety_flagged,
         t.id is not null, t.delete_at
  from app.interview_sessions s
  left join app.interview_transcripts t on t.session_id = s.id
  where s.user_id = p_user
  order by s.created_at desc
  limit 20;
end;
$$;
comment on function api.admin_case_sessions(uuid) is
  'Admin: Gespräche (nur Metadaten) einer Person, zu der ein offener Hinweis oder eine offene Meldung besteht. Im Audit.';

-- ---------------------------------------------------------------------------
-- 8. Fund aus der Oberfläche: PostgREST führt STABLE-Funktionen in einer schreibgeschützten Transaktion aus
--    („cannot execute INSERT in a read-only transaction“). Diese beiden schreiben ins Audit-Protokoll und
--    müssen deshalb VOLATILE sein (in pgTAP fiel das nicht auf, dort ist die Transaktion beschreibbar).
-- ---------------------------------------------------------------------------
alter function api.admin_report(uuid) volatile;
alter function api.admin_police_report_template(uuid) volatile;

-- ---------------------------------------------------------------------------
-- Rechte: nur angemeldete Personen dürfen aufrufen; jede Funktion prüft selbst app.is_admin() (aal2).
-- ---------------------------------------------------------------------------
revoke all on function api.admin_today(), api.admin_kpis(), api.admin_waitlist_entries(text, boolean, integer),
  api.admin_evenings_to_resolve(), api.admin_availability_periods(), api.admin_pairing_times(uuid),
  api.admin_case_sessions(uuid) from public, anon;
grant execute on function api.admin_today(), api.admin_kpis(), api.admin_waitlist_entries(text, boolean, integer),
  api.admin_evenings_to_resolve(), api.admin_availability_periods(), api.admin_pairing_times(uuid),
  api.admin_case_sessions(uuid) to authenticated;
