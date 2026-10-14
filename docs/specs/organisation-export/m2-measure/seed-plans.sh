#!/usr/bin/env bash
# Seeds one 2,000-activity scale plan into each project id given, one after another, over the public
# REST API (`schedulepoint-seed`, ADR-0066). Needs `pnpm --filter @repo/seed-cli build`.
#
#   seed-plans.sh <port> <orgSlug> <email> <projectId>…
set -uo pipefail
PORT="$1"; ORG="$2"; EMAIL="$3"; shift 3
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE/../../../.."
for project in "$@"; do
  node apps/seed-cli/dist/main.js --url "http://localhost:$PORT" --org "$ORG" --project "$project" \
    --email "$EMAIL" --password correct-horse-battery --tier scale --activities 2000 --concurrency 8
done
