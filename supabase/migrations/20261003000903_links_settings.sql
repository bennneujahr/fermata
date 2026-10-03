-- Fermata · Härtung: Links für „Abend teilen“ und die Lokal-Bestätigung, eine Quelle für Krisennummern.
--
-- 1. „Abend teilen“ (Vertrag 3): Die Seite liegt in der Web-App unter <App-Adresse>/teilen; der Schlüssel steht im
--    URL-Fragment (<base>#t=<token>), damit er nie in Server-Protokollen landet. Die Seite holt die Daten mit
--    Accept: application/json von der Edge Function trust-view (Schlüssel als ?t= oder im JSON-Body).
--    Standard von safety.trust_view_base_url: site.app_url + '/teilen'.
-- 2. Lokal-Bestätigung: Reservierungs-Mails verlinken auf <App-Adresse>/lokal/bestaetigen#t=<token>
--    (gebaut in supabase/functions/_shared/notify/dispatch.ts aus FERMATA_APP_URL wie alle anderen Mail-Links).
-- 3. Krisennummern: Viola und der Hilfe-Knopf nutzen dieselben Einstellungen (safety.telefonseelsorge_numbers,
--    safety.ambulance_number). Die doppelte Einstellung safety.crisis_lines entfällt.

-- ---------------------------------------------------------------------------
-- 1. Abend teilen
-- ---------------------------------------------------------------------------
update ops.app_settings
   set value = to_jsonb(rtrim(coalesce(ops.setting_text('site.app_url'), 'https://app.fermata.example'), '/') || '/teilen'),
       description = 'PLATZHALTER (Frage A3): Seite „Abend teilen“ in der Web-App (Standard: site.app_url + /teilen). Link: <Adresse>#t=<Schlüssel>; die Seite fragt die Edge Function trust-view mit Accept: application/json.'
 where key = 'safety.trust_view_base_url'
   and value = '"https://app.fermata.example/functions/v1/trust-view"'::jsonb;
insert into ops.app_settings (key, value, description, category, is_public) values
  ('safety.trust_view_base_url', '"https://app.fermata.example/teilen"',
   'PLATZHALTER (Frage A3): Seite „Abend teilen“ in der Web-App (Standard: site.app_url + /teilen). Link: <Adresse>#t=<Schlüssel>; die Seite fragt die Edge Function trust-view mit Accept: application/json.',
   'sicherheit', false)
on conflict (key) do nothing;

create or replace function api.create_trust_share(p_evening_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings;
  token text;
  exp timestamptz;
  active integer;
  sid uuid;
begin
  if uid is null then
    raise exception 'Nicht angemeldet' using errcode = '28000', hint = 'not_authenticated';
  end if;
  select * into e from app.evenings where id = p_evening_id;
  if not found or uid not in (e.user_a, e.user_b) then
    raise exception 'Abend nicht gefunden' using errcode = 'P0002', hint = 'evening_not_found';
  end if;
  if e.state <> 'confirmed' or e.starts_at is null then
    raise exception 'Teilen geht, sobald Ort und Zeit feststehen.' using errcode = 'P0001', hint = 'evening_not_confirmed';
  end if;
  exp := e.starts_at + make_interval(hours => ops.setting_int('safety.trust_share_hours'));
  if exp <= app.now() then
    raise exception 'Dieser Abend liegt zu lange zurück.' using errcode = 'P0001', hint = 'evening_over';
  end if;
  select count(*)::integer into active from app.trust_shares ts
  where ts.evening_id = e.id and ts.user_id = uid and ts.revoked_at is null and ts.expires_at > app.now();
  if active >= ops.setting_int('safety.trust_shares_per_evening') then
    raise exception 'Sie haben diesen Abend schon mehrfach geteilt. Ziehen Sie einen Link zurück, um einen neuen zu erstellen.'
      using errcode = 'P0001', hint = 'too_many_shares';
  end if;
  -- 192 Bit, base64url ohne Auffüllzeichen (passt in ein URL-Fragment).
  token := rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=');
  insert into app.trust_shares (evening_id, user_id, token_hash, created_at, expires_at)
  values (e.id, uid, encode(extensions.digest(token, 'sha256'), 'hex'), app.now(), exp)
  returning id into sid;
  return jsonb_build_object('share_id', sid, 'token', token, 'expires_at', exp,
    'url', rtrim(ops.setting_text('safety.trust_view_base_url'), '/') || '#t=' || token);
end;
$$;
comment on function api.create_trust_share(uuid) is
  'Link „Abend teilen“ für eine Vertrauensperson: <safety.trust_view_base_url>#t=<Schlüssel> (Schlüssel nur als Hash gespeichert).';
grant execute on function api.create_trust_share(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Krisennummern aus einer Quelle
-- ---------------------------------------------------------------------------
create or replace function safety.crisis_lines()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'telefonseelsorge', ops.setting('safety.telefonseelsorge_numbers'),
    'notruf', ops.setting_text('safety.ambulance_number'));
$$;
comment on function safety.crisis_lines() is
  'Krisennummern für Viola, aus denselben Einstellungen wie der Hilfe-Knopf (safety.telefonseelsorge_numbers, safety.ambulance_number).';
revoke execute on function safety.crisis_lines() from public, anon, authenticated;
grant execute on function safety.crisis_lines() to service_role, fermata_agent;

-- Viola bekommt die Krisennummern ab jetzt aus safety.crisis_lines() (ersetzt die Fassung aus 20261003000310).
create or replace function api.agent_session_context(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session);
  pc app.profile_core;
  prev app.interview_sessions;
  result jsonb;
begin
  select * into pc from app.profile_core x where x.user_id = s.user_id;
  if s.continues_session_id is not null then
    select * into prev from app.interview_sessions x where x.id = s.continues_session_id;
  end if;
  result := jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'kind', s.kind, 'mode', s.mode, 'status', s.status,
      'address_form', s.address_form, 'tier_depth', s.tier_depth, 'room_name', s.room_name,
      'started_at', s.started_at, 'ai_notice_at', s.ai_notice_at, 'expires_at', s.expires_at,
      'covered_blocks', to_jsonb(s.covered_blocks), 'summary_status', s.summary_status,
      'max_minutes', app.interview_max_minutes(s.kind, s.mode, s.tier_depth)),
    'person', jsonb_build_object('display_name', pc.display_name),
    'profile', case when pc.user_id is null then null else jsonb_build_object(
      'summary_text', pc.summary_text, 'summary_version', pc.summary_version,
      'personality', pc.personality, 'values_profile', pc.values_profile, 'life_circumstances', pc.life_circumstances,
      'age_min', pc.age_min, 'age_max', pc.age_max, 'travel_modes', to_jsonb(pc.travel_modes),
      'travel_max_minutes', pc.travel_max_minutes, 'travel_max_km', pc.travel_max_km,
      'smoking', pc.smoking, 'has_children', pc.has_children, 'wants_children', pc.wants_children,
      'wants', coalesce((select jsonb_agg(jsonb_build_object('category', w.category, 'text', w.text, 'importance', w.importance) order by w.created_at)
                         from app.wants w where w.user_id = s.user_id), '[]'::jsonb),
      'dealbreakers', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'text', d.text) order by d.created_at)
                         from app.dealbreakers d where d.user_id = s.user_id), '[]'::jsonb)) end,
    'previous', case when prev.id is null then null else jsonb_build_object(
      'session_id', prev.id, 'summary_draft', prev.summary_draft, 'covered_blocks', to_jsonb(prev.covered_blocks)) end,
    'evening', case when s.evening_id is null then null else (
      select jsonb_build_object('starts_at', e.starts_at, 'venue_name', v.name)
      from app.evenings e left join app.venues v on v.id = e.venue_id where e.id = s.evening_id) end,
    'turns', case when s.status = 'active' then
      coalesce((select t.turns from app.interview_transcripts t where t.session_id = s.id), '[]'::jsonb) else '[]'::jsonb end,
    'settings', jsonb_build_object(
      'llm_model_id', ops.setting_text('voice.llm_model_id'),
      'llm_effort', ops.setting_text('voice.llm_effort'),
      'llm_thinking', ops.setting_text('voice.llm_thinking'),
      'analysis_model_id', ops.setting_text('analysis.llm_model_id'),
      'analysis_effort', ops.setting_text('analysis.llm_effort'),
      'stt_model', ops.setting_text('voice.stt_model'),
      'stt_language', ops.setting_text('voice.stt_language'),
      'tts_provider', ops.setting_text('voice.tts_provider'),
      'tts_voice', ops.setting_text('voice.tts_voice'),
      'wrapup_minutes', ops.setting_int('voice.wrapup_minutes'),
      'grace_minutes', ops.setting_int('voice.grace_minutes'),
      'silence_prompt_seconds', ops.setting_int('voice.silence_prompt_seconds'),
      'max_silence_prompts', ops.setting_int('voice.max_silence_prompts'),
      'max_sentences', ops.setting_int('voice.max_sentences'),
      'latency_target_ms_p90', ops.setting_int('voice.latency_target_ms_p90'),
      'target_cost_eur_per_hour', ops.setting_num('voice.target_cost_eur_per_hour'),
      'livekit_path', ops.setting_text('voice.livekit_path'),
      'prices', ops.setting('voice.prices'),
      'tier_depth', ops.setting('interview.tier_depth') -> s.tier_depth,
      'redact_art9_in_transcripts', ops.setting_bool('interview.redact_art9_in_transcripts'),
      'transcript_retention_days', ops.setting_int('interview.transcript_retention_days'),
      'ai_notice_version', ops.setting_text('interview.ai_notice_version'),
      'crisis_lines', safety.crisis_lines()));
  return result;
end;
$$;
comment on function api.agent_session_context(uuid) is 'Alles, was Viola für ein Gespräch braucht. Keine Daten anderer Mitglieder, keine Art.-9-Daten.';

delete from ops.app_settings where key = 'safety.crisis_lines';
update ops.app_settings
   set description = 'TelefonSeelsorge, kostenfrei. Einzige Quelle für Hilfe-Knopf (api.help_contacts) und Viola (safety.crisis_lines()). Vor dem Start erneut prüfen (M9).'
 where key = 'safety.telefonseelsorge_numbers';
update ops.app_settings
   set description = 'Notruf Rettungsdienst und Feuerwehr. Auch die Notrufnummer, die Viola in einer Krise nennt (safety.crisis_lines()).'
 where key = 'safety.ambulance_number';
