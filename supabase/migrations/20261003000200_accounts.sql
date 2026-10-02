-- Fermata · Konten, Fakten, Einwilligungen, Ausweisprüfung, Art.-9-Daten, Sperrliste
-- PLAN 2.2, 3.1, 3.2 Nr. 4–8. Grundsatz „immer auf Nummer sicher“: im Zweifel wie Art.-9-Daten behandeln.

-- ---------------------------------------------------------------------------
-- Konto
-- ---------------------------------------------------------------------------
create table app.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'onboarding'
    check (status in ('onboarding', 'active', 'paused', 'suspended', 'closed')),
  address_form text not null default 'sie' check (address_form in ('sie', 'du')),
  -- Freigeschaltete Gesprächstiefe (PLAN 5.6). Wird aus der Mitgliedschaft gesetzt; die spätere
  -- Store-App kann sie für alle freigeben, ohne Code zu ändern.
  tier_view text not null default 'auftakt' check (tier_view in ('auftakt', 'andante', 'loge')),
  is_founding_member boolean not null default false,
  waitlist_email_hash text,
  paused_until timestamptz,
  deletion_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table app.accounts is 'Ein Konto je Person. status: onboarding → active; paused (freiwillig), suspended (Sicherheit), closed.';
comment on column app.accounts.waitlist_email_hash is 'sha256 der E-Mail aus der Warteliste (Verknüpfung ohne Klartext).';
create trigger accounts_touch before update on app.accounts for each row execute function app.touch_updated_at();
alter table app.accounts enable row level security;
grant select on app.accounts to authenticated;
create policy accounts_own on app.accounts for select to authenticated using (user_id = auth.uid() or app.is_admin());

-- Einladungen aus dem Admin (PLAN 2.3 Nr. 3)
create table app.account_invitations (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null,
  waitlist_id uuid,
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  user_id uuid references auth.users (id) on delete set null,
  revoked_at timestamptz
);
comment on table app.account_invitations is 'Persönliche Einladungen zum Konto. Nur Admin und Functions.';
create unique index account_invitations_open_email on app.account_invitations (email) where accepted_at is null and revoked_at is null;
alter table app.account_invitations enable row level security;

-- ---------------------------------------------------------------------------
-- Konto-Fakten (Schema private, nie für die Auswahl)
-- ---------------------------------------------------------------------------
create table private.account_facts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  birth_date date not null,
  -- Frage B1: Straße vermutlich unnötig; Spalte bleibt optional und wird im Formular nur bei Bedarf gezeigt.
  street text check (street is null or char_length(street) <= 120),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  city text check (city is null or char_length(city) <= 80),
  phone text check (phone is null or phone ~ '^\+?[0-9 ()/-]{6,24}$'),
  updated_at timestamptz not null default now()
);
comment on table private.account_facts is 'Name, Anschrift, Geburtsdatum, Telefon (freiwillig). Lesen: Person selbst und Admin über api-Funktionen.';
create trigger account_facts_touch before update on private.account_facts for each row execute function app.touch_updated_at();
alter table private.account_facts enable row level security;

-- PLZ-Mittelpunkte (PLAN 3.4): Import offener Daten in M2, kein Geodienst zur Laufzeit.
create table app.postal_codes (
  postal_code text primary key check (postal_code ~ '^[0-9]{5}$'),
  place_name text not null,
  lat double precision not null check (lat between 47 and 56),
  lon double precision not null check (lon between 5 and 16),
  state text
);
comment on table app.postal_codes is 'PLZ-Mittelpunkte aus offenen Daten (Quelle und Lizenz: docs/DECISIONS.md).';
alter table app.postal_codes enable row level security;
grant select on app.postal_codes to authenticated;
create policy postal_codes_read on app.postal_codes for select to authenticated using (true);

