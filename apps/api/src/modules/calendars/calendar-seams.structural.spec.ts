import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** Every `model X { … }` block in the Prisma schema, keyed by model name. */
function prismaModels(): Map<string, string> {
  const schema = readFileSync(join(__dirname, '../../../prisma/schema.prisma'), 'utf8');
  const models = new Map<string, string>();
  const pattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(schema)) !== null) {
    const [, name, body] = match;
    if (name !== undefined && body !== undefined) models.set(name, body);
  }
  return models;
}

/**
 * A calendar FK is a SEAM: every column that binds a `calendar_id` must pass through the one
 * shared `assertCalendarUsableBy` guard (ADR-0053 §2), or a project-scoped calendar could be
 * bound outside its project and the tier would be a convention rather than an invariant.
 *
 * This test is the structural half of that argument. It pins down the exact set of calendar
 * seams the schema has, so ADDING one is a deliberate, reviewed act: a new `calendarId` on any
 * model fails here until it is added to the list below AND wired to the guard.
 *
 * The load-bearing case is `ActivityDependency`. The per-relationship LAG calendar is a
 * `LagCalendarSource` ENUM (PREDECESSOR / SUCCESSOR / TWENTY_FOUR_HOUR / PROJECT_DEFAULT), not
 * a calendar FK — it dereferences a calendar an endpoint already resolved (and therefore
 * already guarded), which is precisely why ADR-0053 adds no guard and no error for it. Should
 * a future slice give a relationship its own calendar FK, that argument silently stops holding
 * — so this test fails, forcing the guard to be wired in the same change.
 */
describe('calendar seams (structural)', () => {
  const models = prismaModels();

  /** The HOLDERS that bind a calendar — each wired to `assertCalendarUsableBy`. */
  const KNOWN_SEAMS = ['Plan', 'Activity', 'Resource'];
  /**
   * A calendar's own CHILD rows. Their `calendarId` is a parent pointer, not a binding: they
   * are only ever reached through their (already-scoped) calendar, so they are not seams.
   */
  const CALENDAR_CHILDREN = ['CalendarException', 'CalendarShift'];
  /**
   * FROZEN COPIES. A `calendar_id` that is a PLAIN correlation UUID with no foreign key and no
   * relation field — a snapshot recording WHICH calendar an activity was on at a past instant
   * (ADR-0025's copy-not-reference rule; the revision-snapshot extension). It binds nothing: it
   * is never client input, it is never resolved to schedule anything, it is immutable after
   * capture, and it may name a calendar that has since been hard-deleted by the ADR-0096 expiry.
   * There is therefore no write to guard and `assertCalendarUsableBy` has no call site here.
   *
   * This list is pinned like the other two, so joining it stays a deliberate reviewed act — AND
   * the property that earns the exemption is CHECKED below rather than asserted, because
   * "somebody put the name in a list" is not the same fact as "this column cannot bind".
   */
  const FROZEN_COPIES = ['BaselineActivity'];

  it('has exactly the three known calendar seams (plus children and frozen copies)', () => {
    const withCalendarId = [...models.entries()]
      .filter(([, body]) => /^\s*calendarId\s/m.test(body))
      .map(([name]) => name)
      .sort();
    expect(withCalendarId).toEqual([...KNOWN_SEAMS, ...CALENDAR_CHILDREN, ...FROZEN_COPIES].sort());
  });

  it('every seam and every calendar child really does carry the FK a frozen copy must not', () => {
    // The discriminator, checked in both directions so neither list can be satisfied by the wrong
    // kind of column. A seam has a `Calendar` relation field (so a row can be resolved and a write
    // needs guarding); a frozen copy has none.
    for (const name of [...KNOWN_SEAMS, ...CALENDAR_CHILDREN]) {
      expect(models.get(name), name).toMatch(/\bCalendar\s+@relation|Calendar\?\s+@relation/);
    }
    for (const name of FROZEN_COPIES) {
      const body = models.get(name);
      expect(body, name).toBeDefined();
      expect(body, `${name}.calendarId must be a plain UUID, not a relation`).not.toMatch(
        /Calendar\??\s+@relation/,
      );
      expect(body, `${name}.calendarId must be a plain UUID`).toMatch(
        /calendarId\s+String\?\s+@map\("calendar_id"\)\s+@db\.Uuid/,
      );
    }
  });

  it('ActivityDependency carries NO calendar FK — the lag calendar is an enum, not a seam', () => {
    const body = models.get('ActivityDependency');
    expect(body).toBeDefined();
    expect(body).not.toMatch(/calendarId/);
    expect(body).not.toMatch(/calendar_id/);
    // …and the lag calendar really is the enum the "no seam" argument depends on.
    expect(body).toMatch(/lagCalendar\s+LagCalendarSource/);
  });

  it('CrossPlanDependency carries no calendar FK either (ADR-0045 reads persisted dates)', () => {
    const body = models.get('CrossPlanDependency');
    expect(body).toBeDefined();
    expect(body).not.toMatch(/calendarId/);
  });

  it('BaselineActivity carries a calendar_id that is NOT a foreign key (ADR-0025)', () => {
    // This test used to assert the column did not exist at all, which was the right assertion
    // while a baseline froze no calendar. The revision-snapshot extension froze one, and the
    // invariant that actually matters survived the change intact: a snapshot is a COPY, never a
    // reference. Narrowed rather than deleted — a gate whose subject still exists and whose
    // assertion has gone stale is repaired, not removed.
    const body = models.get('BaselineActivity');
    expect(body).toBeDefined();
    expect(body).toMatch(/calendarId\s+String\?/);
    expect(body).not.toMatch(/Calendar\??\s+@relation/);
    // The same rule for the WBS parent frozen beside it: a plain correlation id in the SOURCE
    // activity's id space, not a self-relation into `baseline_activities`.
    expect(body).toMatch(/parentId\s+String\?/);
    expect(body).not.toMatch(/BaselineActivity\??\s+@relation/);
  });

  it('BaselineDependency carries no calendar FK either — its lag calendar is the same enum', () => {
    // The `ActivityDependency` argument, frozen: the per-relationship lag calendar is a
    // `LagCalendarSource` enum dereferencing a calendar an endpoint already resolved, so there is
    // no seam to guard. Should a future slice give a snapshot edge its own calendar FK, that
    // argument stops holding here exactly as it does for the live table.
    const body = models.get('BaselineDependency');
    expect(body).toBeDefined();
    expect(body).not.toMatch(/calendarId/);
    expect(body).not.toMatch(/calendar_id/);
    expect(body).toMatch(/lagCalendar\s+LagCalendarSource/);
  });
});
