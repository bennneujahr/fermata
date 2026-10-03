-- M7: Abend teilen (Ablauf mit simulierter Uhr), Check-in, Hilfe-Knopf, wiederholtes Nichterscheinen,
-- Versand der Sicherheits-Mails.
begin;
select plan(40);

create function pg_temp.u(n int) returns uuid language sql as $$ select ('00000000-0000-0000-0000-000000000' || n)::uuid; $$;
select tests.create_user('v' || n || '@example.test', pg_temp.u(n)) from generate_series(721, 725) n;
insert into app.accounts (user_id, status) select pg_temp.u(n), 'active' from generate_series(721, 725) n;
insert into billing.memberships (user_id) select pg_temp.u(n) from generate_series(721, 725) n;
insert into billing.evening_ledger (user_id, kind, amount, note) select pg_temp.u(n), 'adjust', 5, 'Testguthaben' from generate_series(721, 725) n;
insert into private.account_facts (user_id, first_name, last_name, birth_date, postal_code) values
  (pg_temp.u(721), 'Frieda', 'Teilt', '1993-03-03', '19053'),
  (pg_temp.u(722), 'Gustav', 'Gegenueber', '1987-07-07', '19055');
insert into app.venues (id, name, street, postal_code, city, lat, lon, public_transport) values
  ('72000000-0000-0000-0000-0000000000f1', 'Bistro Lindenhof', 'Lindenstraße 3', '19055', 'Schwerin', 53.63, 11.41, 'Tram 1, Haltestelle Marienplatz');
insert into app.match_runs (id, scheduled_for, status) values ('72000000-0000-0000-0000-000000000001', now(), 'approved');
create function pg_temp.evening(a uuid, b uuid, starts interval, confirm boolean default true) returns uuid language plpgsql as $$
declare pid uuid; eid uuid;
begin
  insert into app.pairings (run_id, user_a, user_b, total_score, status)
  values ('72000000-0000-0000-0000-000000000001', least(a, b), greatest(a, b), 0.8, 'proposed') returning id into pid;
  insert into app.evenings (pairing_id, user_a, user_b, starts_at, venue_id)
  values (pid, least(a, b), greatest(a, b), app.now() + starts, '72000000-0000-0000-0000-0000000000f1') returning id into eid;
  if confirm then
    perform app.evening_transition(eid, 'request_time', least(a, b));
    perform app.evening_transition(eid, 'confirm', greatest(a, b));
  end if;
  return eid;
end $$;
create temp table x (k text primary key, id uuid, j jsonb);
grant select, insert on x to public;
insert into x (k, id) values ('e1', pg_temp.evening(pg_temp.u(721), pg_temp.u(722), interval '2 days'));
insert into x (k, id) values ('e_open', pg_temp.evening(pg_temp.u(721), pg_temp.u(723), interval '9 days', false));

-- ---------------------------------------------------------------------------
-- Abend teilen
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(721));
insert into x (k, j) values ('share', api.create_trust_share((select id from x where k = 'e1')));
select ok((select j ->> 'token' from x where k = 'share') ~ '^[A-Za-z0-9_=-]{32}$', 'Zufälliger Link-Schlüssel');
select ok((select j ->> 'url' from x where k = 'share') like '%trust-view?t=%', 'Link auf die öffentliche Seite');
select is((select (j ->> 'expires_at')::timestamptz from x where k = 'share'),
  (select starts_at + interval '24 hours' from app.evenings where id = (select id from x where k = 'e1')),
  'Läuft safety.trust_share_hours (24 h) nach Beginn ab');
select throws_ok($$ select api.create_trust_share((select id from x where k = 'e_open')) $$, 'P0001', null, 'Unbestätigter Abend kann nicht geteilt werden');
select is((select count(*)::int from api.my_trust_shares()), 1, 'Eigene Links sichtbar');
select throws_ok($$ select safety.trust_share_view('abc') $$, '42501', null, 'Ansicht nur über die Edge Function (service_role)');
select tests.reset_role();
select tests.act_as(pg_temp.u(724));
select throws_ok($$ select api.create_trust_share((select id from x where k = 'e1')) $$, 'P0002', null, 'Unbeteiligte können nicht teilen');
select tests.reset_role();

