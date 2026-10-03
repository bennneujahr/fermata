#!/usr/bin/env bash
# Lokaler Supabase-Ersatz für Entwicklung, E2E-Tests und Bildschirmfotos der Web-App:
# Postgres (scripts/db.sh) + GoTrue + PostgREST + Mailpit + Edge Functions (Deno) + Gateway.
# Befehle: up | down | status | env
# Ports (Bereich web): Stapel-DB 54348 (Test-DB 54342 bleibt für scripts/db.sh test), Functions 54341, GoTrue 54343, PostgREST 54344, Gateway 54345,
#                      Mailpit SMTP 54346 / HTTP 54347, Next.js 3041.
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$APP_DIR/../.." && pwd)"
STATE="$APP_DIR/.stack"
mkdir -p "$STATE"

# Eigene Datenbank für den Stapel (54348), damit `scripts/db.sh test` (54342) ihn nicht zurücksetzt.
# STACK_SLOT=N (0–9) verschiebt alle Ports um N×100 und hängt -N an die Containernamen,
# damit mehrere Arbeitskopien gleichzeitig einen Stapel betreiben können.
SLOT="${STACK_SLOT:-0}"
OFF=$((SLOT * 100))
SUFFIX=""
[ "$SLOT" = "0" ] || SUFFIX="-$SLOT"
export DB_PORT="${STACK_DB_PORT:-$((54348 + OFF))}" DB_CONTAINER="${STACK_DB_CONTAINER:-fermata-db-web-stack$SUFFIX}"
FUNCTIONS_PORT=$((54341 + OFF))
AUTH_PORT=$((54343 + OFF))
REST_PORT=$((54344 + OFF))
GATEWAY_PORT=$((54345 + OFF))
SMTP_PORT=$((54346 + OFF))
MAIL_HTTP_PORT=$((54347 + OFF))
APP_PORT=$((3041 + OFF))
AUTH_CONTAINER=fermata-auth-web$SUFFIX
REST_CONTAINER=fermata-rest-web$SUFFIX
MAIL_CONTAINER=fermata-mail-web$SUFFIX
JWT_SECRET="fermata-local-jwt-secret-with-at-least-32-characters"
DB_URL="postgres://postgres:postgres@localhost:$DB_PORT/postgres"

write_env() {
  local keys anon service
  keys="$(node "$APP_DIR/scripts/keys.mjs" "$JWT_SECRET")"
  anon="$(echo "$keys" | sed -n 's/^ANON_KEY=//p')"
  service="$(echo "$keys" | sed -n 's/^SERVICE_ROLE_KEY=//p')"
  cat >"$STATE/env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://localhost:$GATEWAY_PORT
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon
SUPABASE_URL=http://localhost:$GATEWAY_PORT
SUPABASE_ANON_KEY=$anon
SUPABASE_SERVICE_ROLE_KEY=$service
SUPABASE_DB_URL=$DB_URL
FERMATA_ENV=local
FERMATA_APP_URL=http://localhost:$APP_PORT
FERMATA_ALLOWED_ORIGINS=http://localhost:$APP_PORT
FERMATA_CONTACT_EMAIL=hallo@fermata.example
DIDIT_MODE=fake
DIDIT_WEBHOOK_SECRET=fermata-fake-didit-secret
MAILPIT_URL=http://localhost:$MAIL_HTTP_PORT
APP_PORT=$APP_PORT
ENV
}

wait_http() {
  for _ in $(seq 1 60); do
    if curl -s -o /dev/null "$1"; then return 0; fi
    sleep 1
  done
  echo "Nicht erreichbar: $1" >&2
  return 1
}

kill_pid() {
  local file="${STATE:?}/${1:?}.pid"
  if [ -f "$file" ]; then
    kill "$(cat "$file")" 2>/dev/null || true
    rm -f -- "$file"
  fi
}

