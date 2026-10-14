#!/bin/sh
# schedulepoint-backup — database backup, check and restore for SchedulePoint.
#
# Spec: docs/specs/database-backup/feature-spec.md · Decision: docs/adr/0192-*.md (ADR-0192).
# Shipped in the API image at /app/backup/ with the PostgreSQL 17 client tools. POSIX sh only: the
# runtime image is Alpine, so the userland is busybox, not GNU.
#
# COMMANDS
#   schedule      (default) the backup service's loop: every 5 minutes, take the nightly copy if one is
#                 due (02:00 UTC, with catch-up; at once when no copy exists), then prune.
#   now           take a copy immediately; same name, checks and status file as the nightly one.
#   list          the copies in the backups folder, newest first.
#   check [file] [--keep]
#                 load a copy (default: the newest) into a scratch database, print what is in it next to
#                 the live database, delete the scratch database. Never writes to the live database.
#                 --keep leaves the scratch database in place (the CI comparator reads it).
#   restore <file> [--yes]
#                 replace the live database with a copy. Loads into a NEW database, checks it, then swaps
#                 by rename; the old database is kept as <db>_before_restore_<stamp>. Needs the API stopped.
#   health        exit 0 when the newest nightly copy is under 26 hours old (the container healthcheck).
#   pre-migrate   called by the API's entrypoint before `prisma migrate deploy` (spec §4.12). Takes a copy
#                 only when backups are switched on AND a migration is pending. Exit non-zero HOLDS the
#                 update: the entrypoint's `set -e` then stops before the database is touched. It fails
#                 closed — "cannot tell" is a hold, never a guess — and it never prunes.
#
# EXIT CODES  0 success · 1 failure (or a held update) · 2 usage error.
#
# FILES (all inside the backups folder, /backups)
#   schedulepoint-YYYY-MM-DDTHHMMZ.dump          nightly / `now` copy (pg_dump custom format)
#   schedulepoint-pre-migrate-<stamp>.dump       copy taken before an update that changes the database
#   schedulepoint-pre-restore-<stamp>.dump       safety copy taken by `restore`
#   <copy>.sha256                                its checksum (`sha256sum -c` works from the folder)
#   LAST-BACKUP.txt, UPDATE-HELD.txt             plain-English status; see spec §4.3 and §4.12
# A copy is written as <name>.partial and renamed only when finished and readable, so a name that exists
# is a whole file. Pruning only ever touches the three patterns above, after a good copy, and never
# removes the newest of each.
#
# CONNECTION  PGHOST/PGUSER/PGPASSWORD/PGDATABASE when PGHOST is set (the backup service); otherwise
# DATABASE_URL (the API container), which is parsed into PG* variables so the credential is never on a
# command line; Prisma-only query parameters such as `?schema=public` are dropped, libpq ones such as
# `sslmode` are kept.
#
# SETTINGS  BACKUP_KEEP_DAYS (1-3650, default 30) is the only operator setting. Test-only: BACKUP_ROOT
# (the folder, default /backups), MIGRATIONS_DIR (default /app/prisma/migrations),
# BACKUP_MIN_FREE_KB (free-space floor when no earlier copy exists, default 204800),
# BACKUP_SCHEDULE_ITERATIONS (stop `schedule` after this many polls; 0, the default, never stops),
# BACKUP_POLL_SECONDS (the poll interval, default 300), BACKUP_NOW (an epoch second standing in for
# "now" when deciding whether a nightly copy is due and naming copies).

set -eu
umask 077

ROOT="${BACKUP_ROOT:-/backups}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/prisma/migrations}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
MIN_FREE_KB="${BACKUP_MIN_FREE_KB:-204800}"
# Fail a hung connection in seconds rather than sitting on the entrypoint (or the nightly loop).
export PGCONNECT_TIMEOUT="${PGCONNECT_TIMEOUT:-10}"

NIGHTLY_RE='^schedulepoint-2.*\.dump$'
PRE_MIGRATE_RE='^schedulepoint-pre-migrate-.*\.dump$'
PRE_RESTORE_RE='^schedulepoint-pre-restore-.*\.dump$'
ANY_RE='^schedulepoint-.*\.dump$'
# The poll interval and the hour after which a missing nightly copy is due.
POLL_SECONDS="${BACKUP_POLL_SECONDS:-300}"
# After a failed nightly attempt, wait this long before the next: a failure at 02:05 is usually a
# full disk or a stopped database, and retrying every five minutes all day only fills the log.
RETRY_BACKOFF_SECONDS=3600
NIGHTLY_HOUR=2
# 24 hours plus two of slack.
HEALTHY_MINUTES=1560

