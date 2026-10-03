-- Fermata · Web-App (M2): Admin-Funktionen. Jede verlangt app.is_admin() (Admin + Zwei-Faktor, aal2).
-- Art.-9-Angaben (Geschlecht, Religion …) zeigt keine Admin-Funktion an (PLAN 2.2: nur die Person selbst).

create or replace function app.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Nur für Admins mit Zwei-Faktor-Anmeldung' using errcode = '42501', hint = 'admin_aal2_required';
  end if;
  return auth.uid();
end;
$$;

-- Übersicht für das Dashboard
create or replace function api.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_waitlist jsonb := null;
  v_result jsonb;
begin
  perform app.require_admin();
  if to_regclass('public.waitlist') is not null then
    execute $q$select jsonb_build_object('total', count(*), 'invited_to_app', count(*) filter (where w.invited_to_app_at is not null))
               from public.waitlist w$q$ into v_waitlist;
  end if;
  select jsonb_build_object(
    'accounts', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
                 from (select a.status, count(*) as n from app.accounts a group by a.status) s),
    'accounts_total', (select count(*) from app.accounts),
    'invitations', jsonb_build_object(
      'open', (select count(*) from app.account_invitations i where i.accepted_at is null and i.revoked_at is null and i.expires_at > app.now()),
      'accepted', (select count(*) from app.account_invitations i where i.accepted_at is not null),
      'expired', (select count(*) from app.account_invitations i where i.accepted_at is null and i.revoked_at is null and i.expires_at <= app.now())),
    'verifications', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb)
                      from (select v.status, count(*) as n from app.verifications v group by v.status) s),
    'verifications_pending_deletion', (select count(*) from app.verifications v
                                       where v.completed_at is not null and v.provider_session_id is not null and v.provider_session_deleted_at is null),
    'safety_flags_open', (select count(*) from safety.safety_flags f where f.reviewed_at is null),
    'reports_open', (select count(*) from safety.reports r where r.status in ('open', 'in_review')),
    'waitlist', v_waitlist
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function api.admin_overview() to authenticated;

