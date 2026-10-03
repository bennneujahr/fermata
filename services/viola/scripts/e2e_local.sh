#!/usr/bin/env bash
# Ende-zu-Ende lokal: Test-Datenbank + Edge Functions (dev-server) + Viola-Textdienst (Attrappe als Sprachmodell).
# Ablauf: Person anlegen → interview-token (Text) → /start → Nachrichten → /end → Datenbank prüfen.
# Voraussetzung: migrierte Test-Datenbank, z. B.  DB_PORT=54352 DB_CONTAINER=fermata-db-viola bash scripts/db.sh migrate
# Aufruf aus services/viola:  bash scripts/e2e_local.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd ../.. && pwd)"

DB_PORT="${DB_PORT:-54352}"
FUNCTIONS_PORT="${FUNCTIONS_PORT:-54351}"
TEXT_PORT="${TEXT_PORT:-8354}"
DB_URL="postgres://postgres:postgres@localhost:${DB_PORT}/postgres"
JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
AGENT_SECRET="e2e-agent-secret-0123456789abcdef-0123"
TEXT_SECRET="e2e-text-secret-0123456789abcdef-012345"
PSQL=(psql -X -At -h localhost -p "$DB_PORT" -U postgres -d postgres)
export PGPASSWORD=postgres

cleanup() { kill "${FN_PID:-0}" "${TX_PID:-0}" 2>/dev/null || true; }
trap cleanup EXIT

USER_ID="$(python3 -c 'import uuid; print(uuid.uuid4())')"
"${PSQL[@]}" -q <<SQL
select tests.create_user('e2e-${USER_ID:0:8}@example.test', '${USER_ID}');
insert into app.accounts (user_id, status, address_form, tier_view) values ('${USER_ID}', 'active', 'du', 'andante');
insert into app.verifications (user_id, status, is_adult, name_match, birth_date_match) values ('${USER_ID}', 'approved', true, true, true);
insert into app.consents (user_id, kind, action, document_version) values ('${USER_ID}', 'gespraech', 'granted', 'e2e');
SQL

SUPABASE_DB_URL="$DB_URL" FERMATA_ENV=test SUPABASE_JWT_SECRET="$JWT_SECRET" INTERVIEW_AGENT_SECRET="$AGENT_SECRET" \
  VIOLA_TEXT_URL="http://localhost:${TEXT_PORT}" VIOLA_TEXT_TOKEN_SECRET="$TEXT_SECRET" FUNCTIONS_PORT="$FUNCTIONS_PORT" \
  deno run --allow-net --allow-env --allow-read --config "$ROOT/supabase/functions/deno.json" "$ROOT/supabase/functions/dev-server.ts" \
  >/tmp/viola-e2e-functions.log 2>&1 &
FN_PID=$!

VIOLA_ENV=local VIOLA_BACKEND=http INTERVIEW_AGENT_URL="http://localhost:${FUNCTIONS_PORT}/functions/v1/interview-agent" \
  INTERVIEW_AGENT_SECRET="$AGENT_SECRET" VIOLA_TEXT_TOKEN_SECRET="$TEXT_SECRET" VIOLA_TEXT_PORT="$TEXT_PORT" \
  VIOLA_LLM_PROVIDER=fake uv run viola text-server >/tmp/viola-e2e-text.log 2>&1 &
TX_PID=$!

for _ in $(seq 1 60); do
  curl -sf "http://localhost:${TEXT_PORT}/healthz" >/dev/null 2>&1 && curl -s -o /dev/null "http://localhost:${FUNCTIONS_PORT}/functions/v1/x" && break
  sleep 0.5
done

MEMBER_JWT="$(uv run python -c "
import time, jwt
now = int(time.time())
print(jwt.encode({'sub': '${USER_ID}', 'role': 'authenticated', 'aud': 'authenticated', 'iat': now, 'exp': now + 600}, '${JWT_SECRET}', algorithm='HS256'))")"

TOKEN_JSON="$(curl -sf -X POST "http://localhost:${FUNCTIONS_PORT}/functions/v1/interview-token" \
  -H "authorization: Bearer ${MEMBER_JWT}" -H 'content-type: application/json' -d '{"kind": "erstgespraech", "mode": "text"}')"
SESSION_ID="$(echo "$TOKEN_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["session"]["id"])')"
TEXT_TOKEN="$(echo "$TOKEN_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["text"]["token"])')"
BASE="http://localhost:${TEXT_PORT}/v1/text/sessions/${SESSION_ID}"
H=(-H "authorization: Bearer ${TEXT_TOKEN}" -H 'content-type: application/json')

echo "Sitzung ${SESSION_ID}"
curl -sf -X POST "${BASE}/start" "${H[@]}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Viola:", d["messages"][0]["text"])'
for msg in "Ja, gern." "Ich wandere gern an der Ostsee und koche für Freunde." "Ehrlichkeit ist mir sehr wichtig." "Ich bin übrigens sehr gläubig."; do
  echo "Person: $msg"
  curl -sf -X POST "${BASE}/messages" "${H[@]}" -d "{\"text\": \"${msg}\"}" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Viola:", " ".join(m["text"] for m in d["messages"]))'
done
curl -sf -X POST "${BASE}/end" "${H[@]}" >/dev/null
sleep 2

echo "--- Datenbank"
"${PSQL[@]}" -c "select status, end_reason, mode, ai_notice_at is not null as ki_hinweis, analysis_status, summary_status from app.interview_sessions where id = '${SESSION_ID}'"
"${PSQL[@]}" -c "select jsonb_array_length(turns) as beitraege, turns -> 0 ->> 'text' like 'Hallo. Ich bin Viola, eine künstliche Intelligenz%' as beginnt_mit_ki_hinweis, (turns::text like '%geschützte Angabe entfernt%') as art9_geschwaerzt, delete_at::date - created_at::date as tage from app.interview_transcripts where session_id = '${SESSION_ID}'"
"${PSQL[@]}" -c "select minutes, llm_input_tokens > 0 as tokens, amount_eur, details ->> 'mode' from ops.session_costs where session_id = '${SESSION_ID}'"
"${PSQL[@]}" -q -c "delete from ops.session_costs where session_id = '${SESSION_ID}'; delete from safety.safety_flags where user_id = '${USER_ID}'; delete from auth.users where id = '${USER_ID}';"
echo "fertig"