create table app.geo (
  user_id uuid primary key references auth.users (id) on delete cascade,
  postal_code text not null,
  lat double precision not null,
  lon double precision not null,
  source text not null default 'plz_centroid' check (source in ('plz_centroid')),
  updated_at timestamptz not null default now()
);
comment on table app.geo is 'Nur der PLZ-Mittelpunkt, nie die genaue Anschrift.';
alter table app.geo enable row level security;
grant select on app.geo to authenticated;
create policy geo_own on app.geo for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Einwilligungen: nur anhängen (Art. 7 Abs. 1 DSGVO), aktueller Stand als Sicht.
-- ---------------------------------------------------------------------------
create table app.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'agb',                 -- Nutzungsbedingungen (Vertrag, keine Einwilligung im Sinne der DSGVO, aber versioniert)
    'datenschutz_kenntnis',-- Kenntnisnahme der Datenschutzerklärung
    'art9_profile',        -- Art. 9: Geschlecht, gesuchtes Geschlecht, Orientierung (vor dem Formular)
    'art9_religion',       -- Art. 9: Religion (freiwillig)
    'art9_health',         -- Art. 9: Gesundheit (freiwillig)
    'biometrie',           -- Ausweisprüfung mit Gesichtsabgleich (Didit)
    'gespraech',           -- Gespräch mit Viola, Verarbeitung von Stimme und Transkript
    'push',                -- Web-Push
    'kontakttausch'        -- Weitergabe der Kontaktdaten nach beidseitigem Ja (je Abend erneut bestätigt)
  )),
  action text not null check (action in ('granted', 'revoked')),
  document_version text not null,
  at timestamptz not null default now(),
  source text not null default 'web' check (source in ('web', 'app', 'admin'))
);
comment on table app.consents is 'Jede Erteilung und jeder Widerruf ist eine neue Zeile. Nie ändern.';
create index consents_user_kind_idx on app.consents (user_id, kind, at desc);
create trigger consents_no_update before update on app.consents for each row execute function ops.forbid_change();
alter table app.consents enable row level security;
grant select on app.consents to authenticated;
create policy consents_own on app.consents for select to authenticated using (user_id = auth.uid());

create view app.consents_current with (security_invoker = true) as
  select distinct on (c.user_id, c.kind)
    c.user_id, c.kind, (c.action = 'granted') as granted, c.document_version, c.at
  from app.consents c
  order by c.user_id, c.kind, c.at desc, c.id desc;
comment on view app.consents_current is 'Aktueller Einwilligungsstand je Person und Art.';
grant select on app.consents_current to authenticated;

create or replace function app.has_consent(p_user uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select cc.granted from app.consents_current cc where cc.user_id = p_user and cc.kind = p_kind), false);
$$;
comment on function app.has_consent(uuid, text) is 'true, wenn die neueste Zeile dieser Art eine Erteilung ist.';
grant execute on function app.has_consent(uuid, text) to authenticated, service_role, fermata_matcher, fermata_agent;

-- ---------------------------------------------------------------------------
-- Ausweisprüfung (PLAN 3.2 Nr. 6, 5.5): nur die erlaubten Felder.
-- ---------------------------------------------------------------------------
create table app.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null default 'didit' check (provider in ('didit', 'manual')),
  provider_session_id text unique,
  status text not null default 'started'
    check (status in ('started', 'approved', 'declined', 'in_review', 'expired', 'error', 'blocked')),
  is_adult boolean,
  birth_year integer check (birth_year is null or birth_year between 1900 and 2100),
  name_match boolean,
  birth_date_match boolean,
  blocklist_hit boolean not null default false,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  provider_session_deleted_at timestamptz
);
comment on table app.verifications is 'Ergebnis der Ausweisprüfung. Keine Bilder, keine Ausweisnummer. Didit-Sitzung wird nach dem Ergebnis gelöscht.';
comment on column app.verifications.provider_session_deleted_at is 'Nachweis, dass die Sitzung beim Anbieter gelöscht wurde.';
create index verifications_user_idx on app.verifications (user_id, started_at desc);
alter table app.verifications enable row level security;
grant select on app.verifications to authenticated;
create policy verifications_own on app.verifications for select to authenticated using (user_id = auth.uid() or app.is_admin());

create or replace function app.is_verified(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app.verifications v
    where v.user_id = p_user and v.status = 'approved' and v.is_adult and v.name_match and v.birth_date_match and not v.blocklist_hit
  );
$$;
grant execute on function app.is_verified(uuid) to authenticated, service_role, fermata_matcher, fermata_agent;

-- ---------------------------------------------------------------------------
-- Art.-9-Daten (PLAN 3.2 Nr. 4 und 5): verschlüsselt, eigene Rolle, Prüffunktionen.
-- Schlüssel liegt in Supabase Vault (Name fermata_sensitive_key), nie im Code.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fermata_sensitive_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'fermata_sensitive_key',
      'Schlüssel für verschlüsselte Spalten im Schema sensitive');
  end if;
end
$$;

create or replace function sensitive.key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'fermata_sensitive_key';
$$;
revoke execute on function sensitive.key() from public, anon, authenticated, service_role;

create or replace function sensitive.enc(p_value text)
returns bytea
language sql
volatile
security definer
set search_path = ''
as $$
  select case when p_value is null then null else extensions.pgp_sym_encrypt(p_value, sensitive.key(), 'cipher-algo=aes256') end;
$$;
create or replace function sensitive.dec(p_value bytea)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_value is null then null else extensions.pgp_sym_decrypt(p_value, sensitive.key()) end;
$$;
revoke execute on function sensitive.enc(text), sensitive.dec(bytea) from public, anon, authenticated, service_role;

