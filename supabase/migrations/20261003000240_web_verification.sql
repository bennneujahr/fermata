-- Fermata · Web-App (M2): Ausweisprüfung mit Didit (PLAN 2.3 Nr. 3, 3.2 Nr. 6–7, 5.5)
-- Gespeichert werden nur: volljährig ja/nein, Geburtsjahr, Prüf-ID, Name und Geburtsdatum stimmen ja/nein,
-- Sperrlisten-Treffer ja/nein und – im Schema safety – die Sperrlisten-Hashes (HMAC, nicht umkehrbar).
-- Ausweisnummer, Bilder und Name aus dem Ausweis werden nie gespeichert.
-- Aufrufe nur über die Edge Functions verification-start und verification-webhook (service_role).

-- ---------------------------------------------------------------------------
-- Sperrlisten-Hashes (PLAN 2.2 „Sperrlisten-Hash“, 3.2 Nr. 7). ALLES an EINER Stelle:
-- app.verification_record_hashes() rechnet die Hashes, speichert sie und gleicht mit safety.blocklist ab.
--
-- INTEGRATION (M7, Migration 20261003000710_safety_core.sql / 0720_safety_admin.sql):
-- * Tabelle safety.verification_hashes und die Funktionen safety.blocklist_doc_hash/-name_hash stammen
--   aus M7. Damit M2 allein lauffähig und testbar ist, legt dieser Block sie in GLEICHER Form an.
--   Beim Zusammenführen den Block „create table safety.verification_hashes …“ hier entfernen
--   (0710 legt die Tabelle ohne „if not exists“ an); die Funktionen sind wortgleich (create or replace).
-- * Nur app.verification_record_hashes() greift darauf zu; bei anderer Form genügt es, diese Funktion anzupassen.
-- ---------------------------------------------------------------------------
create table if not exists safety.verification_hashes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  doc_hash text,
  name_hash text,
  created_at timestamptz not null default now()
);
comment on table safety.verification_hashes is
  'HMAC(Ausweisnummer + Geburtsdatum) und HMAC(Name + Geburtsdatum) aus der Ausweisprüfung, nur für einen späteren Ausschluss. Wird mit dem Konto gelöscht.';
alter table safety.verification_hashes enable row level security;
grant select, insert, update, delete on safety.verification_hashes to service_role;

