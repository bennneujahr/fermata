-- Fermata · Warteliste (M1)
-- PLAN 2.2 (Daten), 2.3 Nr. 1 und 2 (Abläufe), 3.2 Nr. 1–3 (Platz, Gründungsmitglied, Einladungen).
--
-- Grundsätze:
-- - Alle Tabellen liegen in public, haben RLS und KEINE Rechte oder Policies für anon/authenticated.
--   Zugriff nur über die Funktionen im Schema api (security definer), aufgerufen von den Edge Functions.
-- - Tokens erzeugen die Edge Functions; hier liegen nur SHA-256-Hashes (hex).
-- - Zeit immer über app.now() (Testuhr).
-- - Die Antwort auf eine Anmeldung ist für neue, unbestätigte und bestätigte Adressen gleich
--   ("result": "ok"); nur die Edge Function erfährt, welche Mail zu schicken ist.

-- ---------------------------------------------------------------------------
-- Einstellungen, die M1 zusätzlich braucht (M0 hat waitlist.* und landing.* angelegt)
-- ---------------------------------------------------------------------------
insert into ops.app_settings (key, value, description, category, is_public) values
  ('waitlist.resend_min_minutes', '10',
   'Frühestens nach so vielen Minuten geht an dieselbe Adresse erneut eine Mail der Warteliste (gegen Mail-Bomben).', 'warteliste', false),
  ('waitlist.consent_version', '"warteliste-2026-10-03-entwurf"',
   'Aktuelle Version des Einwilligungstexts der Warteliste (ops.legal_documents, kind einwilligung_warteliste).', 'warteliste', true),
  ('landing.poster_codes', 'null',
   'Plakat-Kürzel, die gezählt werden (JSON-Liste, z. B. ["pfaffenteich"]). null zählt jedes gültige Kürzel.', 'landingpage', false)
on conflict (key) do nothing;

-- Einwilligungstext der Warteliste (Nachweis nach Art. 7 Abs. 1 DSGVO: jede Zeile in waitlist verweist auf die Version).
-- Der Text steht wortgleich in apps/landing/src/content/form.ts. ENTWURF bis zur Prüfung durch den Anwalt (PLAN 5.13, Frage A9).
insert into ops.legal_documents (kind, version, status, title, body_markdown)
values (
  'einwilligung_warteliste',
  'warteliste-2026-10-03-entwurf',
  'entwurf',
  'Einwilligung Warteliste',
  'Ich möchte auf die Warteliste von Fermata. Dafür darf Fermata mir E-Mails schicken: die Bestätigung, meinen Platz und Nachrichten zum Start in meiner Region. Ich kann mich jederzeit abmelden; dann wird mein Eintrag gelöscht. Einzelheiten stehen in der Datenschutzerklärung.'
)
on conflict (kind, version) do nothing;

