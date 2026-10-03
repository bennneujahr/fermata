#!/usr/bin/env bash
# Baut die Web-App mit der Umgebung des lokalen Stapels und startet sie auf Port 3041 (für E2E und Bildschirmfotos).
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"
set -a
# shellcheck disable=SC1091
. .stack/env
set +a
if [ -f .stack/next.pid ]; then kill "$(cat .stack/next.pid)" 2>/dev/null || true; fi
if [ "${SKIP_BUILD:-0}" != "1" ]; then NEXT_TELEMETRY_DISABLED=1 pnpm build >.stack/build.log 2>&1 || { tail -40 .stack/build.log; exit 1; }; fi
setsid nohup pnpm exec next start --port 3041 >.stack/next.log 2>&1 </dev/null &
echo $! >.stack/next.pid
for _ in $(seq 1 30); do curl -s -o /dev/null http://localhost:3041/anmelden && break; sleep 1; done
echo "Web-App läuft auf http://localhost:3041"
