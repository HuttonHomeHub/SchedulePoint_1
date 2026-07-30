import type { ActivitySummary, DependencySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useTsldCanvasUiState } from '../toolbar/use-tsld-canvas-ui-state';

import { TsldPanel } from './TsldPanel';

/**
 * **The arm/disarm contract for canvas tool modes** (ADR-0064 F1.2 / T3).
 *
 * Every authoring tool is a mode the next canvas click is interpreted in, so "which tool is armed"
 * is the most consequential piece of state on the surface, and it had no test.
 *
 * The spec recorded Escape as broken for `add-activity`. **It is not** — this suite was written to
 * fail on that and passed on the first run, and the browser agrees (`e2e-authoring-flow`). What was
 * genuinely missing is the other half of the contract: the armed trigger was a menu opener, not a
 * toggle, so from the toolbar there was no way out at all. The rule is now uniform across all four
 * modes: **Escape returns to `select`**, and the armed trigger disarms. `link`'s open pick takes
 * the first Escape and the tool the second — a wrong endpoint should not cost you the tool.
 */
/** The shared live region, spied rather than rendered — the repo's precedent for announcements. */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

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

/**
 * Render the panel with one tool pre-armed, and publish the live mode into the DOM so a test can
 * read it. The mode is the thing under test, and it is otherwise invisible from outside the canvas.
 */
function Harness({ arm }: { arm: 'add-activity' | 'link' | 'loe' }): React.ReactElement {
  const canvasUi = useTsldCanvasUiState();
  useEffect(() => {
    canvasUi.setMode(arm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- arm once on mount
  }, []);
  return (
    <>
      <span data-testid="mode">{canvasUi.mode}</span>
      <TsldPanel
        activities={[A, B]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        canvasUi={canvasUi}
        onCreate={() => Promise.resolve({ recalcConflict: null })}
        fill
      />
    </>
  );
}

function mode(): string {
  return screen.getByTestId('mode').textContent ?? '';
}

describe('TsldPanel — the tool arm/disarm contract', () => {
  it.each(['add-activity', 'link', 'loe'] as const)('Escape disarms the %s tool', (arm) => {
    render(<Harness arm={arm} />);
    expect(mode()).toBe(arm);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mode()).toBe('select');
  });

  it('is idempotent — a second Escape with nothing armed changes nothing', () => {
    render(<Harness arm="add-activity" />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mode()).toBe('select');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mode()).toBe('select');
  });

  /**
   * The canvas is `aria-hidden` (ADR-0026 D7), so arming a tool changes only the toolbar's visible
   * label. Which tool is armed decides what the next canvas click means, which makes it exactly the
   * state change that must not be silent (WCAG 4.1.3).
   */
  it.each([
    ['add-activity', /^Add task: click the diagram to draw/],
    ['link', /^Link FS: click the predecessor/],
  ] as const)('announces the %s tool arming and closing', (arm, armed) => {
    announceSpy.mockClear();
    render(<Harness arm={arm} />);
    expect(announceSpy).toHaveBeenCalledWith(expect.stringMatching(armed));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(announceSpy).toHaveBeenCalledWith('Tool closed. Select mode.');
  });

  /**
   * The mid-pick half of the rule — first Escape drops the pick, second disarms the tool — is
   * deliberately NOT tested here. Opening a pick means putting the canvas's gesture machine into
   * `linkPicking`, which in jsdom needs a pointer sequence over a canvas that has no layout: the
   * hit test would answer from a zero-sized rect, so the test would pass or fail on geometry rather
   * than on the rule. It is exercised where the geometry is real, in
   * `apps/web/e2e-authoring-flow/link-direction.spec.ts`.
   */
});
