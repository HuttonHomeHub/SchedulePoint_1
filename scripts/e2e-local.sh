#!/usr/bin/env bash
#
# Bring up a local Postgres that matches CI, migrate it, and run the e2e suites
# that a change actually needs — the step whose absence produced six avoidable
# CI failures in one afternoon (see docs/TESTING.md "Before you push").
#
# The database it creates is deliberately byte-identical in shape to the one
# `.github/workflows/ci.yml` provisions: role `app`, password `app`, database
# `app_test`. A local setup that differs from CI is worse than none, because it
# turns "passes locally, fails in CI" into a mystery rather than a signal.
#
# Usage:
#   scripts/e2e-local.sh                 # db + API e2e (the default gate)
#   scripts/e2e-local.sh api             # API Supertest e2e only
#   scripts/e2e-local.sh web             # the base Playwright journey (the shipped default)
#   scripts/e2e-local.sh web:wbs         # one flag-on Playwright suite
#   scripts/e2e-local.sh api web:wbs     # both
#   scripts/e2e-local.sh --db-only       # just bring the database up
#
# A `web:<name>` target maps to `pnpm --filter @repo/web test:e2e:<name>`.
set -euo pipefail

# Where the full log lands. Defaulted rather than opt-in: an instrument nobody has to remember to
# switch on is the only kind that is there when it is needed (#119a). Set `SP_E2E_LOG=` to disable.
SP_E2E_LOG="${SP_E2E_LOG-.e2e-logs/e2e-$(date +%Y%m%d-%H%M%S).log}"

PG_PORT="${PGPORT:-5432}"
export DATABASE_URL="${DATABASE_URL:-postgresql://app:app@localhost:${PG_PORT}/app_test?schema=public}"
# Better Auth refuses a secret under 32 chars; e2e only ever signs throwaway
# local sessions, so a fixed development value keeps the run reproducible.
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-local-e2e-secret-at-least-32-characters-long}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

# --- 0. Keep the whole log, whatever the caller did with the pipe -----------
#
# **The capture must not depend on how this was invoked** (`docs/TECH_DEBT.md` #119a).
#
# That row records the API e2e suite failing intermittently four times. Three were diagnosed; the
# fourth, on 2026-09-01, was lost — 45 tests failed in one file and the command had been piped
# through `tail -12`, so the file name and the error were discarded before anyone read them. The
# re-run passed 572/572, which is the row's own recorded signature: a run that sweeps itself clean
# before anybody looks, proving nothing.
#
# The instruction to redirect the whole log to a file was already written down, by the occurrence
# before. It was correct and it did not survive contact with someone typing the command from muscle
# memory — which is ADR-0058's rule exactly: replace the vigilance with something the machine
# carries.
#
# `tee` rather than a redirect, because the caller still wants to watch it; `SP_E2E_LOG=` opts out
# for anyone who genuinely wants the old behaviour. The `PIPESTATUS` guard below is load-bearing:
# without it a piped run always exits 0 and this script would silently stop being able to fail.
if [ -z "${SP_E2E_LOG_ACTIVE:-}" ] && [ "${SP_E2E_LOG:-}" != "" ]; then
  mkdir -p "$(dirname "$SP_E2E_LOG")"
  export SP_E2E_LOG_ACTIVE=1
  set +e
  "${BASH_SOURCE[0]}" "$@" 2>&1 | tee "$SP_E2E_LOG"
  status="${PIPESTATUS[0]}"
  set -e
  printf '\n\033[1m==> Full log: %s\033[0m\n' "$SP_E2E_LOG"
  exit "$status"
fi

log() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# --- 1. Postgres ------------------------------------------------------------
log "Postgres"
if ! pg_isready -h localhost -p "$PG_PORT" >/dev/null 2>&1; then
  # `service` needs root; on a dev box without it, start your own cluster or
  # point DATABASE_URL at one you already have.
  if [ "$(id -u)" -eq 0 ]; then service postgresql start >/dev/null; else sudo service postgresql start >/dev/null; fi
  for _ in $(seq 1 30); do
    pg_isready -h localhost -p "$PG_PORT" >/dev/null 2>&1 && break
    sleep 1
  done
