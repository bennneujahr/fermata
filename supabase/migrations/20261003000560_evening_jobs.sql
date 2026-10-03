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
  return jsonb_build_object('pg_cron', true, 'deadline_minutes', v_minutes);
end;
$$;
comment on function ops.schedule_evening_jobs() is
  'Legt die pg_cron-Jobs für Fristen (alle evening.deadline_check_minutes), Zeitenabfrage (stündlich) und Versand-Anstoß (minütlich) an.';

do $$
begin
  perform ops.schedule_evening_jobs();
exception when others then
  raise notice 'pg_cron-Jobs nicht eingerichtet: %', sqlerrm;
end
$$;
