-- Fermata · Härtung: Einsicht in ein Gesprächs-Transkript nur im Sicherheitsfall (DSFA-Maßnahme M-2, PLAN 2.2
-- „Benn bei Sicherheitsfall“). Vorher gab es keinen Weg außer dem SQL-Editor (ohne Audit, ohne Zwei-Faktor).
--
-- api.admin_safety_transcript(p_session_id, p_reason) → {session, turns, deleted}
-- Regeln:
--   - nur Admins mit Zwei-Faktor-Sitzung (app.is_admin(), aal2)                       → sonst hint admin_aal2_required
--   - Begründung mit mindestens 10 Zeichen                                           → sonst hint reason_required
--   - Sitzung muss existieren                                                        → sonst hint not_found
--   - es gibt einen offenen Sicherheitsfall zur Person der Sitzung: ein ungeprüfter Hinweis
--     (safety.safety_flags.user_id, reviewed_at is null) oder eine offene Meldung gegen sie
--     (safety.reports.reported, Status open/in_review)                               → sonst hint no_safety_case
--   - jede Einsicht steht in ops.audit_log (Handlung, Sitzung, Begründung; nie Inhalte des Gesprächs)
--   - ist das Transkript schon gelöscht (30-Tage-Frist, Widerruf), kommt deleted = true und keine Beiträge.
-- Ausführbar nur für authenticated (die Funktion prüft selbst, ob ein Admin ruft); nicht für service_role.

create or replace function api.admin_safety_transcript(p_session_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions;
  t app.interview_transcripts;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_flags integer;
  v_reports integer;
begin
  if not app.is_admin() then
    raise exception 'Nur für Admins mit Zwei-Faktor-Anmeldung' using errcode = '42501', hint = 'admin_aal2_required';
  end if;
  if char_length(v_reason) < 10 or char_length(v_reason) > 1000 then
    raise exception 'Bitte begründen Sie die Einsicht (mindestens 10 Zeichen).' using errcode = '22023', hint = 'reason_required';
  end if;
  select * into s from app.interview_sessions x where x.id = p_session_id;
  if not found then
    raise exception 'Gespräch nicht gefunden' using errcode = 'P0002', hint = 'not_found';
  end if;
  select count(*)::integer into v_flags from safety.safety_flags f where f.user_id = s.user_id and f.reviewed_at is null;
  select count(*)::integer into v_reports from safety.reports r
   where r.reported = s.user_id and r.status in ('open', 'in_review');
  if v_flags = 0 and v_reports = 0 then
    raise exception 'Kein offener Sicherheitsfall zu dieser Person – keine Einsicht.' using errcode = '42501', hint = 'no_safety_case';
  end if;

  select * into t from app.interview_transcripts x where x.session_id = s.id;

  -- Nachweis ohne Inhalt: wer, wann, welche Sitzung, warum, ob es noch etwas zu sehen gab.
  perform ops.audit('safety.admin_view_transcript', 'app.interview_sessions', s.id::text, jsonb_build_object(
    'reason', v_reason,
    'user_id', s.user_id,
    'deleted', t.id is null,
    'turns', coalesce(jsonb_array_length(t.turns), 0),
    'open_flags', v_flags,
    'open_reports', v_reports));

  return jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'user_id', s.user_id, 'kind', s.kind, 'mode', s.mode, 'status', s.status,
      'created_at', s.created_at, 'started_at', s.started_at, 'ended_at', s.ended_at, 'end_reason', s.end_reason,
      'safety_flagged', s.safety_flagged, 'ai_notice_at', s.ai_notice_at,
      'transcript_delete_at', t.delete_at),
    'turns', case when t.id is null then '[]'::jsonb else coalesce(t.turns, '[]'::jsonb) end,
    'deleted', t.id is null);
end;
$$;
comment on function api.admin_safety_transcript(uuid, text) is
  'Admin (aal2) sieht ein Transkript nur bei offenem Sicherheitshinweis oder offener Meldung zur Person, mit Begründung; Audit ohne Inhalt.';
revoke execute on function api.admin_safety_transcript(uuid, text) from public, anon, service_role;
grant execute on function api.admin_safety_transcript(uuid, text) to authenticated;
