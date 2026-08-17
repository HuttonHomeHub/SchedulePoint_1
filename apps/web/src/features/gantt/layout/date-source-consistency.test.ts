import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { GANTT_COLUMNS } from './grid-columns';
import { buildRows, rowsDateSpan, sortActivities, type GanttSort } from './row-model';

/**
 * **`docs/TECH_DEBT.md` #135's other three-quarters: the Gantt's own row disagrees with itself.**
 *
 * The 2026-08-17 fix threaded a `BarDateSource` through `barGeometry` on both surfaces and stopped
 * there. Everything else that answers "when does this activity happen" kept reading `earlyStart`/
 * `earlyFinish` unconditionally, so in a **VISUAL** plan the same row shows a bar in February and a
 * **Start cell reading January** — a contradiction visible on one screen, where the original defect
 * at least needed two.
 *
 * That is the worse half, not a smaller one. `grid-columns.ts`'s own docblock says the bar is
 * "decorative reinforcement, not the only carrier" and the cells are what a screen-reader user
 * reads (spec GV-3) — so the accessible content was the wrong date, with no bar to contradict it,
 * and the printed programme carried it into the meeting.
 *
 * Four sites, found by reading `grid-columns.ts` while adding M2's Duration column rather than from
 * a report:
 *
 * 1. **The text cells** (`grid-columns.ts:34-43`) — the accessible carrier, above.
 * 2. **The sort** (`row-model.ts:123-126`) — "Start" ordered rows by a date the grid was no longer
 *    displaying, so a VISUAL plan sorted by Start looked simply unsorted.
 * 3. **The span** (`row-model.ts:270`) — the chart's framed extent. This one is sharpest: a bar the
 *    engine pushed past the early finish falls **outside the frame**, so the chart cannot contain
 *    its own bars. And `rowsDateSpan` was already internally inconsistent — the **bucket** branch
 *    three lines above (`:269`) had been made source-aware and the activity branch had not.
 * 4. **A duplicated resolver** (`wbs-groups.ts:66-78`) — `drawnSpan` is `barDatesFor` rewritten,
 *    written before `lib/bar-dates.ts` existed and left behind when it arrived. Exactly the second
 *    implementation that module's docblock exists to prevent (the ADR-0065 `routeOrthogonal`
 *    argument), sitting one import away from it.
 *
 * **Verified red first.** Every case below fails against the previous code; the EARLY-mode cases
 * stay green throughout, which is what proves the fix is a widening rather than a swap.
 */

/** Early: 1–5 Jan. Visual: 1–7 Feb — a month later, so a wrong pair cannot coincidentally match. */
const PLACED = {
  id: 'a1',
  name: 'Placed',
  code: 'A1',
  type: 'TASK',
  laneIndex: 0,
  parentId: null,
  durationDays: 5,
  earlyStart: '2026-01-01',
  earlyFinish: '2026-01-05',
  visualEffectiveStart: '2026-02-01',
  visualEffectiveFinish: '2026-02-07',
  lateStart: '2026-03-01',
  lateFinish: '2026-03-05',
  totalFloat: 0,
} as unknown as ActivitySummary;

/** Early: 10–14 Jan (LATER than PLACED). Visual: 1–5 Jan (EARLIER) — so the two orders differ. */
const OTHER = {
  id: 'a2',
  name: 'Other',
  code: 'A2',
  type: 'TASK',
  laneIndex: 1,
  parentId: null,
  durationDays: 5,
  earlyStart: '2026-01-10',
  earlyFinish: '2026-01-14',
  visualEffectiveStart: '2026-01-01',
  visualEffectiveFinish: '2026-01-05',
  lateStart: '2026-03-10',
  lateFinish: '2026-03-14',
  totalFloat: 0,
} as unknown as ActivitySummary;

const cell = (label: string, activity: ActivitySummary, source: 'early' | 'visual' | 'late') => {
  const column = GANTT_COLUMNS.find((c) => c.label === label);
  if (column === undefined) throw new Error(`no column labelled ${label}`);
  return column.value(activity, source);
};

describe('the Gantt grid reads the same dates its bars are drawn from', () => {
  it('prints the early dates by default — every EARLY-mode plan, unchanged', () => {
    expect(cell('Start', PLACED, 'early')).toContain('1 Jan');
    expect(cell('Finish', PLACED, 'early')).toContain('5 Jan');
  });

  it('prints the effective-Visual dates in a VISUAL plan', () => {
    expect(cell('Start', PLACED, 'visual')).toContain('1 Feb');
    expect(cell('Finish', PLACED, 'visual')).toContain('7 Feb');
  });

  it('prints the late dates under the Late overlay', () => {
    expect(cell('Start', PLACED, 'late')).toContain('1 Mar');
    expect(cell('Finish', PLACED, 'late')).toContain('5 Mar');
  });

  it('shows an em dash for an activity with no placement, rather than falling back', () => {
    // A fallback would print a date the engine never assigned this activity under this projection —
    // the same class of lie as the original defect, and worse in text than in pixels because a cell
    // reads as a fact.
    const unplaced = { ...PLACED, visualEffectiveStart: null, visualEffectiveFinish: null };
    expect(cell('Start', unplaced as ActivitySummary, 'visual')).toBe('—');
    expect(cell('Finish', unplaced as ActivitySummary, 'visual')).toBe('—');
  });
});

describe('the Gantt sorts by the dates it is showing', () => {
  const byStart: GanttSort = { key: 'earlyStart', direction: 'asc' };

  it('orders by the early dates by default', () => {
    const ordered = sortActivities([PLACED, OTHER], byStart);
    expect(ordered.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('orders by the effective-Visual dates in a VISUAL plan', () => {
    // OTHER is placed a month before PLACED, so the order INVERTS. Sorting by a column the grid is
    // not displaying is indistinguishable from not sorting at all.
    const ordered = sortActivities([PLACED, OTHER], byStart, 'visual');
    expect(ordered.map((a) => a.id)).toEqual(['a2', 'a1']);
  });
});

const BY_WBS: GanttSort = { key: 'wbs', direction: 'asc' };

describe('the chart frames the bars it actually draws', () => {
  it('spans the early dates by default', () => {
    const rows = buildRows([PLACED, OTHER], BY_WBS);
    expect(rowsDateSpan(rows)).toEqual({ start: '2026-01-01', finish: '2026-01-14' });
  });

  it('spans the effective-Visual dates in a VISUAL plan', () => {
    // The failure this guards: with the early span, PLACED's February bar sits beyond the framed
    // extent — a chart that does not contain its own content, which reads as a rendering fault
    // rather than as a date bug.
    const rows = buildRows([PLACED, OTHER], BY_WBS, new Set(), { barDateSource: 'visual' });
    expect(rowsDateSpan(rows, 'visual')).toEqual({ start: '2026-01-01', finish: '2026-02-07' });
  });
});
