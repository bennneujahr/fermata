-- Fermata · Härtung: Löschfristen für alle Daten, die bisher keine hatten (Löschkonzept Abschnitt 2 und 6,
-- DATA.md Abschnitt 7, DSFA M-5). Ein täglicher Job (fermata-retention) ruft ops.apply_retention() auf; jede Frist ist
-- eine Einstellung retention.* (PLATZHALTER = von Benn/Anwalt zu bestätigen). Zurück kommen nur Zählungen.
--
-- Bewusst NICHT gelöscht:
--   - ops.audit_log: nur anhängen (Trigger audit_log_append_only). Es ist der Nachweis nach Art. 5 Abs. 2 und
--     Art. 32 DSGVO, wer wann Meldungen, Konten, Transkripte und Vorschläge eingesehen oder entschieden hat; eine
--     Löschfunktion wäre selbst eine Hintertür. Es enthält keine Inhalte (nur Kennungen, Begründungen der Admins,
--     Zählungen). Frist offen (Löschkonzept, Anwalt).
--   - safety.blocklist: dauerhaft, solange der Ausschluss gilt (Begründung in der DSFA).
--   - billing.contract_actions von bestehenden Konten: Teil des Vertrags; nach der Kontolöschung (user_id = null)
--     bleiben sie als Nachweis (Bestellung, Kündigung, Widerruf mit Name und Kontakt-E-Mail, § 312k, § 356a BGB) und
--     werden nach retention.contract_actions_years (Ende des Kalenderjahres) gelöscht.

-- ---------------------------------------------------------------------------
-- Einstellungen
-- ---------------------------------------------------------------------------
insert into ops.app_settings (key, value, description, category, is_public) values
  ('retention.reports_months', '24',
   'PLATZHALTER: Abgeschlossene Meldungen (resolved/dismissed) werden so viele Monate nach der Entscheidung gelöscht – nicht, solange eine Sanktion aus der Meldung gilt.', 'loeschfristen', false),
  ('retention.safety_flags_months', '24',
   'PLATZHALTER: Geprüfte Sicherheits-Hinweise werden so viele Monate nach der Prüfung gelöscht.', 'loeschfristen', false),
  ('retention.flag_hashes_days', '30',
   'Sperrlisten-Hashes in Hinweisen „Konto gelöscht während Prüfung“ werden so viele Tage nach der Prüfung entfernt (die Entscheidung ist dann gefallen).', 'loeschfristen', false),
  ('retention.safety_mail_days', '30',
   'Sicherheits-Mails werden so viele Tage nach dem Versand (bzw. nach dem letzten erfolglosen Versuch) aus safety.mail_queue gelöscht.', 'loeschfristen', false),
  ('retention.stripe_events_months', '13',
   'PLATZHALTER: Gekürzte Stripe-Ereignisse werden so viele Monate nach Eingang gelöscht (Stripe hält das Original).', 'loeschfristen', false),
  ('retention.contract_requests_days', '30',
   'Kündigungs-/Widerrufsanfragen ohne Anmeldung werden so viele Tage nach Bestätigung oder Ablauf des Links gelöscht.', 'loeschfristen', false),
  ('retention.contract_actions_years', '6',
   'PLATZHALTER (Steuerberatung/Anwalt): Vertragserklärungen gelöschter Konten werden so viele Jahre nach Ende des Kalenderjahres gelöscht (6: Geschäftsbriefe, § 257 HGB/§ 147 AO; Mindestens 3: Verjährung, § 195 BGB).', 'loeschfristen', false),
  ('retention.notifications_log_months', '12',
   'PLATZHALTER: Versandprotokoll (ops.notifications_log, ohne Inhalte) wird nach so vielen Monaten gelöscht.', 'loeschfristen', false),
  ('retention.availability_days', '30',
   'Freie Zeitfenster eines Zeitraums werden so viele Tage nach seinem letzten Tag gelöscht.', 'loeschfristen', false),
  ('retention.summary_draft_days', '30',
   'Der Entwurf der Zusammenfassung wird so viele Tage nach Bestätigung, Korrektur, Verwerfen oder Ende des Gesprächs geleert.', 'loeschfristen', false),
  ('retention.auth_audit_days', '30',
   'PLATZHALTER: Anmeldeprotokolle von Supabase Auth (auth.audit_log_entries, mit IP-Adresse) werden nach so vielen Tagen gelöscht.', 'loeschfristen', false)
