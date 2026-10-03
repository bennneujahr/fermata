-- Härtung · Vertrag 2: api.admin_safety_transcript – Einsicht nur für Admins mit Zwei-Faktor, nur bei offenem
-- Sicherheitsfall zur Person, mit Begründung, im Audit ohne Inhalt; gelöschte Transkripte → deleted = true.
begin;
select no_plan();
\ir 500_fixtures.sql

create function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-000000000' || n)::uuid; $$;
select tests.create_user('t' || n || '@example.test', pg_temp.u(n)) from generate_series(921, 924) n;
insert into app.accounts (user_id, status) select pg_temp.u(n), 'active' from generate_series(921, 924) n;
insert into app.admin_users (user_id, display_name) values (pg_temp.u(924), 'Dora');

-- Gespräch mit Transkript (921) und ein zweites ohne Sicherheitsfall (922)
insert into app.interview_sessions (id, user_id, kind, mode, status, started_at, ended_at, safety_flagged, end_reason)
values ('92000000-0000-0000-0000-000000000001', pg_temp.u(921), 'erstgespraech', 'voice', 'aborted', now() - interval '1 hour', now(), true, 'krise'),
       ('92000000-0000-0000-0000-000000000002', pg_temp.u(922), 'erstgespraech', 'text', 'completed', now() - interval '1 hour', now(), false, 'fertig');
insert into app.interview_transcripts (session_id, user_id, turns) values
  ('92000000-0000-0000-0000-000000000001', pg_temp.u(921), '[{"role":"viola","text":"Guten Tag."},{"role":"person","text":"Mir geht es gar nicht gut."}]'),
  ('92000000-0000-0000-0000-000000000002', pg_temp.u(922), '[{"role":"person","text":"Hallo."}]');

create temp table r (k text primary key, v jsonb);
grant select, insert on r to public;

-- Rechte
select ok(has_function_privilege('authenticated', 'api.admin_safety_transcript(uuid, text)', 'execute'), 'authenticated darf aufrufen (Funktion prüft Admin)');
select ok(not has_function_privilege('anon', 'api.admin_safety_transcript(uuid, text)', 'execute'), 'anon nicht');
select ok(not has_function_privilege('service_role', 'api.admin_safety_transcript(uuid, text)', 'execute'), 'service_role nicht');

-- Kein Admin / Admin ohne Zwei-Faktor
select tests.act_as(pg_temp.u(921), 'aal2');
select is(tests.hint_of($$ select api.admin_safety_transcript('92000000-0000-0000-0000-000000000001', 'Prüfung eines Krisenhinweises') $$),
  'admin_aal2_required', 'Mitglied: abgelehnt (auch das eigene Gespräch – dafür gibt es RLS)');
select tests.reset_role();
select tests.act_as(pg_temp.u(924), 'aal1');
select is(tests.hint_of($$ select api.admin_safety_transcript('92000000-0000-0000-0000-000000000001', 'Prüfung eines Krisenhinweises') $$),
  'admin_aal2_required', 'Admin ohne Zwei-Faktor: abgelehnt');
select tests.reset_role();

-- Ohne offenen Sicherheitsfall: keine Einsicht
select tests.act_as(pg_temp.u(924), 'aal2');
select is(tests.hint_of($$ select api.admin_safety_transcript('92000000-0000-0000-0000-000000000001', 'Prüfung eines Krisenhinweises') $$),
  'no_safety_case', 'Ohne offenen Hinweis oder offene Meldung: abgelehnt');
select is(tests.hint_of($$ select api.admin_safety_transcript('92000000-0000-0000-0000-000000000001', 'kurz') $$),
  'reason_required', 'Begründung unter 10 Zeichen: abgelehnt');
select is(tests.hint_of($$ select api.admin_safety_transcript('92000000-0000-0000-0000-0000000000ff', 'Prüfung eines Krisenhinweises') $$),
  'not_found', 'Unbekannte Sitzung');
select tests.reset_role();