fi
pg_isready -h localhost -p "$PG_PORT" >/dev/null 2>&1 || {
  echo "Postgres is not accepting connections on port ${PG_PORT}." >&2
  exit 1
}

# Idempotent: role and database are created only if absent, so re-running is
# free and an existing developer database is never clobbered.
#
# **SUPERUSER, and that is not a convenience — it is what CI has.** The `postgres:17-alpine`
# service container creates `POSTGRES_USER` as a superuser, so CI's `app` is one; this script
# created a plain `CREATEDB` role and the difference is invisible until a test depends on a
# privilege check. It did: `retention-alerting.e2e-spec.ts` induced a failure with
# `REVOKE DELETE ON csp_reports`, which passed here and did NOTHING in CI, because a superuser
# bypasses privilege checks entirely. Measured on one database: as a plain role the delete is
# refused (`permission denied for table csp_reports`); after `ALTER ROLE app SUPERUSER` the
# identical statement reports `DELETE 1`.
#
# That is precisely the failure this script's own header calls worse than having no script at
# all — "passes locally, fails in CI" turned into a mystery rather than a signal. The `ALTER`
# below also repairs an existing role created by an earlier version of this script.
as_super() { if [ "$(id -u)" -eq 0 ]; then su postgres -c "$1"; else sudo -u postgres bash -c "$1"; fi; }
as_super "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='app'\"" | grep -q 1 \
  || as_super "psql -qc \"CREATE ROLE app LOGIN PASSWORD 'app' SUPERUSER CREATEDB;\""
as_super "psql -qc \"ALTER ROLE app SUPERUSER;\"" >/dev/null
as_super "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='app_test'\"" | grep -q 1 \
  || as_super "psql -qc \"CREATE DATABASE app_test OWNER app;\""
echo "ready: ${DATABASE_URL}"

# --- 2. Schema --------------------------------------------------------------
log "Migrations"
pnpm --filter @repo/api exec prisma migrate deploy

targets=("$@")
if [ "${#targets[@]}" -eq 0 ]; then targets=("api"); fi
for t in "${targets[@]}"; do [ "$t" = "--db-only" ] && exit 0; done

# --- 3. Suites --------------------------------------------------------------
# Playwright's own `webServer` block starts the API and the dev server, so the
# only thing it needs from us is a migrated database and a browser it can find.
#
# **A dev server you already started is a silent, wrong pass or a silent, wrong FAIL.**
# Every `playwright.*.config.ts` here sets `reuseExistingServer: !process.env.CI`, and the whole
# point of these configs is the environment they hand their servers: the base journey pins
# `VITE_PLAN_EDIT_LOCK=false`, thirteen flag-on configs set `PLAN_EDIT_LOCK_ENFORCED=true`, and
# each suite pins its own `VITE_` flags. Reuse takes a server that carries somebody else's
# environment and runs the suite against it anyway, reporting nothing.
#
# On 2026-08-19 that produced three consecutive false diagnoses in one session — 7 base-journey
# failures blamed first on a palette change, then on a grid refactor, then filed as a product
# defect — when the cause each time was a leftover server from a different harness. It is
# especially deceptive because `nest start --watch` puts the environment on the CHILD process:
# the watcher's `/proc/<pid>/environ` shows nothing, so even checking looks like it cleared it.
#
# So refuse rather than warn. A run that cannot be trusted is worse than no run.
for port in 3000 5173; do
  if curl -s -o /dev/null --max-time 2 "http://localhost:${port}/" 2>/dev/null \
    || curl -s -o /dev/null --max-time 2 "http://localhost:${port}/api/v1/health" 2>/dev/null; then
    cat >&2 <<EOF

Something is already listening on localhost:${port}.

Playwright reuses it (reuseExistingServer) instead of starting one with this suite's
environment, so the flag pins in the config never apply and the result means nothing —
whichever way it goes. Stop it and re-run:

  pkill -f 'vite.js'; pkill -f 'dist/main'; pkill -f 'nest start'

