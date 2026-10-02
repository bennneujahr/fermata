-- M2 · Einladung (ops.create_invited_account, app.on_account_created), Annahme, Ablauf; Ausweisprüfung mit Sperrliste.
begin;
select no_plan();

select tests.create_user('carla@example.test', 'c0000000-0000-0000-0000-00000000000c');
insert into app.admin_users (user_id, display_name) values ('c0000000-0000-0000-0000-00000000000c', 'Carla');
select tests.create_user('ben@example.test', 'b0000000-0000-0000-0000-00000000000b');
select tests.create_user('nina@example.test', '90000000-0000-0000-0000-000000000009');

-- ---------------------------------------------------------------------------
-- Einladung
-- ---------------------------------------------------------------------------
select throws_ok($$ select ops.create_invited_account('ben@example.test', 'b0000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-00000000000b') $$,
  '42501', null, 'Nur Admins laden ein');
select throws_ok($$ select ops.create_invited_account('kein-mail', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000c') $$,
  '22023', null, 'Ungültige Adresse abgelehnt');

-- Warteliste (M1): Wenn die Tabelle fehlt, legen wir für den Test eine minimale an.
do $$
begin
  if to_regclass('public.waitlist') is null then
    create table public.waitlist (id uuid primary key default gen_random_uuid(), email extensions.citext not null unique,
      is_founding_member boolean not null default false, invited_to_app_at timestamptz);
    insert into public.waitlist (email, is_founding_member) values ('ben@example.test', true);
  end if;
end
$$;

select lives_ok($$ select ops.create_invited_account('Ben@Example.test', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000c') $$,
  'Admin lädt Ben ein');
select is((select status from app.accounts where user_id = 'b0000000-0000-0000-0000-00000000000b'), 'onboarding', 'Konto angelegt (onboarding)');
select is((select status from billing.memberships where user_id = 'b0000000-0000-0000-0000-00000000000b'), 'free', 'Mitgliedschaft free angelegt');
select is((select sum(amount)::int from billing.evening_ledger where user_id = 'b0000000-0000-0000-0000-00000000000b' and kind = 'free_grant'), 1,
  'Gratis-Abend im Kontingent-Buch (+1)');
select is(billing.available_evenings('b0000000-0000-0000-0000-00000000000b'), 1, 'Ein verfügbarer Abend');
select is((select count(*)::int from app.account_invitations where user_id = 'b0000000-0000-0000-0000-00000000000b'), 1, 'Einladung festgehalten');
select is((select email::text from app.account_invitations where user_id = 'b0000000-0000-0000-0000-00000000000b'), 'ben@example.test', 'E-Mail kleingeschrieben');
select ok((select expires_at > app.now() + interval '6 days' from app.account_invitations where user_id = 'b0000000-0000-0000-0000-00000000000b'),
  'Einladung gilt 7 Tage (Einstellung)');
select is((select waitlist_email_hash from app.accounts where user_id = 'b0000000-0000-0000-0000-00000000000b'),
  encode(extensions.digest('ben@example.test', 'sha256'), 'hex'), 'Verknüpfung zur Warteliste nur als Hash');
select ok((select (select count(*) from public.waitlist w where lower(w.email::text) = 'ben@example.test' and w.invited_to_app_at is not null) = 1),
  'Wartelisten-Eintrag als eingeladen markiert')
  where exists (select 1 from public.waitlist w where lower(w.email::text) = 'ben@example.test');
select ok((select is_founding_member from app.accounts where user_id = 'b0000000-0000-0000-0000-00000000000b')
          = coalesce((select w.is_founding_member from public.waitlist w where lower(w.email::text) = 'ben@example.test'), false),
  'Gründungsstatus aus der Warteliste übernommen');
select ok(exists (select 1 from ops.audit_log where action = 'account.invited'), 'Einladung im Audit');

-- Idempotent: erneut einladen ersetzt die offene Einladung, kein zweiter Gratis-Abend
select lives_ok($$ select ops.create_invited_account('ben@example.test', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000c') $$,
  'Erneut einladen geht');
select is((select count(*)::int from app.account_invitations where user_id = 'b0000000-0000-0000-0000-00000000000b' and revoked_at is null), 1,
  'Nur eine offene Einladung');
select is((select count(*)::int from billing.evening_ledger where user_id = 'b0000000-0000-0000-0000-00000000000b'), 1, 'Kein zweiter Gratis-Abend');

-- Erste Anmeldung nimmt die Einladung an
update auth.users set last_sign_in_at = now() where id = 'b0000000-0000-0000-0000-00000000000b';
select ok((select accepted_at is not null from app.account_invitations where user_id = 'b0000000-0000-0000-0000-00000000000b' and revoked_at is null),
  'Erste Anmeldung nimmt die Einladung an');
select throws_ok($$ select ops.create_invited_account('ben@example.test', 'b0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-00000000000c') $$,
  '23505', null, 'Mitglieder werden nicht erneut eingeladen');

-- Abgelaufene, nie benutzte Einladung: Konto wird gelöscht
select ops.create_invited_account('nina@example.test', '90000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-00000000000c');
select is(ops.expire_invitations(), 0, 'Vor Ablauf wird nichts gelöscht');
select ops.sim_clock_advance(interval '8 days');
select is(ops.expire_invitations(), 1, 'Nach Ablauf wird das ungenutzte Konto gelöscht');
select ops.sim_clock_reset();
select is((select count(*)::int from auth.users where id = '90000000-0000-0000-0000-000000000009'), 0, 'auth.users-Zeile gelöscht');
select is((select count(*)::int from app.accounts where user_id = '90000000-0000-0000-0000-000000000009'), 0, 'Konto mitgelöscht (Kaskade)');
select is((select count(*)::int from app.account_invitations where email = 'nina@example.test'), 0, 'Einladung mit E-Mail gelöscht');
select is((select count(*)::int from auth.users where id = 'b0000000-0000-0000-0000-00000000000b'), 1, 'Angenommene Einladung bleibt');

-- ---------------------------------------------------------------------------
-- Ausweisprüfung
-- ---------------------------------------------------------------------------
select throws_ok($$ select ops.verification_begin('b0000000-0000-0000-0000-00000000000b') $$, '42501', null, 'Ohne Einwilligung biometrie keine Prüfung');

create function pg_temp.onboard(p_user uuid, p_first text, p_last text, p_birth date) returns void language plpgsql as $$
declare k text;
begin
  perform tests.act_as(p_user);
  foreach k in array array['agb', 'datenschutz_kenntnis', 'art9_profile', 'biometrie'] loop
    perform api.give_consent(k, (select d.version from api.legal_document(k) d));
  end loop;
  perform api.save_facts(p_first, p_last, p_birth, '19053');
  perform api.save_identity('mann', array['frau']);
  perform tests.reset_role();
end;
$$;
select pg_temp.onboard('b0000000-0000-0000-0000-00000000000b', 'Ben', 'Brandt-Özdemir', date '1991-02-03');

select is(ops.verification_begin('b0000000-0000-0000-0000-00000000000b') ->> 'verification_id' is not null, true, 'Prüfung beginnt');
select ops.verification_attach_session((select id from app.verifications where user_id = 'b0000000-0000-0000-0000-00000000000b' and status = 'started'), 'sess_1');

-- Name passt nicht → abgelehnt, Daten nicht gespeichert
select is(ops.verification_complete('sess_1', 'approved', 'Benjamin', 'Brandt', date '1991-02-03', 'T22000129') ->> 'status', 'declined',
  'Anderer Name → declined');
select is((select name_match from app.verifications where provider_session_id = 'sess_1'), false, 'name_match = false');
select is((select birth_date_match from app.verifications where provider_session_id = 'sess_1'), true, 'birth_date_match = true');
select is((select birth_year from app.verifications where provider_session_id = 'sess_1'), 1991, 'Nur das Geburtsjahr gespeichert');
select is((select count(*)::int from app.verifications v where to_jsonb(v)::text ilike any (array['%T22000129%', '%Benjamin%', '%1991-02-03%'])), 0,
  'Weder Ausweisnummer noch Name noch Geburtsdatum aus dem Ausweis gespeichert');
select is(ops.verification_complete('sess_1', 'approved', 'Ben', 'Brandt-Özdemir', date '1991-02-03', 'T22000129') ->> 'already', 'true',
  'Zweites Ergebnis für dieselbe Sitzung ändert nichts (idempotent)');

-- Zweiter Versuch: Umlaute, mehrere Vornamen, Bindestrich → passt
select ops.verification_begin('b0000000-0000-0000-0000-00000000000b');
select ops.verification_attach_session((select id from app.verifications where user_id = 'b0000000-0000-0000-0000-00000000000b' and status = 'started'), 'sess_2');
select is(ops.verification_complete('sess_2', 'approved', 'BEN ELIAS', 'Brandt-Oezdemir', date '1991-02-03', 'T 2200 0129') ->> 'status', 'declined',
  'oe statt ö gilt nicht als gleich (strenger Abgleich)');
select ops.verification_begin('b0000000-0000-0000-0000-00000000000b');
select ops.verification_attach_session((select id from app.verifications where user_id = 'b0000000-0000-0000-0000-00000000000b' and status = 'started'), 'sess_3');
select is(ops.verification_complete('sess_3', 'approved', 'BEN ELIAS', 'BRANDT-ÖZDEMIR', date '1991-02-03', 'T 2200 0129') ->> 'status', 'approved',
  'Mehrere Vornamen und Großschreibung passen');
select ok(app.is_verified('b0000000-0000-0000-0000-00000000000b'), 'Ben ist geprüft');
select is((select status from app.accounts where user_id = 'b0000000-0000-0000-0000-00000000000b'), 'active', 'Onboarding fertig → Konto aktiv');
select ok((select doc_hash = safety.doc_hash('T22000129', date '1991-02-03') from safety.verification_hashes h
           join app.verifications v on v.id = h.verification_id where v.provider_session_id = 'sess_3'),
  'Sperrlisten-Hash aus normalisierter Ausweisnummer gespeichert');
select lives_ok($$ select ops.verification_session_deleted('sess_3') $$, 'Löschung bei Didit wird vermerkt');
select ok((select provider_session_deleted_at is not null from app.verifications where provider_session_id = 'sess_3'), 'provider_session_deleted_at gesetzt');
select is((select count(*)::int from ops.verifications_pending_deletion() where provider_session_id in ('sess_1', 'sess_2')), 2,
  'Noch nicht gelöschte Sitzungen werden nachgeholt');
select throws_ok($$ select ops.verification_begin('b0000000-0000-0000-0000-00000000000b') $$, '23505', null, 'Geprüft: keine neue Prüfung');

-- Nach der Prüfung: Name und Geburtsdatum fest
select tests.act_as('b0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select api.save_facts('Benno', 'Brandt-Özdemir', date '1991-02-03', '19053') $$, '42501', null, 'Geprüfter Name lässt sich nicht ändern');
select lives_ok($$ select api.save_facts('Ben', 'Brandt-Özdemir', date '1991-02-03', '23966') $$, 'PLZ lässt sich weiter ändern');
select tests.reset_role();

-- Sperrliste: Ausweis-Treffer sperrt automatisch, Namens-Treffer meldet nur
select tests.create_user('eva@example.test', 'e0000000-0000-0000-0000-00000000000e');
select tests.create_user('finn@example.test', 'f1000000-0000-0000-0000-00000000000f');
select tests.create_user('mia@example.test', 'a1000000-0000-0000-0000-000000000001');
select app.on_account_created('e0000000-0000-0000-0000-00000000000e');
select app.on_account_created('f1000000-0000-0000-0000-00000000000f');
select app.on_account_created('a1000000-0000-0000-0000-000000000001');
select pg_temp.onboard('e0000000-0000-0000-0000-00000000000e', 'Eva', 'Ernst', date '1985-01-01');
select pg_temp.onboard('f1000000-0000-0000-0000-00000000000f', 'Finn', 'Fuchs', date '1988-08-08');
select pg_temp.onboard('a1000000-0000-0000-0000-000000000001', 'Mia', 'Mohr', date '1999-09-09');
insert into safety.blocklist (doc_hash, reason_code) values (safety.doc_hash('X1234567', date '1985-01-01'), 'null_toleranz');
insert into safety.blocklist (name_hash, reason_code) values (safety.name_hash('Finn', 'Fuchs', date '1988-08-08'), 'wiederholte_verstoesse');

select ops.verification_begin('e0000000-0000-0000-0000-00000000000e');
select ops.verification_attach_session((select id from app.verifications where user_id = 'e0000000-0000-0000-0000-00000000000e'), 'sess_eva');
select is(ops.verification_complete('sess_eva', 'approved', 'Eva', 'Ernst', date '1985-01-01', 'x1234567') ->> 'status', 'blocked',
  'Ausweis auf der Sperrliste → blocked');
select is((select status from app.accounts where user_id = 'e0000000-0000-0000-0000-00000000000e'), 'suspended', 'Konto automatisch gesperrt');
select ok(safety.is_suspended('e0000000-0000-0000-0000-00000000000e'), 'Vorläufige Sperre aktiv');
select is((select count(*)::int from safety.safety_flags where user_id = 'e0000000-0000-0000-0000-00000000000e' and kind = 'sperrliste_ausweis'), 1,
  'Hinweis für Benn (Ausweis)');
select ok(not app.is_verified('e0000000-0000-0000-0000-00000000000e'), 'Gesperrte Person gilt nicht als geprüft');

select ops.verification_begin('f1000000-0000-0000-0000-00000000000f');
select ops.verification_attach_session((select id from app.verifications where user_id = 'f1000000-0000-0000-0000-00000000000f'), 'sess_finn');
select is(ops.verification_complete('sess_finn', 'approved', 'Finn', 'Fuchs', date '1988-08-08', 'N9999999') ->> 'status', 'approved',
  'Nur Namens-Treffer → keine automatische Sperre');
select is((select count(*)::int from safety.safety_flags where user_id = 'f1000000-0000-0000-0000-00000000000f' and source = 'blocklist_name'), 1,
  'Namens-Treffer meldet einen Verdachtsfall für Benn');
select is((select status from app.accounts where user_id = 'f1000000-0000-0000-0000-00000000000f'), 'active', 'Finn bleibt aktiv');

-- Minderjährig laut Ausweis (Formular sagte volljährig)
select ops.verification_begin('a1000000-0000-0000-0000-000000000001');
select ops.verification_attach_session((select id from app.verifications where user_id = 'a1000000-0000-0000-0000-000000000001'), 'sess_mia');
select is(ops.verification_complete('sess_mia', 'approved', 'Mia', 'Mohr', (app.berlin_today() - interval '17 years')::date, 'K1111111') ->> 'status',
  'declined', 'Minderjährig laut Ausweis → declined');
select is((select is_adult from app.verifications where provider_session_id = 'sess_mia'), false, 'is_adult = false');
select is((select count(*)::int from safety.safety_flags where user_id = 'a1000000-0000-0000-0000-000000000001' and kind = 'minderjaehrig'), 1,
  'Hinweis „minderjährig“ für Benn');

-- Status ohne Daten: in_review, expired
select ops.verification_begin('a1000000-0000-0000-0000-000000000001');
select ops.verification_attach_session((select id from app.verifications where user_id = 'a1000000-0000-0000-0000-000000000001' and status = 'started'), 'sess_mia2');
select is(ops.verification_complete('sess_mia2', 'in_review') ->> 'final', 'false', 'In Prüfung ist nicht endgültig');
select throws_ok($$ select ops.verification_begin('a1000000-0000-0000-0000-000000000001') $$, '42501', null, 'Während in_review kein neuer Versuch');
select is(ops.verification_complete('sess_mia2', 'expired') ->> 'status', 'expired', 'Abgelaufen');

-- Höchstzahl Versuche
update ops.app_settings set value = '2' where key = 'verification.max_attempts';
select throws_ok($$ select ops.verification_begin('a1000000-0000-0000-0000-000000000001') $$, '42501', null, 'Nach zu vielen Versuchen prüft Benn');
select tests.act_as('a1000000-0000-0000-0000-000000000001');
select is((api.my_onboarding() ->> 'verification_attempts_left')::int, 0, 'Onboarding zeigt keine Versuche mehr');
select tests.reset_role();

-- Mitglieder sehen ihre Prüfung, aber keine Hashes
select tests.act_as('b0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from app.verifications), 3, 'Ben sieht seine drei Prüfungen');
select throws_ok($$ select * from safety.verification_hashes $$, '42501', null, 'Hashes sind für Mitglieder unerreichbar');
select throws_ok($$ select ops.verification_complete('sess_3', 'approved') $$, '42501', null, 'Mitglieder setzen kein Prüfergebnis');
select tests.reset_role();

select * from finish();
rollback;
