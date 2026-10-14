#!/usr/bin/env bash
# shellcheck disable=SC2030,SC2031
# (Per-call overrides — PGPORT, PGDATABASE, BACKUP_* — are exported inside a subshell on purpose, so they
# cannot leak into the next case; that is exactly what those two codes flag.)
#
# Prove that a backup of THIS database restores identically, and that the shipped backup script
# decides correctly (docs/specs/database-backup/feature-spec.md §4.7 step 1; ADR-0192 D5).
#
# It runs the SHIPPED script, `apps/api/backup/schedulepoint-backup.sh`, never a copy of its logic:
# inside `postgres:17-alpine` when Docker is available (the same busybox userland and PostgreSQL 17
# tools the API image has), otherwise with local client tools at least as new as the server (the
# script refuses a client older than the server). Neither available: refuse, say so.
# `BACKUP_CHECK_TOOLS=local` forces the local tools. **Linux only**: the Docker path uses `--network host`
# to reach the database on localhost, which Docker Desktop (macOS, Windows) does not provide — use
# `BACKUP_CHECK_TOOLS=local` there.
#
# What it asserts, against the database `DATABASE_URL` names — which must already hold real data
# (CI: after the API e2e suite and the pairwise differential; locally: run `scripts/e2e-local.sh api`
# first, or `scripts/e2e-local.sh api backup`):
#   1. a `now` copy restores into a scratch database IDENTICAL to the source: per-table row count and
#      content checksum, trigger definitions and enabled state, function bodies, extensions, and the
#      DEFINITION of every index and constraint (not their counts), plus table ACLs;
#   2. the audit log still refuses an UPDATE (SQLSTATE 0A000) in the restored database;
#   3. `prisma migrate deploy` and `prisma:check-drift` are clean against the restored database;
#   4. the comparison is not vacuous (sixteen tables non-empty, _prisma_migrations = migration folders;
#      the tables still empty are listed) and CAN fail (an altered row, a deleted row, a disabled
#      trigger and an extra index must each be reported — ADR-0110);
#   5. `pre-migrate` decides correctly in each branch (spec §4.12): not enabled, fresh, none pending,
#      taken, held on an unwritable folder, held on an unreachable database, held on a full disk;
#   6. pruning, the status file, `health`, `list`, and every refusal `check` and `restore` make;
#      and a real `restore` swaps in a copy identical to the source and keeps the old database.
#
# The script's exit status is the only result. It creates and drops databases named bkt_*/…_check_*/
# …_restoring and temporary folders; it never writes to the source database.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script_src="$repo_root/apps/api/backup/schedulepoint-backup.sh"
real_migrations="$repo_root/apps/api/prisma/migrations"
IMAGE="${BACKUP_CHECK_IMAGE:-postgres:17-alpine}"

: "${DATABASE_URL:?DATABASE_URL must name the database to prove}"
re='^postgres(ql)?://([^:]+):([^@]*)@([^:/]+):?([0-9]*)/([^?]+)'
[[ "$DATABASE_URL" =~ $re ]] || { echo "Cannot read DATABASE_URL (expected postgresql://user:pass@host:port/db)." >&2; exit 1; }
export PGUSER="${BASH_REMATCH[2]}" PGPASSWORD="${BASH_REMATCH[3]}" PGHOST="${BASH_REMATCH[4]}"
export PGPORT="${BASH_REMATCH[5]:-5432}" PGDATABASE="${BASH_REMATCH[6]}"
# `DROP DATABASE IF EXISTS` and friends are chatty; a warning is all this needs to hear.
export PGOPTIONS="-c client_min_messages=warning"
SRC_DB="$PGDATABASE"

if [ "${BACKUP_CHECK_TOOLS:-}" != local ] && docker info >/dev/null 2>&1; then
  TOOLS=docker
elif command -v psql >/dev/null && command -v pg_dump >/dev/null && command -v pg_restore >/dev/null; then
  TOOLS=local
else
  echo "Neither Docker nor local PostgreSQL client tools (psql, pg_dump, pg_restore) are available." >&2
  echo "Install one of them; this check will not pass without running the shipped script." >&2
  exit 1
fi
echo "==> tools: $TOOLS$([ "$TOOLS" = docker ] && echo " ($IMAGE)")"

work="$(mktemp -d)"
chmod 755 "$work"
cp "$script_src" "$work/schedulepoint-backup.sh"
chmod 755 "$work/schedulepoint-backup.sh"
declare -a MADE_DBS=()
HOLD_ID=""

cleanup() {
  release_connection || true
  for d in "${MADE_DBS[@]:-}"; do
    [ -n "$d" ] && pgtool psql -X -q -d postgres -c "DROP DATABASE IF EXISTS \"$d\" WITH (FORCE)" >/dev/null 2>&1 || true
  done
  rm -rf "$work"
}
trap cleanup EXIT

# --- plumbing ----------------------------------------------------------------

# pgtool <tool> <args…> — a PostgreSQL client tool from the same place the shipped script uses.
pgtool() {
  if [ "$TOOLS" = docker ]; then
    docker run --rm -i --network host --user "$(id -u):$(id -g)" \
      -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGOPTIONS "$IMAGE" "$@"
  else
    "$@"
  fi
}

