import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

/**
 * **The flag-off parity suite for the whole ADR-0064 additive surface** — the rollback contract.
 *
 * With `VITE_CANVAS_AUTHORING_FLOW` off there is no band, no empty state and no keyboard link pick,
 * and Enter on the listbox still opens the Logic tab exactly as it always did. The T3 disarm fix is
 * asserted here too, because it ships OUTSIDE the flag and must not quietly become conditional on
 * it. Kept and pinned rather than deleted when the flag flips: a parity suite is only worth
 * anything if it is still strict on the day somebody needs to roll back.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_AUTHORING_ENABLED: true,
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
    durationMinutes: 1440,
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
    remainingDurationMinutes: null,
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

function Harness({
  arm,
  activities = [A, B],
  canEdit = true,
  onLink,
  onOpenLogic,
}: {
  arm: 'select' | 'add-activity' | 'link' | 'loe';
  activities?: ActivitySummary[];
  canEdit?: boolean;
  onLink?: React.ComponentProps<typeof TsldPanel>['onLink'];
  onOpenLogic?: (activity: ActivitySummary) => void;
}): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setMode(arm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arm once on mount
  }, []);
  return (
    <TsldPanel
      activities={activities}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit={canEdit}
      canvasUi={canvasUi}
      onCreate={() => Promise.resolve({ recalcConflict: null })}
      {...(onLink ? { onLink } : {})}
      {...(onOpenLogic ? { onOpenLogic } : {})}
      fill
    />
  );
}

describe('TsldPanel — ADR-0064 additive surface (flag OFF parity)', () => {
  it.each(['select', 'add-activity', 'link', 'loe'] as const)(
    'renders no band in %s mode',
    (arm) => {
      render(<Harness arm={arm} />);
      expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();
    },
  );

  it('renders no empty state on an empty plan', () => {
    render(<Harness arm="select" activities={[]} />);
    expect(screen.queryByTestId('canvas-empty-state')).not.toBeInTheDocument();
  });

  it('Enter in link mode opens the Logic tab — the keyboard pick is behind the flag', () => {
    const onOpenLogic = vi.fn();
    const onLink = vi.fn();
    render(<Harness arm="link" onLink={onLink} onOpenLogic={onOpenLogic} />);
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    fireEvent.focus(listbox);
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onOpenLogic).toHaveBeenCalledOnce();
    expect(onLink).not.toHaveBeenCalled();
  });

  it('still disarms on Escape — the T3 fix is outside the flag, and stays outside it', () => {
    render(<Harness arm="add-activity" />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(announceSpy).toHaveBeenCalledWith('Tool closed. Select mode.');
  });
});