select is((select count(*)::int from app.trust_shares where token_hash = (select j ->> 'token' from x where k = 'share')), 0, 'Schlüssel nur als Hash gespeichert');
insert into x (k, j) values ('view', safety.trust_share_view((select j ->> 'token' from x where k = 'share')));
select is((select j ->> 'first_name' from x where k = 'view'), 'Frieda', 'Ansicht zeigt nur den eigenen Vornamen');
select is((select j -> 'venue' ->> 'name' from x where k = 'view'), 'Bistro Lindenhof', 'Ansicht zeigt das Lokal');
select is((select j -> 'heimwegtelefon' ->> 'number' from x where k = 'view'), '030 12074182', 'Ansicht zeigt das Heimwegtelefon');
select ok((select j::text not like '%Gustav%' and j::text not like '%Gegenueber%' and j::text not like '%' || pg_temp.u(722)::text || '%' from x where k = 'view'),
  'Keine Daten des Gegenübers');
select is(safety.trust_share_view('falscher-schluessel'), null, 'Falscher Schlüssel: nichts');

select ops.sim_clock_advance(interval '2 days 23 hours');
select isnt(safety.trust_share_view((select j ->> 'token' from x where k = 'share')), null, 'Kurz vor Ablauf noch abrufbar');
select ops.sim_clock_advance(interval '2 hours');
select is(safety.trust_share_view((select j ->> 'token' from x where k = 'share')), null, 'Nach Ablauf nicht mehr abrufbar');
select ops.sim_clock_reset();

-- Zurückziehen und Höchstzahl
select tests.act_as(pg_temp.u(721));
select ok(api.revoke_trust_share((select (j ->> 'share_id')::uuid from x where k = 'share')), 'Link zurückgezogen');
select tests.reset_role();
select is(safety.trust_share_view((select j ->> 'token' from x where k = 'share')), null, 'Zurückgezogener Link zeigt nichts');
select tests.act_as(pg_temp.u(721));
select api.create_trust_share((select id from x where k = 'e1')) from generate_series(1, 3);
select throws_ok($$ select api.create_trust_share((select id from x where k = 'e1')) $$, 'P0001', null, 'Höchstens 3 aktive Links je Abend');
select tests.reset_role();
-- Abgesagter Abend: geteilte Links zeigen nichts mehr
insert into x (k, id) values ('e3', pg_temp.evening(pg_temp.u(721), pg_temp.u(724), interval '5 days'));
select tests.act_as(pg_temp.u(721));
insert into x (k, j) values ('share3', api.create_trust_share((select id from x where k = 'e3')));
select tests.reset_role();
select isnt(safety.trust_share_view((select j ->> 'token' from x where k = 'share3')), null, 'Geteilter Abend sichtbar');
select app.evening_transition((select id from x where k = 'e3'), 'cancel_early', pg_temp.u(724));
select is(safety.trust_share_view((select j ->> 'token' from x where k = 'share3')), null, 'Nach der Absage zeigt der Link nichts mehr');
select app.evening_transition((select id from x where k = 'e_open'), 'cancel_admin');

-- ---------------------------------------------------------------------------
-- Check-in
-- ---------------------------------------------------------------------------
select tests.act_as(pg_temp.u(721));
insert into x (k, j) values ('c_gut', api.checkin_respond((select id from x where k = 'e1'), 'gut'));
select tests.reset_role();
select is((select j -> 'help' from x where k = 'c_gut'), 'null'::jsonb, '„gut“: keine Hilfe-Daten');
select is((select count(*)::int from safety.safety_flags where kind like 'checkin%'), 0, '„gut“: kein Hinweis');

select tests.act_as(pg_temp.u(722));
insert into x (k, j) values ('c_uns', api.checkin_respond((select id from x where k = 'e1'), 'unsicher'));
select tests.reset_role();
select is((select severity from safety.safety_flags where kind = 'checkin_unsicher'), 'hoch', '„unsicher“: Hinweis hoch');
select isnt((select j -> 'help' from x where k = 'c_uns'), 'null'::jsonb, '„unsicher“: Hilfe-Daten zurück');

