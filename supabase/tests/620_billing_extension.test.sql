-- M6: Verlängerungsregel (Frage B12) mit simulierter Uhr.
begin;
select plan(24);

-- 621..628: Mitglieder mit laufendem Zeitraum, 629: Gegenüber ohne Mitgliedschaft (Gratisphase)
insert into app.match_runs (id, scheduled_for, status) values ('62000000-0000-0000-0000-000000000001', now(), 'approved');

create function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-000000000' || n)::uuid; $$;
create function pg_temp.member(n int, sub text) returns void language plpgsql as $$
begin
  perform tests.create_user('x' || n || '@example.test', pg_temp.u(n));
  insert into app.accounts (user_id, status) values (pg_temp.u(n), 'active');
  insert into billing.memberships (user_id, status, tier, stripe_customer_id, stripe_subscription_id, contract_number, ordered_at, free_phase_ended_at)
  values (pg_temp.u(n), 'pending', 'andante', 'cus_' || n, sub, 'FM-EXT-' || n, app.now(), app.now());
  perform billing.apply_invoice_paid(sub, 'cus_' || n, 'in_' || n, app.now(), app.now() + interval '28 days', 14900);
end $$;
create function pg_temp.evening(a uuid, b uuid, starts interval) returns uuid language plpgsql as $$
declare pid uuid; eid uuid;
begin
  insert into app.pairings (run_id, user_a, user_b, total_score, status)
  values ('62000000-0000-0000-0000-000000000001', least(a, b), greatest(a, b), 0.8, 'proposed') returning id into pid;
  insert into app.evenings (pairing_id, user_a, user_b, starts_at) values (pid, least(a, b), greatest(a, b), app.now() + starts)
  returning id into eid;
  return eid;
end $$;
create function pg_temp.period(n int) returns billing.membership_periods language sql as $$
  select * from billing.membership_periods where user_id = pg_temp.u(n) order by starts_at desc limit 1;
$$;

select pg_temp.member(621, 'sub_621');  -- kein Abend: verlängert
select pg_temp.member(622, 'sub_622');  -- Abend fand statt: nicht verlängert
select pg_temp.member(623, 'sub_623');  -- selbst früh abgesagt: nicht verlängert
select pg_temp.member(624, 'sub_624');  -- Gegenüber sagt kurzfristig ab: verlängert
select pg_temp.member(625, 'sub_625');  -- bestätigter Abend steht noch an: nicht verlängert
select pg_temp.member(626, 'sub_626');  -- gekündigt, kein Abend: verlängert, Kündigung verschiebt sich
select pg_temp.member(627, 'sub_627');  -- Vorschlag verfallen, weil 627 nicht geantwortet hat: nicht verlängert
select pg_temp.member(628, 'sub_628');  -- Vorschlag verfallen, weil das Gegenüber nicht geantwortet hat: verlängert
select tests.create_user('x629@example.test', pg_temp.u(629));
insert into app.accounts (user_id, status) values (pg_temp.u(629), 'active');
insert into billing.memberships (user_id) values (pg_temp.u(629));
insert into billing.evening_ledger (user_id, kind, amount, note) values (pg_temp.u(629), 'adjust', 5, 'Testguthaben');

create temp table ev (name text primary key, id uuid);
-- 622: Abend findet statt
insert into ev values ('e622', pg_temp.evening(pg_temp.u(622), pg_temp.u(629), interval '3 days'));
select app.evening_transition((select id from ev where name = 'e622'), 'request_time', pg_temp.u(622));
select app.evening_transition((select id from ev where name = 'e622'), 'confirm', pg_temp.u(629));
select app.evening_transition((select id from ev where name = 'e622'), 'happened');
-- 623: sagt selbst früh ab
insert into ev values ('e623', pg_temp.evening(pg_temp.u(623), pg_temp.u(629), interval '5 days'));
select app.evening_transition((select id from ev where name = 'e623'), 'request_time', pg_temp.u(623));
select app.evening_transition((select id from ev where name = 'e623'), 'confirm', pg_temp.u(629));
select app.evening_transition((select id from ev where name = 'e623'), 'cancel_early', pg_temp.u(623));
-- 624: Gegenüber sagt kurzfristig ab
insert into ev values ('e624', pg_temp.evening(pg_temp.u(624), pg_temp.u(629), interval '6 days'));
select app.evening_transition((select id from ev where name = 'e624'), 'request_time', pg_temp.u(624));
select app.evening_transition((select id from ev where name = 'e624'), 'confirm', pg_temp.u(629));
select app.evening_transition((select id from ev where name = 'e624'), 'cancel_late', pg_temp.u(629));
-- 625: bestätigter Abend kurz vor Ende des Zeitraums
insert into ev values ('e625', pg_temp.evening(pg_temp.u(625), pg_temp.u(629), interval '27 days 23 hours'));
select app.evening_transition((select id from ev where name = 'e625'), 'request_time', pg_temp.u(625));
select app.evening_transition((select id from ev where name = 'e625'), 'confirm', pg_temp.u(629));
-- 626: gekündigt
select billing.record_cancellation(pg_temp.u(626), '{"kind": "ordentlich", "name": "Test"}');
-- 627: 629 wünscht eine Zeit, 627 antwortet nicht
insert into ev values ('e627', pg_temp.evening(pg_temp.u(627), pg_temp.u(629), interval '7 days'));
select app.evening_transition((select id from ev where name = 'e627'), 'request_time', pg_temp.u(629));
update app.evenings set requested_by = pg_temp.u(629) where id = (select id from ev where name = 'e627');
select app.evening_transition((select id from ev where name = 'e627'), 'lapse');
-- 628: 628 wünscht eine Zeit, 629 antwortet nicht
insert into ev values ('e628', pg_temp.evening(pg_temp.u(628), pg_temp.u(629), interval '7 days'));
select app.evening_transition((select id from ev where name = 'e628'), 'request_time', pg_temp.u(628));
update app.evenings set requested_by = pg_temp.u(628) where id = (select id from ev where name = 'e628');
select app.evening_transition((select id from ev where name = 'e628'), 'lapse');

