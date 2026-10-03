-- Viola (M3): Gespräch anfragen, Agent-Funktionen, Art.-9-Prüfung, Transkript-Löschung, Rechte.
begin;
select plan(78);

-- ---------------------------------------------------------------------------
-- Testpersonen: Vera (geprüft, eingewilligt), Nils (ohne Einwilligung), Ute (ungeprüft), Sven (gesperrt),
-- Lea (Stufe andante, für Nachbesprechung)
-- ---------------------------------------------------------------------------
select tests.create_user('vera@example.test', '00000000-0000-0000-0000-0000000000a1');
select tests.create_user('nils@example.test', '00000000-0000-0000-0000-0000000000a2');
select tests.create_user('ute@example.test', '00000000-0000-0000-0000-0000000000a3');
select tests.create_user('sven@example.test', '00000000-0000-0000-0000-0000000000a4');
select tests.create_user('lea@example.test', '00000000-0000-0000-0000-0000000000a5');
insert into app.accounts (user_id, status, address_form, tier_view) values
  ('00000000-0000-0000-0000-0000000000a1', 'active', 'du', 'auftakt'),
  ('00000000-0000-0000-0000-0000000000a2', 'active', 'sie', 'auftakt'),
  ('00000000-0000-0000-0000-0000000000a3', 'active', 'sie', 'auftakt'),
  ('00000000-0000-0000-0000-0000000000a4', 'active', 'sie', 'auftakt'),
  ('00000000-0000-0000-0000-0000000000a5', 'active', 'sie', 'andante');
insert into app.verifications (user_id, status, is_adult, name_match, birth_date_match) values
  ('00000000-0000-0000-0000-0000000000a1', 'approved', true, true, true),
  ('00000000-0000-0000-0000-0000000000a2', 'approved', true, true, true),
  ('00000000-0000-0000-0000-0000000000a4', 'approved', true, true, true),
  ('00000000-0000-0000-0000-0000000000a5', 'approved', true, true, true);
insert into app.consents (user_id, kind, action, document_version) values
  ('00000000-0000-0000-0000-0000000000a1', 'gespraech', 'granted', 'v1'),
  ('00000000-0000-0000-0000-0000000000a3', 'gespraech', 'granted', 'v1'),
  ('00000000-0000-0000-0000-0000000000a4', 'gespraech', 'granted', 'v1'),
  ('00000000-0000-0000-0000-0000000000a5', 'gespraech', 'granted', 'v1');
insert into safety.sanctions (user_id, kind, reason) values ('00000000-0000-0000-0000-0000000000a4', 'vorlaeufige_sperre', 'Test');

-- ---------------------------------------------------------------------------
-- Art.-9-Prüfung (gleiche Muster wie im Python-Dienst)
-- ---------------------------------------------------------------------------
select is(app.art9_categories('Ich gehe gern wandern und koche für Freunde.'), '{}'::text[], 'Unauffälliger Text hat keine Kategorie');
select is(app.art9_categories('Sie ist sehr GLÄUBIG und geht sonntags in die Kirche.'), '{religion}'::text[], 'Religion wird erkannt (auch in Großbuchstaben mit Umlaut)');
select is(app.art9_categories('Seit dem Burnout nehme ich Antidepressiva.'), '{gesundheit}'::text[], 'Gesundheit wird erkannt');
select is(app.art9_categories('Ich suche eine Frau, die gern reist.'), '{geschlecht}'::text[], 'Gesuchtes Geschlecht wird erkannt');
select is(app.art9_categories('Mein Traumauto ist alt. Ich habe sie gebeten zu kommen.'), '{}'::text[], 'Keine Fehltreffer bei Traumauto und gebeten');
select is(app.art9_categories('Ich wähle die Grünen und bin in der Gewerkschaft.'), '{gewerkschaft,politik}'::text[], 'Politik und Gewerkschaft werden erkannt');
select is(app.art9_categories_jsonb('{"a": ["ruhig", "lesbisch"], "b": {"c": "Herzkrankheit"}}'::jsonb),
  '{gesundheit,sexualitaet}'::text[], 'JSON wird über alle Zeichenketten geprüft');

-- ---------------------------------------------------------------------------
-- Gespräch anfragen: Voraussetzungen
-- ---------------------------------------------------------------------------
select tests.act_as_anon();
select throws_ok($$ select api.interview_request('erstgespraech', 'voice') $$, '42501', null, 'anon darf kein Gespräch anfragen');
select tests.reset_role();

