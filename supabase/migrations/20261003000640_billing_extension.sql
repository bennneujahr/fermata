-- Fermata · M6 Mitgliedschaft, Teil 4: Verlängerungsregel (Frage B12) und Zeitpläne.
-- „Kein Abend“ (Platzhalter-Definition): Im Zeitraum fand kein Abend statt, aus Gründen, die nicht bei der
-- Person liegen. Der Person zugerechnet werden die Ereignisse aus billing.extension_attributable_events.
-- Dann verlängert sich der Zeitraum ohne Zahlung um billing.extension_days Tage; übrige Abende bleiben erhalten.
-- Die Verschiebung des Abrechnungsdatums bei Stripe übernimmt die Edge Function billing-extend (trial_end).

-- Fand im Zeitraum ein Abend statt oder liegt ein Grund bei der Person? true = „kein Abend“ im Sinne der Regel.
create or replace function billing.period_without_evening(p_user uuid, p_from timestamptz, p_to timestamptz)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  attributable jsonb := ops.setting('billing.extension_attributable_events');
begin
  -- Ein Abend fand statt
  if exists (
    select 1 from app.evening_events ev join app.evenings e on e.id = ev.evening_id
    where p_user in (e.user_a, e.user_b) and ev.to_state = 'happened' and ev.at >= p_from and ev.at < p_to
  ) then
    return false;
  end if;
  -- Ein bestätigter Abend steht noch im Zeitraum an
  if exists (
    select 1 from app.evenings e
    where p_user in (e.user_a, e.user_b) and e.state = 'confirmed' and (e.starts_at is null or e.starts_at < p_to)
  ) then
    return false;
  end if;
  -- Ein Grund liegt bei der Person
  if exists (
    select 1 from app.evening_events ev join app.evenings e on e.id = ev.evening_id
    where p_user in (e.user_a, e.user_b) and ev.at >= p_from and ev.at < p_to
      and attributable ? ev.event
      and (
        (ev.event in ('decline', 'cancel_early', 'cancel_late') and ev.actor = p_user)
        or (ev.event = 'no_show' and coalesce(billing.safe_uuid(ev.details ->> 'no_show_user'), e.no_show_user, p_user) = p_user)
        or (ev.event = 'lapse' and (
              ev.from_state = 'proposed'
              or (ev.from_state = 'time_requested' and e.requested_by is distinct from p_user)
              or (ev.from_state = 'time_countered' and e.countered_by is distinct from p_user)))
      )
  ) then
    return false;
  end if;
  return true;
end;
$$;

-- Prüft alle laufenden Zeiträume kurz vor ihrem Ende und verlängert, wo die Regel greift.
create or replace function billing.apply_extension_rule()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  b record;
  rest integer;
  period_end timestamptz;
  new_end timestamptz;
  n integer := 0;
begin
  if not ops.setting_bool('billing.extension_rule_enabled') then
    return 0;
  end if;
  for p in
    select mp.*, m.status as m_status, m.stripe_subscription_id as m_subscription
    from billing.membership_periods mp
    join billing.memberships m on m.user_id = mp.user_id and m.current_period_id = mp.id
    where m.status in ('active', 'cancelled')
      and mp.extension_count < ops.setting_int('billing.extension_max_per_period')
      and coalesce(mp.extended_until, mp.ends_at) > app.now()
      and coalesce(mp.extended_until, mp.ends_at) - make_interval(hours => ops.setting_int('billing.extension_lead_hours')) <= app.now()
    for update of mp skip locked
  loop
    period_end := coalesce(p.extended_until, p.ends_at);
    if not billing.period_without_evening(p.user_id, p.starts_at, period_end) then
      continue;
    end if;
    new_end := period_end + make_interval(days => ops.setting_int('billing.extension_days'));
    perform billing.lock_user(p.user_id);
    -- Übrige Abende dieses Zeitraums in einen neuen Topf mit späterem Verfall übertragen.
    for b in
      select l.id from billing.evening_ledger l
      where l.user_id = p.user_id and l.period_id = p.id and l.kind = 'period_grant'
        and l.source_entry_id is null and l.amount > 0 and (l.expires_at is null or l.expires_at > app.now())
    loop
      rest := billing.bucket_remaining(b.id);
      if rest > 0 then
        insert into billing.evening_ledger (user_id, at, kind, amount, source_entry_id, period_id, note)
        values (p.user_id, app.now(), 'expire', -rest, b.id, p.id, 'Übertrag durch Verlängerung');
        insert into billing.evening_ledger (user_id, at, kind, amount, period_id, expires_at, note)
        values (p.user_id, app.now(), 'period_grant', rest, p.id, new_end, 'Verlängerungsregel: Zeitraum ohne Abend');
      end if;
    end loop;
    update billing.membership_periods set
      extended_by_rule = true, extended_until = new_end, extension_count = extension_count + 1,
      stripe_sync_status = case when p.m_subscription is not null then 'pending' else 'none' end,
      stripe_sync_error = null
    where id = p.id;
    if p.m_status = 'cancelled' then
      update billing.memberships set cancel_at = new_end where user_id = p.user_id;
    end if;
    perform ops.audit('billing.extension', 'billing.membership_periods', p.id::text,
      jsonb_build_object('user_id', p.user_id, 'extended_until', new_end));
    n := n + 1;
  end loop;
  if n > 0 then
    perform billing.invoke_internal('billing-extend');
  end if;
  return n;
end;
$$;
comment on function billing.apply_extension_rule() is 'Verlängerungsregel (Frage B12). Läuft stündlich per pg_cron; Stripe-Seite: billing-extend.';

-- Für billing-extend: offene Verschiebungen bei Stripe und noch nicht verschickte Hinweise.
create or replace function billing.extension_work()
returns table (period_id uuid, user_id uuid, subscription_id text, extended_until timestamptz,
               sync_needed boolean, notify_needed boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select mp.id, mp.user_id, m.stripe_subscription_id, mp.extended_until,
         mp.stripe_sync_status = 'pending', mp.extension_notified_at is null
  from billing.membership_periods mp
  join billing.memberships m on m.user_id = mp.user_id
  where mp.extended_by_rule and (mp.stripe_sync_status = 'pending' or mp.extension_notified_at is null)
    and mp.extended_until > app.now()
  order by mp.extended_until;
$$;

create or replace function billing.mark_extension(p_period_id uuid, p_synced boolean, p_error text default null, p_notified boolean default false)
returns void
language sql
security definer
set search_path = ''
as $$
  update billing.membership_periods set
    stripe_sync_status = case
      when p_synced then 'synced'
      when p_error is not null then 'failed'
      else stripe_sync_status end,
    stripe_synced_at = case when p_synced then app.now() else stripe_synced_at end,
    stripe_sync_error = p_error,
    extension_notified_at = case when p_notified then app.now() else extension_notified_at end
  where id = p_period_id;
$$;

-- ---------------------------------------------------------------------------
-- Zeitpläne (nur wenn pg_cron verfügbar ist)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fermata-billing-extension', '7 * * * *', 'select billing.apply_extension_rule()');
    perform cron.schedule('fermata-billing-expire', '37 * * * *', 'select billing.expire_ledger()');
  end if;
exception when others then
  raise notice 'pg_cron für die Mitgliedschaft nicht eingerichtet: %', sqlerrm;
end
$$;
