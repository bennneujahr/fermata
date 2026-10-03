-- M6: Kontingent-Buch – Regeln bei Zustandswechseln, Gratisphase, Freigabe für Vorschläge, Verfall.
begin;
select plan(53);

-- Personen (UUIDs aufsteigend, weil app.evenings user_a < user_b verlangt)
select tests.create_user('p601@example.test', '00000000-0000-0000-0000-000000000601');
select tests.create_user('p602@example.test', '00000000-0000-0000-0000-000000000602');
select tests.create_user('p603@example.test', '00000000-0000-0000-0000-000000000603');
select tests.create_user('p604@example.test', '00000000-0000-0000-0000-000000000604');
select tests.create_user('p605@example.test', '00000000-0000-0000-0000-000000000605');
select tests.create_user('p606@example.test', '00000000-0000-0000-0000-000000000606');
select tests.create_user('p607@example.test', '00000000-0000-0000-0000-000000000607');
select tests.create_user('p608@example.test', '00000000-0000-0000-0000-000000000608');
select tests.create_user('p609@example.test', '00000000-0000-0000-0000-000000000609');
insert into app.accounts (user_id, status)
select ('00000000-0000-0000-0000-00000000060' || n)::uuid, 'active' from generate_series(1, 9) n;
-- Wie die Web-App bei der Kontoerstellung: Mitgliedschaft „free“ und ein Gratis-Abend (nicht für 609).
insert into billing.memberships (user_id)
select ('00000000-0000-0000-0000-00000000060' || n)::uuid from generate_series(1, 8) n;
insert into billing.evening_ledger (user_id, kind, amount, note)
select ('00000000-0000-0000-0000-00000000060' || n)::uuid, 'free_grant', 1, 'Gratis-Abend' from generate_series(1, 8) n;

insert into app.match_runs (id, scheduled_for, status) values ('60000000-0000-0000-0000-000000000001', now(), 'approved');

create function pg_temp.evening(a uuid, b uuid, starts interval default interval '5 days')
returns uuid language plpgsql as $$
declare pid uuid; eid uuid;
begin
  insert into app.pairings (run_id, user_a, user_b, total_score, status)
  values ('60000000-0000-0000-0000-000000000001', least(a, b), greatest(a, b), 0.8, 'proposed') returning id into pid;
  insert into app.evenings (pairing_id, user_a, user_b, starts_at)
  values (pid, least(a, b), greatest(a, b), app.now() + starts) returning id into eid;
  return eid;
end $$;
create function pg_temp.confirm(e uuid) returns void language plpgsql as $$
declare ev app.evenings;
begin
  select * into ev from app.evenings where id = e;
  perform app.evening_transition(e, 'request_time', ev.user_a);
  perform app.evening_transition(e, 'confirm', ev.user_b);
end $$;
create function pg_temp.avail(n int) returns int language sql as $$
  select billing.available_evenings(('00000000-0000-0000-0000-00000000060' || n)::uuid);
$$;
create function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-00000000060' || n)::uuid; $$;

-- ---------------------------------------------------------------------------
-- Gratisphase und Freigabe für Vorschläge
-- ---------------------------------------------------------------------------
select is(pg_temp.avail(1), 1, 'Gratisphase: ein Abend verfügbar');
select ok(billing.can_receive_proposal(pg_temp.u(1)), 'Gratisphase: Person kann einen Vorschlag bekommen');
select is(billing.proposal_eligibility(pg_temp.u(1)) ->> 'reason', 'free_phase', 'Grund: Gratisphase');
select ok(not billing.can_receive_proposal(pg_temp.u(9)), 'Ohne Mitgliedschaftszeile kein Vorschlag');
select is(billing.proposal_eligibility(pg_temp.u(9)) ->> 'reason', 'no_membership_row', 'Grund: keine Mitgliedschaftszeile');

