-- Fermata · M6 Mitgliedschaft, Teil 1: Kontingent-Buch mit Töpfen, Regeln bei Abend-Wechseln,
-- Gratisphase, Freigabe für Vorschläge (für den Auswahl-Job).
-- PLAN 1 Nr. 8, 3.2 Nr. 11–12, M6. Regeln in Klartext: docs/bereiche/mitgliedschaft.md.
--
-- Hinweis zur Reihenfolge: Diese Datei läuft vor 20261003000700_safety.sql. Funktionen, die
-- safety.* benutzen, sind deshalb in plpgsql geschrieben (Rumpf wird erst beim Aufruf aufgelöst).

-- ---------------------------------------------------------------------------
-- Einstellungen (Platzhalter sind als solche beschrieben, siehe docs/bereiche/mitgliedschaft.md)
-- ---------------------------------------------------------------------------
insert into ops.app_settings (key, value, description, category, is_public) values
  ('billing.withdrawal_days', '14', 'Widerrufsfrist in Tagen ab Bestellung (§ 355 Abs. 2 BGB).', 'mitgliedschaft', true),
  ('billing.withdrawal_value_per_evening_cents', '{"auftakt": 4900, "andante": 7450, "loge": 7475}',
   'PLATZHALTER (Frage B13): Wertersatz je bereits genutztem Abend bei Widerruf, in Cent je Stufe. Mit dem Anwalt bestätigen.', 'mitgliedschaft', false),
  ('billing.credit_on_counterpart_late_cancel', 'false',
   'PLATZHALTER: Bei kurzfristiger Absage des Gegenübers zusätzlich zur Rückgabe eine Gutschrift (+1) vergeben.', 'mitgliedschaft', false),
  ('billing.credit_on_counterpart_no_show', 'false',
   'PLATZHALTER (Frage B9): Wenn das Gegenüber nicht erscheint, zusätzlich zur Rückgabe eine Gutschrift (+1) vergeben.', 'mitgliedschaft', false),
  ('billing.extension_days', '28', 'Verlängerungsregel: so viele Tage ohne Zahlung.', 'mitgliedschaft', false),
  ('billing.extension_lead_hours', '6',
   'Verlängerungsregel: Prüfung so viele Stunden vor Ende des Zeitraums (Stripe bucht am Ende ab, die Verschiebung muss vorher stehen).', 'mitgliedschaft', false),
  ('billing.extension_max_per_period', '1', 'PLATZHALTER (Frage B12): Wie oft sich ein Zeitraum höchstens verlängert.', 'mitgliedschaft', false),
  ('billing.extension_attributable_events', '["decline", "cancel_early", "cancel_late", "no_show", "lapse"]',
   'PLATZHALTER (Frage B12): Abend-Ereignisse, die der Person zugerechnet werden und eine Verlängerung ausschließen („kein Abend aus Gründen, die nicht bei der Person liegen“).', 'mitgliedschaft', false),
  ('billing.contract_link_hours', '24', 'Gültigkeit des Bestätigungslinks für Kündigung oder Widerruf ohne Anmeldung (Stunden).', 'mitgliedschaft', false),
  ('billing.contract_requests_per_hour', '3', 'Höchstens so viele Kündigungs- oder Widerrufsanfragen ohne Anmeldung je Vertrag und Stunde.', 'mitgliedschaft', false),
  ('billing.cancellation_terms',
   '"ENTWURF: Die Mitgliedschaft läuft jeweils 4 Wochen und verlängert sich automatisch um weitere 4 Wochen. Sie können jederzeit zum Ende des laufenden Zeitraums kündigen, ohne Angabe von Gründen, über „Verträge hier kündigen“."',
   'ENTWURF für den Anwalt: Laufzeit- und Kündigungsbedingungen in der Bestellübersicht.', 'mitgliedschaft', true),
  ('billing.withdrawal_note',
   '"ENTWURF: Sie können den Vertrag innerhalb von 14 Tagen ohne Angabe von Gründen widerrufen, über „Vertrag widerrufen“. Haben Sie bereits Abende genutzt, zahlen Sie dafür Wertersatz; den Rest erstatten wir."',
   'ENTWURF für den Anwalt: Kurzer Widerrufshinweis in der Bestellübersicht (die vollständige Belehrung steht in ops.legal_documents, Art widerruf).', 'mitgliedschaft', true),
  ('internal.functions_base_url', 'null',
   'Adresse der Edge Functions für Aufrufe aus der Datenbank (pg_net), z. B. https://<projekt>.supabase.co/functions/v1. null: keine Aufrufe.', 'betrieb', false)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Tabellen ergänzen
