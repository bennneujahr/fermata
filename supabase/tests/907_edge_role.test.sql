-- Härtung · Edge Functions mit der engen Rolle service_role (FERMATA_DB_ROLE): kein Zugriff auf Art.-9-Daten, Vault
-- und auth.users; was die Functions brauchen, liefern security-definer-Funktionen. Dazu: Links „Abend teilen“ und
-- Rechte des Auswahl-Jobs für die Produktionssperre.
begin;
select no_plan();

select tests.create_user('rolle@example.test', '00000000-0000-0000-0000-000000000907');
insert into private.account_facts (user_id, first_name, last_name, birth_date, postal_code)
values ('00000000-0000-0000-0000-000000000907', 'Rita', 'Rolle', '1991-01-01', '19053');

-- Was service_role nicht darf
select ok(not has_table_privilege('service_role', 'sensitive.profile_identity', 'select'), 'service_role liest keine Art.-9-Tabelle (Geschlecht)');
select ok(not has_table_privilege('service_role', 'sensitive.profile_sensitive', 'select'), 'service_role liest keine Art.-9-Tabelle (Religion)');
select ok(not has_function_privilege('service_role', 'sensitive.dec(bytea)', 'execute'), 'service_role entschlüsselt nicht');
select ok(not has_function_privilege('service_role', 'sensitive.key()', 'execute'), 'service_role holt den Schlüssel nicht');
select ok(not has_table_privilege('service_role', 'auth.users', 'select'), 'service_role liest auth.users nicht direkt');
select ok(not pg_has_role('service_role', 'fermata_sensitive', 'member'), 'service_role ist nicht Mitglied von fermata_sensitive');
-- Befund (dokumentiert in RUNBOOK und TOM): Im Supabase-Abbild darf service_role Vault lesen. Deshalb die eigene
-- Rolle fermata_edge (empfohlen für FERMATA_DB_ROLE).
select ok(has_table_privilege('service_role', 'vault.decrypted_secrets', 'select'), 'Befund: service_role liest Vault (Supabase-Freigabe)');
select ok(not has_table_privilege('fermata_edge', 'vault.decrypted_secrets', 'select')
      and not has_schema_privilege('fermata_edge', 'vault', 'usage'), 'fermata_edge liest Vault nicht');
select ok(not has_table_privilege('fermata_edge', 'sensitive.profile_identity', 'select')
      and not has_schema_privilege('fermata_edge', 'sensitive', 'usage'), 'fermata_edge: kein Art.-9-Schema');
select ok(not has_table_privilege('fermata_edge', 'auth.users', 'select'), 'fermata_edge liest auth.users nicht');
select ok(not pg_has_role('fermata_edge', 'pg_read_all_data', 'member') and not pg_has_role('fermata_edge', 'fermata_sensitive', 'member')
      and not pg_has_role('fermata_edge', 'authenticated', 'usage'), 'fermata_edge erbt keine weiteren Rechte');
select ok((select rolbypassrls and not rolcanlogin and not rolsuper from pg_roles where rolname = 'fermata_edge'),
  'fermata_edge: BYPASSRLS wie service_role, ohne Anmeldung, kein Superuser');
select is((select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by 1), '')
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('app', 'private', 'safety', 'billing', 'ops', 'api')
             and has_function_privilege('fermata_edge', p.oid, 'execute') <> has_function_privilege('service_role', p.oid, 'execute')),
  '', 'fermata_edge führt genau die Fermata-Funktionen aus, die service_role ausführen darf');
set local role fermata_edge;
select throws_ok($$ select decrypted_secret from vault.decrypted_secrets limit 1 $$, '42501', null, 'als fermata_edge: Vault gesperrt');
select throws_ok($$ select count(*) from sensitive.profile_identity $$, '42501', null, 'als fermata_edge: Art.-9-Tabelle gesperrt');
select throws_ok($$ select count(*) from auth.users $$, '42501', null, 'als fermata_edge: auth.users gesperrt');
select ok((select count(*) from private.account_facts where user_id = '00000000-0000-0000-0000-000000000907') = 1, 'als fermata_edge: Fermata-Tabellen lesbar (RLS umgangen)');
reset role;
select tests.act_as_service();
select throws_ok($$ select count(*) from sensitive.profile_identity $$, '42501', null, 'service_role: Art.-9-Tabelle gesperrt');

-- Was die Functions über security-definer-Funktionen bekommen
select is(ops.auth_user_id_by_email('ROLLE@example.test'), '00000000-0000-0000-0000-000000000907'::uuid, 'admin-invite: Person zu einer E-Mail');
select is(ops.auth_user_id_by_email('niemand@example.test'), null, 'unbekannte E-Mail: null');
select is((select name from billing.member_contact('00000000-0000-0000-0000-000000000907')), 'Rita Rolle', 'billing-*: Name für Eingangsbestätigungen');
select is((select email from billing.checkout_context('00000000-0000-0000-0000-000000000907')), 'rolle@example.test', 'billing-checkout: E-Mail');
select lives_ok($$ select app.export_account('00000000-0000-0000-0000-000000000907') $$, 'Datenexport (mit Art.-9-Angaben) nur über die Funktion');
select tests.reset_role();
set local role fermata_edge;
select is(ops.auth_user_id_by_email('rolle@example.test'), '00000000-0000-0000-0000-000000000907'::uuid, 'als fermata_edge: Hilfsfunktion nutzbar');
select is((app.export_account('00000000-0000-0000-0000-000000000907') -> 'angaben' ->> 'first_name'), 'Rita', 'als fermata_edge: Export über die Funktion');
reset role;
select ok(not has_function_privilege('authenticated', 'billing.member_contact(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'ops.auth_user_id_by_email(text)', 'execute')
      and not has_function_privilege('authenticated', 'billing.checkout_context(uuid)', 'execute'),
  'Mitglieder erreichen diese Hilfsfunktionen nicht');

-- Auswahl-Job darf die Umgebung lesen (Produktionssperre gegen Attrappen)
select ok(has_function_privilege('fermata_matcher', 'ops.environment()', 'execute'), 'fermata_matcher darf ops.environment() aufrufen');

-- „Abend teilen“: Seite der Web-App, Schlüssel im Fragment
select is(ops.setting_text('safety.trust_view_base_url'), 'https://app.fermata.example/teilen', 'Standard: site.app_url + /teilen');

select * from finish();
rollback;