create temp table ev (name text primary key, id uuid);
insert into ev values ('e1', pg_temp.evening(pg_temp.u(1), pg_temp.u(2)));
select ok(not billing.can_receive_proposal(pg_temp.u(1)), 'Offener Vorschlag bindet den Gratis-Abend für weitere Vorschläge');
select is(billing.proposal_eligibility(pg_temp.u(1)) ->> 'reason', 'open_proposal', 'Grund: offener Vorschlag');

-- ---------------------------------------------------------------------------
-- confirm → reserve −1 für beide
-- ---------------------------------------------------------------------------
select pg_temp.confirm((select id from ev where name = 'e1'));
select is(pg_temp.avail(1), 0, 'Bestätigt: Abend ist bei Person 1 gebunden');
select is(pg_temp.avail(2), 0, 'Bestätigt: Abend ist bei Person 2 gebunden');
select is(billing.reserved_evenings(pg_temp.u(1)), 1, 'Eine offene Bindung');
select is((select count(*)::int from billing.evening_ledger
           where evening_id = (select id from ev where name = 'e1') and kind = 'reserve' and source_entry_id is not null), 2,
  'Je Person eine Bindung mit Verweis auf den Topf');
select is((select l.kind from billing.evening_ledger r join billing.evening_ledger l on l.id = r.source_entry_id
           where r.user_id = pg_temp.u(1) and r.kind = 'reserve'), 'free_grant', 'Bindung stammt aus dem Gratis-Abend');

-- happened → use (unterm Strich bleibt −1), Gratisphase endet
select app.evening_transition((select id from ev where name = 'e1'), 'happened');
select is(pg_temp.avail(1), 0, 'Abend fand statt: weiterhin 0 verfügbar');
select is(billing.reserved_evenings(pg_temp.u(1)), 0, 'Bindung ist in eine Nutzung umgewandelt');
select is((select count(*)::int from billing.evening_ledger where user_id = pg_temp.u(1) and kind = 'use'), 1, 'Eine Nutzung gebucht');
select isnt((select free_phase_ended_at from billing.memberships where user_id = pg_temp.u(1)), null, 'Gratisphase von Person 1 beendet');
select isnt((select free_phase_ended_at from billing.memberships where user_id = pg_temp.u(2)), null, 'Gratisphase von Person 2 beendet');
select is(billing.proposal_eligibility(pg_temp.u(1)) ->> 'reason', 'no_active_membership', 'Nach dem ersten Abend nur mit Mitgliedschaft');

-- ---------------------------------------------------------------------------
-- cancel_early → release +1 für beide
-- ---------------------------------------------------------------------------
insert into ev values ('e2', pg_temp.evening(pg_temp.u(3), pg_temp.u(4)));
select pg_temp.confirm((select id from ev where name = 'e2'));
select is(pg_temp.avail(3), 0, 'e2 bestätigt: Person 3 gebunden');
select app.evening_transition((select id from ev where name = 'e2'), 'cancel_early', pg_temp.u(3));
select is(pg_temp.avail(3), 1, 'Frühe Absage: Person 3 bekommt den Abend zurück');
select is(pg_temp.avail(4), 1, 'Frühe Absage: Person 4 bekommt den Abend zurück');
select is((select free_phase_ended_at from billing.memberships where user_id = pg_temp.u(3)), null, 'Frühe Absage beendet die Gratisphase nicht');

-- ---------------------------------------------------------------------------
-- cancel_late → absagende Person nutzt, Gegenüber bekommt den Abend zurück
-- ---------------------------------------------------------------------------
insert into ev values ('e3', pg_temp.evening(pg_temp.u(3), pg_temp.u(4), interval '10 hours'));
select pg_temp.confirm((select id from ev where name = 'e3'));
select app.evening_transition((select id from ev where name = 'e3'), 'cancel_late', pg_temp.u(3));
select is(pg_temp.avail(3), 0, 'Kurzfristige Absage: Abend ist für die absagende Person verbraucht');
select is((select count(*)::int from billing.evening_ledger where user_id = pg_temp.u(3) and kind = 'use'), 1, 'Absagende Person: Nutzung gebucht');
select isnt((select free_phase_ended_at from billing.memberships where user_id = pg_temp.u(3)), null, 'Kurzfristige Absage beendet die eigene Gratisphase');
select is(pg_temp.avail(4), 1, 'Gegenüber bekommt den Abend zurück');
select is((select free_phase_ended_at from billing.memberships where user_id = pg_temp.u(4)), null, 'Gratisphase des Gegenübers läuft weiter');
select is((select count(*)::int from billing.evening_ledger where user_id = pg_temp.u(4) and kind = 'credit'), 0,
  'Ohne Einstellung keine zusätzliche Gutschrift');

