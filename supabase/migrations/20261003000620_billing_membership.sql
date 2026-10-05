-- Fermata · M6 Mitgliedschaft, Teil 2: Stufen, Bestellübersicht, Bestellung, Stripe-Ereignisse,
-- Übersicht für die Web-App. PLAN 2.3 Nr. 7.

alter table billing.membership_periods add column contract_number text;
comment on column billing.membership_periods.contract_number is 'Vertrag, zu dem dieser Zeitraum gehört (für Widerruf und Wertersatz).';

-- Beschriftung des Bestellknopfs (§ 312j Abs. 3 BGB). Bewusst keine Einstellung: der Wortlaut ist fest.
create or replace function billing.order_button_label()
returns text
language sql
immutable
set search_path = ''
as $$ select 'Mitgliedschaft zahlungspflichtig abschließen'::text; $$;

create or replace function billing.format_eur(p_cents integer)
returns text
language sql
immutable
set search_path = ''
as $$ select replace(to_char(p_cents / 100.0, 'FM999990.00'), '.', ',') || ' €'; $$;

create or replace function billing.vat_note()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case ops.setting_text('landing.vat_mode')
    when 'kleinunternehmer' then 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.'
    else 'inkl. 19 % USt'
  end;
$$;
comment on function billing.vat_note() is 'Hinweis zur Umsatzsteuer je nach landing.vat_mode (PLATZHALTER, Frage A5).';

-- Eine Stufe mit allen Angaben (Abende in der Testphase der Loge gedeckelt, Frage B11).
create or replace function billing.tier_config(p_tier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t jsonb := ops.setting('billing.tiers') -> p_tier;
  evenings integer;
  orderable boolean := true;
  note text;
begin
  if t is null then
    return null;
  end if;
  evenings := (t ->> 'evenings')::integer;
  if p_tier = 'loge' then
    orderable := ops.setting_bool('billing.loge_in_test_phase');
    if orderable then
      evenings := least(evenings, ops.setting_int('billing.loge_test_phase_evenings'));
      note := format('In der Testphase höchstens %s Abende je 4 Wochen.', evenings);
    else
      note := 'Die Loge ist in der Testphase noch nicht buchbar.';
    end if;
  end if;
  return jsonb_build_object(
    'key', p_tier,
    'name', t ->> 'name',
    'price_cents', (t ->> 'price_cents')::integer,
    'price_display', billing.format_eur((t ->> 'price_cents')::integer),
    'evenings', evenings,
    'period_days', ops.setting_int('billing.period_days'),
    'orderable', orderable,
    'note', note,
    'vat_note', billing.vat_note());
end;
$$;

create or replace function billing.tiers_overview()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(billing.tier_config(k) order by (ops.setting('billing.tiers') -> k ->> 'price_cents')::integer), '[]'::jsonb)
  from jsonb_object_keys(ops.setting('billing.tiers')) as k;
$$;