-- Offener Hinweis des Sicherheits-Agenten zur Person 921
insert into safety.safety_flags (user_id, source, kind, severity, details)
values (pg_temp.u(921), 'agent', 'krise', 'hoch', jsonb_build_object('session_id', '92000000-0000-0000-0000-000000000001'));
select tests.act_as(pg_temp.u(924), 'aal2');
insert into r values ('view', api.admin_safety_transcript('92000000-0000-0000-0000-000000000001', 'Prüfung eines Krisenhinweises vom Agenten'));
select is((select jsonb_array_length(v -> 'turns') from r where k = 'view'), 2, 'Mit offenem Hinweis: Transkript sichtbar');
select is((select v ->> 'deleted' from r where k = 'view'), 'false', 'deleted = false');
select is((select v -> 'session' ->> 'id' from r where k = 'view'), '92000000-0000-0000-0000-000000000001', 'session mit Kennung');
select is((select v -> 'session' ->> 'end_reason' from r where k = 'view'), 'krise', 'session mit Ende-Grund');
-- Der Hinweis zu 921 öffnet nicht das Gespräch einer anderen Person
select is(tests.hint_of($$ select api.admin_safety_transcript('92000000-0000-0000-0000-000000000002', 'Prüfung eines Krisenhinweises vom Agenten') $$),
  'no_safety_case', 'Hinweis gilt nur für die betroffene Person');
select tests.reset_role();

-- Audit ohne Inhalt
select is((select count(*)::int from ops.audit_log where action = 'safety.admin_view_transcript' and target_id = '92000000-0000-0000-0000-000000000001'),
  1, 'Einsicht steht im Audit');
select is((select actor from ops.audit_log where action = 'safety.admin_view_transcript'), pg_temp.u(924), 'mit handelndem Admin');
select is((select details ->> 'reason' from ops.audit_log where action = 'safety.admin_view_transcript'),
  'Prüfung eines Krisenhinweises vom Agenten', 'mit Begründung');
select ok((select details::text not like '%gar nicht gut%' and details::text not like '%Guten Tag%' from ops.audit_log where action = 'safety.admin_view_transcript'),
  'ohne Inhalte des Gesprächs');

-- Offene Meldung gegen 922 öffnet dessen Gespräch; geprüfter Hinweis zu 921 schließt es wieder
insert into safety.reports (reporter, reported, context, category, status) values (pg_temp.u(923), pg_temp.u(922), 'sonstiges', 'belaestigung', 'in_review');
update safety.safety_flags set reviewed_at = now(), outcome = 'geprüft' where user_id = pg_temp.u(921);
select tests.act_as(pg_temp.u(924), 'aal2');
select is(jsonb_array_length(api.admin_safety_transcript('92000000-0000-0000-0000-000000000002', 'Meldung wegen Belästigung prüfen') -> 'turns'),
  1, 'Offene Meldung gegen die Person: Transkript sichtbar');
select is(tests.hint_of($$ select api.admin_safety_transcript('92000000-0000-0000-0000-000000000001', 'Prüfung eines Krisenhinweises vom Agenten') $$),
  'no_safety_case', 'Hinweis geprüft: keine Einsicht mehr');
select tests.reset_role();
-- Abgeschlossene Meldung öffnet nichts
update safety.reports set status = 'resolved', resolved_at = now() where reported = pg_temp.u(922);
select tests.act_as(pg_temp.u(924), 'aal2');
select is(tests.hint_of($$ select api.admin_safety_transcript('92000000-0000-0000-0000-000000000002', 'Meldung wegen Belästigung prüfen') $$),
  'no_safety_case', 'Abgeschlossene Meldung: keine Einsicht');
select tests.reset_role();

-- Transkript nach der 30-Tage-Frist gelöscht → deleted = true, keine Beiträge
insert into safety.safety_flags (user_id, source, kind, severity) values (pg_temp.u(921), 'agent', 'krise', 'hoch');
select ops.sim_clock_advance(interval '31 days');
select ok(ops.purge_transcripts() >= 2, 'Löschjob entfernt die Transkripte nach 30 Tagen');
select tests.act_as(pg_temp.u(924), 'aal2');
insert into r values ('gone', api.admin_safety_transcript('92000000-0000-0000-0000-000000000001', 'Nachprüfung nach Ablauf der Frist'));
select is((select v ->> 'deleted' from r where k = 'gone'), 'true', 'Gelöschtes Transkript: deleted = true');
select is((select v -> 'turns' from r where k = 'gone'), '[]'::jsonb, 'und keine Beiträge');
select tests.reset_role();
select ops.sim_clock_reset();
select is((select details ->> 'deleted' from ops.audit_log where action = 'safety.admin_view_transcript' order by id desc limit 1),
  'true', 'Audit vermerkt, dass nichts mehr da war');

select * from finish();
rollback;