-- ---------------------------------------------------------------------------
-- no_show → abwesende Person nutzt; anwesende bekommt den Abend zurück (+ Gutschrift, wenn eingestellt)
-- ---------------------------------------------------------------------------
update ops.app_settings set value = 'true' where key = 'billing.credit_on_counterpart_no_show';
insert into ev values ('e4', pg_temp.evening(pg_temp.u(4), pg_temp.u(5), interval '2 hours'));
select pg_temp.confirm((select id from ev where name = 'e4'));
select app.evening_transition((select id from ev where name = 'e4'), 'no_show', null, jsonb_build_object('no_show_user', pg_temp.u(5)));
select is(pg_temp.avail(5), 0, 'Nicht erschienen: Abend ist verbraucht');
select isnt((select free_phase_ended_at from billing.memberships where user_id = pg_temp.u(5)), null, 'Nicht erschienen beendet die Gratisphase');
select is(pg_temp.avail(4), 2, 'Anwesende Person: Abend zurück plus Gutschrift');
select ok((select expires_at from billing.evening_ledger where user_id = pg_temp.u(4) and kind = 'credit')
          between app.now() + interval '89 days' and app.now() + interval '93 days', 'Gutschrift gilt evening.credit_validity_months (3 Monate)');

-- Beide nicht erschienen (keine Angabe): beide nutzen
insert into ev values ('e5', pg_temp.evening(pg_temp.u(6), pg_temp.u(7), interval '2 hours'));
select pg_temp.confirm((select id from ev where name = 'e5'));
select app.evening_transition((select id from ev where name = 'e5'), 'no_show');
select is(pg_temp.avail(6) + pg_temp.avail(7), 0, 'Niemand erschienen: beide Abende verbraucht');

-- ---------------------------------------------------------------------------
-- Kein Abend frei → Bestätigung wird abgelehnt (Buch wird nie negativ)
-- ---------------------------------------------------------------------------
insert into ev values ('e6', pg_temp.evening(pg_temp.u(1), pg_temp.u(8)));
select app.evening_transition((select id from ev where name = 'e6'), 'request_time', pg_temp.u(1));
select throws_ok($$ select app.evening_transition((select id from ev where name = 'e6'), 'confirm', '00000000-0000-0000-0000-000000000608') $$,
  'P0001', 'Der Abend kann nicht bestätigt werden: Im Kontingent ist kein Abend frei.', 'Bestätigung ohne freien Abend wird abgelehnt');
select is((select state from app.evenings where id = (select id from ev where name = 'e6')), 'time_requested', 'Der Abend bleibt unbestätigt');
select is(pg_temp.avail(8), 1, 'Keine halbe Buchung beim Gegenüber');
select throws_ok($$ select billing.assert_evening_available('00000000-0000-0000-0000-000000000601') $$,
  'P0001', 'Im Kontingent ist kein Abend frei.', 'assert_evening_available meldet: kein Abend frei');
select lives_ok($$ select billing.assert_evening_available('00000000-0000-0000-0000-000000000608') $$, 'assert_evening_available: Abend frei');

-- Gesperrt → kein Vorschlag, keine Bestätigung
insert into safety.sanctions (user_id, kind, reason) values (pg_temp.u(8), 'vorlaeufige_sperre', 'Test');
select ok(not billing.can_receive_proposal(pg_temp.u(8)), 'Gesperrte Person bekommt keinen Vorschlag');
select throws_ok($$ select billing.assert_evening_available('00000000-0000-0000-0000-000000000608') $$,
  'P0001', 'Dieses Konto ist gesperrt.', 'Gesperrte Person kann nicht bestätigen');
