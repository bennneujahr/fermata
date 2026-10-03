-- Fermata · Mitgliedschaft, Zeiträume, Kontingent-Buch, Stripe-Ereignisse, Vertragshandlungen
-- PLAN 1 Nr. 8, 3.2 Nr. 11–12, M6.

create table billing.memberships (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tier text check (tier is null or tier in ('auftakt', 'andante', 'loge')),
  status text not null default 'free'
    check (status in ('free', 'pending', 'active', 'cancelled', 'ended', 'past_due', 'withdrawn')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  free_phase_ended_at timestamptz,     -- erster Abend hat stattgefunden
  ordered_at timestamptz,
  current_period_id uuid,
  cancel_at timestamptz,               -- Ende nach Kündigung
  cancelled_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table billing.memberships is 'Mitgliedschaft je Person. Bis einschließlich zum ersten Abend status free ohne Karte.';
create trigger memberships_touch before update on billing.memberships for each row execute function app.touch_updated_at();
alter table billing.memberships enable row level security;
grant select on billing.memberships to authenticated;
create policy memberships_own on billing.memberships for select to authenticated using (user_id = auth.uid() or app.is_admin());
revoke select on billing.memberships from authenticated;
grant select (user_id, tier, status, free_phase_ended_at, ordered_at, current_period_id, cancel_at, cancelled_at, withdrawn_at, created_at)
  on billing.memberships to authenticated;

create table billing.membership_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tier text not null check (tier in ('auftakt', 'andante', 'loge')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  evenings_allowed integer not null check (evenings_allowed >= 0),
  extended_by_rule boolean not null default false,
  extended_until timestamptz,
  stripe_invoice_id text,
  amount_cents integer,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);
comment on table billing.membership_periods is 'Abrechnungszeiträume (4 Wochen). Verlängerungsregel prüft am Ende jedes Zeitraums.';
create index membership_periods_user_idx on billing.membership_periods (user_id, starts_at desc);
alter table billing.membership_periods enable row level security;
grant select on billing.membership_periods to authenticated;
create policy membership_periods_own on billing.membership_periods for select to authenticated using (user_id = auth.uid() or app.is_admin());

-- Kontingent als Buch: verfügbare Abende = Summe der gültigen Zeilen.
create table billing.evening_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in (
    'free_grant',     -- Gratisphase: ein Abend
    'period_grant',   -- Zuteilung je Zeitraum
    'reserve',        -- Abend bestätigt: Abend wird gebunden
    'release',        -- frühe Absage oder Absage des Gegenübers: Bindung zurück
    'use',            -- Abend fand statt (oder späte Absage/Nichterscheinen der Person)
    'credit',         -- Gutschrift (z. B. Gegenüber nicht erschienen)
    'expire',         -- Verfall am Ende des Zeitraums bzw. der Gutschrift
    'adjust'          -- Korrektur durch Admin
  )),
  amount integer not null check (amount <> 0),
  evening_id uuid references app.evenings (id) on delete set null,
  period_id uuid references billing.membership_periods (id) on delete set null,
  expires_at timestamptz,
  note text,
  created_by uuid
);
comment on table billing.evening_ledger is 'Jede Gutschrift, Zuteilung, Nutzung und jeder Verfall ist eine Zeile. Nur anhängen.';
create index evening_ledger_user_idx on billing.evening_ledger (user_id, at);
create trigger evening_ledger_append_only before update on billing.evening_ledger for each row execute function ops.forbid_change();
alter table billing.evening_ledger enable row level security;
grant select on billing.evening_ledger to authenticated;
create policy evening_ledger_own on billing.evening_ledger for select to authenticated using (user_id = auth.uid() or app.is_admin());

create or replace function billing.available_evenings(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(l.amount), 0)::integer
  from billing.evening_ledger l
  where l.user_id = p_user
    and (l.expires_at is null or l.expires_at > app.now() or l.amount < 0);
$$;
comment on function billing.available_evenings(uuid) is 'Verfügbare Abende laut Buch. Verfallene Zuteilungen zählen nicht; Verbrauch zählt immer.';
grant execute on function billing.available_evenings(uuid) to authenticated, service_role, fermata_matcher;

create table billing.stripe_events (
  id text primary key,                 -- Stripe-Ereignis-ID: jedes Ereignis nur einmal verarbeiten
  type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  payload jsonb not null
);
comment on table billing.stripe_events is 'Eingegangene Stripe-Webhooks (idempotent). Keine Kartendaten.';
alter table billing.stripe_events enable row level security;

-- Nachweis für Bestellknopf, Kündigungsknopf (§ 312k BGB) und Widerrufsknopf (§ 356a BGB).
create table billing.contract_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('order', 'cancel', 'withdraw')),
  at timestamptz not null default now(),
  -- Angaben aus dem Formular (z. B. Name, Vertrag, Kontaktweg), ohne Zahlungsdaten
  details jsonb not null default '{}'::jsonb,
  confirmation_sent_at timestamptz,
  confirmation_mail_id text,
  effective_at timestamptz
);
comment on table billing.contract_actions is 'Bestellung, Kündigung, Widerruf mit Zeitstempel und Eingangsbestätigung (dauerhafter Datenträger).';
create index contract_actions_user_idx on billing.contract_actions (user_id, at desc);
create trigger contract_actions_no_update before update of kind, at, details on billing.contract_actions
  for each row execute function ops.forbid_change();
alter table billing.contract_actions enable row level security;
grant select on billing.contract_actions to authenticated;
create policy contract_actions_own on billing.contract_actions for select to authenticated using (user_id = auth.uid() or app.is_admin());

grant select, insert, update, delete on all tables in schema billing to service_role;
grant usage, select on all sequences in schema billing to service_role;
grant usage on schema billing to fermata_matcher;
