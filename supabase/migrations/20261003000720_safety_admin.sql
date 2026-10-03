-- Fermata · M7 Sicherheit, Teil 2: Admin-Funktionen (nur mit Zwei-Faktor, app.is_admin()),
-- Entscheidungen, Sanktionen, Widersprüche, Hinweise, Vorlage für eine Polizeimeldung.

create or replace function safety.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_admin() then
    raise exception 'Nur für Admins mit Zwei-Faktor-Anmeldung' using errcode = '42501', hint = 'admin_required';
  end if;
end;
$$;

-- Einheitliche Sperrlisten-Schlüssel (für M2: bei der Ausweisprüfung dieselben Funktionen benutzen und
-- das Ergebnis in safety.verification_hashes ablegen; abgleichen gegen safety.blocklist).
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

create or replace function safety.person_label(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select trim(f.first_name || ' ' || f.last_name) from private.account_facts f where f.user_id = p_user),
                  case when p_user is null then null else 'Person ohne Angaben' end);
$$;

-- ---------------------------------------------------------------------------
-- Meldungen
-- ---------------------------------------------------------------------------
create or replace function api.admin_reports(p_status text default null)
returns table (
  id uuid, created_at timestamptz, due_at timestamptz, overdue boolean, status text, severity text,
  context text, category text, category_label text, evening_id uuid,
  reporter uuid, reporter_name text, reported uuid, reported_name text, related boolean,
  description text, wants_contact boolean, prior_reports_against integer, active_sanction text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform safety.require_admin();
  return query
    select r.id, r.created_at, r.due_at, (r.status in ('open', 'in_review') and r.due_at < app.now()),
           r.status, r.severity, r.context, r.category, safety.category_label(r.category), r.evening_id,
           r.reporter, safety.person_label(r.reporter), r.reported, safety.person_label(r.reported), r.related,
           r.description, r.wants_contact,
           (select count(*)::integer from safety.reports x where x.reported = r.reported and x.id <> r.id and r.reported is not null),
           (select s.kind from safety.sanctions s where s.user_id = r.reported and s.lifted_at is null
              and (s.ends_at is null or s.ends_at > app.now()) order by s.created_at desc limit 1)
    from safety.reports r
    where (p_status is null and r.status in ('open', 'in_review')) or r.status = p_status
    order by safety.severity_rank(r.severity) desc, r.due_at asc nulls last;
end;
$$;
grant execute on function api.admin_reports(text) to authenticated;

create or replace function api.admin_report(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r safety.reports;
  ev jsonb;
begin
  perform safety.require_admin();
  select * into r from safety.reports where id = p_report_id;
  if not found then
    raise exception 'Meldung nicht gefunden' using errcode = 'P0002', hint = 'report_not_found';
  end if;
  select jsonb_build_object('id', e.id, 'state', e.state, 'starts_at', e.starts_at,
           'venue', case when v.id is not null then jsonb_build_object('name', v.name, 'street', v.street, 'postal_code', v.postal_code, 'city', v.city) end,
           'events', (select coalesce(jsonb_agg(jsonb_build_object('at', x.at, 'event', x.event, 'from', x.from_state, 'to', x.to_state) order by x.at), '[]'::jsonb)
                      from app.evening_events x where x.evening_id = e.id),
           'checkins', (select coalesce(jsonb_agg(jsonb_build_object('at', c.created_at, 'user_id', c.user_id, 'status', c.status) order by c.created_at), '[]'::jsonb)
                        from safety.checkins c where c.evening_id = e.id))
  into ev
  from app.evenings e left join app.venues v on v.id = e.venue_id where e.id = r.evening_id;
  perform ops.audit('safety.admin_view_report', 'safety.reports', r.id::text);
  return jsonb_build_object(
    'report', to_jsonb(r) || jsonb_build_object('category_label', safety.category_label(r.category)),
    'reporter', jsonb_build_object('user_id', r.reporter, 'name', safety.person_label(r.reporter)),
    'reported', case when r.reported is not null then jsonb_build_object('user_id', r.reported, 'name', safety.person_label(r.reported),
      'account_status', (select a.status from app.accounts a where a.user_id = r.reported)) end,
    'evening', ev,
    'prior_reports_against', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'created_at', x.created_at, 'category', x.category,
        'status', x.status) order by x.created_at desc), '[]'::jsonb)
      from safety.reports x where r.reported is not null and x.reported = r.reported and x.id <> r.id),
    'sanctions', (select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc), '[]'::jsonb)
      from safety.sanctions s where s.user_id = r.reported),
    'flags', (select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb)
      from safety.safety_flags f where f.details ->> 'report_id' = r.id::text));
