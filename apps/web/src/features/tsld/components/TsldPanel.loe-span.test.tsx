import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel, type TsldLoeSpanInput } from './TsldPanel';

/**
 * The LOE endpoint-pick tool's **parallel-DOM keyboard path** (Stage D,
 * `docs/specs/canvas-activity-types/`): with the LOE tool armed (`mode === 'loe'`), Enter on the
 * focused listbox option picks the start driver (first press) then the finish driver (second press),
 * committing the span — the keyboard equivalent of the pointer two-pick (WCAG 2.1.1). The pointer pick
 * logic + mutual exclusion live in the gesture-machine suite; here we drive the listbox.
 */
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_AUTHORING_ENABLED: true, TSLD_EDITING_ENABLED: true };
});

const NO_DEPS: DependencySummary[] = [];

function activity(id: string, name: string, laneIndex: number): ActivitySummary {
  return {
    id,
    planId: 'p1',
    code: null,
    name,
    description: null,
    type: 'TASK',
    durationDays: 3,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    calendarId: null,
    laneIndex,
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
    lateStart: null,
    lateFinish: null,
    totalFloat: null,
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

const A = activity('a', 'Excavate', 0);
const B = activity('b', 'Pour', 1);

/** Render TsldPanel with the LOE tool pre-armed (`mode: 'loe'`) via a shared canvas UI state. */
function Harness({
  onLoeSpan,
}: {
  onLoeSpan: (input: TsldLoeSpanInput) => Promise<{ applied: boolean; conflict: string | null }>;
}): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setMode('loe');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arm once on mount
  }, []);
  return (
    <TsldPanel
      activities={[A, B]}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit
      canvasUi={canvasUi}
      onCreate={() => Promise.resolve({ recalcConflict: null })}
      onLoeSpan={onLoeSpan}
      fill
    />
  );
}

describe('TsldPanel — LOE endpoint-pick keyboard path (Stage D)', () => {
  it('Enter picks the start driver then the finish driver, committing the span', () => {
    const onLoeSpan = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    render(<Harness onLoeSpan={onLoeSpan} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });

    fireEvent.focus(listbox); // default-selects the first option (A)
    fireEvent.keyDown(listbox, { key: 'Enter' }); // picks A as the start driver
    expect(onLoeSpan).not.toHaveBeenCalled(); // not committed on the first pick

    fireEvent.keyDown(listbox, { key: 'ArrowDown' }); // move to B
    fireEvent.keyDown(listbox, { key: 'Enter' }); // picks B as the finish driver → commit

    expect(onLoeSpan).toHaveBeenCalledExactlyOnceWith({
      startDriverId: 'a',
      finishDriverId: 'b',
    });
  });

  it('rejects re-picking the SAME activity as both drivers (no self-span)', () => {
    const onLoeSpan = vi.fn().mockResolvedValue({ applied: true, conflict: null });
    render(<Harness onLoeSpan={onLoeSpan} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });

    fireEvent.focus(listbox); // selects A
    fireEvent.keyDown(listbox, { key: 'Enter' }); // A = start driver
    fireEvent.keyDown(listbox, { key: 'Enter' }); // A again → rejected, re-prompt

    expect(onLoeSpan).not.toHaveBeenCalled();
  });
});
