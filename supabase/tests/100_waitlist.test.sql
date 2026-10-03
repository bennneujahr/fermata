-- Warteliste (M1): Platznummern je Region, Vorrückung, Gründungsmitglieder, Drossel, neutrale Antworten,
-- Ablauf der Links, Löschfristen, Plakat-Zähler, Admin-Zahlen und RLS.
begin;
select plan(77);

-- ---------------------------------------------------------------------------
-- Hilfen (nur in dieser Transaktion)
-- ---------------------------------------------------------------------------
create function pg_temp.h(t text) returns text language sql immutable as $$
  select encode(extensions.digest(convert_to(t, 'UTF8'), 'sha256'), 'hex');
$$;
-- Anmeldung mit festen, gültigen Angaben; Token-Hashes werden aus der Adresse abgeleitet.
create function pg_temp.signup(p_email text, p_region text default 'schwerin', p_invite text default null,
  p_ip text default '198.51.100.1', p_name text default 'Anna', p_source text default null) returns jsonb
language sql as $$
  select api.waitlist_signup(p_name, p_email, p_region, '19053', 'warteliste-2026-10-03-entwurf', p_source, p_invite, p_ip,
    pg_temp.h('confirm:' || p_email || ':' || clock_timestamp()::text), pg_temp.h('status0:' || p_email || ':' || clock_timestamp()::text));
$$;
create function pg_temp.confirm_hash(p_email text) returns text language sql as $$
  select confirm_token_hash from public.waitlist where email = p_email::extensions.citext;
$$;
-- Bestätigt eine Adresse; Status- und Abmelde-Token sind 'status:<mail>' und 'unsub:<mail>'.
create function pg_temp.confirm(p_email text) returns jsonb language sql as $$
  select api.waitlist_confirm(pg_temp.confirm_hash(p_email), pg_temp.h('status:' || p_email), pg_temp.h('unsub:' || p_email));
$$;
create function pg_temp.join(p_email text, p_region text default 'schwerin', p_invite text default null) returns jsonb
language sql as $$
  select pg_temp.signup(p_email, p_region, p_invite, '203.0.113.' || (abs(hashtext(p_email)) % 250)::text);
  select pg_temp.confirm(p_email);
$$;
create function pg_temp.place(p_email text) returns integer language sql as $$
  select (api.waitlist_status(pg_temp.h('status:' || p_email)) ->> 'place')::integer;
$$;
create function pg_temp.code(p_email text) returns text language sql as $$
  select i.code from public.waitlist_invites i join public.waitlist w on w.id = i.inviter_id
  where w.email = p_email::extensions.citext order by i.created_at limit 1;
$$;

-- Für die Tests: Drossel großzügig, damit nur der Drossel-Test sie auslöst.
update ops.app_settings set value = '1000' where key = 'waitlist.rate_limit_per_hour';

-- ---------------------------------------------------------------------------
-- 1. Aufbau und RLS (16)
-- ---------------------------------------------------------------------------
select has_table('public', t, 'Tabelle public.' || t || ' existiert')
from unnest(array['waitlist', 'waitlist_invites', 'signup_attempts', 'link_hits', 'waitlist_counters']) t;
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in ('waitlist', 'waitlist_invites', 'signup_attempts', 'link_hits', 'waitlist_counters')),
  'RLS ist auf allen Tabellen der Warteliste aktiv');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public'
   and tablename in ('waitlist', 'waitlist_invites', 'signup_attempts', 'link_hits', 'waitlist_counters')),
  0, 'Es gibt keine Policies (kein Zugriff außer service_role)');
select ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated']) r,
      unnest(array['waitlist', 'waitlist_invites', 'signup_attempts', 'link_hits', 'waitlist_counters']) t,
      unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
    where has_table_privilege(r, 'public.' || t, p)
  ),
  'anon und authenticated haben keinerlei Tabellenrechte');