select tests.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select api.interview_request('erstgespraech', 'voice') $$, '42501', 'consent_missing', 'Ohne Einwilligung gespraech kein Gespräch');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-0000000000a3');
select throws_ok($$ select api.interview_request('erstgespraech', 'voice') $$, '42501', 'not_verified', 'Ohne Ausweisprüfung kein Gespräch');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-0000000000a4');
select throws_ok($$ select api.interview_request('erstgespraech', 'voice') $$, '42501', 'suspended', 'Gesperrte Personen bekommen kein Gespräch');
select tests.reset_role();

select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select api.interview_request('vertiefung', 'voice') $$, '42501', 'kind_not_allowed', 'Vertiefung ist in der Stufe Auftakt nicht vorgesehen');
select throws_ok($$ select api.interview_request('quatsch', 'voice') $$, '22023', 'invalid_kind', 'Unbekannte Gesprächsart wird abgelehnt');
select throws_ok($$ select api.interview_request('erstgespraech', 'video') $$, '22023', 'invalid_mode', 'Unbekannter Modus wird abgelehnt');
select lives_ok($$ select api.interview_request('erstgespraech', 'voice') $$, 'Vera fragt ein Erstgespräch an');
select is((select count(*)::int from app.interview_sessions where status = 'requested'), 1, 'Eine Anfrage liegt vor');
select is((select address_form from app.interview_sessions limit 1), 'du', 'Anrede kommt aus dem Konto');
select is((api.interview_request('erstgespraech', 'text') ->> 'mode'), 'text', 'Neue Anfrage im Textmodus');
select is((select count(*)::int from app.interview_sessions where status = 'requested'), 1, 'Die ältere Anfrage verfällt dabei');
select is((select count(*)::int from app.interview_sessions where status = 'aborted'), 1, 'Die ältere Anfrage ist abgebrochen');
select tests.reset_role();

-- Wechsel zu Text: nur für die eigene offene Sitzung
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select is((api.interview_text_access((select id from app.interview_sessions where status = 'requested' limit 1)) ->> 'mode'), 'text',
  'Text-Zugang für die eigene offene Sitzung');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select api.interview_text_access((select id from app.interview_sessions limit 1)) $$, 'P0002', 'session_not_found',
  'Kein Text-Zugang zu fremden Sitzungen');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select api.interview_text_access((select id from app.interview_sessions where status = 'aborted' limit 1)) $$,
  '55000', 'session_closed', 'Kein Text-Zugang zu beendeten Sitzungen');
select tests.reset_role();

-- Nils sieht Veras Gespräch nicht
select tests.act_as('00000000-0000-0000-0000-0000000000a2');
select is((select count(*)::int from app.interview_sessions), 0, 'Andere sehen fremde Gespräche nicht');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Agent-Funktionen: nur fermata_agent und service_role
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select api.agent_start_session((select id from app.interview_sessions where status = 'requested')) $$,
  '42501', null, 'Mitglieder dürfen Agent-Funktionen nicht aufrufen');
select throws_ok($$ select api.agent_append_turns(gen_random_uuid(), '[]'::jsonb) $$, '42501', null, 'Mitglieder schreiben keine Transkripte');
select throws_ok($$ select api.agent_flag_safety(gen_random_uuid(), 'krise', 'akut') $$, '42501', null, 'Mitglieder setzen keine Sicherheits-Hinweise');
select tests.reset_role();

-- Rechte: ausdrücklich vergeben, PUBLIC hat nichts
select ok(not has_function_privilege('authenticated', 'api.agent_append_turns(uuid, jsonb)', 'execute'), 'authenticated kann keine Agent-Funktion ausführen');
select ok(not has_function_privilege('anon', 'api.interview_request(text, text, uuid, uuid)', 'execute'), 'anon kann kein Gespräch anfragen');
select ok(has_function_privilege('authenticated', 'api.interview_confirm_summary(uuid, text, text)', 'execute'), 'Mitglieder bestätigen Zusammenfassungen');
select ok(has_function_privilege('fermata_agent', 'api.agent_save_analysis(uuid, jsonb)', 'execute'), 'Agent speichert Auswertungen');
select ok(not has_function_privilege('authenticated', 'app.interview_max_minutes(text, text, text)', 'execute'), 'Hilfsfunktionen sind nicht öffentlich');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('app', 'api', 'ops')
             and (p.proname like 'interview%' or p.proname like 'agent%' or p.proname like 'art9%'
                  or p.proname in ('expire_interview_sessions', 'purge_transcripts'))
             and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                         where a.grantee = 0 and a.privilege_type = 'EXECUTE')), 0,
  'Keine Viola-Funktion ist für PUBLIC ausführbar');