on conflict (key) do nothing;

-- Gesamtscore eines Vorschlags darf wie die Teil-Scores nach matching.score_retention_months verschwinden.
alter table app.pairings alter column total_score drop not null;
comment on column app.pairings.total_score is 'Gesamtscore bei Vorschlag; nach matching.score_retention_months geleert (ops.apply_retention).';

comment on column billing.contract_actions.details is
  'Erklärung, wie sie einging (Bestellung: gezeigte Übersicht, Knopftext, Verlangen des Leistungsbeginns; Kündigung/Widerruf: Name, Kontakt-E-Mail, Art, Grund). '
  'Name und E-Mail bleiben nach einer Kontolöschung bewusst stehen: Sie sind der Nachweis über Eingang und Wirkung der Erklärung (Art. 6 Abs. 1 lit. c und f DSGVO; § 312k, § 356a BGB). '
  'Löschung nach retention.contract_actions_years (Ende des Kalenderjahres), nur ohne Konto-Bezug. Kündigung wegen Kontolöschung: ohne Name und E-Mail.';
comment on table billing.contract_actions is
  'Bestellung, Kündigung, Widerruf mit Zeitstempel und Eingangsbestätigung (dauerhafter Datenträger). Nach Kontolöschung ohne user_id als gesetzlicher Nachweis aufbewahrt (Löschkonzept).';

