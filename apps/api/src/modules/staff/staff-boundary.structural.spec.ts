import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The boundary ADR-0086 rests on, asserted rather than described.**
 *
 * The epic's central claim is that staff cannot reach customer data *by construction* — a compile
 * error, not a check somebody remembers. Three things make that true, and each of them is exactly
 * the kind of property a well-meaning refactor erases while every other test stays green:
 *
 *   1. `StaffPrincipal` declares no `memberships` and no `can`. Add either and it becomes
 *      structurally assignable to `Principal`, and every member service in the product silently
 *      accepts a staff caller. Nothing else in the suite would notice.
 *   2. Nothing under `modules/staff/` imports an org-scoped module's service or repository. One
 *      convenience import is all it takes for the console to start reading plans.
 *   3. Nothing under `modules/staff/` imports the CPM engine.
 *
 * The ADR-0053 §2 `seam-set` precedent: where a guarantee is structural, test the structure. A test
 * that drove the behaviour instead would prove the boundary holds for the routes that exist today
 * and say nothing about the one added next week.
 */

const STAFF_DIR = join(__dirname);
const AUTH_DIR = join(__dirname, '..', '..', 'common', 'auth');

/**
 * Source with comments removed.
 *
 * Necessary rather than fastidious: these files DESCRIBE the boundary at length, so a naive scan
 * matches the prose explaining the rule and reports the file as breaking it. The first version of
 * this suite did exactly that — `StaffPrincipal`'s own docblock says it has "no `can()`", and the
 * check for `can(` found those five characters. A comment cannot grant access to anything, so
 * stripping them narrows the scan to what actually executes.
 */
function code(path: string): string {
  return code_of(readFileSync(path, 'utf8'));
}

/** The same stripping, over a string — so a synthetic source can be passed to the same predicate. */
function code_of(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Every `.ts` under `modules/staff/` — **tests included**, because a test may not reach across the
 * boundary either: a spec that imports `PlanRepository` to build a fixture has put the import in
 * the module and only luck keeps it out of the shipped path.
 *
 * This file is the one exclusion, and it is not special pleading: it holds the forbidden strings as
 * DATA, so scanning itself makes the gate fail on its own contents and report every rule as
 * violated by the file enforcing them. Verified by removing the exclusion — five failures, all of
 * them this file.
 */
function staffSources(dir: string = STAFF_DIR): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return staffSources(path);
    return path.endsWith('.ts') && path !== __filename ? [path] : [];
  });
}

