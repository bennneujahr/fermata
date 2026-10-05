-- Wird nach den Migrationen einmal ausgeführt (nur Test-Datenbank).
create extension if not exists pgtap with schema extensions;

-- Hilfsfunktionen für Tests: als bestimmte Person auftreten.
create schema if not exists tests;
-- Nur Test-Datenbank: die Hilfen sind für jede Rolle nutzbar (auch fermata_agent, fermata_matcher).
grant usage on schema tests to public;

create or replace function tests.create_user(p_email text, p_id uuid default gen_random_uuid())
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into auth.users (id, email, aud, role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (p_id, p_email, 'authenticated', 'authenticated', now(), now(), '{}'::jsonb, '{}'::jsonb)
  returning id;
$$;

-- Setzt die JWT-Claims wie PostgREST und wechselt in die Rolle.
create or replace function tests.act_as(p_user uuid, p_aal text default 'aal1')
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal)::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.act_as_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end;
$$;

create or replace function tests.act_as_service()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  execute 'set local role service_role';
end;
$$;

create or replace function tests.reset_role()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;
grant execute on all functions in schema tests to public;
