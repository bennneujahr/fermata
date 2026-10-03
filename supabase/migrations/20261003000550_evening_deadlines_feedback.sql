-- Fermata · M5: Fristen-Job, Rückmeldung, Ergebnis (happened/no_show), Kontakttausch,
-- Nachbesprechung, Finde-Fenster. PLAN 1 Nr. 7, 2.3 Nr. 6, Fragen B6, B7, B9.
--
-- Regel „stattgefunden“ (docs/bereiche/abende.md):
--   • Beide geben Rückmeldung, beide waren da und niemand meldet das Gegenüber als nicht erschienen → happened sofort.
--   • Sonst entscheidet der Fristen-Job evening.happened_auto_hours (24 h) nach der Rückmeldungs-Anfrage:
--     ohne gegenteilige Angabe → happened.
--   • Platzhalter B9 (Nichterscheinen): Meldet eine Person „Gegenüber war nicht da“ und die gemeldete Person
--     widerspricht nicht innerhalb evening.no_show_contest_hours (eigene Rückmeldung „war da“), wird der
--     Abend no_show mit no_show_user = gemeldete Person. Gibt die Person selbst „war nicht da“ an, gilt das sofort.
--     Waren beide nicht da: no_show ohne no_show_user. Widerspruch (beide sagen „ich war da“, eine sagt
--     „Gegenüber nicht“): keine automatische Entscheidung, Hinweis an Benn (safety.safety_flags), Entscheidung
--     über api.admin_resolve_evening.
--   • Offene Meldung zum Abend (safety.reports, open/in_review): keine automatische Entscheidung.