create temp table t_ids (name text primary key, id uuid);
grant all on t_ids to fermata_agent, authenticated;
-- Nur für pgTAP: die Rolle des Agenten braucht die Testfunktionen (Schema extensions).
grant usage on schema extensions, tests to fermata_agent;
insert into t_ids select 'vera', id from app.interview_sessions where status = 'requested';

set local role fermata_agent;
select is((api.agent_session_context((select id from t_ids where name = 'vera')) -> 'session' ->> 'kind'), 'erstgespraech',
  'Agent liest den Gesprächskontext');
select is((api.agent_session_context((select id from t_ids where name = 'vera')) -> 'settings' ->> 'llm_model_id'),
  'eu.anthropic.claude-sonnet-5-5', 'Kontext enthält das Sprachmodell aus den Einstellungen');
select is((api.agent_session_context((select id from t_ids where name = 'vera')) -> 'session' ->> 'max_minutes')::int, 60,
  'Textmodus hat die längere Höchstdauer');
select throws_ok($$ select api.agent_session_context(gen_random_uuid()) $$, 'P0002', 'session_not_found', 'Unbekannte Sitzung');
select is((api.agent_start_session((select id from t_ids where name = 'vera')) ->> 'status'), 'active', 'Agent startet das Gespräch');
select is((api.agent_start_session((select id from t_ids where name = 'vera')) ->> 'resumed')::boolean, true, 'Erneuter Start ist eine Wiederaufnahme');
select throws_ok($$ select api.agent_append_turns((select id from t_ids where name = 'vera'), '[{"role": "person", "text": "Hallo"}]') $$,
  '55000', 'ai_notice_missing', 'Ohne KI-Hinweis wird nichts gespeichert (Art. 50 AI Act)');
select isnt(api.agent_mark_ai_notice((select id from t_ids where name = 'vera'), '2026-10-03'), null, 'KI-Hinweis wird vermerkt');
select is(api.agent_append_turns((select id from t_ids where name = 'vera'),
  '[{"role": "viola", "text": "Ich bin Viola, eine künstliche Intelligenz."}, {"role": "person", "text": "Hallo Viola"}]'), 2,
  'Zwei Beiträge im Transkript');
select throws_ok($$ select api.agent_append_turns((select id from t_ids where name = 'vera'), '[{"role": "benn", "text": "x"}]') $$,
  '22023', 'invalid_turns', 'Nur Viola und Person als Rollen');
select throws_ok($$ select api.agent_save_summary_draft((select id from t_ids where name = 'vera'), 'Du bist ruhig, neugierig und gehst regelmäßig in die Moschee.') $$,
  '22023', 'art9_content', 'Zusammenfassung mit Art.-9-Inhalt wird abgelehnt');
select is(api.agent_save_summary_draft((select id from t_ids where name = 'vera'),
  'Du bist ruhig und neugierig, wanderst gern und wünschst dir ein Gegenüber mit Humor.', array['persoenlichkeit', 'wuensche']),
  'draft', 'Saubere Zusammenfassung wird als Entwurf gespeichert');
select throws_ok($$ select api.agent_save_analysis((select id from t_ids where name = 'vera'),
  '{"wants": [{"category": "werte", "text": "Sollte auch katholisch sein", "importance": 3}]}') $$,
  '22023', 'art9_content', 'Wünsche mit Art.-9-Inhalt werden abgelehnt');
select throws_ok($$ select api.agent_save_analysis((select id from t_ids where name = 'vera'), '{"age_min": 12}') $$,
  '22023', 'invalid_analysis', 'Ungültige Werte werden abgelehnt');