describe('the staff boundary (ADR-0086)', () => {
  it('gives StaffPrincipal no memberships and no can()', () => {
    const source = code(join(AUTH_DIR, 'staff-principal.ts'));

    // Not a type-level assertion, because the whole point is that this must fail LOUDLY at the
    // moment somebody adds the field — and a type test would only fail once a caller depended on it.
    expect(source).not.toMatch(/\bmemberships\b\s*[:?]/);
    expect(source).not.toMatch(/\bcan\s*\(/);
    expect(source).not.toMatch(/\borganizationId\b\s*[:?]/);
    expect(source).not.toMatch(/\brole\b\s*[:?]/);
  });

  it('imports no org-scoped module from anywhere under modules/staff', () => {
    // The 20 org-scoped modules. Named explicitly rather than derived by "every sibling directory",
    // because a derived list would quietly shrink to nothing if the directory layout changed, and a
    // gate that can pass by finding nothing is not a gate.
    const orgScoped = [
      'activities',
      'baselines',
      'calendars',
      'clients',
      'cross-plan-dependencies',
      'dependencies',
      'interchange',
      'invitations',
      'members',
      'notes',
      'organizations',
      'plan-lock',
      'plans',
      'projects',
      'recycle-bin',
      'resources',
      'schedule',
      'share',
    ];

    const offenders: string[] = [];
    for (const file of staffSources()) {
      const source = code(file);
      for (const module of orgScoped) {
        if (source.includes(`../${module}/`)) offenders.push(`${file} → ${module}`);
      }
    }

    expect(offenders, 'the staff console must not import an org-scoped module').toEqual([]);
  });

  it('never imports the CPM engine', () => {
    const offenders = staffSources().filter((file) => code(file).includes('schedule/engine'));

    expect(offenders, 'the staff console must not import the CPM engine').toEqual([]);
  });

  it('reads no customer entity through Prisma', () => {
    // The second line of defence behind the import rule, and the one that catches the shortcut a
    // developer actually reaches for: `PrismaService` is global, so a staff service can query
    // `prisma.plan` without importing anything from `modules/plans` at all — passing the test above
    // while doing exactly what it exists to prevent.
    const forbidden = [
      'prisma.client',
      'prisma.project',
      'prisma.plan',
      'prisma.activity',
      'prisma.note',
      'prisma.baseline',
      'prisma.resource',
      'prisma.calendar',
    ];

    const offenders: string[] = [];
    for (const file of staffSources()) {
      const source = code(file);
      for (const accessor of forbidden) {
        if (source.includes(accessor)) offenders.push(`${file} → ${accessor}`);
      }
    }

    expect(offenders, 'the staff console must not read a customer entity').toEqual([]);
  });

  /**
   * **Gate S-3 (ADR-0140 D4) — raw SQL, which the assertion above structurally cannot see.**
   *
   * The forbidden list above is Prisma **accessor strings**. `prisma.$queryRaw` matches none of
   * them, so every rule this file enforces could be walked around by writing SQL — and the fact
   * that ADR-0140 needed raw SQL is exactly why the gate had to be widened BEFORE the query
   * existed. Choosing `$queryRaw` because the gate cannot see it would be exploiting a blind spot
   * and calling it compliance.
   *
   * One exception, named by PATH rather than by directory, so it cannot become a licence for the
   * next file in the same folder. `$queryRawUnsafe` and `$executeRaw` have NO exception at any
   * path: string-built SQL is refused outright, and the console does not write to a customer table.
   *
   * **Blind spot, stated rather than implied:** this reads source text, so a raw query reached
   * through a helper defined in another module is invisible to it. The import rule above is the
   * defence for that case, and neither assertion covers both.
   */
  const RAW_SQL_EXCEPTIONS: Readonly<Record<string, string>> = {
    'staff-diagnostics.repository.ts':
      'ADR-0140 D5. The predicate compares hours_per_day_minutes on two calendar rows resolved ' +
      'through a three-rung COALESCE per activity, which the Prisma query API cannot express; the ' +
      'typed alternative would load candidate customer rows INTO this process, which is strictly ' +
      'worse for the boundary. Every customer value stays in Postgres and only integers cross. ' +
      'Held by gates S-1 (all-numeric DTO), S-2 (no handler input) and S-4 (projection is counts ' +
      'only).',
    'staff-diagnostics.repository.spec.ts':
      'Its Prisma stub DECLARES a $queryRaw property; it calls nothing and no client exists in a ' +
      'unit test to call. The scan reads source text and cannot separate a mock from a query, so ' +
      'the choice was an exception or a rule change — and narrowing the rule to exclude specs was ' +
      'refused, because the gate deliberately covers tests (a spec importing PlanRepository to ' +
      'build a fixture has put that import in the module). One named file is the smaller change. ' +
      'The import assertion above still covers this file unchanged.',
  };

  /**
   * The predicate, separated from the files it runs over, so the pinned positive below can feed it
   * a source that IS an offender. That separation is the whole point: a positive case which asserts
   * that this file contains the strings it bans is circular — they are here as data, so it passes
   * whatever the scan actually does with them.
   */
  function rawSqlOffenders(sources: readonly { path: string; source: string }[]): string[] {
    const offenders: string[] = [];
    for (const { path, source } of sources) {
      const name = path.slice(path.lastIndexOf('/') + 1);

      // No exception exists for either of these, at any path.
      for (const banned of ['$queryRawUnsafe', '$executeRaw']) {
        if (source.includes(banned)) offenders.push(`${path} → ${banned} (no exception exists)`);
      }

      if (source.includes('$queryRaw') && !RAW_SQL_EXCEPTIONS[name]) {
        offenders.push(`${path} → $queryRaw (not a declared exception)`);
      }
    }
    return offenders;
  }

  it('runs no raw SQL outside the one declared exception', () => {
    const sources = staffSources().map((path) => ({ path, source: code(path) }));

    expect(
      rawSqlOffenders(sources),
      'raw SQL under modules/staff needs a declared exception',
    ).toEqual([]);
  });

  it('makes every raw-SQL exception carry a reason, and names no file twice', () => {
    // An exception with an empty reason is an exception nobody has to justify, which is how a
    // one-file carve-out becomes a directory-wide one. The length floor is the shape
    // `dependency-claims.json` and `adr-coverage.json` already use.
    for (const [name, reason] of Object.entries(RAW_SQL_EXCEPTIONS)) {
      expect(name, 'an exception names a file, never a directory').not.toContain('/');
      expect(reason.length, `the ${name} exception must carry a reason`).toBeGreaterThan(80);
    }
  });

  /**
   * The pinned positive case for S-3.
   *
   * "No staff file runs raw SQL without an exception" passes perfectly against a scan that found no
   * staff files at all — ADR-0108's census did exactly that on its first run, and ADR-0093 records
   * the general shape. This asserts the population is non-empty and that the scan can actually see
   * the strings it is looking for, by matching them against a synthetic source rather than against
   * this file (which is excluded from `staffSources()` precisely because it holds them as data).
   */
  it('has a non-empty population, and catches an offender when it sees one', () => {
    expect(staffSources().length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(RAW_SQL_EXCEPTIONS).length).toBeGreaterThan(0);

    // Three synthetic sources, one per rule. A file that merely names the strings in a COMMENT must
    // NOT be an offender, which is the fourth case and the one that has caught four gates in this
    // repository by reporting their own docblocks as violations.
    const caught = rawSqlOffenders([
      { path: 'a/somewhere.service.ts', source: 'await this.prisma.$queryRaw`select 1`;' },
      {
        path: `a/${Object.keys(RAW_SQL_EXCEPTIONS)[0]}`,
        source: 'await this.prisma.$queryRawUnsafe(sql);',
      },
      { path: 'a/writer.service.ts', source: 'await this.prisma.$executeRaw`update x set y = 1`;' },
      {
        path: 'a/prose.service.ts',
        source: code_of('// we never call $queryRaw here\nconst x = 1;'),
      },
    ]);

    expect(caught).toHaveLength(3);
    expect(caught[0]).toContain('not a declared exception');
    expect(caught[1]).toContain('no exception exists');
    expect(caught[2]).toContain('$executeRaw');
  });

  it('keeps the activity filter byte-identical to the partial index that serves it', () => {
    // `idx_audit_events_staff_occurred` is partial on `action LIKE 'staff.%'`, and Postgres matches
    // a partial index by **expression equality**, not by pattern containment — measured, not
    // assumed: a strictly NARROWER predicate (`LIKE 'staff.panel%'`) seq-scans just as a wider one
    // does. So `startsWith: 'staff.'` is not a stylistic choice; it is the index's only key.
    //
    // Changing it to anything else — a longer prefix, an `in` list, an equality — silently reverts
    // this read to a full scan of a table that grows forever and has no retention sweep. There is
    // no error, nothing fails, and the panel simply gets slower every month. Measured at 500,334
    // rows: 0.02–0.13 ms indexed against 23–40 ms scanning.
    const source = code(join(STAFF_DIR, 'staff-health.service.ts'));

    expect(
      source,
      "the activity filter must stay `startsWith: 'staff.'` — see the migration",
    ).toContain("action: { startsWith: 'staff.' }");
  });
});