create table sensitive.profile_identity (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gender_enc bytea not null,          -- 'frau' | 'mann' | 'nichtbinaer'
  seeking_genders_enc bytea not null, -- kommagetrennt, z. B. 'frau,nichtbinaer'
  orientation_enc bytea,              -- freiwillig
  updated_at timestamptz not null default now()
);
comment on table sensitive.profile_identity is 'Art. 9 (EuGH C-184/20): Geschlecht, gesuchtes Geschlecht, Orientierung. Verschlüsselt.';

create table sensitive.profile_sensitive (
  user_id uuid primary key references auth.users (id) on delete cascade,
  religion_enc bytea,
  religion_importance_enc bytea,      -- 'unwichtig' | 'etwas' | 'wichtig'
  religion_must_match boolean not null default false,
  health_notes_enc bytea,
  updated_at timestamptz not null default now()
);
comment on table sensitive.profile_sensitive is 'Art. 9: Religion und Gesundheit, nur mit eigener Einwilligung. Verschlüsselt.';

alter table sensitive.profile_identity enable row level security;
alter table sensitive.profile_sensitive enable row level security;
-- Eigentümer ist die eigene Rolle fermata_sensitive. Zugriff nur über die security-definer-Funktionen
-- unten (Eigentümer postgres, Mitglied von fermata_sensitive). service_role und die Auswahl lesen nie direkt.
grant usage, create on schema sensitive to fermata_sensitive;
alter table sensitive.profile_identity owner to fermata_sensitive;
alter table sensitive.profile_sensitive owner to fermata_sensitive;
revoke all on sensitive.profile_identity, sensitive.profile_sensitive from service_role, anon, authenticated;

-- Erlaubte Werte
create or replace function sensitive.valid_gender(p text)
returns boolean language sql immutable set search_path = '' as $$ select p in ('frau', 'mann', 'nichtbinaer'); $$;

