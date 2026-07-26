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

  it('has exactly the three known calendar seams (plus the calendar’s own children)', () => {
    const withCalendarId = [...models.entries()]
      .filter(([, body]) => /^\s*calendarId\s/m.test(body))
      .map(([name]) => name)
      .sort();
    expect(withCalendarId).toEqual([...KNOWN_SEAMS, ...CALENDAR_CHILDREN].sort());
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

  it('BaselineActivity carries no calendar FK (a snapshot is a non-FK date copy, ADR-0025)', () => {
    const body = models.get('BaselineActivity');
    expect(body).toBeDefined();
    expect(body).not.toMatch(/calendarId/);
  });
});
