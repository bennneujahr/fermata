-- Fermata · M6 Mitgliedschaft, Teil 3: Kündigungsknopf (§ 312k BGB) und Widerrufsbutton (§ 356a BGB).
-- Die Edge Functions billing-cancel und billing-withdraw rufen diese Funktionen auf, sprechen mit Stripe
-- und schicken die Eingangsbestätigung. Die Erklärung wird zuerst gespeichert (Zeitpunkt des Eingangs),
-- danach wird sie ausgeführt.

-- ---------------------------------------------------------------------------
-- Anfragen ohne Anmeldung: Formular → Mail mit Bestätigungslink → Ausführung.
-- ---------------------------------------------------------------------------
create table billing.contract_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('cancel', 'withdraw')),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  details jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null,
  expires_at timestamptz not null,
  confirmed_at timestamptz,
  contract_action_id uuid references billing.contract_actions (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table billing.contract_requests is
  'Kündigung oder Widerruf ohne Anmeldung: Eingang des Formulars (requested_at) und Bestätigung über den Mail-Link. Token nur als Hash.';
create index contract_requests_user_idx on billing.contract_requests (user_id, requested_at desc);
alter table billing.contract_requests enable row level security;

-- ---------------------------------------------------------------------------
-- Kündigung
-- ---------------------------------------------------------------------------
create or replace function billing.cancellation_preview(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m billing.memberships;
  p billing.membership_periods;
  f record;
  email text;
  effective timestamptz;
  possible boolean;
  reason text;
begin
  select * into m from billing.memberships where user_id = p_user;
  if m.current_period_id is not null then
    select * into p from billing.membership_periods where id = m.current_period_id;
  end if;
  select af.first_name, af.last_name into f from private.account_facts af where af.user_id = p_user;
  select u.email into email from auth.users u where u.id = p_user;
  if m.user_id is null or m.status in ('free', 'ended', 'withdrawn') or m.contract_number is null then
    possible := false; reason := 'no_contract';
  elsif m.status = 'cancelled' then
    possible := false; reason := 'already_cancelled'; effective := m.cancel_at;
  else
    possible := true;
    effective := case when m.status = 'pending' or p.id is null then app.now() else coalesce(p.extended_until, p.ends_at) end;
  end if;
  return jsonb_build_object(
    'possible', possible, 'reason', reason,
    'contract_number', m.contract_number, 'tier', m.tier,
    'tier_name', ops.setting('billing.tiers') -> m.tier ->> 'name',
    'status', m.status, 'effective_at', effective, 'immediate', m.status = 'pending' or (possible and p.id is null),
    'name', nullif(trim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, '')), ''),
    'email', email,
    'kinds', jsonb_build_array('ordentlich', 'ausserordentlich'),
    'button_label', 'Jetzt kündigen');
end;
$$;