-- ---------------------------------------------------------------------------
-- Hilfen
-- ---------------------------------------------------------------------------
create or replace function app.evening_safety_hold(p_evening_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (select 1 from safety.reports r where r.evening_id = p_evening_id and r.status in ('open', 'in_review'));
end;
$$;

create or replace function app.evening_flag(p_evening_id uuid, p_user uuid, p_kind text, p_severity text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from safety.safety_flags f
                  where f.kind = p_kind and f.details ->> 'evening_id' = p_evening_id::text
                    and f.user_id is not distinct from p_user) then
    insert into safety.safety_flags (user_id, source, kind, severity, details)
    values (p_user, 'system', p_kind, p_severity, jsonb_build_object('evening_id', p_evening_id) || coalesce(p_details, '{}'::jsonb));
  end if;
end;
$$;

-- Ergebnis bestimmen. p_final = true: Frist ist abgelaufen (Fristen-Job), fehlende Rückmeldungen zählen als „keine Einwände“.
-- Rückgabe: happened | no_show | waiting | wait:<Zeitpunkt> | contested | safety_hold | not_applicable
create or replace function app.evening_resolve_outcome(p_evening_id uuid, p_final boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  e app.evenings;
  fa app.feedback;
  fb app.feedback;
  v_absent_a boolean;
  v_absent_b boolean;
  v_contested boolean;
  v_until timestamptz;
  v_contest interval := make_interval(hours => ops.setting_int('evening.no_show_contest_hours'));
begin
  select * into e from app.evenings where id = p_evening_id for update;
  if not found or e.state <> 'confirmed' or e.starts_at is null or app.now() < e.starts_at then
    return 'not_applicable';
  end if;
  if app.evening_safety_hold(e.id) then
    return 'safety_hold';
  end if;
  select * into fa from app.feedback f where f.evening_id = e.id and f.user_id = e.user_a;
  select * into fb from app.feedback f where f.evening_id = e.id and f.user_id = e.user_b;

  v_absent_a := (fa.id is not null and not fa.attended) or (fa.id is null and fb.id is not null and fb.other_attended is false);
  v_absent_b := (fb.id is not null and not fb.attended) or (fb.id is null and fa.id is not null and fa.other_attended is false);
  v_contested := (fa.id is not null and fa.attended and fb.id is not null and fb.other_attended is false)
              or (fb.id is not null and fb.attended and fa.id is not null and fa.other_attended is false);

  if v_contested then
    perform app.evening_flag(e.id, null, 'no_show_bestritten', 'niedrig', '{}'::jsonb);
    return 'contested';
  end if;

  if fa.id is null or fb.id is null then
    if not p_final then
      return 'waiting';
    end if;
    -- Gemeldete Person hat noch Zeit zu widersprechen?
    if fa.id is null and fb.id is not null and fb.other_attended is false then
      v_until := fb.created_at + v_contest;
    end if;
    if fb.id is null and fa.id is not null and fa.other_attended is false then
      v_until := greatest(v_until, fa.created_at + v_contest);
    end if;
    if v_until is not null and app.now() < v_until then
      return 'wait:' || app.iso_utc(v_until);
    end if;
  end if;

  if v_absent_a and v_absent_b then
    update app.evenings set no_show_user = null where id = e.id;
    perform app.evening_transition(e.id, 'no_show', null,
      jsonb_build_object('both', true, 'no_show_user', null, 'final', p_final));
    return 'no_show';
  elsif v_absent_a or v_absent_b then
    update app.evenings set no_show_user = case when v_absent_a then e.user_a else e.user_b end where id = e.id;
    perform app.evening_transition(e.id, 'no_show', null,
      jsonb_build_object('no_show_user', case when v_absent_a then e.user_a else e.user_b end, 'final', p_final));
    return 'no_show';
  end if;
  perform app.evening_transition(e.id, 'happened', null, jsonb_build_object('final', p_final));
  return 'happened';
end;
$$;
comment on function app.evening_resolve_outcome(uuid, boolean) is 'Entscheidet happened/no_show nach den Regeln im Kopf dieser Migration (Platzhalter B9).';

-- ---------------------------------------------------------------------------
-- Fristen-Job (pg_cron alle evening.deadline_check_minutes Minuten). Idempotent, sicher bei
-- parallelen Läufen (for update skip locked); jede Frist wird genau einmal erledigt.
-- ---------------------------------------------------------------------------
create or replace function app.evening_handle_deadline(p_deadline app.evening_deadlines)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d app.evening_deadlines := p_deadline;
  e app.evenings;
  u text;
  v_u uuid;
  v_res text;
  v_users uuid[];
  r app.evening_reservations;
  a record;
begin
  select * into e from app.evenings where id = d.evening_id for update;
  if not found then
    return 'missing';
  end if;

  if d.kind = 'time_request' then
    if e.state = 'proposed' then
      perform app.evening_transition(e.id, 'lapse', null, jsonb_build_object('deadline', 'time_request'));
      return 'lapsed';
    end if;
    return 'skipped';

  elsif d.kind = 'time_answer' then
    if e.state in ('time_requested', 'time_countered') and e.state = coalesce(d.payload ->> 'state', e.state) then
      perform app.evening_transition(e.id, 'lapse', null,
        jsonb_build_object('deadline', 'time_answer', 'waiting_for', d.payload -> 'waiting_for'));
      return 'lapsed';
    end if;
    return 'skipped';

  elsif d.kind = 'reminder' and d.payload ->> 'type' = 'deadline' then
    if e.state = d.payload ->> 'state' then
      for u in select jsonb_array_elements_text(coalesce(d.payload -> 'users', '[]'::jsonb)) loop
        perform app.evening_notify(e, u::uuid, 'evening.deadline_reminder',
          jsonb_build_object('deadline_at', d.payload -> 'deadline_at', 'require_state', jsonb_build_array(e.state)),
          true, false, null, 'd' || d.id);
      end loop;
      return 'notified';
    end if;
    return 'skipped';

  elsif d.kind = 'reminder' then
    if e.state = 'confirmed' then
      perform app.evening_notify(e, e.user_a, 'evening.reminder',
        jsonb_build_object('hours_before', d.payload -> 'hours_before', 'require_state', jsonb_build_array('confirmed')),
        false, false, null, 'd' || d.id);
      perform app.evening_notify(e, e.user_b, 'evening.reminder',
        jsonb_build_object('hours_before', d.payload -> 'hours_before', 'require_state', jsonb_build_array('confirmed')),
        false, false, null, 'd' || d.id);
      return 'notified';
    end if;
    return 'skipped';

  elsif d.kind = 'checkin' then
    -- Check-in nach safety.checkin_after_minutes: Sicherheitsnachricht (auch in der Ruhezeit).
    -- Die Antworten verarbeitet der Sicherheitsbereich (M7).
    if e.state = 'confirmed' then
      perform app.evening_notify(e, e.user_a, 'evening.checkin', jsonb_build_object('require_state', jsonb_build_array('confirmed')),
        false, true, null, 'd' || d.id);
      perform app.evening_notify(e, e.user_b, 'evening.checkin', jsonb_build_object('require_state', jsonb_build_array('confirmed')),
        false, true, null, 'd' || d.id);
      return 'notified';
    end if;
    return 'skipped';

  elsif d.kind = 'feedback' and coalesce(d.payload ->> 'step', 'request') = 'request' then
    if e.state not in ('confirmed', 'happened', 'no_show') then
      return 'skipped';
    end if;
    select array_agg(x) into v_users from unnest(array[e.user_a, e.user_b]) x
     where not exists (select 1 from app.feedback f where f.evening_id = e.id and f.user_id = x);
    if v_users is not null then
      foreach v_u in array v_users loop
        perform app.evening_notify(e, v_u, 'evening.feedback_request',
          jsonb_build_object('require_state', jsonb_build_array('confirmed', 'happened', 'no_show')),
          false, false, null, 'd' || d.id);
      end loop;
    end if;
    if e.state = 'confirmed' then
      insert into app.evening_deadlines (evening_id, kind, due_at, payload)
      values (e.id, 'feedback', app.now() + make_interval(hours => ops.setting_int('evening.happened_auto_hours')),
              jsonb_build_object('step', 'resolve'));
    end if;
    return 'notified';

  elsif d.kind = 'feedback' and d.payload ->> 'step' = 'resolve' then
    v_res := app.evening_resolve_outcome(e.id, true);
    if v_res like 'wait:%' then
      insert into app.evening_deadlines (evening_id, kind, due_at, payload)
      values (e.id, 'feedback', substr(v_res, 6)::timestamptz, jsonb_build_object('step', 'resolve'));
    elsif v_res = 'safety_hold' then
      -- Offene Meldung: täglich erneut prüfen.
      insert into app.evening_deadlines (evening_id, kind, due_at, payload)
      values (e.id, 'feedback', app.now() + interval '24 hours', jsonb_build_object('step', 'resolve', 'hold', true));
    end if;
    return v_res;

  elsif d.kind = 'reservation' then
    select * into r from app.evening_reservations where evening_id = e.id;
    if e.state = 'confirmed' and r.status = 'reserved' and r.venue_confirmed_at is null then
      for a in select au.user_id from app.admin_users au loop
        perform ops.enqueue_notification(a.user_id, 'admin.venue_unconfirmed', 'email',
          jsonb_build_object('reservation_id', r.id, 'evening_id', e.id), null, e.id,
          format('admin.venue_unconfirmed:%s:%s', r.id, a.user_id));
      end loop;
      return 'notified';
    end if;
    return 'skipped';
  end if;
  return 'unknown';
end;
$$;

create or replace function ops.process_evening_deadlines(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d app.evening_deadlines;
  v_res text;
  v_err text;
  v_done integer := 0;
  v_failed integer := 0;
  v_busy integer := 0;
  v_results jsonb := '{}'::jsonb;
begin
  for d in
    select * from app.evening_deadlines x
     where x.done_at is null and x.cancelled_at is null and x.due_at <= app.now()
     order by x.due_at, x.id
     limit greatest(coalesce(p_limit, 500), 1)
     for update skip locked
  loop
    -- Handelt gerade jemand an diesem Abend (Zeile gesperrt), kommt die Frist beim nächsten Lauf dran.
    -- Reihenfolge der Sperren wie in den Mitglieder-Funktionen (erst Abend, dann Fristen): keine Verklemmung.
    perform 1 from app.evenings x where x.id = d.evening_id for update skip locked;
    if not found then
      v_busy := v_busy + 1;
      continue;
    end if;
    begin
      -- Erst als erledigt markieren: Zustandswechsel beenden dann nur die übrigen Fristen.
      update app.evening_deadlines set done_at = app.now() where id = d.id;
      v_res := app.evening_handle_deadline(d);
      update app.evening_deadlines set payload = payload || jsonb_build_object('result', v_res) where id = d.id;
      v_done := v_done + 1;
      v_results := jsonb_set(v_results, array[d.kind], to_jsonb(coalesce((v_results ->> d.kind)::integer, 0) + 1));
    exception when others then
      get stacked diagnostics v_err = message_text;
      update app.evening_deadlines
         set attempts = attempts + 1,
             last_error = left(v_err, 500),
             cancelled_at = case when attempts + 1 >= 5 then app.now() end
       where id = d.id;
      v_failed := v_failed + 1;
    end;
  end loop;
  return jsonb_build_object('done', v_done, 'failed', v_failed, 'busy', v_busy, 'by_kind', v_results);
end;
$$;
comment on function ops.process_evening_deadlines(integer) is
  'Fristen-Job: abgelaufene Fristen → lapse, Erinnerungen/Check-in/Rückmeldung → Nachrichten, Ergebnis bestimmen. Idempotent.';

-- ---------------------------------------------------------------------------
-- Kontakttausch (nur bei beidseitigem Ja, je Seite nur das Gewählte). Ein „Nein“ wird nie gezeigt.
-- ---------------------------------------------------------------------------
create or replace function app.evening_try_release_contacts(p_evening_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  e app.evenings;
begin
  select * into e from app.evenings where id = p_evening_id;
  if (select count(*) from app.contact_shares c where c.evening_id = e.id and c.released_at is null
        and c.user_id in (e.user_a, e.user_b)) < 2 then
    return false;
  end if;
  if not app.has_consent(e.user_a, 'kontakttausch') or not app.has_consent(e.user_b, 'kontakttausch')
     or app.is_blocked(e.user_a, e.user_b) or app.evening_safety_hold(e.id) then
    return false;
  end if;
  update app.contact_shares set released_at = app.now() where evening_id = e.id and released_at is null;
  perform app.evening_notify(e, e.user_a, 'evening.contact_released', '{}'::jsonb, false, false, null, 'released');
  perform app.evening_notify(e, e.user_b, 'evening.contact_released', '{}'::jsonb, false, false, null, 'released');
  return true;
end;
$$;

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
  if theirs.share_email then
    select u.email into v_email from auth.users u where u.id = v_other;
  end if;
  if theirs.share_phone then
    select f.phone into v_phone from private.account_facts f where f.user_id = v_other;
  end if;
  return jsonb_build_object(
    'status', 'released',
    'released_at', mine.released_at,
    'mine', jsonb_build_object('share_email', mine.share_email, 'share_phone', mine.share_phone),
    'counterpart', jsonb_build_object('first_name', app.member_first_name(v_other), 'email', v_email, 'phone', v_phone));
end;
$$;
comment on function app.contact_share_for(uuid, uuid) is
  'Stand des Kontakttauschs aus Sicht einer Person: none | pending | closed | released (nur dann Daten des Gegenübers, nur das Gewählte).';

create or replace function api.my_contact_share(p_evening_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e app.evenings := app.evening_for_member(p_evening_id);
begin
  return app.contact_share_for(e.id, auth.uid());
end;
$$;
comment on function api.my_contact_share(uuid) is 'Kontakttausch zu einem eigenen Abend. Zeigt nie, ob das Gegenüber Nein gesagt hat.';
grant execute on function api.my_contact_share(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Nachbesprechung (Frage B6): Angebot je Stufe (evening.debrief_minutes nach app.accounts.tier_view).
-- Die Sitzung selbst legt der Viola-Bereich an (interview_sessions kind 'nachbesprechung').
-- ---------------------------------------------------------------------------
create or replace function app.debrief_minutes(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((ops.setting('evening.debrief_minutes') ->> a.tier_view)::integer, 0)
  from app.accounts a where a.user_id = p_user;
$$;

create or replace function app.debrief_offer_for(p_evening_id uuid, p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e app.evenings;
  f app.feedback;
  s app.interview_sessions;
  v_minutes integer := coalesce(app.debrief_minutes(p_user), 0);
  v_tier text;
  v_until timestamptz;
  v_reason text;
begin
  select * into e from app.evenings where id = p_evening_id;
  if not found or p_user not in (e.user_a, e.user_b) then
    return null;
  end if;
  select a.tier_view into v_tier from app.accounts a where a.user_id = p_user;
  select * into f from app.feedback x where x.evening_id = e.id and x.user_id = p_user;
  select * into s from app.interview_sessions x
   where x.user_id = p_user and x.kind = 'nachbesprechung' and x.evening_id = e.id
   order by x.created_at desc limit 1;
  v_until := e.starts_at + make_interval(days => ops.setting_int('evening.debrief_offer_days'));

  if v_minutes <= 0 then
    v_reason := 'tier';
  elsif e.state not in ('confirmed', 'happened', 'no_show') or e.starts_at is null then
    v_reason := 'not_applicable';
  elsif f.id is null then
    v_reason := 'feedback_missing';
  elsif not f.attended then
    v_reason := 'not_attended';
  elsif s.id is not null and s.status = 'completed' then
    v_reason := 'done';
  elsif app.now() > v_until then
    v_reason := 'expired';
  end if;

  return jsonb_build_object(
    'eligible', v_reason is null,
    'reason', v_reason,
    'minutes', v_minutes,
    'tier', v_tier,
    'offer_until', v_until,
    'session_id', s.id,
    'session_status', s.status);
end;
$$;
comment on function app.debrief_offer_for(uuid, uuid) is
  'Nachbesprechung möglich? Gründe dagegen: tier, not_applicable, feedback_missing, not_attended, done, expired.';

create or replace function api.debrief_offer(p_evening_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e app.evenings := app.evening_for_member(p_evening_id);
begin
  return app.debrief_offer_for(e.id, auth.uid());
end;
$$;
comment on function api.debrief_offer(uuid) is 'Angebot einer Nachbesprechung zu einem eigenen Abend (Minuten je Stufe, Frist, vorhandene Sitzung).';
grant execute on function api.debrief_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Rückmeldung (nächster Tag, 10:00). Einmal je Person. Das Gegenüber sieht sie nie.
-- ---------------------------------------------------------------------------
create or replace function api.submit_feedback(
  p_evening_id uuid,
  p_attended boolean,
  p_other_attended boolean default null,
  p_wants_contact boolean default false,
  p_would_meet_again text default null,
  p_felt_safe boolean default null,
  p_venue_rating integer default null,
  p_match_quality integer default null,
  p_note text default null,
  p_share_email boolean default false,
  p_share_phone boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings := app.evening_for_member(p_evening_id, true);
  v_other uuid := app.evening_other(e, uid);
  v_wants boolean := coalesce(p_wants_contact, false) and coalesce(p_attended, false);
  v_outcome text;
  v_offer jsonb;
begin
  if not app.evening_feedback_open(e) then
    raise exception 'Die Rückmeldung ist gerade nicht möglich' using errcode = '55000', hint = 'feedback_not_open';
  end if;
  if exists (select 1 from app.feedback f where f.evening_id = e.id and f.user_id = uid) then
    raise exception 'Rückmeldung schon abgegeben' using errcode = '23505', hint = 'already_submitted';
  end if;
  if p_attended is null then
    raise exception 'Bitte angeben, ob Sie dort waren' using errcode = '22023', hint = 'invalid_input';
  end if;
  if p_would_meet_again is not null and p_would_meet_again not in ('ja', 'nein', 'vielleicht') then
    raise exception 'Ungültige Angabe' using errcode = '22023', hint = 'invalid_input';
  end if;
  if (p_venue_rating is not null and p_venue_rating not between 1 and 5)
     or (p_match_quality is not null and p_match_quality not between 1 and 5) then
    raise exception 'Bewertung von 1 bis 5' using errcode = '22023', hint = 'invalid_rating';
  end if;
  if char_length(coalesce(p_note, '')) > 2000 then
    raise exception 'Text zu lang' using errcode = '22023', hint = 'text_too_long';
  end if;
  if v_wants then
    if not app.has_consent(uid, 'kontakttausch') then
      raise exception 'Einwilligung kontakttausch fehlt' using errcode = '42501', hint = 'consent_missing';
    end if;
    if not coalesce(p_share_email, false) and not coalesce(p_share_phone, false) then
      raise exception 'Bitte E-Mail, Telefon oder beides wählen' using errcode = '22023', hint = 'nothing_to_share';
    end if;
    if coalesce(p_share_phone, false)
       and not exists (select 1 from private.account_facts f where f.user_id = uid and coalesce(f.phone, '') <> '') then
      raise exception 'Keine Telefonnummer hinterlegt' using errcode = '22023', hint = 'no_phone';
    end if;
  end if;

  insert into app.feedback (evening_id, user_id, attended, other_attended, wants_contact, would_meet_again, felt_safe,
                            venue_rating, match_quality, note, created_at)
  values (e.id, uid, p_attended, case when p_attended then p_other_attended end, v_wants, p_would_meet_again, p_felt_safe,
          p_venue_rating, p_match_quality, nullif(trim(p_note), ''), app.now());

  if v_wants then
    insert into app.contact_shares (evening_id, user_id, share_email, share_phone, consented_at)
    values (e.id, uid, coalesce(p_share_email, false), coalesce(p_share_phone, false), app.now());
    perform app.evening_try_release_contacts(e.id);
  end if;

  if p_felt_safe is false then
    perform app.evening_flag(e.id, uid, 'rueckmeldung_unsicher', 'hoch', '{}'::jsonb);
  end if;

  -- „Gegenüber war nicht da“ und das Gegenüber hat noch keine Rückmeldung: neutrale Bitte um Rückmeldung
  -- mit Frist (verrät nicht, was gemeldet wurde).
  if p_attended and p_other_attended is false and e.state = 'confirmed'
     and not exists (select 1 from app.feedback f where f.evening_id = e.id and f.user_id = v_other) then
    perform app.evening_notify(e, v_other, 'evening.feedback_needed',
      jsonb_build_object('respond_until', app.iso_utc(app.now() + make_interval(hours => ops.setting_int('evening.no_show_contest_hours'))),
                         'require_state', jsonb_build_array('confirmed')),
      true, false, null, 'contest');
  end if;

  v_outcome := app.evening_resolve_outcome(e.id, false);

  v_offer := app.debrief_offer_for(e.id, uid);
  if coalesce((v_offer ->> 'eligible')::boolean, false) then
    perform app.evening_notify(e, uid, 'evening.debrief_offer',
      jsonb_build_object('minutes', v_offer -> 'minutes', 'offer_until', v_offer -> 'offer_until'),
      false, false, null, 'offer');
  end if;

  select * into e from app.evenings where id = e.id;
  return jsonb_build_object(
    'submitted', true,
    'state', e.state,
    'contact_share', app.contact_share_for(e.id, uid),
    'debrief', v_offer);
end;
$$;
comment on function api.submit_feedback(uuid, boolean, boolean, boolean, text, boolean, integer, integer, text, boolean, boolean) is
  'Rückmeldung zum eigenen Abend (einmal). Kontakttausch nur mit Einwilligung kontakttausch; wird erst bei beidseitigem Ja freigegeben.';
grant execute on function api.submit_feedback(uuid, boolean, boolean, boolean, text, boolean, integer, integer, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Finde-Fenster: 15 Minuten vor bis 45 Minuten nach Beginn. Außerhalb: null.
-- ---------------------------------------------------------------------------
create or replace function api.evening_find_info(p_evening_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings := app.evening_for_member(p_evening_id);
  r app.evening_reservations;
  v_opens timestamptz;
  v_closes timestamptz;
begin
  if e.state not in ('confirmed', 'happened') or e.starts_at is null then
    return null;
  end if;
  v_opens := e.starts_at - make_interval(mins => ops.setting_int('evening.find_window_before_minutes'));
  v_closes := e.starts_at + make_interval(mins => ops.setting_int('evening.find_window_after_minutes'));
  if app.now() < v_opens or app.now() > v_closes then
    return null;
  end if;
  select * into r from app.evening_reservations x where x.evening_id = e.id and x.status = 'reserved';
  return jsonb_build_object(
    'opens_at', v_opens,
    'closes_at', v_closes,
    'starts_at', e.starts_at,
    'reservation_name', ops.setting_text('evening.reservation_name'),
    'table_code', r.table_code,
    'venue', app.venue_public(e.venue_id),
    'counterpart_first_name', app.member_first_name(app.evening_other(e, uid)),
    'counterpart_hint', (select h.hint from app.evening_hints h where h.evening_id = e.id and h.user_id = app.evening_other(e, uid)),
    'my_hint', (select h.hint from app.evening_hints h where h.evening_id = e.id and h.user_id = uid),
    -- Frage B7 (Erkennungsfoto): noch nicht entschieden, deshalb immer null.
    'counterpart_photo_url', null);
end;
$$;
comment on function api.evening_find_info(uuid) is
  'Finde-Fenster: Reservierungsname, Tisch-Code, Vorname und Erkennungszeichen des Gegenübers. Außerhalb des Fensters null.';
grant execute on function api.evening_find_info(uuid) to authenticated;

create or replace function api.set_recognition_hint(p_evening_id uuid, p_hint text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  e app.evenings := app.evening_for_member(p_evening_id);
  v text := nullif(trim(regexp_replace(coalesce(p_hint, ''), '[[:cntrl:][:space:]]+', ' ', 'g')), '');
begin
  if e.state <> 'confirmed' then
    raise exception 'Nur für bestätigte Abende' using errcode = '55000', hint = 'invalid_state';
  end if;
  if e.starts_at is not null
     and app.now() > e.starts_at + make_interval(mins => ops.setting_int('evening.find_window_after_minutes')) then
    raise exception 'Das Finde-Fenster ist vorbei' using errcode = '55000', hint = 'find_window_closed';
  end if;
  if v is null then
    delete from app.evening_hints where evening_id = e.id and user_id = uid;
    return null;
  end if;
  if char_length(v) > ops.setting_int('evening.recognition_hint_max_chars') then
    raise exception 'Höchstens % Zeichen', ops.setting_int('evening.recognition_hint_max_chars')
      using errcode = '22023', hint = 'hint_too_long';
  end if;
  insert into app.evening_hints (evening_id, user_id, hint, updated_at)
  values (e.id, uid, v, app.now())
  on conflict (evening_id, user_id) do update set hint = excluded.hint, updated_at = excluded.updated_at;
  return v;
end;
$$;
comment on function api.set_recognition_hint(uuid, text) is 'Eigenes Erkennungszeichen (höchstens 80 Zeichen); leer löscht es.';
grant execute on function api.set_recognition_hint(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Admin: Ergebnis von Hand festlegen (z. B. bestrittenes Nichterscheinen)
-- ---------------------------------------------------------------------------
create or replace function api.admin_resolve_evening(p_evening_id uuid, p_outcome text, p_no_show_user uuid default null,
  p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_id uuid := app.m5_require_admin();
  e app.evenings;
begin
  select * into e from app.evenings where id = p_evening_id for update;
  if not found then
    raise exception 'Abend nicht gefunden' using errcode = 'P0002', hint = 'evening_not_found';
  end if;
  if e.state <> 'confirmed' then
    raise exception 'Nur bestätigte Abende' using errcode = '55000', hint = 'invalid_state';
  end if;
  if p_outcome not in ('happened', 'no_show') then
    raise exception 'Ergebnis happened oder no_show' using errcode = '22023', hint = 'invalid_outcome';
  end if;
  if p_outcome = 'no_show' and p_no_show_user is not null and p_no_show_user not in (e.user_a, e.user_b) then
    raise exception 'Person gehört nicht zu diesem Abend' using errcode = '22023', hint = 'invalid_user';
  end if;
  update app.evenings set no_show_user = case when p_outcome = 'no_show' then p_no_show_user end where id = e.id;
  perform app.evening_transition(e.id, p_outcome, admin_id, jsonb_build_object('by', 'admin', 'note', p_note)
    || case when p_outcome = 'no_show' then jsonb_build_object('no_show_user', p_no_show_user) else '{}'::jsonb end);
  perform ops.audit('evening.resolve', 'app.evenings', e.id::text,
    jsonb_build_object('outcome', p_outcome, 'no_show_user', p_no_show_user, 'note', p_note));
  return jsonb_build_object('evening_id', e.id, 'state', p_outcome);
end;
$$;
comment on function api.admin_resolve_evening(uuid, text, uuid, text) is
  'Admin: happened oder no_show festlegen (no_show ohne Person = beide nicht erschienen).';
grant execute on function api.admin_resolve_evening(uuid, text, uuid, text) to authenticated;