-- Konten mit Onboarding-Stand (Suche über E-Mail und Namen)
create or replace function api.admin_accounts(p_search text default null, p_status text default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  user_id uuid, email text, first_name text, last_name text, postal_code text, city text,
  status text, is_founding_member boolean, created_at timestamptz, last_sign_in_at timestamptz,
  next_step text, verification_status text, invitation_expires_at timestamptz, invitation_accepted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform app.require_admin();
  return query
  select a.user_id, u.email::text, f.first_name, f.last_name, f.postal_code, f.city,
         a.status, a.is_founding_member, a.created_at, u.last_sign_in_at,
         app.onboarding_state(a.user_id) ->> 'next_step',
         (select v.status from app.verifications v where v.user_id = a.user_id order by v.started_at desc limit 1),
         i.expires_at, i.accepted_at
  from app.accounts a
  join auth.users u on u.id = a.user_id
  left join private.account_facts f on f.user_id = a.user_id
  left join lateral (select x.expires_at, x.accepted_at from app.account_invitations x
                     where x.user_id = a.user_id and x.revoked_at is null order by x.invited_at desc limit 1) i on true
  where (p_status is null or a.status = p_status)
    and (v_q is null or u.email ilike '%' || v_q || '%' or f.first_name ilike '%' || v_q || '%'
         or f.last_name ilike '%' || v_q || '%' or f.postal_code = v_q)
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
grant execute on function api.admin_accounts(text, text, integer, integer) to authenticated;

-- Einzelnes Konto (ohne Art.-9-Angaben)
create or replace function api.admin_account(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform app.require_admin();
  select jsonb_build_object(
    'user_id', a.user_id,
    'email', u.email,
    'created_at', a.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'status', a.status,
    'address_form', a.address_form,
    'is_founding_member', a.is_founding_member,
    'facts', (select to_jsonb(f) - 'user_id' from private.account_facts f where f.user_id = a.user_id),
    'onboarding', app.onboarding_state(a.user_id),
    'consents', (select coalesce(jsonb_agg(jsonb_build_object('kind', c.kind, 'action', c.action, 'version', c.document_version, 'at', c.at)
                                   order by c.at desc, c.id desc), '[]'::jsonb)
                 from app.consents c where c.user_id = a.user_id),
    'verifications', (select coalesce(jsonb_agg(to_jsonb(v) - 'user_id' order by v.started_at desc), '[]'::jsonb)
                      from app.verifications v where v.user_id = a.user_id),
    'invitations', (select coalesce(jsonb_agg(jsonb_build_object('invited_at', i.invited_at, 'expires_at', i.expires_at,
                                     'accepted_at', i.accepted_at, 'revoked_at', i.revoked_at) order by i.invited_at desc), '[]'::jsonb)
                    from app.account_invitations i where i.user_id = a.user_id),
    'membership', (select to_jsonb(m) - 'user_id' - 'stripe_customer_id' - 'stripe_subscription_id'
                   from billing.memberships m where m.user_id = a.user_id),
    'available_evenings', billing.available_evenings(a.user_id),
    'safety_flags', (select coalesce(jsonb_agg(jsonb_build_object('id', sf.id, 'kind', sf.kind, 'severity', sf.severity,
                                     'source', sf.source, 'created_at', sf.created_at, 'reviewed_at', sf.reviewed_at)
                                     order by sf.created_at desc), '[]'::jsonb)
                     from safety.safety_flags sf where sf.user_id = a.user_id)
  ) into v_result
  from app.accounts a join auth.users u on u.id = a.user_id
  where a.user_id = p_user;
  if v_result is null then
    raise exception 'Konto nicht gefunden' using errcode = 'P0002';
  end if;
  insert into ops.audit_log (actor, action, target_table, target_id) values (auth.uid(), 'admin.account_viewed', 'app.accounts', p_user::text);
  return v_result;
end;
$$;
grant execute on function api.admin_account(uuid) to authenticated;

create or replace function api.admin_invitations(p_limit integer default 100)
returns table (id uuid, email text, user_id uuid, invited_at timestamptz, expires_at timestamptz,
               accepted_at timestamptz, revoked_at timestamptz, waitlist_linked boolean, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  return query
  select i.id, i.email::text, i.user_id, i.invited_at, i.expires_at, i.accepted_at, i.revoked_at, i.waitlist_id is not null,
         case when i.accepted_at is not null then 'angenommen'
              when i.revoked_at is not null then 'ersetzt'
              when i.expires_at <= app.now() then 'abgelaufen'
              else 'offen' end
  from app.account_invitations i
  order by i.invited_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
grant execute on function api.admin_invitations(integer) to authenticated;

create or replace function api.admin_verifications(p_status text default null, p_limit integer default 100)
returns table (id uuid, user_id uuid, email text, provider text, status text, is_adult boolean, birth_year integer,
               name_match boolean, birth_date_match boolean, blocklist_hit boolean, started_at timestamptz,
               completed_at timestamptz, provider_session_deleted_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  return query
  select v.id, v.user_id, u.email::text, v.provider, v.status, v.is_adult, v.birth_year, v.name_match, v.birth_date_match,
         v.blocklist_hit, v.started_at, v.completed_at, v.provider_session_deleted_at
  from app.verifications v join auth.users u on u.id = v.user_id
  where p_status is null or v.status = p_status
  order by v.started_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
grant execute on function api.admin_verifications(text, integer) to authenticated;

create or replace function api.admin_safety_flags(p_open_only boolean default true, p_limit integer default 100)
returns table (id uuid, user_id uuid, email text, source text, kind text, severity text, details jsonb,
               created_at timestamptz, reviewed_at timestamptz, outcome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  return query
  select f.id, f.user_id, u.email::text, f.source, f.kind, f.severity, f.details, f.created_at, f.reviewed_at, f.outcome
  from safety.safety_flags f left join auth.users u on u.id = f.user_id
  where not coalesce(p_open_only, true) or f.reviewed_at is null
  order by case f.severity when 'akut' then 0 when 'hoch' then 1 when 'mittel' then 2 else 3 end, f.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
grant execute on function api.admin_safety_flags(boolean, integer) to authenticated;

-- Einstellungen lesen und ändern (mit Verlauf über ops.app_settings_history und Audit)
create or replace function api.admin_settings()
returns table (key text, value jsonb, description text, category text, is_public boolean, updated_at timestamptz, updated_by uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_admin();
  return query
  select s.key, s.value, s.description, s.category, s.is_public, s.updated_at, s.updated_by
  from ops.app_settings s order by s.category, s.key;
end;
$$;
grant execute on function api.admin_settings() to authenticated;

create or replace function api.admin_update_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := app.require_admin();
  v_old ops.app_settings;
begin
  select * into v_old from ops.app_settings s where s.key = p_key for update;
  if not found then
    raise exception 'Unbekannte Einstellung' using errcode = 'P0002', hint = 'unknown_setting';
  end if;
  if p_value is null then
    raise exception 'Wert fehlt' using errcode = '22023', hint = 'invalid_value';
  end if;
  -- Gleicher JSON-Typ wie bisher (eine Zahl bleibt eine Zahl); null-Einstellungen sind frei.
  if jsonb_typeof(v_old.value) <> 'null' and jsonb_typeof(p_value) <> 'null'
     and jsonb_typeof(v_old.value) <> jsonb_typeof(p_value) then
    raise exception 'Falscher Typ: erwartet %', jsonb_typeof(v_old.value) using errcode = '22023', hint = 'type_mismatch';
  end if;
  if pg_column_size(p_value) > 16384 then
    raise exception 'Wert zu groß' using errcode = '22023', hint = 'invalid_value';
  end if;
  update ops.app_settings set value = p_value, updated_by = v_admin where key = p_key;
  insert into ops.audit_log (actor, action, target_table, target_id, details)
  values (v_admin, 'setting.updated', 'ops.app_settings', p_key, jsonb_build_object('old', v_old.value, 'new', p_value));
  return jsonb_build_object('key', p_key, 'value', p_value);
end;
$$;
comment on function api.admin_update_setting(text, jsonb) is 'Ändert eine bestehende Einstellung (gleicher JSON-Typ), mit Verlauf und Audit. Nur Admin mit aal2.';
grant execute on function api.admin_update_setting(text, jsonb) to authenticated;

-- Admin-Prüfung für Edge Functions (service_role mit eigener JWT-Prüfung)
create or replace function ops.is_admin_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app.admin_users a where a.user_id = p_user);
$$;
revoke execute on function ops.is_admin_user(uuid) from public, anon, authenticated;
grant execute on function ops.is_admin_user(uuid) to service_role;