delete from safety.sanctions where user_id = pg_temp.u(8);

-- ---------------------------------------------------------------------------
-- Mitgliedschaft: Zuteilung mit Verfall am Ende des Zeitraums
-- ---------------------------------------------------------------------------
update billing.memberships set status = 'pending', tier = 'andante', stripe_customer_id = 'cus_t601',
  stripe_subscription_id = 'sub_t601', contract_number = 'FM-TEST-0601', ordered_at = app.now()
where user_id = pg_temp.u(1);
select is((billing.apply_invoice_paid('sub_t601', 'cus_t601', 'in_t601', app.now(), app.now() + interval '28 days', 14900)) ->> 'handled',
  'true', 'invoice.paid legt einen Zeitraum an');
select is(pg_temp.avail(1), 2, 'Andante: zwei Abende je Zeitraum');
select ok(billing.can_receive_proposal(pg_temp.u(1)), 'Aktive Mitgliedschaft mit freiem Abend: Vorschlag möglich');
-- Abend kurz vor Ende bestätigen, Zeitraum läuft ab, Abend findet danach statt
delete from app.evenings where id = (select id from ev where name = 'e6');
insert into ev values ('e7', pg_temp.evening(pg_temp.u(1), pg_temp.u(8), interval '29 days'));
select pg_temp.confirm((select id from ev where name = 'e7'));
select is(pg_temp.avail(1), 1, 'Ein Abend gebunden, einer frei');
select ops.sim_clock_advance(interval '28 days 1 hour');
select is(pg_temp.avail(1), 0, 'Nach dem Zeitraum verfällt der freie Abend');
select app.evening_transition((select id from ev where name = 'e7'), 'happened');
select is(pg_temp.avail(1), 0, 'Abend nach dem Verfall findet statt: Buch bleibt bei 0, nicht negativ');

-- Rückgabe nach Ablauf des Zeitraums wird zur Gutschrift
select ops.sim_clock_reset();
update billing.memberships set stripe_subscription_id = 'sub_t602', stripe_customer_id = 'cus_t602', tier = 'auftakt',
  status = 'pending', contract_number = 'FM-TEST-0602', ordered_at = app.now() where user_id = pg_temp.u(2);
select billing.apply_invoice_paid('sub_t602', 'cus_t602', 'in_t602', app.now(), app.now() + interval '28 days', 4900);
insert into ev values ('e8', pg_temp.evening(pg_temp.u(2), pg_temp.u(4), interval '30 days'));
select pg_temp.confirm((select id from ev where name = 'e8'));
select ops.sim_clock_advance(interval '28 days 2 hours');
select app.evening_transition((select id from ev where name = 'e8'), 'cancel_early', pg_temp.u(4));
select is(pg_temp.avail(2), 1, 'Rückgabe nach Verfall des Topfs: Abend kommt als Gutschrift zurück');
select is((select note from billing.evening_ledger where user_id = pg_temp.u(2) and kind = 'credit'), 'Rückgabe nach Ablauf des Zeitraums',
  'Gutschrift ist als Rückgabe nach Ablauf gekennzeichnet');
select ops.sim_clock_advance(interval '4 months');
select is(pg_temp.avail(2), 0, 'Gutschrift verfällt nach evening.credit_validity_months');
select ok(billing.expire_ledger() >= 1, 'expire_ledger schreibt sichtbare Verfallszeilen');
select is(pg_temp.avail(2), 0, 'Verfallszeilen ändern den Bestand nicht');
select ops.sim_clock_reset();

-- ---------------------------------------------------------------------------
-- Allgemein
-- ---------------------------------------------------------------------------
select is((select count(*)::int from generate_series(1, 8) n where pg_temp.avail(n) < 0), 0, 'Kein Buch ist negativ');
select throws_ok($$ update billing.evening_ledger set amount = 5 $$, '42501', null, 'Das Buch ist nur zum Anhängen');

select * from finish();
rollback;