dbq() { # <database> <sql> — one value per line
  # Never default the database: an empty name would run the statement on PGDATABASE, the SOURCE.
  : "${1:?dbq needs a database name}"
  pgtool psql -X -q -At -v ON_ERROR_STOP=1 -d "$1" -c "$2"
}

# bk <args…> — the shipped script. Honours: BK_DIR (the folder; empty = not mounted), BK_RO=1 (the folder
# cannot be written), BK_MIGS (the migrations folder the script compares with). Per-call overrides are
# environment variables set in a subshell (PGPORT, PGDATABASE, BACKUP_KEEP_DAYS, BACKUP_MIN_FREE_KB).
BK_DIR=""
BK_RO=0
BK_MIGS="$real_migrations"
bk() {
  if [ "$TOOLS" = docker ]; then
    local -a a=(run --rm -i --network host --user "$(id -u):$(id -g)"
      -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGDATABASE -e PGOPTIONS -e BACKUP_KEEP_DAYS -e BACKUP_MIN_FREE_KB -e BACKUP_SCHEDULE_ITERATIONS -e BACKUP_POLL_SECONDS -e BACKUP_NOW -e DATABASE_URL
      -v "$work/schedulepoint-backup.sh:/app/backup/schedulepoint-backup.sh:ro"
      -v "$BK_MIGS:/app/prisma/migrations:ro")
    if [ -n "$BK_DIR" ]; then
      if [ "$BK_RO" = 1 ]; then a+=(-v "$BK_DIR:/backups:ro"); else a+=(-v "$BK_DIR:/backups"); fi
    fi
    docker "${a[@]}" "$IMAGE" sh /app/backup/schedulepoint-backup.sh "$@"
  else
    local root="${BK_DIR:-/nonexistent-backups}"
    local -a runner=(env)
    if [ "$BK_RO" = 1 ] && [ -n "$BK_DIR" ]; then
      if [ "$(id -u)" -eq 0 ]; then
        # Root ignores a mode, so drop to an unprivileged user — who must still be able to enter and
        # read the folder, or the failure would be "cannot enter" rather than "cannot write".
        chmod 755 "$BK_DIR"
        runner=(setpriv --reuid=65534 --regid=65534 --clear-groups env)
      else
        chmod 500 "$BK_DIR"
      fi
    fi
    # BACKUP_CHECK_PATH_PREFIX puts another userland (for example a busybox applet directory) ahead of
    # the host's for the script only, to run it as the Alpine image would without Docker.
    local rc=0
    "${runner[@]}" PATH="${BACKUP_CHECK_PATH_PREFIX:+$BACKUP_CHECK_PATH_PREFIX:}$PATH" \
      BACKUP_ROOT="$root" MIGRATIONS_DIR="$BK_MIGS" sh "$work/schedulepoint-backup.sh" "$@" || rc=$?
    [ "$BK_RO" = 1 ] && [ -n "$BK_DIR" ] && chmod 700 "$BK_DIR"
    return "$rc"
  fi
}

# newdir — a fresh backups folder, mode 700 (and 755 above when an unprivileged user must enter it).
newdir() {
  local d
  d="$(mktemp -d "$work/bk.XXXXXX")"
  chmod 700 "$d"
  printf '%s' "$d"
}

pass=0
failed=0
OUT=""
RC=0
ok() { pass=$((pass + 1)); printf '  ok   %s\n' "$1"; }
bad() { failed=$((failed + 1)); printf '  FAIL %s\n' "$1"; }
expect() { # <description> <condition…>
  local d="$1"
  shift
  if "$@"; then
    ok "$d"
  else
    bad "$d"
    # The last output the shipped script produced, so a red step in CI explains itself.
    [ -z "$OUT" ] || printf '%s\n' "$OUT" | head -25 | sed 's/^/         | /'
  fi
}
contains() { grep -qF -- "$2" <<<"$1"; }
out_has() { local n; for n in "$@"; do contains "$OUT" "$n" || return 1; done; }
failed_with() { [ "$RC" -ne 0 ] && out_has "$@"; }
succeeded_with() { [ "$RC" -eq 0 ] && out_has "$@"; }
same_file() { diff -q "$1" "$2" >/dev/null; }
differs() { ! same_file "$1" "$2"; }
# Names of the files in a folder matching an extended regex — a glob, not `ls | grep`.
files_matching() {
  local f
  for f in "$1"/*; do
    [ -e "$f" ] || continue
    [[ "${f##*/}" =~ $2 ]] && printf '%s\n' "${f##*/}"
  done
  return 0
}

# run_bk — run the script capturing output and status without letting `set -e` stop the harness.
run_bk() {
  OUT=""
  RC=0
  OUT="$(bk "$@" 2>&1)" || RC=$?
}

make_db() {
  MADE_DBS+=("$1")
  dbq postgres "DROP DATABASE IF EXISTS \"$1\" WITH (FORCE)" >/dev/null
  dbq postgres "CREATE DATABASE \"$1\"" >/dev/null
}