-- Bestellübersicht, wie sie vor dem Bestellknopf angezeigt wird. Der Hash belegt später, welche Fassung galt.
create or replace function billing.order_summary(p_tier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  t jsonb := billing.tier_config(p_tier);
begin
  if t is null then
    raise exception 'Unbekannte Stufe' using errcode = '22023', hint = 'invalid_tier';
  end if;
  if not (t ->> 'orderable')::boolean then
    raise exception 'Diese Stufe ist zurzeit nicht buchbar.' using errcode = 'P0001', hint = 'tier_not_orderable';
  end if;
  return jsonb_build_object(
    'tier', p_tier,
    'tier_name', t ->> 'name',
    'price_cents', (t ->> 'price_cents')::integer,
    'price_display', t ->> 'price_display',
    'currency', ops.setting_text('billing.currency'),
    'vat_note', t ->> 'vat_note',
    'period_days', (t ->> 'period_days')::integer,
    'period_label', '4 Wochen',
    'evenings_per_period', (t ->> 'evenings')::integer,
    'tier_note', t ->> 'note',
    'renewal', 'Die Mitgliedschaft verlängert sich automatisch um jeweils 4 Wochen, bis Sie kündigen.',
    'cancellation_terms', ops.setting_text('billing.cancellation_terms'),
    'withdrawal_note', ops.setting_text('billing.withdrawal_note'),
    'extension_rule', case when ops.setting_bool('billing.extension_rule_enabled')
      then 'ENTWURF: Findet in einem Zeitraum aus Gründen, die nicht bei Ihnen liegen, kein Abend statt, verlängert sich der Zeitraum ohne Zahlung um 4 Wochen.'
    end,
    'button_label', billing.order_button_label(),
    'legal_status', 'ENTWURF');
end;
$$;

create or replace function billing.summary_hash(p_summary jsonb)
returns text
language sql
immutable
set search_path = ''
as $$ select encode(extensions.digest(convert_to(p_summary::text, 'UTF8'), 'sha256'), 'hex'); $$;

-- Neue Vertragsnummer, gut abzulesen (ohne 0/O, 1/I).
create or replace function billing.new_contract_number()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea;
  s text;
begin
  loop
    bytes := extensions.gen_random_bytes(8);
    s := 'FM-';
    for i in 0..7 loop
      s := s || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
      if i = 3 then s := s || '-'; end if;
    end loop;
    exit when not exists (select 1 from billing.memberships where contract_number = s);
  end loop;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- Bestellung (Aufruf aus billing-checkout beim Klick auf den Bestellknopf)
-- ---------------------------------------------------------------------------
create or replace function billing.order_precheck(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m billing.memberships;
begin
  if safety.is_suspended(p_user) then
    raise exception 'Dieses Konto ist gesperrt.' using errcode = 'P0001', hint = 'suspended';
  end if;
  select * into m from billing.memberships where user_id = p_user;
  if found and m.status in ('active', 'past_due') then
    raise exception 'Sie haben bereits eine laufende Mitgliedschaft.' using errcode = 'P0001', hint = 'already_member';
  end if;
  if found and m.status = 'cancelled' and (m.cancel_at is null or m.cancel_at > app.now()) then
    raise exception 'Ihre gekündigte Mitgliedschaft läuft noch. Eine neue Bestellung ist danach möglich.'
      using errcode = 'P0001', hint = 'already_member';
  end if;
end;
$$;

create or replace function billing.record_order(p_user uuid, p_tier text, p_summary jsonb, p_customer_id text, p_subscription_id text,
  p_channel text default 'web')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_summary jsonb := billing.order_summary(p_tier);
  number text := billing.new_contract_number();
  action_id uuid;
  at_time timestamptz := app.now();
begin
  perform billing.order_precheck(p_user);
  if billing.summary_hash(current_summary) <> billing.summary_hash(p_summary) then
    raise exception 'Die Bestellübersicht hat sich geändert. Bitte laden Sie die Seite neu.'
      using errcode = 'P0001', hint = 'summary_changed';
  end if;
  perform billing.ensure_membership(p_user);
  update billing.memberships set
    tier = p_tier, status = 'pending', ordered_at = at_time, contract_number = number,
    stripe_customer_id = coalesce(p_customer_id, stripe_customer_id),
    stripe_subscription_id = p_subscription_id,
    cancel_at = null, cancelled_at = null, withdrawn_at = null
  where user_id = p_user;
  insert into billing.contract_actions (user_id, kind, at, details, effective_at)
  values (p_user, 'order', at_time, jsonb_build_object(
      'contract_number', number, 'tier', p_tier, 'summary', p_summary, 'summary_hash', billing.summary_hash(p_summary),
      'button_label', billing.order_button_label(), 'channel', p_channel, 'stripe_subscription_id', p_subscription_id),
    at_time)
  returning id into action_id;
  perform ops.audit('billing.order', 'billing.contract_actions', action_id::text, jsonb_build_object('tier', p_tier));
  return jsonb_build_object('contract_action_id', action_id, 'contract_number', number, 'ordered_at', at_time,
    'withdrawal_until', at_time + make_interval(days => ops.setting_int('billing.withdrawal_days')));
end;
$$;

create or replace function billing.mark_confirmation_sent(p_action_id uuid, p_mail_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update billing.contract_actions set confirmation_sent_at = app.now(), confirmation_mail_id = p_mail_id where id = p_action_id;
$$;

create or replace function billing.set_contract_result(p_action_id uuid, p_result jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update billing.contract_actions set result = result || coalesce(p_result, '{}'::jsonb) where id = p_action_id;
$$;

-- ---------------------------------------------------------------------------
-- Stripe-Ereignisse (Aufruf aus stripe-webhook). Idempotent über Rechnungs- bzw. Abo-ID.
-- ---------------------------------------------------------------------------
create or replace function billing.membership_for_stripe(p_subscription_id text, p_customer_id text, p_user uuid default null)
returns billing.memberships
language sql
stable
security definer
set search_path = ''
as $$
  select m.* from billing.memberships m
  where (p_subscription_id is not null and m.stripe_subscription_id = p_subscription_id)
     or (p_customer_id is not null and m.stripe_customer_id = p_customer_id)
     or (p_user is not null and m.user_id = p_user)
  order by (m.stripe_subscription_id = p_subscription_id) desc nulls last
  limit 1;
$$;

create or replace function billing.expire_period_grants(p_user uuid, p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  rest integer;
  n integer := 0;
begin
  for b in
    select l.id from billing.evening_ledger l
    where l.user_id = p_user and l.kind = 'period_grant' and l.source_entry_id is null and l.amount > 0
      and (l.expires_at is null or l.expires_at > app.now())
  loop
    rest := billing.bucket_remaining(b.id);
    if rest > 0 then
      insert into billing.evening_ledger (user_id, at, kind, amount, source_entry_id, note)
      values (p_user, app.now(), 'expire', -rest, b.id, p_note);
      n := n + rest;
    end if;
  end loop;
  return n;
end;
$$;

-- invoice.paid: neuer Zeitraum mit Zuteilung. Rechnungen über 0 € (z. B. bei der Verlängerung) legen keinen Zeitraum an.
create or replace function billing.apply_invoice_paid(
  p_subscription_id text, p_customer_id text, p_invoice_id text,
  p_period_start timestamptz, p_period_end timestamptz, p_amount_cents integer,
  p_payment_intent text default null, p_charge text default null, p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m billing.memberships;
  existing billing.membership_periods;
  t jsonb;
  pid uuid;
  first_period boolean;
begin
  m := billing.membership_for_stripe(p_subscription_id, p_customer_id, p_user);
  if m.user_id is null then
    return jsonb_build_object('handled', false, 'reason', 'unknown_subscription');
  end if;
  select * into existing from billing.membership_periods where stripe_invoice_id = p_invoice_id;
  if found then
    return jsonb_build_object('handled', true, 'duplicate', true, 'user_id', m.user_id, 'period_id', existing.id);
  end if;
  if coalesce(p_amount_cents, 0) <= 0 then
    return jsonb_build_object('handled', true, 'reason', 'zero_amount', 'user_id', m.user_id);
  end if;
  if m.status = 'withdrawn' then
    return jsonb_build_object('handled', false, 'reason', 'withdrawn', 'user_id', m.user_id);
  end if;
  t := billing.tier_config(coalesce(m.tier, 'auftakt'));
  first_period := m.status = 'pending';
  perform billing.lock_user(m.user_id);
  insert into billing.membership_periods (user_id, tier, starts_at, ends_at, evenings_allowed, stripe_invoice_id, amount_cents,
                                          stripe_payment_intent_id, stripe_charge_id, contract_number)
  values (m.user_id, coalesce(m.tier, 'auftakt'), p_period_start, p_period_end, (t ->> 'evenings')::integer, p_invoice_id,
          p_amount_cents, p_payment_intent, p_charge, m.contract_number)
  returning id into pid;
  insert into billing.evening_ledger (user_id, at, kind, amount, period_id, expires_at, note)
  values (m.user_id, app.now(), 'period_grant', (t ->> 'evenings')::integer, pid, p_period_end,
          format('Zuteilung %s', t ->> 'name'));
  update billing.memberships set
    status = case when status = 'cancelled' and cancel_at is not null then 'cancelled' else 'active' end,
    current_period_id = pid,
    stripe_subscription_id = coalesce(stripe_subscription_id, p_subscription_id),
    stripe_customer_id = coalesce(stripe_customer_id, p_customer_id)
  where user_id = m.user_id;
  update app.accounts set tier_view = coalesce(m.tier, 'auftakt') where user_id = m.user_id;
  return jsonb_build_object('handled', true, 'user_id', m.user_id, 'period_id', pid, 'first_period', first_period,
    'tier', m.tier, 'evenings', (t ->> 'evenings')::integer);
end;
$$;

-- invoice.payment_failed: past_due (nur bei laufender Mitgliedschaft); Mail nur beim ersten Fehlschlag je Rechnung.
create or replace function billing.apply_payment_failed(p_subscription_id text, p_customer_id text, p_invoice_id text, p_event_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m billing.memberships;
  earlier boolean;
begin
  m := billing.membership_for_stripe(p_subscription_id, p_customer_id);
  if m.user_id is null then
    return jsonb_build_object('handled', false, 'reason', 'unknown_subscription');
  end if;
  if m.status in ('active', 'cancelled') then
    update billing.memberships set status = 'past_due' where user_id = m.user_id;
  end if;
  select exists (
    select 1 from billing.stripe_events se
    where se.type = 'invoice.payment_failed' and se.id is distinct from p_event_id
      and se.payload -> 'data' -> 'object' ->> 'id' = p_invoice_id and se.processed_at is not null
  ) into earlier;
  return jsonb_build_object('handled', true, 'user_id', m.user_id, 'notify', not earlier,
    'status', case when m.status in ('active', 'cancelled') then 'past_due' else m.status end);
end;
$$;

-- customer.subscription.updated / .deleted: Status abgleichen.
create or replace function billing.apply_subscription_state(
  p_subscription_id text, p_customer_id text, p_status text, p_cancel_at_period_end boolean,
  p_cancel_at timestamptz, p_current_period_end timestamptz, p_deleted boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m billing.memberships;
  paid_before boolean;
  new_status text;
begin
  m := billing.membership_for_stripe(p_subscription_id, p_customer_id);
  if m.user_id is null or (m.stripe_subscription_id is not null and m.stripe_subscription_id <> p_subscription_id) then
    return jsonb_build_object('handled', false, 'reason', 'unknown_or_old_subscription');
  end if;
  if m.status = 'withdrawn' then
    return jsonb_build_object('handled', true, 'status', 'withdrawn', 'user_id', m.user_id);
  end if;
  paid_before := exists (select 1 from billing.membership_periods mp where mp.user_id = m.user_id and mp.stripe_invoice_id is not null);

  if p_deleted or p_status in ('canceled', 'incomplete_expired') then
    new_status := case when paid_before then 'ended' else 'free' end;
    update billing.memberships set status = new_status, cancel_at = coalesce(cancel_at, app.now()),
      stripe_subscription_id = case when new_status = 'free' then null else stripe_subscription_id end
    where user_id = m.user_id;
    perform billing.expire_period_grants(m.user_id, 'Mitgliedschaft beendet');
    update app.accounts set tier_view = 'auftakt' where user_id = m.user_id;
  elsif p_status in ('past_due', 'unpaid') then
    new_status := 'past_due';
    update billing.memberships set status = new_status where user_id = m.user_id;
  elsif p_status = 'incomplete' then
    new_status := 'pending';
    update billing.memberships set status = new_status where user_id = m.user_id;
  elsif p_status in ('active', 'trialing') then
    if coalesce(p_cancel_at_period_end, false) or p_cancel_at is not null then
      new_status := 'cancelled';
      update billing.memberships set status = new_status,
        cancel_at = coalesce(p_cancel_at, p_current_period_end, cancel_at),
        cancelled_at = coalesce(cancelled_at, app.now())
      where user_id = m.user_id;
    else
      new_status := 'active';
      update billing.memberships set status = new_status, cancel_at = null, cancelled_at = null where user_id = m.user_id;
    end if;
  else
    new_status := m.status;
  end if;
  return jsonb_build_object('handled', true, 'user_id', m.user_id, 'status', new_status, 'previous_status', m.status);
end;
$$;

-- Ein Stripe-Ereignis annehmen (idempotent). Liefert false, wenn es schon verarbeitet wurde.
create or replace function billing.accept_stripe_event(p_id text, p_type text, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  done timestamptz;
begin
  insert into billing.stripe_events (id, type, payload) values (p_id, p_type, p_payload)
  on conflict (id) do nothing;
  select processed_at into done from billing.stripe_events where id = p_id;
  return done is null;
end;
$$;

create or replace function billing.finish_stripe_event(p_id text, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update billing.stripe_events set processed_at = case when p_error is null then app.now() end, error = p_error where id = p_id;
$$;

-- ---------------------------------------------------------------------------
-- Übersicht für die Web-App
-- ---------------------------------------------------------------------------
create or replace function billing.overview_for(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m billing.memberships;
  p billing.membership_periods;
  t jsonb;
  withdraw_until timestamptz;
  free_phase boolean;
begin
  select * into m from billing.memberships where user_id = p_user;
  if m.current_period_id is not null then
    select * into p from billing.membership_periods where id = m.current_period_id;
  end if;
  t := case when m.tier is not null then billing.tier_config(m.tier) end;
  withdraw_until := case when m.ordered_at is not null then m.ordered_at + make_interval(days => ops.setting_int('billing.withdrawal_days')) end;
  free_phase := ops.setting_bool('billing.free_until_first_evening') and (m.user_id is null or m.free_phase_ended_at is null);
  return jsonb_build_object(
    'status', coalesce(m.status, 'free'),
    'tier', m.tier,
    'tier_name', t ->> 'name',
    'contract_number', m.contract_number,
    'ordered_at', m.ordered_at,
    'cancelled_at', m.cancelled_at,
    'cancel_at', m.cancel_at,
    'withdrawn_at', m.withdrawn_at,
    'free_phase', jsonb_build_object('active', free_phase, 'ended_at', m.free_phase_ended_at),
    'current_period', case when p.id is not null then jsonb_build_object(
      'starts_at', p.starts_at, 'ends_at', p.ends_at, 'extended_until', p.extended_until,
      'extended_by_rule', p.extended_by_rule, 'evenings_allowed', p.evenings_allowed) end,
    'available_evenings', billing.available_evenings(p_user),
    'reserved_evenings', billing.reserved_evenings(p_user),
    'can_receive_proposal', billing.can_receive_proposal(p_user),
    'withdrawal', jsonb_build_object(
      'possible', m.status in ('pending', 'active', 'cancelled', 'past_due') and withdraw_until is not null and app.now() < withdraw_until,
      'until', withdraw_until),
    'cancellation', jsonb_build_object(
      'possible', coalesce(m.status in ('pending', 'active', 'past_due'), false),
      'effective_at', case when m.status = 'cancelled' then m.cancel_at else coalesce(p.extended_until, p.ends_at) end),
    'tiers', billing.tiers_overview(),
    'vat_note', billing.vat_note(),
    'order_button_label', billing.order_button_label(),
    'cancel_entry_label', 'Verträge hier kündigen',
    'withdraw_entry_label', 'Vertrag widerrufen');
end;
$$;

create or replace function api.billing_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  return billing.overview_for(uid);
end;
$$;
grant execute on function api.billing_overview() to authenticated;

-- Bestellübersicht vor dem Bestellknopf (auch über billing-checkout action=summary erhältlich).
create or replace function api.billing_order_summary(p_tier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  s := billing.order_summary(p_tier);
  return s || jsonb_build_object('summary_hash', billing.summary_hash(s));
end;
$$;
grant execute on function api.billing_order_summary(text) to authenticated;

-- Öffentlich: Stufen und Preise (Landingpage, ohne Anmeldung)
create or replace function api.billing_tiers()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$ select billing.tiers_overview(); $$;
grant execute on function api.billing_tiers() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
create or replace function api.admin_contract_actions(p_kind text default null, p_limit integer default 100)
returns table (id uuid, user_id uuid, kind text, at timestamptz, details jsonb, result jsonb,
               confirmation_sent_at timestamptz, effective_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Nur für Admins mit Zwei-Faktor-Anmeldung' using errcode = '42501', hint = 'admin_required';
  end if;
  return query
    select c.id, c.user_id, c.kind, c.at, c.details, c.result, c.confirmation_sent_at, c.effective_at
    from billing.contract_actions c
    where p_kind is null or c.kind = p_kind
    order by c.at desc
    limit greatest(1, least(coalesce(p_limit, 100), 1000));
end;
$$;
grant execute on function api.admin_contract_actions(text, integer) to authenticated;

create or replace function api.admin_ledger_adjust(p_user uuid, p_amount integer, p_note text, p_expires_at timestamptz default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_id bigint;
  new_id bigint;
  b bigint;
begin
  if not app.is_admin() then
    raise exception 'Nur für Admins mit Zwei-Faktor-Anmeldung' using errcode = '42501', hint = 'admin_required';
  end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 20 or p_note is null or length(trim(p_note)) < 3 then
    raise exception 'Betrag (höchstens 20) und Begründung angeben' using errcode = '22023', hint = 'invalid_input';
  end if;
  perform billing.lock_user(p_user);
  if p_amount > 0 then
    -- Gutschrift durch Admin: eigener Topf
    insert into billing.evening_ledger (user_id, at, kind, amount, expires_at, note, created_by)
    values (p_user, app.now(), 'adjust', p_amount, p_expires_at, trim(p_note), auth.uid())
    returning id into first_id;
  else
    if billing.available_evenings(p_user) + p_amount < 0 then
      raise exception 'Das Kontingent darf nicht negativ werden.' using errcode = 'P0001', hint = 'would_be_negative';
    end if;
    -- Abzug: je Abend aus dem zuerst verfallenden Topf
    for i in 1..abs(p_amount) loop
      b := billing.pick_bucket(p_user);
      insert into billing.evening_ledger (user_id, at, kind, amount, source_entry_id, note, created_by)
      values (p_user, app.now(), 'adjust', -1, b, trim(p_note), auth.uid())
      returning id into new_id;
      first_id := coalesce(first_id, new_id);
    end loop;
  end if;
  perform ops.audit('billing.ledger_adjust', 'billing.evening_ledger', first_id::text,
    jsonb_build_object('user_id', p_user, 'amount', p_amount));
  return first_id;
end;
$$;
grant execute on function api.admin_ledger_adjust(uuid, integer, text, timestamptz) to authenticated;
