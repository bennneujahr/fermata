-- Fermata · Härtung: ausdrückliches Verlangen des Leistungsbeginns vor Ende der Widerrufsfrist (§ 356 Abs. 4,
-- § 357a Abs. 2 BGB). Ohne diese Erklärung schuldet eine Person nach einem Widerruf in der Regel keinen Wertersatz.
-- - Die Bestellübersicht (billing.order_summary, api.billing_order_summary) zeigt den Satz start_request_text und den
--   Verweis withdrawal_policy_url auf die Widerrufsbelehrung (ops.legal_documents, Art widerruf).
-- - billing.record_order verlangt p_start_request = true und speichert Satz und Fassung in den Details der
--   Vertragshandlung „order“ (Nachweis). Die Edge Function billing-checkout lehnt sonst mit 422 start_request_required ab.

insert into ops.app_settings (key, value, description, category, is_public) values
  ('billing.start_request_text',
   '"Ich verlange ausdrücklich, dass Fermata vor Ende der Widerrufsfrist mit der Leistung beginnt. Mir ist bekannt, dass ich bei einem Widerruf Wertersatz für bereits genutzte Abende leisten muss."',
   'ENTWURF für den Anwalt: Erklärung zum Leistungsbeginn vor Ende der Widerrufsfrist (Bestellübersicht, Pflicht beim Bestellen).',
   'mitgliedschaft', true),
  ('billing.start_request_version', '"2026-10-03-entwurf"',
   'Fassung des Satzes billing.start_request_text. Bei jeder Änderung des Satzes neu setzen (Nachweis in contract_actions.details).',
   'mitgliedschaft', true),
  ('billing.withdrawal_policy_url', '"/rechtliches/widerruf"',
   'Pfad der Widerrufsbelehrung in der Web-App (Text aus ops.legal_documents, Art widerruf).', 'mitgliedschaft', true)
on conflict (key) do nothing;

-- Bestellübersicht (ersetzt die Fassung aus 20261003000620). Der Hash der Übersicht deckt den Satz mit ab.
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
    'withdrawal_policy_url', ops.setting_text('billing.withdrawal_policy_url'),
    'start_request_text', ops.setting_text('billing.start_request_text'),
    'start_request_version', ops.setting_text('billing.start_request_version'),
    'extension_rule', case when ops.setting_bool('billing.extension_rule_enabled')
      then 'ENTWURF: Findet in einem Zeitraum aus Gründen, die nicht bei Ihnen liegen, kein Abend statt, verlängert sich der Zeitraum ohne Zahlung um 4 Wochen.'
    end,
    'button_label', billing.order_button_label(),
    'legal_status', 'ENTWURF');
end;
$$;
comment on function billing.order_summary(text) is
  'Bestellübersicht vor dem Bestellknopf, inkl. Erklärung zum Leistungsbeginn (start_request_text) und Verweis auf die Widerrufsbelehrung.';

-- Bestellung speichern: nur mit ausdrücklichem Verlangen des Leistungsbeginns.
-- Die alte Signatur (ohne p_start_request) entfällt, damit niemand ohne Erklärung bestellen kann.
drop function if exists billing.record_order(uuid, text, jsonb, text, text, text);
create or replace function billing.record_order(p_user uuid, p_tier text, p_summary jsonb, p_customer_id text, p_subscription_id text,
  p_channel text default 'web', p_start_request boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_summary jsonb := billing.order_summary(p_tier);
  number text;
  action_id uuid;
  at_time timestamptz := app.now();
begin
  if p_start_request is distinct from true then
    raise exception 'Bitte bestätigen Sie, dass wir vor Ende der Widerrufsfrist beginnen sollen.'
      using errcode = '22023', hint = 'start_request_required';
  end if;
  perform billing.order_precheck(p_user);
  if billing.summary_hash(current_summary) <> billing.summary_hash(p_summary) then
    raise exception 'Die Bestellübersicht hat sich geändert. Bitte laden Sie die Seite neu.'
      using errcode = 'P0001', hint = 'summary_changed';
  end if;
  number := billing.new_contract_number();
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
      'button_label', billing.order_button_label(), 'channel', p_channel, 'stripe_subscription_id', p_subscription_id,
      'start_request', jsonb_build_object(
        'requested', true,
        'text', current_summary ->> 'start_request_text',
        'version', current_summary ->> 'start_request_version',
        'at', at_time)),
    at_time)
  returning id into action_id;
  perform ops.audit('billing.order', 'billing.contract_actions', action_id::text,
    jsonb_build_object('tier', p_tier, 'start_request_version', current_summary ->> 'start_request_version'));
  return jsonb_build_object('contract_action_id', action_id, 'contract_number', number, 'ordered_at', at_time,
    'withdrawal_until', at_time + make_interval(days => ops.setting_int('billing.withdrawal_days')),
    'start_request', jsonb_build_object('text', current_summary ->> 'start_request_text',
                                        'version', current_summary ->> 'start_request_version', 'at', at_time));
end;
$$;
comment on function billing.record_order(uuid, text, jsonb, text, text, text, boolean) is
  'Speichert die Bestellung (Klick auf den Bestellknopf). Verlangt das ausdrückliche Verlangen des Leistungsbeginns (p_start_request).';
revoke execute on function billing.record_order(uuid, text, jsonb, text, text, text, boolean) from public, anon, authenticated;
grant execute on function billing.record_order(uuid, text, jsonb, text, text, text, boolean) to service_role;

-- Angaben für billing-checkout (E-Mail aus Supabase Auth, Stripe-Kennungen). Als security definer, damit die Edge
-- Functions mit der engen Rolle service_role auskommen (service_role darf auth.users nicht lesen, siehe
-- 20261003000907_edge_role.sql).
create or replace function billing.checkout_context(p_user uuid)
returns table (email text, stripe_customer_id text, stripe_subscription_id text, status text, vat_mode text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.email::text, m.stripe_customer_id, m.stripe_subscription_id, m.status, ops.setting_text('landing.vat_mode')
  from auth.users u left join billing.memberships m on m.user_id = u.id
  where u.id = p_user;
$$;
comment on function billing.checkout_context(uuid) is 'Für billing-checkout: E-Mail der Person, Stripe-Kennungen, Status, USt-Modus.';
revoke execute on function billing.checkout_context(uuid) from public, anon, authenticated;
grant execute on function billing.checkout_context(uuid) to service_role;
