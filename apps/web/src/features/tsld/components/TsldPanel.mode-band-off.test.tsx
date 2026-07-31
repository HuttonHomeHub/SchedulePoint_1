import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

/**
 * **The flag-off parity suite for the mode band** (ADR-0064 T4) — the rollback contract.
 *
 * With `VITE_CANVAS_AUTHORING_FLOW` off, every authoring tool still arms and disarms exactly as it
 * did before the epic, and the band never renders in any mode. Kept and pinned rather than deleted
 * on the day the flag flips: a parity suite is only worth anything if it is still strict when
 * somebody needs to roll back.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_AUTHORING_ENABLED: true,
    TSLD_EDITING_ENABLED: true,
    CANVAS_AUTHORING_FLOW_ENABLED: false,
  };
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

const A = activity('a', 'Set out', 0);
const B = activity('b', 'Reinforce', 1);

function Harness({ arm }: { arm: 'select' | 'add-activity' | 'link' | 'loe' }): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setMode(arm);
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
      fill
    />
  );
}

describe('TsldPanel — mode statement band (flag OFF parity)', () => {
  it.each(['select', 'add-activity', 'link', 'loe'] as const)(
    'renders no band in %s mode',
    (arm) => {
      render(<Harness arm={arm} />);
      expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();
    },
  );

  it('still disarms on Escape — the fix is outside the flag, and stays outside it', () => {
    render(<Harness arm="add-activity" />);
    fireEvent.keyDown(window, { key: 'Escape' });
    // The announcement is the unflagged T3 behaviour, so it is present with the flag off too.
    expect(announceSpy).toHaveBeenCalledWith('Tool closed. Select mode.');
  });
});
