import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BAR_HEIGHT, BAR_PAD } from '../render/geometry';
import type { WorkingDayCalendar } from '../render/time-scale';
import { DEFAULT_VIEWPORT } from '../render/viewport';

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * The screen y of lane 0's bar centre-line in the default viewport. Derived, not written as a
 * number: it was the literal 54, the top edge of the old row's 24 px pointer target, and fell
 * outside the target when the row grew to 60 (NetPoint-layout M1).
 */
const LANE0_Y = DEFAULT_VIEWPORT.originY + BAR_PAD + BAR_HEIGHT / 2;

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
  return anActivity({
    durationDays: 4,
    durationMinutes: 1920,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-06',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-06',
    totalFloat: 0,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    accrualType: 'UNIFORM',
  });
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
  fireEvent.pointerDown(canvas, { clientX: 120, clientY: LANE0_Y, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 130, clientY: LANE0_Y, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 130, clientY: LANE0_Y, pointerId: 1 });
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
