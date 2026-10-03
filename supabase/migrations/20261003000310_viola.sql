-- Fermata · Viola (M3): Gespräche anfragen, Agent-Funktionen, Art.-9-Prüfung, Sicherheits-Hinweise, Kosten.
-- PLAN 1 Nr. 4–5, 2.3 Nr. 4, 3.2 Nr. 9 und 16, 5.7, 5.8, 5.12. Bereich: services/viola, docs/bereiche/viola.md.
--
-- Wege der Daten:
--   Web-App → Edge Function interview-token → api.interview_request()       (als Mitglied, auth.uid())
--   Viola (Python) → Edge Function interview-agent → api.agent_*()          (Rolle fermata_agent, Geheimnis im Header)
--   Web-App → Edge Function interview-summary → api.interview_confirm_summary() (als Mitglied)
-- Rohaudio gibt es hier nicht: Die Datenbank kennt nur Text, Zahlen und Zeitpunkte.

-- ---------------------------------------------------------------------------
-- 1. Einstellungen (ergänzen, nie überschreiben)
-- ---------------------------------------------------------------------------
insert into ops.app_settings (key, value, description, category, is_public) values
  ('voice.wrapup_minutes', '4', 'So viele Minuten vor dem Zeitlimit beginnt Viola mit Zusammenfassung und Abschluss.', 'gespraech', false),
  ('voice.grace_minutes', '2', 'Nach dem Zeitlimit beendet Viola das Gespräch spätestens nach so vielen Minuten.', 'gespraech', false),
  ('voice.silence_prompt_seconds', '15', 'Nach so vielen Sekunden Stille fragt Viola behutsam nach.', 'gespraech', false),
  ('voice.max_silence_prompts', '2', 'Nach so vielen Nachfragen ohne Antwort beendet Viola das Gespräch freundlich.', 'gespraech', false),
  ('voice.max_sentences', '3', 'Höchstens so viele Sätze je Antwort von Viola: zwei Sätze, dann eine Frage (PLAN 5.8).', 'gespraech', false),
  ('voice.livekit_path', '"C"', 'PLATZHALTER (Frage B3): LiveKit-Weg A (Cloud Ship), B (Cloud Scale mit Regionsbindung) oder C (selbst betrieben in Frankfurt). Nur für die Kostenschätzung.', 'gespraech', false),
  ('voice.prices', '{"usd_to_eur": 0.86, "stt_usd_per_minute": 0.0077, "llm_usd_per_mtok": {"input": 2.2, "output": 11.0, "cache_read": 0.22, "cache_write": 2.75}, "tts_usd_per_million_chars": {"polly": 30.0, "google": 30.0, "cartesia": 40.0, "elevenlabs": 100.0, "fake": 0.0}, "media_usd_per_minute": {"A": 0.01, "B": 0.01, "C": 0.001}}',
    'PLATZHALTER: Preisannahmen für die Kostenschätzung je Gespräch. Quellen und Annahmen: docs/bereiche/viola.md, Abschnitt Kostenmodell.', 'gespraech', false),
  ('interview.tier_depth', '{"auftakt": {"target_minutes": 20, "turns_per_block": [2, 3]}, "andante": {"target_minutes": 30, "turns_per_block": [3, 5]}, "loge": {"target_minutes": 45, "turns_per_block": [4, 7]}}',
    'PLATZHALTER: Tiefe je Stufe. Zielzeit über alle Sitzungen eines Gesprächs, Antworten je Themenblock (mindestens, höchstens).', 'gespraech', false),
  ('interview.kinds_by_tier', '{"auftakt": ["erstgespraech", "korrektur"], "andante": ["erstgespraech", "vertiefung", "nachbesprechung", "korrektur"], "loge": ["erstgespraech", "vertiefung", "nachbesprechung", "korrektur"]}',
    'PLATZHALTER: Welche Gesprächsarten je Stufe möglich sind. Nachbesprechung zusätzlich nur, wenn evening.debrief_minutes für die Stufe größer als 0 ist.', 'gespraech', false),
  ('interview.max_sessions_per_day', '6', 'Höchstens so viele Gespräche je Person und Kalendertag (Schutz vor Kosten und Missbrauch).', 'gespraech', false),
  ('interview.request_ttl_minutes', '15', 'Ein angefragtes Gespräch muss innerhalb so vieler Minuten beginnen.', 'gespraech', false),
  ('interview.text_max_session_minutes', '60', 'Längste Dauer eines Gesprächs im Textmodus („Text statt Stimme“).', 'gespraech', false),
  ('interview.continuation_days', '7', 'Ein Gespräch, das wegen des Zeitlimits endete, kann so viele Tage lang fortgesetzt werden.', 'gespraech', false),
  ('interview.safety_transcript_retention_days', '30', 'PLATZHALTER (Frage B5): Aufbewahrung von Transkripten mit Sicherheits-Hinweis. 30 bedeutet: wie alle anderen.', 'gespraech', false),
  ('interview.ai_notice_version', '"2026-10-03"', 'Fassung des KI-Hinweises (Art. 50 AI Act), die Viola zu Beginn spricht.', 'gespraech', false),
  ('interview.redact_art9_in_transcripts', 'true', 'Sätze mit Art.-9-Inhalten werden vor dem Speichern im Transkript ersetzt (außer bei Sicherheits-Treffern).', 'gespraech', false),
  ('analysis.llm_effort', '"medium"', 'Denkaufwand des Hintergrund-Agenten (Auswertung, Art.-9-Gegenprüfung, Sicherheits-Agent).', 'gespraech', false),
  ('safety.crisis_lines', '{"telefonseelsorge": ["0800 1110111", "0800 1110222", "116 123"], "notruf": "112"}', 'Krisen-Nummern, die Viola nennt (Telefonseelsorge, Notruf). Vor dem Start erneut prüfen (M9).', 'sicherheit', true)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Ergänzungen an app.interview_sessions
-- ---------------------------------------------------------------------------
alter table app.interview_sessions
  add column continues_session_id uuid references app.interview_sessions (id) on delete set null,
  add column covered_blocks text[] not null default '{}',
  add column expires_at timestamptz,
  add column last_activity_at timestamptz,
  add column ai_notice_version text,
  add column mode_switched_at timestamptz,
  add column analysis_status text not null default 'none' check (analysis_status in ('none', 'saved', 'skipped', 'failed')),
  add column analyzed_at timestamptz;
