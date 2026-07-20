import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Snap is a canvas-nav Visual-mode authoring aid, so drive it with CANVAS_NAV + TSLD_EDITING on.
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_NAV_ENABLED: true, TSLD_EDITING_ENABLED: true };
});

const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

import type { WorkingDayCalendar } from '../render/time-scale';
import { useTsldCanvasUiState, type TsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

beforeEach(() => announceSpy.mockClear());

function activity(over: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'a1',
    planId: 'p1',
    code: 'A100',
    name: 'Excavate',
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
    isCritical: true,
    isNearCritical: false,
    constraintViolated: false,
    externalDriven: false,
    loeNoSpan: false,
    resourceDriverMissing: false,
    externalEarlyStart: null,
    externalLateFinish: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    parentId: null,
    visualStart: '2026-01-01',
    visualEffectiveStart: '2026-01-01',
    visualEffectiveFinish: '2026-01-03',
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

const NO_DEPS: DependencySummary[] = [];
// Only the data date (day 0) is a working day — every later drop day rounds back to it, so the snapped
// day (and thus the announced date) is deterministic regardless of the exact pointer-to-day mapping.
const DAY_ZERO_ONLY_CALENDAR: WorkingDayCalendar = {
  workingWeekdays: 0,
  exceptions: new Map([['2026-01-01', true]]),
};

/** Owns the shared canvas UI state and (optionally) arms Snap the way the toolbar toggle does. */
function SnapHarness({ snap }: { snap: boolean }): React.ReactElement {
  const canvasUi: TsldCanvasUiState = useTsldCanvasUiState();
  useEffect(() => {
    if (snap) canvasUi.toggleSnapToGrid();
    // Arm once on mount; the setter is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <TsldPanel
      activities={[activity()]}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit
      onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
      onReposition={vi.fn().mockResolvedValue({ applied: true, conflict: null })}
      calendar={DAY_ZERO_ONLY_CALENDAR}
      barDateSource="visual"
      canvasUi={canvasUi}
    />
  );
}

function dragBarRight(): void {
  const canvas = document.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  fireEvent.pointerDown(canvas, { clientX: 60, clientY: 54, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 110, clientY: 54, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 110, clientY: 54, pointerId: 1 });
}

describe('TsldPanel — Snap-to-grid announcement (canvas nav, a11y-rec-2)', () => {
  it('names the snapped working day when Snap rounded the drop', async () => {
    render(<SnapHarness snap />);
    dragBarRight();
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith('Moved and snapped “Excavate” to 01 Jan 2026.'),
    );
  });

  it('keeps the generic message (no date) when Snap is off', async () => {
    render(<SnapHarness snap={false} />);
    dragBarRight();
    await waitFor(() => expect(announceSpy).toHaveBeenCalledWith(expect.stringContaining('Moved')));
    expect(announceSpy).not.toHaveBeenCalledWith(expect.stringContaining('snapped'));
  });
});