select ok(
  not exists (
    select 1 from unnest(array['anon', 'authenticated']) r,
      unnest(array[
        'api.waitlist_signup(text, text, text, text, text, text, text, text, text, text)',
        'api.waitlist_confirm(text, text, text)', 'api.waitlist_status(text)', 'api.waitlist_unsubscribe(text)',
        'api.waitlist_cleanup()', 'api.link_hit(text)']) f
    where has_function_privilege(r, f, 'EXECUTE')
  ),
  'anon und authenticated dürfen die Wartelisten-Funktionen nicht ausführen');
select ok(has_function_privilege('service_role', 'api.waitlist_signup(text, text, text, text, text, text, text, text, text, text)', 'EXECUTE'),
  'service_role darf api.waitlist_signup ausführen');
select ok(not has_function_privilege('anon', 'api.admin_waitlist_stats()', 'EXECUTE'), 'anon darf die Admin-Zahlen nicht abrufen');

select tests.act_as_anon();
select throws_ok($$ select * from public.waitlist $$, '42501', null, 'anon kann die Warteliste nicht lesen');
select throws_ok($$ insert into public.waitlist (first_name, email, region, postal_code, consent_text_version, consent_at)
  values ('Eve', 'eve@example.org', 'schwerin', '19053', 'x', now()) $$, '42501', null, 'anon kann nichts eintragen');
select throws_ok($$ select api.waitlist_signup('Eve', 'eve@example.org', 'schwerin', '19053', 'warteliste-2026-10-03-entwurf', null, null, '1.1.1.1',
  repeat('a', 64), repeat('b', 64)) $$, '42501', null, 'anon kann api.waitlist_signup nicht direkt aufrufen');
select tests.reset_role();
select tests.act_as(tests.create_user('mitglied@example.org'));
select throws_ok($$ select * from public.signup_attempts $$, '42501', null, 'authenticated kann die Drossel nicht lesen');
select throws_ok($$ update public.link_hits set count = 0 $$, '42501', null, 'authenticated kann den Plakat-Zähler nicht ändern');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- 2. Anmeldung: Prüfung, neutrale Antworten, erneuter Versand (17)
-- ---------------------------------------------------------------------------
select is(pg_temp.signup('anna@example.org') ->> 'send', 'confirm', 'Neue Adresse: Bestätigungs-Mail');
select is((select confirmed_at from public.waitlist where email = 'anna@example.org'), null, 'Eintrag ist zunächst unbestätigt');
select is((select base_number from public.waitlist where email = 'anna@example.org'), null, 'Unbestätigt: noch keine Grundnummer');
select is(pg_temp.signup('ANNA@example.org') -> 'result', '"ok"'::jsonb, 'Gleiche Adresse (andere Schreibweise): gleiche Antwort');
select is((select count(*)::int from public.waitlist where email = 'anna@example.org'), 1, 'E-Mail bleibt eindeutig (citext)');
select is(pg_temp.signup('anna@example.org') ->> 'send', null, 'Innerhalb der Mindestpause: keine weitere Mail');
select api.waitlist_mail_failed('anna@example.org');
select is(pg_temp.signup('anna@example.org') ->> 'send', 'confirm', 'Nach fehlgeschlagenem Versand: sofort neuer Versuch');
select ok(not has_function_privilege('anon', 'api.waitlist_mail_failed(text)', 'EXECUTE'), 'anon darf api.waitlist_mail_failed nicht ausführen');

select pg_temp.confirm_hash('anna@example.org') as old_hash \gset
select ops.sim_clock_advance(interval '11 minutes');
select is(pg_temp.signup('anna@example.org', 'nordwestmecklenburg') ->> 'send', 'confirm', 'Nach der Pause: unbestätigte Adresse bekommt den Link neu');
select isnt(pg_temp.confirm_hash('anna@example.org'), :'old_hash', 'Der neue Link ersetzt den alten');
select is((select region from public.waitlist where email = 'anna@example.org'), 'nordwestmecklenburg', 'Neue Angaben ersetzen die alten');
select is(api.waitlist_confirm(:'old_hash', pg_temp.h('x1'), pg_temp.h('x2')) ->> 'result', 'invalid', 'Der alte Link gilt nicht mehr');

