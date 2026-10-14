# ADR-0192: A backup is a file the image writes, and a restore never overwrites

- **Status:** Accepted — 2026-10-14. The spec was approved by the product owner on 2026-10-14, with a copy before each
  database update and the database port closed added to scope on approval (spec §6).
- **Spec:** [`docs/specs/database-backup/feature-spec.md`](../specs/database-backup/feature-spec.md) §4.9 · **Plan:**
  [`implementation-plan.md`](../specs/database-backup/implementation-plan.md)
- **Date:** 2026-10-14
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:** [ADR-0018](0018-self-migrating-container-image.md) (D9: the self-migrating image now takes a copy first).
- **Builds on:** ADR-0047 (releases deploy themselves), ADR-0072 (the audit log is append-only in the database),
  ADR-0087 (scheduled work), ADR-0088 D1 (no flag), ADR-0096 (the retention expiry that needs a backup first),
  ADR-0110 (a check is proven red), ADR-0160 (why this is not a `check:*` gate) and ADR-0190 (what 1.0 promises).

## Context

Nothing copied the database anywhere. Every plan lives in one PostgreSQL database in one Docker volume (`db-data`) on
the owner's server; a damaged volume, a mistyped command or a bad release meant every organisation's plans were gone.
Two things already true made that worse: releases deploy themselves and migrate on boot with nobody watching
(ADR-0047, ADR-0018), and a permanent delete (`RETENTION_HIERARCHY_ENABLED`, ADR-0096) waits for a switch that should
not be thrown without a way back. Pre-1.0 requirement (a), `docs/RELEASE_1_0.md` row 5.

The owner decided before the spec: copies live on the same server, in their own folder; a daily copy kept 30 days
(`docs/PROJECT_BRIEF.md:232`); off-site is later but must stay possible.

## Decision

**D1: a sidecar that runs the API image.** The `backup` service is the API image with a different entrypoint: a POSIX
`sh` script, `apps/api/backup/schedulepoint-backup.sh`, shipped at `/app/backup/` with the PostgreSQL 17 client tools
(`apk add postgresql17-client`). Watchtower therefore updates the backup tool with every release, and the script can
check a copy against the migrations of the version that will boot it.

- Rejected: `postgres:17-alpine` with an inline script (never updated by Watchtower, every fix a hand edit on the host,
  cannot see the migrations); a host cron script (the owner installs and maintains it, it is not versioned);
  a third-party backup image (a dependency nobody here reviews, holding the superuser password — CLAUDE.md §2);
  running it inside the API process like the retention sweep (ADR-0087 — it would couple copies to API health, so a
  crash-looping API, the moment a copy matters most, would stop them).

