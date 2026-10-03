-- Fermata · Web-App (M2): Konto anlegen, Einladungen, Einwilligungen, Formular, Onboarding-Stand
-- PLAN 2.3 Nr. 3, 3.2 Nr. 4 und 8. Alle Regeln liegen hier, die Oberflächen rufen nur auf.
--
-- Hinweis zur Reihenfolge: Diese Migration läuft vor den Tabellen aus 0300–0700 (Profil, Abende,
-- Mitgliedschaft, Sicherheit). Funktionen, die diese Tabellen nutzen, sind deshalb plpgsql
-- (Namen werden erst beim Aufruf aufgelöst).

-- ---------------------------------------------------------------------------
-- Hilfen
-- ---------------------------------------------------------------------------
create or replace function app.berlin_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (app.now() at time zone 'Europe/Berlin')::date;
$$;
comment on function app.berlin_today() is 'Heutiges Datum in Europe/Berlin laut app.now() (Testuhr).';
grant execute on function app.berlin_today() to authenticated, service_role;

create or replace function app.is_of_age(p_birth_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_birth_date is not null
     and p_birth_date <= (app.berlin_today() - make_interval(years => ops.setting_int('account.min_age')))::date;
$$;
comment on function app.is_of_age(date) is 'true, wenn das Geburtsdatum mindestens account.min_age Jahre zurückliegt (Europe/Berlin).';
grant execute on function app.is_of_age(date) to authenticated, service_role;

-- Einwilligungsarten, die eine Person selbst erteilen kann (Spiegel des Checks in app.consents).
create or replace function app.consent_kinds()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['agb', 'datenschutz_kenntnis', 'art9_profile', 'art9_religion', 'art9_health',
               'biometrie', 'gespraech', 'push', 'kontakttausch'];
$$;

create or replace function app.required_consents()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array(select jsonb_array_elements_text(ops.setting('account.required_consents'))), array[]::text[]);
$$;
grant execute on function app.required_consents() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Konto anlegen (eine Stelle für alle Wege: Einladung, später Store-App).
-- Legt Konto, kostenlose Mitgliedschaft und den Gratis-Abend im Kontingent-Buch an. Idempotent.
-- Andere Bereiche (z. B. M6) dürfen die Funktion mit gleicher Signatur ersetzen.
-- ---------------------------------------------------------------------------
create or replace function app.on_account_created(
  p_user uuid,
  p_is_founding_member boolean default false,
  p_waitlist_email_hash text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null then
    raise exception 'Person fehlt' using errcode = '22023';
  end if;

  insert into app.accounts (user_id, is_founding_member, waitlist_email_hash)
  values (p_user, coalesce(p_is_founding_member, false), p_waitlist_email_hash)
  on conflict (user_id) do update set
    is_founding_member = app.accounts.is_founding_member or excluded.is_founding_member,
    waitlist_email_hash = coalesce(app.accounts.waitlist_email_hash, excluded.waitlist_email_hash);

  insert into billing.memberships (user_id, status) values (p_user, 'free')
  on conflict (user_id) do nothing;

  if ops.setting_bool('billing.free_until_first_evening')
     and not exists (select 1 from billing.evening_ledger l where l.user_id = p_user and l.kind = 'free_grant') then
    insert into billing.evening_ledger (user_id, kind, amount, note)
    values (p_user, 'free_grant', 1, 'Gratisphase: erster Abend kostenlos');
  end if;
end;
$$;
comment on function app.on_account_created(uuid, boolean, text) is
  'Legt app.accounts, billing.memberships (free) und den Gratis-Abend (evening_ledger free_grant +1) an. Idempotent.';
revoke execute on function app.on_account_created(uuid, boolean, text) from public, anon, authenticated;
grant execute on function app.on_account_created(uuid, boolean, text) to service_role;

-- ---------------------------------------------------------------------------
-- Einladung (PLAN 2.3 Nr. 3). Aufruf nur durch die Edge Function admin-invite (service_role),
-- nachdem sie das Konto in Supabase Auth angelegt hat.
-- ---------------------------------------------------------------------------
create or replace function ops.create_invited_account(
  p_email text,
  p_user uuid,
  p_invited_by uuid,
  p_waitlist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_hash text;
  v_founding boolean := false;
  v_waitlist_id uuid;
  v_linked boolean := false;
  v_has_founding_col boolean;
  v_invitation app.account_invitations;
  v_now timestamptz := app.now();
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(v_email) > 254 then
    raise exception 'Ungültige E-Mail-Adresse' using errcode = '22023', hint = 'invalid_email';
  end if;
  if p_user is null then
    raise exception 'Person fehlt' using errcode = '22023';
  end if;
  if p_invited_by is null or not exists (select 1 from app.admin_users a where a.user_id = p_invited_by) then
    raise exception 'Nur Admins laden ein' using errcode = '42501';
  end if;
  if exists (select 1 from app.account_invitations i where i.user_id = p_user and i.accepted_at is not null) then
    raise exception 'Diese Person hat bereits ein Konto' using errcode = '23505', hint = 'already_member';
  end if;

  v_hash := encode(extensions.digest(convert_to(v_email, 'UTF8'), 'sha256'), 'hex');

  -- Warteliste (M1) nur, wenn die Tabelle da ist: Eintrag markieren, Gründungsstatus übernehmen.
  if to_regclass('public.waitlist') is not null then
    select exists (select 1 from information_schema.columns c
                   where c.table_schema = 'public' and c.table_name = 'waitlist' and c.column_name = 'is_founding_member')
      into v_has_founding_col;
    if p_waitlist_id is not null then
      execute 'select w.id from public.waitlist w where w.id = $1' into v_waitlist_id using p_waitlist_id;
    else
      execute 'select w.id from public.waitlist w where lower(w.email::text) = $1 limit 1' into v_waitlist_id using v_email;
    end if;
    if v_waitlist_id is not null then
      v_linked := true;
      if v_has_founding_col then
        execute 'select coalesce(w.is_founding_member, false) from public.waitlist w where w.id = $1' into v_founding using v_waitlist_id;
      end if;
      if exists (select 1 from information_schema.columns c
                 where c.table_schema = 'public' and c.table_name = 'waitlist' and c.column_name = 'invited_to_app_at') then
        execute 'update public.waitlist set invited_to_app_at = coalesce(invited_to_app_at, $2) where id = $1'
          using v_waitlist_id, v_now;
      end if;
    end if;
  elsif p_waitlist_id is not null then
    raise exception 'Warteliste nicht vorhanden' using errcode = 'P0002', hint = 'waitlist_missing';
  end if;

  -- Offene Einladungen an dieselbe Adresse ersetzen (erneut einladen).
  update app.account_invitations set revoked_at = v_now
  where email = v_email::extensions.citext and accepted_at is null and revoked_at is null;

  insert into app.account_invitations (email, waitlist_id, invited_by, invited_at, expires_at, user_id)
  values (v_email, v_waitlist_id, p_invited_by, v_now,
          v_now + make_interval(days => ops.setting_int('account.invitation_valid_days')), p_user)
  returning * into v_invitation;

  perform app.on_account_created(p_user, v_founding, v_hash);

  insert into ops.audit_log (actor, action, target_table, target_id, details)
  values (p_invited_by, 'account.invited', 'app.account_invitations', v_invitation.id::text,
          jsonb_build_object('user_id', p_user, 'waitlist_linked', v_linked, 'is_founding_member', v_founding));

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'user_id', p_user,
    'expires_at', v_invitation.expires_at,
    'is_founding_member', v_founding,
    'waitlist_linked', v_linked
  );
end;
$$;
comment on function ops.create_invited_account(text, uuid, uuid, uuid) is
  'Hält eine Einladung fest, markiert die Warteliste (falls vorhanden) und ruft app.on_account_created auf.';
revoke execute on function ops.create_invited_account(text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function ops.create_invited_account(text, uuid, uuid, uuid) to service_role;

-- Erste Anmeldung nimmt die Einladung an.
create or replace function app.on_auth_user_signed_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.last_sign_in_at is null and new.last_sign_in_at is not null then
    update app.account_invitations
       set accepted_at = coalesce(accepted_at, app.now())
     where user_id = new.id and accepted_at is null and revoked_at is null;
  end if;
  return new;
end;
$$;
drop trigger if exists fermata_invitation_accepted on auth.users;
create trigger fermata_invitation_accepted
  after update of last_sign_in_at on auth.users
  for each row execute function app.on_auth_user_signed_in();

-- Abgelaufene, nie benutzte Einladungen: Konto und Einladung löschen (Datensparsamkeit).
create or replace function ops.expire_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users uuid[];
  n integer;
begin
  select coalesce(array_agg(distinct i.user_id), array[]::uuid[]) into v_users
  from app.account_invitations i
  join auth.users u on u.id = i.user_id
  where i.accepted_at is null and i.revoked_at is null and i.expires_at <= app.now()
    and u.last_sign_in_at is null
    and not exists (select 1 from app.admin_users a where a.user_id = i.user_id)
    and not exists (select 1 from app.account_invitations j
                    where j.user_id = i.user_id and (j.accepted_at is not null
                      or (j.revoked_at is null and j.expires_at > app.now())));
  delete from app.account_invitations i where i.user_id = any (v_users);
  delete from auth.users u where u.id = any (v_users);
  get diagnostics n = row_count;
  if n > 0 then
    insert into ops.audit_log (action, target_table, details)
    values ('invitation.expired', 'app.account_invitations', jsonb_build_object('accounts_deleted', n));
  end if;
  return n;
end;
$$;
comment on function ops.expire_invitations() is 'Löscht Konten aus abgelaufenen, nie angenommenen Einladungen. Läuft stündlich per pg_cron.';
revoke execute on function ops.expire_invitations() from public, anon, authenticated;
grant execute on function ops.expire_invitations() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fermata-expire-invitations', '41 * * * *', 'select ops.expire_invitations()');
  end if;
exception when others then
  raise notice 'pg_cron nicht eingerichtet: %', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- Onboarding-Stand und Kontostatus (onboarding ↔ active). paused, suspended und closed bleiben unberührt.
-- ---------------------------------------------------------------------------
create or replace function app.onboarding_complete(p_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (select bool_and(app.has_consent(p_user, k)) from unnest(app.required_consents()) k)
     and exists (select 1 from private.account_facts f where f.user_id = p_user)
     and exists (select 1 from sensitive.profile_identity pi where pi.user_id = p_user)
     and app.is_verified(p_user);
end;
$$;
grant execute on function app.onboarding_complete(uuid) to service_role;

create or replace function app.refresh_account_status(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_new text;
begin
  select a.status into v_status from app.accounts a where a.user_id = p_user for update;
  if v_status is null then return null; end if;
  if v_status not in ('onboarding', 'active') then return v_status; end if;
  v_new := case when app.onboarding_complete(p_user) then 'active' else 'onboarding' end;
  if v_new <> v_status then
    update app.accounts set status = v_new where user_id = p_user;
    insert into ops.audit_log (actor, action, target_table, target_id, details)
    values (auth.uid(), 'account.status', 'app.accounts', p_user::text, jsonb_build_object('from', v_status, 'to', v_new));
  end if;
  return v_new;
end;
$$;
revoke execute on function app.refresh_account_status(uuid) from public, anon, authenticated;
grant execute on function app.refresh_account_status(uuid) to service_role;

create or replace function app.require_account(p_user uuid)
returns app.accounts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a app.accounts;
begin
  if p_user is null then
    raise exception 'Nicht angemeldet' using errcode = '28000';
  end if;
  select * into a from app.accounts where user_id = p_user;
  if not found then
    raise exception 'Kein Mitgliedskonto' using errcode = '42501', hint = 'no_account';
  end if;
  if a.status = 'closed' then
    raise exception 'Konto geschlossen' using errcode = '42501', hint = 'account_closed';
  end if;
  return a;
end;
$$;

-- ---------------------------------------------------------------------------
-- Einwilligungen (PLAN 3.2 Nr. 8): nur anhängen; Fassung muss die aktuelle sein.
-- ---------------------------------------------------------------------------
create or replace function api.give_consent(p_kind text, p_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_current text;
begin
  perform app.require_account(uid);
  if p_kind is null or not (p_kind = any (app.consent_kinds())) then
    raise exception 'Unbekannte Einwilligung' using errcode = '22023', hint = 'unknown_kind';
  end if;
  select d.version into v_current from api.legal_document(p_kind) d;
  if v_current is null then
    raise exception 'Kein Text für diese Einwilligung' using errcode = 'P0002', hint = 'no_document';
  end if;
  if p_version is distinct from v_current then
    raise exception 'Veraltete Fassung' using errcode = '22023', hint = 'version_mismatch';
  end if;
  if not exists (select 1 from app.consents_current cc
                 where cc.user_id = uid and cc.kind = p_kind and cc.granted and cc.document_version = v_current) then
    insert into app.consents (user_id, kind, action, document_version, at, source)
    values (uid, p_kind, 'granted', v_current, app.now(), 'web');
  end if;
  perform app.refresh_account_status(uid);
  return jsonb_build_object('kind', p_kind, 'granted', true, 'version', v_current);
end;
$$;
comment on function api.give_consent(text, text) is 'Erteilt eine Einwilligung für die aktuelle Fassung des Textes (neue Zeile in app.consents).';
grant execute on function api.give_consent(text, text) to authenticated;

create or replace function api.revoke_consent(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_version text;
begin
  perform app.require_account(uid);
  if p_kind is null or not (p_kind = any (app.consent_kinds())) then
    raise exception 'Unbekannte Einwilligung' using errcode = '22023', hint = 'unknown_kind';
  end if;
  if p_kind in ('agb', 'datenschutz_kenntnis') then
    -- Vertrag bzw. Kenntnisnahme: Ende über die Kontolöschung.
    raise exception 'Nur über die Kontolöschung möglich' using errcode = '42501', hint = 'delete_account';
  end if;
  select cc.document_version into v_version from app.consents_current cc
  where cc.user_id = uid and cc.kind = p_kind and cc.granted;
  if v_version is null then
    return jsonb_build_object('kind', p_kind, 'granted', false, 'changed', false);
  end if;

  insert into app.consents (user_id, kind, action, document_version, at, source)
  values (uid, p_kind, 'revoked', v_version, app.now(), 'web');

  -- Folgen des Widerrufs: Daten, die nur mit dieser Einwilligung erlaubt sind, sofort löschen.
  if p_kind = 'art9_profile' then
    delete from sensitive.profile_identity where user_id = uid;
  elsif p_kind = 'art9_religion' then
    update sensitive.profile_sensitive
       set religion_enc = null, religion_importance_enc = null, religion_must_match = false, updated_at = now()
     where user_id = uid;
    delete from sensitive.profile_sensitive where user_id = uid and health_notes_enc is null;
  elsif p_kind = 'art9_health' then
    update sensitive.profile_sensitive set health_notes_enc = null, updated_at = now() where user_id = uid;
    delete from sensitive.profile_sensitive
     where user_id = uid and religion_enc is null and religion_importance_enc is null and not religion_must_match;
  elsif p_kind = 'push' then
    delete from app.push_subscriptions where user_id = uid;
  elsif p_kind = 'gespraech' then
    delete from app.interview_transcripts where user_id = uid;
  end if;

  insert into ops.audit_log (actor, action, target_table, target_id, details)
  values (uid, 'consent.revoked', 'app.consents', uid::text, jsonb_build_object('kind', p_kind));
  perform app.refresh_account_status(uid);
  return jsonb_build_object('kind', p_kind, 'granted', false, 'changed', true);
end;
$$;
comment on function api.revoke_consent(text) is 'Widerruft eine Einwilligung (neue Zeile) und löscht sofort die Daten, die nur mit ihr erlaubt sind.';
grant execute on function api.revoke_consent(text) to authenticated;

-- Aktueller Stand je Art, mit aktueller Fassung des Textes.
create or replace function api.my_consents()
returns table (kind text, required boolean, granted boolean, version text, current_version text, needs_renewal boolean, at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select k.kind,
         k.kind = any (app.required_consents()),
         coalesce(cc.granted, false),
         cc.document_version,
         d.version,
         coalesce(cc.granted, false) and d.version is not null and cc.document_version is distinct from d.version,
         cc.at
  from unnest(app.consent_kinds()) with ordinality as k(kind, ord)
  left join app.consents_current cc on cc.user_id = auth.uid() and cc.kind = k.kind
  left join lateral (select x.version from api.legal_document(k.kind) x) d on true
  where auth.uid() is not null
  order by k.ord;
$$;
grant execute on function api.my_consents() to authenticated;

-- ---------------------------------------------------------------------------
-- Formular: Fakten (PLAN 2.3 Nr. 3, Frage B1). Straße nur, wenn account.collect_street = true.
-- ---------------------------------------------------------------------------
create or replace function app.clean_name(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), '');
$$;

create or replace function api.save_facts(
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_postal_code text,
  p_city text default null,
  p_phone text default null,
  p_street text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_first text := app.clean_name(p_first_name);
  v_last text := app.clean_name(p_last_name);
  v_plz text := btrim(coalesce(p_postal_code, ''));
  v_city text := app.clean_name(p_city);
  v_phone text := app.clean_name(p_phone);
  v_street text := app.clean_name(p_street);
  v_pc app.postal_codes;
  v_old private.account_facts;
  k text;
begin
  perform app.require_account(uid);
  foreach k in array app.required_consents() loop
    if not app.has_consent(uid, k) then
      raise exception 'Einwilligung % fehlt', k using errcode = '42501', hint = 'consent_missing';
    end if;
  end loop;

  if v_first is null or v_last is null or char_length(v_first) > 80 or char_length(v_last) > 80
     or v_first ~ '[0-9<>@#$%^&*_=+{}|\\/:;"!?\[\]]' or v_last ~ '[0-9<>@#$%^&*_=+{}|\\/:;"!?\[\]]' then
    raise exception 'Ungültiger Name' using errcode = '22023', hint = 'invalid_name';
  end if;
  if p_birth_date is null or p_birth_date < date '1900-01-01' or p_birth_date > app.berlin_today() then
    raise exception 'Ungültiges Geburtsdatum' using errcode = '22023', hint = 'invalid_birth_date';
  end if;
  if not app.is_of_age(p_birth_date) then
    raise exception 'Fermata ist erst ab % Jahren', ops.setting_int('account.min_age')
      using errcode = '22023', hint = 'too_young';
  end if;
  if v_plz !~ '^[0-9]{5}$' then
    raise exception 'Ungültige Postleitzahl' using errcode = '22023', hint = 'invalid_postal_code';
  end if;
  select * into v_pc from app.postal_codes pc where pc.postal_code = v_plz;
  if not found then
    raise exception 'Unbekannte Postleitzahl' using errcode = '22023', hint = 'unknown_postal_code';
  end if;
  if v_city is not null and (char_length(v_city) > 80 or v_city ~ '[<>@#$%^&*_=+{}|\\:;"!?\[\]]') then
    raise exception 'Ungültiger Ort' using errcode = '22023', hint = 'invalid_city';
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9 ()/-]{6,24}$' then
    raise exception 'Ungültige Telefonnummer' using errcode = '22023', hint = 'invalid_phone';
  end if;
  if v_street is not null then
    if not ops.setting_bool('account.collect_street') then
      raise exception 'Die Straße wird nicht abgefragt' using errcode = '22023', hint = 'street_not_collected';
    end if;
    if char_length(v_street) > 120 then
      raise exception 'Ungültige Straße' using errcode = '22023', hint = 'invalid_street';
    end if;
  end if;

  -- Nach bestandener Ausweisprüfung bleiben Name und Geburtsdatum fest (sonst wäre der Abgleich wertlos).
  select * into v_old from private.account_facts f where f.user_id = uid;
  if found and app.is_verified(uid)
     and (v_old.first_name is distinct from v_first or v_old.last_name is distinct from v_last
          or v_old.birth_date is distinct from p_birth_date) then
    raise exception 'Name und Geburtsdatum sind geprüft und lassen sich nicht mehr ändern'
      using errcode = '42501', hint = 'facts_locked';
  end if;

  insert into private.account_facts (user_id, first_name, last_name, birth_date, street, postal_code, city, phone)
  values (uid, v_first, v_last, p_birth_date, v_street, v_plz, coalesce(v_city, v_pc.place_name), v_phone)
  on conflict (user_id) do update set
    first_name = excluded.first_name, last_name = excluded.last_name, birth_date = excluded.birth_date,
    street = excluded.street, postal_code = excluded.postal_code, city = excluded.city, phone = excluded.phone;

  -- Für die Auswahl nur der PLZ-Mittelpunkt, nie die Anschrift.
  insert into app.geo (user_id, postal_code, lat, lon, source, updated_at)
  values (uid, v_plz, v_pc.lat, v_pc.lon, 'plz_centroid', now())
  on conflict (user_id) do update set
    postal_code = excluded.postal_code, lat = excluded.lat, lon = excluded.lon, source = excluded.source, updated_at = now();

  -- Geburtsjahr für Altersfilter (wird nach der Ausweisprüfung mit dem geprüften Jahr überschrieben).
  insert into app.profile_core (user_id, birth_year) values (uid, extract(year from p_birth_date)::integer)
  on conflict (user_id) do update set birth_year = excluded.birth_year;

  perform app.refresh_account_status(uid);
  return jsonb_build_object('postal_code', v_plz, 'city', coalesce(v_city, v_pc.place_name), 'state', v_pc.state);
end;
$$;
comment on function api.save_facts(text, text, date, text, text, text, text) is
  'Speichert Name, Geburtsdatum (18+ mit app.now()), PLZ und Ort, freiwillig Telefon; Straße nur mit account.collect_street. Setzt app.geo aus dem PLZ-Mittelpunkt.';
grant execute on function api.save_facts(text, text, date, text, text, text, text) to authenticated;

-- PLZ nachschlagen (Ort im Formular vorschlagen). Kein externer Geodienst.
create or replace function api.postal_code_lookup(p_postal_code text)
returns table (postal_code text, place_name text, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select pc.postal_code, pc.place_name, pc.state from app.postal_codes pc
  where pc.postal_code = btrim(coalesce(p_postal_code, '')) and auth.uid() is not null;
$$;
grant execute on function api.postal_code_lookup(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Anrede (Sie/Du)
-- ---------------------------------------------------------------------------
create or replace function api.save_address_form(p_form text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  perform app.require_account(uid);
  if p_form not in ('sie', 'du') then
    raise exception 'Ungültige Anrede' using errcode = '22023', hint = 'invalid_address_form';
  end if;
  update app.accounts set address_form = p_form where user_id = uid;
  return p_form;
end;
$$;
grant execute on function api.save_address_form(text) to authenticated;

-- Push-Abo speichern (Empfang baut die Web-App, Versand M5). Nur mit Einwilligung push.
create or replace function api.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_platform text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  perform app.require_account(uid);
  if not app.has_consent(uid, 'push') then
    raise exception 'Einwilligung push fehlt' using errcode = '42501', hint = 'consent_missing';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Ungültiges Abo' using errcode = '22023', hint = 'invalid_subscription';
  end if;
  if p_platform is not null and p_platform not in ('ios', 'android', 'desktop') then
    raise exception 'Ungültige Plattform' using errcode = '22023', hint = 'invalid_platform';
  end if;
  -- Gerät wechselt die Person: altes Abo entfernen.
  delete from app.push_subscriptions where endpoint = p_endpoint and user_id <> uid;
  insert into app.push_subscriptions (user_id, endpoint, p256dh, auth, platform)
  values (uid, p_endpoint, p_p256dh, p_auth, p_platform)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, platform = excluded.platform, failures = 0
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function api.save_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Onboarding-Stand für Web-App und spätere Store-App (eine Quelle für den Stepper).
-- Schritte: einwilligungen → angaben → identitaet → ausweis → fertig
-- ---------------------------------------------------------------------------
create or replace function app.onboarding_state(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a app.accounts;
  v_consents_ok boolean;
  v_facts boolean;
  v_identity boolean;
  v_ver app.verifications;
  v_verified boolean;
  v_next text;
  v_steps jsonb;
  v_attempts integer;
begin
  select * into a from app.accounts where user_id = p_user;
  if not found then
    return jsonb_build_object('has_account', false);
  end if;
  select coalesce(bool_and(app.has_consent(p_user, k)), true) into v_consents_ok from unnest(app.required_consents()) k;
  v_facts := exists (select 1 from private.account_facts f where f.user_id = p_user);
  v_identity := exists (select 1 from sensitive.profile_identity pi where pi.user_id = p_user);
  select * into v_ver from app.verifications v where v.user_id = p_user order by v.started_at desc limit 1;
  v_verified := app.is_verified(p_user);
  select count(*)::integer into v_attempts from app.verifications v
  where v.user_id = p_user and v.status in ('declined', 'expired', 'error');

  v_next := case
    when not v_consents_ok then 'einwilligungen'
    when not v_facts then 'angaben'
    when not v_identity then 'identitaet'
    when not v_verified then 'ausweis'
    else 'fertig'
  end;
  select jsonb_agg(jsonb_build_object('key', s.key, 'state',
           case when s.done then 'done' when s.key = v_next then 'current' else 'todo' end) order by s.ord)
    into v_steps
  from (values (1, 'einwilligungen', v_consents_ok), (2, 'angaben', v_facts),
               (3, 'identitaet', v_identity), (4, 'ausweis', v_verified)) as s(ord, key, done);

  return jsonb_build_object(
    'has_account', true,
    'status', a.status,
    'address_form', a.address_form,
    'is_founding_member', a.is_founding_member,
    'created_at', a.created_at,
    'next_step', v_next,
    'complete', v_next = 'fertig',
    'steps', v_steps,
    'consents_ok', v_consents_ok,
    'facts_done', v_facts,
    'identity_done', v_identity,
    'verification', case when v_ver.id is null then null else jsonb_build_object(
      'id', v_ver.id, 'status', v_ver.status, 'started_at', v_ver.started_at, 'completed_at', v_ver.completed_at,
      'is_adult', v_ver.is_adult, 'name_match', v_ver.name_match, 'birth_date_match', v_ver.birth_date_match,
      'verified', v_verified) end,
    'verification_attempts_left', greatest(ops.setting_int('verification.max_attempts') - v_attempts, 0)
  );
end;
$$;
revoke execute on function app.onboarding_state(uuid) from public, anon, authenticated;
grant execute on function app.onboarding_state(uuid) to service_role;

create or replace function api.my_onboarding()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet' using errcode = '28000';
  end if;
  return app.onboarding_state(auth.uid());
end;
$$;
comment on function api.my_onboarding() is 'Onboarding-Stand der angemeldeten Person (Schritte, nächster Schritt, Ausweisprüfung).';
grant execute on function api.my_onboarding() to authenticated;

-- Startseite: Stand, Vorname, Mitgliedschaft, verfügbare Abende.
create or replace function api.my_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_first text;
  v_membership jsonb;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000';
  end if;
  select f.first_name into v_first from private.account_facts f where f.user_id = uid;
  select jsonb_build_object('status', m.status, 'tier', m.tier, 'free_phase_ended_at', m.free_phase_ended_at)
    into v_membership from billing.memberships m where m.user_id = uid;
  return jsonb_build_object(
    'onboarding', app.onboarding_state(uid),
    'first_name', v_first,
    'membership', v_membership,
    'available_evenings', billing.available_evenings(uid),
    'is_admin_user', exists (select 1 from app.admin_users au where au.user_id = uid),
    'sanctions_active', safety.is_suspended(uid)
  );
end;
$$;
grant execute on function api.my_overview() to authenticated;

-- Admin-Status ohne Zwei-Faktor-Pflicht (für die Weiterleitung zur TOTP-Einrichtung).
create or replace function api.my_admin_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_admin_user', exists (select 1 from app.admin_users a where a.user_id = auth.uid()),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'is_admin', app.is_admin()
  );
$$;
grant execute on function api.my_admin_status() to authenticated;

-- Einstellungen, die das Formular kennen muss (ohne ops freizugeben).
create or replace function api.onboarding_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'collect_street', ops.setting_bool('account.collect_street'),
    'min_age', ops.setting_int('account.min_age'),
    'required_consents', to_jsonb(app.required_consents()),
    'verification_alternative_enabled', ops.setting_bool('verification.alternative_enabled')
  ) where auth.uid() is not null;
$$;
grant execute on function api.onboarding_settings() to authenticated;
