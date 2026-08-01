import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkingDayCalendar } from '../render/time-scale';

import { TsldPanel } from './TsldPanel';

/**
 * Regression, reported from the field: "I had an activity that was 4 working days but was drawn 6
 * days as 2 were over a weekend. I extended the bar one space and it grew to 9 days (7 working)."
 *
 * The resize gesture measures in CANVAS COLUMNS, but `durationDays` is a WORKING-day duration — the
 * same unit mismatch the create path had, one seam further along. The 6-column bar plus one column
 * was sent as `durationDays: 7`, and the engine laid out seven *working* days: nine calendar days.
 * One column of drag has to mean one working day of growth.
 */

// Mon–Fri (bit 0 = Monday … bit 4 = Friday), no dated exceptions.
const MON_TO_FRI: WorkingDayCalendar = { workingWeekdays: 0b0011111, exceptions: new Map() };

const NO_DEPS: DependencySummary[] = [];

/**
 * The reported activity: 4 working days from Thu 1 Jan 2026 — Thu, Fri, Mon, Tue — so it finishes
 * Tue 6 Jan and occupies SIX columns (day offsets 0–5), two of them a weekend.
 */
function fourDayOverAWeekend(): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: 'A100',
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 4,
    durationMinutes: 1920,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex: 0,
    scheduleAsLateAsPossible: false,
    expectedFinish: null,
    status: 'NOT_STARTED',
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    remainingDurationDays: null,
    suspendDate: null,
    resumeDate: null,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-06',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-06',
    totalFloat: 0,
    freeFloat: null,
    isCritical: false,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: null,
    visualEffectiveStart: null,
    visualEffectiveFinish: null,
    visualConflict: false,
    visualDriftDays: null,
    levelingPriority: null,
    leveledStart: null,
    leveledFinish: null,
    levelingDelayDays: null,
    levelingWindowExceeded: false,
    selfOverAllocated: false,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    physicalPercentComplete: null,
    budgetedExpense: null,
    actualExpense: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

/**
 * Drag the finish grab-zone one column right. At the default viewport (14 px/day, originX 40) the
 * six-column bar spans x 40–124, so its finish zone is the last few px before 124; x 130 is day
 * column 6 — one column further right.
 */
function dragFinishOneColumnRight(calendar: WorkingDayCalendar | null): ReturnType<typeof vi.fn> {
  const onResize = vi.fn().mockResolvedValue({ applied: true, conflict: null });
  const utils = render(
    <TsldPanel
      activities={[fourDayOverAWeekend()]}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      calendar={calendar}
      canEdit
      onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
      onResize={onResize}
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  fireEvent.pointerDown(canvas, { clientX: 120, clientY: 54, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 130, clientY: 54, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 130, clientY: 54, pointerId: 1 });
  return onResize;
}

describe('TsldPanel finish-edge resize — one column of drag is one working day', () => {
  it('grows a 4-day bar spanning a weekend to 5 working days, not 7', () => {
    const onResize = dragFinishOneColumnRight(MON_TO_FRI);
    // Seven drawn columns (Thu–Wed) hold five working days: Thu, Fri, Mon, Tue, Wed.
    expect(onResize).toHaveBeenCalledWith({ activityId: 'a1', durationDays: 5 });
  });

  it('sends the raw column count when the plan has no calendar loaded (the prior behaviour)', () => {
    const onResize = dragFinishOneColumnRight(null);
    expect(onResize).toHaveBeenCalledWith({ activityId: 'a1', durationDays: 7 });
  });
});
