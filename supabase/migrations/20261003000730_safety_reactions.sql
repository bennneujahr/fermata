-- Fermata · M7 Sicherheit, Teil 3: Reaktionen auf Zustandswechsel der Abende.
-- Hängt wie das Kontingent-Buch an app.evening_events (AFTER INSERT), getrennt von M5.

create or replace function safety.on_evening_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e app.evenings;
  absent uuid;
  total integer;
begin
  if new.to_state is distinct from 'no_show' or new.from_state is not distinct from new.to_state then
    return new;
  end if;
  select * into e from app.evenings where id = new.evening_id;
  absent := coalesce(
    case when billing.safe_uuid(new.details ->> 'no_show_user') in (e.user_a, e.user_b) then billing.safe_uuid(new.details ->> 'no_show_user') end,
    case when e.no_show_user in (e.user_a, e.user_b) then e.no_show_user end);
  if absent is null then
    return new;
  end if;
  -- Wiederholtes Nichterscheinen (Frage B9): Benn bekommt einen Hinweis, entscheidet selbst über Folgen.
  select count(*)::integer into total
  from app.evening_events ev join app.evenings x on x.id = ev.evening_id
  where ev.to_state = 'no_show' and absent in (x.user_a, x.user_b)
    and coalesce(billing.safe_uuid(ev.details ->> 'no_show_user'), x.no_show_user) = absent;
  if total >= ops.setting_int('safety.no_show_flag_threshold') then
    perform safety.raise_flag(absent, 'system', 'wiederholt_nicht_erschienen', 'mittel',
      jsonb_build_object('evening_id', e.id, 'no_shows', total));
  end if;
  return new;
end;
$$;

create trigger evening_events_safety after insert on app.evening_events
  for each row execute function safety.on_evening_event();

-- ---------------------------------------------------------------------------
-- Rechte (siehe Hinweis am Ende von 20261003000640_billing_extension.sql): PUBLIC-Ausführung entziehen,
-- danach nur ausdrücklich freigeben.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'safety'::regnamespace and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p
           where p.pronamespace = 'api'::regnamespace and p.prokind = 'f'
             and p.proname in ('report', 'my_reports', 'appeal', 'my_appeals', 'help_contacts', 'checkin_respond',
                               'create_trust_share', 'revoke_trust_share', 'my_trust_shares',
                               'admin_reports', 'admin_report', 'admin_set_report_status', 'admin_decide_report',
                               'admin_impose_sanction', 'admin_lift_sanction', 'admin_sanctions', 'admin_appeals',
                               'admin_decide_appeal', 'admin_safety_flags', 'admin_review_flag', 'admin_police_report_template') loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end
$$;
grant execute on function safety.is_suspended(uuid) to service_role, fermata_matcher;
grant execute on function api.help_contacts() to anon, authenticated, service_role;
grant execute on function
  api.report(text, text, uuid, uuid, text, boolean), api.my_reports(), api.appeal(uuid, text), api.my_appeals(),
  api.checkin_respond(uuid, text), api.create_trust_share(uuid), api.revoke_trust_share(uuid), api.my_trust_shares(uuid),
  api.admin_reports(text), api.admin_report(uuid), api.admin_set_report_status(uuid, text),
  api.admin_decide_report(uuid, text, text, boolean), api.admin_impose_sanction(uuid, text, text, timestamptz, uuid, text),
  api.admin_lift_sanction(uuid, text), api.admin_sanctions(uuid, boolean), api.admin_appeals(text),
  api.admin_decide_appeal(uuid, text, text), api.admin_safety_flags(boolean, integer), api.admin_review_flag(uuid, text),
  api.admin_police_report_template(uuid)
to authenticated;