up() {
  pgrep -x dockerd >/dev/null || { (nohup dockerd >/tmp/dockerd-web.log 2>&1 &); sleep 5; }
  down >/dev/null 2>&1 || true
  (cd "$ROOT" && DB_ENVIRONMENT=local bash scripts/db.sh reset >/dev/null)
  PGPASSWORD=postgres psql -X -q -h localhost -p "$DB_PORT" -U supabase_admin -d postgres \
    -c "alter role authenticator with password 'postgres'" -c "alter role supabase_auth_admin with password 'postgres'" >/dev/null
  write_env
  set -a
  # shellcheck disable=SC1091
  . "$STATE/env"
  set +a

  docker run -d --name "$MAIL_CONTAINER" --network host \
    -e MP_SMTP_BIND_ADDR="127.0.0.1:$SMTP_PORT" -e MP_UI_BIND_ADDR="127.0.0.1:$MAIL_HTTP_PORT" \
    axllent/mailpit:v1.27 >/dev/null

  docker run -d --name "$REST_CONTAINER" --network host \
    -e PGRST_DB_URI="postgres://authenticator:postgres@localhost:$DB_PORT/postgres" \
    -e PGRST_DB_SCHEMAS="public,app,billing,api" -e PGRST_DB_ANON_ROLE=anon \
    -e PGRST_DB_EXTRA_SEARCH_PATH="public,extensions" -e PGRST_JWT_SECRET="$JWT_SECRET" \
    -e PGRST_SERVER_PORT="$REST_PORT" -e PGRST_SERVER_HOST=127.0.0.1 \
    postgrest/postgrest:v13.0.7 >/dev/null

  docker run -d --name "$AUTH_CONTAINER" --network host \
    -e GOTRUE_API_HOST=127.0.0.1 -e GOTRUE_API_PORT="$AUTH_PORT" -e PORT="$AUTH_PORT" \
    -e API_EXTERNAL_URL="http://localhost:$GATEWAY_PORT/auth/v1" \
    -e GOTRUE_DB_DRIVER=postgres \
    -e DATABASE_URL="postgres://supabase_auth_admin:postgres@localhost:$DB_PORT/postgres?search_path=auth" \
    -e GOTRUE_SITE_URL="http://localhost:$APP_PORT" -e GOTRUE_URI_ALLOW_LIST="http://localhost:$APP_PORT/**" \
    -e GOTRUE_JWT_SECRET="$JWT_SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
    -e GOTRUE_JWT_ADMIN_ROLES=service_role -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated \
    -e GOTRUE_DISABLE_SIGNUP=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=false \
    -e GOTRUE_SMTP_HOST=127.0.0.1 -e GOTRUE_SMTP_PORT="$SMTP_PORT" -e GOTRUE_SMTP_USER= -e GOTRUE_SMTP_PASS= \
    -e GOTRUE_SMTP_ADMIN_EMAIL=hallo@fermata.example -e GOTRUE_SMTP_SENDER_NAME=Fermata -e GOTRUE_SMTP_MAX_FREQUENCY=1s \
    -e GOTRUE_MAILER_OTP_EXP=900 -e GOTRUE_MAILER_OTP_LENGTH=6 \
    -e GOTRUE_MAILER_SUBJECTS_MAGIC_LINK="Ihr Anmeldecode für Fermata" \
    -e GOTRUE_MAILER_TEMPLATES_MAGIC_LINK="http://localhost:$GATEWAY_PORT/templates/anmeldung.html" \
    -e GOTRUE_MAILER_SUBJECTS_INVITE="Ihre Einladung zu Fermata" \
    -e GOTRUE_MAILER_TEMPLATES_INVITE="http://localhost:$GATEWAY_PORT/templates/einladung.html" \
    -e GOTRUE_RATE_LIMIT_EMAIL_SENT=10000 -e GOTRUE_RATE_LIMIT_OTP=10000 -e GOTRUE_RATE_LIMIT_VERIFY=10000 \
    -e GOTRUE_RATE_LIMIT_TOKEN_REFRESH=10000 -e GOTRUE_RATE_LIMIT_SSO=10000 \
    -e GOTRUE_MFA_TOTP_ENROLL_ENABLED=true -e GOTRUE_MFA_TOTP_VERIFY_ENABLED=true -e GOTRUE_MFA_MAX_ENROLLED_FACTORS=10 \
    -e GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED=true -e GOTRUE_LOG_LEVEL=warn \
    supabase/gotrue:v2.180.0 auth >/dev/null

  # Eigene Sitzung (setsid), damit die Dienste das Ende des aufrufenden Terminals überleben.
  GATEWAY_PORT=$GATEWAY_PORT AUTH_PORT=$AUTH_PORT REST_PORT=$REST_PORT FUNCTIONS_PORT=$FUNCTIONS_PORT \
    setsid nohup node "$APP_DIR/scripts/gateway.mjs" >"$STATE/gateway.log" 2>&1 </dev/null &
  echo $! >"$STATE/gateway.pid"

  (
    cd "$ROOT/supabase/functions"
    FUNCTIONS_PORT=$FUNCTIONS_PORT setsid nohup deno run --allow-net --allow-env --allow-read dev-server.ts \
      >"$STATE/functions.log" 2>&1 </dev/null &
    echo $! >"$STATE/functions.pid"
  )

  wait_http "http://127.0.0.1:$AUTH_PORT/health"
  wait_http "http://127.0.0.1:$REST_PORT/"
  wait_http "http://127.0.0.1:$GATEWAY_PORT/auth/v1/health"
  wait_http "http://127.0.0.1:$MAIL_HTTP_PORT/api/v1/info"
  echo "Stapel läuft. Umgebung: $STATE/env"
}

down() {
  kill_pid gateway
  kill_pid functions
  kill_pid next
  # Sicherheitsnetz: nur eigene Prozesse (Arbeitsordner dieses Repos und Port des Bereichs web) beenden.
  for p in $(pgrep -f "dev-server.ts|gateway.mjs|next start --port $APP_PORT" || true); do
    cwd="$(readlink "/proc/$p/cwd" 2>/dev/null || true)"
    case "$cwd" in
      "$ROOT/supabase/functions" | "$APP_DIR") kill "$p" 2>/dev/null || true ;;
    esac
  done
  docker rm -f "$AUTH_CONTAINER" "$REST_CONTAINER" "$MAIL_CONTAINER" >/dev/null 2>&1 || true
  (cd "$ROOT" && bash scripts/db.sh stop)
}

status() {
  docker ps --filter "name=fermata-.*-web" --format '{{.Names}}\t{{.Status}}'
  for p in gateway functions; do
    if [ -f "$STATE/$p.pid" ]; then echo "$p: $(cat "$STATE/$p.pid")"; fi
  done
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  status) status ;;
  env)
    write_env
    cat "$STATE/env"
    ;;
  *)
    echo "Aufruf: scripts/stack.sh up|down|status|env" >&2
    exit 2
    ;;
esac
