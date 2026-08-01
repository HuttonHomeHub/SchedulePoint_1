import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { WorkingDayCalendar } from '../render/time-scale';

import { TsldPanel } from './TsldPanel';

/**
 * Regression: a bar drawn across a weekend came back longer than it was drawn.
 *
 * The canvas x-axis is CALENDAR time — a weekend still occupies two columns — but `durationDays` is
 * a WORKING-day duration (ADR-0023/0036). The create path handed the raw column count straight
 * through, so a Friday→Tuesday drag (5 columns, 3 working days) was created as 5 working days and
 * the engine laid it out two days past where the pointer was released.
 */

// Mon–Fri (bit 0 = Monday … bit 4 = Friday), no dated exceptions.
const MON_TO_FRI: WorkingDayCalendar = { workingWeekdays: 0b0011111, exceptions: new Map() };

const NO_DEPS: DependencySummary[] = [];

function activity(): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Excavate',
    description: null,
    type: 'TASK',
    durationDays: 3,
    durationMinutes: 1440,
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
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
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
 * Draw a span and name it. At the default viewport (14 px/day, originX 40) a pointer x of 60 is day
 * column 1 and 120 is day column 5; the data date 2026-01-01 is a Thursday, so those are Fri 2 Jan
 * → Tue 6 Jan — five columns spanning one weekend.
 */
async function drawAndName(calendar: WorkingDayCalendar | null): Promise<ReturnType<typeof vi.fn>> {
  const onCreate = vi.fn().mockResolvedValue({ recalcConflict: null });
  const utils = render(
    <TsldPanel
      activities={[activity()]}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      calendar={calendar}
      canEdit
      onCreate={onCreate}
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
  fireEvent.pointerDown(canvas, { clientX: 60, clientY: 50, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 120, clientY: 50, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 120, clientY: 50, pointerId: 1 });
  fireEvent.change(await screen.findByLabelText('Name'), {
    target: { value: 'Pour slab' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
  await waitFor(() => expect(onCreate).toHaveBeenCalled());
  return onCreate;
}

describe('TsldPanel create — the drawn span is a calendar span, the duration is working days', () => {
  it('creates a Fri→Tue drag as 3 working days, not 5 columns', async () => {
    const onCreate = await drawAndName(MON_TO_FRI);
    // The seam still speaks in drawn days, so the inclusive end must imply the working duration:
    // endDay - startDay + 1 === 3.
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ startDay: 1, endDay: 3, name: 'Pour slab' }),
    );
  });

  it('keeps the raw column span when the plan has no calendar loaded (the prior behaviour)', async () => {
    const onCreate = await drawAndName(null);
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ startDay: 1, endDay: 5 }));
  });
});
