import type { ActivityType, ConstraintType } from '@repo/types';
import { describe, expect, it } from 'vitest';

import { computeSchedule } from './compute';
import type { EngineActivity, EngineEdge } from './types';
import {
  allMinutesWorkCalendar,
  buildWorkingTimeCalendar,
  fullDayWeek,
  type WorkingTimeCalendar,
} from './working-time-calendar';

/**
 * **A finish milestone is dated by the day it closes** (#381; amends ADR-0023 §4;
 * `docs/specs/finish-milestone-date/`).
 *
 * A finish milestone sits on the boundary its predecessor finishes at. ADR-0023 dated a zero-duration
 * node by the working minute AFTER that boundary, so after a Friday finish it read Monday, and every
 * date given for it (placement, constraint, external date) was read as the START of its day, a day
 * before the moment it marks. So a planner who dropped one on its predecessor's last day was told it
 * was early, and `FNLT` on that day gave a false day of negative float. These cases pin the new rule
 * and the edges it must not cross.
 *
 * Plan calendar: Monday–Friday full days; `DATA_DATE` is Monday 5 Jan 2026. Task A (5 days) runs
 * Monday 5 Jan to Friday 9 Jan.
 */
const DATA_DATE = '2026-01-05';
const DAY = 1440;
const FIVE_DAY: WorkingTimeCalendar = buildWorkingTimeCalendar(fullDayWeek([0, 1, 2, 3, 4]), []);

function act(
  id: string,
  durationMinutes: number,
  type: ActivityType = 'TASK',
  extra: Partial<EngineActivity> = {},
): EngineActivity {
  return { id, durationMinutes, type, ...extra };
}

function fs(predecessorId: string, successorId: string): EngineEdge {
  return {
    id: `${predecessorId}-${successorId}`,
    predecessorId,
    successorId,
    type: 'FS',
    lagMinutes: 0,
  };
}

function run(
  activities: readonly EngineActivity[],
  edges: readonly EngineEdge[],
  calendar: WorkingTimeCalendar = FIVE_DAY,
) {
  const out = computeSchedule(activities, edges, { dataDate: DATA_DATE, calendar });
  return {
    out,
    get: (id: string) => out.results.find((r) => r.activityId === id)!,
  };
}

const A = act('A', 5 * DAY);
const milestone = (extra: Partial<EngineActivity> = {}) => act('M', 0, 'FINISH_MILESTONE', extra);
const constrained = (type: ConstraintType, date: string) =>
  milestone({ constraintType: type, constraintDate: date });

describe('a finish milestone reads its predecessor’s last day (#381)', () => {
  it('reads Friday after a task ending Friday, where it read the following Monday', () => {
    const { get, out } = run([A, milestone()], [fs('A', 'M')]);
    expect(get('A').earlyFinish).toBe('2026-01-09');
    expect(get('M').earlyStart).toBe('2026-01-09');
    expect(get('M').earlyFinish).toBe('2026-01-09');
    expect(get('M').lateFinish).toBe('2026-01-09');
    expect(out.summary.projectFinish).toBe('2026-01-09');
  });

  it('keeps the instant: a successor of the milestone still starts the next working day', () => {
    const { get } = run([A, milestone(), act('B', DAY)], [fs('A', 'M'), fs('M', 'B')]);
    expect(get('B').earlyStart).toBe('2026-01-12');
  });

  it('never reads before the data date (FC-7)', () => {
    const { get } = run([milestone()], []);
    expect(get('M').earlyStart).toBe(DATA_DATE);
    expect(get('M').earlyFinish).toBe(DATA_DATE);
  });
});

describe('a finish milestone placed on its predecessor’s last day is not a conflict (FC-1)', () => {
  it('reports no conflict and no drift, and reads back the day it was placed on', () => {
    const { get } = run([A, milestone({ visualStart: '2026-01-09' })], [fs('A', 'M')]);
    expect(get('M').visualConflict).toBe(false);
    expect(get('M').visualDriftMinutes).toBe(0);
    expect(get('M').visualEffectiveStart).toBe('2026-01-09');
  });

  it('still flags a placement a day before the predecessor finishes (control)', () => {
    const { get } = run([A, milestone({ visualStart: '2026-01-08' })], [fs('A', 'M')]);
    expect(get('M').visualConflict).toBe(true);
    expect(get('M').visualConflictReason).toBe('EARLIER_THAN_LOGIC');
  });

  it('on a 24-hour calendar too, where the old reading was a day early on every day', () => {
    const { get } = run(
      [act('A', 5 * DAY), milestone({ visualStart: '2026-01-09' })],
      [fs('A', 'M')],
      allMinutesWorkCalendar,
    );
    expect(get('M').visualConflict).toBe(false);
    expect(get('M').visualEffectiveStart).toBe('2026-01-09');
  });
});

describe('a finish milestone’s constraint date means the end of that day (FC-9)', () => {
  it('meets FNLT on its predecessor’s last day exactly: float 0, not a day negative', () => {
    const { get } = run([A, constrained('FNLT', '2026-01-09')], [fs('A', 'M')]);
    // `-0` and `0` are the same float; the arithmetic yields `-0` and JSON prints both as `0`.
    // `toBe` compares with `Object.is`, which tells them apart, so the magnitude is asserted.
    expect(Math.abs(get('M').totalFloat)).toBe(0);
  });

  it('does not report a placement on that same day as past the FNLT ceiling', () => {
    const { get } = run(
      [
        A,
        milestone({
          constraintType: 'FNLT',
          constraintDate: '2026-01-09',
          visualStart: '2026-01-09',
        }),
      ],
      [fs('A', 'M')],
    );
    expect(get('M').visualConflictReason).toBeNull();
  });

  it('reads a start-type date back as typed (Q2 A)', () => {
    const { get } = run([constrained('SNET', '2026-01-14')], []);
    expect(get('M').earlyStart).toBe('2026-01-14');
  });
});

describe('what the rule leaves alone', () => {
  it('a START milestone still reads the day it starts', () => {
    const { get } = run([A, act('S', 0, 'START_MILESTONE')], [fs('A', 'S')]);
    expect(get('S').earlyStart).toBe('2026-01-12');
  });

  it('a zero-duration TASK still reads the day it starts (ADR-0035 §22; a separate question)', () => {
    const { get } = run([A, act('Z', 0, 'TASK')], [fs('A', 'Z')]);
    expect(get('Z').earlyStart).toBe('2026-01-12');
  });

  it('a completed finish milestone reports its actual finish verbatim', () => {
    const { get } = run(
      [
        // COMPLETE is derived from the actuals (`progress.ts`), so they are all a fixture needs.
        milestone({ actualStart: '2026-01-02', actualFinish: '2026-01-02' }),
      ],
      [],
    );
    expect(get('M').earlyFinish).toBe('2026-01-02');
  });
});