HOLD_DB=""
hold_connection() { # <database> — an idle-but-connected session, until release_connection
  HOLD_DB="$1"
  if [ "$TOOLS" = docker ]; then
    HOLD_ID="$(docker run -d --rm --network host -e PGHOST -e PGPORT -e PGUSER -e PGPASSWORD -e PGOPTIONS "$IMAGE" \
      psql -X -q -d "$1" -c 'SELECT pg_sleep(300)')"
  else
    psql -X -q -d "$1" -c 'SELECT pg_sleep(300)' >/dev/null 2>&1 &
    HOLD_ID=$!
  fi
  for _ in $(seq 1 20); do
    [ "$(dbq postgres "SELECT count(*) FROM pg_stat_activity WHERE datname='$1' AND backend_type='client backend'")" -ge 1 ] && return 0
    sleep 0.5
  done
  echo "Could not hold a connection to $1 open (waited 10 s); the restore-refusal case cannot be set up." >&2
  exit 1
}
release_connection() {
  [ -n "$HOLD_ID" ] || return 0
  if [ "$TOOLS" = docker ]; then docker rm -f "$HOLD_ID" >/dev/null 2>&1 || true; else kill "$HOLD_ID" 2>/dev/null || true; fi
  HOLD_ID=""
  # Killing the client does not end its backend: it sits in pg_sleep until it finishes, still counted
  # as a connection. End it on the server.
  dbq postgres "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = '$HOLD_DB' AND backend_type = 'client backend' AND pid <> pg_backend_pid()" >/dev/null 2>&1 || true
  sleep 1
}

# fingerprint <database> — everything the restore must reproduce, as comparable text.
fingerprint() {
  # An empty name would connect to PGDATABASE — the source — and compare it with itself.
  : "${1:?fingerprint needs a database name}"
  pgtool psql -X -q -At -v ON_ERROR_STOP=1 -d "$1" -f - <<'SQL'
SELECT '## tables (name|rows|content checksum)';
SELECT string_agg(
  format('SELECT %L AS t, count(*) AS n, coalesce(md5(string_agg(md5(zz_row::text), %L ORDER BY md5(zz_row::text))), %L) AS h FROM public.%I zz_row',
         c.relname, '', '', c.relname),
  E' UNION ALL ' ORDER BY c.relname) || ' ORDER BY 1'
FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p')
\gexec
-- Reserved: the schema has no sequences today (every key is a client-generated id). If one is ever
-- added, this section is what carries its position through the round trip.
SELECT '## sequences';
SELECT sequencename || '=' || coalesce(last_value::text, 'unused') FROM pg_sequences WHERE schemaname = 'public' ORDER BY 1;
SELECT '## triggers (definition and enabled state)';
SELECT c.relname || '.' || t.tgname || '=' || t.tgenabled::text || ' ' || pg_get_triggerdef(t.oid) FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE NOT t.tgisinternal AND c.relnamespace = 'public'::regnamespace ORDER BY 1;
SELECT '## functions (name, md5 of source — the audit trigger function lives here)';
SELECT p.proname || '=' || md5(p.prosrc) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace ORDER BY 1;
SELECT '## extensions';
SELECT extname || ' ' || extversion FROM pg_extension ORDER BY 1;
SELECT '## index definitions';
SELECT tablename || '|' || indexname || '|' || indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1;
SELECT '## constraint definitions';
SELECT conrelid::regclass::text || '|' || conname || '|' || pg_get_constraintdef(oid) FROM pg_constraint
  WHERE connamespace = 'public'::regnamespace AND conrelid <> 0 ORDER BY 1;
-- ACLs are compared (not just restored) because the round trip restores with --no-privileges, so it
-- would silently drop a GRANT. None exist today; the day a migration adds one this section goes red,
-- which is the prompt to decide between keeping --no-privileges and dropping it, not a bug.
SELECT '## table ACLs';
SELECT c.relname || '=' || coalesce(c.relacl::text, '') FROM pg_class c
  WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'S', 'v') ORDER BY 1;
SQL
}

deploy_clean() { [ "$1" -eq 0 ] && contains "$2" "No pending migrations to apply"; }
# Captured first: `diff | grep -q` under pipefail reports a SIGPIPE as "no difference".
trigger_difference() {
  local d
  d="$(diff "$1" "$2" || true)"
  grep -q "trg_audit_events_append_only" <<<"$d"
}
target_unchanged() { fingerprint "$1" >"$work/fp.now.$1" && same_file "$work/fp.target-before" "$work/fp.now.$1"; }
present() { grep -Eq -- "$1" <<<"$2"; }
absent() { ! present "$1" "$2"; }
all_present() { local l="$1" r; shift; for r in "$@"; do present "$r" "$l" || return 1; done; }

redacted_only() { contains "$OUT" "[redacted]" && ! contains "$OUT" s3cr3t; }
no_secret() { ! grep -rq "s3cr3t" "$1" && ! contains "$OUT" s3cr3t; }
same_as_source() { # <database> — 0 when its fingerprint equals the source's
  fingerprint "$1" >"$work/fp.$1" && diff -q "$work/fp.source" "$work/fp.$1" >/dev/null
}

