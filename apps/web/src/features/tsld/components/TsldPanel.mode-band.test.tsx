import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

/**
 * The mode band **inside the panel** (ADR-0064 T4), flag-on. The band's own copy is covered by
 * `CanvasModeBand.test.tsx`; what matters here is that the panel derives the statement from the
 * mode the canvas actually obeys, and that nothing armed renders nothing.
 *
 * The flag-off half is the rollback contract and lives in `TsldPanel.mode-band-off.test.tsx`.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CANVAS_AUTHORING_ENABLED: true,
    TSLD_EDITING_ENABLED: true,
    CANVAS_AUTHORING_FLOW_ENABLED: true,
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

describe('TsldPanel — mode statement band (flag on)', () => {
  it('says nothing in select mode', () => {
    render(<Harness arm="select" />);
    expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();
  });

  it.each([
    ['add-activity', /^Adding task — click the diagram to draw/],
    ['link', /^Linking FS — click the predecessor/],
    ['loe', /^Level of effort — click the start driver/],
  ] as const)('states the %s tool', (arm, text) => {
    render(<Harness arm={arm} />);
    expect(screen.getByTestId('canvas-mode-band')).toHaveTextContent(text);
  });

  it('disappears again when the tool disarms', () => {
    render(<Harness arm="add-activity" />);
    expect(screen.getByTestId('canvas-mode-band')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('canvas-mode-band')).not.toBeInTheDocument();
  });
});
