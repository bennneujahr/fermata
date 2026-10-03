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
