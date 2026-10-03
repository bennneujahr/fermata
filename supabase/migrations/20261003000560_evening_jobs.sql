-- Fermata · M5: Zeitpläne (pg_cron) und pg_net für den Versand-Anstoß.
-- Ändert Benn evening.deadline_check_minutes, legt `select ops.schedule_evening_jobs()` die Jobs neu an.

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
exception when others then
  raise notice 'pg_net nicht eingerichtet: %', sqlerrm;
end
$$;

insert into ops.app_settings (key, value, description, category, is_public) values
  ('notify.queue_retention_days', '90', 'Erledigte Einträge der Benachrichtigungs-Warteschlange werden nach so vielen Tagen gelöscht.', 'benachrichtigung', false)
on conflict (key) do nothing;

-- Aufräumen (täglich): erledigte Nachrichten nach notify.queue_retention_days, Erkennungszeichen nach dem Finde-Fenster.
create or replace function ops.purge_evening_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_queue integer;
  v_hints integer;
begin
  delete from ops.notification_queue q
   where (q.sent_at is not null or q.failed_at is not null)
     and q.created_at < app.now() - make_interval(days => ops.setting_int('notify.queue_retention_days'));
  get diagnostics v_queue = row_count;
  delete from app.evening_hints h
   using app.evenings e
   where e.id = h.evening_id
     and (e.state not in ('confirmed', 'happened')
          or e.starts_at + make_interval(mins => ops.setting_int('evening.find_window_after_minutes')) < app.now());
  get diagnostics v_hints = row_count;
  return jsonb_build_object('queue', v_queue, 'hints', v_hints);
end;
$$;
comment on function ops.purge_evening_data() is 'Löscht erledigte Nachrichten nach Ablauf der Aufbewahrung und Erkennungszeichen nach dem Finde-Fenster.';

create or replace function ops.schedule_evening_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_minutes integer := greatest(least(ops.setting_int('evening.deadline_check_minutes'), 59), 1);
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    return jsonb_build_object('pg_cron', false);
  end if;
  -- cron.schedule(name, …) legt an oder ersetzt (gleicher Name).
  execute 'select cron.schedule($1, $2, $3)'
    using 'fermata-evening-deadlines', format('*/%s * * * *', v_minutes), 'select ops.process_evening_deadlines()';
  execute 'select cron.schedule($1, $2, $3)'
    using 'fermata-availability-tick', '5 * * * *', 'select ops.availability_tick()';
  execute 'select cron.schedule($1, $2, $3)'
    using 'fermata-notify-kick', '* * * * *', 'select ops.notify_kick()';
  execute 'select cron.schedule($1, $2, $3)'
    using 'fermata-evening-purge', '23 3 * * *', 'select ops.purge_evening_data()';
  return jsonb_build_object('pg_cron', true, 'deadline_minutes', v_minutes);
end;
$$;
comment on function ops.schedule_evening_jobs() is
  'Legt die pg_cron-Jobs an: Fristen (alle evening.deadline_check_minutes), Zeitenabfrage (stündlich), Versand-Anstoß (minütlich), Aufräumen (täglich).';

do $$
begin
  perform ops.schedule_evening_jobs();
exception when others then
  raise notice 'pg_cron-Jobs nicht eingerichtet: %', sqlerrm;
end
$$;
