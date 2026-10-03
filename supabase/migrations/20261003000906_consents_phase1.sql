-- Fermata · Härtung: Einwilligungen in Phase 1
-- 1. art9_health wird nicht angeboten (Fermata speichert keine Gesundheitsangaben; datensparsam, PLATZHALTER C10).
--    Die Art bleibt in app.consents erlaubt und widerrufbar, falls jemand sie früher erteilt hat.
-- 2. Widerruf von kontakttausch zieht noch nicht freigegebene Freigaben zurück; bereits freigegebene Kontaktdaten
--    zeigt die App dem Gegenüber nicht mehr an. Was das Gegenüber schon notiert hat, lässt sich nicht zurückholen
--    (steht im Einwilligungstext, docs/recht/einwilligungen.md Abschnitt 8).

insert into ops.app_settings (key, value, description, category, is_public) values
  ('account.consents_not_offered', '["art9_health"]',
   'PLATZHALTER (C10): Einwilligungsarten, die die App in Phase 1 nicht anbietet. Gesundheit: keine Eingabe, keine Verarbeitung – deshalb keine Einwilligung (datensparsam).',
   'konto', false)
on conflict (key) do nothing;

-- Angebotene Arten (Reihenfolge wie app.consent_kinds()).
create or replace function app.consent_kinds_offered()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array(
    select k from unnest(app.consent_kinds()) with ordinality as x(k, ord)
    where not coalesce(ops.setting('account.consents_not_offered') ? k, false)
    order by ord), array[]::text[]);
$$;
comment on function app.consent_kinds_offered() is
  'Einwilligungsarten, die eine Person in der App erteilen kann (app.consent_kinds() ohne account.consents_not_offered).';
revoke execute on function app.consent_kinds_offered() from public, anon, authenticated;
grant execute on function app.consent_kinds_offered() to service_role;

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
  if not (p_kind = any (app.consent_kinds_offered())) then
    raise exception 'Diese Einwilligung bietet Fermata zurzeit nicht an' using errcode = '22023', hint = 'not_offered';
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
comment on function api.give_consent(text, text) is
  'Erteilt eine angebotene Einwilligung für die aktuelle Fassung des Textes (neue Zeile in app.consents).';
grant execute on function api.give_consent(text, text) to authenticated;

-- Stand je Art: alle angebotenen Arten und zusätzlich jede Art, die die Person noch erteilt hat (damit sie
-- widerrufbar bleibt, auch wenn Fermata sie nicht mehr anbietet).
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
    and (k.kind = any (app.consent_kinds_offered()) or coalesce(cc.granted, false))
  order by k.ord;
$$;
grant execute on function api.my_consents() to authenticated;

create or replace function api.revoke_consent(p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_version text;
  v_withdrawn integer := 0;
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
  elsif p_kind = 'kontakttausch' then
    -- Noch nicht freigegebene „Ja“ zurückziehen. Freigegebene zeigt app.contact_share_for nicht mehr an.
    delete from app.contact_shares where user_id = uid and released_at is null;
    get diagnostics v_withdrawn = row_count;
  end if;

  insert into ops.audit_log (actor, action, target_table, target_id, details)
  values (uid, 'consent.revoked', 'app.consents', uid::text,
          jsonb_build_object('kind', p_kind) || case when p_kind = 'kontakttausch'
            then jsonb_build_object('pending_shares_withdrawn', v_withdrawn) else '{}'::jsonb end);
  perform app.refresh_account_status(uid);
  return jsonb_build_object('kind', p_kind, 'granted', false, 'changed', true)
    || case when p_kind = 'kontakttausch' then jsonb_build_object('pending_shares_withdrawn', v_withdrawn) else '{}'::jsonb end;
end;
$$;
comment on function api.revoke_consent(text) is
  'Widerruft eine Einwilligung (neue Zeile) und löscht sofort die Daten, die nur mit ihr erlaubt sind (kontakttausch: offene Freigaben).';
grant execute on function api.revoke_consent(text) to authenticated;

-- Kontakttausch aus Sicht einer Person (ersetzt die Fassung aus 20261003000550): Hat das Gegenüber seine
-- Einwilligung kontakttausch widerrufen, zeigt die App seine Kontaktdaten nicht mehr an (withdrawn = true).
create or replace function app.contact_share_for(p_evening_id uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e app.evenings;
  mine app.contact_shares;
  theirs app.contact_shares;
  v_other uuid;
  v_email text;
  v_phone text;
  v_withdrawn boolean;
begin
  select * into e from app.evenings where id = p_evening_id;
  if not found or p_user not in (e.user_a, e.user_b) then
    return null;
  end if;
  v_other := app.evening_other(e, p_user);
  select * into mine from app.contact_shares c where c.evening_id = e.id and c.user_id = p_user;
  if mine.id is null then
    return jsonb_build_object('status', 'none', 'mine', null, 'counterpart', null);
  end if;
  if mine.released_at is null then
    return jsonb_build_object(
      'status', case when app.evening_feedback_open(e) then 'pending' else 'closed' end,
      'mine', jsonb_build_object('share_email', mine.share_email, 'share_phone', mine.share_phone),
      'counterpart', null);
  end if;
  select * into theirs from app.contact_shares c where c.evening_id = e.id and c.user_id = v_other;
  v_withdrawn := not app.has_consent(v_other, 'kontakttausch');
  if theirs.share_email and not v_withdrawn then
    select u.email into v_email from auth.users u where u.id = v_other;
  end if;
  if theirs.share_phone and not v_withdrawn then
    select f.phone into v_phone from private.account_facts f where f.user_id = v_other;
  end if;
  return jsonb_build_object(
    'status', 'released',
    'released_at', mine.released_at,
    'mine', jsonb_build_object('share_email', mine.share_email, 'share_phone', mine.share_phone),
    'counterpart', jsonb_build_object('first_name', app.member_first_name(v_other), 'email', v_email, 'phone', v_phone,
                                      'withdrawn', v_withdrawn));
end;
$$;
comment on function app.contact_share_for(uuid, uuid) is
  'Stand des Kontakttauschs aus Sicht einer Person: none | pending | closed | released (nur dann Daten des Gegenübers, nur das Gewählte, nicht nach Widerruf).';