# --- 0. the source must be real data, quiet, and fully migrated ---------------

echo "==> source database: $SRC_DB"
others="$(dbq postgres "SELECT count(*) FROM pg_stat_activity WHERE datname='$SRC_DB' AND backend_type='client backend' AND pid <> pg_backend_pid()")"
[ "$others" -eq 0 ] || { echo "Something else is connected to $SRC_DB ($others sessions); the comparison needs a quiet database." >&2; exit 1; }

# A run killed half-way (a cancelled job, a Ctrl-C) leaves scratch databases behind; clear ours, and only
# ours, by name: bkt_* and <source>_check_<n> / <source>_restoring.
for d in $(dbq postgres "SELECT datname FROM pg_database WHERE datname LIKE 'bkt\\_%' OR datname ~ '^${SRC_DB}_(check_[0-9]+|restoring)$'"); do
  dbq postgres "DROP DATABASE IF EXISTS \"$d\" WITH (FORCE)" >/dev/null
done

for t in organizations users plans activities dependencies calendars calendar_shifts baselines audit_events \
  notes plan_shares calendar_exceptions activity_steps resources resource_assignments baseline_activities; do
  n="$(dbq "$SRC_DB" "SELECT count(*) FROM public.$t")"
  [ "$n" -gt 0 ] || { echo "Non-vacuity: $t is empty in $SRC_DB. The backup fixture must run first (scripts/e2e-local.sh backup)." >&2; exit 1; }