select is((api.agent_save_analysis((select id from t_ids where name = 'vera'),
  '{"personality": {"traits": ["ruhig", "neugierig"]}, "age_min": 30, "age_max": 45, "travel_modes": ["rad", "oepnv"],
    "travel_max_minutes": 40, "smoking": "nein",
    "wants": [{"category": "persoenlichkeit", "text": "Humor und Gelassenheit", "importance": 3},
              {"category": "lebensstil", "text": "Freude an Bewegung draußen", "importance": 2}],
    "dealbreakers": [{"kind": "raucht", "text": "Rauchen"}],
    "personal_weights": {"werte": 0.3, "wuensche": 0.3, "lebensumstaende": 0.1, "persoenlichkeit": 0.2, "zeiten": 0.1}}') ->> 'wants')::int,
  2, 'Auswertung speichert zwei Wünsche');
select tests.reset_role();
select is((select travel_modes from app.profile_core where user_id = '00000000-0000-0000-0000-0000000000a1'), '{oepnv,rad}'::text[],
  'Fahrbereitschaft steht im Profil');
set local role fermata_agent;
select is((api.agent_save_analysis((select id from t_ids where name = 'vera'),
  '{"wants": [{"category": "werte", "text": "Verlässlichkeit", "importance": 3}]}') ->> 'wants')::int, 1,
  'Neue Auswertung ersetzt die Wünsche aus dem Gespräch');
select throws_ok($$ select api.agent_save_analysis((select id from t_ids where name = 'vera'),
  '{"personal_weights": {"werte": 0.9, "zeiten": 0.9}}') $$, '22023', 'invalid_analysis', 'Gewichte müssen zusammen 1 ergeben');
insert into t_ids values ('flag1', api.agent_flag_safety((select id from t_ids where name = 'vera'), 'krise', 'hoch', 'regel', 1));
insert into t_ids values ('flag2', api.agent_flag_safety((select id from t_ids where name = 'vera'), 'krise', 'akut', 'viola'));
select isnt((select id from t_ids where name = 'flag1'), null, 'Sicherheits-Hinweis wird gesetzt');
select is((select id from t_ids where name = 'flag2'), (select id from t_ids where name = 'flag1'), 'Gleicher Hinweis wird zusammengeführt');
select throws_ok($$ select api.agent_flag_safety((select id from t_ids where name = 'vera'), 'krise', 'egal') $$,
  '22023', 'invalid_severity', 'Ungültige Dringlichkeit');
select isnt(api.agent_record_costs((select id from t_ids where name = 'vera'),
  '{"minutes": 12.5, "stt_seconds": 300, "llm_input_tokens": 1000, "llm_output_tokens": 200, "tts_characters": 1500,
    "amount_eur": 0.21, "latency_ms_p50": 900, "latency_ms_p90": 1700}'), null, 'Kosten werden protokolliert');
select throws_ok($$ select api.agent_record_costs((select id from t_ids where name = 'vera'), '{"minutes": -1}') $$,
  '22023', 'invalid_costs', 'Negative Kosten werden abgelehnt');
select is(api.agent_switch_mode((select id from t_ids where name = 'vera'), 'voice'), 'voice', 'Moduswechsel');
select is((api.agent_end_session((select id from t_ids where name = 'vera'), 'fertig', array['persoenlichkeit', 'werte']) ->> 'status'),
  'completed', 'Gespräch endet regulär');
select is((api.agent_end_session((select id from t_ids where name = 'vera'), 'fertig') ->> 'already_ended')::boolean, true,
  'Beenden ist idempotent');
select tests.reset_role();

select is((select count(*)::int from safety.safety_flags where kind = 'krise'), 1, 'Genau ein Krisen-Hinweis');
select is((select severity from safety.safety_flags where kind = 'krise'), 'akut', 'Dringlichkeit steigt auf akut');
select ok((select safety_flagged from app.interview_sessions where id = (select id from t_ids where name = 'vera')), 'Gespräch ist markiert');
select ok(not (select details ? 'text' from safety.safety_flags limit 1), 'Hinweis enthält keinen Freitext');

-- ---------------------------------------------------------------------------
-- Zusammenfassung bestätigen (Mitglied)
-- ---------------------------------------------------------------------------
select tests.act_as('00000000-0000-0000-0000-0000000000a2');
select throws_ok($$ select api.interview_confirm_summary((select id from t_ids where name = 'vera'), 'confirm') $$,
  'P0002', 'session_not_found', 'Fremde Zusammenfassungen lassen sich nicht bestätigen');
select tests.reset_role();
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select api.interview_confirm_summary((select id from t_ids where name = 'vera'), 'correct', 'Ich bin ruhig, neugierig und Christin. Das ist mir wichtig.') $$,
  '22023', 'art9_content', 'Korrektur mit Art.-9-Inhalt wird abgelehnt');
select is((api.interview_confirm_summary((select id from t_ids where name = 'vera'), 'correct',
  'Du bist ruhig, neugierig und wanderst gern. Humor ist dir wichtig.') ->> 'summary_version')::int, 1, 'Korrektur wird Version 1');
select is((select summary_text from app.profile_core where user_id = auth.uid()),
  'Du bist ruhig, neugierig und wanderst gern. Humor ist dir wichtig.', 'Profil enthält die korrigierte Zusammenfassung');
select throws_ok($$ select api.interview_confirm_summary((select id from t_ids where name = 'vera'), 'confirm') $$,
  '55000', 'no_draft', 'Ein Entwurf wird nur einmal übernommen');
select is((select count(*)::int from app.interview_transcripts), 1, 'Vera sieht ihr eigenes Transkript');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Nachbesprechung, Fortsetzung, Tageslimit
-- ---------------------------------------------------------------------------
insert into app.match_runs (id, scheduled_for, status) values ('10000000-0000-0000-0000-0000000000b1', now(), 'approved');
insert into app.pairings (id, run_id, user_a, user_b, total_score, status)
  values ('20000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', 0.8, 'proposed');
insert into app.evenings (id, pairing_id, user_a, user_b, state, starts_at)
  values ('30000000-0000-0000-0000-0000000000b1', '20000000-0000-0000-0000-0000000000b1',
          '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a5', 'happened', app.now() - interval '1 day');
-- Gleiche Regel wie das Angebot (M5): eigene Rückmeldung „war da“ liegt vor.
insert into app.feedback (evening_id, user_id, attended)
  values ('30000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a5', true);

select tests.act_as('00000000-0000-0000-0000-0000000000a5');
select throws_ok($$ select api.interview_request('nachbesprechung', 'voice') $$, '22023', 'evening_not_eligible', 'Nachbesprechung braucht einen Abend');
select is((api.interview_request('nachbesprechung', 'voice', '30000000-0000-0000-0000-0000000000b1') ->> 'max_minutes')::int, 10,
  'Nachbesprechung in Andante dauert höchstens 10 Minuten');
select tests.reset_role();
insert into t_ids select 'lea', id from app.interview_sessions where user_id = '00000000-0000-0000-0000-0000000000a5';
set local role fermata_agent;
select is((select array_agg(k order by k) from jsonb_object_keys(api.agent_session_context((select id from t_ids where name = 'lea')) -> 'evening') k),
  '{starts_at,venue_name}'::text[], 'Kontext der Nachbesprechung nennt nur Zeit und Lokal, keine andere Person');
select api.agent_start_session((select id from t_ids where name = 'lea'));
select api.agent_end_session((select id from t_ids where name = 'lea'), 'zeitlimit');
select tests.reset_role();

select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select api.interview_request('erstgespraech', 'voice', null, (select id from t_ids where name = 'lea')) $$,
  '22023', 'invalid_continuation', 'Fremde Gespräche lassen sich nicht fortsetzen');
