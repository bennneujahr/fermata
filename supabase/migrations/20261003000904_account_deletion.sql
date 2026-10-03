-- Fermata · Härtung: Kontolöschung räumt Verträge und Abende auf (Vertrag 5, DSFA M-4, Löschkonzept 3).
--
-- Vorher: Die Löschung kaskadierte über app.evenings (beide Personen!) und ließ ein laufendes Stripe-Abo weiterlaufen.
-- Jetzt, in ops.account_deletion_prepare (vor dem Löschen in Supabase Auth):
--   1. Alle offenen und bevorstehenden Abende der Person werden über app.evening_transition(…, 'cancel_admin') abgesagt.
--      Das Gegenüber bekommt die neutrale Nachricht aus M5 („… findet nicht statt“ bzw. „Aus dem Vorschlag wird
--      diesmal kein Abend“, ohne Grund), das Lokal die Absage der Reservierung, beide den Abend im Kontingent zurück.
--   2. Diese Nachrichten hängen an app.evenings (ops.notification_queue.evening_id, on delete cascade) und würden mit
--      dem Abend gelöscht. Deshalb wird ihr Inhalt vorher festgehalten (payload.snapshot) und der Bezug gelöst;
--      ops.notification_context liefert für solche Zeilen den festgehaltenen Inhalt (Empfänger wird weiter erst beim
--      Versand aufgelöst, es stehen keine Adressen im Ausgang).
--   3. Ein Stripe-Abo, das noch laufen oder zahlen könnte, wird als Kündigung „konto_geloescht“ festgehalten
--      (billing.contract_actions, ohne Name und E-Mail); die Edge Function account-delete beendet es danach sofort bei
--      Stripe (DELETE /v1/subscriptions/{id}) und meldet das Ergebnis mit ops.account_deletion_stripe_result.
--   Fehler bei 1.–3. halten die Löschung der personenbezogenen Daten nicht auf; sie stehen im Audit und als Hinweis
--   für Benn (safety.safety_flags, Quelle system).

-- ---------------------------------------------------------------------------
-- Fehler gefunden: Kontolöschung scheiterte, sobald es einen Abend oder einen bezahlten Zeitraum gab.
-- billing.evening_ledger ist „nur anhängen“; die Fremdschlüssel evening_id und period_id stehen aber auf
-- „on delete set null“. Löscht Supabase Auth eine Person, löscht die Kaskade ihre Abende und Zeiträume und will
-- dabei evening_id im Kontingent-Buch des Gegenübers (bzw. period_id) auf null setzen – das UPDATE verbot der
-- Anhänge-Trigger, die ganze Löschung brach ab. Jetzt ist genau diese Änderung erlaubt, sonst nichts.
-- ---------------------------------------------------------------------------
create or replace function billing.ledger_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'evening_id' - 'period_id') = (to_jsonb(old) - 'evening_id' - 'period_id')
     and (new.evening_id is null or new.evening_id = old.evening_id)
     and (new.period_id is null or new.period_id = old.period_id) then
    -- Nur „on delete set null“ eines gelöschten Abends oder Zeitraums.
    return new;
  end if;
  raise exception 'Tabelle %.% ist nur zum Anhängen.', tg_table_schema, tg_table_name
    using errcode = 'insufficient_privilege';
end;
$$;
comment on function billing.ledger_append_only() is
  'Kontingent-Buch nur anhängen; erlaubt ist allein das Leeren von evening_id/period_id durch die Fremdschlüssel-Aktion.';
drop trigger if exists evening_ledger_append_only on billing.evening_ledger;
create trigger evening_ledger_append_only before update on billing.evening_ledger
  for each row execute function billing.ledger_append_only();

-- ---------------------------------------------------------------------------
-- Nachrichten vom Abend lösen (Inhalt festhalten)
-- ---------------------------------------------------------------------------
-- ops.notification_context aus 20261003000540 bleibt als …_live erhalten; die neue Hülle ergänzt festgehaltene Inhalte.
alter function ops.notification_context(bigint) rename to notification_context_live;
comment on function ops.notification_context_live(bigint) is
  'Empfänger und Inhalt einer Nachricht aus den aktuellen Tabellen (M5). Aufruf über ops.notification_context.';