(Set E2E_ALLOW_EXISTING_SERVER=1 to proceed anyway — only when you started that server
yourself with this suite's exact environment.)
EOF
    [ -n "${E2E_ALLOW_EXISTING_SERVER:-}" ] || exit 1
  fi
done

if [ -z "${PLAYWRIGHT_CHROMIUM_PATH:-}" ]; then
  candidate="$(ls -d /opt/pw-browsers/chromium-*/chrome-linux/chrome 2>/dev/null | head -1 || true)"
  [ -n "$candidate" ] && export PLAYWRIGHT_CHROMIUM_PATH="$candidate"
fi

for target in "${targets[@]}"; do
  case "$target" in
    api)
      log "API end-to-end (Supertest)"
      pnpm --filter @repo/api test:e2e
      ;;
    web)
      # **The base journey — the one covering the SHIPPED default configuration**, and until
      # 2026-08-18 the only suite this script could not run: every other target maps to
      # `test:e2e:<suite>` and the base is `test:e2e` with no suffix, so `web` was an unknown
      # target. That is how `e2e/recently-deleted.spec.ts` reached CI still asserting the screen
      # ADR-0096 had replaced — the sweep that would have caught it had nothing to run.
      #
      # Chromium only, unlike CI, which also runs firefox and webkit: neither is installed in the
      # dev container, and a local run that fails on a missing browser teaches nothing. Cross-
      # browser stays CI's job (`docs/TECH_DEBT.md` #25a).
      #
      # Worker count is left at the config's default so this matches CI. Locally that means the
      # journeys share a database other suites have already written to; if one fails on a missing
      # fixture rather than on an assertion, re-run it alone before believing it.
      log "Web end-to-end (base journey, chromium)"
      pnpm --filter @repo/web exec playwright test --project=chromium
      ;;
    web:*)
      suite="${target#web:}"
      log "Web end-to-end (${suite})"
      # **A mistyped suite must fail, not pass quietly.** `pnpm run` exits **0** when no package
      # has the script — measured: `pnpm --filter @repo/web test:e2e:does-not-exist; echo $?` prints
      # `0` — so `scripts/e2e-local.sh web:wsb` printed "Done", exited clean, and ran nothing. That
      # is this script's own header failing on itself: a run that cannot be trusted is worse than no
      # run. Found while proving the log capture below catches failures (`docs/TECH_DEBT.md` #119a).
      if ! node -e "process.exit(require('./apps/web/package.json').scripts['test:e2e:${suite}'] ? 0 : 1)"; then
        echo "No such web suite: ${suite} (no \`test:e2e:${suite}\` script in apps/web/package.json)." >&2
        echo "Available:" >&2
        node -e "console.error(Object.keys(require('./apps/web/package.json').scripts).filter((k) => k.startsWith('test:e2e')).map((k) => '  ' + k.replace(/^test:e2e:?/, 'web:') || '  web').join('\n'))" >&2
        exit 1
      fi
      pnpm --filter @repo/web "test:e2e:${suite}"
      ;;
    # **Measurement harnesses, which need the same bootstrap and were not getting it.**
    #
    # `web:<suite>` maps to `test:e2e:<suite>`, and the measure configs are `measure:<name>` — so
    # every measurement run in this repository has been launched by a hand-rolled script that
    # exported DATABASE_URL and hoped Postgres was already up. On 2026-08-25 it was not, and the
    # M0-T4 run died with `P1001` after the previous run had left the database stopped.
    #
    # That is the same class this script's own header is about: a run that cannot be trusted is
    # worse than no run. It surfaced honestly only because `clearMeasurement` deletes the JSON
    # first, so the reader saw an absent file rather than an hours-old one — which is exactly the
    # failure ADR-0099 records costing three consecutive false diagnoses in one session.
    measure:*)
      name="${target#measure:}"
      log "Measurement harness (${name})"
      pnpm --filter @repo/web "measure:${name}"
      ;;
    *)
      echo "Unknown target '${target}'. Use 'api', 'web', 'web:<suite>', 'measure:<name>', or --db-only." >&2
      exit 2
      ;;
  esac
done

log "Done"
