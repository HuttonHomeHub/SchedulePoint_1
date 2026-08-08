import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

/**
 * **The marquee tool joins the arm/disarm contract** (`docs/specs/canvas-multi-select/` M2-T4).
 *
 * The plan's risk row for this task is "arming a mode nobody can leave", and it was a live
 * possibility rather than a theoretical one: the canvas's Escape branch that returns a tool to
 * `select` is gated on `editing`, and the marquee is deliberately **not** pen-gated because
 * selecting is a read (the ADR-0063 M4b rule). Inheriting that gate would have armed the tool for a
 * Viewer and then trapped them in it — so the ungated branch, and this suite, exist together.
 *
 * `canEdit` is **false** here on purpose. That is the case the other four tools cannot reach and
 * the only one where the bug could have shipped.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_MULTI_SELECT_ENABLED: true };
});
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_MULTI_SELECT_ENABLED: true };
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

const A = activity('a', 'Excavate', 0);
const B = activity('b', 'Pour', 1);

function Harness({ canEdit }: { canEdit: boolean }): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setMode('marquee');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arm once on mount
  }, []);
  return (
    <>
      <span data-testid="mode">{canvasUi.mode}</span>
      <TsldPanel
        activities={[A, B]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit={canEdit}
        canvasUi={canvasUi}
        fill
      />
    </>
  );
}

function mode(): string {
  return screen.getByTestId('mode').textContent ?? '';
}

describe('TsldPanel — the marquee tool mode', () => {
  it.each([true, false])('Escape disarms it with canEdit=%s', (canEdit) => {
    render(<Harness canEdit={canEdit} />);
    expect(mode()).toBe('marquee');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mode()).toBe('select');
  });

  it('announces arming and closing through the one polite region', () => {
    announceSpy.mockClear();
    render(<Harness canEdit={false} />);
    expect(announceSpy).toHaveBeenCalledWith(expect.stringMatching(/^Marquee select — drag/));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(announceSpy).toHaveBeenCalledWith('Tool closed. Select mode.');
  });

  it('states the mode in the band, naming the add modifier', () => {
    // Naming Ctrl/Cmd in the band is the only place a planner can learn that a sweep does not need
    // the tool at all — an affordance that is otherwise reachable only by guessing.
    render(<Harness canEdit={false} />);
    expect(screen.getByTestId('canvas-mode-band').textContent).toMatch(/Hold Ctrl \(Cmd\) to add/);
  });
});