create or replace function ops.notification_context(p_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  q ops.notification_queue;
  v jsonb;
  v_detached boolean;
begin
  select * into q from ops.notification_queue where id = p_id;
  v_detached := found and q.evening_id is null and coalesce(q.payload ? 'snapshot', false);
  v := ops.notification_context_live(p_id);
  if v_detached then
    -- Abend gibt es nicht mehr (Kontolöschung des Gegenübers): Empfänger live, Inhalt aus dem festgehaltenen Stand.
    if v ? 'skip' or coalesce((v ->> 'defer')::boolean, false) then
      return v;
    end if;
    return v || (q.payload -> 'snapshot');
  end if;
  return v;
end;
$$;
comment on function ops.notification_context(bigint) is
  'Empfänger und Inhalt einer Nachricht, erst beim Versand gebaut (M5); bei gelösten Nachrichten mit payload.snapshot. skip: nicht senden; defer: später erneut prüfen.';
revoke execute on function ops.notification_context(bigint), ops.notification_context_live(bigint) from public, anon, authenticated;
grant execute on function ops.notification_context(bigint), ops.notification_context_live(bigint) to service_role;

create or replace function ops.detach_evening_notifications(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
  v_ctx jsonb;
  v_snapshot jsonb;
  n_own integer := 0;
  n_detached integer := 0;
  n_dropped integer := 0;
  n_left integer := 0;
  pass integer;
begin
  -- Nachrichten an die Person selbst entfallen (sie wird gelöscht).
  delete from ops.notification_queue x using app.evenings e
   where x.evening_id = e.id and p_user in (e.user_a, e.user_b) and x.user_id = p_user
     and x.sent_at is null and x.failed_at is null;
  get diagnostics n_own = row_count;

  -- Zwei Durchgänge: Eine Absage ans Lokal wartet (defer), solange die Reservierungs-Mail noch unterwegs ist.
  for pass in 1..2 loop
    for q in
      select x.id from ops.notification_queue x join app.evenings e on e.id = x.evening_id
       where p_user in (e.user_a, e.user_b) and x.sent_at is null and x.failed_at is null
       order by (x.template = 'venue.cancellation'), x.id
    loop
      v_ctx := ops.notification_context(q.id);
      if coalesce((v_ctx ->> 'defer')::boolean, false) then
        continue;
      elsif v_ctx ? 'skip' and v_ctx ->> 'skip' is not null then
        -- Wäre ohnehin nicht mehr verschickt worden (überholt, keine Adresse …).
        delete from ops.notification_queue where id = q.id;
        n_dropped := n_dropped + 1;
      else
        v_snapshot := '{}'::jsonb;
        if v_ctx ? 'evening' then
          v_snapshot := v_snapshot || jsonb_build_object('evening', (v_ctx -> 'evening') - 'reasons_text' - 'offered_times');
        end if;
        if v_ctx ? 'reservation' then
          v_snapshot := v_snapshot || jsonb_build_object('reservation', v_ctx -> 'reservation');
        end if;
        update ops.notification_queue
           set payload = payload || jsonb_build_object('snapshot', v_snapshot, 'detached_at', app.now()),
               evening_id = null
         where id = q.id;
        n_detached := n_detached + 1;
      end if;
    end loop;
  end loop;
  select count(*)::integer into n_left from ops.notification_queue x join app.evenings e on e.id = x.evening_id
   where p_user in (e.user_a, e.user_b) and x.sent_at is null and x.failed_at is null;
  return jsonb_build_object('own_removed', n_own, 'detached', n_detached, 'dropped', n_dropped, 'left', n_left);
end;
$$;
comment on function ops.detach_evening_notifications(uuid) is
  'Vor einer Kontolöschung: offene Nachrichten zu Abenden der Person an andere (Gegenüber, Lokal, Admin) mit festgehaltenem Inhalt vom Abend lösen.';

-- ---------------------------------------------------------------------------
-- Abende absagen
-- ---------------------------------------------------------------------------
create or replace function app.cancel_evenings_for_account_deletion(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  n integer := 0;
  failed integer := 0;
begin
  for e in
    select ev.id, ev.state
    from app.evenings ev
    where p_user in (ev.user_a, ev.user_b)
      and (ev.state in ('proposed', 'time_requested', 'time_countered')
           or (ev.state = 'confirmed' and (ev.starts_at is null or ev.starts_at > app.now())))
    order by ev.created_at
  loop
    begin
      -- notify_by = m5: die Standard-Nachrichten aus M5 an das Gegenüber und das Lokal (neutral, ohne Grund).
      perform app.evening_transition(e.id, 'cancel_admin', null,
        jsonb_build_object('source', 'konto_geloescht', 'notify_by', 'm5'));
      n := n + 1;
    exception when others then
      failed := failed + 1;
      perform safety.raise_flag(null, 'system', 'abend_absage_bei_kontoloeschung_fehlgeschlagen', 'hoch',
        jsonb_build_object('evening_id', e.id, 'state', e.state, 'error', left(sqlerrm, 200)));
    end;
  end loop;
  return jsonb_build_object('cancelled', n, 'failed', failed);
end;
$$;
comment on function app.cancel_evenings_for_account_deletion(uuid) is
  'Kontolöschung: offene und bevorstehende Abende über cancel_admin absagen (M5 informiert Gegenüber und Lokal neutral).';

-- ---------------------------------------------------------------------------
-- Stripe-Abo: Kündigung „konto_geloescht“ festhalten
-- ---------------------------------------------------------------------------
create or replace function billing.record_deletion_cancellation(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m billing.memberships;
  action_id uuid;
  at_time timestamptz := app.now();
begin
  select * into m from billing.memberships where user_id = p_user for update;
  if not found or m.stripe_subscription_id is null or m.status not in ('pending', 'active', 'past_due', 'cancelled') then
    return null;
  end if;
  -- Nachweis über das Ende des Vertrags (§ 312k BGB, Rechtsstreit). Bewusst ohne Name und E-Mail: die Person hat
  -- ihre Löschung verlangt; Vertragsnummer und Stripe-Kennung genügen, um den Vertrag zuzuordnen.
  insert into billing.contract_actions (user_id, kind, at, details, effective_at)
  values (p_user, 'cancel', at_time, jsonb_build_object(
      'contract_number', m.contract_number,
      'kind', 'kontoloeschung',
      'reason', 'konto_geloescht',
      'channel', 'kontoloeschung',
      'received_at', at_time,
      'effective_at', at_time,
      'previous_status', m.status,
      'stripe_subscription_id', m.stripe_subscription_id),
    at_time)
  returning id into action_id;
  update billing.memberships set status = 'ended', cancelled_at = coalesce(cancelled_at, at_time), cancel_at = at_time
   where user_id = p_user;
  perform ops.audit('billing.cancel', 'billing.contract_actions', action_id::text,
    jsonb_build_object('kind', 'kontoloeschung', 'immediate', true));
  return jsonb_build_object('contract_action_id', action_id, 'subscription_id', m.stripe_subscription_id,
    'contract_number', m.contract_number, 'previous_status', m.status);
end;
$$;
comment on function billing.record_deletion_cancellation(uuid) is
  'Kontolöschung: hält die sofortige Kündigung eines Stripe-Abos fest (contract_actions kind cancel, reason konto_geloescht, ohne Name/E-Mail).';

-- Ergebnis der Kündigung bei Stripe (aus account-delete). Fehler → Hinweis für Benn, Löschung läuft trotzdem weiter.
create or replace function ops.account_deletion_stripe_result(p_contract_action_id uuid, p_ok boolean, p_detail jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a billing.contract_actions;
begin
  select * into a from billing.contract_actions where id = p_contract_action_id;
  if not found then
    raise exception 'Vertragshandlung nicht gefunden' using errcode = 'P0002', hint = 'not_found';
  end if;
  update billing.contract_actions
     set result = result || jsonb_build_object('stripe', case when p_ok then 'canceled' else 'failed' end, 'stripe_at', app.now())
                  || coalesce(p_detail, '{}'::jsonb)
   where id = a.id;
  if not p_ok then
    perform safety.raise_flag(null, 'system', 'stripe_kuendigung_bei_kontoloeschung_fehlgeschlagen', 'hoch',
      jsonb_build_object('contract_action_id', a.id, 'stripe_subscription_id', a.details ->> 'stripe_subscription_id',
                         'contract_number', a.details ->> 'contract_number', 'error', left(coalesce(p_detail ->> 'error', ''), 200)));
    perform ops.audit('account.stripe_cancel_failed', 'billing.contract_actions', a.id::text,
      jsonb_build_object('error', left(coalesce(p_detail ->> 'error', ''), 200)));
  end if;
end;
$$;
comment on function ops.account_deletion_stripe_result(uuid, boolean, jsonb) is
  'Kontolöschung: Ergebnis von DELETE /v1/subscriptions/{id}; bei Fehler Hinweis für Benn (Abo im Stripe-Dashboard beenden).';

-- ---------------------------------------------------------------------------
-- Löschung, Schritt 1 (ersetzt die Fassung aus 20261003000260)
-- ---------------------------------------------------------------------------
create or replace function ops.account_deletion_prepare(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_first text;
  v_form text;
  v_risky boolean;
  v_evenings jsonb := '{}'::jsonb;
  v_notes jsonb := '{}'::jsonb;
  v_stripe jsonb;
begin
  select u.email::text into v_email from auth.users u where u.id = p_user;
  if v_email is null then
    raise exception 'Person nicht gefunden' using errcode = 'P0002';
  end if;
  if exists (select 1 from app.admin_users a where a.user_id = p_user) then
    -- Admins entfernt nur ein anderer Admin (sonst sperrt sich Fermata aus).
    raise exception 'Admin-Konten werden nicht selbst gelöscht' using errcode = '42501', hint = 'admin_account';
  end if;
  select f.first_name into v_first from private.account_facts f where f.user_id = p_user;
  select a.address_form into v_form from app.accounts a where a.user_id = p_user;

  update app.accounts set deletion_requested_at = app.now() where user_id = p_user;

  -- Sicherheit: Wer während einer Sperre oder offenen Meldung löscht, hinterlässt Benn die Sperrlisten-Hashes
  -- (ohne Namen, ohne Ausweisnummer), damit über einen Ausschluss noch entschieden werden kann.
  v_risky := safety.is_suspended(p_user)
          or exists (select 1 from safety.reports r where r.reported = p_user and r.status in ('open', 'in_review'));
  if v_risky then
    insert into safety.safety_flags (user_id, source, kind, severity, details)
    select null, 'system', 'konto_geloescht_waehrend_pruefung', 'hoch',
           jsonb_build_object('hashes', coalesce(jsonb_agg(jsonb_build_object('doc_hash', h.doc_hash, 'name_hash', h.name_hash)), '[]'::jsonb),
                              'reports', (select coalesce(jsonb_agg(r.id), '[]'::jsonb) from safety.reports r where r.reported = p_user))
    from safety.verification_hashes h where h.user_id = p_user;
  end if;

  -- Abende absagen (Gegenüber und Lokal werden informiert) und die Nachrichten vor der Kaskade retten.
  begin
    v_evenings := app.cancel_evenings_for_account_deletion(p_user);
    v_notes := ops.detach_evening_notifications(p_user);
    if coalesce((v_notes ->> 'left')::integer, 0) > 0 then
      perform safety.raise_flag(null, 'system', 'nachricht_bei_kontoloeschung_verloren', 'mittel',
        jsonb_build_object('left', v_notes -> 'left'));
    end if;
  exception when others then
    perform safety.raise_flag(null, 'system', 'abend_absage_bei_kontoloeschung_fehlgeschlagen', 'hoch',
      jsonb_build_object('error', left(sqlerrm, 200)));
    v_evenings := jsonb_build_object('cancelled', 0, 'failed', -1);
  end;

  -- Laufendes Stripe-Abo: Kündigung festhalten; die Edge Function beendet es bei Stripe.
  v_stripe := billing.record_deletion_cancellation(p_user);

  -- Was ohne Fremdschlüssel am Konto hängt: Einladungen (E-Mail im Klartext), Versandprotokoll.
  delete from app.account_invitations where user_id = p_user or email = v_email::extensions.citext;
  delete from ops.notifications_log where user_id = p_user;
  -- Warteliste (M1), falls vorhanden: Eintrag gehört zur Person und wird mitgelöscht.
  if to_regclass('public.waitlist') is not null then
    begin
      execute 'delete from public.waitlist where lower(email::text) = $1' using lower(v_email);
    exception when foreign_key_violation then
      raise notice 'Wartelisten-Eintrag konnte nicht gelöscht werden (Fremdschlüssel).';
    end;
  end if;

  insert into ops.audit_log (actor, action, target_table, target_id, details)
  values (p_user, 'account.deletion_requested', 'auth.users', p_user::text, jsonb_build_object(
    'safety_hold', v_risky, 'evenings', v_evenings, 'notifications', v_notes,
    'stripe_cancel', case when v_stripe is null then null else v_stripe -> 'contract_action_id' end));

  return jsonb_build_object('email', v_email, 'first_name', v_first, 'address_form', coalesce(v_form, 'sie'),
    'evenings', v_evenings, 'stripe', v_stripe);
end;
$$;
comment on function ops.account_deletion_prepare(uuid) is
  'Vor der Löschung: Audit, Abende absagen (Gegenüber/Lokal informiert), Stripe-Kündigung festhalten, Einladungen/Protokolle entfernen, Sicherheits-Hinweis bei laufender Prüfung.';

revoke execute on function ops.detach_evening_notifications(uuid), app.cancel_evenings_for_account_deletion(uuid),
  billing.record_deletion_cancellation(uuid), ops.account_deletion_stripe_result(uuid, boolean, jsonb),
  ops.account_deletion_prepare(uuid) from public, anon, authenticated;
grant execute on function ops.detach_evening_notifications(uuid), app.cancel_evenings_for_account_deletion(uuid),
  billing.record_deletion_cancellation(uuid), ops.account_deletion_stripe_result(uuid, boolean, jsonb),
  ops.account_deletion_prepare(uuid) to service_role;