**D2: nightly, custom format, kept 30 days, pruned only after a good copy.** `pg_dump --format=custom
--lock-wait-timeout=60s`, at 02:00 UTC with catch-up (a 5-minute poll; at once when no copy exists), written as
`<name>.partial`, validated with `pg_restore --list`, given a `.sha256`, then renamed — a name that exists is a whole
file. Pruning runs only after a good copy, removes only the three name patterns below older than `BACKUP_KEEP_DAYS`, and
never the newest of each. A failed night deletes nothing, and is not retried for an hour (a failure at 02:05 is usually a full disk or a stopped
database; retrying every five minutes all day only fills the log). When the free-space guard trips, old copies are pruned
first — the cheapest space there is, and the newest of each kind still survives — and the check is repeated before failing. Names: `schedulepoint-<UTC stamp>.dump` (nightly and `now`),
`schedulepoint-pre-migrate-<stamp>.dump` (D9) and `schedulepoint-pre-restore-<stamp>.dump` (D3's safety copy).

**D3: restore loads into a NEW database and swaps by rename; the old database is kept; a copy newer than the image is
refused.** `restore` refuses while anything is connected, loads the copy into `<db>_restoring` created from `template0`,
runs the checks `check` runs, takes a safety copy, then renames the live database to
`<db>_before_restore_<stamp>` and the loaded one to the live name in one transaction. The live database is only ever
renamed, never dropped, so the previous state is one rename away; any failure before the swap leaves it untouched. It
never restores with `--clean` into the live database: loading into an empty database loads the data before the audit
triggers exist (they are post-data in a dump), so the append-only triggers (ADR-0072) have nothing to refuse and are not
bypassed. A copy whose `_prisma_migrations` names a migration the installed image lacks is refused ("made by a newer
version").

**D4: failure is visible without an alert service** (#100 stays parked). The container healthcheck (`health`: the
newest nightly copy is under 26 hours old), `LAST-BACKUP.txt` in the folder (plain English, OK or FAILED with the
reason), and one JSON log line per event (`backup.succeeded`, `backup.failed`, `backup.pruned`, and D9's
`backup.pre_migrate_*`).

**D5: tested twice, in jobs that already exist.** An exact round trip on real data in `e2e-api` (the shipped script
inside `postgres:17-alpine`; per-table counts and content checksums, sequences, trigger states, extensions, index and
constraint counts; an `UPDATE` on the restored audit log must fail `0A000`; `prisma migrate deploy` and the drift check
clean against the restored copy; a non-vacuity floor; and negative controls — an altered row and a disabled trigger must
both be reported, ADR-0110), which also walks the `pre-migrate` decision table and a real `restore`. The same
milestone-two work adds the real restore against the shipped image to the `image` job. **No new required check** — the
roster of ten stays ten — and **not a `check:*` gate** (ADR-0160): it needs a database and Docker, and prepush derives
its roster from that prefix.

**D6: two operator settings, `BACKUP_DIR` and `BACKUP_KEEP_DAYS`, promised at 1.0** (`docs/RELEASE_1_0.md`, "What 1.0
promises" item 3), so the names are chosen to last. `BACKUP_DIR` is a host path read by compose interpolation only;
`BACKUP_KEEP_DAYS` is an integer 1–3650, default 30, and anything else refuses the start. There is no schedule setting
(02:00 UTC is fixed) and no enable setting (an operator who wants none removes the service); both are additive later.
`BACKUP_ROOT`, `MIGRATIONS_DIR`, `BACKUP_MIN_FREE_KB`, `BACKUP_SCHEDULE_ITERATIONS`, `BACKUP_POLL_SECONDS` and
`BACKUP_NOW` exist for the test harness and are not settings (the last is an injectable clock, so both sides of 02:00 UTC
are tested on every run).

**D7: an off-site copy is a later copier of finished files.** Each copy is one finished file with its checksum beside it
and an unfinished copy only ever exists as `.partial`, so an off-site copy is any tool that copies finished
`schedulepoint-*.dump` and `.sha256` files out of `BACKUP_DIR`. It must be **encrypted before it leaves** (the copies hold
password hashes and session tokens) and must have its own check, since a copy nobody has restored is not yet a backup.

**D8: a restore-tested backup is the precondition for `RETENTION_HIERARCHY_ENABLED`.** It must not be switched on until
copies run, CI proves the round trip, the owner has recorded one `CHECK PASSED`, and a copy taken that same day has passed
`check` on the host.

**D9: an update that changes the database is preceded by a copy, and a failed copy holds the update** (amends ADR-0018).
The API's entrypoint calls `pre-migrate` before `prisma migrate deploy`; `set -e` turns its non-zero exit into "do not
migrate". Pending-ness is read by comparing the migration directories the image ships with the rows of
`_prisma_migrations` — **not** from `prisma migrate status`, whose exit code is 1 alike for a pending migration, a
connection error and a missing table. The decision: no `/backups` mounted → skip (`not_enabled`); no migrations table or
no rows → skip (`fresh`); every directory applied → skip (`none_pending`); otherwise take the copy. **It fails closed**:
anything it cannot establish — the database unreachable, the migrations folder unreadable, the folder unwritable, the
disk nearly full, the dump failing — writes `UPDATE-HELD.txt`, prints one plain-English `UPDATE HELD` line and exits
non-zero, so the database is not changed and Docker's own restart retries carry the update on once the cause is fixed.
It is opt-in by mount with no setting, and it never prunes. The image never creates `/backups`: its absence is how an
operator who has not switched backups on keeps updating exactly as before.

- Rejected: warn and migrate anyway (it would skip the copy on exactly the occasion it exists for — a release that
  changes the database — and defeats the purpose when a release is bad); a setting to skip it (a 1.0-promised setting
  for an escape the operator already has twice over: go back a version, or remove the mount).

**D10: the release stack publishes no database port.** The release compose file's `db` stops publishing 5432; the API and
the backup service reach it over the stack's private network, and `docker compose exec db psql` (the form every operator
procedure uses) is unaffected. The dev stack keeps its port, which local development needs. (Built in milestone two.)

## Consequences

- The API image carries the PostgreSQL 17 client tools (Alpine 3.24 offers `postgresql17-client` 17.11, read from the
  package index on 2026-10-14) and **must move major version with the `db` image**: a `pg_dump` refuses a server newer than
  itself, so a `db` upgrade to 18 needs the client bumped in the same release. The script checks first and fails with both
  versions in the message rather than writing a bad copy.
- An update that carries a database change is down for as long as the pre-update copy takes — the same figure
  `LAST-BACKUP.txt` reports for each nightly copy. A broken or full backups folder **and** such an update coincide to hold
  it; the first is normally visible a day ahead because the nightly copy is failing for the same reason.
- **Copies are a second copy of everything, including what the application later removes.** The newest copy of each
  kind is never pruned, so data erased or soft-deleted since (and the password hashes of removed accounts) persists in it
  however old, until an operator deletes the file; the `<db>_before_restore_*` databases a restore keeps stay until
  removed by hand; and copies are **unencrypted at rest** (the folder is mode 700 and the script warns, without
  refusing, when it is more open). A right-to-erasure request (ADR-0085) therefore has a step it did not have before.
- **The backups folder is trusted input.** A dump is restored by the connecting role, which on the Compose stack is a
  superuser, and a hostile dump can carry code that runs as that role. The script verifies the checksum a copy was
  written with, not who wrote the file: only copies from the operator's own folder should ever be restored.
- Copies sit on the same disk as the database and do not survive losing the server. This is the owner's decision and the
  guide says so plainly; D7 is how that is improved later.
- The copies contain credentials (password hashes, sessions, verification tokens): the folder is mode 700, files 600
  (`umask 077`), and the backup container receives database credentials only.
- An operator who connected a database tool from another computer loses that access once the port is closed (D10).
- **The script reads test-only environment variables in production, and they are not a secret-free surface.**
  `BACKUP_ROOT`, `BACKUP_NOW`, `BACKUP_SCHEDULE_ITERATIONS`, `BACKUP_POLL_SECONDS`, `BACKUP_FIRST_RETRY_SECONDS`,
  `MIGRATIONS_DIR` and `BACKUP_MIN_FREE_KB` exist so CI can drive the shipped script rather than a copy of its logic.
  Anything that can set them changes where copies are written, what "pending" means, or the free-space floor, so none
  may be passed through from an untrusted source (a compose `environment:` entry built from user input, a
  `.env` an unprivileged party can edit). The compose files set none of them.
- **A migration on update can wait behind a running nightly copy.** `pg_dump` holds `ACCESS SHARE` locks; a migration
  that alters a table needs `ACCESS EXCLUSIVE` on it and queues until the dump releases the table. The update is
  therefore slower by up to one dump's duration; it does not fail (the migration has no lock timeout that the dump
  could trip), and meanwhile the owner sees the API on "applying migrations" in `docker compose logs api`. Nothing is
  coded for this; the pre-update copy itself uses `--lock-wait-timeout=60s` and so fails rather than waits.

## Evidence (ADR-0076)

- The runtime image is `node:22-alpine`, which on 2026-10-14 is **Alpine 3.24.2** (`/etc/alpine-release` read from the image
  layer through the registry), and its `node` user is **uid 1000** (`/etc/passwd`, same read). Alpine 3.24's `main`
  repository lists `postgresql17-client` 17.11-r0 (`APKINDEX`, `P:postgresql17-client`).
- `ALTER TABLE … ENABLE ALWAYS TRIGGER` survives `pg_dump`/`pg_restore`: the script's check requires at least two
  `audit_events` triggers with `tgenabled = 'A'` in every loaded copy, and the round trip compares every trigger's state.
- The script's logic was run under busybox `ash` and busybox applets (`find -mmin`, `sha256sum`, `df -P`, `date -d @`),
  the userland the image ships, by `scripts/backup-restore-check.sh`.

## References

- `apps/api/backup/schedulepoint-backup.sh`, `apps/api/Dockerfile`, `scripts/backup-restore-check.sh`,
  `.github/workflows/ci.yml` (`e2e-api`, "Backup and restore round trip").
- ADR-0018, ADR-0047, ADR-0072, ADR-0096, ADR-0110, ADR-0160, ADR-0190.