end;
$$;
grant execute on function api.admin_report(uuid) to authenticated;

create or replace function api.admin_set_report_status(p_report_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform safety.require_admin();
  if p_status not in ('open', 'in_review') then
    raise exception 'Status open oder in_review (Abschluss über api.admin_decide_report)' using errcode = '22023', hint = 'invalid_status';
  end if;
  update safety.reports set status = p_status where id = p_report_id and status in ('open', 'in_review');
  if not found then
    raise exception 'Meldung nicht gefunden oder schon abgeschlossen' using errcode = 'P0002', hint = 'report_not_found';
  end if;
  perform ops.audit('safety.report_status', 'safety.reports', p_report_id::text, jsonb_build_object('status', p_status));
end;
$$;
grant execute on function api.admin_set_report_status(uuid, text) to authenticated;

-- Sanktion aufheben (intern, ohne Admin-Prüfung)
create or replace function safety.lift_sanction(p_sanction_id uuid, p_reason text, p_notify boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s safety.sanctions;
begin
  update safety.sanctions set lifted_at = app.now(), lifted_by = auth.uid(), lift_reason = p_reason
  where id = p_sanction_id and lifted_at is null
  returning * into s;
  if not found then
    return false;
  end if;
  if s.kind = 'ausschluss' then
    delete from safety.blocklist where sanction_id = s.id;
  end if;
  perform safety.restore_account(s.user_id);
  if p_notify and s.kind <> 'hinweis' then
    perform safety.enqueue_mail(s.user_id, false, 'safety.sanction_lifted', jsonb_build_object('reason', 'aufgehoben'));
  end if;
  perform ops.audit('safety.sanction_lifted', 'safety.sanctions', s.id::text, jsonb_build_object('reason', p_reason));
  return true;
end;
$$;

-- Meldung abschließen. Bei „dismissed“ wird eine vorläufige Sperre aus dieser Meldung standardmäßig aufgehoben.
create or replace function api.admin_decide_report(p_report_id uuid, p_decision text, p_resolution text,
  p_lift_provisional boolean default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r safety.reports;
  s record;
  lifted integer := 0;
begin
  perform safety.require_admin();
  if p_decision not in ('resolved', 'dismissed') then
    raise exception 'Entscheidung: resolved oder dismissed' using errcode = '22023', hint = 'invalid_decision';
  end if;
  if p_resolution is null or char_length(trim(p_resolution)) < 3 then
    raise exception 'Bitte eine Begründung angeben.' using errcode = '22023', hint = 'resolution_required';
  end if;
  update safety.reports set status = p_decision, resolved_at = app.now(), resolved_by = auth.uid(), resolution = trim(p_resolution)
  where id = p_report_id and status in ('open', 'in_review')
  returning * into r;
  if not found then
    raise exception 'Meldung nicht gefunden oder schon abgeschlossen' using errcode = 'P0002', hint = 'report_not_found';
  end if;
  if coalesce(p_lift_provisional, p_decision = 'dismissed') then
    for s in select id from safety.sanctions where report_id = r.id and kind = 'vorlaeufige_sperre' and lifted_at is null loop
      if safety.lift_sanction(s.id, 'Meldung geprüft: ' || p_decision) then
        lifted := lifted + 1;
      end if;
    end loop;
  end if;
  update safety.safety_flags set reviewed_at = app.now(), reviewed_by = auth.uid(), outcome = p_decision
  where details ->> 'report_id' = r.id::text and reviewed_at is null;
  if r.wants_contact and r.reporter is not null then
    perform safety.enqueue_mail(r.reporter, false, 'safety.report_closed', jsonb_build_object('report_id', r.id));
  end if;
  perform ops.audit('safety.report_decided', 'safety.reports', r.id::text,
    jsonb_build_object('decision', p_decision, 'lifted_provisional', lifted));
  perform safety.kick_dispatch();
  return jsonb_build_object('report_id', r.id, 'status', r.status, 'lifted_provisional', lifted);
end;
$$;
grant execute on function api.admin_decide_report(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Sanktionen
-- ---------------------------------------------------------------------------
-- hinweis: nur Mitteilung. sperre: befristet (p_ends_at) oder unbefristet. ausschluss: dauerhaft + Sperrliste.
create or replace function api.admin_impose_sanction(p_user uuid, p_kind text, p_reason text,
  p_ends_at timestamptz default null, p_report_id uuid default null, p_blocklist_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  sid uuid;
  prev text;
  cancelled integer := 0;
  p record;
  f record;
  vh record;
  bl_reason text;
  name_h text;
  doc_h text;
  bl_id uuid;
begin
  perform safety.require_admin();
  if p_kind not in ('hinweis', 'sperre', 'ausschluss') then
    raise exception 'Art: hinweis, sperre oder ausschluss' using errcode = '22023', hint = 'invalid_kind';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'Bitte eine Begründung angeben (die Person sieht sie; keine Angaben zur meldenden Person).'
      using errcode = '22023', hint = 'reason_required';
  end if;
  if p_ends_at is not null and p_ends_at <= app.now() then
    raise exception 'Das Ende muss in der Zukunft liegen.' using errcode = '22023', hint = 'invalid_end';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Person nicht gefunden' using errcode = 'P0002', hint = 'user_not_found';
  end if;
  select a.status into prev from app.accounts a where a.user_id = p_user;
  insert into safety.sanctions (user_id, kind, reason, report_id, starts_at, ends_at, created_by, created_at, previous_account_status)
  values (p_user, p_kind, trim(p_reason), p_report_id, app.now(),
          case when p_kind = 'ausschluss' then null else p_ends_at end, auth.uid(), app.now(), prev)
  returning id into sid;

  if p_kind in ('sperre', 'ausschluss') then
    -- Vorläufige Sperren gehen in der endgültigen Entscheidung auf.
    for p in select id from safety.sanctions where user_id = p_user and kind = 'vorlaeufige_sperre' and lifted_at is null loop
      perform safety.lift_sanction(p.id, 'Ersetzt durch Entscheidung ' || p_kind, false);
    end loop;
    cancelled := safety.suspend_account(p_user, 'sicherheit');
  end if;

  if p_kind = 'ausschluss' then
    select af.first_name, af.last_name, af.birth_date into f from private.account_facts af where af.user_id = p_user;
    select * into vh from safety.verification_hashes where user_id = p_user;
    name_h := coalesce(vh.name_hash, safety.blocklist_name_hash(f.first_name, f.last_name, f.birth_date));
    doc_h := vh.doc_hash;
    bl_reason := coalesce(p_blocklist_reason,
      case (select r.category from safety.reports r where r.id = p_report_id)
        when 'minderjaehrig' then 'minderjaehrig' when 'betrug' then 'betrug'
        when 'uebergriff' then 'null_toleranz' when 'bedrohung' then 'null_toleranz'
        else 'wiederholte_verstoesse' end);
    if name_h is null and doc_h is null then
      raise exception 'Für den Ausschluss fehlen Name und Geburtsdatum (Sperrliste).' using errcode = 'P0001', hint = 'blocklist_data_missing';
    end if;
    insert into safety.blocklist (doc_hash, name_hash, reason_code, report_id, created_by, sanction_id, note)
    values (doc_h, name_h, bl_reason, p_report_id, auth.uid(), sid,
            case when doc_h is null then 'doc_hash aus Ausweisprüfung nachtragen (bei der Prüfung wurde kein Hash gespeichert)' end)
    returning id into bl_id;
  end if;

  perform safety.enqueue_mail(p_user, false, 'safety.sanction_notice', jsonb_build_object(
    'sanction_id', sid, 'kind', p_kind, 'ends_at', case when p_kind = 'ausschluss' then null else p_ends_at end,
    'reason', trim(p_reason)));
  perform ops.audit('safety.sanction', 'safety.sanctions', sid::text,
    jsonb_build_object('kind', p_kind, 'report_id', p_report_id, 'cancelled_evenings', cancelled, 'blocklist_id', bl_id));
  perform safety.kick_dispatch();
  return jsonb_build_object('sanction_id', sid, 'kind', p_kind, 'cancelled_evenings', cancelled, 'blocklist_id', bl_id,
    'doc_hash_missing', p_kind = 'ausschluss' and doc_h is null);
end;
$$;
grant execute on function api.admin_impose_sanction(uuid, text, text, timestamptz, uuid, text) to authenticated;

create or replace function api.admin_lift_sanction(p_sanction_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ok boolean;
begin
  perform safety.require_admin();
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'Bitte eine Begründung angeben.' using errcode = '22023', hint = 'reason_required';
  end if;
  ok := safety.lift_sanction(p_sanction_id, trim(p_reason));
  perform safety.kick_dispatch();
  return ok;
end;
$$;
grant execute on function api.admin_lift_sanction(uuid, text) to authenticated;

create or replace function api.admin_sanctions(p_user uuid default null, p_only_active boolean default true)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform safety.require_admin();
  return query
    select to_jsonb(s) || jsonb_build_object('person', safety.person_label(s.user_id),
      'appeal', (select to_jsonb(a) from safety.appeals a where a.sanction_id = s.id))
    from safety.sanctions s
    where (p_user is null or s.user_id = p_user)
      and (not coalesce(p_only_active, true) or (s.lifted_at is null and (s.ends_at is null or s.ends_at > app.now())))
    order by s.created_at desc;
end;
$$;
grant execute on function api.admin_sanctions(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Widersprüche
-- ---------------------------------------------------------------------------
create or replace function api.admin_appeals(p_status text default 'open')
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform safety.require_admin();
  return query
    select to_jsonb(a) || jsonb_build_object('person', safety.person_label(a.user_id), 'sanction', to_jsonb(s))
    from safety.appeals a join safety.sanctions s on s.id = a.sanction_id
    where p_status is null or a.status = p_status
    order by a.created_at;
end;
$$;
grant execute on function api.admin_appeals(text) to authenticated;

create or replace function api.admin_decide_appeal(p_appeal_id uuid, p_decision text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a safety.appeals;
  lifted boolean := false;
begin
  perform safety.require_admin();
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Entscheidung: accepted oder rejected' using errcode = '22023', hint = 'invalid_decision';
  end if;
  if p_note is null or char_length(trim(p_note)) < 3 then
    raise exception 'Bitte eine Begründung angeben (die Person bekommt sie per Mail).' using errcode = '22023', hint = 'note_required';
  end if;
  update safety.appeals set status = p_decision, decided_at = app.now(), decided_by = auth.uid(), decision_note = trim(p_note)
  where id = p_appeal_id and status = 'open'
  returning * into a;
  if not found then
    raise exception 'Widerspruch nicht gefunden oder schon entschieden' using errcode = 'P0002', hint = 'appeal_not_found';
  end if;
  if p_decision = 'accepted' then
    lifted := safety.lift_sanction(a.sanction_id, 'Widerspruch angenommen', false);
  end if;
  update safety.safety_flags set reviewed_at = app.now(), reviewed_by = auth.uid(), outcome = p_decision
  where details ->> 'appeal_id' = a.id::text and reviewed_at is null;
  perform safety.enqueue_mail(a.user_id, false, 'safety.appeal_decided', jsonb_build_object(
    'appeal_id', a.id, 'decision', p_decision, 'note', trim(p_note)));
  perform ops.audit('safety.appeal_decided', 'safety.appeals', a.id::text, jsonb_build_object('decision', p_decision));
  perform safety.kick_dispatch();
  return jsonb_build_object('appeal_id', a.id, 'status', p_decision, 'sanction_lifted', lifted);
end;
$$;
grant execute on function api.admin_decide_appeal(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Hinweise (Sicherheits-Agent, Sperrliste, Meldungen, Check-in)
-- ---------------------------------------------------------------------------
-- Liste der Hinweise: api.admin_safety_flags(p_open_only, p_limit) aus 20261003000250_web_admin.sql
-- (eine gemeinsame Funktion für Web-App und Sicherheitsbereich).

create or replace function api.admin_review_flag(p_flag_id uuid, p_outcome text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform safety.require_admin();
  if p_outcome is null or char_length(trim(p_outcome)) < 2 then
    raise exception 'Bitte ein Ergebnis angeben.' using errcode = '22023', hint = 'outcome_required';
  end if;
  update safety.safety_flags set reviewed_at = app.now(), reviewed_by = auth.uid(), outcome = trim(p_outcome)
  where id = p_flag_id and reviewed_at is null;
  if found then
    perform ops.audit('safety.flag_reviewed', 'safety.safety_flags', p_flag_id::text, jsonb_build_object('outcome', trim(p_outcome)));
  end if;
  return found;
end;
$$;
grant execute on function api.admin_review_flag(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Vorlage für eine Polizeimeldung (Entwurf; Benn entscheidet, ob Anzeige erstattet wird)
-- ---------------------------------------------------------------------------
create or replace function api.admin_police_report_template(p_report_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r safety.reports;
  e record;
  rf record;
  fmt constant text := 'DD.MM.YYYY, HH24:MI "Uhr"';
  t text;
begin
  perform safety.require_admin();
  select * into r from safety.reports where id = p_report_id;
  if not found then
    raise exception 'Meldung nicht gefunden' using errcode = 'P0002', hint = 'report_not_found';
  end if;
  select ev.starts_at, v.name, v.street, v.postal_code, v.city into e
  from app.evenings ev left join app.venues v on v.id = ev.venue_id where ev.id = r.evening_id;
  select f.first_name, f.last_name, f.birth_date, f.postal_code, f.city into rf
  from private.account_facts f where f.user_id = r.reported;
  perform ops.audit('safety.police_template', 'safety.reports', r.id::text);

  t := concat_ws(E'\n',
    'ENTWURF – Sachverhaltsdarstellung für eine Strafanzeige',
    '',
    'Wichtig: Diese Vorlage ist nur ein Entwurf. Ob Anzeige erstattet wird, entscheiden Sie (Benn) – nach Rücksprache mit der betroffenen Person. Fermata erstattet nichts automatisch. Bei akuter Gefahr: 110.',
    'Fehlende Angaben stehen in [ECKIGEN KLAMMERN] und müssen ergänzt oder gestrichen werden.',
    '',
    'An: [ZUSTÄNDIGE POLIZEIDIENSTSTELLE ODER ONLINEWACHE MECKLENBURG-VORPOMMERN]',
    'Von: Fermata, [ANSCHRIFT DES BETREIBERS], ' || coalesce(ops.setting_text('site.contact_email'), '[KONTAKT]'),
    'Datum: [DATUM DER ANZEIGE]',
    '',
    '1. Art des Vorfalls',
    '   ' || safety.category_label(r.category) || ' (Meldung bei Fermata, Bereich: ' || r.context || ')',
    '',
    '2. Tatzeit',
    '   ' || coalesce(to_char(e.starts_at at time zone 'Europe/Berlin', fmt) || ' (Beginn des verabredeten Treffens)', '[TATZEIT EINTRAGEN]'),
    '',
    '3. Tatort',
    '   ' || coalesce(e.name || ', ' || e.street || ', ' || e.postal_code || ' ' || e.city, '[TATORT EINTRAGEN]'),
    '',
    '4. Beschuldigte Person (Angaben aus dem Fermata-Konto, Ausweis wurde bei der Anmeldung geprüft)',
    '   Name: ' || coalesce(rf.first_name || ' ' || rf.last_name, '[NAME, FALLS BEKANNT]'),
    '   Geburtsdatum: ' || coalesce(to_char(rf.birth_date, 'DD.MM.YYYY'), '[GEBURTSDATUM]'),
    '   Wohnort: ' || coalesce(rf.postal_code || ' ' || coalesce(rf.city, ''), '[WOHNORT]'),
    '',
    '5. Geschädigte bzw. meldende Person',
    '   [NAME UND KONTAKT NUR MIT AUSDRÜCKLICHEM EINVERSTÄNDNIS DER PERSON EINTRAGEN]',
    '   Kontakt gewünscht: ' || case when r.wants_contact then 'ja' else 'nein' end,
    '',
    '6. Schilderung (Wortlaut der Meldung)',
    '   ' || coalesce(replace(r.description, E'\n', E'\n   '), '[SCHILDERUNG ERGÄNZEN]'),
    '',
    '7. Zeitpunkt der Meldung bei Fermata',
    '   ' || to_char(r.created_at at time zone 'Europe/Berlin', fmt),
    '',
    '8. Bisherige Maßnahmen von Fermata',
    '   ' || coalesce((select string_agg(
             case s.kind when 'vorlaeufige_sperre' then 'Vorläufige Sperre des Kontos' when 'sperre' then 'Sperre des Kontos'
               when 'ausschluss' then 'Ausschluss' else 'Hinweis' end || ' seit ' || to_char(s.starts_at at time zone 'Europe/Berlin', fmt), '; ')
             from safety.sanctions s where s.user_id = r.reported and s.lifted_at is null), 'keine'),
    '',
    '9. Beweismittel',
    '   [Z. B. Nachrichten, Fotos von Verletzungen, Namen von Zeuginnen und Zeugen, Personal des Lokals]',
    '',
    'Interne Kennung der Meldung: ' || r.id::text,
    '',
    'Hinweis Datenschutz: Daten der beschuldigten Person nur an die Polizei weitergeben, wenn Sie Anzeige erstatten (Art. 6 Abs. 1 lit. f DSGVO, § 24 BDSG). Weitergabe im Audit-Protokoll vermerken.');
  return t;
end;
$$;
grant execute on function api.admin_police_report_template(uuid) to authenticated;