comment on column app.interview_sessions.continues_session_id is 'Fortsetzung eines Gesprächs, das wegen des Zeitlimits endete (Zusammenfassung wird übernommen).';
comment on column app.interview_sessions.covered_blocks is 'Themenblöcke, die in dieser Sitzung besprochen wurden.';
comment on column app.interview_sessions.analysis_status is 'Hintergrund-Agent: saved (Profil gespeichert), skipped (z. B. Sicherheitsfall), failed.';
create unique index interview_sessions_one_open on app.interview_sessions (user_id) where status in ('requested', 'active');
create index interview_sessions_open_idx on app.interview_sessions (status, expires_at) where status in ('requested', 'active');

-- Erlaubte Themenblöcke (auch für Tests und den Admin lesbar)
create or replace function app.interview_valid_blocks(p_blocks text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_blocks <@ array['persoenlichkeit', 'werte', 'wuensche', 'lebensumstaende', 'fahrbereitschaft', 'zeiten',
    'abend_eindruck', 'abend_passung', 'abend_ausblick', 'korrektur']::text[], true);
$$;

-- Längste Dauer einer Sitzung in Minuten (Stimme, Text, Nachbesprechung je Stufe)
create or replace function app.interview_max_minutes(p_kind text, p_mode text, p_tier text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_kind = 'nachbesprechung'
      then least(coalesce((ops.setting('evening.debrief_minutes') ->> p_tier)::integer, 0), ops.setting_int('voice.max_session_minutes'))
    when p_mode = 'text' then ops.setting_int('interview.text_max_session_minutes')
    else ops.setting_int('voice.max_session_minutes')
  end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Art.-9-Prüfung (PLAN 5.7). Muster: services/viola/src/viola/art9_patterns.json (einzige Quelle;
--    ein pytest vergleicht den Block unten mit der Datei). Treffer → Ablehnung beim Speichern.
-- ---------------------------------------------------------------------------
create table ops.art9_patterns (
  id integer generated always as identity primary key,
  category text not null check (category in ('gesundheit', 'religion', 'politik', 'gewerkschaft', 'herkunft', 'sexualitaet', 'geschlecht', 'genetik', 'strafrecht')),
  fragment text not null,
  prefix boolean not null default false,
  anywhere boolean not null default false,
  regex text generated always as (
    case when anywhere then '' else '(?<![a-zäöüß0-9])' end || '(?:' || fragment || ')' || case when prefix then '' else '(?![a-zäöüß0-9])' end
  ) stored
);
comment on table ops.art9_patterns is 'Regelbasierte Art.-9-Prüfung (Schlüsselwörter, reguläre Ausdrücke). Gleiche Liste wie im Viola-Dienst.';
alter table ops.art9_patterns enable row level security;

-- art9-patterns:begin
insert into ops.art9_patterns (category, fragment, prefix, anywhere)
select e ->> 'c', e ->> 'p', (e ->> 'prefix')::boolean, (e ->> 'anywhere')::boolean
from jsonb_array_elements($art9$[
  {"c": "gesundheit", "p": "krankheit", "prefix": true, "anywhere": true},
  {"c": "gesundheit", "p": "erkrank", "prefix": true, "anywhere": true},
  {"c": "gesundheit", "p": "krank(e|en|er|es)?", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "chronisch", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "diagnos", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "depress", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "(angst|ess|zwangs|persönlichkeits|schlaf|belastungs|panik|aufmerksamkeits|bindungs|psychische )störung", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "panikattack", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "psychisch", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "psychiat", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "psychotherap", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "therapie(n)?", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "(chemo|paar|trauma|sucht|verhaltens|gesprächs|hormon|physio|ergo)therapi", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "in behandlung", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "medikament", "prefix": true, "anywhere": true},
  {"c": "gesundheit", "p": "tablette(n)?", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "antidepressiv", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "insulin", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "behinder", "prefix": true, "anywhere": true},
  {"c": "gesundheit", "p": "rollstuhl", "prefix": true, "anywhere": true},
  {"c": "gesundheit", "p": "gehörlos|schwerhörig", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "diabet", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "krebs", "prefix": true, "anywhere": true},
  {"c": "gesundheit", "p": "tumor", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "hiv|aids|adhs|ptbs|copd", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "autis", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "asperger", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "burn ?-?out", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "borderline|bipolar|schizophren[a-zäöüß]*|psychose[n]?|epilep[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "magersucht|bulimi[a-zäöüß]*|essstörung[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "(alkohol|drogen|spiel|kauf|mager|ess|tabletten|medikamenten|nikotin|sex|internet|computer)sucht", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "(alkohol|drogen|spiel|kauf|mager|tabletten|medikamenten|sex)süchtig", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "suchterkrank", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "alkoholiker|alkoholikerin|alkoholkrank[a-zäöüß]*|entzug[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "drogen", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "trauma(ta|tisch[a-zäöüß]*|tisiert[a-zäöüß]*)?", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "suizid", "prefix": true, "anywhere": true},
  {"c": "gesundheit", "p": "selbstmord", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "selbstverletz", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "ritze|ritzen", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "schwanger", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "fehlgeburt", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "unfruchtbar", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "kinderwunschbehandlung|künstliche befruchtung|ivf", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "allergi", "prefix": true, "anywhere": true},
  {"c": "gesundheit", "p": "unverträglich", "prefix": true, "anywhere": true},
  {"c": "gesundheit", "p": "migräne|asthma|rheuma[a-zäöüß]*|arthrose|parkinson|demenz|dement|alzheimer|multiple sklerose|schlaganfall|reha", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "infarkt", "prefix": true, "anywhere": true},
  {"c": "gesundheit", "p": "gesundheitlich", "prefix": true, "anywhere": false},
  {"c": "gesundheit", "p": "pflegegrad|pflegebedürftig[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "übergewicht[a-zäöüß]*|untergewicht[a-zäöüß]*|adipös[a-zäöüß]*|adipositas", "prefix": false, "anywhere": false},
  {"c": "gesundheit", "p": "impoten[a-zäöüß]*|erektil[a-zäöüß]*|geschlechtskrank[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "religion", "p": "religi", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "gläubig", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "an gott", "prefix": false, "anywhere": false},
  {"c": "religion", "p": "(mein|meinen|meinem|meiner|ihr|ihren|ihrem|ihrer|dein|deinen|deinem|deiner|sein|seinen|seinem|der|den|dem|im|vom|zum) glauben?", "prefix": false, "anywhere": false},
  {"c": "religion", "p": "gottesdienst", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "kirche", "prefix": true, "anywhere": true},
  {"c": "religion", "p": "katholi", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "evangeli", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "protestant", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "christ|christin|christen|christentum|christlich[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "religion", "p": "muslim", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "moslem", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "islam", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "moschee", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "ramadan|koran|halal|kopftuch[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "religion", "p": "jude|juden|jüdin|judentum|jüdisch[a-zäöüß]*|synagoge[n]?|koscher|sabbat|schabbat", "prefix": false, "anywhere": false},
  {"c": "religion", "p": "buddhis", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "hindu", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "sikh", "prefix": false, "anywhere": false},
  {"c": "religion", "p": "atheist", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "agnosti", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "konfession", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "freikirch", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "zeugen jehovas|neuapostol[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "religion", "p": "orthodox", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "spirituell", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "spiritualität", "prefix": false, "anywhere": false},
  {"c": "religion", "p": "esoteri", "prefix": true, "anywhere": false},
  {"c": "religion", "p": "beten|gebet|gebete|gebetet|getauft|taufe|konfirmation|kommunion|firmung", "prefix": false, "anywhere": false},
  {"c": "religion", "p": "weltanschau", "prefix": true, "anywhere": false},
  {"c": "politik", "p": "politi", "prefix": true, "anywhere": false},
  {"c": "politik", "p": "partei", "prefix": true, "anywhere": false},
  {"c": "politik", "p": "afd|cdu|csu|spd|fdp|bsw|npd|mlpd|linkspartei", "prefix": false, "anywhere": false},
  {"c": "politik", "p": "(wähle|wählt|wählen|gewählt|mitglied bei|mitglied der|stimme für|sympathisiere mit) (die |den |der )?(grünen|linken|linke)", "prefix": false, "anywhere": false},
  {"c": "politik", "p": "(links|rechts)(extrem|radikal|populist|populis)", "prefix": true, "anywhere": false},
  {"c": "politik", "p": "nazi|neonazi|antifa|querdenker[a-zäöüß]*|reichsbürger[a-zäöüß]*", "prefix": true, "anywhere": false},
  {"c": "politik", "p": "kommunis|sozialist|faschis|anarchist", "prefix": true, "anywhere": false},
  {"c": "politik", "p": "(links|rechts) (eingestellt|gesinnt|wählen|gewählt)", "prefix": false, "anywhere": false},
  {"c": "gewerkschaft", "p": "gewerkschaft", "prefix": true, "anywhere": true},
  {"c": "gewerkschaft", "p": "ig metall|dgb", "prefix": false, "anywhere": false},
  {"c": "herkunft", "p": "ethni", "prefix": true, "anywhere": false},
  {"c": "herkunft", "p": "migrationshintergrund|migrationsgeschichte|einwanderungsgeschichte", "prefix": false, "anywhere": false},
  {"c": "herkunft", "p": "hautfarbe", "prefix": true, "anywhere": false},
  {"c": "herkunft", "p": "rasse|rassen|rassis[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "herkunft", "p": "abstammung", "prefix": true, "anywhere": false},
  {"c": "herkunft", "p": "volkszugehörig", "prefix": true, "anywhere": false},
  {"c": "herkunft", "p": "sinti|roma|people of colou?r|poc|afrodeutsch[a-zäöüß]*|dunkelhäutig[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "herkunft", "p": "(türkisch|russisch|polnisch|arabisch|afrikanisch|asiatisch|kurdisch|vietnamesisch|syrisch|libanesisch|iranisch|italienisch|griechisch|ukrainisch)stämmig", "prefix": true, "anywhere": false},
  {"c": "sexualitaet", "p": "schwul", "prefix": true, "anywhere": false},
  {"c": "sexualitaet", "p": "lesb", "prefix": true, "anywhere": false},
  {"c": "sexualitaet", "p": "(bi|homo|hetero|pan|a|demi|trans)sexu", "prefix": true, "anywhere": false},
  {"c": "sexualitaet", "p": "hetero|homo|bi|gay", "prefix": false, "anywhere": false},
  {"c": "sexualitaet", "p": "queer", "prefix": true, "anywhere": false},
  {"c": "sexualitaet", "p": "sexuell", "prefix": true, "anywhere": false},
  {"c": "sexualitaet", "p": "sexualität|sex|sexleben|sexpartner[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "sexualitaet", "p": "lgbt", "prefix": true, "anywhere": false},
  {"c": "sexualitaet", "p": "coming ?-?out|geoutet|outing", "prefix": false, "anywhere": false},
  {"c": "sexualitaet", "p": "polyamor", "prefix": true, "anywhere": false},
  {"c": "sexualitaet", "p": "offene beziehung", "prefix": true, "anywhere": false},
  {"c": "sexualitaet", "p": "swinger", "prefix": true, "anywhere": false},
  {"c": "sexualitaet", "p": "fetisch", "prefix": true, "anywhere": true},
  {"c": "sexualitaet", "p": "bdsm|kink[a-zäöüß]*|one ?-?night ?-?stands?", "prefix": false, "anywhere": false},
  {"c": "geschlecht", "p": "transgender|transfrau|transmann|transperson|trans|nichtbinär[a-zäöüß]*|nicht-binär[a-zäöüß]*|non-?binary|enby|intersex[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "geschlecht", "p": "geschlechtsidentität|geschlechtsangleich[a-zäöüß]*", "prefix": false, "anywhere": false},
  {"c": "geschlecht", "p": "(such|wünsch|möcht|will|hätte gern)[a-zäöüß]*( [a-zäöüß]+){0,4} (eine|einen|einer|nach einer|nach einem)? ?(frau|mann|männer|frauen|partnerin|freundin|lebensgefährtin|lebensgefährte)", "prefix": false, "anywhere": false},
  {"c": "geschlecht", "p": "(ich bin|sie sind|du bist|bin) (eine frau|ein mann)", "prefix": false, "anywhere": false},
  {"c": "genetik", "p": "genetisch", "prefix": true, "anywhere": false},
  {"c": "genetik", "p": "erbkrank", "prefix": true, "anywhere": true},
  {"c": "genetik", "p": "gentest|erbgut|dna", "prefix": false, "anywhere": false},
  {"c": "genetik", "p": "biometri", "prefix": true, "anywhere": false},
  {"c": "strafrecht", "p": "vorstrafe|vorbestraft", "prefix": true, "anywhere": false},
  {"c": "strafrecht", "p": "gefängnis", "prefix": true, "anywhere": false},
  {"c": "strafrecht", "p": "knast|haftstrafe[n]?|bewährungsstrafe[n]?|straftat[a-zäöüß]*|strafverfahren", "prefix": false, "anywhere": false}
]$art9$::jsonb) e;
-- art9-patterns:end

create or replace function app.art9_categories(p_text text)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p.category order by p.category), '{}'::text[])
  from ops.art9_patterns p
  where p_text is not null and lower(normalize(p_text, NFC)) ~ p.regex;
$$;
comment on function app.art9_categories(text) is 'Liefert die Art.-9-Kategorien, die im Text vorkommen (leer = unauffällig). Nie die Fundstellen.';

create or replace function app.art9_categories_jsonb(p_value jsonb)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select app.art9_categories(coalesce(string_agg(v #>> '{}', E'\n'), ''))
  from jsonb_path_query(coalesce(p_value, 'null'::jsonb), 'strict $.** ? (@.type() == "string")') v;
$$;
comment on function app.art9_categories_jsonb(jsonb) is 'Art.-9-Prüfung über alle Zeichenketten-Werte eines JSON-Dokuments (Schlüssel werden nicht geprüft).';
revoke execute on function app.art9_categories(text), app.art9_categories_jsonb(jsonb) from public, anon;
grant execute on function app.art9_categories(text), app.art9_categories_jsonb(jsonb) to authenticated, service_role, fermata_agent;

-- ---------------------------------------------------------------------------
-- 4. Gespräch anfragen (Mitglied, über interview-token)
-- ---------------------------------------------------------------------------
create or replace function api.interview_request(
  p_kind text default 'erstgespraech',
  p_mode text default 'voice',
  p_evening_id uuid default null,
  p_continues uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  acc app.accounts;
  tier text;
  sid uuid := gen_random_uuid();
  prev app.interview_sessions;
  max_min integer;
  today_count integer;
  stale_after interval;
  s app.interview_sessions;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into acc from app.accounts a where a.user_id = uid;
  if not found or acc.status in ('suspended', 'closed') or acc.deletion_requested_at is not null then
    raise exception 'account_inactive' using errcode = '42501';
  end if;
  if safety.is_suspended(uid) then raise exception 'suspended' using errcode = '42501'; end if;
  if not app.is_verified(uid) then raise exception 'not_verified' using errcode = '42501'; end if;
  if not app.has_consent(uid, 'gespraech') then raise exception 'consent_missing' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('erstgespraech', 'vertiefung', 'nachbesprechung', 'korrektur') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('voice', 'text') then raise exception 'invalid_mode' using errcode = '22023'; end if;

  tier := acc.tier_view;
  if not coalesce((ops.setting('interview.kinds_by_tier') -> tier) ? p_kind, false) then
    raise exception 'kind_not_allowed' using errcode = '42501';
  end if;

  if p_kind = 'nachbesprechung' then
    if p_evening_id is null
       or coalesce((ops.setting('evening.debrief_minutes') ->> tier)::integer, 0) <= 0
       or not exists (select 1 from app.evenings e where e.id = p_evening_id and uid in (e.user_a, e.user_b) and e.state = 'happened')
       or exists (select 1 from app.interview_sessions x where x.user_id = uid and x.evening_id = p_evening_id
                  and x.kind = 'nachbesprechung' and x.status = 'completed') then
      raise exception 'evening_not_eligible' using errcode = '22023';
    end if;
  elsif p_evening_id is not null then
    raise exception 'evening_not_eligible' using errcode = '22023';
  end if;

  if p_kind in ('vertiefung', 'korrektur') and not exists (
    select 1 from app.profile_core pc where pc.user_id = uid and pc.summary_confirmed_at is not null
  ) and not (p_kind = 'korrektur' and exists (
    select 1 from app.interview_sessions x where x.user_id = uid and x.summary_draft is not null
  )) then
    raise exception 'no_profile_yet' using errcode = '22023';
  end if;

  if p_continues is not null then
    select * into prev from app.interview_sessions x where x.id = p_continues and x.user_id = uid;
    if not found or prev.end_reason is distinct from 'zeitlimit' and prev.end_reason is distinct from 'technik'
       or prev.kind <> p_kind
       or prev.ended_at < app.now() - make_interval(days => ops.setting_int('interview.continuation_days'))
       or exists (select 1 from app.interview_sessions y where y.continues_session_id = p_continues) then
      raise exception 'invalid_continuation' using errcode = '22023';
    end if;
  end if;

  -- Aufräumen: nie begonnene Anfragen verfallen; hängende Sitzungen gelten als technisch beendet.
  update app.interview_sessions x set status = 'aborted', ended_at = app.now()
   where x.user_id = uid and x.status = 'requested';
  stale_after := make_interval(mins => ops.setting_int('voice.max_session_minutes') + ops.setting_int('voice.grace_minutes') + 10);
  update app.interview_sessions x set status = 'failed', end_reason = 'technik', ended_at = app.now()
   where x.user_id = uid and x.status = 'active' and coalesce(x.last_activity_at, x.started_at, x.created_at) < app.now() - stale_after;
  if exists (select 1 from app.interview_sessions x where x.user_id = uid and x.status = 'active') then
    raise exception 'session_active' using errcode = '55000';
  end if;

  select count(*) into today_count from app.interview_sessions x
   where x.user_id = uid and (x.created_at at time zone 'Europe/Berlin')::date = (app.now() at time zone 'Europe/Berlin')::date
     and (x.started_at is not null or x.status = 'requested');
  if today_count >= ops.setting_int('interview.max_sessions_per_day') then
    raise exception 'daily_limit' using errcode = '54000';
  end if;

  max_min := app.interview_max_minutes(p_kind, p_mode, tier);
  insert into app.interview_sessions (id, user_id, kind, mode, status, address_form, tier_depth, evening_id, room_name,
                                      continues_session_id, expires_at, created_at)
  values (sid, uid, p_kind, p_mode, 'requested', acc.address_form, tier, p_evening_id, sid::text,
          p_continues, app.now() + make_interval(mins => ops.setting_int('interview.request_ttl_minutes')), app.now())
  returning * into s;

  return jsonb_build_object(
    'id', s.id, 'kind', s.kind, 'mode', s.mode, 'address_form', s.address_form, 'tier_depth', s.tier_depth,
    'room_name', s.room_name, 'expires_at', s.expires_at, 'max_minutes', max_min,
    'continues_session_id', s.continues_session_id, 'evening_id', s.evening_id,
    'ai_notice_version', ops.setting_text('interview.ai_notice_version'));
end;
$$;
comment on function api.interview_request(text, text, uuid, uuid) is
  'Mitglied fragt ein Gespräch an. Prüft Konto, Sperre, Ausweis, Einwilligung gespraech, Gesprächsart je Stufe, Tageslimit.';
revoke execute on function api.interview_request(text, text, uuid, uuid) from public, anon;
grant execute on function api.interview_request(text, text, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Zusammenfassung bestätigen oder korrigieren (Mitglied, über interview-summary)
-- ---------------------------------------------------------------------------
create or replace function api.interview_confirm_summary(p_session uuid, p_action text, p_text text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  s app.interview_sessions;
  final_text text;
  cats text[];
  version integer;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into s from app.interview_sessions x where x.id = p_session and x.user_id = uid for update;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  if p_action is null or p_action not in ('confirm', 'correct', 'reject') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  if s.summary_status <> 'draft' or s.summary_draft is null then raise exception 'no_draft' using errcode = '55000'; end if;

  if p_action = 'reject' then
    update app.interview_sessions set summary_status = 'rejected' where id = s.id;
    return jsonb_build_object('session_id', s.id, 'summary_status', 'rejected', 'summary_version',
      (select pc.summary_version from app.profile_core pc where pc.user_id = uid));
  end if;

  if p_action = 'confirm' then
    final_text := s.summary_draft;
  else
    final_text := btrim(coalesce(p_text, ''));
    if char_length(final_text) < 20 or char_length(final_text) > 4000 then
      raise exception 'invalid_text' using errcode = '22023';
    end if;
  end if;
  -- Auch die Person selbst schreibt keine Art.-9-Angaben in die Zusammenfassung (sie liest die Auswahl mit).
  cats := app.art9_categories(final_text);
  if cardinality(cats) > 0 then
    raise exception 'art9_content' using errcode = '22023', detail = array_to_string(cats, ',');
  end if;

  insert into app.profile_core (user_id) values (uid) on conflict (user_id) do nothing;
  update app.profile_core pc set summary_text = final_text, summary_version = pc.summary_version + 1,
    summary_confirmed_at = app.now()
   where pc.user_id = uid
  returning pc.summary_version into version;
  update app.interview_sessions set
    summary_status = case when p_action = 'confirm' then 'confirmed' else 'corrected' end,
    summary_confirmed_at = app.now()
   where id = s.id;
  perform ops.audit('interview.summary_' || p_action, 'app.interview_sessions', s.id::text,
    jsonb_build_object('summary_version', version));
  return jsonb_build_object('session_id', s.id,
    'summary_status', case when p_action = 'confirm' then 'confirmed' else 'corrected' end,
    'summary_version', version);
end;
$$;
comment on function api.interview_confirm_summary(uuid, text, text) is 'Mitglied bestätigt, korrigiert oder verwirft den Entwurf der Zusammenfassung.';
revoke execute on function api.interview_confirm_summary(uuid, text, text) from public, anon;
grant execute on function api.interview_confirm_summary(uuid, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Agent-Funktionen (nur fermata_agent und service_role; aufgerufen von interview-agent)
-- ---------------------------------------------------------------------------
create or replace function app.agent_session(p_session uuid, p_lock boolean default false)
returns app.interview_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions;
begin
  if p_lock then
    select * into s from app.interview_sessions x where x.id = p_session for update;
  else
    select * into s from app.interview_sessions x where x.id = p_session;
  end if;
  if not found then raise exception 'session_not_found' using errcode = 'P0002'; end if;
  return s;
end;
$$;
revoke execute on function app.agent_session(uuid, boolean) from public, anon, authenticated;

create or replace function api.agent_session_context(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session);
  pc app.profile_core;
  prev app.interview_sessions;
  result jsonb;
begin
  select * into pc from app.profile_core x where x.user_id = s.user_id;
  if s.continues_session_id is not null then
    select * into prev from app.interview_sessions x where x.id = s.continues_session_id;
  end if;
  result := jsonb_build_object(
    'session', jsonb_build_object(
      'id', s.id, 'user_id', s.user_id, 'kind', s.kind, 'mode', s.mode, 'status', s.status,
      'address_form', s.address_form, 'tier_depth', s.tier_depth, 'room_name', s.room_name,
      'started_at', s.started_at, 'ai_notice_at', s.ai_notice_at, 'expires_at', s.expires_at,
      'covered_blocks', to_jsonb(s.covered_blocks), 'summary_status', s.summary_status,
      'max_minutes', app.interview_max_minutes(s.kind, s.mode, s.tier_depth)),
    'person', jsonb_build_object('display_name', pc.display_name),
    'profile', case when pc.user_id is null then null else jsonb_build_object(
      'summary_text', pc.summary_text, 'summary_version', pc.summary_version,
      'personality', pc.personality, 'values_profile', pc.values_profile, 'life_circumstances', pc.life_circumstances,
      'age_min', pc.age_min, 'age_max', pc.age_max, 'travel_modes', to_jsonb(pc.travel_modes),
      'travel_max_minutes', pc.travel_max_minutes, 'travel_max_km', pc.travel_max_km,
      'smoking', pc.smoking, 'has_children', pc.has_children, 'wants_children', pc.wants_children,
      'wants', coalesce((select jsonb_agg(jsonb_build_object('category', w.category, 'text', w.text, 'importance', w.importance) order by w.created_at)
                         from app.wants w where w.user_id = s.user_id), '[]'::jsonb),
      'dealbreakers', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'text', d.text) order by d.created_at)
                         from app.dealbreakers d where d.user_id = s.user_id), '[]'::jsonb)) end,
    'previous', case when prev.id is null then null else jsonb_build_object(
      'session_id', prev.id, 'summary_draft', prev.summary_draft, 'covered_blocks', to_jsonb(prev.covered_blocks)) end,
    'evening', case when s.evening_id is null then null else (
      select jsonb_build_object('starts_at', e.starts_at, 'venue_name', v.name)
      from app.evenings e left join app.venues v on v.id = e.venue_id where e.id = s.evening_id) end,
    'turns', case when s.status = 'active' then
      coalesce((select t.turns from app.interview_transcripts t where t.session_id = s.id), '[]'::jsonb) else '[]'::jsonb end,
    'settings', jsonb_build_object(
      'llm_model_id', ops.setting_text('voice.llm_model_id'),
      'llm_effort', ops.setting_text('voice.llm_effort'),
      'llm_thinking', ops.setting_text('voice.llm_thinking'),
      'analysis_model_id', ops.setting_text('analysis.llm_model_id'),
      'analysis_effort', ops.setting_text('analysis.llm_effort'),
      'stt_model', ops.setting_text('voice.stt_model'),
      'stt_language', ops.setting_text('voice.stt_language'),
      'tts_provider', ops.setting_text('voice.tts_provider'),
      'tts_voice', ops.setting_text('voice.tts_voice'),
      'wrapup_minutes', ops.setting_int('voice.wrapup_minutes'),
      'grace_minutes', ops.setting_int('voice.grace_minutes'),
      'silence_prompt_seconds', ops.setting_int('voice.silence_prompt_seconds'),
      'max_silence_prompts', ops.setting_int('voice.max_silence_prompts'),
      'max_sentences', ops.setting_int('voice.max_sentences'),
      'latency_target_ms_p90', ops.setting_int('voice.latency_target_ms_p90'),
      'target_cost_eur_per_hour', ops.setting_num('voice.target_cost_eur_per_hour'),
      'livekit_path', ops.setting_text('voice.livekit_path'),
      'prices', ops.setting('voice.prices'),
      'tier_depth', ops.setting('interview.tier_depth') -> s.tier_depth,
      'redact_art9_in_transcripts', ops.setting_bool('interview.redact_art9_in_transcripts'),
      'transcript_retention_days', ops.setting_int('interview.transcript_retention_days'),
      'ai_notice_version', ops.setting_text('interview.ai_notice_version'),
      'crisis_lines', ops.setting('safety.crisis_lines')));
  return result;
end;
$$;
comment on function api.agent_session_context(uuid) is 'Alles, was Viola für ein Gespräch braucht. Keine Daten anderer Mitglieder, keine Art.-9-Daten.';

create or replace function api.agent_start_session(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session, true);
begin
  if s.status = 'active' then
    update app.interview_sessions set last_activity_at = app.now() where id = s.id;
    return jsonb_build_object('status', 'active', 'resumed', true, 'started_at', s.started_at);
  end if;
  if s.status <> 'requested' or s.expires_at < app.now() then
    raise exception 'session_not_startable' using errcode = '55000';
  end if;
  -- Zwischen Anfrage und Beginn kann sich etwas geändert haben.
  if not app.has_consent(s.user_id, 'gespraech') then raise exception 'consent_missing' using errcode = '42501'; end if;
  if safety.is_suspended(s.user_id) then raise exception 'suspended' using errcode = '42501'; end if;
  update app.interview_sessions set status = 'active', started_at = app.now(), last_activity_at = app.now() where id = s.id;
  return jsonb_build_object('status', 'active', 'resumed', false, 'started_at', app.now());
end;
$$;

create or replace function api.agent_mark_ai_notice(p_session uuid, p_version text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session, true);
  at timestamptz;
begin
  if s.status <> 'active' then raise exception 'session_not_active' using errcode = '55000'; end if;
  update app.interview_sessions set ai_notice_at = coalesce(ai_notice_at, app.now()),
    ai_notice_version = coalesce(ai_notice_version, nullif(btrim(p_version), '')), last_activity_at = app.now()
   where id = s.id
  returning ai_notice_at into at;
  return at;
end;
$$;
comment on function api.agent_mark_ai_notice(uuid, text) is 'Art. 50 AI Act: Zeitpunkt, zu dem Viola sich als KI vorgestellt hat. Vorher werden keine Gesprächsbeiträge gespeichert.';

create or replace function api.agent_append_turns(p_session uuid, p_turns jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session, true);
  clean jsonb;
  total integer;
begin
  if s.status <> 'active' then raise exception 'session_not_active' using errcode = '55000'; end if;
  if s.ai_notice_at is null then raise exception 'ai_notice_missing' using errcode = '55000'; end if;
  if jsonb_typeof(p_turns) is distinct from 'array' or jsonb_array_length(p_turns) = 0 or jsonb_array_length(p_turns) > 50 then
    raise exception 'invalid_turns' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_turns) t
    where jsonb_typeof(t) <> 'object' or (t ->> 'role') is null or (t ->> 'role') not in ('viola', 'person')
       or jsonb_typeof(t -> 'text') is distinct from 'string'
       or char_length(t ->> 'text') not between 1 and 4000
  ) then
    raise exception 'invalid_turns' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'role', t ->> 'role', 'text', t ->> 'text',
      'at', coalesce(t ->> 'at', to_jsonb(app.now()) #>> '{}'),
      'mode', coalesce(t ->> 'mode', s.mode))), '[]'::jsonb)
    into clean from jsonb_array_elements(p_turns) t;

  insert into app.interview_transcripts (session_id, user_id) values (s.id, s.user_id) on conflict (session_id) do nothing;
  update app.interview_transcripts t set turns = t.turns || clean
   where t.session_id = s.id
  returning jsonb_array_length(t.turns) into total;
  if total > 3000 then raise exception 'transcript_too_long' using errcode = '54000'; end if;
  update app.interview_sessions set last_activity_at = app.now() where id = s.id;
  return total;
end;
$$;
comment on function api.agent_append_turns(uuid, jsonb) is 'Hängt Gesprächsbeiträge als Text an das Transkript (Löschung nach interview.transcript_retention_days).';

create or replace function api.agent_save_summary_draft(p_session uuid, p_text text, p_covered_blocks text[] default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session, true);
  t text := btrim(coalesce(p_text, ''));
  cats text[];
begin
  if s.end_reason in ('minderjaehrig', 'krise', 'missbrauch') then raise exception 'session_not_eligible' using errcode = '55000'; end if;
  if s.status not in ('active', 'completed', 'failed') then raise exception 'session_not_eligible' using errcode = '55000'; end if;
  if char_length(t) < 20 or char_length(t) > 4000 then raise exception 'invalid_text' using errcode = '22023'; end if;
  if not app.interview_valid_blocks(p_covered_blocks) then raise exception 'invalid_blocks' using errcode = '22023'; end if;
  cats := app.art9_categories(t);
  if cardinality(cats) > 0 then
    raise exception 'art9_content' using errcode = '22023', detail = array_to_string(cats, ',');
  end if;
  update app.interview_sessions set summary_draft = t, summary_status = 'draft', summary_confirmed_at = null,
    covered_blocks = coalesce(p_covered_blocks, covered_blocks), last_activity_at = app.now()
   where id = s.id;
  return 'draft';
end;
$$;

create or replace function api.agent_save_analysis(p_session uuid, p_analysis jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session, true);
  a jsonb := p_analysis;
  cats text[];
  n_wants integer := 0;
  n_deal integer := 0;
  w jsonb;
  wsum numeric;
begin
  if s.end_reason in ('minderjaehrig', 'krise', 'missbrauch') then raise exception 'session_not_eligible' using errcode = '55000'; end if;
  if s.status not in ('active', 'completed', 'failed') then raise exception 'session_not_eligible' using errcode = '55000'; end if;
  if jsonb_typeof(a) is distinct from 'object' then raise exception 'invalid_analysis' using errcode = '22023'; end if;
  cats := app.art9_categories_jsonb(a);
  if cardinality(cats) > 0 then
    raise exception 'art9_content' using errcode = '22023', detail = array_to_string(cats, ',');
  end if;

  begin
    insert into app.profile_core (user_id) values (s.user_id) on conflict (user_id) do nothing;
    update app.profile_core pc set
      personality = case when a ? 'personality' and jsonb_typeof(a -> 'personality') = 'object' then a -> 'personality' else pc.personality end,
      values_profile = case when a ? 'values_profile' and jsonb_typeof(a -> 'values_profile') = 'object' then a -> 'values_profile' else pc.values_profile end,
      life_circumstances = case when a ? 'life_circumstances' and jsonb_typeof(a -> 'life_circumstances') = 'object' then a -> 'life_circumstances' else pc.life_circumstances end,
      age_min = case when a ? 'age_min' then (a ->> 'age_min')::integer else pc.age_min end,
      age_max = case when a ? 'age_max' then (a ->> 'age_max')::integer else pc.age_max end,
      travel_modes = case when jsonb_typeof(a -> 'travel_modes') = 'array'
        then array(select distinct jsonb_array_elements_text(a -> 'travel_modes') order by 1) else pc.travel_modes end,
      travel_max_minutes = case when a ? 'travel_max_minutes' then (a ->> 'travel_max_minutes')::integer else pc.travel_max_minutes end,
      travel_max_km = case when a ? 'travel_max_km' then (a ->> 'travel_max_km')::integer else pc.travel_max_km end,
      smoking = case when a ? 'smoking' then a ->> 'smoking' else pc.smoking end,
      has_children = case when a ? 'has_children' then (a ->> 'has_children')::boolean else pc.has_children end,
      wants_children = case when a ? 'wants_children' then a ->> 'wants_children' else pc.wants_children end
     where pc.user_id = s.user_id;

    if jsonb_typeof(a -> 'wants') = 'array' then
      delete from app.wants x where x.user_id = s.user_id and x.source = 'interview';
      insert into app.wants (user_id, category, text, importance, source)
      select s.user_id, x ->> 'category', btrim(x ->> 'text'), coalesce((x ->> 'importance')::smallint, 2), 'interview'
        from jsonb_array_elements(a -> 'wants') x;
      get diagnostics n_wants = row_count;
    end if;

    if jsonb_typeof(a -> 'dealbreakers') = 'array' then
      delete from app.dealbreakers x where x.user_id = s.user_id and x.source = 'interview';
      insert into app.dealbreakers (user_id, kind, value, text, source)
      select s.user_id, x ->> 'kind', coalesce(x -> 'value', '{}'::jsonb), nullif(btrim(x ->> 'text'), ''), 'interview'
        from jsonb_array_elements(a -> 'dealbreakers') x;
      get diagnostics n_deal = row_count;
    end if;

    if jsonb_typeof(a -> 'personal_weights') = 'object' then
      w := a -> 'personal_weights';
      if exists (select 1 from jsonb_object_keys(w) k where k not in ('werte', 'wuensche', 'lebensumstaende', 'persoenlichkeit', 'zeiten'))
         or exists (select 1 from jsonb_each(w) e where jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric not between 0 and 1) then
        raise exception 'invalid_weights' using errcode = '22023';
      end if;
      select sum((e.value #>> '{}')::numeric) into wsum from jsonb_each(w) e;
      if wsum is null or abs(wsum - 1) > 0.02 then raise exception 'invalid_weights' using errcode = '22023'; end if;
      insert into app.personal_weights (user_id, weights, updated_at) values (s.user_id, w, app.now())
      on conflict (user_id) do update set weights = excluded.weights, updated_at = excluded.updated_at;
    end if;
  exception
    when check_violation or invalid_text_representation or not_null_violation or numeric_value_out_of_range
      or invalid_parameter_value or datatype_mismatch or string_data_right_truncation then
      raise exception 'invalid_analysis' using errcode = '22023', detail = sqlerrm;
  end;

  update app.interview_sessions set analysis_status = 'saved', analyzed_at = app.now() where id = s.id;
  return jsonb_build_object('wants', n_wants, 'dealbreakers', n_deal);
end;
$$;
comment on function api.agent_save_analysis(uuid, jsonb) is 'Speichert die Auswertung des Hintergrund-Agenten. Prüft Art.-9-Inhalte erneut (Ablehnung bei Treffer).';

create or replace function api.agent_mark_analysis(p_session uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session, true);
begin
  if p_status not in ('skipped', 'failed') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update app.interview_sessions set analysis_status = p_status, analyzed_at = app.now() where id = s.id;
end;
$$;

create or replace function api.agent_flag_safety(p_session uuid, p_kind text, p_severity text, p_detector text default 'viola', p_turn_index integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session, true);
  existing safety.safety_flags;
  flag_id uuid;
  sev_rank constant text[] := array['niedrig', 'mittel', 'hoch', 'akut'];
  keep_days integer;
begin
  if p_kind is null or p_kind not in ('krise', 'minderjaehrig', 'gewalt', 'belaestigung', 'sonstiges') then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if p_severity is null or p_severity <> all (sev_rank) then raise exception 'invalid_severity' using errcode = '22023'; end if;
  if p_detector is null or p_detector not in ('viola', 'regel', 'analyse') then raise exception 'invalid_detector' using errcode = '22023'; end if;

  select * into existing from safety.safety_flags f
   where f.source = 'agent' and f.kind = p_kind and f.reviewed_at is null and f.details ->> 'session_id' = s.id::text
   order by f.created_at limit 1;
  if found then
    flag_id := existing.id;
    update safety.safety_flags f set
      severity = case when array_position(sev_rank, p_severity) > array_position(sev_rank, f.severity) then p_severity else f.severity end,
      details = f.details || jsonb_build_object('detectors', (
        select to_jsonb(array(select distinct d from jsonb_array_elements_text(coalesce(f.details -> 'detectors', '[]'::jsonb)) d
                              union select p_detector order by 1))))
     where f.id = flag_id;
  else
    -- Datensparsam: kein Freitext, keine Zitate. Benn liest bei Bedarf das Transkript (Frist siehe B5).
    insert into safety.safety_flags (user_id, source, kind, severity, details)
    values (s.user_id, 'agent', p_kind, p_severity, jsonb_build_object('session_id', s.id, 'detectors', jsonb_build_array(p_detector),
      'turn_index', p_turn_index, 'conversation_kind', s.kind))
    returning id into flag_id;
  end if;

  update app.interview_sessions set safety_flagged = true where id = s.id;
  keep_days := ops.setting_int('interview.safety_transcript_retention_days');
  if keep_days > ops.setting_int('interview.transcript_retention_days') then
    update app.interview_transcripts t set delete_at = greatest(t.delete_at, t.created_at + make_interval(days => keep_days))
     where t.session_id = s.id;
  end if;
  return flag_id;
end;
$$;
comment on function api.agent_flag_safety(uuid, text, text, text, integer) is 'Sicherheits-Hinweis für Benn (Krise, Minderjährigkeit, Gewalt, Belästigung). Ohne Freitext.';

create or replace function api.agent_record_costs(p_session uuid, p_costs jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session);
  c jsonb := coalesce(p_costs, '{}'::jsonb);
  new_id bigint;
begin
  if exists (select 1 from jsonb_each(c) e
             where e.key in ('minutes', 'stt_seconds', 'llm_input_tokens', 'llm_output_tokens', 'llm_cache_read_tokens',
                             'llm_cache_write_tokens', 'tts_characters', 'media_minutes', 'amount_eur', 'latency_ms_p50', 'latency_ms_p90')
               and jsonb_typeof(e.value) <> 'null'
               and (jsonb_typeof(e.value) <> 'number' or (e.value #>> '{}')::numeric < 0)) then
    raise exception 'invalid_costs' using errcode = '22023';
  end if;
  insert into ops.session_costs (session_id, minutes, stt_seconds, llm_input_tokens, llm_output_tokens, llm_cache_read_tokens,
    llm_cache_write_tokens, tts_characters, media_minutes, amount_eur, latency_ms_p50, latency_ms_p90, details)
  values (s.id, coalesce((c ->> 'minutes')::numeric, 0), coalesce((c ->> 'stt_seconds')::numeric, 0),
    coalesce((c ->> 'llm_input_tokens')::integer, 0), coalesce((c ->> 'llm_output_tokens')::integer, 0),
    coalesce((c ->> 'llm_cache_read_tokens')::integer, 0), coalesce((c ->> 'llm_cache_write_tokens')::integer, 0),
    coalesce((c ->> 'tts_characters')::integer, 0), coalesce((c ->> 'media_minutes')::numeric, 0),
    coalesce((c ->> 'amount_eur')::numeric, 0), (c ->> 'latency_ms_p50')::integer, (c ->> 'latency_ms_p90')::integer,
    coalesce(c -> 'details', '{}'::jsonb))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function api.agent_switch_mode(p_session uuid, p_mode text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session, true);
begin
  if s.status <> 'active' then raise exception 'session_not_active' using errcode = '55000'; end if;
  if p_mode not in ('voice', 'text') then raise exception 'invalid_mode' using errcode = '22023'; end if;
  update app.interview_sessions set mode = p_mode, mode_switched_at = app.now(), last_activity_at = app.now() where id = s.id;
  return p_mode;
end;
$$;

create or replace function api.agent_end_session(p_session uuid, p_reason text, p_covered_blocks text[] default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s app.interview_sessions := app.agent_session(p_session, true);
  new_status text;
begin
  if p_reason is null or p_reason not in ('fertig', 'person_beendet', 'zeitlimit', 'technik', 'krise', 'minderjaehrig', 'missbrauch') then
    raise exception 'invalid_reason' using errcode = '22023';
  end if;
  if not app.interview_valid_blocks(p_covered_blocks) then raise exception 'invalid_blocks' using errcode = '22023'; end if;
  if s.status in ('completed', 'aborted', 'failed') then
    return jsonb_build_object('status', s.status, 'end_reason', s.end_reason, 'already_ended', true);
  end if;
  new_status := case
    when s.status = 'requested' then 'aborted'
    when p_reason in ('fertig', 'person_beendet', 'zeitlimit') then 'completed'
    when p_reason = 'technik' then 'failed'
    else 'aborted' end;
  update app.interview_sessions set status = new_status, end_reason = p_reason, ended_at = app.now(),
    covered_blocks = coalesce(p_covered_blocks, covered_blocks)
   where id = s.id;
  return jsonb_build_object('status', new_status, 'end_reason', p_reason, 'already_ended', false);
end;
$$;

revoke execute on function
  api.agent_session_context(uuid), api.agent_start_session(uuid), api.agent_mark_ai_notice(uuid, text),
  api.agent_append_turns(uuid, jsonb), api.agent_save_summary_draft(uuid, text, text[]), api.agent_save_analysis(uuid, jsonb),
  api.agent_mark_analysis(uuid, text), api.agent_flag_safety(uuid, text, text, text, integer), api.agent_record_costs(uuid, jsonb),
  api.agent_switch_mode(uuid, text), api.agent_end_session(uuid, text, text[])
  from public, anon, authenticated;
grant execute on function
  api.agent_session_context(uuid), api.agent_start_session(uuid), api.agent_mark_ai_notice(uuid, text),
  api.agent_append_turns(uuid, jsonb), api.agent_save_summary_draft(uuid, text, text[]), api.agent_save_analysis(uuid, jsonb),
  api.agent_mark_analysis(uuid, text), api.agent_flag_safety(uuid, text, text, text, integer), api.agent_record_costs(uuid, jsonb),
  api.agent_switch_mode(uuid, text), api.agent_end_session(uuid, text, text[])
  to fermata_agent, service_role;

-- ---------------------------------------------------------------------------
-- 7. Aufräumen per pg_cron: verfallene Anfragen und hängende Sitzungen
-- ---------------------------------------------------------------------------
create or replace function ops.expire_interview_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n1 integer;
  n2 integer;
begin
  update app.interview_sessions set status = 'aborted', ended_at = app.now()
   where status = 'requested' and expires_at < app.now();
  get diagnostics n1 = row_count;
  update app.interview_sessions x set status = 'failed', end_reason = 'technik', ended_at = app.now()
   where x.status = 'active' and coalesce(x.last_activity_at, x.started_at, x.created_at)
     < app.now() - make_interval(mins => app.interview_max_minutes(x.kind, x.mode, x.tier_depth) + ops.setting_int('voice.grace_minutes') + 10);
  get diagnostics n2 = row_count;
  return n1 + n2;
end;
$$;
comment on function ops.expire_interview_sessions() is 'Beendet verfallene Anfragen und hängende Sitzungen. Läuft alle 10 Minuten per pg_cron.';

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fermata-expire-interviews', '*/10 * * * *', 'select ops.expire_interview_sessions()');
  end if;
exception when others then
  raise notice 'pg_cron nicht eingerichtet: %', sqlerrm;
end
$$;

-- ---------------------------------------------------------------------------
-- 8. Rechte: PostgreSQL gibt neuen Funktionen standardmäßig EXECUTE für PUBLIC; die schema-bezogenen
--    „default privileges“ der Grundlage entfernen das nicht. Deshalb hier ausdrücklich: Nur wer oben
--    ausdrücklich berechtigt ist, darf aufrufen (Mitglieder: interview_request, interview_confirm_summary,
--    art9_categories; Agent: api.agent_*; Jobs: service_role). Die Integration ergänzt dasselbe für alle Schemas.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema app, api, ops from public;
grant execute on function ops.expire_interview_sessions(), ops.purge_transcripts() to service_role;