done
# Informational: the comparison says nothing about a table with no rows in it.
empty="$(dbq "$SRC_DB" "SELECT string_agg(relname, ' ' ORDER BY relname) FROM pg_class
  WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
    AND (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM public.%I', relname), false, true, '')))[1]::text::int = 0")"
echo "    tables still empty (not covered by the content comparison): ${empty:-none}"
want="$(find "$real_migrations" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
have="$(dbq "$SRC_DB" "SELECT count(*) FROM _prisma_migrations")"
[ "$want" = "$have" ] || { echo "Non-vacuity: _prisma_migrations has $have rows, the repository has $want migrations." >&2; exit 1; }
ok "the source is real: sixteen tables non-empty, $have migrations applied"

fingerprint "$SRC_DB" >"$work/fp.source"

# --- 1. the round trip -------------------------------------------------------

echo "==> round trip"
MAIN="$(newdir)"
BK_DIR="$MAIN"
run_bk now
expect "now succeeds" test "$RC" -eq 0
expect "now names the copy" contains "$OUT" "BACKUP FINISHED: schedulepoint-"
COPY="$(files_matching "$MAIN" '^schedulepoint-2.*\.dump$' | head -1)"
expect "the copy and its checksum are in the folder" test -f "$MAIN/$COPY" -a -f "$MAIN/$COPY.sha256"
expect "no .partial is left behind" test -z "$(files_matching "$MAIN" '\.partial$')"
expect "the status file says OK" grep -q '^OK — last backup' "$MAIN/LAST-BACKUP.txt"
expect "files are mode 600" test "$(stat -c %a "$MAIN/$COPY")" = 600

run_bk check "$COPY" --keep
expect "check passes" test "$RC" -eq 0
expect "check ends with CHECK PASSED" test "$(printf '%s\n' "$OUT" | tail -1)" = "CHECK PASSED"
RESTORED="$(printf '%s\n' "$OUT" | awk '/^Scratch database kept: /{print $4}')"
expect "check left a scratch database to examine" test -n "$RESTORED"
[ -n "$RESTORED" ] || { echo "No scratch database to examine; stopping before anything touches the source." >&2; exit 1; }
MADE_DBS+=("$RESTORED")

fingerprint "$RESTORED" >"$work/fp.restored"
if diff "$work/fp.source" "$work/fp.restored" >"$work/fp.diff"; then
  ok "the restored database is identical to the source (rows, checksums, sequences, triggers, extensions, indexes, constraints)"
else
  bad "the restored database differs from the source:"
  head -40 "$work/fp.diff"
fi
expect "the audit triggers are still ENABLE ALWAYS" grep -q 'audit_events.trg_audit_events_append_only=A' "$work/fp.restored"

audit_out="$(pgtool psql -X -q -At -d "$RESTORED" -c '\set VERBOSITY verbose' -c 'UPDATE audit_events SET id = id' 2>&1 || true)"
expect "an UPDATE on the restored audit log is refused with 0A000" contains "$audit_out" "0A000"

restored_url="postgresql://$PGUSER:$PGPASSWORD@$PGHOST:$PGPORT/$RESTORED?schema=public"
deploy_out="$(cd "$repo_root" && DATABASE_URL="$restored_url" pnpm --filter @repo/api exec prisma migrate deploy 2>&1)" \
  && deploy_rc=0 || deploy_rc=$?
expect "prisma migrate deploy on the restored database finds nothing pending" \
  deploy_clean "$deploy_rc" "$deploy_out"
if (cd "$repo_root" && DATABASE_URL="$restored_url" pnpm --filter @repo/api prisma:check-drift >/dev/null 2>&1); then
  ok "prisma:check-drift is clean against the restored database"
else
  bad "prisma:check-drift reports drift against the restored database"
fi

# The comparison must be able to fail (ADR-0110): alter one row, then disable one trigger.
dbq "$RESTORED" "UPDATE organizations SET name = name || ' (altered)' WHERE id = (SELECT id FROM organizations ORDER BY id LIMIT 1)" >/dev/null
fingerprint "$RESTORED" >"$work/fp.altered"
expect "negative control: one altered row is caught" differs "$work/fp.source" "$work/fp.altered"
dbq "$RESTORED" "ALTER TABLE audit_events DISABLE TRIGGER trg_audit_events_append_only" >/dev/null
fingerprint "$RESTORED" >"$work/fp.disabled"
expect "negative control: one disabled trigger is caught" \
  trigger_difference "$work/fp.altered" "$work/fp.disabled"
dbq "$RESTORED" "DELETE FROM notes WHERE id = (SELECT id FROM notes ORDER BY id LIMIT 1)" >/dev/null
fingerprint "$RESTORED" >"$work/fp.deleted"
expect "negative control: one deleted row is caught" differs "$work/fp.disabled" "$work/fp.deleted"
dbq "$RESTORED" "CREATE INDEX zz_probe_idx ON organizations (slug)" >/dev/null
fingerprint "$RESTORED" >"$work/fp.indexed"
expect "negative control: an extra index is caught (definitions are compared)" differs "$work/fp.deleted" "$work/fp.indexed"

# --- 2. the refusals check and restore make ---------------------------------

echo "==> check and restore refusals"
run_bk check not-a-copy.dump
expect "check refuses a name that is not a copy" test "$RC" -ne 0
run_bk check /etc/passwd
expect "check refuses a path" test "$RC" -ne 0

DMG="$(newdir)"
cp "$MAIN/$COPY" "$MAIN/$COPY.sha256" "$DMG/"
printf 'x' | dd of="$DMG/$COPY" bs=1 seek=200 conv=notrunc 2>/dev/null
BK_DIR="$DMG"
run_bk check "$COPY"
expect "check refuses a damaged copy" failed_with "CHECK FAILED: the file is damaged"
rm -f "$DMG/$COPY.sha256"
run_bk check "$COPY"
expect "check refuses a copy with no checksum file" failed_with "CHECK FAILED"

UNREADABLE="$(newdir)"
printf 'this is not a database copy\n' >"$UNREADABLE/schedulepoint-2026-01-01T0200Z.dump"
(cd "$UNREADABLE" && sha256sum schedulepoint-2026-01-01T0200Z.dump >schedulepoint-2026-01-01T0200Z.dump.sha256)
BK_DIR="$UNREADABLE"
run_bk check schedulepoint-2026-01-01T0200Z.dump
expect "check refuses a copy whose checksum is right but pg_restore cannot read it" \
  failed_with "CHECK FAILED" "cannot be read"

OLDER="$work/migs-older"
cp -r "$real_migrations" "$OLDER"
newest_migration="$(files_matching "$real_migrations" '^[0-9]+_' | sort | tail -1)"
rm -rf "${OLDER:?}/${newest_migration:?}"
BK_DIR="$MAIN"
BK_MIGS="$OLDER"
run_bk check "$COPY"
expect "check refuses a copy newer than the installed version" failed_with "newer version"

# A restore target that is not the source: a scratch copy, so the real database is never at risk.
TARGET="bkt_restore_$$"
make_db "$TARGET"
pgtool pg_restore --no-owner --no-privileges --exit-on-error -d "$TARGET" <"$MAIN/$COPY"
dbq "$TARGET" "UPDATE organizations SET name = name || ' (tampered)' WHERE id = (SELECT id FROM organizations ORDER BY id LIMIT 1)" >/dev/null
fingerprint "$TARGET" >"$work/fp.target-before"
BK_MIGS="$OLDER"
run_bk_t() { OUT=""; RC=0; OUT="$( (export PGDATABASE="$TARGET"; "$@") 2>&1)" || RC=$?; }
run_bk_t bk restore "$COPY" --yes
expect "restore refuses a copy newer than the installed version" failed_with "newer version"
BK_MIGS="$real_migrations"
expect "...and changed nothing" target_unchanged "$TARGET"
expect "...and left no half-loaded database" test "$(dbq postgres "SELECT count(*) FROM pg_database WHERE datname='${TARGET}_restoring'")" = 0

hold_connection "$TARGET"
run_bk_t bk restore "$COPY" --yes
release_connection
expect "restore refuses while something is connected" failed_with "still connected"

OUT="$( (export PGDATABASE="$TARGET"; printf 'nope\n' | bk restore "$COPY") 2>&1)" && RC=0 || RC=$?
expect "restore refuses without RESTORE typed" failed_with "RESTORE REFUSED"
expect "...and changed nothing" target_unchanged "$TARGET"

OUT="$( (export PGDATABASE="$TARGET"; printf 'RESTORE\n' | bk restore "$COPY") 2>&1)" && RC=0 || RC=$?
expect "restore succeeds when RESTORE is typed" succeeded_with "RESTORE FINISHED"
KEPT="$(dbq postgres "SELECT datname FROM pg_database WHERE datname LIKE '${TARGET}_before_restore_%'")"
[ -z "$KEPT" ] || MADE_DBS+=("$KEPT")
expect "the restored database is identical to the copy's source" same_as_source "$TARGET"
expect "the database from before the restore is kept" test -n "$KEPT"
expect "...and it is the tampered one, untouched" \
  target_unchanged "$KEPT"
expect "a safety copy was taken first" test -n "$(files_matching "$MAIN" '^schedulepoint-pre-restore-.*\.dump$')"

# --- 3. health, list, validation, status, pruning ----------------------------

echo "==> health, list, settings, pruning"
BK_DIR="$MAIN"
run_bk health
expect "health: healthy after a copy" test "$RC" -eq 0
run_bk list
expect "list shows the copy and labels the safety copy" out_has "$COPY" "before a restore"

EMPTY="$(newdir)"
BK_DIR="$EMPTY"
run_bk health
expect "health: unhealthy with no copy" test "$RC" -ne 0
for v in 0 abc 3651 -5 007; do
  RC=0
  OUT="$( (export BACKUP_KEEP_DAYS="$v"; bk now) 2>&1)" || RC=$?
  expect "BACKUP_KEEP_DAYS=$v is refused, naming the setting" failed_with "BACKUP_KEEP_DAYS"
done
expect "...and nothing was written" test -z "$(ls -A "$EMPTY")"

# The loop, on an injected clock so both sides of 02:00 UTC are exercised on every run: the first poll
# takes a copy at once when there is none, a stale .partial is cleared at start, and a night is due only
# from 02:00 UTC and only when no copy carries today's date.
nightly_count() { files_matching "$1" '^schedulepoint-2.*\.dump$' | grep -c . || true; }
T_BEFORE="$(date -u -d '2026-10-14 01:30:00' +%s)"
T_AFTER="$(date -u -d '2026-10-14 03:00:00' +%s)"
schedule_once() { # <BACKUP_NOW> — one poll of the loop
  RC=0
  OUT="$( (export BACKUP_SCHEDULE_ITERATIONS=1 BACKUP_NOW="$1"; bk schedule) 2>&1)" || RC=$?
}
SCHED="$(newdir)"
BK_DIR="$SCHED"
touch "$SCHED/schedulepoint-2026-01-01T0200Z.dump.partial"
schedule_once "$T_BEFORE"
expect "schedule: with no copy at all, the first poll takes one at once, even before 02:00" \
  succeeded_with "backup.started" "backup.succeeded"
expect "schedule: a stale .partial is removed at start" test ! -e "$SCHED/schedulepoint-2026-01-01T0200Z.dump.partial"
expect "schedule: exactly one copy, dated by the injected clock" test -f "$SCHED/schedulepoint-2026-10-14T0130Z.dump"
schedule_once "$T_AFTER"
expect "schedule: a copy dated today means no second one, even after 02:00" test "$(nightly_count "$SCHED")" -eq 1
YEST="$(newdir)"
BK_DIR="$YEST"
touch "$YEST/schedulepoint-2026-10-13T0200Z.dump"
schedule_once "$T_BEFORE"
expect "schedule: yesterday's copy only, before 02:00 UTC: not yet due" test "$(nightly_count "$YEST")" -eq 1
schedule_once "$T_AFTER"
expect "schedule: yesterday's copy only, after 02:00 UTC: the night is taken" test "$(nightly_count "$YEST")" -eq 2
BACKOFF="$(newdir)"
BK_DIR="$BACKOFF"
RC=0
OUT="$( (export BACKUP_SCHEDULE_ITERATIONS=3 BACKUP_POLL_SECONDS=1 BACKUP_NOW="$T_AFTER" PGPORT=1; bk schedule) 2>&1)" || RC=$?
expect "schedule: after a failed night it does not retry on the next poll (backoff)" \
  test "$(grep -c 'backup.failed' <<<"$OUT")" -eq 1
BK_DIR="$MAIN"
run_bk check
expect "check with no file argument checks the newest copy" succeeded_with "CHECK PASSED"

OPEN="$(newdir)"
chmod 755 "$OPEN"
BK_DIR="$OPEN"
run_bk now
expect "a group/world-accessible folder still gets its copy" succeeded_with "BACKUP FINISHED"
expect "...with a warning in the log" out_has "backup.folder_permissions"
expect "...and a warning line in LAST-BACKUP.txt" grep -q 'WARNING: the backups folder is accessible' "$OPEN/LAST-BACKUP.txt"

PRUNE="$(newdir)"
old() { touch -d "$1 days ago" "$PRUNE/$2"; }
for f in schedulepoint-2026-01-01T0200Z.dump schedulepoint-2026-01-02T0200Z.dump schedulepoint-pre-migrate-2026-01-01T0300Z.dump \
  schedulepoint-pre-migrate-2026-01-05T0300Z.dump schedulepoint-pre-restore-2026-01-03T0400Z.dump; do
  old 90 "$f"; old 90 "$f.sha256"
done
for f in notes.txt schedulepoint-2026-01-01.txt other.dump schedulepoint-2026-01-01T0200Z.dump.partial-not-ours; do old 90 "$f"; done
BK_DIR="$PRUNE"
RC=0
OUT="$( (export PGPORT=1; bk now) 2>&1)" || RC=$?
expect "a failed copy exits non-zero and says FAILED" failed_with "BACKUP FAILED"
expect "a failed copy writes FAILED to the status file" grep -q '^FAILED — ' "$PRUNE/LAST-BACKUP.txt"
expect "a failed night deletes nothing" test "$(files_matching "$PRUNE" '^schedulepoint-' | grep -c .)" -ge 10
run_bk now
expect "a good copy succeeds" test "$RC" -eq 0
left="$(files_matching "$PRUNE" '.')"
expect "prune: old nightly copies are removed" absent '^schedulepoint-2026-01-0[12]T0200Z\.dump$' "$left"
expect "prune: their checksums go with them" absent '^schedulepoint-2026-01-01T0200Z\.dump\.sha256$' "$left"
expect "prune: the older pre-update copy is removed" absent 'pre-migrate-2026-01-01T0300Z\.dump$' "$left"
expect "prune: the NEWEST pre-update copy is never removed" present 'pre-migrate-2026-01-05T0300Z\.dump$' "$left"
expect "prune: the newest safety copy is never removed" present 'pre-restore-2026-01-03T0400Z\.dump$' "$left"
expect "prune: files outside the name pattern are never touched" \
  all_present "$left" '^notes\.txt$' '^other\.dump$' '^schedulepoint-2026-01-01\.txt$'
expect "prune: only the new nightly copy is left" test "$(files_matching "$PRUNE" '^schedulepoint-2.*\.dump$' | grep -c .)" -eq 1

# --- 4. pre-migrate: the decision table (spec §4.12) -------------------------

echo "==> pre-migrate decisions"
EXTRA="$work/migs-extra"
cp -r "$real_migrations" "$EXTRA"
mkdir "$EXTRA/99999999999999_ci_pending_probe"
echo 'SELECT 1;' >"$EXTRA/99999999999999_ci_pending_probe/migration.sql"
chmod -R a+rX "$EXTRA" "$OLDER"
migrations_before="$(dbq "$SRC_DB" "SELECT count(*) FROM _prisma_migrations")"

BK_MIGS="$real_migrations"
BK_DIR=""
run_bk pre-migrate
expect "not enabled: exits 0 and says why" succeeded_with "\"reason\":\"not_enabled\""
expect "...at warn level, so a lost mount shows in the API's log" out_has '"level":"warn"'
RC=0
OUT="$( (export PGDATABASE='not-a-valid-name'; bk pre-migrate) 2>&1)" || RC=$?
expect "...decided before the connection is validated, so a server that never opted in still updates" \
  succeeded_with "\"reason\":\"not_enabled\""

FRESH="bkt_fresh_$$"
make_db "$FRESH"
BK_DIR="$(newdir)"
RC=0
OUT="$( (export PGDATABASE="$FRESH"; bk pre-migrate) 2>&1)" || RC=$?
expect "fresh (no migrations table): skipped" succeeded_with "\"reason\":\"fresh\""
dbq "$FRESH" "CREATE TABLE _prisma_migrations (migration_name text, finished_at timestamptz, rolled_back_at timestamptz)" >/dev/null
RC=0
OUT="$( (export PGDATABASE="$FRESH"; bk pre-migrate) 2>&1)" || RC=$?
expect "fresh (empty migrations table): skipped" succeeded_with "\"reason\":\"fresh\""
expect "fresh: no copy was written" test -z "$(ls -A "$BK_DIR")"

BK_DIR="$(newdir)"
run_bk pre-migrate
expect "none pending: skipped" succeeded_with "\"reason\":\"none_pending\""
expect "none pending: no copy was written" test -z "$(ls -A "$BK_DIR")"

# The API container has no PG* variables; it has Prisma's DATABASE_URL, query string and all.
RC=0
OUT="$( (unset PGHOST PGUSER PGPASSWORD PGPORT PGDATABASE; export DATABASE_URL; bk pre-migrate) 2>&1)" || RC=$?
expect "DATABASE_URL (with Prisma's ?schema=public) is understood: none pending" \
  succeeded_with "\"reason\":\"none_pending\""

url_pre_migrate() { # <url> — pre-migrate connecting ONLY through this DATABASE_URL
  RC=0
  OUT="$( (unset PGHOST PGUSER PGPASSWORD PGPORT PGDATABASE; export DATABASE_URL="$1"; bk pre-migrate) 2>&1)" || RC=$?
}
base_url="postgresql://$PGUSER:%61pp@$PGHOST:$PGPORT/$SRC_DB"
url_pre_migrate "$base_url?schema=public&sslmode=disable"
expect "DATABASE_URL: a percent-encoded password and sslmode=disable are understood" \
  succeeded_with "\"reason\":\"none_pending\""
url_pre_migrate "$base_url?schema=public&sslmode=verify-full"
expect "DATABASE_URL: sslmode is passed on, not dropped (verify-full with no root certificate must hold)" \
  failed_with "UPDATE HELD"
secret_url="postgresql://$PGUSER:s3cr3t-pw@$PGHOST:1/$SRC_DB?schema=public"
REDACT="$(newdir)"
BK_DIR="$REDACT"
url_pre_migrate "$secret_url"
expect "a credential-bearing URL never reaches the output or UPDATE-HELD.txt" \
  no_secret "$REDACT"

RC=0
OUT="$( (export PGDATABASE="postgresql://$PGUSER:s3cr3t-pw@$PGHOST/x"; bk now) 2>&1)" || RC=$?
expect "an error that quotes a connection string is redacted" redacted_only

BK_MIGS="$EXTRA"
HELD="$(newdir)"
BK_DIR="$HELD"
RC=0
OUT="$( (export PGPORT=1; bk pre-migrate) 2>&1)" || RC=$?
expect "held, database unreachable: exits non-zero with the UPDATE HELD line" \
  failed_with "UPDATE HELD — " "backup.pre_migrate_failed"
expect "held, database unreachable: UPDATE-HELD.txt is written" grep -q '^.*UPDATE HELD — ' "$HELD/UPDATE-HELD.txt"

DISK="$(newdir)"
BK_DIR="$DISK"
RC=0
OUT="$( (export BACKUP_MIN_FREE_KB=999999999999; bk pre-migrate) 2>&1)" || RC=$?
expect "held, disk nearly full: exits non-zero and says so" \
  failed_with "UPDATE HELD" "disk nearly full"
expect "held, disk nearly full: UPDATE-HELD.txt says so" grep -q 'disk nearly full' "$DISK/UPDATE-HELD.txt"
expect "held, disk nearly full: no copy left behind" test -z "$(files_matching "$DISK" 'dump|partial')"

# When the guard trips, old copies are pruned first (never the newest of each kind) and the check is
# repeated. Sparse 4 TB "copies" make the guard trip for real; pruning the older one cannot free enough,
# so the update is still held, but the prune must have happened and the newest must have survived.
GUARD="$(newdir)"
for f in schedulepoint-pre-migrate-2026-01-01T0300Z.dump schedulepoint-pre-migrate-2026-01-05T0300Z.dump; do
  truncate -s 4T "$GUARD/$f"
  touch -d "90 days ago" "$GUARD/$f"
done
BK_DIR="$GUARD"
run_bk pre-migrate
expect "disk guard: tripped and still held when pruning cannot free enough" failed_with "UPDATE HELD" "disk nearly full"
expect "disk guard: the older old copy was pruned first" test ! -e "$GUARD/schedulepoint-pre-migrate-2026-01-01T0300Z.dump"
expect "disk guard: the newest copy of its kind was kept" test -e "$GUARD/schedulepoint-pre-migrate-2026-01-05T0300Z.dump"

RO="$(newdir)"
BK_DIR="$RO"
BK_RO=1
run_bk pre-migrate
BK_RO=0
expect "held, folder not writable: exits non-zero with the UPDATE HELD line" \
  failed_with "UPDATE HELD" "cannot write to"
expect "held, folder not writable: nothing was written" test -z "$(ls -A "$RO")"

BK_DIR="$HELD"
URLDIR="$(newdir)"
BK_DIR="$URLDIR"
RC=0
OUT="$( (unset PGHOST PGUSER PGPASSWORD PGPORT PGDATABASE; export DATABASE_URL; bk pre-migrate) 2>&1)" || RC=$?
expect "taken, connecting through DATABASE_URL as the API container does" \
  succeeded_with "backup.pre_migrate_taken"
BK_DIR="$HELD"
run_bk pre-migrate
expect "taken: exits 0 and logs backup.pre_migrate_taken naming the pending migration" \
  succeeded_with "backup.pre_migrate_taken" "99999999999999_ci_pending_probe"
PRE="$(files_matching "$HELD" '^schedulepoint-pre-migrate-.*\.dump$')"
expect "taken: exactly one pre-update copy with its checksum" test "$(printf '%s\n' "$PRE" | grep -c .)" -eq 1 -a -f "$HELD/$PRE.sha256"
expect "taken: UPDATE-HELD.txt is removed" test ! -e "$HELD/UPDATE-HELD.txt"
run_bk check "$PRE"
expect "taken: the pre-update copy passes check" succeeded_with "CHECK PASSED"
BK_DIR="$HELD"
run_bk list
expect "list labels it 'before an update'" contains "$OUT" "before an update"
run_bk health
expect "health ignores a pre-update copy (an update at 01:00 never stands in for the night's copy)" test "$RC" -ne 0

expect "pre-migrate never changed the source database" \
  test "$(dbq "$SRC_DB" "SELECT count(*) FROM _prisma_migrations")" = "$migrations_before"
expect "...and the source is still identical to what was fingerprinted" same_as_source "$SRC_DB"

echo
echo "==> $pass checks passed, $failed failed"
[ "$failed" -eq 0 ]
