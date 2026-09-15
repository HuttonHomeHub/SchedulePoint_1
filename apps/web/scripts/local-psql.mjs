import { execFileSync } from 'node:child_process';

/**
 * One `psql` seam for the benchmark and fixture harnesses, with a guard on where it connects and
 * **no connection string on the command line at all**.
 *
 * **These scripts bulk-write.** The landing benchmark inserts 3,000 plans and 120,000 activities at
 * its largest shape; the fixture ages an invitation with an `UPDATE`. They resolve their target from
 * `DATABASE_URL`, and a developer who happens to have that exported to a shared or staging database
 * in their shell would seed a hundred thousand rows into it — while the harness reported perfectly
 * plausible numbers the whole time. That was `docs/TECH_DEBT.md` #328.
 *
 * Two independent things are wrong with handing that URL to `psql` as an argument, and this fixes
 * both rather than guarding one.
 *
 * **1. A connection URL in `argv` puts the password where anyone on the box can read it.** Process
 * arguments are world-readable (`ps -ef`, `/proc/<pid>/cmdline`); the environment of a child is not
 * readable by other users on Linux. So the parts go through `PGHOST`/`PGPORT`/`PGUSER`/
 * `PGPASSWORD`/`PGDATABASE` on the child's own environment, and `psql` is invoked with no
 * connection argument. This is the fix that removes the dataflow rather than barring it: nothing
 * derived from `DATABASE_URL` reaches a command line.
 *
 * **2. The target could be anywhere.** The allow-list is on the hostname **`new URL` resolves**,
 * not on a substring — `postgresql://u:p@evil.example/app?host=localhost` contains the word and is
 * not local. `SP_ALLOW_REMOTE_PSQL=1` is the opt-out, which has to be typed rather than noticed.
 *
 * CodeQL flagged the ungated version of this on the pull request that introduced it, and #328 had
 * already named the same weakness from the other direction. A dismissal was never an option
 * (CLAUDE.md §19.7), and a guard alone would have left the argv exposure in place — which nobody
 * had noticed until the alert made somebody read the line.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const DEFAULT_URL = 'postgresql://app:app@localhost:5432/app?schema=public';

/** The connection, as environment variables `psql` reads for itself. */
export function psqlEnv() {
  const parsed = new URL(process.env.DATABASE_URL ?? DEFAULT_URL);

  if (!LOCAL_HOSTS.has(parsed.hostname) && process.env.SP_ALLOW_REMOTE_PSQL !== '1') {
    throw new Error(
      `Refusing to run a harness against ${parsed.hostname}: these scripts bulk-insert and update, ` +
        `and DATABASE_URL does not point at a local database. Unset it, point it at localhost, or ` +
        `set SP_ALLOW_REMOTE_PSQL=1 if you genuinely mean it.`,
    );
  }

  return {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port === '' ? '5432' : parsed.port,
    PGUSER: decodeURIComponent(parsed.username),
    PGPASSWORD: decodeURIComponent(parsed.password),
    // Prisma's `?schema=` is not part of the database name, and `psql` refuses it as a URI
    // parameter (`invalid URI query parameter: "schema"`). Taking the path is exact where the
    // regex this replaced was approximate.
    PGDATABASE: parsed.pathname.replace(/^\//, ''),
  };
}

/** One query. `ON_ERROR_STOP` so a failed statement is an exception rather than a quiet zero. */
export function psql(sql, { flag = '-tAc', maxBuffer = 64 * 1024 * 1024 } = {}) {
  return execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', flag, sql], {
    encoding: 'utf8',
    maxBuffer,
    env: psqlEnv(),
  });
}