-- ---------------------------------------------------------------------------
-- Töpfe: Jede positive Zeile ohne Quelle (Gratis-Abend, Zuteilung, Gutschrift) ist ein Topf mit
-- eigenem Verfall. Jede Bewegung (Bindung, Rückgabe, Nutzung, Verfall) verweist auf ihren Topf.
alter table billing.evening_ledger
  add column source_entry_id bigint references billing.evening_ledger (id) on delete cascade;
comment on column billing.evening_ledger.source_entry_id is
  'Topf, auf den sich diese Bewegung bezieht. null: die Zeile ist selbst ein Topf (positiv) oder eine Pauschalbuchung (negativ).';
create index evening_ledger_source_idx on billing.evening_ledger (source_entry_id) where source_entry_id is not null;
create index evening_ledger_evening_idx on billing.evening_ledger (user_id, evening_id) where evening_id is not null;

alter table billing.memberships add column contract_number text unique;
comment on column billing.memberships.contract_number is 'Vertragsnummer der aktuellen Mitgliedschaft (für Kündigung und Widerruf ohne Anmeldung).';
grant select (contract_number) on billing.memberships to authenticated;

alter table billing.membership_periods
  add column extension_count integer not null default 0,
  add column stripe_sync_status text not null default 'none' check (stripe_sync_status in ('none', 'pending', 'synced', 'failed')),
  add column stripe_synced_at timestamptz,
  add column stripe_sync_error text,
  add column extension_notified_at timestamptz,
  add column stripe_payment_intent_id text,
  add column stripe_charge_id text;
comment on column billing.membership_periods.stripe_sync_status is 'Verlängerungsregel: pending = Verschiebung des Abrechnungsdatums bei Stripe steht noch aus (billing-extend).';
create unique index membership_periods_invoice_uidx on billing.membership_periods (stripe_invoice_id) where stripe_invoice_id is not null;

alter table billing.contract_actions add column result jsonb not null default '{}'::jsonb;
comment on column billing.contract_actions.result is 'Ergebnis der Ausführung (z. B. Stripe-Kündigung, Erstattung). Änderbar; die Erklärung selbst (details) nicht.';