PARTIALS=""
SCRATCH_DB=""
DBNAME=""
COPY_ERR=""
COPY_FILE=""
COPY_BYTES=0
COPY_SECS=0
VERIFY_ERR=""

# --- small helpers ----------------------------------------------------------

# Defence in depth: a connection string with a password in it must never reach a log or a file the
# operator reads, whatever an error message happens to quote.
redact() { sed 's#://[^@/ ]*@#://[redacted]@#g'; }

die() {
  printf '%s\n' "$*" | redact >&2
  exit 1
}

first_line() { printf '%s' "$1" | sed -n '1p' | redact; }

# One line, every control character dropped (a raw one is invalid in JSON and a log-forging vector).
json_str() {
  printf '%s' "$1" | redact | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n\t\r' '   ' | tr -d '\000-\037\177'
}

# The wall clock the nightly decision and copy names use. BACKUP_NOW is test-only.
now_epoch() { printf '%s' "${BACKUP_NOW:-$(date +%s)}"; }
now_fmt() { date -u -d "@$(now_epoch)" "+$1"; }

# emit <event> [key value]... — one JSON object per line, the shape the API's own logs use.
emit() {
  ev=$1
  shift
  lvl=info
  case $ev in
    *failed) lvl=error ;;
    *permissions) lvl=warn ;;
  esac
  line="{\"level\":\"$lvl\",\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"$ev\""
  while [ $# -ge 2 ]; do
    case $2 in
      '' | *[!0-9]*) line="$line,\"$1\":\"$(json_str "$2")\"" ;;
      *) line="$line,\"$1\":$2" ;;
    esac
    shift 2
  done
  printf '%s}\n' "$line"
}

human_size() {
  awk -v b="$1" 'BEGIN {
    if (b >= 1073741824) printf "%.1f GB", b / 1073741824
    else if (b >= 1048576) printf "%.1f MB", b / 1048576
    else if (b >= 1024) printf "%.1f KB", b / 1024
    else printf "%d bytes", b
  }'
}

# A file's size from its inode. Not `wc -c`: busybox's reads the whole file, which on a multi-gigabyte
# dump is minutes of I/O for a number the filesystem already has.
file_bytes() { stat -c %s "$1"; }

# Free kilobytes on the backups folder's filesystem (POSIX `df -P`, same in busybox).
free_kb() { df -Pk "$ROOT" | awk 'NR == 2 { print $4 }'; }

stamp_to_text() {
  printf '%s' "$1" | sed 's/.*\([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\)T\([0-9]\{2\}\)\([0-9]\{2\}\)Z\.dump$/\1 \2:\3 UTC/'
}

# Names (not paths) of the copies matching a pattern, oldest first by name. A glob rather than a
# directory listing so an odd file name elsewhere in the folder is never parsed. `ls` is used for
# its `-t` ordering (busybox `find` has no -printf); the names it lists are ours, matched by the
# glob, so SC2012's concern about unusual file names does not apply.
# shellcheck disable=SC2012
kind_list() { ls -1 "$ROOT"/schedulepoint-*.dump 2>/dev/null | sed 's#.*/##' | grep -E "$1" | sort || true; }

# The most recently written copy of any kind, and every copy newest first. Time, not name: the
# three kinds do not sort against each other.
# shellcheck disable=SC2012
newest_any() { ls -1t "$ROOT"/schedulepoint-*.dump 2>/dev/null | head -1 | sed 's#.*/##' || true; }
# shellcheck disable=SC2012
all_newest_first() { ls -1t "$ROOT"/schedulepoint-*.dump 2>/dev/null | sed 's#.*/##' || true; }

newest_of() { kind_list "$1" | tail -1; }

# --- connection -------------------------------------------------------------

# urldecode — %XX escapes to bytes (awk only: dash's printf has no \x, busybox's differs).
urldecode() {
  printf '%s' "$1" | awk '
    function hexval(c) { return index("0123456789ABCDEF", toupper(c)) - 1 }
    { s = $0; out = ""
      while ((i = index(s, "%")) > 0) {
        h = substr(s, i + 1, 2)
        if (h ~ /^[0-9A-Fa-f][0-9A-Fa-f]$/) {
          out = out substr(s, 1, i - 1) sprintf("%c", hexval(substr(h, 1, 1)) * 16 + hexval(substr(h, 2, 1)))
          s = substr(s, i + 3)
        } else { out = out substr(s, 1, i); s = substr(s, i + 1) }
      }
      printf "%s", out s }'
}