-- Eigene Angaben speichern (nur mit Einwilligung art9_profile).
create or replace function api.save_identity(p_gender text, p_seeking text[], p_orientation text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '28000'; end if;
  if not app.has_consent(uid, 'art9_profile') then
    raise exception 'Einwilligung art9_profile fehlt' using errcode = '42501';
  end if;
  if not sensitive.valid_gender(p_gender) or p_seeking is null or cardinality(p_seeking) = 0
     or exists (select 1 from unnest(p_seeking) s where not sensitive.valid_gender(s)) then
    raise exception 'Ungültige Angabe' using errcode = '22023';
  end if;
  insert into sensitive.profile_identity (user_id, gender_enc, seeking_genders_enc, orientation_enc, updated_at)
  values (uid, sensitive.enc(p_gender), sensitive.enc(array_to_string(array(select distinct unnest(p_seeking) order by 1), ',')),
          sensitive.enc(nullif(trim(p_orientation), '')), now())
  on conflict (user_id) do update set
    gender_enc = excluded.gender_enc, seeking_genders_enc = excluded.seeking_genders_enc,
    orientation_enc = excluded.orientation_enc, updated_at = now();
end;
$$;
grant execute on function api.save_identity(text, text[], text) to authenticated;

create or replace function api.my_identity()
returns table (gender text, seeking text[], orientation text)
language sql
stable
security definer
set search_path = ''
as $$
  select sensitive.dec(pi.gender_enc), string_to_array(sensitive.dec(pi.seeking_genders_enc), ','), sensitive.dec(pi.orientation_enc)
  from sensitive.profile_identity pi where pi.user_id = auth.uid();
$$;
grant execute on function api.my_identity() to authenticated;

create or replace function api.save_religion(p_religion text, p_importance text, p_must_match boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Nicht angemeldet' using errcode = '28000'; end if;
  if not app.has_consent(uid, 'art9_religion') then
    raise exception 'Einwilligung art9_religion fehlt' using errcode = '42501';
  end if;
  if p_importance is not null and p_importance not in ('unwichtig', 'etwas', 'wichtig') then
    raise exception 'Ungültige Angabe' using errcode = '22023';
  end if;
  insert into sensitive.profile_sensitive (user_id, religion_enc, religion_importance_enc, religion_must_match, updated_at)
  values (uid, sensitive.enc(nullif(trim(p_religion), '')), sensitive.enc(p_importance), coalesce(p_must_match, false), now())
  on conflict (user_id) do update set
    religion_enc = excluded.religion_enc, religion_importance_enc = excluded.religion_importance_enc,
    religion_must_match = excluded.religion_must_match, updated_at = now();
end;
$$;
grant execute on function api.save_religion(text, text, boolean) to authenticated;

-- Prüffunktionen für die Auswahl: nur true/false, nie Rohdaten.
create or replace function sensitive.gender_compatible(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with x as (
    select pi.user_id, sensitive.dec(pi.gender_enc) as g, string_to_array(sensitive.dec(pi.seeking_genders_enc), ',') as s
    from sensitive.profile_identity pi where pi.user_id in (a, b)
  )
  select coalesce((
    select (xa.s @> array[xb.g]) and (xb.s @> array[xa.g])
    from x xa, x xb where xa.user_id = a and xb.user_id = b
  ), false);
$$;
comment on function sensitive.gender_compatible(uuid, uuid) is 'true, wenn beide jeweils das Geschlecht des anderen suchen. Ohne Angaben: false.';

create or replace function sensitive.religion_compatible(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with x as (
    select ps.user_id, lower(trim(sensitive.dec(ps.religion_enc))) as r, ps.religion_must_match as m
    from sensitive.profile_sensitive ps where ps.user_id in (a, b)
  ),
  xa as (select * from x where user_id = a),
  xb as (select * from x where user_id = b)
  select case
    when not coalesce((select m from xa), false) and not coalesce((select m from xb), false) then true
    else coalesce((select xa.r is not null and xa.r = xb.r from xa, xb), false)
  end;
$$;
comment on function sensitive.religion_compatible(uuid, uuid) is 'false nur, wenn eine Person gleiche Religion verlangt und sie nicht übereinstimmt.';

revoke execute on function sensitive.gender_compatible(uuid, uuid), sensitive.religion_compatible(uuid, uuid) from public, anon, authenticated;
grant execute on function sensitive.gender_compatible(uuid, uuid), sensitive.religion_compatible(uuid, uuid) to fermata_matcher, service_role;

-- ---------------------------------------------------------------------------
-- Sperrliste (PLAN 3.2 Nr. 7): nur Hashes.
-- ---------------------------------------------------------------------------
create table safety.blocklist (
  id uuid primary key default gen_random_uuid(),
  doc_hash text,   -- HMAC(Ausweisnummer + Geburtsdatum): sperrt automatisch
  name_hash text,  -- HMAC(normalisierter voller Name + Geburtsdatum): meldet nur einen Verdachtsfall
  reason_code text not null check (reason_code in ('null_toleranz', 'wiederholte_verstoesse', 'minderjaehrig', 'betrug', 'sonstiges')),
  report_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (doc_hash is not null or name_hash is not null)
);
comment on table safety.blocklist is 'Gesperrte Personen nur als Hashes. Aufbewahrung dauerhaft, Begründung in der DSFA.';
create index blocklist_doc_idx on safety.blocklist (doc_hash);
create index blocklist_name_idx on safety.blocklist (name_hash);
alter table safety.blocklist enable row level security;

create table safety.safety_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  source text not null check (source in ('agent', 'blocklist_name', 'report', 'system', 'admin')),
  kind text not null,
  severity text not null default 'mittel' check (severity in ('niedrig', 'mittel', 'hoch', 'akut')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  outcome text
);
comment on table safety.safety_flags is 'Hinweise für Benn: Sicherheits-Agent, Namens-Treffer der Sperrliste, Systemregeln.';
create index safety_flags_open_idx on safety.safety_flags (created_at) where reviewed_at is null;
alter table safety.safety_flags enable row level security;

-- Hash für die Sperrliste: HMAC mit eigenem Geheimnis aus Vault (nicht das Tagessalz).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'fermata_blocklist_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'fermata_blocklist_key',
      'HMAC-Schlüssel für die Sperrliste');
  end if;
end
$$;

create or replace function safety.blocklist_hash(p_input text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select encode(extensions.hmac(convert_to(p_input, 'UTF8'),
    convert_to((select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'fermata_blocklist_key'), 'UTF8'),
    'sha256'), 'hex');
$$;
create or replace function safety.normalize_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(translate(trim(p_name), 'ÄÖÜäöüßéèêáàâíìîóòôúùûçñ', 'AOUaousseeeaaaiiiooouuucn')), '[^a-z]', '', 'g');
$$;
revoke execute on function safety.blocklist_hash(text) from public, anon, authenticated;
grant execute on function safety.blocklist_hash(text), safety.normalize_name(text) to service_role;

-- Fakten und Sicht für die eigene Person (Schema private ist nicht über die API erreichbar).
create or replace function api.my_facts()
returns table (first_name text, last_name text, birth_date date, street text, postal_code text, city text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.first_name, f.last_name, f.birth_date, f.street, f.postal_code, f.city, f.phone
  from private.account_facts f where f.user_id = auth.uid();
$$;
grant execute on function api.my_facts() to authenticated;

grant select, insert, update, delete on all tables in schema app, private, safety to service_role;