select is(
  api.waitlist_signup(' ', 'keine-mail', 'mars', '123', 'v0', null, null, '198.51.100.9', pg_temp.h('a'), pg_temp.h('b')),
  '{"result": "invalid", "fields": {"email": "invalid", "region": "invalid", "consent": "invalid", "first_name": "invalid", "postal_code": "invalid"}}'::jsonb,
  'Ungültige Angaben werden je Feld gemeldet');
select is(pg_temp.signup('link@example.org', p_name => 'http://spam.example') -> 'fields' ->> 'first_name', 'invalid',
  'Links im Vornamen werden abgelehnt');
select is(pg_temp.signup('joerg@example.org', p_name => 'Jörg-Åke O''Neill') ->> 'send', 'confirm', 'Umlaute, Bindestrich und Apostroph sind erlaubt');
select is(pg_temp.signup('quelle@example.org', p_source => 'Pfaffenteich') ->> 'result', 'ok', 'Anmeldung mit Plakat-Kürzel');
select is((select source from public.waitlist where email = 'quelle@example.org'), 'pfaffenteich', 'Kürzel wird klein gespeichert');

-- ---------------------------------------------------------------------------
-- 3. Drossel (3)
-- ---------------------------------------------------------------------------
update ops.app_settings set value = '3' where key = 'waitlist.rate_limit_per_hour';
select pg_temp.signup('d' || i || '@example.org', p_ip => '192.0.2.77') from generate_series(1, 3) i;
select is(pg_temp.signup('d4@example.org', p_ip => '192.0.2.77') ->> 'result', 'throttled', 'Der 4. Versuch je IP und Stunde wird gedrosselt');
select is(pg_temp.signup('d5@example.org', p_ip => '192.0.2.78') ->> 'result', 'ok', 'Andere IP wird nicht gedrosselt');
select ok(not exists (select 1 from public.signup_attempts where ip_hash like '%192.0.2%'), 'IP wird nur als Hash gespeichert');
update ops.app_settings set value = '1000' where key = 'waitlist.rate_limit_per_hour';

-- ---------------------------------------------------------------------------
-- 4. Bestätigung: Ablauf, Grundnummern je Region, Gründungsmitglieder (12)
-- ---------------------------------------------------------------------------
select pg_temp.signup('spaet@example.org');
select ops.sim_clock_advance(interval '73 hours');
select is(pg_temp.confirm('spaet@example.org') ->> 'result', 'expired', 'Bestätigungslink läuft nach 72 Stunden ab');
select is(api.waitlist_confirm(pg_temp.h('gibt-es-nicht'), pg_temp.h('s'), pg_temp.h('u')) ->> 'result', 'invalid', 'Unbekannter Link');

-- Saubere Ausgangslage für die Platztests
delete from public.waitlist;
update public.waitlist_counters set last_number = 0;
update ops.app_settings set value = '2' where key = 'waitlist.founding_limit';

select is(pg_temp.join('w1@example.org') ->> 'place', '1', 'Erste Bestätigung in Westmecklenburg: Platz 1');
select is(pg_temp.join('w2@example.org', 'ludwigslust-parchim') ->> 'place', '2', 'Zweite in Westmecklenburg: Platz 2');
select is(pg_temp.join('h1@example.org', 'hamburg') ->> 'place', '1', 'Hamburg zählt eigene Plätze: Platz 1');
select is(pg_temp.join('w3@example.org') ->> 'place', '3', 'Dritte in Westmecklenburg: Platz 3');
select is((select array_agg(base_number order by base_number) from public.waitlist where region_group = 'westmecklenburg'),
  array[1, 2, 3], 'Grundnummern fortlaufend je Gruppe');
select is(pg_temp.confirm('w1@example.org') ->> 'result', 'invalid', 'Ein Link bestätigt nur einmal');
select ok((select confirmed_at from public.waitlist where email = 'w1@example.org') < (select confirmed_at from public.waitlist where email = 'w2@example.org'),
  'confirmed_at folgt der Reihenfolge der Grundnummern');