# parse_database_url — DATABASE_URL into PG* variables. Nothing here puts the credential on a command
# line, and a query parameter is passed on only when it is a libpq one: Prisma's own (`schema`,
# `connection_limit`, `pool_timeout`, `pgbouncer`, …) are dropped, `sslmode` and its siblings are not.
parse_database_url() {
  rest=${DATABASE_URL#*://}
  authority=${rest%%/*}
  pathq=${rest#*/}
  db=${pathq%%\?*}
  query=""
  case $pathq in *\?*) query=${pathq#*\?} ;; esac
  userinfo=""
  case $authority in *@*) userinfo=${authority%@*} ;; esac
  hostport=${authority##*@}
  host=${hostport%%:*}
  port=5432
  case $hostport in *:*) port=${hostport#*:} ;; esac
  user=${userinfo%%:*}
  pass=""
  case $userinfo in *:*) pass=${userinfo#*:} ;; esac
  [ -n "$host" ] && [ -n "$db" ] || die "DATABASE_URL must name a host and a database."
  export PGHOST="$host" PGPORT="$port" PGDATABASE="$db"
  if [ -n "$user" ]; then
    user=$(urldecode "$user")
    export PGUSER="$user"
  fi
  if [ -n "$pass" ]; then
    pass=$(urldecode "$pass")
    export PGPASSWORD="$pass"
  fi
  oldifs=$IFS
  IFS='&'
  for kv in $query; do
    val=$(urldecode "${kv#*=}")
    case ${kv%%=*} in
      sslmode) export PGSSLMODE="$val" ;;
      sslrootcert) export PGSSLROOTCERT="$val" ;;
      sslcert) export PGSSLCERT="$val" ;;
      sslkey) export PGSSLKEY="$val" ;;
      connect_timeout) export PGCONNECT_TIMEOUT="$val" ;;
    esac
  done
  IFS=$oldifs
}

init_conn() {
  if [ -z "${PGHOST:-}" ]; then
    [ -n "${DATABASE_URL:-}" ] || die "No database is configured (set PGHOST and PGDATABASE, or DATABASE_URL)."
    parse_database_url
  fi
  DBNAME="${PGDATABASE:-}"
  [ -n "$DBNAME" ] || die "PGDATABASE is not set."
  # Database names reach SQL as identifiers and a rename must fit Postgres's 63 bytes
  # (<name>_before_restore_YYYYMMDDHHMM adds 28).
  case $DBNAME in
    *[!A-Za-z0-9_]*) die "The database name '$DBNAME' may only use letters, digits and underscores." ;;
  esac
  [ "${#DBNAME}" -le 35 ] || die "The database name '$DBNAME' is longer than 35 characters."
}

# target <database> — the database argument every libpq tool accepts. The connection itself is the PG*
# environment; only a name is ever passed.
target() { printf '%s' "$1"; }

# sql <database> <statement> — tuples only, stops on the first error (stderr carries it).
sql() { psql -X -q -At -v ON_ERROR_STOP=1 -d "$(target "$1")" -c "$2"; }

need_tools() {
  for t in psql pg_dump pg_restore; do
    command -v "$t" >/dev/null 2>&1 || die "$t is not installed in this image."
  done
}

# --- validation -------------------------------------------------------------

validate_keep_days() {
  case $KEEP_DAYS in
    '' | *[!0-9]* | 0*) die "BACKUP_KEEP_DAYS must be a whole number from 1 to 3650 (got '$KEEP_DAYS')." ;;
  esac
  { [ "$KEEP_DAYS" -ge 1 ] && [ "$KEEP_DAYS" -le 3650 ]; } \
    || die "BACKUP_KEEP_DAYS must be a whole number from 1 to 3650 (got '$KEEP_DAYS')."
}