select tests.reset_role();

update ops.app_settings set value = '1' where key = 'interview.max_sessions_per_day';
select tests.act_as('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ select api.interview_request('erstgespraech', 'voice') $$, '54000', 'daily_limit', 'Tageslimit greift');
select tests.reset_role();

-- ---------------------------------------------------------------------------
-- Transkript-Löschung nach 30 Tagen (simulierte Uhr)
-- ---------------------------------------------------------------------------
select ok((select delete_at between now() + interval '29 days' and now() + interval '31 days' from app.interview_transcripts limit 1),
  'Löschdatum liegt 30 Tage in der Zukunft');
select ops.sim_clock_advance(interval '29 days');
select is(ops.purge_transcripts(), 0, 'Nach 29 Tagen wird noch nichts gelöscht');
select ops.sim_clock_advance(interval '2 days');
select is(ops.purge_transcripts(), 1, 'Nach 31 Tagen ist das Transkript gelöscht');
select ops.sim_clock_reset();

-- Verfallene Anfragen räumt der Cron-Job auf
insert into app.interview_sessions (user_id, status, expires_at) values ('00000000-0000-0000-0000-0000000000a2', 'requested', now() - interval '1 minute');
select ok(ops.expire_interview_sessions() >= 1, 'Verfallene Anfragen werden beendet');

select * from finish();
rollback;