-- ---------------------------------------------------------------------------
-- Stripe-Ereignisse: personenbezogene Felder nie speichern (zweite Sicherung neben minimizeEvent in der Function)
-- ---------------------------------------------------------------------------
create or replace function billing.stripe_strip_personal(p jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  drop_keys constant text[] := array[
    'payment_method_details', 'card', 'billing_details', 'customer_address', 'customer_shipping', 'customer_phone',
    'customer_name', 'customer_email', 'customer_details', 'customer_tax_ids', 'account_tax_ids', 'shipping',
    'shipping_details', 'address', 'phone', 'email', 'name', 'receipt_email', 'receipt_url', 'receipt_number',
    'hosted_invoice_url', 'invoice_pdf', 'sources', 'payment_method', 'default_payment_method', 'ip', 'ip_address',
    'client_ip', 'billing_address', 'fingerprint'];
  k text;
  v jsonb;
  result jsonb;
begin
  if p is null then
    return null;
  end if;
  if jsonb_typeof(p) = 'object' then
    result := '{}'::jsonb;
    for k, v in select e.key, e.value from jsonb_each(p) e loop
      if k = any (drop_keys) then
        continue;
      end if;
      result := result || jsonb_build_object(k, billing.stripe_strip_personal(v));
    end loop;
    return result;
  elsif jsonb_typeof(p) = 'array' then
    return coalesce((select jsonb_agg(billing.stripe_strip_personal(x.e) order by x.ord)
                     from jsonb_array_elements(p) with ordinality as x(e, ord)), '[]'::jsonb);
  end if;
  return p;
end;
$$;
comment on function billing.stripe_strip_personal(jsonb) is
  'Entfernt Karten-, Adress-, Kontakt- und Namensfelder sowie Rechnungslinks rekursiv aus einem Stripe-Ereignis.';

create or replace function billing.accept_stripe_event(p_id text, p_type text, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  done timestamptz;
begin
  insert into billing.stripe_events (id, type, payload) values (p_id, p_type, billing.stripe_strip_personal(p_payload))
  on conflict (id) do nothing;
  select processed_at into done from billing.stripe_events where id = p_id;
  return done is null;
end;
$$;
update billing.stripe_events set payload = billing.stripe_strip_personal(payload)
 where payload is distinct from billing.stripe_strip_personal(payload);
comment on table billing.stripe_events is
  'Eingegangene Stripe-Webhooks (idempotent), gekürzt: keine Karten-, Adress-, Kontakt- und Namensfelder, keine Rechnungslinks. Löschung nach retention.stripe_events_months.';

-- ---------------------------------------------------------------------------
-- Warteliste: Eintrag löschen, sobald die Einladung angenommen ist (Gründungsstatus steht dann im Konto)
-- ---------------------------------------------------------------------------
create or replace function app.on_auth_user_signed_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_accepted integer;
begin
  if old.last_sign_in_at is null and new.last_sign_in_at is not null then
    update app.account_invitations
       set accepted_at = coalesce(accepted_at, app.now())
     where user_id = new.id and accepted_at is null and revoked_at is null;
    get diagnostics v_accepted = row_count;
    -- Datensparsam: Der Wartelisten-Eintrag hat seinen Zweck erfüllt. Gründungsstatus und E-Mail-Hash stehen seit der
    -- Einladung in app.accounts (ops.create_invited_account).
    if v_accepted > 0 and new.email is not null and to_regclass('public.waitlist') is not null then
      begin
        execute 'delete from public.waitlist where lower(email::text) = $1' using lower(new.email::text);
      exception when foreign_key_violation then
        raise notice 'Wartelisten-Eintrag konnte nicht gelöscht werden (Fremdschlüssel).';
      end;
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Der Löschjob
-- ---------------------------------------------------------------------------
create or replace function ops.apply_retention()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := app.now();
  v_today date := (app.now() at time zone 'Europe/Berlin')::date;
  r jsonb := '{}'::jsonb;
  n integer;
  v_total integer := 0;
begin
  -- Meldungen: abgeschlossen und alt genug, keine geltende Sanktion aus dieser Meldung.
  delete from safety.reports rep
   where rep.status in ('resolved', 'dismissed')
     and coalesce(rep.resolved_at, rep.created_at) < v_now - make_interval(months => ops.setting_int('retention.reports_months'))
     and not exists (select 1 from safety.sanctions s
                      where s.report_id = rep.id and s.lifted_at is null and (s.ends_at is null or s.ends_at > v_now));
  get diagnostics n = row_count; r := r || jsonb_build_object('safety_reports', n); v_total := v_total + n;

  -- Sicherheits-Hinweise: geprüft und alt genug.
  delete from safety.safety_flags f
   where f.reviewed_at is not null
     and f.reviewed_at < v_now - make_interval(months => ops.setting_int('retention.safety_flags_months'));
  get diagnostics n = row_count; r := r || jsonb_build_object('safety_flags', n); v_total := v_total + n;

  -- Sperrlisten-Hashes in geprüften Hinweisen (Entscheidung gefallen; ein Ausschluss steht dann in safety.blocklist).
  update safety.safety_flags f set details = f.details - 'hashes'
   where f.details ? 'hashes' and f.reviewed_at is not null
     and f.reviewed_at < v_now - make_interval(days => ops.setting_int('retention.flag_hashes_days'));
  get diagnostics n = row_count; r := r || jsonb_build_object('safety_flag_hashes', n); v_total := v_total + n;

  -- Sicherheits-Mails: versendet oder endgültig gescheitert.
  delete from safety.mail_queue q
   where (q.sent_at is not null and q.sent_at < v_now - make_interval(days => ops.setting_int('retention.safety_mail_days')))
      or (q.sent_at is null and q.attempts >= ops.setting_int('safety.mail_max_attempts')
          and q.created_at < v_now - make_interval(days => ops.setting_int('retention.safety_mail_days')));
  get diagnostics n = row_count; r := r || jsonb_build_object('safety_mail_queue', n); v_total := v_total + n;

  -- Stripe-Ereignisse (gekürzt).
  delete from billing.stripe_events e
   where e.received_at < v_now - make_interval(months => ops.setting_int('retention.stripe_events_months'));
  get diagnostics n = row_count; r := r || jsonb_build_object('stripe_events', n); v_total := v_total + n;

  -- Kündigung/Widerruf ohne Anmeldung: Anfrage erledigt oder abgelaufen.
  delete from billing.contract_requests cr
   where coalesce(cr.confirmed_at, cr.expires_at) < v_now - make_interval(days => ops.setting_int('retention.contract_requests_days'));
  get diagnostics n = row_count; r := r || jsonb_build_object('contract_requests', n); v_total := v_total + n;

  -- Vertragserklärungen gelöschter Konten nach Ende der Aufbewahrung (Ende des Kalenderjahres).
  delete from billing.contract_actions ca
   where ca.user_id is null
     and coalesce(ca.effective_at, ca.at) < date_trunc('year', v_now at time zone 'Europe/Berlin') at time zone 'Europe/Berlin'
                                            - make_interval(years => ops.setting_int('retention.contract_actions_years'));
  get diagnostics n = row_count; r := r || jsonb_build_object('contract_actions', n); v_total := v_total + n;

  -- Versandprotokoll.
  delete from ops.notifications_log l
   where l.at < v_now - make_interval(months => ops.setting_int('retention.notifications_log_months'));
  get diagnostics n = row_count; r := r || jsonb_build_object('notifications_log', n); v_total := v_total + n;

  -- Freie Zeitfenster vergangener Zeiträume (die Zeiträume selbst bleiben, ohne Personenbezug).
  delete from app.availability_windows w using app.availability_periods p
   where w.period_id = p.id and p.ends_on < v_today - ops.setting_int('retention.availability_days');
  get diagnostics n = row_count; r := r || jsonb_build_object('availability_windows', n); v_total := v_total + n;

  -- Entwurf der Zusammenfassung: nach Bestätigung/Korrektur/Verwerfen bzw. nach Ende des Gesprächs.
  update app.interview_sessions s
     set summary_draft = null,
         summary_status = case when s.summary_status = 'draft' then 'none' else s.summary_status end
   where s.summary_draft is not null
     and coalesce(s.summary_confirmed_at, s.ended_at) < v_now - make_interval(days => ops.setting_int('retention.summary_draft_days'))
     and (s.summary_status in ('confirmed', 'corrected', 'rejected') or s.status in ('completed', 'aborted', 'failed'));
  get diagnostics n = row_count; r := r || jsonb_build_object('summary_drafts', n); v_total := v_total + n;

  -- Gesamtscore und Prüfnotizen eines Vorschlags wie die Teil-Scores (matching.score_retention_months).
  update app.pairings p
     set total_score = null, review_notes = '{}'::jsonb, review_comment = null
    from app.match_runs mr
   where mr.id = p.run_id
     and coalesce(mr.finished_at, mr.started_at, mr.created_at) < v_now - make_interval(months => ops.setting_int('matching.score_retention_months'))
     and (p.total_score is not null or p.review_notes <> '{}'::jsonb or p.review_comment is not null);
  get diagnostics n = row_count; r := r || jsonb_build_object('pairing_scores', n); v_total := v_total + n;

  -- Warteliste: Einträge von Personen, die ihre Einladung angenommen haben (Rückfall zum Trigger beim Anmelden).
  if to_regclass('public.waitlist') is not null then
    execute $q$delete from public.waitlist w
               where exists (select 1 from app.account_invitations i
                              where i.accepted_at is not null and lower(i.email::text) = lower(w.email::text))$q$;
    get diagnostics n = row_count; r := r || jsonb_build_object('waitlist_accepted', n); v_total := v_total + n;
  end if;

  -- Anmeldeprotokolle mit IP-Adresse (Supabase Auth). Ohne Recht dazu: im Runbook als Aufgabe beschrieben.
  begin
    delete from auth.audit_log_entries a
     where a.created_at < v_now - make_interval(days => ops.setting_int('retention.auth_audit_days'));
    get diagnostics n = row_count;
    r := r || jsonb_build_object('auth_audit_log_entries', n); v_total := v_total + n;
  exception when insufficient_privilege then
    r := r || jsonb_build_object('auth_audit_log_entries', null);
  end;

  if v_total > 0 then
    insert into ops.audit_log (action, target_table, details) values ('retention.applied', 'ops.app_settings', r);
  end if;
  return r || jsonb_build_object('at', v_now);
end;
$$;
comment on function ops.apply_retention() is
  'Täglicher Löschjob (fermata-retention): Fristen aus retention.* und matching.score_retention_months. Liefert nur Zählungen.';
revoke execute on function ops.apply_retention(), billing.stripe_strip_personal(jsonb) from public, anon, authenticated;
grant execute on function ops.apply_retention() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fermata-retention', '41 3 * * *', 'select ops.apply_retention()');
  end if;
exception when others then
  raise notice 'pg_cron nicht eingerichtet: %', sqlerrm;
end
$$;