-- Zu früh: noch nicht im Prüffenster
select ops.sim_clock_advance(interval '20 days');
select is(billing.apply_extension_rule(), 0, 'Vor dem Prüffenster wird nichts verlängert');

-- Im Prüffenster (6 Stunden vor Ende)
select ops.sim_clock_advance(interval '7 days 20 hours');
select is(billing.apply_extension_rule(), 4, 'Vier Zeiträume ohne Abend werden verlängert');
select ok((pg_temp.period(621)).extended_by_rule, '621: kein Abend → verlängert');
select is((pg_temp.period(621)).extended_until, (pg_temp.period(621)).ends_at + interval '28 days', '621: um 28 Tage verlängert');
select is((pg_temp.period(621)).stripe_sync_status, 'pending', '621: Stripe-Verschiebung steht aus (billing-extend)');
select ok(not (pg_temp.period(622)).extended_by_rule, '622: Abend fand statt → nicht verlängert');
select ok(not (pg_temp.period(623)).extended_by_rule, '623: selbst abgesagt → nicht verlängert');
select ok((pg_temp.period(624)).extended_by_rule, '624: Gegenüber sagte kurzfristig ab → verlängert');
select ok(not (pg_temp.period(625)).extended_by_rule, '625: bestätigter Abend steht noch an → nicht verlängert');
select ok((pg_temp.period(626)).extended_by_rule, '626: gekündigt, kein Abend → verlängert');
select is((select cancel_at from billing.memberships where user_id = pg_temp.u(626)), (pg_temp.period(626)).extended_until,
  '626: Kündigung wird zum neuen Ende wirksam');
select ok(not (pg_temp.period(627)).extended_by_rule, '627: eigene Frist verstreichen lassen → nicht verlängert');
select ok((pg_temp.period(628)).extended_by_rule, '628: Gegenüber ließ die Frist verstreichen → verlängert');
select is(billing.apply_extension_rule(), 0, 'Zweiter Lauf verlängert nicht doppelt');

-- Abende bleiben über das ursprüngliche Ende hinaus erhalten
select ops.sim_clock_advance(interval '7 hours');
select is(billing.available_evenings(pg_temp.u(621)), 2, '621: nach dem ursprünglichen Ende weiter 2 Abende');
select is(billing.available_evenings(pg_temp.u(622)), 0, '622: ohne Verlängerung verfallen die übrigen Abende');
select is(billing.available_evenings(pg_temp.u(624)), 2, '624: zurückgegebener Abend bleibt in der Verlängerung erhalten');

-- Stripe-Seite (billing-extend)
select is((select count(*)::int from billing.extension_work() where sync_needed), 4, 'Vier Verschiebungen für Stripe offen');
select billing.mark_extension((pg_temp.period(621)).id, true, null, true);
select is((pg_temp.period(621)).stripe_sync_status, 'synced', 'Verschiebung als erledigt vermerkt');
select isnt((pg_temp.period(621)).extension_notified_at, null, 'Hinweis-Mail vermerkt');

-- Ende der Verlängerung: höchstens einmal je Zeitraum (billing.extension_max_per_period)
select ops.sim_clock_advance(interval '27 days 20 hours');
select is(billing.apply_extension_rule(), 0, 'Eine Verlängerung je Zeitraum (Einstellung)');
select ops.sim_clock_advance(interval '1 day');
select is(billing.available_evenings(pg_temp.u(621)), 0, 'Nach der Verlängerung verfallen die Abende');

-- Schalter aus
select ops.sim_clock_reset();
update ops.app_settings set value = 'false' where key = 'billing.extension_rule_enabled';
select is(billing.apply_extension_rule(), 0, 'Regel ausgeschaltet: keine Verlängerung');
select ok(billing.period_without_evening(pg_temp.u(621), app.now() - interval '1 day', app.now()), 'period_without_evening ohne Ereignisse: true');

select * from finish();
rollback;
