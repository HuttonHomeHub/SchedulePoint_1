import type { ActivitySummary, DependencySummary } from '@repo/types';
import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

/**
 * **The Link tool's pointer picks must be announced too** (WCAG 4.1.3; found by the ADR-0064
 * enablement accessibility review).
 *
 * The canvas is `aria-hidden` (ADR-0026 D7), so a pick made with the pointer is otherwise a silent
 * state change. The keyboard path announced its picks inline, and the pointer path was wired to a
 * raw `setState` — so the two disagreed about whether anything had been said.
 *
 * The drop routes mattered more than the pick. Both the first Escape and the ADR-0064 T7
 * recalculation-cap drop arrive through the same callback, and **the cap drop happens with no user
 * gesture at all**. A screen-reader user mid-pick got no notice their pick had gone, so their next
 * Enter was read as a fresh predecessor rather than the successor they meant — a wrong link, made
 * silently, which is the exact defect class this whole epic was opened to chase.
 *
 * `TsldCanvas` is mocked to a prop-capturing stub, which is the only way to drive its callback from
 * a unit test: a real pointer pick needs a hit test against a canvas with layout, and jsdom has
 * none (`TsldPanel.disarm.test.tsx` defers that half to Playwright for the same reason). This file
 * is separate from the mode-band suite precisely so that mock stays scoped to the tests that need it.
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

let capturedPickStep: ((predecessorId: string | null) => void) | undefined;
vi.mock('./TsldCanvas', () => ({
  TsldCanvas: (props: { onLinkPickStep?: (id: string | null) => void }) => {
    capturedPickStep = props.onLinkPickStep;
    return null;
  },
  liveResize: () => null,
  liveLag: () => null,
}));

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

function Harness(): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setMode('link');
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
      onLink={vi.fn()}
      fill
    />
  );
}

/**
 * Mount, then return a dispatcher that always calls the **latest** captured callback.
 *
 * The handler closes over the current render's `linkPickedId` (that is how it can tell a real drop
 * from the seeding echo), so holding the first render's copy would drive a stale closure — a test
 * artifact only, since the real canvas receives the fresh prop on every render.
 */
function mountAndCapture(): (predecessorId: string | null) => void {
  capturedPickStep = undefined;
  render(<Harness />);
  if (!capturedPickStep) throw new Error('the panel did not wire onLinkPickStep');
  return (predecessorId) => {
    act(() => capturedPickStep?.(predecessorId));
  };
}

describe('TsldPanel — the canvas link-pick step is announced', () => {
  it('announces a pointer-driven predecessor pick, in the keyboard path’s own words', () => {
    const step = mountAndCapture();
    announceSpy.mockClear();
    step('a');
    // The same sentence `modeStatementText` gives the keyboard path and the visible band — one
    // source, so the spoken and printed forms cannot drift.
    expect(announceSpy).toHaveBeenCalledWith(
      'Linking FS from “Set out” · click the successor · Esc to drop the pick',
    );
  });

  it('announces the drop, including the one the planner did not ask for', () => {
    const step = mountAndCapture();
    step('a');
    announceSpy.mockClear();
    step(null);
    expect(announceSpy).toHaveBeenCalledWith('Link pick dropped. Pick the predecessor again.');
  });

  it('stays quiet when nothing was open', () => {
    // The seeding echo also arrives as `null`; announcing it would speak on every arming.
    const step = mountAndCapture();
    announceSpy.mockClear();
    step(null);
    expect(announceSpy).not.toHaveBeenCalledWith('Link pick dropped. Pick the predecessor again.');
  });
});
