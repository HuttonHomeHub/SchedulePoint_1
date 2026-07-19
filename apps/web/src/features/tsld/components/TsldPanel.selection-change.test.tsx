import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

/**
 * The F0 selection lift (toolbar quick-wins): `TsldPanel` reports its selection to the host via
 * `onSelectionChange` on every REAL transition (select / deselect), so the main toolbar's
 * selection-aware items track it. Proven here by driving a genuine selection (focusing the parallel
 * listbox selects the first activity, as a keyboard user would) and a genuine deselection (the
 * selected row vanishing from the live data reconciles the selection to null), rather than poking the
 * model setter — a broken effect/prop would fail.
 */
function activity(over: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: null,
    name: 'Survey',
    description: null,
    type: 'TASK',
    durationDays: 3,
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
    ...over,
  };
}

const A = activity({ id: 'a1', name: 'Survey' });
const NO_DEPS: DependencySummary[] = [];

describe('TsldPanel — onSelectionChange (F0 selection lift)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports the id when an activity is selected, and null when the selection clears', () => {
    const onSelectionChange = vi.fn();
    const { rerender } = render(
      <TsldPanel
        activities={[A]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        onSelectionChange={onSelectionChange}
      />,
    );
    // Mount reports the initial empty selection.
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);

    // A real select: focusing the parallel listbox rings the first activity.
    fireEvent.focus(screen.getByRole('listbox', { name: 'Activities in the diagram' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith('a1');

    // A real deselect: the selected row vanishes from the live data, so selection reconciles to null.
    rerender(
      <TsldPanel
        activities={[]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        onSelectionChange={onSelectionChange}
      />,
    );
    expect(onSelectionChange).toHaveBeenLastCalledWith(null);
  });
});
