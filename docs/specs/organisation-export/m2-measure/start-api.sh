#!/usr/bin/env bash
# Starts the BUILT API (`pnpm --filter @repo/api build`) with the event-loop sampler preloaded, on PORT,
# against the e2e database, with the global rate limit lifted so the seeder is not throttled. The
# export route keeps its own 3-per-10-minutes limit, so restart this between measured runs.
#
#   ELD_FILE=/tmp/eld.json docs/specs/organisation-export/m2-measure/start-api.sh <port>
#
# The process is its own session leader (setsid): stop it by killing that process group, never by
# pattern. Prints the pid.
set -euo pipefail
PORT="${1:?usage: start-api.sh <port>}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/../../../../apps/api"
export API_PORT="$PORT" BETTER_AUTH_URL="http://localhost:$PORT" CORS_ORIGINS="http://localhost:5173" \
  DATABASE_URL="${DATABASE_URL:-postgresql://app:app@localhost:5432/app_test?schema=public}" \
  BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-local-e2e-secret-at-least-32-characters-long}" \
  RATE_LIMIT_LIMIT=1000000 LOG_LEVEL=warn ELD_FILE="${ELD_FILE:?set ELD_FILE}"
setsid node ${NODE_FLAGS:-} --require "$HERE/eld-preload.cjs" dist/main.js > "${ELD_FILE}.api.log" 2>&1 &
echo $!
for _ in $(seq 1 60); do
  if curl -s -m 1 -o /dev/null "http://localhost:$PORT/api/v1/version"; then exit 0; fi
  sleep 1
done
echo "API did not come up; see ${ELD_FILE}.api.log" >&2
exit 1