# A file argument is a bare name from `list`: no paths, so a typo cannot point at anything else.
resolve_file() {
  f=${1:-}
  if [ -z "$f" ]; then
    f=$(newest_any)
    [ -n "$f" ] || die "There are no copies in $ROOT yet."
  fi
  case $f in
    */* | *[!A-Za-z0-9._-]*) die "Give just a file name as shown by 'list' (for example schedulepoint-2026-10-15T0200Z.dump), not a path." ;;
  esac
  printf '%s' "$f" | grep -Eq "$ANY_RE" \
    || die "'$f' is not a SchedulePoint copy (names look like schedulepoint-2026-10-15T0200Z.dump)."
  [ -f "$ROOT/$f" ] || die "There is no copy called '$f' in $ROOT. Run 'list' to see the copies."
  printf '%s' "$f"
}

# --- taking a copy ----------------------------------------------------------

drop_partials() {
  for p in $PARTIALS; do rm -f "$p"; done
  PARTIALS=""
}

cleanup() {
  drop_partials
  if [ -n "$SCRATCH_DB" ]; then
    sql postgres "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE)" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

unique_stamp() {
  base=$(now_epoch)
  i=0
  while :; do
    s=$(date -u -d "@$((base + i * 60))" +%Y-%m-%dT%H%MZ)
    { [ -e "$ROOT/$1$s.dump" ] || [ -e "$ROOT/$1$s.dump.partial" ]; } || break
    i=$((i + 1))
  done
  printf '%s' "$s"
}

# folder_warning — text when the backups folder is open to other users on this server, else nothing.
# A warning, never a refusal: the copies hold password hashes, but a folder an operator made
# world-readable is still better backed up than not.
folder_warning() {
  mode=$(stat -c %a "$ROOT" 2>/dev/null || true)
  case $mode in
    '' | *00) return 0 ;;
  esac
  printf 'WARNING: the backups folder is accessible to other users on this server (mode %s). Copies contain password hashes; run: chmod 700 <backups folder>' "$mode"
}

warn_folder() {
  w=$(folder_warning)
  if [ -n "$w" ]; then emit backup.folder_permissions mode "$(stat -c %a "$ROOT")"; fi
}

# take_copy <name prefix> — on failure COPY_ERR holds the reason; the folder is left as it was.
take_copy() {
  prefix=$1
  COPY_ERR=""
  started=$(date +%s)

  if ! { [ -d "$ROOT" ] && touch "$ROOT/.write-test" 2>/dev/null && rm -f "$ROOT/.write-test"; }; then
    COPY_ERR="cannot write to $ROOT — see the backup guide, step 1"
    return 1
  fi

  if ! out=$(sql "$DBNAME" 'SHOW server_version_num' 2>&1); then
    COPY_ERR="cannot reach the database: $(first_line "$out")"
    return 1
  fi
  server_major=$((out / 10000))
  tools_major=$(pg_dump --version | sed 's/[^0-9]*\([0-9]*\).*/\1/')
  if [ "$server_major" -gt "$tools_major" ]; then
    COPY_ERR="the database is version $server_major but the backup tools are $tools_major — update SchedulePoint"
    return 1
  fi

  last=$(newest_any)
  need_kb=$MIN_FREE_KB
  if [ -n "$last" ]; then
    last_bytes=$(file_bytes "$ROOT/$last")
    need_kb=$((last_bytes * 2 / 1024))
  fi
  have_kb=$(free_kb)
  if [ "$have_kb" -lt "$need_kb" ]; then
    # Old copies are the cheapest space there is, and prune never removes the newest of each kind.
    # Only with a valid retention setting: a mistyped one must not decide what is deleted.
    if (validate_keep_days) >/dev/null 2>&1; then prune; fi
    have_kb=$(free_kb)
  fi
  if [ "$have_kb" -lt "$need_kb" ]; then
    COPY_ERR="disk nearly full (needs $(human_size $((need_kb * 1024))), $(human_size $((have_kb * 1024))) free)"
    return 1
  fi

  name="${prefix}$(unique_stamp "$prefix").dump"
  partial="$ROOT/$name.partial"
  sum_partial="$ROOT/$name.sha256.partial"
  PARTIALS="$partial $sum_partial"

  # --lock-wait-timeout: a migration holding a lock fails this run rather than hanging it; the next
  # poll retries.
  if ! out=$(pg_dump --format=custom --lock-wait-timeout=60s --file="$partial" -d "$(target "$DBNAME")" 2>&1); then
    COPY_ERR="the database dump failed: $(first_line "$out")"
    drop_partials
    return 1
  fi
  if ! pg_restore --list "$partial" >/dev/null 2>&1; then
    COPY_ERR="the finished copy could not be read back, so it was thrown away"
    drop_partials
    return 1
  fi
  hash=$(sha256sum "$partial" | cut -d ' ' -f 1)
  # Flush before the renames: a name that exists must be a whole file even across a power cut.
  sync
  if ! { printf '%s  %s\n' "$hash" "$name" >"$sum_partial" \
    && mv "$sum_partial" "$ROOT/$name.sha256" \
    && mv "$partial" "$ROOT/$name"; }; then
    COPY_ERR="the copy could not be finalised in $ROOT"
    drop_partials
    # A checksum with no dump beside it would be an orphan.
    rm -f "$ROOT/$name.sha256"
    return 1
  fi
  PARTIALS=""
  COPY_FILE=$name
  COPY_BYTES=$(file_bytes "$ROOT/$name")
  COPY_SECS=$(($(date +%s) - started))
  return 0
}

