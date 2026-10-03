-- Meldung aus einem Abend mit „betrifft mein Gegenüber“: api.report leitet die Person aus dem Abend ab.
-- Ohne diese Angabe bleibt die Meldung ohne Person (z. B. zum Lokal), auch bei schweren Arten.
begin;
select plan(6);

select tests.create_user('melde-a@example.test', '00000000-0000-0000-0000-000000000751');
select tests.create_user('melde-b@example.test', '00000000-0000-0000-0000-000000000752');
insert into app.accounts (user_id, status) values
  ('00000000-0000-0000-0000-000000000751', 'active'), ('00000000-0000-0000-0000-000000000752', 'active');
insert into app.match_runs (id, scheduled_for, status) values ('75000000-0000-0000-0000-000000000001', now(), 'approved');
insert into app.pairings (id, run_id, user_a, user_b, total_score, status)
  values ('75000000-0000-0000-0000-000000000002', '75000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752', 0.8, 'proposed');
insert into app.evenings (id, pairing_id, user_a, user_b, state, starts_at)
  values ('75000000-0000-0000-0000-000000000003', '75000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000752', 'happened', app.now() - interval '1 day');

select tests.act_as('00000000-0000-0000-0000-000000000751');
select lives_ok($$ select api.report('abend', 'belaestigung', null, '75000000-0000-0000-0000-000000000003', 'Bitte prüfen', true,
  p_about_counterpart => true) $$, 'Meldung „betrifft mein Gegenüber“ ohne Kennung der Person');
select tests.reset_role();
select is((select reported from safety.reports where reporter = '00000000-0000-0000-0000-000000000751' and category = 'belaestigung'),
  '00000000-0000-0000-0000-000000000752'::uuid, 'Gegenüber wird aus dem Abend abgeleitet');

select tests.act_as('00000000-0000-0000-0000-000000000751');
select lives_ok($$ select api.report('abend', 'diskriminierung', null, '75000000-0000-0000-0000-000000000003', 'Am Nebentisch', true) $$,
  'Meldung zum Abend, die etwas anderes betrifft');
select tests.reset_role();
select ok((select reported is null from safety.reports where reporter = '00000000-0000-0000-0000-000000000751' and category = 'diskriminierung'),
  'Ohne „betrifft mein Gegenüber“ wird keine Person eingetragen');

select tests.act_as('00000000-0000-0000-0000-000000000751');
select lives_ok($$ select api.report('sonstiges', 'sonstiges', null, null, 'Allgemeiner Hinweis', false, p_about_counterpart => true) $$,
  'Ohne Abend bleibt „betrifft mein Gegenüber“ folgenlos');
select tests.reset_role();
select ok((select reported is null from safety.reports where reporter = '00000000-0000-0000-0000-000000000751' and category = 'sonstiges'),
  'Ohne Abend keine Person');

select * from finish();
rollback;