-- Gründungsmitglieder (Grenze für den Test auf 2 gesenkt)
select is((select array_agg(email::text order by base_number) from public.waitlist where is_founding_member),
  array['w1@example.org', 'w2@example.org'], 'Die ersten 2 Bestätigten aus Westmecklenburg sind Gründungsmitglieder');
select is((select is_founding_member from public.waitlist where email = 'h1@example.org'), false, 'Hamburg wird kein Gründungsmitglied');
update ops.app_settings set value = '1' where key = 'waitlist.founding_limit';
select pg_temp.join('w4@example.org');
select is((select count(*)::int from public.waitlist where is_founding_member), 2, 'Gesenkte Grenze entzieht keinen Status');

-- ---------------------------------------------------------------------------
-- 5. Einladungen und Vorrückung (11)
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.waitlist_invites i join public.waitlist w on w.id = i.inviter_id where w.email = 'w1@example.org'),
  1, 'Jede bestätigte Person bekommt waitlist.invites_per_person Einladungscodes');
select pg_temp.code('w3@example.org') as code_w3 \gset
select ok(:'code_w3' ~ '^[A-HJ-NP-Z2-9]{8}$', 'Code hat 8 Zeichen ohne verwechselbare Zeichen');

-- w3 (Grundnummer 3) lädt e1 ein. Vorrücken um 50: beide stehen danach vor allen ohne Vorrückung.
select pg_temp.signup('e1@example.org', 'schwerin', lower(substr(:'code_w3', 1, 4)) || '-' || substr(:'code_w3', 5));
select is((select invited_by_code from public.waitlist where email = 'e1@example.org'), :'code_w3', 'Code wird normalisiert gespeichert');
select is(pg_temp.place('w3@example.org'), 3, 'Vor der Bestätigung der eingeladenen Person: kein Vorrücken');
select is(pg_temp.confirm('e1@example.org') ->> 'invited', 'true', 'Bestätigung löst die Einladung ein');
select is((select array_agg(bonus_steps order by email) from public.waitlist where email in ('e1@example.org', 'w3@example.org')),
  array[1, 1], 'Einladende und eingeladene Person bekommen je eine Stufe');
select is(pg_temp.place('w3@example.org'), 1, 'w3 (3 − 50) steht jetzt auf Platz 1');
select is(pg_temp.place('e1@example.org'), 2, 'e1 (5 − 50) steht auf Platz 2');
select is(pg_temp.place('w1@example.org'), 3, 'w1 rückt dadurch auf Platz 3');

-- Gleichstand: mit 1 Platz je Stufe hat w3 den Schlüssel 2 wie w2; w2 hat früher bestätigt.
update ops.app_settings set value = '1' where key = 'waitlist.bonus_places';
select is(array[pg_temp.place('w2@example.org'), pg_temp.place('w3@example.org')], array[2, 3], 'Gleichstand: früher bestätigt steht vorn');
update ops.app_settings set value = '50' where key = 'waitlist.bonus_places';

-- Derselbe Code ein zweites Mal: keine Vorrückung mehr.
select pg_temp.join('e2@example.org', 'hamburg', :'code_w3');
select is((select bonus_steps from public.waitlist where email = 'e2@example.org'), 0, 'Ein Code wirkt nur einmal');

-- ---------------------------------------------------------------------------
-- 6. Statusseite, schon bestätigte Adresse, Abmeldung (8)
-- ---------------------------------------------------------------------------
select is(
  api.waitlist_status(pg_temp.h('status:w3@example.org')) - 'confirmed_at',
  jsonb_build_object('first_name', 'Anna', 'region', 'schwerin', 'region_group', 'westmecklenburg', 'place', 1,
    'is_founding_member', false, 'bonus_steps', 1, 'bonus_places', 50, 'invited_to_app', false,
    'invites', jsonb_build_array(jsonb_build_object('code', :'code_w3', 'used', true))),
  'Status liefert Platz, Gründungsstatus, Vorrückung und Einladungen');
select is(api.waitlist_status(pg_temp.h('falsch')), null, 'Falscher Statuslink liefert nichts');