-- Wortgleich mit M7 (0720_safety_admin.sql): einheitliche Sperrlisten-Schlüssel.
create or replace function safety.blocklist_name_hash(p_first_name text, p_last_name text, p_birth_date date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_birth_date is null then null else
    safety.blocklist_hash('name:' || safety.normalize_name(coalesce(p_first_name, '') || coalesce(p_last_name, '')) || ':' || p_birth_date::text)
  end;
$$;
create or replace function safety.blocklist_doc_hash(p_document_number text, p_birth_date date)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_document_number is null or p_birth_date is null then null else
    safety.blocklist_hash('doc:' || upper(regexp_replace(p_document_number, '[^0-9A-Za-z]', '', 'g')) || ':' || p_birth_date::text)
  end;
$$;
revoke execute on function safety.blocklist_name_hash(text, text, date), safety.blocklist_doc_hash(text, date) from public, anon, authenticated;
grant execute on function safety.blocklist_name_hash(text, text, date), safety.blocklist_doc_hash(text, date) to service_role;

-- Die EINE Stelle für Sperrlisten-Hashes bei der Ausweisprüfung: rechnen, speichern (je Person, neueste Prüfung),
-- abgleichen. doc_hit sperrt (Aufrufer), name_hit meldet nur einen Verdacht. Ausweisnummer und Name werden nie gespeichert.
create or replace function app.verification_record_hashes(
  p_user uuid,
  p_document_number text,
  p_first_name text,
  p_last_name text,
  p_birth_date date
)
returns table (doc_hit boolean, name_hit boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc text := safety.blocklist_doc_hash(nullif(btrim(coalesce(p_document_number, '')), ''), p_birth_date);
  v_name text := case when nullif(btrim(coalesce(p_first_name, '') || coalesce(p_last_name, '')), '') is null then null
                      else safety.blocklist_name_hash(p_first_name, p_last_name, p_birth_date) end;
begin
  if v_doc is not null or v_name is not null then
    insert into safety.verification_hashes (user_id, doc_hash, name_hash, created_at)
    values (p_user, v_doc, v_name, now())
    on conflict (user_id) do update set
      doc_hash = coalesce(excluded.doc_hash, safety.verification_hashes.doc_hash),
      name_hash = coalesce(excluded.name_hash, safety.verification_hashes.name_hash),
      created_at = now();
  end if;
  doc_hit := v_doc is not null and exists (select 1 from safety.blocklist b where b.doc_hash = v_doc);
  name_hit := v_name is not null and exists (select 1 from safety.blocklist b where b.name_hash = v_name);
  return next;
end;
$$;
comment on function app.verification_record_hashes(uuid, text, text, text, date) is
  'Einzige Stelle für Sperrlisten-Hashes der Ausweisprüfung (M2↔M7): rechnen, in safety.verification_hashes speichern, mit safety.blocklist abgleichen.';
revoke execute on function app.verification_record_hashes(uuid, text, text, text, date) from public, anon, authenticated;
grant execute on function app.verification_record_hashes(uuid, text, text, text, date) to service_role;

-- Namensabgleich: Nachname gleich (normalisiert); Vorname gleich oder einer der Vornamen aus dem Ausweis.
create or replace function app.names_match(p_fact_first text, p_fact_last text, p_doc_first text, p_doc_last text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    safety.normalize_name(p_fact_last) <> '' and safety.normalize_name(p_fact_last) = safety.normalize_name(p_doc_last)
    and safety.normalize_name(p_fact_first) <> ''
    and (safety.normalize_name(p_fact_first) = safety.normalize_name(p_doc_first)
         or safety.normalize_name(p_fact_first) in (
              select safety.normalize_name(x) from regexp_split_to_table(coalesce(p_doc_first, ''), '[[:space:]-]+') x)),
    false);
$$;
comment on function app.names_match(text, text, text, text) is
  'Name aus dem Formular passt zum Ausweis: Nachname gleich, Vorname gleich oder einer der Vornamen. Ohne Umlaute/Akzente, ohne Groß/klein.';
grant execute on function app.names_match(text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Ablauf
-- ---------------------------------------------------------------------------
create or replace function ops.verification_begin(p_user uuid, p_provider text default 'didit')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a app.accounts;
  v_attempts integer;
  v_id uuid;
begin
  select * into a from app.accounts where user_id = p_user;
  if not found then
    raise exception 'Kein Mitgliedskonto' using errcode = '42501', hint = 'no_account';
  end if;
  if a.status not in ('onboarding', 'active') then
    raise exception 'Konto nicht aktiv' using errcode = '42501', hint = 'account_inactive';
  end if;
  if not app.has_consent(p_user, 'biometrie') then
    raise exception 'Einwilligung biometrie fehlt' using errcode = '42501', hint = 'consent_missing';
  end if;
  if not exists (select 1 from private.account_facts f where f.user_id = p_user) then
    raise exception 'Erst das Formular ausfüllen' using errcode = '42501', hint = 'facts_missing';
  end if;
  if app.is_verified(p_user) then
    raise exception 'Ausweis bereits geprüft' using errcode = '23505', hint = 'already_verified';
  end if;
  if exists (select 1 from app.verifications v where v.user_id = p_user and v.status in ('in_review', 'blocked')) then
    raise exception 'Prüfung läuft noch oder ist gesperrt' using errcode = '42501', hint = 'verification_pending';
  end if;
  select count(*)::integer into v_attempts from app.verifications v
  where v.user_id = p_user and v.status in ('declined', 'expired', 'error');
  if v_attempts >= ops.setting_int('verification.max_attempts') then
    raise exception 'Zu viele Versuche' using errcode = '42501', hint = 'too_many_attempts';
  end if;

  -- Unvollständige frühere Versuche schließen.
  update app.verifications set status = 'expired', completed_at = app.now()
  where user_id = p_user and status = 'started';

  insert into app.verifications (user_id, provider, status, started_at)
  values (p_user, p_provider, 'started', app.now())
  returning id into v_id;
  return jsonb_build_object('verification_id', v_id);
end;
$$;
comment on function ops.verification_begin(uuid, text) is 'Prüft Einwilligung biometrie, Formular und Versuche und legt eine Prüfung an.';

create or replace function ops.verification_attach_session(p_verification uuid, p_session_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update app.verifications set provider_session_id = p_session_id
  where id = p_verification and status = 'started' and provider_session_id is null;
  if not found then
    raise exception 'Prüfung nicht gefunden' using errcode = 'P0002';
  end if;
end;
$$;

-- Ergebnis verarbeiten. p_provider_status: approved | declined | in_review | expired | error.
-- Name, Geburtsdatum und Ausweisnummer werden nur verglichen bzw. gehasht, nie gespeichert.
create or replace function ops.verification_complete(
  p_session_id text,
  p_provider_status text,
  p_first_name text default null,
  p_last_name text default null,
  p_birth_date date default null,
  p_document_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v app.verifications;
  f private.account_facts;
  v_adult boolean;
  v_name boolean;
  v_birth boolean;
  v_doc_hit boolean := false;
  v_name_hit boolean := false;
  v_status text;
begin
  if p_provider_status not in ('approved', 'declined', 'in_review', 'expired', 'error') then
    raise exception 'Unbekannter Status' using errcode = '22023';
  end if;
  select * into v from app.verifications where provider_session_id = p_session_id for update;
  if not found then
    raise exception 'Prüfung nicht gefunden' using errcode = 'P0002';
  end if;
  if v.completed_at is not null then
    return jsonb_build_object('verification_id', v.id, 'user_id', v.user_id, 'status', v.status, 'final', true, 'already', true);
  end if;

  if p_provider_status = 'in_review' then
    update app.verifications set status = 'in_review' where id = v.id;
    return jsonb_build_object('verification_id', v.id, 'user_id', v.user_id, 'status', 'in_review', 'final', false);
  end if;
  if p_provider_status in ('expired', 'error') then
    update app.verifications set status = p_provider_status, completed_at = app.now() where id = v.id;
    return jsonb_build_object('verification_id', v.id, 'user_id', v.user_id, 'status', p_provider_status, 'final', true);
  end if;

  select * into f from private.account_facts where user_id = v.user_id;
  v_adult := app.is_of_age(p_birth_date);
  v_birth := f.user_id is not null and p_birth_date is not null and f.birth_date = p_birth_date;
  v_name := f.user_id is not null and app.names_match(f.first_name, f.last_name, p_first_name, p_last_name);
  select h.doc_hit, h.name_hit into v_doc_hit, v_name_hit
  from app.verification_record_hashes(v.user_id, p_document_number, p_first_name, p_last_name, p_birth_date) h;

  v_status := case
    when v_doc_hit then 'blocked'
    when p_provider_status <> 'approved' then 'declined'
    when not v_adult or not v_name or not v_birth then 'declined'
    else 'approved'
  end;

  update app.verifications set
    status = v_status,
    is_adult = case when p_birth_date is null then null else v_adult end,
    birth_year = extract(year from p_birth_date)::integer,
    name_match = v_name,
    birth_date_match = v_birth,
    blocklist_hit = v_doc_hit,
    completed_at = app.now()
  where id = v.id;

  if v_doc_hit then
    -- Automatische Sperre (Ausweis steht auf der Sperrliste) und Hinweis für Benn.
    update app.accounts set status = 'suspended' where user_id = v.user_id;
    insert into safety.sanctions (user_id, kind, reason, starts_at)
    values (v.user_id, 'vorlaeufige_sperre', 'Ausweis steht auf der Sperrliste (automatisch)', app.now());
    insert into safety.safety_flags (user_id, source, kind, severity, details)
    values (v.user_id, 'system', 'sperrliste_ausweis', 'hoch', jsonb_build_object('verification_id', v.id));
  elsif v_name_hit then
    -- Nur Verdacht (Namensgleichheit möglich): keine Sperre, Benn prüft.
    insert into safety.safety_flags (user_id, source, kind, severity, details)
    values (v.user_id, 'blocklist_name', 'sperrliste_name', 'mittel', jsonb_build_object('verification_id', v.id));
  end if;
  if p_birth_date is not null and not v_adult then
    insert into safety.safety_flags (user_id, source, kind, severity, details)
    values (v.user_id, 'system', 'minderjaehrig', 'hoch', jsonb_build_object('verification_id', v.id));
  end if;

  if v_status = 'approved' then
    insert into app.profile_core (user_id, birth_year) values (v.user_id, extract(year from p_birth_date)::integer)
    on conflict (user_id) do update set birth_year = excluded.birth_year;
  end if;
  perform app.refresh_account_status(v.user_id);

  insert into ops.audit_log (action, target_table, target_id, details)
  values ('verification.completed', 'app.verifications', v.id::text,
          jsonb_build_object('status', v_status, 'name_flag', v_name_hit));

  return jsonb_build_object('verification_id', v.id, 'user_id', v.user_id, 'status', v_status, 'final', true);
end;
$$;
comment on function ops.verification_complete(text, text, text, text, date, text) is
  'Wertet das Ergebnis aus: volljährig, Abgleich Name/Geburtsdatum, Sperrliste (Ausweis sperrt, Name meldet). Speichert nur erlaubte Felder.';

create or replace function ops.verification_session_deleted(p_session_id text)
returns void
language sql
security definer
set search_path = ''
as $$
  update app.verifications set provider_session_deleted_at = coalesce(provider_session_deleted_at, app.now())
  where provider_session_id = p_session_id;
$$;

-- Abgeschlossene Prüfungen, deren Sitzung beim Anbieter noch nicht gelöscht ist (Nachholen).
create or replace function ops.verifications_pending_deletion(p_limit integer default 20)
returns table (verification_id uuid, provider text, provider_session_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.provider, v.provider_session_id from app.verifications v
  where v.completed_at is not null and v.provider_session_id is not null and v.provider_session_deleted_at is null
  order by v.completed_at
  limit greatest(p_limit, 0);
$$;

revoke execute on function ops.verification_begin(uuid, text), ops.verification_attach_session(uuid, text),
  ops.verification_complete(text, text, text, text, date, text), ops.verification_session_deleted(text),
  ops.verifications_pending_deletion(integer) from public, anon, authenticated;
grant execute on function ops.verification_begin(uuid, text), ops.verification_attach_session(uuid, text),
  ops.verification_complete(text, text, text, text, date, text), ops.verification_session_deleted(text),
  ops.verifications_pending_deletion(integer) to service_role;
