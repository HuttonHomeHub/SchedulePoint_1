import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A recalculation must never stamp `updated_at`, `updated_by` or `version` on `plans`.
 *
 * **The organisation landing's freshness signal inverts silently if it does.** That screen asks
 * "has this plan been edited since it was last calculated?" by comparing the `GREATEST(plan,
 * newest activity, newest dependency)` it already computes against `schedule_computed_at`. If the
 * recalculation itself bumped `plans.updated_at`, then **every** freshly-recalculated plan would
 * report as edited-since — the signal would be on permanently, and a marker that is always on is
 * indistinguishable from one that is broken. Nothing about the recalculation would look wrong; the
 * landing would simply stop telling the truth, on every row.
 *
 * `stampScheduleComputedAt`'s own docblock already says it touches only engine-owned columns, and
 * ADR-0022 gives the reason (a recalculation must not bump the optimistic lock or masquerade as a
 * user edit). This turns that promise into a gate, because the obvious future edit — switching the
 * raw `$executeRaw` for a Prisma `update`, which is shorter and reads better — silently reintroduces
 * all three, and the only symptom is a sentence on another screen.
 *
 * **Comments are stripped before scanning.** Four gates in this repository have gone red or green
 * on their own prose, including one whose docblock explaining why a token must not be used counted
 * as using it (ADR-0106 M4).
 */
describe('stampScheduleComputedAt writes no user-owned columns', () => {
  const source = readFileSync(join(__dirname, 'schedule.repository.ts'), 'utf8');

  /** The statement itself, with block and line comments removed. */
  const statement = (() => {
    const start = source.indexOf('async stampScheduleComputedAt(');
    expect(start, 'stampScheduleComputedAt has been renamed or removed').toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('\n  }', start));
    return body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  })();

  it('sets none of updated_at, updated_by or version', () => {
    for (const column of ['updated_at', 'updated_by', 'version']) {
      expect(statement, `the recalculation stamp writes ${column}`).not.toMatch(
        new RegExp(`\\b${column}\\b`),
      );
    }
  });

  it('still writes the freshness cursor the landing reads', () => {
    // The pinned positive case. Without it the assertion above passes perfectly against a stamp
    // that has been emptied or deleted — a green suite that cannot tell "it writes no user columns"
    // from "it writes nothing at all" (ADR-0093).
    expect(statement).toMatch(/\bschedule_computed_at\s*=\s*now\(\)/);
    expect(statement).toMatch(/UPDATE plans/);
  });

  it('uses a raw UPDATE rather than a Prisma update', () => {
    // This is the specific edit that would reintroduce all three columns at once: Prisma's
    // `update` sets `updated_at` from the `@updatedAt` attribute and increments `version`, and it
    // is the shorter, more idiomatic-looking thing to reach for.
    expect(statement).toMatch(/\$executeRaw/);
    expect(statement).not.toMatch(/\bplan\.update\(/);
  });
});
