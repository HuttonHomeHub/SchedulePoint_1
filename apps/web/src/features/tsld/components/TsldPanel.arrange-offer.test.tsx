import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

/**
 * **The `Arrange` offer in the canvas dock** (diagram-legibility M-C2), closing the second half of
 * `docs/TECH_DEBT.md` #363: the command existed and nothing ever told a planner it was worth
 * pressing.
 *
 * The **precedence** is asserted on `resolveDockStrip` and the **sentence** on
 * `arrangeOfferMessage`, both as values — this file covers only what neither can: that the panel
 * derives the offer from the plan it is given, that the pen decides whether it renders at all, and
 * that pressing it reaches the same confirmation the toolbar does.
 */
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));
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

function activity(
  id: string,
  laneIndex: number,
  earlyStart: string,
  earlyFinish: string,
): ActivitySummary {
  return {
    drivingResourceCalendarId: null,
    id,
    planId: 'p1',
    code: null,
    name: id,
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
    earlyStart,
    earlyFinish,
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
    visualConflictReason: null,
    visualDriftDays: null,
    remainingFloat: null,
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

/** Two sequential bars parked six rows apart: the pack moves `b` to lane 0, 6 rows → 1. */
const SCATTERED = [
  activity('a', 0, '2026-01-01', '2026-01-03'),
  activity('b', 5, '2026-01-05', '2026-01-07'),
];
/** The same two bars already packed — the state in which the offer must NOT appear. */
const TIDY = [
  activity('a', 0, '2026-01-01', '2026-01-03'),
  activity('b', 0, '2026-01-05', '2026-01-07'),
];

function Harness({
  activities = SCATTERED,
  canEdit = true,
  onAutoArrange = () => Promise.resolve({ applied: true, conflict: null }),
}: {
  activities?: ActivitySummary[];
  canEdit?: boolean;
  onAutoArrange?: React.ComponentProps<typeof TsldPanel>['onAutoArrange'];
}): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  return (
    <TsldPanel
      activities={activities}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit={canEdit}
      canvasUi={canvasUi}
      onCreate={() => Promise.resolve({ recalcConflict: null })}
      onAutoArrange={onAutoArrange}
      fill
    />
  );
}

describe('TsldPanel — the Arrange offer', () => {
  it('states what the press would do, from the plan it was given', () => {
    render(<Harness />);
    expect(screen.getByTestId('canvas-arrange-offer')).toHaveTextContent(
      'Arrange would move 1 activity and draw this plan in 1 row instead of 6.',
    );
  });

  it('is absent on a plan the packer would not touch', () => {
    // Not "the strip is broken" — `resolveDockStrip`'s own suite proves the rung works, so an
    // absence here can only be the predicate. That split is why the precedence lives in a value.
    render(<Harness activities={TIDY} />);
    expect(screen.queryByTestId('canvas-arrange-offer')).not.toBeInTheDocument();
  });

  it('is OMITTED without the pen, not shaded', () => {
    /**
     * The opposite of how every command on this surface is gated, and deliberately: the strip's
     * whole content is an offer to press a pen-gated command, so shading it leaves a permanently
     * un-actionable notice — the lit-but-inert defect ADR-0059 M6 and ADR-0062 M6 both record.
     */
    render(<Harness canEdit={false} />);
    expect(screen.queryByTestId('canvas-arrange-offer')).not.toBeInTheDocument();
  });

  it('confirms and writes exactly the move its sentence described', async () => {
    /**
     * The strip says "move 1 activity … in 1 row instead of 6", and this is what makes that a
     * promise rather than a caption: the press goes through the SAME confirmation the toolbar
     * opens and writes the one change `arrangeSummary` derived. `computeArrangeChanges` returns
     * `arrangeSummary.changes`, so the two cannot be a version apart — the drift ADR-0065 and
     * ADR-0121 both record, where each number looks right alone.
     */
    const onAutoArrange = vi.fn(() => Promise.resolve({ applied: true, conflict: null }));
    render(<Harness onAutoArrange={onAutoArrange} />);
    fireEvent.click(screen.getByTestId('canvas-arrange-offer').querySelector('button')!);
    // The confirm button, which is how every other suite locates this dialog.
    fireEvent.click(await screen.findByRole('button', { name: 'Auto-arrange' }));
    expect(onAutoArrange).toHaveBeenCalledWith([{ id: 'b', laneIndex: 0 }]);
  });

  it('stays dismissed for the session once dismissed', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByTestId('canvas-arrange-offer')).not.toBeInTheDocument();
  });

  it('hands focus to the diagram before Dismiss unmounts the button being pressed', () => {
    /**
     * Dismissing destroys the strip holding the pressed button, and the rung below it
     * (`placement-migration`) often does not render at all — so with no destination focus reverts
     * to `<body>`. That is WCAG 2.4.3, and on THIS surface it is also silent: the workspace's
     * keyboard accelerators are a React `onKeyDown` on a root of which `<body>` is an ancestor, so
     * a planner who dismisses the offer loses Undo, Escape and the arrow keys with nothing saying
     * so. Verified red against the shipped version, which flipped the state and moved nothing.
     *
     * The assertion is on `document.activeElement`, not on the strip being gone — the case above
     * already proves that, and it passes identically either way, which is exactly how this shipped
     * untested.
     */
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(document.activeElement).toBe(screen.getByRole('listbox', { name: /Activities/ }));
  });
});