-- ---------------------------------------------------------------------------
-- Regionen: Auswahl im Formular → Gruppe (für Platznummern und Gründungsstatus)
-- ---------------------------------------------------------------------------
create or replace function app.waitlist_region_group(p_region text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case p_region
    when 'schwerin' then 'westmecklenburg'
    when 'nordwestmecklenburg' then 'westmecklenburg'
    when 'ludwigslust-parchim' then 'westmecklenburg'
    when 'hamburg' then 'hamburg'
    when 'luebeck' then 'luebeck'
    when 'rostock' then 'rostock'
    when 'anderswo' then 'anderswo'
  end;
$$;
comment on function app.waitlist_region_group(text) is
  'Regionsauswahl der Warteliste → Gruppe (westmecklenburg, hamburg, luebeck, rostock, anderswo). null = unbekannt. Liste in apps/landing/src/content/form.ts.';

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  email extensions.citext not null,
  region text not null,
  region_group text generated always as (app.waitlist_region_group(region)) stored,
  postal_code text not null,
  consent_text_version text not null,
  consent_at timestamptz not null,
  source text,
  invited_by_code text,
  confirm_token_hash text,
  confirm_expires_at timestamptz,
  confirmed_at timestamptz,
  base_number integer,
  bonus_steps integer not null default 0,
  is_founding_member boolean not null default false,
  status_token_hash text,
  unsubscribe_token_hash text,
  last_mail_at timestamptz,
  invited_to_app_at timestamptz,
  created_at timestamptz not null default app.now(),
  constraint waitlist_email_key unique (email),
  constraint waitlist_region_group_key unique (region_group, base_number),
  constraint waitlist_confirm_token_key unique (confirm_token_hash),
  constraint waitlist_status_token_key unique (status_token_hash),
  constraint waitlist_unsubscribe_token_key unique (unsubscribe_token_hash),
  constraint waitlist_first_name_check check (first_name ~ '^[[:alpha:]][[:alpha:] .''’-]{0,59}$'),
  constraint waitlist_email_check check (char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint waitlist_region_check check (app.waitlist_region_group(region) is not null),
  constraint waitlist_postal_code_check check (postal_code ~ '^[0-9]{5}$'),
  constraint waitlist_source_check check (source is null or source ~ '^[a-z0-9-]{1,40}$'),
  constraint waitlist_invited_by_code_check check (invited_by_code is null or invited_by_code ~ '^[A-Z0-9]{8}$'),
  constraint waitlist_bonus_steps_check check (bonus_steps >= 0),
  constraint waitlist_confirmed_check check ((confirmed_at is null) = (base_number is null)),
  constraint waitlist_hash_check check (
    (confirm_token_hash is null or confirm_token_hash ~ '^[0-9a-f]{64}$')
    and (status_token_hash is null or status_token_hash ~ '^[0-9a-f]{64}$')
    and (unsubscribe_token_hash is null or unsubscribe_token_hash ~ '^[0-9a-f]{64}$')
  )
);
comment on table public.waitlist is
  'Warteliste (PLAN 2.2). Unbestätigte Einträge werden nach waitlist.unconfirmed_retention_days gelöscht, bestätigte bei Abmeldung. Zugriff nur über api.waitlist_*.';
comment on column public.waitlist.region_group is 'Aus region abgeleitet; Platznummern und Gründungsstatus gelten je Gruppe.';
comment on column public.waitlist.base_number is 'Grundnummer, bei Bestätigung fortlaufend je region_group vergeben (PLAN 3.2 Nr. 1).';
comment on column public.waitlist.bonus_steps is 'Vorrückungen: je bestätigter Einladung (eingeladen oder eingeladen worden) eine Stufe.';
comment on column public.waitlist.is_founding_member is 'Bei Bestätigung einmal festgelegt, nie entzogen (PLAN 3.2 Nr. 2).';
comment on column public.waitlist.last_mail_at is 'Zeit der letzten Mail an diese Adresse (Bestätigung oder Statuslink), für die Mindestpause.';
comment on column public.waitlist.invited_to_app_at is 'Wann die Person in die Web-App eingeladen wurde (M2).';

create index waitlist_ranking_idx on public.waitlist (region_group, base_number) where confirmed_at is not null;
create index waitlist_unconfirmed_idx on public.waitlist (created_at) where confirmed_at is null;

-- Zähler für Grundnummern: die Zeilensperre beim Hochzählen serialisiert gleichzeitige Bestätigungen je Gruppe.
-- Nummern werden nie wiederverwendet, auch nicht nach einer Abmeldung.
create table public.waitlist_counters (
  region_group text primary key check (region_group in ('westmecklenburg', 'hamburg', 'luebeck', 'rostock', 'anderswo')),
  last_number integer not null default 0 check (last_number >= 0)
);
comment on table public.waitlist_counters is 'Zuletzt vergebene Grundnummer je Gruppe der Warteliste.';
insert into public.waitlist_counters (region_group)
values ('westmecklenburg'), ('hamburg'), ('luebeck'), ('rostock'), ('anderswo');

create table public.waitlist_invites (
  code text primary key check (code ~ '^[A-Z0-9]{8}$'),
  inviter_id uuid not null references public.waitlist (id) on delete cascade,
  used_by uuid unique references public.waitlist (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default app.now()
);
comment on table public.waitlist_invites is
  'Persönliche Einladungen (PLAN 3.2 Nr. 3). Ein Code wirkt einmal; genutzt = used_at gesetzt (bleibt, auch wenn die eingeladene Person sich abmeldet).';
create index waitlist_invites_inviter_idx on public.waitlist_invites (inviter_id);

create table public.signup_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  at timestamptz not null default app.now()
);
comment on table public.signup_attempts is 'Drossel der Anmeldungen. IP nur als HMAC mit Tagessalz (ops.daily_hash); Einträge werden nach 24 h gelöscht.';
create index signup_attempts_ip_idx on public.signup_attempts (ip_hash, at);
create index signup_attempts_at_idx on public.signup_attempts (at);

create table public.link_hits (
  slug text not null check (slug ~ '^[a-z0-9-]{1,40}$'),
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (slug, day)
);
comment on table public.link_hits is 'Plakat-Zähler je Kürzel und Tag (PLAN 2.3 Nr. 2). Ohne IP, ohne Cookie, ohne Personenbezug.';

-- RLS an, keine Policies; keine Rechte für anon und authenticated.
alter table public.waitlist enable row level security;
alter table public.waitlist_counters enable row level security;
alter table public.waitlist_invites enable row level security;
alter table public.signup_attempts enable row level security;
alter table public.link_hits enable row level security;

revoke all on table public.waitlist, public.waitlist_counters, public.waitlist_invites, public.signup_attempts, public.link_hits
  from public, anon, authenticated;
revoke all on sequence public.signup_attempts_id_seq from public, anon, authenticated;
grant select, insert, update, delete on table public.waitlist, public.waitlist_counters, public.waitlist_invites,
  public.signup_attempts, public.link_hits to service_role;
grant usage, select on sequence public.signup_attempts_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Interne Hilfen (Schema app, nicht über die API erreichbar)
-- ---------------------------------------------------------------------------

-- Einladungscode: 8 Zeichen ohne verwechselbare Zeichen (kein I, O, 0, 1). 32 Zeichen → gleichverteilt.
create or replace function app.waitlist_new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.waitlist_invites w where w.code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function app.waitlist_create_invite(p_inviter uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := app.waitlist_new_invite_code();
    begin
      insert into public.waitlist_invites (code, inviter_id) values (v_code, p_inviter);
      return v_code;
    exception when unique_violation then
      -- extrem selten: gleicher Code gleichzeitig vergeben → neu würfeln
    end;
  end loop;
end;
$$;

-- Angezeigter Platz (PLAN 3.2 Nr. 1): Reihenfolge nach base_number − bonus_places × bonus_steps,
-- bei Gleichstand nach confirmed_at, je region_group, nur bestätigte Einträge. Platz 1 ist der kleinste.
create or replace function app.waitlist_place(p_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select w.region_group from public.waitlist w where w.id = p_id and w.confirmed_at is not null
  ),
  ranked as (
    select w.id,
           row_number() over (
             order by w.base_number - ops.setting_int('waitlist.bonus_places') * w.bonus_steps, w.confirmed_at, w.base_number
           ) as place
    from public.waitlist w
    join me on me.region_group = w.region_group
    where w.confirmed_at is not null
  )
  select greatest(1, r.place)::integer from ranked r where r.id = p_id;
$$;
comment on function app.waitlist_place(uuid) is 'Berechneter Platz auf der Warteliste je Gruppe (mindestens 1). null für unbestätigte oder unbekannte Einträge.';

create or replace function app.waitlist_is_hash(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null and p ~ '^[0-9a-f]{64}$';
$$;

revoke all on function app.waitlist_new_invite_code(), app.waitlist_create_invite(uuid), app.waitlist_place(uuid),
  app.waitlist_is_hash(text) from public, anon, authenticated;
grant execute on function app.waitlist_region_group(text) to service_role;

-- ---------------------------------------------------------------------------
-- api.waitlist_signup – Anmeldung (Double-Opt-in, Schritt 1)
-- Rückgabe:
--   {"result": "ok", "send": "confirm" | "already" | null, "first_name": …}
--   {"result": "invalid", "fields": {"email": "invalid", …}}
--   {"result": "throttled"}
-- "send" sagt der Edge Function, welche Mail sie schicken soll; die Antwort an den Browser ist immer gleich.
-- ---------------------------------------------------------------------------
create or replace function api.waitlist_signup(
  p_first_name text,
  p_email text,
  p_region text,
  p_postal_code text,
  p_consent_version text,
  p_source text,
  p_invite_code text,
  p_ip text,
  p_confirm_token_hash text,
  p_status_token_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := app.now();
  v_ip_hash text;
  v_attempts integer;
  v_fields jsonb := '{}'::jsonb;
  v_first_name text := regexp_replace(btrim(coalesce(p_first_name, '')), '\s+', ' ', 'g');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_region text := btrim(coalesce(p_region, ''));
  v_postal text := btrim(coalesce(p_postal_code, ''));
  v_source text := nullif(lower(btrim(coalesce(p_source, ''))), '');
  v_invite text := nullif(upper(regexp_replace(coalesce(p_invite_code, ''), '[\s-]', '', 'g')), '');
  v_resend interval := make_interval(mins => ops.setting_int('waitlist.resend_min_minutes'));
  v_expires timestamptz := v_now + make_interval(hours => ops.setting_int('waitlist.confirm_token_hours'));
  v_row public.waitlist;
begin
  if not app.waitlist_is_hash(p_confirm_token_hash) or not app.waitlist_is_hash(p_status_token_hash) then
    raise exception 'Token-Hashes fehlen oder haben das falsche Format.' using errcode = '22023';
  end if;

  -- Drossel (PLAN 2.3 Nr. 1): jeder Versuch zählt, auch ungültige.
  v_ip_hash := ops.daily_hash('waitlist:' || coalesce(nullif(btrim(p_ip), ''), 'unbekannt'));
  insert into public.signup_attempts (ip_hash, at) values (v_ip_hash, v_now);
  select count(*) into v_attempts
  from public.signup_attempts a
  where a.ip_hash = v_ip_hash and a.at > v_now - interval '1 hour';
  if v_attempts > ops.setting_int('waitlist.rate_limit_per_hour') then
    return jsonb_build_object('result', 'throttled');
  end if;

  -- Prüfen (die Edge Function prüft vorher schon; hier gilt die Regel verbindlich).
  if v_first_name !~ '^[[:alpha:]][[:alpha:] .''’-]{0,59}$' then
    v_fields := v_fields || jsonb_build_object('first_name', 'invalid');
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    v_fields := v_fields || jsonb_build_object('email', 'invalid');
  end if;
  if app.waitlist_region_group(v_region) is null then
    v_fields := v_fields || jsonb_build_object('region', 'invalid');
  end if;
  if v_postal !~ '^[0-9]{5}$' then
    v_fields := v_fields || jsonb_build_object('postal_code', 'invalid');
  end if;
  if not exists (
    select 1 from ops.legal_documents d
    where d.kind = 'einwilligung_warteliste' and d.version = p_consent_version and d.status <> 'abgeloest'
  ) then
    v_fields := v_fields || jsonb_build_object('consent', 'invalid');
  end if;
  if v_fields <> '{}'::jsonb then
    return jsonb_build_object('result', 'invalid', 'fields', v_fields);
  end if;

  -- Ungültige Kürzel oder Codes verhindern die Anmeldung nicht, sie werden nur nicht gespeichert.
  if v_source is not null and v_source !~ '^[a-z0-9-]{1,40}$' then
    v_source := null;
  end if;
  if v_invite is not null and v_invite !~ '^[A-Z0-9]{8}$' then
    v_invite := null;
  end if;

  select * into v_row from public.waitlist w where w.email = v_email::extensions.citext for update;

  if not found then
    insert into public.waitlist (
      first_name, email, region, postal_code, consent_text_version, consent_at, source, invited_by_code,
      confirm_token_hash, confirm_expires_at, last_mail_at, created_at
    ) values (
      v_first_name, v_email, v_region, v_postal, p_consent_version, v_now, v_source, v_invite,
      p_confirm_token_hash, v_expires, v_now, v_now
    )
    on conflict (email) do nothing
    returning * into v_row;
    if not found then
      -- Gleichzeitige Anmeldung mit derselben Adresse: die andere Anfrage schickt die Mail.
      return jsonb_build_object('result', 'ok', 'send', null);
    end if;
    return jsonb_build_object('result', 'ok', 'send', 'confirm', 'first_name', v_row.first_name);
  end if;

  if v_row.last_mail_at is not null and v_row.last_mail_at > v_now - v_resend then
    return jsonb_build_object('result', 'ok', 'send', null);
  end if;

  if v_row.confirmed_at is null then
    -- Noch nicht bestätigt: neuer Link (der alte verliert seine Gültigkeit), Angaben aktualisieren.
    update public.waitlist w set
      first_name = v_first_name,
      region = v_region,
      postal_code = v_postal,
      consent_text_version = p_consent_version,
      consent_at = v_now,
      source = coalesce(v_source, w.source),
      invited_by_code = coalesce(v_invite, w.invited_by_code),
      confirm_token_hash = p_confirm_token_hash,
      confirm_expires_at = v_expires,
      last_mail_at = v_now
    where w.id = v_row.id;
    return jsonb_build_object('result', 'ok', 'send', 'confirm', 'first_name', v_first_name);
  end if;

  -- Schon bestätigt: neuer persönlicher Statuslink per Mail (der alte Link verliert seine Gültigkeit).
  update public.waitlist w set status_token_hash = p_status_token_hash, last_mail_at = v_now where w.id = v_row.id;
  return jsonb_build_object('result', 'ok', 'send', 'already', 'first_name', v_row.first_name);
end;
$$;
comment on function api.waitlist_signup(text, text, text, text, text, text, text, text, text, text) is
  'Anmeldung zur Warteliste: Drossel, Prüfung, neutrale Antwort, erneuter Versand für unbestätigte Adressen.';

-- Mailversand fehlgeschlagen: Mindestpause zurücksetzen, damit ein erneuter Versuch sofort eine Mail auslöst.
create or replace function api.waitlist_mail_failed(p_email text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.waitlist w set last_mail_at = null where w.email = lower(btrim(coalesce(p_email, '')))::extensions.citext;
$$;
comment on function api.waitlist_mail_failed(text) is 'Setzt die Mindestpause zurück, wenn der Versand einer Wartelisten-Mail fehlschlug.';

-- ---------------------------------------------------------------------------
-- api.waitlist_confirm – Bestätigung (Double-Opt-in, Schritt 2)
-- Vergibt Grundnummer, Gründungsstatus, Einladungscode(s) und schreibt Vorrückungen gut.
-- Rückgabe: {"result": "ok", …} | {"result": "invalid"} | {"result": "expired"}
-- ---------------------------------------------------------------------------
create or replace function api.waitlist_confirm(
  p_confirm_token_hash text,
  p_status_token_hash text,
  p_unsubscribe_token_hash text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := app.now();
  v_row public.waitlist;
  v_number integer;
  v_confirmed_at timestamptz;
  v_founding boolean;
  v_inviter uuid;
  v_codes text[] := '{}';
begin
  if not app.waitlist_is_hash(p_status_token_hash) or not app.waitlist_is_hash(p_unsubscribe_token_hash) then
    raise exception 'Token-Hashes fehlen oder haben das falsche Format.' using errcode = '22023';
  end if;
  if not app.waitlist_is_hash(p_confirm_token_hash) then
    return jsonb_build_object('result', 'invalid');
  end if;

  select * into v_row from public.waitlist w where w.confirm_token_hash = p_confirm_token_hash for update;
  if not found or v_row.confirmed_at is not null then
    return jsonb_build_object('result', 'invalid');
  end if;
  if v_row.confirm_expires_at is null or v_row.confirm_expires_at <= v_now then
    return jsonb_build_object('result', 'expired');
  end if;

  -- Grundnummer: Zeilensperre auf dem Zähler der Gruppe.
  update public.waitlist_counters c set last_number = c.last_number + 1
  where c.region_group = v_row.region_group
  returning c.last_number into v_number;

  -- Zeitpunkt erst nach der Sperre bestimmen, damit confirmed_at und base_number dieselbe Reihenfolge haben.
  v_confirmed_at := v_now + (clock_timestamp() - now());

  -- Gründungsmitglied: die ersten founding_limit Bestätigungen der Gründungsregion (nach confirmed_at).
  -- Abmeldungen geben keinen Platz frei; der Status wird nie neu berechnet oder entzogen.
  v_founding := v_row.region_group = ops.setting_text('waitlist.founding_region_group')
                and v_number <= ops.setting_int('waitlist.founding_limit');

  update public.waitlist w set
    confirmed_at = v_confirmed_at,
    base_number = v_number,
    is_founding_member = v_founding,
    confirm_token_hash = null,
    confirm_expires_at = null,
    status_token_hash = p_status_token_hash,
    unsubscribe_token_hash = p_unsubscribe_token_hash
  where w.id = v_row.id;

  -- Eigene Einladungscodes.
  for i in 1..greatest(0, ops.setting_int('waitlist.invites_per_person')) loop
    v_codes := v_codes || app.waitlist_create_invite(v_row.id);
  end loop;

  -- Eingeladen worden? Dann rücken beide eine Stufe vor (PLAN 3.2 Nr. 1). Jeder Code wirkt nur einmal.
  if v_row.invited_by_code is not null then
    update public.waitlist_invites i set used_by = v_row.id, used_at = v_confirmed_at
    where i.code = v_row.invited_by_code and i.used_at is null and i.inviter_id <> v_row.id
    returning i.inviter_id into v_inviter;
    if v_inviter is not null then
      update public.waitlist w set bonus_steps = w.bonus_steps + 1 where w.id in (v_inviter, v_row.id);
    end if;
  end if;

  return jsonb_build_object(
    'result', 'ok',
    'first_name', v_row.first_name,
    'email', v_row.email::text,
    'region', v_row.region,
    'region_group', v_row.region_group,
    'place', app.waitlist_place(v_row.id),
    'is_founding_member', v_founding,
    'invite_codes', to_jsonb(v_codes),
    'invited', v_inviter is not null
  );
end;
$$;
comment on function api.waitlist_confirm(text, text, text) is
  'Bestätigung: Grundnummer je Gruppe (gesperrt), Gründungsstatus, Einladungscodes, Vorrückung für beide bei Einladung.';

-- ---------------------------------------------------------------------------
-- api.waitlist_status – persönliche Statusseite (/willkommen#t=…)
-- ---------------------------------------------------------------------------
create or replace function api.waitlist_status(p_status_token_hash text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'first_name', w.first_name,
    'region', w.region,
    'region_group', w.region_group,
    'place', app.waitlist_place(w.id),
    'is_founding_member', w.is_founding_member,
    'bonus_steps', w.bonus_steps,
    'bonus_places', ops.setting_int('waitlist.bonus_places'),
    'confirmed_at', w.confirmed_at,
    'invited_to_app', w.invited_to_app_at is not null,
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('code', i.code, 'used', i.used_at is not null) order by i.created_at, i.code)
      from public.waitlist_invites i where i.inviter_id = w.id
    ), '[]'::jsonb)
  )
  from public.waitlist w
  where app.waitlist_is_hash(p_status_token_hash)
    and w.status_token_hash = p_status_token_hash
    and w.confirmed_at is not null;
$$;
comment on function api.waitlist_status(text) is 'Platz, Gründungsstatus und Einladungen zu einem Statuslink. null, wenn der Link nicht (mehr) gilt.';

-- ---------------------------------------------------------------------------
-- api.waitlist_unsubscribe – Abmeldung löscht den Eintrag (Abmelde- oder Statuslink)
-- ---------------------------------------------------------------------------
create or replace function api.waitlist_unsubscribe(p_token_hash text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.waitlist_is_hash(p_token_hash) then
    return false;
  end if;
  delete from public.waitlist w
  where w.unsubscribe_token_hash = p_token_hash or w.status_token_hash = p_token_hash;
  return found;
end;
$$;
comment on function api.waitlist_unsubscribe(text) is 'Löscht den Eintrag zu einem Abmelde- oder Statuslink. Einladungscodes der Person verfallen mit.';

-- ---------------------------------------------------------------------------
-- api.waitlist_cleanup – Löschfristen (PLAN 2.2), stündlich per pg_cron
-- ---------------------------------------------------------------------------
create or replace function api.waitlist_cleanup()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := app.now();
  v_unconfirmed integer;
  v_attempts integer;
  v_salts integer;
begin
  delete from public.waitlist w
  where w.confirmed_at is null
    and coalesce(w.last_mail_at, w.created_at) < v_now - make_interval(days => ops.setting_int('waitlist.unconfirmed_retention_days'));
  get diagnostics v_unconfirmed = row_count;

  delete from public.signup_attempts a
  where a.at < v_now - make_interval(hours => ops.setting_int('waitlist.attempts_retention_hours'));
  get diagnostics v_attempts = row_count;

  -- Tagessalze älter als 2 Tage (siehe ops.daily_salts): danach sind alte Hashes nicht mehr zuordenbar.
  delete from ops.daily_salts s where s.day < (v_now at time zone 'Europe/Berlin')::date - 2;
  get diagnostics v_salts = row_count;

  return jsonb_build_object('unconfirmed_deleted', v_unconfirmed, 'attempts_deleted', v_attempts, 'salts_deleted', v_salts);
end;
$$;
comment on function api.waitlist_cleanup() is 'Löscht unbestätigte Einträge (nach 7 Tagen), Drossel-Einträge (nach 24 h) und alte Tagessalze.';

-- ---------------------------------------------------------------------------
-- api.link_hit – Plakat-Zähler (PLAN 2.3 Nr. 2), aufgerufen von der Server-Funktion /s/[slug]
-- ---------------------------------------------------------------------------
create or replace function api.link_hit(p_slug text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_allowed jsonb := ops.setting('landing.poster_codes');
begin
  if v_slug !~ '^[a-z0-9-]{1,40}$' then
    return false;
  end if;
  if jsonb_typeof(v_allowed) = 'array' and not (v_allowed ? v_slug) then
    return false;
  end if;
  insert into public.link_hits as h (slug, day, count)
  values (v_slug, (app.now() at time zone 'Europe/Berlin')::date, 1)
  on conflict (slug, day) do update set count = h.count + 1;
  return true;
end;
$$;
comment on function api.link_hit(text) is 'Zählt einen Aufruf je Plakat-Kürzel und Tag (Europe/Berlin). false bei ungültigem oder nicht freigegebenem Kürzel.';

-- ---------------------------------------------------------------------------
-- Admin: Zahlen und Einladungen (nur mit Zwei-Faktor-Sitzung, app.is_admin())
-- ---------------------------------------------------------------------------
create or replace function api.admin_waitlist_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Nur für Admins mit Zwei-Faktor-Sitzung.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'generated_at', app.now(),
    'totals', (
      select jsonb_build_object(
        'confirmed', count(*) filter (where w.confirmed_at is not null),
        'unconfirmed', count(*) filter (where w.confirmed_at is null),
        'founding_members', count(*) filter (where w.is_founding_member),
        'invited_to_app', count(*) filter (where w.invited_to_app_at is not null)
      )
      from public.waitlist w
    ),
    'by_region_group', coalesce((
      select jsonb_agg(jsonb_build_object(
        'region_group', g.region_group,
        'confirmed', g.confirmed,
        'unconfirmed', g.unconfirmed,
        'founding_members', g.founding,
        'last_base_number', c.last_number
      ) order by g.region_group)
      from (
        select c2.region_group,
               count(w.id) filter (where w.confirmed_at is not null) as confirmed,
               count(w.id) filter (where w.id is not null and w.confirmed_at is null) as unconfirmed,
               count(w.id) filter (where w.is_founding_member) as founding
        from public.waitlist_counters c2
        left join public.waitlist w on w.region_group = c2.region_group
        group by c2.region_group
      ) g
      join public.waitlist_counters c on c.region_group = g.region_group
    ), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'signups', d.signups, 'confirmations', d.confirmations) order by d.day)
      from (
        select x.day, sum(x.signups)::integer as signups, sum(x.confirmations)::integer as confirmations
        from (
          select (w.created_at at time zone 'Europe/Berlin')::date as day, 1 as signups, 0 as confirmations from public.waitlist w
          union all
          select (w.confirmed_at at time zone 'Europe/Berlin')::date, 0, 1 from public.waitlist w where w.confirmed_at is not null
        ) x
        group by x.day
      ) d
    ), '[]'::jsonb),
    'by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source', s.source, 'signups', s.signups, 'confirmed', s.confirmed) order by s.signups desc, s.source)
      from (
        select coalesce(w.source, '(ohne)') as source, count(*)::integer as signups,
               count(*) filter (where w.confirmed_at is not null)::integer as confirmed
        from public.waitlist w
        group by coalesce(w.source, '(ohne)')
      ) s
    ), '[]'::jsonb),
    'link_hits', coalesce((
      select jsonb_agg(jsonb_build_object('slug', h.slug, 'total', h.total, 'last_30_days', h.recent) order by h.total desc, h.slug)
      from (
        select l.slug, sum(l.count)::integer as total,
               coalesce(sum(l.count) filter (where l.day > (app.now() at time zone 'Europe/Berlin')::date - 30), 0)::integer as recent
        from public.link_hits l
        group by l.slug
      ) h
    ), '[]'::jsonb),
    'invites', (
      select jsonb_build_object('created', count(*), 'used', count(*) filter (where i.used_at is not null))
      from public.waitlist_invites i
    )
  );
