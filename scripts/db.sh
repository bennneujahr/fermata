#!/usr/bin/env bash
# Lokale Test-Datenbank mit dem Supabase-Postgres-Abbild (enthält auth, pgTAP, pgvector, pg_cron, Vault).
# Befehle: start | stop | reset | migrate | test [datei…] | psql
# Umgebungsvariablen: DB_PORT (Standard 54322), DB_CONTAINER (Standard fermata-db), DB_IMAGE.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_PORT="${DB_PORT:-54322}"
DB_CONTAINER="${DB_CONTAINER:-fermata-db}"
DB_IMAGE="${DB_IMAGE:-supabase/postgres:17.6.1.054}"
AUTH_IMAGE="${AUTH_IMAGE:-supabase/gotrue:v2.180.0}"
DB_PASSWORD="${DB_PASSWORD:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
export PGPASSWORD="$DB_PASSWORD"
export PGOPTIONS="${PGOPTIONS:--c client_min_messages=warning}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U postgres -d postgres)

wait_ready() {
  for _ in $(seq 1 60); do
    if "${PSQL[@]}" -Atc "select 1 from pg_roles where rolname = 'authenticated'" 2>/dev/null | grep -q 1; then
      # Die Init-Skripte des Abbilds starten Postgres einmal neu; kurz nachprüfen.
      sleep 2
      "${PSQL[@]}" -Atc "select 1" >/dev/null 2>&1 && return 0
    fi
    sleep 1
  done
  echo "Datenbank nicht erreichbar auf Port $DB_PORT" >&2
  return 1
}

start() {
  if [ -n "${DB_EXTERNAL:-}" ]; then wait_ready; return; fi
  if ! docker ps --format '{{.Names}}' | grep -qx "$DB_CONTAINER"; then
    docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
    docker run -d --name "$DB_CONTAINER" -e POSTGRES_PASSWORD="$DB_PASSWORD" -p "$DB_PORT:5432" "$DB_IMAGE" >/dev/null
    wait_ready
    auth_migrate
  fi
  wait_ready
}

# Das Auth-Schema (auth.jwt(), alle Spalten von auth.users …) legt GoTrue selbst an.
auth_migrate() {
  docker run --rm --network "container:$DB_CONTAINER" \
    -e GOTRUE_DB_DRIVER=postgres \
    -e DATABASE_URL="postgres://supabase_auth_admin:$DB_PASSWORD@localhost:5432/postgres" \
    -e GOTRUE_DB_NAMESPACE=auth -e API_EXTERNAL_URL=http://localhost:9999 -e GOTRUE_SITE_URL=http://localhost:3000 \
    -e GOTRUE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long \
    "$AUTH_IMAGE" gotrue migrate >/dev/null 2>&1 || { echo "GoTrue-Migration fehlgeschlagen" >&2; return 1; }
}

stop() { docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true; }

migrate() {

  for f in supabase/migrations/*.sql; do
    echo "→ $(basename "$f")"
    "${PSQL[@]}" -1 -f "$f"
  done
  # Testumgebung: Umgebung auf test stellen (nur als Superuser möglich) und Test-Hilfen anlegen.
  psql -X -q -v ON_ERROR_STOP=1 -h "$DB_HOST" -p "$DB_PORT" -U supabase_admin -d postgres \
    -c "update ops.deployment set environment = '${DB_ENVIRONMENT:-test}'"
  if [ -f supabase/tests/setup.sql ]; then "${PSQL[@]}" -f supabase/tests/setup.sql; fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  reset)
    if [ -n "${DB_EXTERNAL:-}" ]; then echo "reset ist mit DB_EXTERNAL nicht möglich" >&2; exit 1; fi
    stop; start; migrate ;;
  migrate) start; migrate ;;
  test)
    shift
    start
    if [ "${DB_FRESH:-1}" = "1" ] && [ -z "${DB_EXTERNAL:-}" ]; then stop; start; fi
    migrate
    node scripts/db-test.mjs "$@" ;;
  psql) shift; "${PSQL[@]}" "$@" ;;
  *) echo "Aufruf: scripts/db.sh start|stop|reset|migrate|test|psql" >&2; exit 2 ;;
esac
