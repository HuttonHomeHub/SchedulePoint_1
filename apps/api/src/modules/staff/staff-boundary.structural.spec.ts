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
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
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
});
