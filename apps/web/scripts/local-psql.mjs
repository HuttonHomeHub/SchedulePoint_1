import { execFileSync } from 'node:child_process';

/**
 * One `psql` seam for the benchmark and fixture harnesses, with a guard on where it connects.
 *
 * **These scripts bulk-write.** The landing benchmark inserts 3,000 plans and 120,000 activities at
 * its largest shape; the fixture ages an invitation with an `UPDATE`. They resolve their target
 * from `DATABASE_URL`, and a developer who happens to have that exported to a shared or staging
 * database in their shell would seed a hundred thousand rows into it — while the harness reported
 * perfectly plausible numbers the whole time. That is `docs/TECH_DEBT.md` #328, and this closes it.
 *
 * **The guard is an allow-list on the resolved HOST, and the URL is rebuilt from parsed parts.**
 * Not a substring check: `postgresql://user@evil.example/db?host=localhost` contains the word and is
 * not local. `new URL` decides what the hostname is, the same way the client will.
 *
 * Set `SP_ALLOW_REMOTE_PSQL=1` to mean it deliberately — an opt-out that has to be typed, rather
 * than a default that has to be noticed.
 *
 * CodeQL flagged the ungated version of this dataflow on the pull request that introduced it
 * (environment value reaching a command line). The row above had already named the same weakness
 * from the other direction, which is why this is a fix rather than a dismissal.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);
const DEFAULT_URL = 'postgresql://app:app@localhost:5432/app?schema=public';

export function psqlUrl() {
  const parsed = new URL(process.env.DATABASE_URL ?? DEFAULT_URL);

  if (!LOCAL_HOSTS.has(parsed.hostname) && process.env.SP_ALLOW_REMOTE_PSQL !== '1') {
    throw new Error(
      `Refusing to run a harness against ${parsed.hostname}: these scripts bulk-insert and update, ` +
        `and DATABASE_URL does not point at a local database. Unset it, point it at localhost, or ` +
        `set SP_ALLOW_REMOTE_PSQL=1 if you genuinely mean it.`,
    );
  }

  // `psql` refuses the `?schema=public` Prisma appends (`invalid URI query parameter: "schema"`).
  // Deleting the parameter and re-serialising is exact where the previous regex was approximate,
  // and it means the string handed to the command line is one this module composed rather than one
  // it was handed.
  parsed.searchParams.delete('schema');
  return parsed.toString();
}

/** One query, ON_ERROR_STOP so a failed statement is an exception rather than a quiet zero. */
export function psql(sql, { flag = '-tAc', maxBuffer = 64 * 1024 * 1024 } = {}) {
  return execFileSync('psql', [psqlUrl(), '-v', 'ON_ERROR_STOP=1', flag, sql], {
    encoding: 'utf8',
    maxBuffer,
  });
}