select tests.act_as(pg_temp.u(721));
insert into x (k, j) values ('c_hilfe', api.checkin_respond((select id from x where k = 'e1'), 'hilfe'));
select throws_ok($$ select api.checkin_respond((select id from x where k = 'e1'), 'panik') $$, '22023', null, 'Unbekannte Antwort');
select throws_ok($$ select api.checkin_respond((select id from x where k = 'e_open'), 'gut') $$, 'P0001', null, 'Kein Check-in für abgesagte Abende');
select tests.reset_role();
select is((select j -> 'help' -> 'heimwegtelefon' ->> 'number' from x where k = 'c_hilfe'), '030 12074182', '„hilfe“: Heimwegtelefon');
select is((select j -> 'help' -> 'police' ->> 'number' from x where k = 'c_hilfe'), '110', '„hilfe“: Notruf 110');
select is((select severity from safety.safety_flags where kind = 'checkin_hilfe'), 'akut', '„hilfe“: akuter Hinweis für Benn');
select is((select count(*)::int from safety.mail_queue where to_admin and template = 'safety.admin_alert' and data ->> 'kind' = 'checkin_hilfe'), 1,
  '„hilfe“: Sofort-Mail an Benn');
select tests.act_as(pg_temp.u(724));
select throws_ok($$ select api.checkin_respond((select id from x where k = 'e1'), 'gut') $$, 'P0002', null, 'Unbeteiligte: kein Check-in');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Hilfe-Knopf (öffentlich)
-- ---------------------------------------------------------------------------
select tests.act_as_anon();
select is((api.help_contacts()) -> 'emergency' ->> 'number', '112', 'Hilfe-Knopf: 112');
select is((api.help_contacts()) -> 'heimwegtelefon' ->> 'tel', '03012074182', 'Hilfe-Knopf: wählbare Nummer');
select is(jsonb_array_length((api.help_contacts()) -> 'telefonseelsorge' -> 'numbers'), 3, 'Hilfe-Knopf: TelefonSeelsorge');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Wiederholtes Nichterscheinen (Frage B9): Hinweis für Benn ab safety.no_show_flag_threshold
-- ---------------------------------------------------------------------------
insert into x (k, id) values ('n1', pg_temp.evening(pg_temp.u(723), pg_temp.u(725), interval '1 hour'));
select app.evening_transition((select id from x where k = 'n1'), 'no_show', null, jsonb_build_object('no_show_user', pg_temp.u(725)));
select is((select count(*)::int from safety.safety_flags where kind = 'wiederholt_nicht_erschienen'), 0, 'Einmal nicht erschienen: noch kein Hinweis');
insert into x (k, id) values ('n2', pg_temp.evening(pg_temp.u(724), pg_temp.u(725), interval '2 hours'));
select app.evening_transition((select id from x where k = 'n2'), 'no_show', null, jsonb_build_object('no_show_user', pg_temp.u(725)));
select is((select user_id from safety.safety_flags where kind = 'wiederholt_nicht_erschienen'), pg_temp.u(725), 'Zweimal: Hinweis für Benn');

-- ---------------------------------------------------------------------------
-- Versand (safety-dispatch)
-- ---------------------------------------------------------------------------
create temp table claimed as select * from safety.dispatch_claim(100);
select ok((select count(*) from claimed) >= 2, 'Ausstehende Mails werden übernommen');
select is((select recipient from claimed where to_admin limit 1), 'sicherheit@fermata.example', 'Hinweise an Benn gehen an safety.admin_alert_email');
select is((select count(*)::int from safety.dispatch_claim(100)), 0, 'Übernommene Mails sind gesperrt (kein doppelter Versand)');
select safety.dispatch_done(id, 'test-' || id) from claimed;
select is((select count(*)::int from safety.mail_queue where sent_at is null), 0, 'Alle als versendet vermerkt');

select * from finish();
rollback;