-- ---------------------------------------------------------------------------
-- Hilfsfunktionen
-- ---------------------------------------------------------------------------
create or replace function billing.safe_uuid(p text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p::uuid end;
$$;

create or replace function billing.lock_user(p_user uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended('fermata.ledger:' || p_user::text, 0));
$$;

-- Rest eines Topfs (Betrag plus alle Bewegungen, die auf ihn verweisen).
create or replace function billing.bucket_remaining(p_entry_id bigint)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select (b.amount + coalesce((select sum(m.amount) from billing.evening_ledger m where m.source_entry_id = b.id), 0))::integer
  from billing.evening_ledger b where b.id = p_entry_id;
$$;

-- Verfügbare Abende: Summe der Reste aller nicht verfallenen Töpfe plus Pauschalbuchungen.
-- Ersetzt die erste Fassung aus 20261003000600_billing.sql (gleiche Signatur), weil dort verbrauchte
-- Abende nach dem Verfall eines Topfs doppelt abgezogen würden.
create or replace function billing.available_evenings(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with buckets as (
    select b.expires_at,
           b.amount + coalesce((select sum(m.amount) from billing.evening_ledger m where m.source_entry_id = b.id), 0) as remaining
    from billing.evening_ledger b
    where b.user_id = p_user and b.source_entry_id is null and b.amount > 0
  )
  select (
    coalesce((select sum(remaining) from buckets where expires_at is null or expires_at > app.now()), 0)
    + coalesce((select sum(l.amount) from billing.evening_ledger l
                where l.user_id = p_user and l.source_entry_id is null and l.amount < 0), 0)
  )::integer;
$$;
comment on function billing.available_evenings(uuid) is
  'Verfügbare Abende: Reste der nicht verfallenen Töpfe plus Pauschalbuchungen. Gebundene Abende sind schon abgezogen.';

-- Offene Bindung einer Person für einen Abend (0 oder 1) und ihr Topf.
create or replace function billing.open_reservation(p_user uuid, p_evening uuid, out outstanding integer, out bucket_id bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (-coalesce(sum(l.amount) filter (where l.kind in ('reserve', 'release')), 0))::integer,
    (select r.source_entry_id from billing.evening_ledger r
      where r.user_id = p_user and r.evening_id = p_evening and r.kind = 'reserve' order by r.id desc limit 1)
  from billing.evening_ledger l
  where l.user_id = p_user and l.evening_id = p_evening;
$$;

create or replace function billing.reserved_evenings(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(x.n), 0)::integer from (
    select greatest(-sum(l.amount), 0) as n
    from billing.evening_ledger l
    where l.user_id = p_user and l.evening_id is not null and l.kind in ('reserve', 'release')
    group by l.evening_id
  ) x;
$$;

-- Topf für die nächste Bindung: nicht verfallen, Rest > 0, der zuerst verfallende zuerst.
create or replace function billing.pick_bucket(p_user uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select b.id from billing.evening_ledger b
  where b.user_id = p_user and b.source_entry_id is null and b.amount > 0
    and (b.expires_at is null or b.expires_at > app.now())
    and billing.bucket_remaining(b.id) > 0
  order by b.expires_at asc nulls last, b.id asc
  limit 1;
$$;

create or replace function billing.ensure_membership(p_user uuid)
returns billing.memberships
language plpgsql
security definer
set search_path = ''
as $$
declare
  m billing.memberships;
begin
  insert into billing.memberships (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into m from billing.memberships where user_id = p_user;
  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- Buchungen
-- ---------------------------------------------------------------------------
-- Gutschrift als eigener Topf mit Verfall nach evening.credit_validity_months (Frage B8).
create or replace function billing.ledger_credit(p_user uuid, p_evening uuid, p_note text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  insert into billing.evening_ledger (user_id, at, kind, amount, evening_id, expires_at, note)
  values (p_user, app.now(), 'credit', 1, p_evening,
          app.now() + make_interval(months => ops.setting_int('evening.credit_validity_months')), p_note)
  returning id into new_id;
  return new_id;
end;
$$;

-- Bindung (Abend bestätigt). Lehnt ab, wenn kein Abend verfügbar ist oder die Person gesperrt ist.
create or replace function billing.ledger_reserve(p_user uuid, p_evening uuid, p_actor uuid default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  b bigint;
  new_id bigint;
  who text := case when p_actor is not null and p_actor = p_user then 'self' else 'counterpart' end;
begin
  perform billing.lock_user(p_user);
  select * into r from billing.open_reservation(p_user, p_evening);
  if r.outstanding > 0 then
    return null; -- schon gebunden (idempotent)
  end if;
  if safety.is_suspended(p_user) then
    raise exception 'Der Abend kann nicht bestätigt werden: Ein Konto ist gesperrt.'
      using errcode = 'P0001', hint = 'suspended', detail = who;
  end if;
  b := billing.pick_bucket(p_user);
  if b is null or billing.available_evenings(p_user) < 1 then
    raise exception 'Der Abend kann nicht bestätigt werden: Im Kontingent ist kein Abend frei.'
      using errcode = 'P0001', hint = 'no_evening_available', detail = who;
  end if;
  insert into billing.evening_ledger (user_id, at, kind, amount, evening_id, source_entry_id, note)
  values (p_user, app.now(), 'reserve', -1, p_evening, b, 'Abend bestätigt')
  returning id into new_id;
  return new_id;
end;
$$;

-- Rückgabe einer Bindung. Ist der Topf inzwischen verfallen, wird der Abend als Gutschrift zurückgegeben.
create or replace function billing.ledger_release(p_user uuid, p_evening uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  exp timestamptz;
begin
  perform billing.lock_user(p_user);
  select * into r from billing.open_reservation(p_user, p_evening);
  if r.outstanding <= 0 then
    return false;
  end if;
  insert into billing.evening_ledger (user_id, at, kind, amount, evening_id, source_entry_id, note)
  values (p_user, app.now(), 'release', 1, p_evening, r.bucket_id, p_note);
  select expires_at into exp from billing.evening_ledger where id = r.bucket_id;
  if exp is not null and exp <= app.now() then
    perform billing.ledger_credit(p_user, p_evening, 'Rückgabe nach Ablauf des Zeitraums');
  end if;
  return true;
end;
$$;

-- Nutzung: wandelt die Bindung in eine Nutzung um (Rückgabe +1, Nutzung −1, unterm Strich bleibt −1).
-- Beendet die Gratisphase (die Nutzung ist immer der Person zuzurechnen).
create or replace function billing.ledger_use(p_user uuid, p_evening uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  b bigint;
begin
  perform billing.lock_user(p_user);
  select * into r from billing.open_reservation(p_user, p_evening);
  if r.outstanding > 0 then
    insert into billing.evening_ledger (user_id, at, kind, amount, evening_id, source_entry_id, note)
    values (p_user, app.now(), 'release', 1, p_evening, r.bucket_id, 'Umwandlung in Nutzung');
    insert into billing.evening_ledger (user_id, at, kind, amount, evening_id, source_entry_id, note)
    values (p_user, app.now(), 'use', -1, p_evening, r.bucket_id, p_note);
  elsif not exists (select 1 from billing.evening_ledger where user_id = p_user and evening_id = p_evening and kind = 'use') then
    -- Kein Eintrag zur Bindung (z. B. Abend vor dieser Regel bestätigt): aus einem Topf nutzen, wenn möglich.
    b := billing.pick_bucket(p_user);
    if b is not null then
      insert into billing.evening_ledger (user_id, at, kind, amount, evening_id, source_entry_id, note)
      values (p_user, app.now(), 'use', -1, p_evening, b, p_note);
    else
      perform ops.audit('billing.use_without_contingent', 'app.evenings', p_evening::text, jsonb_build_object('user_id', p_user));
    end if;
  end if;
  perform billing.end_free_phase(p_user);
end;
$$;

-- Gratisphase beenden: erster Abend hat stattgefunden (oder kurzfristige Absage / Nichterscheinen der Person).
-- Ein übriger Gratis-Abend verfällt dann (Gutschriften bleiben).
create or replace function billing.end_free_phase(p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed boolean;
  b record;
  rest integer;
begin
  perform billing.ensure_membership(p_user);
  update billing.memberships set free_phase_ended_at = app.now()
  where user_id = p_user and free_phase_ended_at is null;
  changed := found;
  if changed then
    for b in select l.id from billing.evening_ledger l
             where l.user_id = p_user and l.kind = 'free_grant' and l.source_entry_id is null and l.amount > 0
    loop
      rest := billing.bucket_remaining(b.id);
      if rest > 0 then
        insert into billing.evening_ledger (user_id, at, kind, amount, source_entry_id, note)
        values (p_user, app.now(), 'expire', -rest, b.id, 'Gratisphase beendet');
      end if;
    end loop;
  end if;
  return changed;
end;
$$;

-- ---------------------------------------------------------------------------
-- Regeln bei Zustandswechseln eines Abends (Tabelle in docs/bereiche/mitgliedschaft.md)
-- Hängt an app.evening_events (AFTER INSERT): Jeder Wechsel über app.evening_transition() schreibt dort
-- genau eine Zeile mit Ereignis, Auslöser und Details. So ist bekannt, wer kurzfristig abgesagt hat.
-- Ein Fehler hier (z. B. kein Abend frei) bricht den ganzen Wechsel ab.
-- ---------------------------------------------------------------------------
create or replace function billing.on_evening_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e app.evenings;
  culprit uuid;
  other uuid;
begin
  if new.to_state is null or new.to_state is not distinct from new.from_state then
    return new;
  end if;
  select * into e from app.evenings where id = new.evening_id;
  if not found then
    return new;
  end if;

  if new.to_state = 'confirmed' then
    perform billing.ledger_reserve(e.user_a, e.id, new.actor);
    perform billing.ledger_reserve(e.user_b, e.id, new.actor);

  elsif new.to_state = 'cancelled_early' then
    perform billing.ledger_release(e.user_a, e.id, case when new.event = 'cancel_admin' then 'Absage durch Fermata' else 'Frühe Absage' end);
    perform billing.ledger_release(e.user_b, e.id, case when new.event = 'cancel_admin' then 'Absage durch Fermata' else 'Frühe Absage' end);

  elsif new.to_state = 'cancelled_late' then
    culprit := case
      when new.actor in (e.user_a, e.user_b) then new.actor
      when e.cancelled_by in (e.user_a, e.user_b) then e.cancelled_by
      when billing.safe_uuid(new.details ->> 'cancelled_by') in (e.user_a, e.user_b) then billing.safe_uuid(new.details ->> 'cancelled_by')
    end;
    if culprit is null then
      -- Niemand Bestimmtes (z. B. Lokal sagt ab): beide bekommen ihren Abend zurück.
      perform billing.ledger_release(e.user_a, e.id, 'Absage ohne Verschulden');
      perform billing.ledger_release(e.user_b, e.id, 'Absage ohne Verschulden');
    else
      other := case when culprit = e.user_a then e.user_b else e.user_a end;
      perform billing.ledger_use(culprit, e.id, 'Kurzfristige Absage');
      perform billing.ledger_release(other, e.id, 'Kurzfristige Absage des Gegenübers');
      if ops.setting_bool('billing.credit_on_counterpart_late_cancel') then
        perform billing.ledger_credit(other, e.id, 'Gutschrift: kurzfristige Absage des Gegenübers');
      end if;
    end if;

  elsif new.to_state = 'no_show' then
    culprit := coalesce(
      case when billing.safe_uuid(new.details ->> 'no_show_user') in (e.user_a, e.user_b) then billing.safe_uuid(new.details ->> 'no_show_user') end,
      case when e.no_show_user in (e.user_a, e.user_b) then e.no_show_user end);
    if culprit is null then
      -- Beide nicht erschienen
      perform billing.ledger_use(e.user_a, e.id, 'Nicht erschienen');
      perform billing.ledger_use(e.user_b, e.id, 'Nicht erschienen');
    else
      other := case when culprit = e.user_a then e.user_b else e.user_a end;
      perform billing.ledger_use(culprit, e.id, 'Nicht erschienen');
      perform billing.ledger_release(other, e.id, 'Gegenüber nicht erschienen');
      if ops.setting_bool('billing.credit_on_counterpart_no_show') then
        perform billing.ledger_credit(other, e.id, 'Gutschrift: Gegenüber nicht erschienen');
      end if;
    end if;

  elsif new.to_state = 'happened' then
    perform billing.ledger_use(e.user_a, e.id, 'Abend fand statt');
    perform billing.ledger_use(e.user_b, e.id, 'Abend fand statt');
  end if;
  return new;
end;
$$;
comment on function billing.on_evening_event() is 'Kontingent-Regeln je Zustandswechsel eines Abends (docs/bereiche/mitgliedschaft.md).';

create trigger evening_events_billing_ledger after insert on app.evening_events
  for each row execute function billing.on_evening_event();

-- ---------------------------------------------------------------------------
-- Für M5 (Bestätigung) und M4 (Auswahl)
-- ---------------------------------------------------------------------------
create or replace function billing.assert_evening_available(p_user uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if safety.is_suspended(p_user) then
    raise exception 'Dieses Konto ist gesperrt.' using errcode = 'P0001', hint = 'suspended';
  end if;
  if billing.available_evenings(p_user) < 1 then
    raise exception 'Im Kontingent ist kein Abend frei.' using errcode = 'P0001', hint = 'no_evening_available';
  end if;
end;
$$;
comment on function billing.assert_evening_available(uuid) is
  'Vor der Bestätigung eines Abends für beide Personen aufrufen (M5). Der Ledger-Trigger prüft zusätzlich selbst.';

-- Darf diese Person einen neuen Vorschlag bekommen? Mit Grund (für Auswahl-Bericht und Admin).
create or replace function billing.proposal_eligibility(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  acc_status text;
  m billing.memberships;
  avail integer;
  pending integer;
  free_phase boolean;
begin
  if safety.is_suspended(p_user) then
    return jsonb_build_object('eligible', false, 'reason', 'suspended');
  end if;
  select a.status into acc_status from app.accounts a where a.user_id = p_user;
  if acc_status is null or acc_status in ('suspended', 'closed', 'paused') then
    return jsonb_build_object('eligible', false, 'reason', 'account_inactive');
  end if;
  select * into m from billing.memberships where user_id = p_user;
  avail := billing.available_evenings(p_user);
  select count(*)::integer into pending from app.evenings e
  where p_user in (e.user_a, e.user_b) and e.state in ('proposed', 'time_requested', 'time_countered');
  free_phase := ops.setting_bool('billing.free_until_first_evening') and (m.user_id is null or m.free_phase_ended_at is null);

  if not free_phase then
    if m.user_id is null
       or not (m.status = 'active' or (m.status = 'cancelled' and (m.cancel_at is null or m.cancel_at > app.now()))) then
      return jsonb_build_object('eligible', false, 'reason', 'no_active_membership', 'available', avail);
    end if;
  end if;
  if avail - pending < 1 then
    return jsonb_build_object('eligible', false,
      'reason', case when avail >= 1 then 'open_proposal' else 'no_evening_available' end,
      'available', avail, 'open_proposals', pending, 'free_phase', free_phase);
  end if;
  return jsonb_build_object('eligible', true, 'reason', case when free_phase then 'free_phase' else 'membership' end,
    'available', avail, 'open_proposals', pending, 'free_phase', free_phase);
end;
$$;

create or replace function billing.can_receive_proposal(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((billing.proposal_eligibility(p_user) ->> 'eligible')::boolean, false);
$$;
comment on function billing.can_receive_proposal(uuid) is
  'Für den Auswahl-Job: Gratisphase nicht beendet ODER aktive Mitgliedschaft, und mindestens ein Abend frei (abzüglich offener Vorschläge), nicht gesperrt.';

grant execute on function billing.can_receive_proposal(uuid), billing.proposal_eligibility(uuid), billing.reserved_evenings(uuid)
  to service_role, fermata_matcher;
grant execute on function billing.assert_evening_available(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Verfall sichtbar machen: schreibt für verfallene Töpfe mit Rest eine Zeile 'expire'.
-- Ändert die verfügbaren Abende nicht (verfallene Töpfe zählen ohnehin nicht), macht den Verlauf aber lesbar.
-- ---------------------------------------------------------------------------
create or replace function billing.expire_ledger()
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
    select l.id, l.user_id from billing.evening_ledger l
    where l.source_entry_id is null and l.amount > 0 and l.expires_at is not null and l.expires_at <= app.now()
      and not exists (select 1 from billing.evening_ledger x where x.source_entry_id = l.id and x.kind = 'expire')
  loop
    rest := billing.bucket_remaining(b.id);
    if rest > 0 then
      insert into billing.evening_ledger (user_id, at, kind, amount, source_entry_id, note)
      values (b.user_id, app.now(), 'expire', -rest, b.id, 'Verfallen');
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Aufruf von Edge Functions aus der Datenbank (pg_net), z. B. für sofortigen Mailversand.
-- Ohne pg_net, ohne Adresse oder ohne Geheimnis passiert nichts (Tests, lokal).
-- Geheimnis: Vault-Eintrag fermata_internal_secret = Umgebungsvariable FERMATA_INTERNAL_SECRET der Functions.
-- ---------------------------------------------------------------------------
create or replace function billing.invoke_internal(p_function text, p_body jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
begin
  base := ops.setting_text('internal.functions_base_url');
  if base is null or base = '' or to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return false;
  end if;
  select ds.decrypted_secret into secret from vault.decrypted_secrets ds where ds.name = 'fermata_internal_secret';
  if secret is null then
    return false;
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using rtrim(base, '/') || '/' || p_function, coalesce(p_body, '{}'::jsonb),
          jsonb_build_object('content-type', 'application/json', 'x-fermata-internal-secret', secret);
  return true;
exception when others then
  raise notice 'invoke_internal(%) fehlgeschlagen: %', p_function, sqlerrm;
  return false;
end;
$$;
