begin;
select plan(16);

select has_schema(s) from unnest(array['app','private','sensitive','safety','billing','ops','api']) as s;

-- Simulierte Uhr
select ok(abs(extract(epoch from (app.now() - now()))) < 1, 'app.now() entspricht ohne Versatz der echten Zeit');
select ok(ops.sim_clock_advance(interval '2 days') > now() + interval '47 hours', 'Testuhr lässt sich vorstellen');
select ops.sim_clock_reset();
select ok(abs(extract(epoch from (app.now() - now()))) < 1, 'Testuhr lässt sich zurücksetzen');

-- In Produktion gesperrt (wir sind postgres, kein Superuser: zurück auf test geht danach nicht mehr,
-- deshalb läuft dieser Teil in einem Sicherungspunkt und wird zurückgerollt).
savepoint prod;
update ops.deployment set environment = 'production';
select throws_ok($$ select ops.sim_clock_advance(interval '1 day') $$, '42501', null, 'Testuhr in Produktion gesperrt');
select throws_ok($$ update ops.deployment set environment = 'test' $$, '42501', null, 'production lässt sich ohne Superuser nicht verlassen');
rollback to savepoint prod;

-- Einstellungen mit Verlauf
insert into ops.app_settings (key, value, description) values ('test.wert', '5', 'Testwert');
update ops.app_settings set value = '7' where key = 'test.wert';
select is(ops.setting_int('test.wert'), 7, 'ops.setting_int liest Einstellungen');
select is((select count(*)::int from ops.app_settings_history where key = 'test.wert'), 2, 'Jede Änderung steht im Verlauf');
select throws_ok($$ select ops.setting('gibt.es.nicht') $$, 'P0002', null, 'Unbekannte Einstellung wirft Fehler');

-- Audit nur anhängen
select ops.audit('test.aktion', 'ops.app_settings', 'test.wert');
select throws_ok($$ delete from ops.audit_log $$, '42501', null, 'Audit-Protokoll lässt sich nicht löschen');

select * from finish();
rollback;