# Remove copies older than KEEP_DAYS from the three patterns — never the newest of each — and the
# checksum beside each. Called only after a good copy.
prune() {
  mm=$((KEEP_DAYS * 1440))
  gone=$(
    for re in "$NIGHTLY_RE" "$PRE_MIGRATE_RE" "$PRE_RESTORE_RE"; do
      newest=$(newest_of "$re")
      kind_list "$re" | while IFS= read -r f; do
        [ "$f" = "$newest" ] && continue
        [ -n "$(find "$ROOT/$f" -maxdepth 0 -type f -mmin "+$mm" 2>/dev/null)" ] || continue
        rm -f "$ROOT/$f" "$ROOT/$f.sha256" && echo "$f"
      done
    done
  )
  if [ -n "$gone" ]; then
    emit backup.pruned count "$(printf '%s\n' "$gone" | wc -l | tr -d ' ')" files "$(printf '%s' "$gone" | tr '\n' ' ')"
  fi
}

write_file_atomic() { # <path> reads stdin
  cat >"$1.partial" && mv "$1.partial" "$1"
}

write_status_ok() {
  kept=$(kind_list "$ANY_RE" | wc -l | tr -d ' ')
  oldest=$(kind_list "$NIGHTLY_RE" | head -1)
  oldest_day=-
  [ -z "$oldest" ] || oldest_day=$(stamp_to_text "$oldest" | cut -d ' ' -f 1)
  {
    printf 'OK — last backup %s\n' "$(date -u '+%Y-%m-%d %H:%M UTC')"
    printf 'File: %s (%s), took %s seconds\n' "$COPY_FILE" "$(human_size "$COPY_BYTES")" "$COPY_SECS"
    printf 'Copies kept: %s, oldest %s. Free disk space: %s.\n' "$kept" "$oldest_day" "$(human_size $(($(free_kb) * 1024)))"
    if [ -e "$ROOT/UPDATE-HELD.txt" ]; then
      printf 'NOTE: an update is being held — see UPDATE-HELD.txt in this folder.\n'
    fi
    folder_warning
    printf '\n'
  } | sed '/^$/d' | write_file_atomic "$ROOT/LAST-BACKUP.txt" 2>/dev/null || true
}

write_status_failed() {
  good=$(newest_of "$NIGHTLY_RE")
  {
    printf 'FAILED — %s. Reason: %s. Newest good copy: %s.\n' "$(date -u '+%Y-%m-%d %H:%M UTC')" "$(printf '%s' "$COPY_ERR" | redact)" "${good:-none}"
    if [ -e "$ROOT/UPDATE-HELD.txt" ]; then
      printf 'NOTE: an update is being held — see UPDATE-HELD.txt in this folder.\n'
    fi
    folder_warning
    printf '\n'
  } | sed '/^$/d' | write_file_atomic "$ROOT/LAST-BACKUP.txt" 2>/dev/null || true
}

# run_copy — the nightly / `now` copy: take, prune, report.
run_copy() {
  warn_folder
  if take_copy schedulepoint-; then
    emit backup.succeeded file "$COPY_FILE" bytes "$COPY_BYTES" seconds "$COPY_SECS"
    prune
    write_status_ok
    return 0
  fi
  emit backup.failed reason "$COPY_ERR"
  write_status_failed
  return 1
}

# --- commands ---------------------------------------------------------------

nightly_due() {
  [ -n "$(newest_of "$NIGHTLY_RE")" ] || return 0
  [ "$(now_fmt %H)" -ge "$NIGHTLY_HOUR" ] || return 1
  today=$(now_fmt %Y-%m-%d)
  kind_list "$NIGHTLY_RE" | grep -q "^schedulepoint-$today" && return 1
  return 0
}