select ops.sim_clock_advance(interval '11 minutes');
select is(
  api.waitlist_signup('Anna', 'w3@example.org', 'schwerin', '19053', 'warteliste-2026-10-03-entwurf', null, null, '198.51.100.20',
    pg_temp.h('c-neu'), pg_temp.h('status-neu')),
  '{"result": "ok", "send": "already", "first_name": "Anna"}'::jsonb,
  'Schon bestätigt: gleiche Antwort, die Function schickt einen neuen Statuslink');
select is(api.waitlist_status(pg_temp.h('status:w3@example.org')), null, 'Der alte Statuslink gilt danach nicht mehr');
select is(api.waitlist_status(pg_temp.h('status-neu')) ->> 'place', '1', 'Der neue Statuslink zeigt den Platz');

select is(api.waitlist_unsubscribe(pg_temp.h('unsub:w4@example.org')), true, 'Abmeldung über den Abmeldelink');
select is(api.waitlist_unsubscribe(pg_temp.h('status-neu')), true, 'Abmeldung über den Statuslink');
select is((select count(*)::int from public.waitlist where email in ('w3@example.org', 'w4@example.org')), 0, 'Abmeldung löscht den Eintrag');

-- ---------------------------------------------------------------------------
-- 7. Löschfristen, Plakat-Zähler, Zeitplan (6)
-- ---------------------------------------------------------------------------
select pg_temp.signup('alt@example.org');
select ops.sim_clock_advance(interval '8 days');
select pg_temp.signup('neu@example.org');
select api.waitlist_cleanup();
select is((select array_agg(email::text order by email) from public.waitlist where confirmed_at is null),
  array['neu@example.org'], 'Unbestätigte Einträge werden nach 7 Tagen gelöscht');
select ok((select count(*) from public.waitlist where confirmed_at is not null) >= 4, 'Bestätigte Einträge bleiben');
select is((select count(*)::int from public.signup_attempts where at < app.now() - interval '24 hours'), 0, 'Drossel-Einträge älter als 24 h sind gelöscht');

select api.link_hit('pfaffenteich'), api.link_hit('pfaffenteich'), api.link_hit('Bahnhof');
select is((select array_agg(slug || '=' || count order by slug) from public.link_hits), array['bahnhof=1', 'pfaffenteich=2'],
  'Plakat-Zähler zählt je Kürzel und Tag');
select is(api.link_hit('<script>'), false, 'Ungültiges Kürzel wird nicht gezählt');
select ok(
  not exists (select 1 from pg_namespace where nspname = 'cron')
  or exists (select 1 from cron.job where jobname = 'fermata-waitlist-cleanup' and command = 'select api.waitlist_cleanup()'),
  'Aufräumen ist per pg_cron geplant');

-- ---------------------------------------------------------------------------
-- 8. Admin-Zahlen (4)
-- ---------------------------------------------------------------------------
select tests.create_user('benn@example.org', '00000000-0000-0000-0000-00000000be00');
insert into app.admin_users (user_id, display_name) values ('00000000-0000-0000-0000-00000000be00', 'Benn');

select tests.act_as(tests.create_user('neugierig@example.org'));
select throws_ok($$ select api.admin_waitlist_stats() $$, '42501', null, 'Ohne Admin-Rolle keine Zahlen');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-00000000be00', 'aal1');
select throws_ok($$ select api.admin_waitlist_stats() $$, '42501', null, 'Admin ohne Zwei-Faktor bekommt keine Zahlen');
select tests.reset_role();
select count(*) as wm_confirmed from public.waitlist where region_group = 'westmecklenburg' and confirmed_at is not null \gset
select tests.act_as('00000000-0000-0000-0000-00000000be00', 'aal2');
select is(
  (select jsonb_path_query_first(api.admin_waitlist_stats(), '$.by_region_group[*] ? (@.region_group == "westmecklenburg")') ->> 'confirmed'),
  :'wm_confirmed',
  'Admin mit Zwei-Faktor sieht Zahlen je Region');
select is(jsonb_array_length(api.admin_waitlist_stats() -> 'link_hits'), 2, 'Admin sieht die Plakat-Aufrufe');
select tests.reset_role();

select * from finish();
rollback;
