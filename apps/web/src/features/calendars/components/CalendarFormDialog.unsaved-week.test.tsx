import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The working week must count as unsaved work** — the one surface in the app whose user input
 * lives outside react-hook-form.
 *
 * `CalendarFormDialog` holds its seven-day shift rows in `useState`, deliberately (the rows are
 * text a planner is mid-way through typing, and RHF's validation model would have to be taught that
 * `8:` is a legitimate intermediate state). The consequence is that `formState.isDirty` is blind to
 * them: a planner can rewrite every day's hours and the form still reports itself clean.
 *
 * The M0 inventory found this to be the ONLY such surface, which makes it the sharpest case the
 * guard has and the easiest to lose in a later refactor — registering on `isDirty` alone looks
 * completely reasonable and silently drops it. Asserted structurally because the alternative is
 * mounting a dialog whose week editor needs a resolved calendar list; the census gate beside this
 * one cannot see it, because that file IS registered either way.
 */
const source = readFileSync(join(__dirname, 'CalendarFormDialog.tsx'), 'utf8');

describe('the calendar form counts a changed working week as unsaved', () => {
  it('registers on a week comparison, not on isDirty alone', () => {
    expect(source).toContain('weekChanged');
    expect(source).toMatch(/open && \(isDirty \|\| weekChanged\)/);
  });

  it('compares against the week captured when the dialog opened', () => {
    expect(source).toContain('setSeededWeek(seededWeek)');
  });
});
