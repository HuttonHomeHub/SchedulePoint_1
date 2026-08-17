import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { GANTT_COLUMNS } from './grid-columns';

/**
 * **M2-T1 — the Gantt's Duration column.**
 *
 * `PROJECT_BRIEF.md` §11 wants an editable duration; the chart did not have a column to *read* one.
 * A planner comparing two bars had to open each activity to learn which was longer, which is the
 * kind of gap that survives because every individual screen looks complete.
 *
 * The cases below are the two ADR-0070 M4 recorded shipping wrong on the activities table, checked
 * here **before** the same surface can repeat them:
 *
 * - a sub-day duration must read exactly (`4h`), never rounded to `0 d`;
 * - a **milestone** must read an em dash, because `0 d` made real sub-day work and a genuinely
 *   duration-less activity look identical on the one screen listing a plan's work.
 *
 * And the degraded branch: with no `hoursPerDay` the cell falls back to whole working days, the
 * same code path as `VITE_SUB_DAY_DURATIONS` off — so the rollback contract and the
 * calendar-not-yet-loaded state cannot rot separately.
 */

const EIGHT_HOUR = 8;

const durationColumn = GANTT_COLUMNS.find((c) => c.label === 'Duration');

const activity = (over: Partial<ActivitySummary>): ActivitySummary =>
  ({
    id: 'a1',
    name: 'Task',
    type: 'TASK',
    durationDays: 1,
    durationMinutes: 480,
    ...over,
  }) as unknown as ActivitySummary;

describe('the Duration column', () => {
  it('exists, and sorts by the duration key the row model already understood', () => {
    // `duration` was already a GanttSortKey with a comparator — the column was the missing half, so
    // the grid could sort by a quantity it declined to show.
    expect(durationColumn).toBeDefined();
    expect(durationColumn?.key).toBe('duration');
  });

  it('reads a sub-day duration exactly rather than rounding it to 0 d', () => {
    // 240 minutes on an eight-hour day is half a day. `0 d` here is the ADR-0070 M4 defect, and it
    // is worse on a chart: the bar is drawn, so the row asserts work and its own cell denies it.
    const half = activity({ durationDays: 0, durationMinutes: 240 });
    expect(durationColumn?.value(half, 'early', EIGHT_HOUR)).toBe('4h');
  });

  it('prints the row own whole-day value when the duration is whole days', () => {
    const twoDays = activity({ durationDays: 2, durationMinutes: 960 });
    expect(durationColumn?.value(twoDays, 'early', EIGHT_HOUR)).toBe('2 d');
  });

  it('reads a milestone as an em dash, not as zero duration', () => {
    const milestone = activity({ type: 'START_MILESTONE', durationDays: 0, durationMinutes: 0 });
    expect(durationColumn?.value(milestone, 'early', EIGHT_HOUR)).toBe('—');
  });

  it('degrades to whole working days when the calendar factor is unavailable', () => {
    // Not a guess and not a blank: the same rendering the flag-off build produces.
    const half = activity({ durationDays: 0, durationMinutes: 240 });
    expect(durationColumn?.value(half, 'early', undefined)).toBe('0 d');
  });

  it('ignores the bar-date source, because a duration is not a date', () => {
    const task = activity({ durationDays: 3, durationMinutes: 1440 });
    const early = durationColumn?.value(task, 'early', EIGHT_HOUR);
    expect(durationColumn?.value(task, 'visual', EIGHT_HOUR)).toBe(early);
    expect(durationColumn?.value(task, 'late', EIGHT_HOUR)).toBe(early);
  });
});