end;
$$;
comment on function api.admin_waitlist_stats() is 'Zahlen der Warteliste je Gruppe, Tag und Quelle (Plakat-Kürzel) plus Plakat-Aufrufe. Nur Admins (aal2).';

-- Zweite (weitere) Einladung freischalten (PLAN 3.2 Nr. 3: „zweite nach Nutzung freischaltbar“).
create or replace function api.admin_waitlist_grant_invite(p_waitlist_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not app.is_admin() then
    raise exception 'Nur für Admins mit Zwei-Faktor-Sitzung.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.waitlist w where w.id = p_waitlist_id and w.confirmed_at is not null) then
    raise exception 'Kein bestätigter Eintrag mit dieser ID.' using errcode = 'P0002';
  end if;
  v_code := app.waitlist_create_invite(p_waitlist_id);
  perform ops.audit('waitlist.grant_invite', 'public.waitlist', p_waitlist_id::text, '{}'::jsonb);
  return v_code;
end;
$$;
comment on function api.admin_waitlist_grant_invite(uuid) is 'Gibt einer bestätigten Person einen weiteren Einladungscode. Nur Admins (aal2), protokolliert.';

-- Rechte: alles nur für service_role; die Admin-Funktionen zusätzlich für authenticated (prüfen app.is_admin()).
revoke all on function
  api.waitlist_signup(text, text, text, text, text, text, text, text, text, text),
  api.waitlist_mail_failed(text),
  api.waitlist_confirm(text, text, text),
  api.waitlist_status(text),
  api.waitlist_unsubscribe(text),
  api.waitlist_cleanup(),
  api.link_hit(text),
  api.admin_waitlist_stats(),
  api.admin_waitlist_grant_invite(uuid)
from public, anon, authenticated;
grant execute on function
  api.waitlist_signup(text, text, text, text, text, text, text, text, text, text),
  api.waitlist_mail_failed(text),
  api.waitlist_confirm(text, text, text),
  api.waitlist_status(text),
  api.waitlist_unsubscribe(text),
  api.waitlist_cleanup(),
  api.link_hit(text),
  api.admin_waitlist_stats(),
  api.admin_waitlist_grant_invite(uuid)
to service_role;
grant execute on function api.admin_waitlist_stats(), api.admin_waitlist_grant_invite(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Zeitplan (pg_cron). Ohne pg_cron läuft die Migration trotzdem durch; dann bitte
-- api.waitlist_cleanup() anders planen (docs/bereiche/landing.md).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_catalog.pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('fermata-waitlist-cleanup', '23 * * * *', 'select api.waitlist_cleanup()');
  else
    raise notice 'pg_cron ist nicht verfügbar; api.waitlist_cleanup() bitte anders planen.';
  end if;
exception when others then
  raise notice 'pg_cron konnte nicht eingerichtet werden (%); api.waitlist_cleanup() bitte anders planen.', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- Ausführungsrechte zum Schluss: PostgreSQL gibt jeder neuen Funktion EXECUTE an PUBLIC; die
-- schema-bezogenen default privileges des Fundaments entfernen das nicht. Deshalb hier ausdrücklich:
-- im Schema api nichts für PUBLIC (die Funktionen oben haben ihre Rechte einzeln: service_role,
-- Admin-Funktionen zusätzlich authenticated mit Prüfung app.is_admin()). Im Schema public legt diese
-- Migration keine Funktionen an.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema api from public;
revoke all on function app.waitlist_region_group(text) from public, anon, authenticated;
revoke all on function app.waitlist_new_invite_code(), app.waitlist_create_invite(uuid), app.waitlist_place(uuid),
  app.waitlist_is_hash(text) from public, anon, authenticated;