cmd_schedule() {
  validate_keep_days
  rm -f "$ROOT"/schedulepoint-*.partial 2>/dev/null || true
  emit backup.started keep_days "$KEEP_DAYS" folder "$ROOT"
  polls=0
  retry_after=0
  while :; do
    if [ "$(date +%s)" -ge "$retry_after" ] && nightly_due; then
      if ! run_copy; then retry_after=$(($(date +%s) + RETRY_BACKOFF_SECONDS)); fi
    fi
    polls=$((polls + 1))
    if [ "${BACKUP_SCHEDULE_ITERATIONS:-0}" -gt 0 ] && [ "$polls" -ge "$BACKUP_SCHEDULE_ITERATIONS" ]; then
      return 0
    fi
    sleep "$POLL_SECONDS" &
    wait $! || true
  done
}

cmd_now() {
  validate_keep_days
  if run_copy; then
    printf 'BACKUP FINISHED: %s (%s), took %s seconds.\n' "$COPY_FILE" "$(human_size "$COPY_BYTES")" "$COPY_SECS"
  else
    printf 'BACKUP FAILED: %s\n' "$COPY_ERR"
    return 1
  fi
}

cmd_list() {
  names=$(all_newest_first)
  if [ -z "$names" ]; then
    echo "There are no copies in $ROOT yet."
    return 0
  fi
  echo "Copies in $ROOT, newest first:"
  printf '%s\n' "$names" | while IFS= read -r f; do
    label=""
    case $f in
      schedulepoint-pre-migrate-*) label="  (before an update)" ;;
      schedulepoint-pre-restore-*) label="  (before a restore)" ;;
    esac
    printf '  %s  %s  %s%s\n' "$f" "$(human_size "$(file_bytes "$ROOT/$f")")" "$(stamp_to_text "$f")" "$label"
  done
}

cmd_health() {
  if [ -d "$ROOT" ] && [ -n "$(find "$ROOT" -maxdepth 1 -name 'schedulepoint-2*.dump' -type f -mmin "-$HEALTHY_MINUTES" 2>/dev/null | head -1)" ]; then
    echo "healthy: a copy was made in the last 26 hours"
    return 0
  fi
  echo "unhealthy: no copy in the last 26 hours (see LAST-BACKUP.txt)"
  return 1
}

# verify_file <name> — checksum and readability. Sets VERIFY_ERR.
verify_file() {
  if [ ! -f "$ROOT/$1.sha256" ]; then
    VERIFY_ERR="there is no checksum file ($1.sha256) beside it, so it cannot be trusted"
    return 1
  fi
  if ! (cd "$ROOT" && sha256sum -c "$1.sha256" >/dev/null 2>&1); then
    VERIFY_ERR="the file is damaged (its checksum does not match)"
    return 1
  fi
  if ! pg_restore --list "$ROOT/$1" >/dev/null 2>&1; then
    VERIFY_ERR="the file is damaged (it cannot be read as a database copy)"
    return 1
  fi
  return 0
}

# load_scratch <database> <file> — create <database> from template0 and load the copy into it.
load_scratch() {
  sql postgres "DROP DATABASE IF EXISTS \"$1\" WITH (FORCE)" >/dev/null 2>&1 || true
  SCRATCH_DB=$1
  if ! out=$(sql postgres "CREATE DATABASE \"$1\" TEMPLATE template0" 2>&1); then
    VERIFY_ERR="could not create a scratch database: $(first_line "$out")"
    return 1
  fi
  # --exit-on-error + --single-transaction: a copy loads whole or not at all.
  if ! out=$(pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
    -d "$(target "$1")" "$ROOT/$2" 2>&1); then
    VERIFY_ERR="the copy would not load: $(first_line "$out")"
    return 1
  fi
  return 0
}

# not_in <candidates> <universe> — the candidate names (one per line) that the universe lacks.
not_in() {
  printf '%s\n' "$1" | while IFS= read -r n; do
    [ -n "$n" ] || continue
    printf '%s\n' "$2" | grep -qxF -- "$n" || printf '%s\n' "$n"
  done
}