-- Kündigung speichern. p_details: {kind, reason?, name, contact_email, channel, requested_at?}
create or replace function billing.record_cancellation(p_user uuid, p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  pv jsonb := billing.cancellation_preview(p_user);
  m billing.memberships;
  kind text := coalesce(p_details ->> 'kind', 'ordentlich');
  received timestamptz := coalesce((p_details ->> 'requested_at')::timestamptz, app.now());
  effective timestamptz;
  immediate boolean;
  action_id uuid;
begin
  if not (pv ->> 'possible')::boolean then
    raise exception 'Für dieses Konto gibt es keinen kündbaren Vertrag.' using errcode = 'P0001', hint = coalesce(pv ->> 'reason', 'no_contract');
  end if;
  if kind not in ('ordentlich', 'ausserordentlich') then
    raise exception 'Art der Kündigung: ordentlich oder ausserordentlich' using errcode = '22023', hint = 'invalid_kind';
  end if;
  if kind = 'ausserordentlich' and length(trim(coalesce(p_details ->> 'reason', ''))) < 3 then
    raise exception 'Bitte nennen Sie bei einer außerordentlichen Kündigung den Grund.' using errcode = '22023', hint = 'reason_required';
  end if;
  select * into m from billing.memberships where user_id = p_user for update;
  effective := (pv ->> 'effective_at')::timestamptz;
  immediate := coalesce((pv ->> 'immediate')::boolean, false);
  insert into billing.contract_actions (user_id, kind, at, details, effective_at)
  values (p_user, 'cancel', app.now(), jsonb_build_object(
      'contract_number', m.contract_number,
      'kind', kind,
      'reason', nullif(trim(coalesce(p_details ->> 'reason', '')), ''),
      'name', nullif(trim(coalesce(p_details ->> 'name', '')), ''),
      'contact_email', coalesce(nullif(trim(coalesce(p_details ->> 'contact_email', '')), ''), pv ->> 'email'),
      'channel', coalesce(p_details ->> 'channel', 'angemeldet'),
      'received_at', received,
      'effective_at', effective,
      'stripe_subscription_id', m.stripe_subscription_id),
    effective)
  returning id into action_id;
  update billing.memberships set
    status = case when immediate then 'ended' else 'cancelled' end,
    cancelled_at = app.now(), cancel_at = effective
  where user_id = p_user;
  if immediate then
    perform billing.expire_period_grants(p_user, 'Kündigung');
  end if;
  perform ops.audit('billing.cancel', 'billing.contract_actions', action_id::text, jsonb_build_object('kind', kind, 'immediate', immediate));
  return jsonb_build_object('contract_action_id', action_id, 'received_at', received, 'effective_at', effective,
    'immediate', immediate, 'contract_number', m.contract_number, 'stripe_subscription_id', m.stripe_subscription_id,
    'kind', kind);
end;
$$;

-- ---------------------------------------------------------------------------
-- Widerruf mit Wertersatz (Frage B13)
-- ---------------------------------------------------------------------------
create or replace function billing.withdrawal_quote(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m billing.memberships;
  v_until timestamptz;
  paid integer;
  used integer;
  per_evening integer;
  wertersatz integer;
  last_period billing.membership_periods;
  f record;
  email text;
  possible boolean := true;
  reason text;
begin
  select * into m from billing.memberships where user_id = p_user;
  select af.first_name, af.last_name into f from private.account_facts af where af.user_id = p_user;
  select u.email into email from auth.users u where u.id = p_user;
  if m.user_id is null or m.ordered_at is null or m.contract_number is null then
    possible := false; reason := 'no_contract';
  elsif m.status not in ('pending', 'active', 'cancelled', 'past_due') then
    possible := false; reason := case when m.status = 'withdrawn' then 'already_withdrawn' else 'no_contract' end;
  end if;
  v_until := m.ordered_at + make_interval(days => ops.setting_int('billing.withdrawal_days'));
  if possible and app.now() >= v_until then
    possible := false; reason := 'period_over';
  end if;
  select coalesce(sum(mp.amount_cents), 0)::integer into paid
  from billing.membership_periods mp
  where mp.user_id = p_user and mp.contract_number = m.contract_number and mp.stripe_invoice_id is not null;
  -- Genutzte Abende: Nutzungen aus Zuteilungen dieses Vertrags (Gratis-Abend und Gutschriften zählen nicht).
  select count(*)::integer into used
  from billing.evening_ledger u
  join billing.evening_ledger g on g.id = u.source_entry_id
  join billing.membership_periods mp on mp.id = g.period_id
  where u.user_id = p_user and u.kind = 'use' and g.kind = 'period_grant' and mp.contract_number = m.contract_number;
  per_evening := coalesce((ops.setting('billing.withdrawal_value_per_evening_cents') ->> coalesce(m.tier, 'auftakt'))::integer, 0);
  wertersatz := least(paid, used * per_evening);
  select * into last_period from billing.membership_periods mp
  where mp.user_id = p_user and mp.contract_number = m.contract_number and mp.stripe_invoice_id is not null
  order by mp.starts_at desc limit 1;
  return jsonb_build_object(
    'possible', possible, 'reason', reason, 'until', v_until,
    'contract_number', m.contract_number, 'tier', m.tier,
    'tier_name', ops.setting('billing.tiers') -> m.tier ->> 'name',
    'status', m.status,
    'paid_cents', paid, 'evenings_used', used, 'value_per_evening_cents', per_evening,
    'wertersatz_cents', wertersatz, 'refund_cents', greatest(paid - wertersatz, 0),
    'paid_display', billing.format_eur(paid), 'wertersatz_display', billing.format_eur(wertersatz),
    'refund_display', billing.format_eur(greatest(paid - wertersatz, 0)),
    'stripe_invoice_id', last_period.stripe_invoice_id,
    'stripe_payment_intent_id', last_period.stripe_payment_intent_id,
    'stripe_charge_id', last_period.stripe_charge_id,
    'stripe_subscription_id', m.stripe_subscription_id,
    'name', nullif(trim(coalesce(f.first_name, '') || ' ' || coalesce(f.last_name, '')), ''),
    'email', email,
    'button_label', 'Widerruf bestätigen',
    'legal_status', 'ENTWURF');
end;
$$;

-- Widerruf speichern. p_details: {name, contract_number, contact_email, channel, requested_at?}
create or replace function billing.record_withdrawal(p_user uuid, p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q jsonb := billing.withdrawal_quote(p_user);
  received timestamptz := coalesce((p_details ->> 'requested_at')::timestamptz, app.now());
  action_id uuid;
  cancelled integer := 0;
begin
  if not (q ->> 'possible')::boolean then
    raise exception 'Ein Widerruf ist für dieses Konto nicht (mehr) möglich.' using errcode = 'P0001', hint = coalesce(q ->> 'reason', 'no_contract');
  end if;
  if length(trim(coalesce(p_details ->> 'name', ''))) < 2 then
    raise exception 'Bitte geben Sie Ihren Namen an.' using errcode = '22023', hint = 'name_required';
  end if;
  if upper(trim(coalesce(p_details ->> 'contract_number', ''))) <> q ->> 'contract_number' then
    raise exception 'Die Vertragsnummer passt nicht.' using errcode = '22023', hint = 'contract_mismatch';
  end if;
  insert into billing.contract_actions (user_id, kind, at, details, effective_at)
  values (p_user, 'withdraw', app.now(), jsonb_build_object(
      'contract_number', q ->> 'contract_number',
      'name', trim(p_details ->> 'name'),
      'contact_email', coalesce(nullif(trim(coalesce(p_details ->> 'contact_email', '')), ''), q ->> 'email'),
      'channel', coalesce(p_details ->> 'channel', 'angemeldet'),
      'received_at', received,
      'quote', q - 'name' - 'email'),
    app.now())
  returning id into action_id;
  update billing.memberships set status = 'withdrawn', withdrawn_at = app.now(), cancel_at = app.now()
  where user_id = p_user;
  -- Erst offene Abende absagen (Rückgaben), dann die übrigen Zuteilungen verfallen lassen.
  if to_regprocedure('safety.cancel_open_evenings(uuid,text)') is not null then
    execute 'select safety.cancel_open_evenings($1, $2)' into cancelled using p_user, 'widerruf';
  end if;
  perform billing.expire_period_grants(p_user, 'Widerruf');
  perform ops.audit('billing.withdraw', 'billing.contract_actions', action_id::text,
    jsonb_build_object('refund_cents', q -> 'refund_cents', 'wertersatz_cents', q -> 'wertersatz_cents'));
  return q || jsonb_build_object('contract_action_id', action_id, 'received_at', received, 'cancelled_evenings', cancelled);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ohne Anmeldung
-- ---------------------------------------------------------------------------
-- Liefert ein Token, wenn E-Mail und Vertragsnummer zu einem Vertrag passen, sonst null.
-- Die Edge Function antwortet in beiden Fällen gleich (niemand soll erfahren, wer Mitglied ist).
create or replace function billing.create_contract_request(p_kind text, p_email text, p_contract_number text, p_details jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
  token text;
  exp timestamptz;
  recent integer;
  rid uuid;
  ok boolean;
begin
  if p_kind not in ('cancel', 'withdraw') then
    raise exception 'Unbekannte Art' using errcode = '22023', hint = 'invalid_kind';
  end if;
  select m.user_id into uid
  from billing.memberships m join auth.users u on u.id = m.user_id
  where m.contract_number = upper(trim(coalesce(p_contract_number, '')))
    and lower(u.email) = lower(trim(coalesce(p_email, '')));
  if uid is null then
    return null;
  end if;
  ok := case p_kind
    when 'cancel' then (billing.cancellation_preview(uid) ->> 'possible')::boolean
    else (billing.withdrawal_quote(uid) ->> 'possible')::boolean end;
  if not ok then
    return null;
  end if;
  select count(*)::integer into recent from billing.contract_requests r
  where r.user_id = uid and r.requested_at > app.now() - interval '1 hour';
  if recent >= ops.setting_int('billing.contract_requests_per_hour') then
    return null;
  end if;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  exp := app.now() + make_interval(hours => ops.setting_int('billing.contract_link_hours'));
  insert into billing.contract_requests (kind, user_id, token_hash, details, requested_at, expires_at)
  values (p_kind, uid, encode(extensions.digest(token, 'sha256'), 'hex'), coalesce(p_details, '{}'::jsonb), app.now(), exp)
  returning id into rid;
  return jsonb_build_object('request_id', rid, 'token', token, 'user_id', uid, 'requested_at', app.now(), 'expires_at', exp);
end;
$$;

-- Vorschau zum Link (ohne ihn zu verbrauchen), damit die Bestätigungsseite die Angaben zeigen kann.
create or replace function billing.peek_contract_request(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('kind', r.kind, 'requested_at', r.requested_at, 'expires_at', r.expires_at,
    'contract_number', m.contract_number, 'valid', r.confirmed_at is null and r.expires_at > app.now())
  from billing.contract_requests r join billing.memberships m on m.user_id = r.user_id
  where r.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function billing.consume_contract_request(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r billing.contract_requests;
begin
  select * into r from billing.contract_requests
  where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
  for update;
  if not found or r.confirmed_at is not null or r.expires_at <= app.now() then
    raise exception 'Der Link ist nicht mehr gültig.' using errcode = 'P0001', hint = 'invalid_link';
  end if;
  update billing.contract_requests set confirmed_at = app.now() where id = r.id;
  return jsonb_build_object('request_id', r.id, 'kind', r.kind, 'user_id', r.user_id,
    'details', r.details || jsonb_build_object('requested_at', r.requested_at, 'channel', 'ohne_anmeldung'));
end;
$$;

create or replace function billing.link_contract_request(p_request_id uuid, p_action_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$ update billing.contract_requests set contract_action_id = p_action_id where id = p_request_id; $$;