# The migration directories this image ships: the same folder `prisma migrate deploy` reads.
known_migrations() {
  for d in "$MIGRATIONS_DIR"/*/; do
    [ -d "$d" ] || continue
    basename "$d"
  done
}

# verify_loaded <database> — what must be true of a loaded copy. Sets VERIFY_ERR.
verify_loaded() {
  prot=$(sql "$1" "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relname = 'audit_events' AND NOT t.tgisinternal AND t.tgenabled = 'A'" 2>/dev/null) || prot=""
  case $prot in
    '' | *[!0-9]* | 0 | 1)
      VERIFY_ERR="the audit log's protection is missing from this copy"
      return 1
      ;;
  esac
  has=$(sql "$1" "SELECT to_regclass('public._prisma_migrations') IS NOT NULL" 2>/dev/null) || has=f
  if [ "$has" = t ]; then
    applied=$(sql "$1" "SELECT migration_name FROM _prisma_migrations" 2>&1) \
      || {
        VERIFY_ERR="the copy's list of applied migrations could not be read"
        return 1
      }
    newer=$(not_in "$applied" "$(known_migrations)")
    if [ -n "$newer" ]; then
      VERIFY_ERR="this copy was made by a newer version of SchedulePoint than the one installed — update SchedulePoint first"
      return 1
    fi
  fi
  return 0
}

COUNT_TABLES="organizations users clients projects plans activities audit_events"

count_of() { # <database> <table>
  if [ "$(sql "$1" "SELECT to_regclass('public.$2') IS NOT NULL")" = t ]; then
    sql "$1" "SELECT count(*) FROM public.$2"
  else
    echo "-"
  fi
}

cmd_check() {
  file="" keep=0
  for a in "$@"; do
    case $a in
      --keep) keep=1 ;;
      *) file=$a ;;
    esac
  done
  f=$(resolve_file "$file")
  fail() {
    printf 'CHECK FAILED: %s\n' "$1"
    exit 1
  }
  printf 'Checking %s ...\n' "$f"
  verify_file "$f" || fail "$VERIFY_ERR"
  scratch="${DBNAME}_check_$(date +%s)"
  load_scratch "$scratch" "$f" || fail "$VERIFY_ERR"
  verify_loaded "$scratch" || fail "$VERIFY_ERR"
  printf '\n%-16s %12s %18s\n' "" "in this copy" "in the live database"
  for t in $COUNT_TABLES; do
    printf '%-16s %12s %18s\n' "$t" "$(count_of "$scratch" "$t")" "$(count_of "$DBNAME" "$t")"
  done
  printf '\nSmall differences are normal if people have worked since the copy was made.\n'
  printf 'The audit log protection is present in the copy.\n'
  if [ "$keep" = 1 ]; then
    printf 'Scratch database kept: %s\n' "$scratch"
    SCRATCH_DB=""
  fi
  echo "CHECK PASSED"
}

live_connections() {
  sql postgres "SELECT count(*) FROM pg_stat_activity
    WHERE datname = '$DBNAME' AND backend_type = 'client backend' AND pid <> pg_backend_pid()"
}

cmd_restore() {
  file="" yes=0
  for a in "$@"; do
    case $a in
      --yes) yes=1 ;;
      *) file=$a ;;
    esac
  done
  [ -n "$file" ] || die "Say which copy to restore: restore <file>. Run 'list' to see them."
  f=$(resolve_file "$file")
  fail() {
    printf 'RESTORE REFUSED: %s\nThe live database has not been changed.\n' "$1"
    exit 1
  }
  verify_file "$f" || fail "$VERIFY_ERR"
  conns=$(live_connections 2>&1) || fail "cannot reach the database: $(first_line "$conns")"
  if [ "$conns" -gt 0 ]; then
    fail "something is still connected to the database ($conns connection(s)). Stop SchedulePoint first: docker compose stop api web backup"
  fi
  if [ "$yes" != 1 ]; then
    printf 'This replaces the live database "%s" with %s.\nThe current database is kept aside, not deleted.\nType RESTORE to go on: ' "$DBNAME" "$f"
    ans=""
    read -r ans || ans=""
    [ "$ans" = RESTORE ] || fail "you did not type RESTORE."
  fi
  restoring="${DBNAME}_restoring"
  echo "Loading $f into a new database ..."
  load_scratch "$restoring" "$f" || fail "$VERIFY_ERR"
  verify_loaded "$restoring" || fail "$VERIFY_ERR"
  # Only now, with a copy that has loaded and checked, is the live database worth saving aside.
  echo "Taking a safety copy of the current database ..."
  if ! take_copy schedulepoint-pre-restore-; then
    fail "the safety copy could not be made: $COPY_ERR"
  fi
  printf 'Safety copy: %s\n' "$COPY_FILE"
  conns=$(live_connections 2>&1) || fail "cannot reach the database: $(first_line "$conns")"
  [ "$conns" -eq 0 ] || fail "something connected to the database while the copy was loading."
  kept="${DBNAME}_before_restore_$(date -u +%Y%m%d%H%M)"
  # One statement batch is one transaction: both renames happen or neither does.
  if ! out=$(sql postgres "ALTER DATABASE \"$DBNAME\" RENAME TO \"$kept\"; ALTER DATABASE \"$restoring\" RENAME TO \"$DBNAME\";" 2>&1); then
    fail "the swap failed: $(first_line "$out")"
  fi
  SCRATCH_DB=""
  echo
  echo "RESTORE FINISHED. The database is now $f."
  printf 'The database from before the restore is kept as "%s".\n' "$kept"
  echo "Start SchedulePoint again:   docker compose up -d"
  printf 'Delete the kept database once you are sure (after about a week):\n'
  printf '  docker compose exec db psql -U %s -d postgres -c '\''DROP DATABASE "%s";'\''\n' "${PGUSER:-app}" "$kept"
}

# --- the copy before an update (spec §4.12) ----------------------------------

hold() {
  reason=$(printf '%s' "$1" | redact)
  msg="UPDATE HELD — SchedulePoint did not update the database because the safety copy could not be made: $reason. Your data has NOT been changed. Fix that (for a full disk, free some space) and SchedulePoint will carry on by itself, or go back to the previous version. See the backup guide, \"If an update is held\"."
  emit backup.pre_migrate_failed reason "$reason"
  printf '%s\n' "$msg"
  printf '%s %s\n' "$(date -u '+%Y-%m-%d %H:%M UTC')" "$msg" | write_file_atomic "$ROOT/UPDATE-HELD.txt" 2>/dev/null || true
  exit 1
}

cmd_pre_migrate() {
  if [ ! -d "$ROOT" ]; then
    emit backup.pre_migrate_skipped reason not_enabled
    return 0
  fi
  warn_folder
  out=$(sql "$DBNAME" "SELECT to_regclass('public._prisma_migrations') IS NOT NULL" 2>&1) \
    || hold "the database could not be asked what is pending: $(first_line "$out")"
  if [ "$out" != t ]; then
    emit backup.pre_migrate_skipped reason fresh
    return 0
  fi
  rows=$(sql "$DBNAME" "SELECT count(*) FROM _prisma_migrations" 2>&1) \
    || hold "the database could not be asked what is pending: $(first_line "$rows")"
  if [ "$rows" = 0 ]; then
    emit backup.pre_migrate_skipped reason fresh
    return 0
  fi
  applied=$(sql "$DBNAME" "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL" 2>&1) \
    || hold "the database could not be asked what is pending: $(first_line "$applied")"
  # Directory names against applied rows — never a parsed exit code (spec §4.12: `prisma migrate
  # status` exits 1 for pending, for a connection error and for a missing table alike).
  [ -d "$MIGRATIONS_DIR" ] || hold "the migrations folder $MIGRATIONS_DIR is missing"
  pending=$(not_in "$(known_migrations)" "$applied")
  if [ -z "$pending" ]; then
    emit backup.pre_migrate_skipped reason none_pending
    return 0
  fi
  if take_copy schedulepoint-pre-migrate-; then
    rm -f "$ROOT/UPDATE-HELD.txt"
    emit backup.pre_migrate_taken file "$COPY_FILE" bytes "$COPY_BYTES" seconds "$COPY_SECS" pending "$(printf '%s' "$pending" | tr '\n' ' ')"
    return 0
  fi
  hold "$COPY_ERR"
}

usage() {
  cat >&2 <<'EOF'
Usage: schedulepoint-backup <command>
  schedule              run the nightly copy loop (the backup service)
  now                   take a copy now
  list                  show the copies, newest first
  check [file] [--keep] load a copy into a scratch database and report; changes nothing live
  restore <file> [--yes] replace the live database with a copy (stop the API first)
  health                exit 0 when a copy was made in the last 26 hours
  pre-migrate           the copy before an update (called by the API's entrypoint)
EOF
}

cmd=schedule
if [ $# -gt 0 ]; then
  cmd=$1
  shift
fi
case $cmd in
  schedule | now | list | check | restore | health | pre-migrate) ;;
  help | -h | --help)
    usage
    exit 0
    ;;
  *)
    usage
    exit 2
    ;;
esac

case $cmd in
  list | health) ;;
  *)
    need_tools
    init_conn
    ;;
esac

case $cmd in
  schedule) cmd_schedule ;;
  now) cmd_now ;;
  list) cmd_list ;;
  check) cmd_check "$@" ;;
  restore) cmd_restore "$@" ;;
  health) cmd_health ;;
  pre-migrate) cmd_pre_migrate ;;
esac
